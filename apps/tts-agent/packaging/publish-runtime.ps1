[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$PublishInstaller,
    [string]$PreviousRuntimeDirectory,
    [string]$PythonCommand = "python",
    [string[]]$PythonArguments = @()
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$releasePath = Join-Path $projectRoot "dist\release"
$source = Get-Content -LiteralPath (Join-Path $projectRoot "pyproject.toml") -Raw
if ($source -notmatch '(?m)^version\s*=\s*"(\d+\.\d+\.\d+)"') {
    throw "Expected a major.minor.patch version in pyproject.toml."
}
$releaseVersion = $Matches[1]
$vpsAddress = "185.84.161.98"
$vpsUser = "xver"
$remote = "${vpsUser}@${vpsAddress}"
$sshKey = Join-Path $env:USERPROFILE ".ssh\dopapage_vps_deploy"
$manifestUrl = "http://${vpsAddress}:8080/runtime-manifest.json"
$releaseUrl = "http://${vpsAddress}:8080"
$remoteStage = "/home/${vpsUser}/dopapage-runtime-release-${releaseVersion}"
$sshOptions = @("-p", "22", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "IdentitiesOnly=yes", "-i", $sshKey)
$scpOptions = @("-P", "22", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "IdentitiesOnly=yes", "-i", $sshKey)

if (-not (Test-Path -LiteralPath $sshKey -PathType Leaf)) {
    throw "VPS SSH key is unavailable: $sshKey"
}
$inspectText = & ssh @sshOptions $remote "docker inspect tts-runtime"
if ($LASTEXITCODE -ne 0) { throw "Could not inspect the VPS runtime container." }
$runtimeContainer = @(ConvertFrom-Json -InputObject ($inspectText -join "`n"))[0]
$runtimeMount = @($runtimeContainer.Mounts | Where-Object { $_.Destination -eq "/usr/share/nginx/html" }) | Select-Object -First 1
$runtimeVolume = [string]$runtimeMount.Name
if ($runtimeVolume -notmatch '^[A-Za-z0-9_-]+$') {
    throw "Could not identify the VPS runtime volume."
}
$liveManifest = Invoke-RestMethod -Uri $manifestUrl -TimeoutSec 30
$liveVersion = [string]$liveManifest.runtime.version
if ($liveVersion -notmatch '^\d+\.\d+\.\d+$' -or [version]$releaseVersion -le [version]$liveVersion) {
    throw "Increase pyproject.toml beyond the published runtime version $liveVersion."
}

if (-not $SkipBuild) {
    if ($PreviousRuntimeDirectory) {
        & (Join-Path $PSScriptRoot "build-installer.ps1") -RuntimeOnly -PreviousRuntimeDirectory $PreviousRuntimeDirectory -PythonCommand $PythonCommand -PythonArguments $PythonArguments
    } else {
        & (Join-Path $PSScriptRoot "build-installer.ps1") -RuntimeOnly -PythonCommand $PythonCommand -PythonArguments $PythonArguments
    }
}

$manifestFile = Join-Path $releasePath "runtime-manifest.json"
if (-not (Test-Path -LiteralPath $manifestFile -PathType Leaf)) {
    throw "Runtime manifest is missing: $manifestFile"
}
$manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
if ($manifest.runtime.version -ne $releaseVersion) {
    throw "The runtime manifest version does not match pyproject.toml."
}
$patch = @($manifest.runtime.patches | Where-Object { $_.from_version -eq $liveVersion }) | Select-Object -First 1
if (-not $patch) {
    throw "No patch from published runtime $liveVersion was produced. Pass -PreviousRuntimeDirectory for that version."
}
$artifacts = @($manifest.runtime, $patch)
foreach ($artifact in $artifacts) {
    $filename = [string]$artifact.archive
    if ($filename -notmatch '^Dopapage-runtime-[0-9A-Za-z.-]+\.zip$') {
        throw "Invalid runtime archive filename in manifest."
    }
    $localFile = Join-Path $releasePath $filename
    if (-not (Test-Path -LiteralPath $localFile -PathType Leaf)) {
        throw "Runtime archive is missing: $localFile"
    }
    $file = Get-Item -LiteralPath $localFile
    if ($file.Length -ne [long]$artifact.size -or
        (Get-FileHash -LiteralPath $localFile -Algorithm SHA256).Hash -ne [string]$artifact.sha256) {
        throw "Runtime archive does not match its manifest: $filename"
    }
    if ($artifact.url -ne "$releaseUrl/$filename") {
        throw "Runtime archive URL does not match the VPS endpoint: $filename"
    }
}
$installerFile = Join-Path $projectRoot "dist\installer\Dopapage-Setup.exe"
if ($PublishInstaller) {
    if (-not (Test-Path -LiteralPath $installerFile -PathType Leaf)) {
        throw "Bootstrap installer is missing: $installerFile"
    }
    $installerHash = (Get-FileHash -LiteralPath $installerFile -Algorithm SHA256).Hash
    $installerSize = (Get-Item -LiteralPath $installerFile).Length
}

& ssh @sshOptions $remote "mkdir -p $remoteStage"
if ($LASTEXITCODE -ne 0) { throw "Could not create the VPS release staging directory." }
$uploadFiles = @($artifacts | ForEach-Object { [string]$_.archive }) + @("runtime-manifest.json")
foreach ($filename in $uploadFiles) {
    & scp @scpOptions (Join-Path $releasePath $filename) "${remote}:${remoteStage}/${filename}"
    if ($LASTEXITCODE -ne 0) { throw "VPS upload failed: $filename" }
}
if ($PublishInstaller) {
    & scp @scpOptions $installerFile "${remote}:${remoteStage}/Dopapage-Setup.exe"
    if ($LASTEXITCODE -ne 0) { throw "VPS installer upload failed." }
    $uploadFiles += "Dopapage-Setup.exe"
}

foreach ($artifact in $artifacts) {
    $filename = [string]$artifact.archive
    $remoteHash = & ssh @sshOptions $remote "sha256sum $remoteStage/$filename"
    if ($LASTEXITCODE -ne 0 -or ($remoteHash -split '\s+')[0] -ne [string]$artifact.sha256) {
        throw "VPS archive checksum failed: $filename"
    }
    & ssh @sshOptions $remote "docker run --rm -v ${runtimeVolume}:/out -v ${remoteStage}:/in:ro postgres:16-alpine cp /in/$filename /out/$filename"
    if ($LASTEXITCODE -ne 0) { throw "Could not stage the runtime archive in the VPS volume: $filename" }
    $volumeHash = & ssh @sshOptions $remote "docker run --rm -v ${runtimeVolume}:/out:ro postgres:16-alpine sha256sum /out/$filename"
    if ($LASTEXITCODE -ne 0 -or ($volumeHash -split '\s+')[0] -ne [string]$artifact.sha256) {
        throw "VPS runtime volume checksum failed: $filename"
    }
    $head = Invoke-WebRequest -Uri "$releaseUrl/$filename" -Method Head -UseBasicParsing -TimeoutSec 30
    $publicSize = [long](@($head.Headers["Content-Length"])[0])
    if ($publicSize -ne [long]$artifact.size) {
        throw "The public runtime archive has the wrong size: $filename"
    }
}
if ($PublishInstaller) {
    $remoteInstallerHash = & ssh @sshOptions $remote "sha256sum $remoteStage/Dopapage-Setup.exe"
    if ($LASTEXITCODE -ne 0 -or ($remoteInstallerHash -split '\s+')[0] -ne $installerHash) {
        throw "VPS installer checksum failed."
    }
    & ssh @sshOptions $remote "docker run --rm -v ${runtimeVolume}:/out -v ${remoteStage}:/in:ro postgres:16-alpine cp /in/Dopapage-Setup.exe /out/Dopapage-Setup.exe.next"
    if ($LASTEXITCODE -ne 0) { throw "Could not stage the VPS installer." }
    & ssh @sshOptions $remote "docker run --rm -v ${runtimeVolume}:/out postgres:16-alpine mv /out/Dopapage-Setup.exe.next /out/Dopapage-Setup.exe"
    if ($LASTEXITCODE -ne 0) { throw "Could not activate the VPS installer." }
    $publicInstaller = Invoke-WebRequest -Uri "$releaseUrl/Dopapage-Setup.exe" -Method Head -UseBasicParsing -TimeoutSec 30
    if ([long](@($publicInstaller.Headers["Content-Length"])[0]) -ne $installerSize) {
        throw "The public installer has the wrong size."
    }
}

$localManifestHash = (Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash
$remoteManifestHash = & ssh @sshOptions $remote "sha256sum $remoteStage/runtime-manifest.json"
if ($LASTEXITCODE -ne 0 -or ($remoteManifestHash -split '\s+')[0] -ne $localManifestHash) {
    throw "VPS runtime manifest checksum failed."
}
& ssh @sshOptions $remote "docker run --rm -v ${runtimeVolume}:/out -v ${remoteStage}:/in:ro postgres:16-alpine cp /in/runtime-manifest.json /out/runtime-manifest.json.next"
if ($LASTEXITCODE -ne 0) { throw "Could not stage the VPS manifest." }
& ssh @sshOptions $remote "docker run --rm -v ${runtimeVolume}:/out postgres:16-alpine mv /out/runtime-manifest.json.next /out/runtime-manifest.json"
if ($LASTEXITCODE -ne 0) { throw "Could not activate the VPS manifest." }
$published = Invoke-RestMethod -Uri $manifestUrl -TimeoutSec 30
if ($published.runtime.version -ne $releaseVersion -or $published.runtime.sha256 -ne $manifest.runtime.sha256) {
    throw "The public runtime manifest did not update as expected."
}

foreach ($filename in $uploadFiles) {
    & ssh @sshOptions $remote "rm -f $remoteStage/$filename"
    if ($LASTEXITCODE -ne 0) { throw "Published, but could not clean the VPS staging file: $filename" }
}
& ssh @sshOptions $remote "rmdir $remoteStage"
if ($LASTEXITCODE -ne 0) { throw "Published, but could not remove the VPS staging directory." }
Write-Output "Published Dopapage runtime $releaseVersion and its patch from $liveVersion."
