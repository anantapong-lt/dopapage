# Readji TTS Agent

Windows application for writers to render their own novel chapters with their GPU.

## Install

Use Python 3.10, 3.11, or 3.12 with a CUDA-enabled PyTorch installation appropriate for the writer's NVIDIA driver, then install this app from this folder:

```powershell
pip install -e .
readji-tts-agent
```

On first job start, the app checks and downloads FFmpeg for Windows x64 with a
progress dialog, verifies its pinned SHA-256 checksum, and installs it under
`%LOCALAPPDATA%/Readji/TTS Agent/tools/ffmpeg/8.1.2/`. No administrator permission,
WinGet installation, or PATH changes are required. The download comes from
[Gyan's FFmpeg builds](https://www.gyan.dev/ffmpeg/builds/); an interrupted download
can be retried from the dialog. Jobs are not claimed until FFmpeg is ready.

VoxCPM2 downloads `openbmb/VoxCPM2` when its local model cache is missing.

Copy legally usable reference WAVs into `assets/voices/Basic/`:

- `Basic_old_male.wav`
- `Basic_young_male.wav`
- `Basic_female.wav`

The agent never stores the writer's password. It stores only the refresh token in Windows Credential Manager. Development builds connect to `http://localhost:4000`; packaged deployments set `READJI_TTS_API_URL` during launch or packaging.

## Build the Windows installer

Place the three licensed reference voice files in `assets/voices/Basic/` before
building. The build stops if any of these files is missing, so an installer is
never produced without its required voices.

```powershell
cd apps/tts-agent
python -m pip install ".[packaging]"
.\packaging\build-installer.ps1
```

The completed installer is `dist/installer/Dopapage-Setup.exe`. It contains the
bootstrap, while `dist/release/` contains the separately hosted runtime archive,
an optional patch from the installed version, and `runtime-manifest.json`.

For the first release with patch support, build the new bootstrap, publish the
installer and runtime together, then install the new bootstrap once:

```powershell
.\packaging\build-installer.ps1
.\packaging\publish-runtime.ps1 -SkipBuild -PublishInstaller
```

For later Agent code releases, increase the version in `pyproject.toml` and run
only `.\packaging\publish-runtime.ps1`. It builds the GUI and Worker, merges
identical dependencies into one `_internal` directory, creates the full runtime
and a patch from the installed version, uploads both to the VPS, verifies their
checksums and public URLs, and publishes the manifest last. The installer is
rebuilt only when the bootstrap or installer itself changes. If the build
machine does not have the previous runtime installed, pass
`-PreviousRuntimeDirectory` with that version's unpacked directory.

The bootstrap checks the manifest on every launch. With a matching patch it
reuses verified files from the current runtime and downloads only changed files;
otherwise it downloads the full runtime archive. It stages and verifies the
new version before switching to it. An installed runtime still starts if the
manifest is temporarily unavailable. Launch through the installed Dopapage
shortcut; running `runtime\<version>\Dopapage.exe` directly skips the updater.
Model weights download separately from Hugging Face when missing.

Development launches default to `http://localhost:4000`; the packaged bootstrap
passes the production API URL from `bootstrap-config.json` to the Agent.
