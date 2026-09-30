"""Create the separately hosted TTS runtime archive and manifest template."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import zipfile


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-directory", type=Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    arguments = parser.parse_args()

    runtime = arguments.runtime_directory.resolve()
    if not (runtime / "Dopapage.exe").is_file():
        raise SystemExit(f"Runtime executable is missing: {runtime}")

    arguments.output_directory.mkdir(parents=True, exist_ok=True)
    archive = arguments.output_directory / f"Dopapage-runtime-{arguments.version}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as output:
        for file in runtime.rglob("*"):
            if file.is_file():
                output.write(file, file.relative_to(runtime).as_posix())

    manifest = {
        "version": arguments.version,
        "runtime": {
            "version": arguments.version,
            "url": f"http://185.84.161.98:8080/Dopapage-runtime-{arguments.version}.zip",
            "sha256": sha256(archive),
            "size": archive.stat().st_size,
            "archive": archive.name,
        },
    }
    manifest_path = arguments.output_directory / "runtime-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(archive)
    print(manifest_path)


if __name__ == "__main__":
    main()
