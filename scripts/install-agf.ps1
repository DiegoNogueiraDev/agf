# install-agf.ps1 — the Windows installer for agent-graph-flow (agf)
#
# Fetches the fixed-name agf-windows-x64.exe from GitHub Releases, verifies its
# SHA256 checksum, strips the Mark-of-the-Web (Zone.Identifier) so SmartScreen does
# not prompt, and adds the install dir to the USER PATH.
#
# It is deliberately uninvasive: no admin elevation, no machine-wide PATH, no
# browser download prompt, and no telemetry. The only request it makes is the
# download itself. It reaches the project's own release host, which therefore sees
# your IP — as any download would. That host keeps no access log for /releases/
# and stores no record of who installed what.
#
# Usage (ordinary, non-elevated PowerShell):
#   irm https://graph-flow.cloud/install.ps1 | iex
#
# Read it first if you like — that URL is the source, not an opaque blob.
#
# Environment variables (optional):
#   AGF_INSTALL_DIR   install dir (default: $env:LOCALAPPDATA\agf)

$ErrorActionPreference = 'Stop'

$ReleasesBase = if ($env:AGF_RELEASES_BASE) { $env:AGF_RELEASES_BASE } else { 'https://graph-flow.cloud/releases' }
$AssetName = 'agf-windows-x64.exe'
$InstallDir = if ($env:AGF_INSTALL_DIR) { $env:AGF_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'agf' }
$TargetExe = Join-Path $InstallDir 'agf.exe'

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$TmpExe = Join-Path ([System.IO.Path]::GetTempPath()) "agf-windows-x64-$([guid]::NewGuid().ToString('N')).exe"

Write-Host "Downloading $AssetName..."
Invoke-WebRequest -Uri "$ReleasesBase/$AssetName" -OutFile $TmpExe -UseBasicParsing

Write-Host 'Verifying checksum...'
$expectedLine = (Invoke-WebRequest -Uri "$ReleasesBase/$AssetName.sha256" -UseBasicParsing).Content
$expectedHash = ($expectedLine -split '\s+')[0].Trim().ToLowerInvariant()
$actualHash = (Get-FileHash -Path $TmpExe -Algorithm SHA256).Hash.ToLowerInvariant()

if ($actualHash -ne $expectedHash) {
  Write-Error "Checksum mismatch: expected $expectedHash, got $actualHash"
  Remove-Item -Force $TmpExe -ErrorAction SilentlyContinue
  exit 1
}

# Drop the Mark-of-the-Web (Zone.Identifier) so SmartScreen does not prompt.
Unblock-File -Path $TmpExe

Move-Item -Force $TmpExe $TargetExe

# Add the install dir to the user PATH (persisted; no admin needed).
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not ($userPath -split ';' | Where-Object { $_ -eq $InstallDir })) {
  $newPath = if ($userPath) { "$userPath;$InstallDir" } else { $InstallDir }
  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
  $env:Path = "$env:Path;$InstallDir"
}

Write-Host ''
Write-Host "agf installed at $TargetExe"
& $TargetExe --version
exit 0
