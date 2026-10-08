"""Create the separately hosted TTS runtime archive and manifest template."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
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
    parser.add_argument("--previous-runtime-directory", type=Path)
    arguments = parser.parse_args()

    if not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z.-]*", arguments.version):
        raise SystemExit("Runtime version contains unsupported filename characters")
    runtime = arguments.runtime_directory.resolve()
    if not (runtime / "Dopapage.exe").is_file():
        raise SystemExit(f"Runtime executable is missing: {runtime}")

    arguments.output_directory.mkdir(parents=True, exist_ok=True)
    files = []
    runtime_paths = sorted(file for file in runtime.rglob("*") if file.is_file())
    for file in runtime_paths:
        files.append({
            "path": file.relative_to(runtime).as_posix(),
            "size": file.stat().st_size,
            "sha256": sha256(file),
        })

    archive = arguments.output_directory / f"Dopapage-runtime-{arguments.version}.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as output:
        for file in runtime_paths:
            output.write(file, file.relative_to(runtime).as_posix())

    patches = []
    previous = arguments.previous_runtime_directory
    if previous is not None:
        previous = previous.resolve()
        previous_version = previous.name
        if not re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z.-]*", previous_version):
            raise SystemExit("Previous runtime directory must be named for its version")
        if previous_version == arguments.version:
            raise SystemExit("Increase the runtime version before packaging an update")
        if not (previous / "Dopapage.exe").is_file():
            raise SystemExit(f"Previous runtime is incomplete: {previous}")
        changed = []
        for entry in files:
            old_file = previous / Path(entry["path"])
            if (not old_file.is_file() or old_file.stat().st_size != entry["size"]
                    or sha256(old_file) != entry["sha256"]):
                changed.append(entry["path"])
        patch_archive = arguments.output_directory / f"Dopapage-runtime-{previous_version}-to-{arguments.version}.zip"
        with zipfile.ZipFile(patch_archive, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as output:
            for path in changed:
                output.write(runtime / Path(path), path)
        patches.append({
            "from_version": previous_version,
            "url": f"http://185.84.161.98:8080/{patch_archive.name}",
            "sha256": sha256(patch_archive),
            "size": patch_archive.stat().st_size,
            "archive": patch_archive.name,
        })

    manifest = {
        "version": arguments.version,
        "runtime": {
            "version": arguments.version,
            "url": f"http://185.84.161.98:8080/Dopapage-runtime-{arguments.version}.zip",
            "sha256": sha256(archive),
            "size": archive.stat().st_size,
            "archive": archive.name,
            "files": files,
            "patches": patches,
        },
    }
    manifest_path = arguments.output_directory / "runtime-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(archive)
    for patch in patches:
        print(arguments.output_directory / patch["archive"])
    print(manifest_path)


if __name__ == "__main__":
    main()
