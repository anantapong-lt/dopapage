from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from typing import Any
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
import zipfile

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication, QMessageBox, QProgressDialog


APP_NAME = "Readji TTS Agent"
CHUNK_SIZE = 1024 * 1024


class BootstrapError(RuntimeError):
    pass


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
    if not path.is_file():
        path.parent.mkdir(parents=True, exist_ok=True)
        template = bundled_root() / "bootstrap-config.json"
        shutil.copyfile(template, path)
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise BootstrapError(f"ไม่สามารถอ่านการตั้งค่าอัปเดตได้: {error}") from error
    if not isinstance(value, dict):
        raise BootstrapError("รูปแบบไฟล์ bootstrap-config.json ไม่ถูกต้อง")
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
        request = Request(google_drive_download_url(url), headers={"User-Agent": "Readji-TTS-Agent"})
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
    executable = data_root() / "runtime" / str(version) / "Readji TTS Agent.exe"
    return executable if executable.is_file() else None


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


def download_runtime(url: str, destination: Path, expected_sha256: str, progress: QProgressDialog) -> None:
    digest = hashlib.sha256()
    temporary = destination.with_suffix(".part")
    try:
        request = Request(google_drive_download_url(url), headers={"User-Agent": "Readji-TTS-Agent"})
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
                    progress.setLabelText(f"กำลังดาวน์โหลด runtime... {written / 1024 / 1024:.0f} / {total / 1024 / 1024:.0f} MB")
                    progress.setValue(min(99, int(written * 100 / total)))
                QApplication.processEvents()
                if progress.wasCanceled():
                    raise BootstrapError("ยกเลิกการดาวน์โหลด runtime แล้ว")
        if digest.hexdigest().lower() != expected_sha256:
            raise BootstrapError("ตรวจสอบ SHA-256 ของ runtime ไม่ผ่าน กรุณาลองใหม่")
        temporary.replace(destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def extract_runtime(archive: Path, destination: Path) -> None:
    staging = destination.with_name(f"{destination.name}.installing")
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(archive) as package:
            for entry in package.infolist():
                target = (staging / entry.filename).resolve()
                if not target.is_relative_to(staging.resolve()):
                    raise BootstrapError("runtime archive มีพาธที่ไม่ปลอดภัย")
                package.extract(entry, staging)
        if not (staging / "Readji TTS Agent.exe").is_file():
            raise BootstrapError("runtime archive ไม่มีไฟล์โปรแกรมหลัก")
        shutil.rmtree(destination, ignore_errors=True)
        staging.replace(destination)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def ensure_runtime() -> Path:
    config = load_config()
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
    executable = target / "Readji TTS Agent.exe"
    if executable.is_file():
        return executable

    progress = QProgressDialog("กำลังเตรียม runtime สำหรับประมวลผลเสียง...", "ยกเลิก", 0, 100)
    progress.setWindowTitle("กำลังเตรียม Readji TTS Agent")
    progress.setWindowModality(Qt.WindowModality.ApplicationModal)
    progress.setMinimumDuration(0)
    progress.show()
    with tempfile.TemporaryDirectory(prefix="readji-tts-runtime-") as temporary_directory:
        archive = Path(temporary_directory) / "runtime.zip"
        download_runtime(download_url, archive, digest, progress)
        progress.setLabelText("กำลังติดตั้ง runtime...")
        progress.setValue(99)
        QApplication.processEvents()
        extract_runtime(archive, target)
    progress.setValue(100)
    (data_root() / "runtime-state.json").write_text(json.dumps({"version": version}) + "\n", encoding="utf-8")
    return executable


def main() -> None:
    application = QApplication(sys.argv)
    try:
        executable = ensure_runtime()
    except BootstrapError as error:
        QMessageBox.critical(None, APP_NAME, str(error))
        raise SystemExit(1)
    subprocess.Popen([str(executable)], cwd=executable.parent)


if __name__ == "__main__":
    main()
