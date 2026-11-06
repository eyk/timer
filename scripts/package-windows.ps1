param([switch]$LocalIdentity)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$timerRoot = Split-Path $PSScriptRoot -Parent
$timerPackage = Get-Content (Join-Path $timerRoot 'package.json') -Raw | ConvertFrom-Json
$timerVersion = "$($timerPackage.version).0"
$timerExecutable = Join-Path $timerRoot 'src-tauri/target/release/timer.exe'
if ([Diagnostics.FileVersionInfo]::GetVersionInfo($timerExecutable).ProductVersion -ne $timerPackage.version) {
    throw "Build the release executable for version $($timerPackage.version) before packaging."
}
$timerName = $env:MSSTORE_PACKAGE_NAME
$timerPublisher = $env:MSSTORE_PUBLISHER
$timerDisplayName = $env:MSSTORE_PUBLISHER_DISPLAY_NAME
if ($LocalIdentity) {
    $timerName = 'eyk.Timer.LocalValidation'
    $timerPublisher = 'CN=Timer Local Validation'
    $timerDisplayName = 'Walter Seethaler'
} elseif (!$timerName -or !$timerPublisher -or !$timerDisplayName) {
    throw 'Set MSSTORE_PACKAGE_NAME, MSSTORE_PUBLISHER and MSSTORE_PUBLISHER_DISPLAY_NAME from Partner Center. Use -LocalIdentity only for local package validation.'
}
if ($timerName -notmatch '^[A-Za-z0-9.-]{3,50}$') { throw 'Invalid package identity name.' }
$timerSdk = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Directory |
    Where-Object { $_.Name -match '^10\.0\.\d+\.0$' -and (Test-Path (Join-Path $_.FullName 'x64\makeappx.exe')) } |
    Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (!$timerSdk) { throw 'Windows SDK with MakeAppx is required.' }
$timerStage = Join-Path $timerRoot 'work\msix-stage'
$timerOutput = Join-Path $timerRoot 'artifacts\windows'
if (Test-Path $timerStage) {
    $timerResolved = [IO.Path]::GetFullPath($timerStage)
    if (!$timerResolved.StartsWith([IO.Path]::GetFullPath((Join-Path $timerRoot 'work')) + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging path.' }
    Remove-Item -LiteralPath $timerResolved -Recurse -Force
}
New-Item -ItemType Directory -Force "$timerStage\Assets", $timerOutput | Out-Null
Copy-Item -LiteralPath $timerExecutable -Destination "$timerStage\Timer.exe"
Copy-Item -LiteralPath (Join-Path $timerRoot 'LICENSE') -Destination "$timerStage\LICENSE.txt"
Copy-Item -LiteralPath (Join-Path $timerRoot 'store\THIRD-PARTY-NOTICES.txt') -Destination "$timerStage\THIRD-PARTY-NOTICES.txt"
foreach ($timerAsset in @('Square44x44Logo.png','Square150x150Logo.png','StoreLogo.png')) {
    Copy-Item -LiteralPath (Join-Path $timerRoot "store\assets\$timerAsset") -Destination "$timerStage\Assets\$timerAsset"
}
$timerNameXml = [Security.SecurityElement]::Escape($timerName)
$timerPublisherXml = [Security.SecurityElement]::Escape($timerPublisher)
$timerDisplayXml = [Security.SecurityElement]::Escape($timerDisplayName)
@"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
 xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
 xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
 IgnorableNamespaces="uap rescap">
 <Identity Name="$timerNameXml" Publisher="$timerPublisherXml" Version="$timerVersion" ProcessorArchitecture="x64" />
 <Properties><DisplayName>Eyk Timer</DisplayName><PublisherDisplayName>$timerDisplayXml</PublisherDisplayName><Logo>Assets\StoreLogo.png</Logo></Properties>
 <Resources><Resource Language="en-US" /><Resource Language="de-DE" /></Resources>
 <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
 <Applications><Application Id="Timer" Executable="Timer.exe" EntryPoint="Windows.FullTrustApplication">
  <uap:VisualElements DisplayName="Eyk Timer" Description="Type minutes. Press Enter. Done." BackgroundColor="transparent" Square150x150Logo="Assets\Square150x150Logo.png" Square44x44Logo="Assets\Square44x44Logo.png" />
 </Application></Applications>
 <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>
"@ | Set-Content -LiteralPath "$timerStage\AppxManifest.xml" -Encoding utf8
$timerSuffix = if ($LocalIdentity) { '-local-validation' } else { '' }
$timerMsix = Join-Path $timerOutput "Timer_$($timerPackage.version)_x64$timerSuffix.msix"
& (Join-Path $timerSdk.FullName 'x64\makeappx.exe') pack /d $timerStage /p $timerMsix /o
if ($LASTEXITCODE -ne 0) { throw 'MSIX package validation failed.' }
$timerHasher = [Security.Cryptography.SHA256]::Create()
$timerStream = [IO.File]::OpenRead($timerMsix)
try { $timerDigest = [BitConverter]::ToString($timerHasher.ComputeHash($timerStream)).Replace('-','').ToLowerInvariant() }
finally { $timerStream.Dispose(); $timerHasher.Dispose() }
"$timerDigest  $([IO.Path]::GetFileName($timerMsix))" | Set-Content "$timerMsix.sha256" -Encoding ascii
$timerInstaller = Join-Path $timerRoot "src-tauri\target\release\bundle\nsis\Eyk Timer_$($timerPackage.version)_x64-setup.exe"
if (Test-Path $timerInstaller) { Copy-Item -LiteralPath $timerInstaller -Destination $timerOutput -Force }
$timerChecksums = foreach ($timerFile in (Get-ChildItem $timerOutput -File | Where-Object { $_.Extension -in @('.msix','.exe') } | Sort-Object Name)) {
    $timerHash = [Security.Cryptography.SHA256]::Create()
    $timerInput = [IO.File]::OpenRead($timerFile.FullName)
    try { $timerHex = [BitConverter]::ToString($timerHash.ComputeHash($timerInput)).Replace('-','').ToLowerInvariant() }
    finally { $timerInput.Dispose(); $timerHash.Dispose() }
    "$timerHex  $($timerFile.Name)"
}
$timerChecksums | Set-Content (Join-Path $timerOutput 'SHA256SUMS.txt') -Encoding ascii
Write-Host "Created unsigned MSIX: $timerMsix"
if ($LocalIdentity) { Write-Warning 'Local validation identity only: not for Store submission or normal installation.' }
