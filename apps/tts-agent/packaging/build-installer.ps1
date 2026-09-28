[CmdletBinding()]
param(
    [string]$PythonCommand = "python",
    [string[]]$PythonArguments = @()
)

$ErrorActionPreference = "Stop"
$pythonVersion = & $PythonCommand $PythonArguments -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ($LASTEXITCODE -ne 0 -or $pythonVersion -notmatch '^3\.(10|11|12)$') {
    throw "Python 3.10, 3.11, or 3.12 is required. Pass -PythonCommand and -PythonArguments when Python is installed elsewhere."
}
$cudaAvailable = & $PythonCommand $PythonArguments -c "import torch; print(int(torch.cuda.is_available()))"
if ($LASTEXITCODE -ne 0 -or $cudaAvailable -ne "1") {
    throw "A CUDA-enabled PyTorch build is required before packaging. Install the NVIDIA CUDA wheel and verify torch.cuda.is_available() returns True."
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$assetsRoot = Join-Path $projectRoot "assets"
$requiredVoices = @(
    "voices/Basic/Basic_old_male.wav",
    "voices/Basic/Basic_young_male.wav",
    "voices/Basic/Basic_female.wav"
)

foreach ($voice in $requiredVoices) {
    if (-not (Test-Path -LiteralPath (Join-Path $assetsRoot $voice) -PathType Leaf)) {
        throw "Missing required reference voice: assets/$voice"
    }
}

$pyproject = Get-Content -LiteralPath (Join-Path $projectRoot "pyproject.toml") -Raw
if ($pyproject -notmatch '(?m)^version\s*=\s*"([^"]+)"') {
    throw "Could not read the application version from pyproject.toml."
}
$version = $Matches[1]
$tritonMetadataDirectory = & $PythonCommand $PythonArguments -c "import importlib.metadata as metadata; print(metadata.distribution('triton-windows')._path)"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $tritonMetadataDirectory -PathType Container)) {
    throw "Could not locate triton-windows package metadata."
}
$tritonEntryPoints = Join-Path $tritonMetadataDirectory "entry_points.txt"
if (-not (Test-Path -LiteralPath $tritonEntryPoints -PathType Leaf)) {
    throw "triton-windows package metadata is missing entry_points.txt."
}
$tritonMetadataDestination = Split-Path -Leaf $tritonMetadataDirectory
$entrypoint = Join-Path $PSScriptRoot "entrypoint.py"
$workerEntrypoint = Join-Path $PSScriptRoot "worker_entrypoint.py"
$bootstrapEntrypoint = Join-Path $PSScriptRoot "bootstrap_entrypoint.py"
$bootstrapConfig = Join-Path $PSScriptRoot "bootstrap-config.json"
$runtimePackager = Join-Path $PSScriptRoot "create-runtime-package.py"
$distPath = Join-Path $projectRoot "dist"
$workPath = Join-Path $projectRoot "build"
$runtimeDistPath = Join-Path $distPath "runtime"
$bootstrapDistPath = Join-Path $distPath "bootstrap"
$releasePath = Join-Path $distPath "release"

Push-Location $projectRoot
try {
    & $PythonCommand $PythonArguments -m PyInstaller --noconfirm --clean --windowed `
        --name "Readji TTS Agent" `
        --paths "src" `
        --add-data "$assetsRoot;assets" `
        --collect-all qfluentwidgets `
        --collect-all voxcpm `
        --collect-all soundfile `
        --collect-submodules keyring `
        --distpath $runtimeDistPath `
        --workpath $workPath `
        --specpath $workPath `
        $entrypoint

    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller failed with exit code $LASTEXITCODE."
    }

    & $PythonCommand $PythonArguments -m PyInstaller --noconfirm --clean --console `
        --name "Readji TTS Agent Worker" `
        --paths "src" `
        --copy-metadata triton-windows `
        --add-data "$tritonEntryPoints;$tritonMetadataDestination" `
        --collect-all voxcpm `
        --collect-all soundfile `
        --distpath $runtimeDistPath `
        --workpath $workPath `
        --specpath $workPath `
        $workerEntrypoint

    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller worker build failed with exit code $LASTEXITCODE."
    }

    # Keep the standalone dist output runnable too. The GUI resolves its
    # console worker relative to its own executable, and Inno Setup copies this
    # complete directory into the installed application folder.
    $applicationOutput = Join-Path $runtimeDistPath "Readji TTS Agent"
    $workerOutput = Join-Path $runtimeDistPath "Readji TTS Agent Worker"
    Copy-Item -LiteralPath $workerOutput -Destination (Join-Path $applicationOutput "worker") -Recurse -Force

    & $PythonCommand $PythonArguments $runtimePackager `
        --runtime-directory $applicationOutput `
        --version $version `
        --output-directory $releasePath
    if ($LASTEXITCODE -ne 0) {
        throw "Runtime package creation failed with exit code $LASTEXITCODE."
    }

    # The installer carries only this bootstrap. It downloads the GPU runtime
    # from the separately hosted manifest at first launch.
    & $PythonCommand $PythonArguments -m PyInstaller --noconfirm --clean --windowed `
        --name "Readji TTS Agent" `
        --paths "src" `
        --add-data "$bootstrapConfig;." `
        --distpath $bootstrapDistPath `
        --workpath $workPath `
        --specpath $workPath `
        $bootstrapEntrypoint
    if ($LASTEXITCODE -ne 0) {
        throw "Bootstrap PyInstaller build failed with exit code $LASTEXITCODE."
    }

    $iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($null -eq $iscc) {
        $userInstalledIscc = Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"
        if (Test-Path -LiteralPath $userInstalledIscc -PathType Leaf) {
            $iscc = Get-Item -LiteralPath $userInstalledIscc
        }
    }
    if ($null -eq $iscc) {
        throw "Inno Setup 6 is required. Install it, then run this script again."
    }
    & $iscc.Source "/DMyAppVersion=$version" (Join-Path $PSScriptRoot "installer.iss")
    if ($LASTEXITCODE -ne 0) {
        throw "Inno Setup failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
