from __future__ import annotations

from collections import deque
from concurrent.futures import Future, ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from contextlib import nullcontext
from pathlib import Path
from enum import Enum
import faulthandler
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from queue import Empty, Queue
import re
import subprocess
import sys
import tempfile
from threading import Event, Lock, Thread
import time
from typing import Callable

from .ffmpeg_setup import verify_ffmpeg


VOICE_FILES = {
    "old_male": "Basic_old_male.wav",
    "young_male": "Basic_young_male.wav",
    "female": "Basic_female.wav",
}

MAXIMUM_CHUNK_CHARACTERS = 480
# Fewer denoising steps are faster but create noticeably more hiss and other
# synthesis artifacts. Keep this at the model's quality-oriented setting.
INFERENCE_TIMESTEPS = 8
MP3_BITRATE = "96k"


def performance_logger() -> logging.Logger:
    logger = logging.getLogger("readji.tts.performance")
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        logger.propagate = False
        local_data = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
        try:
            directory = local_data / "Readji" / "TTS Agent" / "logs"
            directory.mkdir(parents=True, exist_ok=True)
            # Only the GUI process writes this file; worker timings arrive via IPC stderr.
            handler = RotatingFileHandler(directory / "performance.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8")
            handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
            logger.addHandler(handler)
        except OSError:
            # Logging must not prevent processing on read-only/full disks.
            logger.addHandler(logging.NullHandler())
    return logger


class RenderError(RuntimeError):
    pass


class _IncompleteFastLoad(RuntimeError):
    pass


def _load_voxcpm_weights():
    """Skip disposable Linear/Embedding initialization in the isolated worker."""
    import gc
    import torch
    from voxcpm import VoxCPM
    from voxcpm.model.voxcpm2 import VoxCPM2Model

    def load():
        return VoxCPM.from_pretrained(
            "openbmb/VoxCPM2", device="cuda", load_denoiser=False,
            local_files_only=True, optimize=False,
        )

    original_linear_reset = torch.nn.Linear.reset_parameters
    original_embedding_reset = torch.nn.Embedding.reset_parameters
    original_load = VoxCPM2Model.load_state_dict
    own_load = VoxCPM2Model.__dict__.get("load_state_dict")
    checked = False
    skipped = 0

    def skip_reset(module):
        nonlocal skipped
        # Keep convolution/AudioVAE initialization and derived buffers intact.
        skipped += 1

    def checked_load(module, state_dict, strict=True, **kwargs):
        nonlocal checked
        result = original_load(module, state_dict, strict=False, **kwargs)
        if result.missing_keys or result.unexpected_keys:
            raise _IncompleteFastLoad(
                f"missing={len(result.missing_keys)} unexpected={len(result.unexpected_keys)}"
            )
        checked = True
        return result

    fallback = False
    try:
        # This scope runs before inference, exclusively in the worker process.
        torch.nn.Linear.reset_parameters = skip_reset
        torch.nn.Embedding.reset_parameters = skip_reset
        VoxCPM2Model.load_state_dict = checked_load
        model = load()
        if not checked:
            del model
            raise _IncompleteFastLoad("checkpoint coverage was not checked")
    except _IncompleteFastLoad as error:
        print(f"[TTS] fast weights load fallback: {error}", flush=True)
        fallback = True
    finally:
        torch.nn.Linear.reset_parameters = original_linear_reset
        torch.nn.Embedding.reset_parameters = original_embedding_reset
        if own_load is None:
            del VoxCPM2Model.load_state_dict
        else:
            VoxCPM2Model.load_state_dict = own_load

    if fallback:
        # Release the failed attempt after its exception traceback has gone.
        gc.collect()
        torch.cuda.empty_cache()
        return load()
    print(f"[TTS] fast weights load: skipped initialization of {skipped} layers; checkpoint coverage complete", flush=True)
    return model


class WorkerMessage(str, Enum):
    PRELOAD = "preload"
    RENDER = "render"
    PROGRESS = "progress"
    RESULT = "result"
    ERROR = "error"
    STOP = "stop"


class _RenderStageProfiler:
    """Measure one real chunk, leaving compiled callables intact underneath."""

    def __init__(self, model) -> None:
        import torch
        self.torch = torch
        self.model = model
        self.patches = []
        self.samples = {}

    def _wrap(self, target, attribute: str, stage: str) -> None:
        original = getattr(target, attribute)
        had_own_attribute = attribute in target.__dict__

        def measured(*args, **kwargs):
            start = self.torch.cuda.Event(enable_timing=True)
            end = self.torch.cuda.Event(enable_timing=True)
            start.record()
            started = time.perf_counter()
            try:
                return original(*args, **kwargs)
            finally:
                cpu_seconds = time.perf_counter() - started
                end.record()
                self.samples.setdefault(stage, []).append((start, end, cpu_seconds))

        setattr(target, attribute, measured)
        self.patches.append((target, attribute, original, had_own_attribute))

    def _restore(self) -> None:
        for target, attribute, original, had_own_attribute in reversed(self.patches):
            if had_own_attribute:
                setattr(target, attribute, original)
            else:
                delattr(target, attribute)
        self.patches.clear()

    def __enter__(self):
        self.torch.cuda.synchronize()
        self.started = time.perf_counter()
        try:
            for name in ("base_lm", "residual_lm"):
                module = getattr(self.model, name)
                self._wrap(module, "forward", f"{name}_prefill")
                self._wrap(module, "forward_step", f"{name}_decode")
            self._wrap(self.model.feat_decoder, "forward", "diffusion")
            self._wrap(self.model.audio_vae, "decode", "audio_vae")
        except BaseException:
            self._restore()
            raise
        print("[TTS] stage profile begin: first chunk; includes instrumentation and any first-use compilation", flush=True)
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self._restore()
        if exc_type is not None:
            print("[TTS] stage profile aborted; incomplete timings discarded", flush=True)
            return
        # Synchronize once, not after each operation, to retain CPU/GPU overlap.
        self.torch.cuda.synchronize()
        for stage, samples in self.samples.items():
            gpu_seconds = sum(start.elapsed_time(end) for start, end, _ in samples) / 1000
            cpu_seconds = sum(cpu for _, _, cpu in samples)
            print(f"[TTS] stage profile: stage={stage} calls={len(samples)} cpu_wall_seconds={cpu_seconds:.3f} cuda_interval_seconds={gpu_seconds:.3f}", flush=True)
        print(f"[TTS] stage profile end: generation_wall_seconds={time.perf_counter() - self.started:.3f}; CPU/CUDA intervals overlap, do not add; other stages are not instrumented", flush=True)


class _Mp3Encoder:
    """Feed CPU audio to one FFmpeg process while the GPU renders ahead."""

    def __init__(self, ffmpeg: Path, output: Path, sample_rate: int) -> None:
        self.output = output
        self._errors = tempfile.TemporaryFile()
        try:
            self._process = subprocess.Popen(
                [str(ffmpeg), "-hide_banner", "-loglevel", "error", "-y",
                 "-f", "f32le", "-ar", str(sample_rate), "-ac", "1", "-i", "pipe:0",
                 # Preserve VoxCPM2's native sample rate. Downsampling to 32 kHz
                 # and encoding at 32 kbps made speech artifacts substantially
                 # more audible, especially in Thai consonants and sibilants.
                 "-ac", "1", "-ar", str(sample_rate), "-c:a", "libmp3lame",
                 "-b:a", MP3_BITRATE, str(output)],
                stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=self._errors,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
        except BaseException:
            self._errors.close()
            raise
        self._writer = ThreadPoolExecutor(max_workers=1, thread_name_prefix="tts-encode")
        self._pending: Future | None = None
        self._finished = False

    def _write(self, audio) -> None:
        # Only CPU numpy arrays enter this thread; CUDA stays on the main thread.
        self._process.stdin.write(audio.astype("<f4", copy=False).tobytes())
        self._process.stdin.flush()

    def _wait_for_write(self) -> None:
        if self._pending is not None:
            try:
                self._pending.result(timeout=120)
            except FutureTimeoutError as error:
                raise RenderError("หมดเวลารอส่งเสียงให้ FFmpeg") from error
            except OSError as error:
                raise self._error() from error
            self._pending = None

    def submit(self, audio) -> None:
        # At most one submitted chunk plus the chunk currently on the GPU.
        # Backpressure bounds memory when encoding or storage is slower.
        self._wait_for_write()
        if self._process.poll() is not None:
            raise self._error()
        self._pending = self._writer.submit(self._write, audio)

    def _error(self) -> RenderError:
        self._errors.seek(0, os.SEEK_END)
        self._errors.seek(max(0, self._errors.tell() - 1600))
        detail = self._errors.read().decode("utf-8", errors="replace").strip()
        return RenderError(detail or "FFmpeg ไม่สามารถสร้างไฟล์เสียงได้")

    def finish(self) -> None:
        self._wait_for_write()
        try:
            self._process.stdin.close()
            self._process.wait(timeout=120)
        except subprocess.TimeoutExpired as error:
            raise RenderError("หมดเวลารอ FFmpeg ปิดไฟล์เสียง") from error
        except OSError as error:
            raise self._error() from error
        if self._process.returncode != 0:
            raise self._error()
        if not self.output.is_file() or self.output.stat().st_size == 0:
            raise RenderError("FFmpeg ส่งผลลัพธ์ไฟล์เสียงว่างกลับมา")
        self._finished = True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        # Stop FFmpeg before joining a writer that might be blocked on its pipe.
        try:
            if self._process.poll() is None:
                self._process.terminate()
                try:
                    self._process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self._process.kill()
                    self._process.wait(timeout=5)
        finally:
            self._writer.shutdown(wait=True, cancel_futures=True)
            try:
                self._process.stdin.close()
            except OSError:
                pass
            self._errors.close()
            if not self._finished:
                self.output.unlink(missing_ok=True)


class VoxCpmRenderer:
    """Qt-facing proxy. CUDA objects never leave the worker's main thread."""

    def __init__(self, voices_root: Path) -> None:
        self.voices_root = voices_root
        self.compile_enabled = os.environ.get("READJI_TTS_COMPILE", "1") != "0"
        self._process: subprocess.Popen | None = None
        self._reader: Thread | None = None
        self._messages: Queue = Queue()
        self._lock = Lock()
        self._shutdown = Event()
        self._stderr_lines: deque[str] = deque(maxlen=30)
        self._stderr_reader: Thread | None = None
        self.ready = False
        performance_logger()

    @property
    def is_ready(self) -> bool:
        return self.ready and self._process is not None and self._process.poll() is None

    def _start(self) -> None:
        if self._process is not None and self._process.poll() is None:
            return
        self._dispose()
        self._messages = Queue()
        self._stderr_lines.clear()
        worker_arguments = ["--worker", str(self.voices_root), "1" if self.compile_enabled else "0"]
        if getattr(sys, "frozen", False):
            # The GUI binary is built with PyInstaller --windowed, which makes
            # stdout unavailable.  Use the separately packaged console worker
            # so its JSON IPC stream remains connected to this process.
            worker = Path(sys.executable).parent / "worker" / "Readji TTS Agent Worker.exe"
            if not worker.is_file():
                raise RenderError("ไม่พบตัวประมวลผลเสียงของแอป กรุณาติดตั้ง TTS Agent ใหม่")
            command = [str(worker), *worker_arguments]
        else:
            command = [sys.executable, "-u", "-m", "readji_tts_agent.renderer", *worker_arguments]
        self._process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            encoding="utf-8", bufsize=1,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        self._reader = Thread(target=self._read_messages, args=(self._process.stdout, self._messages), daemon=True)
        self._reader.start()
        self._stderr_reader = Thread(target=self._read_stderr, args=(self._process.stderr, self._stderr_lines), daemon=True)
        self._stderr_reader.start()

    @staticmethod
    def _read_messages(stream, messages: Queue) -> None:
        try:
            for line in stream:
                messages.put(json.loads(line))
        except (OSError, ValueError) as error:
            messages.put({"type": WorkerMessage.ERROR, "message": f"Worker IPC: {error}"})
        finally:
            messages.put(None)

    @staticmethod
    def _read_stderr(stream, lines: deque[str]) -> None:
        try:
            for line in stream:
                lines.append(line.rstrip())
                if line.startswith("[TTS]"):
                    performance_logger().info(line.rstrip())
                elif "Badcase detected, audio_text_ratio=" in line:
                    performance_logger().info("model badcase retry detected")
        except OSError:
            pass

    def _request(self, command: dict, progress=None, check_cancel=None) -> dict:
        with self._lock:
            try:
                if check_cancel is not None:
                    check_cancel()
                if self._shutdown.is_set():
                    raise RenderError("กำลังปิดตัวประมวลผลเสียง")
                self._start()
                self._process.stdin.write(json.dumps(command, ensure_ascii=True) + "\n")
                self._process.stdin.flush()
                while True:
                    if check_cancel is not None:
                        check_cancel()
                    if self._shutdown.is_set():
                        raise RenderError("กำลังปิดตัวประมวลผลเสียง")
                    try:
                        message = self._messages.get(timeout=0.2)
                    except Empty:
                        if self._process.poll() is not None:
                            raise self._exit_error()
                        continue
                    if message is None:
                        raise self._exit_error()
                    kind = message["type"]
                    if kind == WorkerMessage.PROGRESS and progress is not None:
                        progress(message["done"], message["total"])
                    elif kind == WorkerMessage.RESULT:
                        self.ready = True
                        return message
                    elif kind == WorkerMessage.ERROR:
                        raise RenderError(message["message"])
            except (BrokenPipeError, OSError) as error:
                failure = self._exit_error()
                self._dispose()
                raise failure from error
            except BaseException:
                # A cancelled/failed request must never leave a render running.
                self._dispose()
                raise

    def _exit_error(self) -> RenderError:
        code = self._process.poll() if self._process is not None else None
        if code is None and self._process is not None:
            try:
                code = self._process.wait(timeout=0.2)
            except subprocess.TimeoutExpired:
                pass
        detail = f"0x{code & 0xFFFFFFFF:08X}" if code is not None else "IPC disconnected"
        worker_output = "\n".join(self._stderr_lines).strip()
        if worker_output:
            detail = f"{detail}\n{worker_output[-1600:]}"
        return RenderError(
            f"ตัวประมวลผลเสียงหยุดทำงาน ({detail}) แอปหลักยังทำงานอยู่ "
            "หากเกิดระหว่าง compile ให้เปิดแอปใหม่ด้วย READJI_TTS_COMPILE=0"
        )

    def preload(self) -> None:
        self._request({"type": WorkerMessage.PRELOAD})

    def render(self, text: str, voice_slot: str, progress: Callable[[int, int], None],
               check_cancel: Callable[[], None] | None = None) -> tuple[Path, float]:
        result = self._request({"type": WorkerMessage.RENDER, "text": text, "voice_slot": voice_slot}, progress, check_cancel)
        return Path(result["path"]), float(result["duration"])

    def request_shutdown(self) -> None:
        self._shutdown.set()

    def close(self) -> None:
        self.request_shutdown()
        with self._lock:
            if self._process is not None and self._process.poll() is None:
                try:
                    self._process.stdin.write(json.dumps({"type": WorkerMessage.STOP}) + "\n")
                    self._process.stdin.flush()
                    self._process.wait(timeout=2)
                except (OSError, subprocess.TimeoutExpired):
                    pass
            self._dispose()

    def _dispose(self) -> None:
        self.ready = False
        process = self._process
        if process is None:
            return
        if process.poll() is None:
            process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        if self._reader is not None:
            self._reader.join()
        if self._stderr_reader is not None:
            self._stderr_reader.join()
        try:
            process.stdin.close()
        except OSError:
            pass
        process.stdout.close()
        process.stderr.close()
        self._process = None
        self._reader = None
        self._stderr_reader = None


class _LocalVoxCpmRenderer:
    def __init__(self, voices_root: Path, optimize: bool) -> None:
        self.voices_root = voices_root
        self.optimize = optimize
        self.model = None
        self.sample_rate = 48_000
        self._prompt_caches: dict[str, tuple[tuple[Path, int, int], dict]] = {}
        self._profile_pending = True

    def _load_model(self) -> None:
        if self.model is not None:
            return
        load_started = time.monotonic()
        self._prompt_caches.clear()
        self._profile_pending = True
        if self.optimize:
            # Configure disk caches before importing torch/voxcpm. Keep them
            # outside temporary and packaged application directories so they
            # survive worker shutdowns and application updates. PyTorch checks
            # graph/configuration compatibility before reusing compiled code.
            local_data = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
            cache_root = local_data / "Readji" / "TTS Agent" / "cache"
            for variable, directory in (
                ("TORCHINDUCTOR_CACHE_DIR", "torchinductor"),
                ("TRITON_CACHE_DIR", "triton"),
            ):
                cache_path = Path(os.environ.setdefault(variable, str(cache_root / directory)))
                cache_path.mkdir(parents=True, exist_ok=True)
            os.environ.setdefault("TORCHINDUCTOR_FX_GRAPH_CACHE", "1")
            os.environ.setdefault("TORCHINDUCTOR_AUTOGRAD_CACHE", "1")
        import torch
        from voxcpm import VoxCPM
        print(f"[TTS] model imports: {time.monotonic() - load_started:.2f}s", flush=True)
        if not torch.cuda.is_available():
            raise RenderError("ไม่พบ NVIDIA CUDA GPU ที่พร้อมใช้งาน")
        weights_started = time.monotonic()
        # Load without VoxCPM's default 10-step warmup; prepare below at job settings.
        model = _load_voxcpm_weights()
        torch.cuda.synchronize()
        print(f"[TTS] model weights to GPU: {time.monotonic() - weights_started:.2f}s", flush=True)
        if self.optimize:
            warmup_started = time.monotonic()
            model.tts_model.optimize()
            model.tts_model.generate(
                target_text="Hello, this is the first test sentence.",
                max_len=10,
                inference_timesteps=INFERENCE_TIMESTEPS,
                cfg_value=2.0,
            )
            torch.cuda.synchronize()
            print(f"[TTS] compile and warmup ({INFERENCE_TIMESTEPS} steps): {time.monotonic() - warmup_started:.2f}s", flush=True)
        # Publish only after preparation succeeds; a failed warmup is not ready.
        self.model = model
        self.sample_rate = int(model.tts_model.sample_rate)
        print(f"[TTS] model preload: {time.monotonic() - load_started:.2f}s", flush=True)

    def preload(self) -> None:
        """Download (when needed) and keep VoxCPM2 resident on the local GPU."""
        self._load_model()

    def _reference_voice(self, voice_slot: str) -> Path:
        filename = VOICE_FILES.get(voice_slot)
        path = self.voices_root / "Basic" / (filename or "")
        if not filename or not path.is_file():
            raise RenderError(f"ไม่พบไฟล์เสียงอ้างอิงสำหรับ {voice_slot}: {path}")
        return path

    def _prompt_cache(self, voice_slot: str) -> dict:
        reference = self._reference_voice(voice_slot).resolve()
        reference_stat = reference.stat()
        fingerprint = (reference, reference_stat.st_mtime_ns, reference_stat.st_size)
        cached = self._prompt_caches.get(voice_slot)
        if cached is not None and cached[0] == fingerprint:
            print(f"[TTS] reference {voice_slot}: using cached prompt", flush=True)
            return cached[1]

        # Keep one entry per voice slot, replacing it when the WAV changes.
        self._prompt_caches.pop(voice_slot, None)
        started = time.monotonic()
        prompt_cache = self.model.tts_model.build_prompt_cache(reference_wav_path=str(reference))
        self._prompt_caches[voice_slot] = (fingerprint, prompt_cache)
        print(f"[TTS] reference {voice_slot}: prepared in {time.monotonic() - started:.2f}s", flush=True)
        return prompt_cache

    @staticmethod
    def _chunks(text: str, maximum: int = MAXIMUM_CHUNK_CHARACTERS) -> list[str]:
        sentences = [part.strip() for part in re.split(r"(?<=[.!?…])\s+|\n+", text) if part.strip()]
        chunks: list[str] = []
        current = ""
        for sentence in sentences:
            while len(sentence) > maximum:
                if current:
                    chunks.append(current)
                    current = ""
                split_at = sentence.rfind(" ", 0, maximum + 1)
                split_at = split_at if split_at > maximum // 2 else maximum
                chunks.append(sentence[:split_at].strip())
                sentence = sentence[split_at:].strip()
            next_text = f"{current} {sentence}".strip()
            if current and len(next_text) > maximum:
                chunks.append(current)
                current = sentence
            else:
                current = next_text
        if current:
            chunks.append(current)
        return chunks

    def _prepare_kv_capacity(self, chunks: list[str], prompt_cache: dict) -> None:
        import inspect

        model = self.model.tts_model
        # This bound matches VoxCPM2's reference-only generation path. Keep the
        # library's full capacity for any other prompt mode.
        capacity = model.config.max_length
        if prompt_cache.get("mode") == "reference":
            parameters = inspect.signature(model._generate_with_prompt_cache).parameters
            max_len = parameters["max_len"].default
            ratio = parameters["retry_badcase_ratio_threshold"].default
            reference_length = prompt_cache["ref_audio_feat"].shape[0]
            token_lengths = [len(model.text_tokenizer(chunk)) for chunk in chunks]
            required = max(
                length + reference_length + 3
                + min(int(length * ratio + 10), max_len)
                for length in token_lengths
            )
            # Stable power-of-two buckets avoid a new compiled shape per chunk.
            capacity = min(capacity, max(1024, 1 << (required - 1).bit_length()))
        previous = model.base_lm.kv_cache.max_length
        if capacity == previous:
            return
        for lm in (model.base_lm, model.residual_lm):
            dtype = lm.kv_cache.kv_cache.dtype
            lm.setup_cache(1, capacity, model.device, dtype)
        self._profile_pending = True
        print(f"[TTS] KV cache capacity: {previous} -> {capacity}; generation length limits unchanged; first chunk may compile a new shape", flush=True)

    def render(self, text: str, voice_slot: str, progress: Callable[[int, int], None]) -> tuple[Path, float]:
        ffmpeg = verify_ffmpeg()
        self._load_model()
        chunks = self._chunks(text)
        if not chunks:
            raise RenderError("ตอนนี้ไม่มีข้อความสำหรับสร้างเสียง")
        workspace = Path(tempfile.mkdtemp(prefix="readji-tts-"))
        total_duration = 0.0
        render_started = time.monotonic()
        prompt_cache = self._prompt_cache(voice_slot)
        self._prepare_kv_capacity(chunks, prompt_cache)
        output = workspace / "full.mp3"
        try:
            with _Mp3Encoder(ffmpeg, output, self.sample_rate) as encoder:
                for index, chunk in enumerate(chunks, start=1):
                    chunk_started = time.monotonic()
                    profiling = self._profile_pending
                    with (_RenderStageProfiler(self.model.tts_model) if profiling else nullcontext()):
                        audio, _, _ = self.model.tts_model.generate_with_prompt_cache(
                            target_text=chunk,
                            prompt_cache=prompt_cache,
                            cfg_value=2.0,
                            inference_timesteps=INFERENCE_TIMESTEPS,
                            retry_badcase=True,
                            retry_badcase_max_times=2,
                        )
                    self._profile_pending = False
                    audio = audio.squeeze(0).cpu().numpy()
                    if audio.size == 0:
                        raise RenderError("VoxCPM2 ส่งผลลัพธ์เสียงว่างกลับมา")
                    encoder.submit(audio)
                    total_duration += len(audio) / self.sample_rate
                    elapsed = time.monotonic() - chunk_started
                    print(f"[TTS] chunk {index}/{len(chunks)}: {elapsed:.2f}s, audio {len(audio) / self.sample_rate:.2f}s, RTF {elapsed / (len(audio) / self.sample_rate):.3f} (CPU encoding overlaps GPU)", flush=True)
                    progress(index, len(chunks))
                encoding_started = time.monotonic()
                encoder.finish()
                print(f"[TTS] finish MP3: {time.monotonic() - encoding_started:.2f}s", flush=True)
        except FileNotFoundError as error:
            raise RenderError("ไม่พบ FFmpeg ของแอป กรุณากดเริ่มงานเพื่อติดตั้งใหม่") from error
        elapsed = time.monotonic() - render_started
        print(f"[TTS] chapter: {elapsed:.2f}s, audio {total_duration:.2f}s, RTF {elapsed / total_duration:.3f} (excludes model preload)", flush=True)
        return output, total_duration


def _worker_main() -> None:
    # Keep the original stdout pipe exclusively for JSON. Redirect even native
    # library stdout to stderr so model logs cannot corrupt the IPC protocol.
    with os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8", buffering=1) as protocol:
        os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
        sys.stdout = sys.stderr
        sys.stdin.reconfigure(encoding="utf-8")
        faulthandler.enable()

        def send(message: dict) -> None:
            protocol.write(json.dumps(message, ensure_ascii=True) + "\n")
            protocol.flush()

        renderer = _LocalVoxCpmRenderer(Path(sys.argv[2]), optimize=sys.argv[3] == "1")
        print(f"[TTS worker] PID={os.getpid()}, compile={renderer.optimize}, model execution=main thread", flush=True)
        for line in sys.stdin:
            try:
                command = json.loads(line)
                kind = WorkerMessage(command["type"])
                if kind == WorkerMessage.STOP:
                    return
                if kind == WorkerMessage.PRELOAD:
                    renderer.preload()
                    send({"type": WorkerMessage.RESULT})
                elif kind == WorkerMessage.RENDER:
                    output, duration = renderer.render(
                        command["text"], command["voice_slot"],
                        lambda done, total: send({"type": WorkerMessage.PROGRESS, "done": done, "total": total}),
                    )
                    send({"type": WorkerMessage.RESULT, "path": str(output), "duration": duration})
                else:
                    raise RenderError("คำสั่ง worker ไม่ถูกต้อง")
            except Exception as error:
                send({"type": WorkerMessage.ERROR, "message": f"{type(error).__name__}: {error}"})
                return


if __name__ == "__main__" and len(sys.argv) == 4 and sys.argv[1] == "--worker":
    _worker_main()
