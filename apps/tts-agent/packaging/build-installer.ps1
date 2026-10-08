[CmdletBinding()]
param(
    [string]$PythonCommand = "python",
    [string[]]$PythonArguments = @(),
    [switch]$RuntimeOnly,
    [string]$PreviousRuntimeDirectory
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
if (-not $PreviousRuntimeDirectory) {
    $runtimeState = Join-Path $env:LOCALAPPDATA "Readji\TTS Agent\runtime-state.json"
    if (Test-Path -LiteralPath $runtimeState -PathType Leaf) {
        try {
            $installedVersion = (Get-Content -LiteralPath $runtimeState -Raw | ConvertFrom-Json).version
        } catch {
            $installedVersion = $null
        }
        if ($installedVersion -match '^[0-9A-Za-z][0-9A-Za-z.-]*$' -and $installedVersion -ne $version) {
            $installedRuntime = Join-Path $env:LOCALAPPDATA "Readji\TTS Agent\runtime\$installedVersion"
            if (Test-Path -LiteralPath (Join-Path $installedRuntime "Dopapage.exe") -PathType Leaf) {
                $PreviousRuntimeDirectory = $installedRuntime
            }
        }
    }
}
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
        --name "Dopapage" `
        --paths "src" `
        --add-data "$assetsRoot;assets" `
        --add-data "$bootstrapConfig;." `
        --collect-all qfluentwidgets `
        --collect-all voxcpm `
        --collect-all soundfile `
        --collect-submodules keyring `
        --collect-all win32ctypes `
        --distpath $runtimeDistPath `
        --workpath $workPath `
        --specpath $workPath `
        $entrypoint

    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller failed with exit code $LASTEXITCODE."
    }

    & $PythonCommand $PythonArguments -m PyInstaller --noconfirm --clean --console `
        --name "Dopapage Worker" `
        --paths "src" `
        --copy-metadata triton-windows `
        --add-data "$tritonEntryPoints;$tritonMetadataDestination" `
        --collect-all voxcpm `
        --collect-all soundfile `
        --collect-submodules keyring `
        --collect-all win32ctypes `
        --distpath $runtimeDistPath `
        --workpath $workPath `
        --specpath $workPath `
        $workerEntrypoint

    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller worker build failed with exit code $LASTEXITCODE."
    }

    # Both executables can use the same _internal directory. Reject conflicting
    # files rather than silently replacing a dependency needed by either app.
    $applicationOutput = Join-Path $runtimeDistPath "Dopapage"
    $workerOutput = Join-Path $runtimeDistPath "Dopapage Worker"
    if (Test-Path -LiteralPath (Join-Path $applicationOutput "worker")) {
        throw "The GUI build contains a stale worker directory. Clean the runtime output before packaging."
    }
    foreach ($workerFile in (Get-ChildItem -LiteralPath $workerOutput -Recurse -File)) {
        $relativePath = $workerFile.FullName.Substring($workerOutput.Length + 1)
        $destination = Join-Path $applicationOutput $relativePath
        if (Test-Path -LiteralPath $destination) {
            $existing = Get-Item -LiteralPath $destination
            if ($existing.Length -eq $workerFile.Length -and
                (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -eq
                (Get-FileHash -LiteralPath $workerFile.FullName -Algorithm SHA256).Hash) {
                continue
            }
            if ($relativePath -eq "_internal\base_library.zip") {
                # PyInstaller may write different ZIP metadata for identical
                # standard-library entries. Compare their extracted bytes.
                $compareZip = "import sys,zipfile,hashlib; a=zipfile.ZipFile(sys.argv[1]); b=zipfile.ZipFile(sys.argv[2]); names=set(a.namelist()); sys.exit(0 if names==set(b.namelist()) and all(hashlib.sha256(a.read(n)).digest()==hashlib.sha256(b.read(n)).digest() for n in names) else 1)"
                & $PythonCommand $PythonArguments -c $compareZip $destination $workerFile.FullName
                if ($LASTEXITCODE -eq 0) {
                    continue
                }
            }
            throw "GUI and Worker dependencies differ at $relativePath; refusing to merge them."
        }
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $workerFile.FullName -Destination $destination
    }

    $packageArguments = @($runtimePackager, "--runtime-directory", $applicationOutput, "--version", $version, "--output-directory", $releasePath)
    if ($PreviousRuntimeDirectory) {
        $packageArguments += @("--previous-runtime-directory", $PreviousRuntimeDirectory)
    }
    & $PythonCommand $PythonArguments @packageArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Runtime package creation failed with exit code $LASTEXITCODE."
    }

    if (-not $RuntimeOnly) {
        # The installer carries only this bootstrap. It downloads the GPU runtime
        # from the separately hosted manifest at first launch.
        & $PythonCommand $PythonArguments -m PyInstaller --noconfirm --clean --windowed `
            --name "Dopapage" `
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
        $isccPath = $iscc.Source
        if (-not $isccPath) {
            $userInstalledIscc = Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"
            if (Test-Path -LiteralPath $userInstalledIscc -PathType Leaf) {
                $isccPath = $userInstalledIscc
            }
        }
        if (-not $isccPath) {
            throw "Inno Setup 6 is required. Install it, then run this script again."
        }
        & $isccPath "/DMyAppVersion=$version" (Join-Path $PSScriptRoot "installer.iss")
        if ($LASTEXITCODE -ne 0) {
            throw "Inno Setup failed with exit code $LASTEXITCODE."
        }
    }
}
finally {
    Pop-Location
}
