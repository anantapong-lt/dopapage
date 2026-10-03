from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from threading import Event
from typing import Any, Callable
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
import zipfile

from PySide6.QtCore import Qt, QThread, Signal
from PySide6.QtWidgets import QApplication, QDialog, QFrame, QHBoxLayout, QLabel, QMessageBox, QProgressBar, QPushButton, QVBoxLayout

from .ffmpeg_setup import FFmpegSetupCancelled, install_ffmpeg


APP_NAME = "Dopapage"
CHUNK_SIZE = 1024 * 1024
RUNTIME_REQUIRED_FILES = (
    "Dopapage.exe",
)


class BootstrapError(RuntimeError):
    pass


def format_size(size: int) -> str:
    units = ("B", "KB", "MB", "GB", "TB")
    value = float(size)
    for unit in units:
        if value < 1024 or unit == units[-1]:
            return f"{value:.1f} {unit}" if unit != "B" else f"{int(value)} {unit}"
        value /= 1024
    return f"{value:.1f} TB"


class RuntimeDownloadDialog(QDialog):
    """A branded, non-technical first-run runtime installer."""

    def __init__(self) -> None:
        super().__init__()
        self.thread: RuntimeSetupThread | None = None
        self.setWindowTitle("กำลังเตรียม Dopapage")
        self.setModal(True)
        self.setFixedSize(560, 310)
        self.setObjectName("runtimeDownloadDialog")
        self.setWindowFlag(Qt.WindowType.WindowCloseButtonHint, False)
        self.setStyleSheet("""
            QDialog#runtimeDownloadDialog { background: #fffdfa; color: #2d1d20; }
            QLabel { background: transparent; color: #2d1d20; }
            QFrame#downloadCard { background: #f7ece8; border: 1px solid #e5dfd9; border-radius: 12px; }
            QProgressBar { min-height: 10px; border: 0; border-radius: 5px; background: #ede9e5; text-align: center; }
            QProgressBar::chunk { border-radius: 5px; background: #ff6f63; }
            QPushButton#cancelButton { min-height: 34px; padding: 0 18px; background: #fffdfa; color: #2d1d20; border: 1px solid #d8cec7; border-radius: 8px; }
            QPushButton#cancelButton:hover { background: #f7ece8; border-color: #ff6f63; }
            QPushButton#cancelButton:disabled { background: #f0efeb; color: #9a8f91; border-color: #e5dfd9; }
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(30, 26, 30, 24)
        layout.setSpacing(14)

        brand = QLabel("DOPAPAGE  /  TTS AGENT", self)
        brand.setStyleSheet("font-size: 11px; font-weight: 700; letter-spacing: 1px; color: #ff6f63;")
        layout.addWidget(brand)

        title = QLabel("กำลังเตรียมระบบสร้างเสียง", self)
        title.setStyleSheet("font-size: 22px; font-weight: 700;")
        layout.addWidget(title)

        subtitle = QLabel("กำลังติดตั้ง runtime และ FFmpeg สำหรับประมวลผลเสียงครั้งแรก\nคุณสามารถใช้งานได้ทันทีเมื่อขั้นตอนนี้เสร็จสิ้น", self)
        subtitle.setStyleSheet("font-size: 13px; color: #74676a; line-height: 1.45;")
        subtitle.setWordWrap(True)
        layout.addWidget(subtitle)

        card = QFrame(self)
        card.setObjectName("downloadCard")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(16, 13, 16, 13)
        card_layout.setSpacing(7)
        self.status = QLabel("กำลังเตรียมส่วนประกอบสำหรับประมวลผลเสียง...", card)
        self.status.setStyleSheet("font-size: 13px; font-weight: 600;")
        card_layout.addWidget(self.status)
        self.transfer = QLabel("กำลังคำนวณขนาดไฟล์", card)
        self.transfer.setStyleSheet("font-size: 12px; color: #74676a;")
        card_layout.addWidget(self.transfer)
        layout.addWidget(card)

        self.progress = QProgressBar(self)
        self.progress.setRange(0, 100)
        self.progress.setValue(0)
        self.progress.setTextVisible(False)
        layout.addWidget(self.progress)

        bottom = QHBoxLayout()
        self.percent = QLabel("0%", self)
        self.percent.setStyleSheet("font-size: 12px; font-weight: 700; color: #ff6f63;")
        bottom.addWidget(self.percent)
        bottom.addStretch(1)
        self.cancel_button = QPushButton("ยกเลิก", self)
        self.cancel_button.setObjectName("cancelButton")
        self.cancel_button.clicked.connect(self.cancel)
        bottom.addWidget(self.cancel_button)
        layout.addLayout(bottom)

    def cancel(self) -> None:
        if self.thread is None:
            return
        if not self.thread.isRunning():
            super().reject()
            return
        self.thread.cancel_requested.set()
        self.cancel_button.setEnabled(False)
        self.status.setText("กำลังยกเลิกการติดตั้ง...")

    def set_progress(self, stage: str, written: int, total: int) -> None:
        percent = min(99, int(written * 100 / total)) if total else 0
        self.progress.setValue(percent)
        self.percent.setText(f"{percent}%")
        self.status.setText(stage)
        self.transfer.setText(
            f"ดำเนินการแล้ว {format_size(written)} จาก {format_size(total)}" if total else "กำลังดำเนินการ กรุณาอย่าปิดโปรแกรม"
        )

    def set_installing(self, message: str) -> None:
        self.progress.setValue(99)
        self.percent.setText("99%")
        self.status.setText(message)
        self.transfer.setText("ขั้นตอนนี้อาจใช้เวลาสักครู่ กรุณาอย่าปิดโปรแกรม")

    def start(self, config: dict[str, Any]) -> None:
        self.thread = RuntimeSetupThread(config, self)
        self.thread.progress.connect(self.set_progress)
        self.thread.installing.connect(self.set_installing)
        self.thread.failed.connect(self._failed)
        self.thread.finished.connect(self._finished)
        self.thread.start()

    def _failed(self, message: str) -> None:
        self.cancel_button.setEnabled(True)
        self.cancel_button.setText("ปิด")
        self.status.setText(message)
        self.transfer.setText("โปรดลองเปิดโปรแกรมใหม่อีกครั้ง")

    def _finished(self) -> None:
        if self.thread is not None and self.thread.succeeded:
            self.progress.setRange(0, 100)
            self.progress.setValue(100)
            self.percent.setText("100%")
            self.accept()

    def reject(self) -> None:
        if self.thread is not None and self.thread.isRunning():
            self.cancel()
            return
        super().reject()


def data_root() -> Path:
    return Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "Readji" / "TTS Agent"


def bundled_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parents[2]


def config_path() -> Path:
    return data_root() / "bootstrap-config.json"


def load_config() -> dict[str, Any]:
    path = config_path()
    template = bundled_root() / "bootstrap-config.json"
    if not path.is_file():
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(template, path)
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise BootstrapError(f"ไม่สามารถอ่านการตั้งค่าอัปเดตได้: {error}") from error
    if not isinstance(value, dict):
        raise BootstrapError("รูปแบบไฟล์ bootstrap-config.json ไม่ถูกต้อง")
    try:
        bundled = json.loads(template.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        bundled = {}
    if "api_url" not in value and isinstance(bundled, dict) and isinstance(bundled.get("api_url"), str):
        value["api_url"] = bundled["api_url"]
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return value


def google_drive_download_url(url: str) -> str:
    """Accept either a Drive share URL or a direct download URL."""
    parsed = urlparse(url)
    if parsed.netloc not in {"drive.google.com", "www.drive.google.com"}:
        return url
    parts = [part for part in parsed.path.split("/") if part]
    file_id = ""
    if "d" in parts:
        position = parts.index("d")
        if len(parts) > position + 1:
            file_id = parts[position + 1]
    if not file_id:
        file_id = parse_qs(parsed.query).get("id", [""])[0]
    if not file_id:
        raise BootstrapError("ลิงก์ Google Drive ไม่มีรหัสไฟล์")
    return f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t"


def fetch_json(url: str) -> dict[str, Any]:
    try:
        request = Request(google_drive_download_url(url), headers={"User-Agent": "Dopapage"})
        with urlopen(request, timeout=30) as response:
            value = json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError) as error:
        raise BootstrapError(f"ตรวจสอบเวอร์ชันจาก Google Drive ไม่สำเร็จ: {error}") from error
    if not isinstance(value, dict):
        raise BootstrapError("รูปแบบ runtime manifest ไม่ถูกต้อง")
    return value


def existing_runtime() -> Path | None:
    state = data_root() / "runtime-state.json"
    try:
        version = json.loads(state.read_text(encoding="utf-8")).get("version")
    except (OSError, ValueError, AttributeError):
        return None
    runtime = data_root() / "runtime" / str(version)
    executable = runtime / "Dopapage.exe"
    return executable if has_complete_runtime(runtime) else None


def has_complete_runtime(directory: Path) -> bool:
    """Reject a partially extracted frozen runtime before launching it."""
    return all((directory / relative_path).is_file() for relative_path in RUNTIME_REQUIRED_FILES)


def validate_runtime(manifest: dict[str, Any]) -> tuple[str, str, str]:
    runtime = manifest.get("runtime")
    if not isinstance(runtime, dict):
        raise BootstrapError("runtime manifest ไม่มีข้อมูล runtime")
    version = runtime.get("version")
    url = runtime.get("url")
    digest = runtime.get("sha256")
    if not all(isinstance(value, str) and value for value in (version, url, digest)):
        raise BootstrapError("ข้อมูล runtime ใน manifest ไม่ครบถ้วน")
    if len(digest) != 64 or any(char not in "0123456789abcdefABCDEF" for char in digest):
        raise BootstrapError("SHA-256 ของ runtime ไม่ถูกต้อง")
    return version, url, digest.lower()


def download_runtime(url: str, destination: Path, expected_sha256: str, progress: Callable[[str, int, int], None], cancelled: Event) -> None:
    digest = hashlib.sha256()
    temporary = destination.with_suffix(".part")
    try:
        request = Request(google_drive_download_url(url), headers={"User-Agent": "Dopapage"})
        with urlopen(request, timeout=60) as response, temporary.open("wb") as output:
            content_type = response.headers.get_content_type()
            if content_type == "text/html":
                raise BootstrapError("Google Drive ไม่อนุญาตให้ดาวน์โหลดไฟล์นี้ โปรดตรวจสิทธิ์การแชร์และโควตา")
            total = int(response.headers.get("Content-Length") or 0)
            written = 0
            while block := response.read(CHUNK_SIZE):
                output.write(block)
                digest.update(block)
                written += len(block)
                if total:
                    progress("กำลังดาวน์โหลด runtime สำหรับประมวลผลเสียง", written, total)
                if cancelled.is_set():
                    raise BootstrapError("ยกเลิกการดาวน์โหลด runtime แล้ว")
        if digest.hexdigest().lower() != expected_sha256:
            raise BootstrapError("ตรวจสอบ SHA-256 ของ runtime ไม่ผ่าน กรุณาลองใหม่")
        temporary.replace(destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def extract_runtime(archive: Path, destination: Path, progress: Callable[[str, int, int], None], cancelled: Event) -> None:
    staging = destination.with_name(f"{destination.name}.installing")
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(archive) as package:
            entries = package.infolist()
            total = sum(entry.file_size for entry in entries)
            extracted = 0
            for entry in entries:
                if cancelled.is_set():
                    raise BootstrapError("ยกเลิกการติดตั้ง runtime แล้ว")
                target = (staging / entry.filename).resolve()
                if not target.is_relative_to(staging.resolve()):
                    raise BootstrapError("runtime archive มีพาธที่ไม่ปลอดภัย")
                package.extract(entry, staging)
                extracted += entry.file_size
                progress("กำลังติดตั้ง runtime สำหรับประมวลผลเสียง", extracted, total)
        if not has_complete_runtime(staging):
            raise BootstrapError("runtime archive ไม่มีไฟล์โปรแกรมหลัก")
        shutil.rmtree(destination, ignore_errors=True)
        staging.replace(destination)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def remove_old_runtimes(active_version: str) -> None:
    """Free disk space only after a newly installed runtime is verified."""
    runtime_root = data_root() / "runtime"
    if not runtime_root.is_dir():
        return
    for candidate in runtime_root.iterdir():
        if candidate.name == active_version or not candidate.is_dir():
            continue
        shutil.rmtree(candidate, ignore_errors=True)


def ensure_runtime(
    config: dict[str, Any],
    progress: Callable[[str, int, int], None],
    installing: Callable[[str], None],
    cancelled: Event,
) -> Path:
    manifest_url = os.environ.get("READJI_TTS_RUNTIME_MANIFEST_URL") or config.get("manifest_url")
    current = existing_runtime()
    if not isinstance(manifest_url, str) or not manifest_url.strip():
        if current:
            return current
        raise BootstrapError(
            "ยังไม่ได้ตั้งค่า Google Drive สำหรับ runtime\n"
            f"โปรดใส่ manifest_url ในไฟล์:\n{config_path()}"
        )
    try:
        manifest = fetch_json(manifest_url.strip())
        version, download_url, digest = validate_runtime(manifest)
    except BootstrapError:
        if current:
            return current
        raise

    target = data_root() / "runtime" / version
    executable = target / "Dopapage.exe"
    if not executable.is_file():
        with tempfile.TemporaryDirectory(prefix="readji-tts-runtime-") as temporary_directory:
            archive = Path(temporary_directory) / "runtime.zip"
            download_runtime(download_url, archive, digest, progress, cancelled)
            installing("กำลังติดตั้งและตรวจสอบความพร้อมของ runtime")
            extract_runtime(archive, target, progress, cancelled)
        (data_root() / "runtime-state.json").write_text(json.dumps({"version": version}) + "\n", encoding="utf-8")
        remove_old_runtimes(version)
    return executable


class RuntimeSetupThread(QThread):
    # Runtime archives exceed Qt's signed 32-bit ``int`` range. Keep byte
    # counts as Python objects so the UI receives their full 64-bit values.
    progress = Signal(str, object, object)
    installing = Signal(str)
    failed = Signal(str)

    def __init__(self, config: dict[str, Any], parent: QDialog) -> None:
        super().__init__(parent)
        self.config = config
        self.cancel_requested = Event()
        self.executable: Path | None = None
        self.succeeded = False

    def run(self) -> None:
        try:
            self.executable = ensure_runtime(self.config, self.progress.emit, self.installing.emit, self.cancel_requested)
            if self.cancel_requested.is_set():
                raise BootstrapError("ยกเลิกการติดตั้งแล้ว")
            self.installing.emit("กำลังเตรียม FFmpeg สำหรับแปลงไฟล์เสียง")
            install_ffmpeg(
                lambda done, total, message: self.progress.emit(message, done, total),
                self.cancel_requested,
            )
        except FFmpegSetupCancelled:
            self.failed.emit("ยกเลิกการติดตั้ง FFmpeg แล้ว")
        except Exception as error:
            self.failed.emit(str(error))
        else:
            self.succeeded = True


def main() -> None:
    application = QApplication(sys.argv)
    try:
        config = load_config()
        progress = RuntimeDownloadDialog()
        progress.setWindowModality(Qt.WindowModality.ApplicationModal)
        progress.start(config)
        if progress.exec() != QDialog.DialogCode.Accepted:
            raise SystemExit(1)
        if progress.thread is None or progress.thread.executable is None:
            raise BootstrapError("ติดตั้ง runtime ไม่สำเร็จ")
        executable = progress.thread.executable
    except BootstrapError as error:
        QMessageBox.critical(None, APP_NAME, str(error))
        raise SystemExit(1)
    runtime_version = executable.parent.name
    environment = os.environ.copy()
    environment["READJI_TTS_RUNTIME_VERSION"] = runtime_version
    api_url = config.get("api_url")
    if isinstance(api_url, str) and api_url.strip():
        environment.setdefault("READJI_TTS_API_URL", api_url.strip())
    subprocess.Popen([str(executable)], cwd=executable.parent, env=environment)


if __name__ == "__main__":
    main()
