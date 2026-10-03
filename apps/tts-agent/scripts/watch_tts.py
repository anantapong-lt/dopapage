from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import time


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = PROJECT_ROOT / "src"
POLL_INTERVAL_SECONDS = 0.5


def source_snapshot() -> dict[Path, tuple[int, int]]:
    snapshot: dict[Path, tuple[int, int]] = {}
    for path in SOURCE_ROOT.rglob("*.py"):
        try:
            stat = path.stat()
        except FileNotFoundError:
            continue
        snapshot[path] = (stat.st_mtime_ns, stat.st_size)
    return snapshot


def start_app() -> subprocess.Popen[object]:
    print("Starting TTS Agent. Save a Python file to restart it automatically.")
    environment = os.environ.copy()
    # `bun run tts` is also used to render production chapter audio from this
    # checkout, so default to the VPS API. An explicit environment value still
    # supports a local API when development needs it.
    environment.setdefault("READJI_TTS_API_URL", "http://185.84.161.98:4000")
    existing_python_path = environment.get("PYTHONPATH")
    environment["PYTHONPATH"] = str(SOURCE_ROOT) if not existing_python_path else os.pathsep.join((str(SOURCE_ROOT), existing_python_path))
    return subprocess.Popen([sys.executable, "-m", "readji_tts_agent.app"], cwd=PROJECT_ROOT, env=environment)


def stop_app(process: subprocess.Popen[object]) -> None:
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def main() -> None:
    snapshot = source_snapshot()
    process = start_app()
    try:
        while process.poll() is None:
            time.sleep(POLL_INTERVAL_SECONDS)
            updated_snapshot = source_snapshot()
            if updated_snapshot == snapshot:
                continue
            snapshot = updated_snapshot
            print("Python source changed; restarting TTS Agent...")
            stop_app(process)
            process = start_app()
    except KeyboardInterrupt:
        print("Stopping TTS Agent watcher...")
    finally:
        stop_app(process)


if __name__ == "__main__":
    main()
