# Fails if sensitive paths are tracked or staged. Safe to run before commit/push.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$patterns = @(
  ".env",
  "backend/.env",
  "frontend/.env",
  "*.pem",
  "*.key",
  "credentials.json",
  "backend/*.db",
  "*.db"
)

$bad = @()

# Tracked by git?
$tracked = git ls-files -- .env backend/.env frontend/.env "*.db" "backend/storage/**" 2>$null
if ($tracked) {
  $bad += "TRACKED (must untrack):"
  $bad += $tracked
}

# Staged?
$staged = git diff --cached --name-only
foreach ($f in $staged) {
  $name = $f -replace "\\", "/"
  if ($name -match '(^|/)\.env(\.|$)|\.pem$|\.key$|credentials\.json$|\.db$|^backend/storage/') {
    if ($name -notmatch '\.env\.example$') {
      $bad += "STAGED: $name"
    }
  }
}

# Working tree should not show ignored env as added
$status = git status --porcelain
foreach ($line in $status) {
  if ($line -match '^\?\? .*\.env$' -or $line -match '^\?\? .*\.env\.') {
    if ($line -notmatch '\.env\.example') {
      $bad += "UNTRACKED ENV VISIBLE: $line (check gitignore)"
    }
  }
}

Write-Host "Checking ignore rules…"
foreach ($p in @(".env", "backend/superfinance.db", "frontend/.env")) {
  if (Test-Path $p) {
    $ignored = git check-ignore -q $p; if ($LASTEXITCODE -eq 0) {
      Write-Host "  OK ignored: $p"
    } else {
      $bad += "NOT IGNORED: $p"
    }
  }
}

if ($bad.Count -gt 0) {
  Write-Host ""
  Write-Host "SECRET SAFETY CHECK FAILED:" -ForegroundColor Red
  $bad | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  exit 1
}

Write-Host "Secret safety check passed." -ForegroundColor Green
exit 0
