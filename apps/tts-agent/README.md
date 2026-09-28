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

The completed installer is written to
`dist/installer/Readji-TTS-Agent-Setup-<version>.exe`. It contains only a small
bootstrap and installs for the current Windows user under `%LOCALAPPDATA%`.
The separately hosted runtime archive and its `runtime-manifest.json` are
written to `dist/release/`. Upload both to Google Drive and replace the
`runtime.url` placeholder in the manifest with the archive's public download
link. Then upload the edited manifest and put its public link in:

`%LOCALAPPDATA%\Readji\TTS Agent\bootstrap-config.json`

```json
{
  "manifest_url": "https://drive.google.com/file/d/FILE_ID/view"
}
```

On first launch the bootstrap downloads the runtime, verifies its SHA-256, and
starts the agent. On later launches it reads the manifest again and installs a
new runtime version when available; an already installed runtime still starts
if Drive is temporarily unavailable. The model weights download once from
Hugging Face into `%LOCALAPPDATA%\Readji\TTS Agent\cache\huggingface`.

The package keeps the current API default of `http://localhost:4000`; change it
at launch with `READJI_TTS_API_URL` when a production endpoint is available.
