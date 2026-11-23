$root = Split-Path -Parent $PSScriptRoot
$env:Path = "$root\.tools\node;C:\Users\gadah\.local\bin;$env:Path"

$api = Start-Process powershell -PassThru -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$root\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
)
$web = Start-Process powershell -PassThru -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$root\frontend'; npm run dev"
)

Write-Host "SUPERFINANCE"
Write-Host "  UI  http://localhost:5173"
Write-Host "  API http://127.0.0.1:8000/api/docs"
Write-Host "  Login 9876543210 / OTP 424242"
Write-Host "PIDs api=$($api.Id) web=$($web.Id)"
