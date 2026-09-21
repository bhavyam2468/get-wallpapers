# wallgrab installer — Windows (PowerShell 5.1+ / PowerShell 7+)
#
#   irm https://raw.githubusercontent.com/bhavyam2468/get-wallpapers/main/install.ps1 | iex
#
# Installs to %LOCALAPPDATA%\Programs\wallgrab and puts it on your user PATH.

$ErrorActionPreference = 'Stop'

$Raw    = 'https://raw.githubusercontent.com/bhavyam2468/get-wallpapers/main/wallgrab.mjs'
$Dir    = Join-Path $env:LOCALAPPDATA 'Programs\wallgrab'
$Target = Join-Path $Dir 'wallgrab.mjs'
$Shim   = Join-Path $Dir 'wallgrab.cmd'

function Say($m)  { Write-Host "`u{25b8} $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "`u{2713} $m" -ForegroundColor Green }
function Die($m)  { Write-Host " x $m" -ForegroundColor White -BackgroundColor Red; exit 1 }

# ── node ────────────────────────────────────────────────────────────────
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Die @"
Node.js is required (18 or newer). Install it first:

    winget install OpenJS.NodeJS.LTS

then reopen this terminal.
"@
}
$major = [int](& node -p 'process.versions.node.split(".")[0]')
if ($major -lt 18) { Die "Node $major is too old — wallgrab needs 18 or newer." }
Ok "Node $(& node -v)"

# ── install ─────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $Dir | Out-Null

Say 'downloading wallgrab.mjs'
try {
  Invoke-WebRequest -Uri $Raw -OutFile $Target -UseBasicParsing
} catch {
  Die "download failed — is the repo public? ($($_.Exception.Message))"
}

$head = Get-Content $Target -TotalCount 3 -Raw
if ($head -match '<!doctype|<html|404: Not Found') {
  Die 'got HTML instead of the script — the repo may not be pushed yet'
}
Ok "installed -> $Target"

# ── shim so `wallgrab` works from cmd and PowerShell ────────────────────
@"
@echo off
node "$Target" %*
"@ | Set-Content -Path $Shim -Encoding ASCII
Ok "shim -> $Shim"

# ── PATH ────────────────────────────────────────────────────────────────
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($userPath -notlike "*$Dir*") {
  [Environment]::SetEnvironmentVariable('Path', "$userPath;$Dir", 'User')
  $env:Path = "$env:Path;$Dir"
  Ok "added to your user PATH (reopen the terminal to pick it up)"
} else {
  Ok 'already on your PATH'
}

Write-Host ''
Write-Host '  wallgrab            ' -ForegroundColor Yellow -NoNewline; Write-Host 'launch the editor'
Write-Host '  wallgrab --sources  ' -ForegroundColor Yellow -NoNewline; Write-Host 'list all 11 sources'
Write-Host '  wallgrab --help     ' -ForegroundColor Yellow -NoNewline; Write-Host 'every flag'
Write-Host ''
Write-Host '  try it now: ' -NoNewline; Write-Host 'wallgrab --source picsum --count 20 --yes' -ForegroundColor DarkGray
Write-Host ''
