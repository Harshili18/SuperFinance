$root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; if (Test-Path .venv\Scripts\Activate.ps1) { .\.venv\Scripts\Activate.ps1 }; python -m uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"
Write-Host "API http://127.0.0.1:8000/api/docs  UI http://localhost:5173"
