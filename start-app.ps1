param(
  [switch]$NoBrowser,
  [switch]$Dev
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = $PSScriptRoot
$frontendRoot = Join-Path $projectRoot 'frontend'
$venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
$backendUrl = 'http://127.0.0.1:8000'
$frontendUrl = if ($Dev) { 'http://127.0.0.1:5173' } else { $backendUrl }
$logRoot = Join-Path ([IO.Path]::GetTempPath()) 'form-gym-logger'
$backendLog = Join-Path $logRoot 'backend.log'
$backendErrorLog = Join-Path $logRoot 'backend-error.log'
$frontendLog = Join-Path $logRoot 'frontend.log'
$frontendErrorLog = Join-Path $logRoot 'frontend-error.log'
$backendProcess = $null
$frontendProcess = $null

function New-PythonEnvironment {
  Write-Host 'Creating the Python environment (first run only)...' -ForegroundColor Cyan

  if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3.12 -c 'import sys; assert sys.version_info >= (3, 12)' 2>$null
    if ($LASTEXITCODE -eq 0) {
      & py -3.12 -m venv (Join-Path $projectRoot '.venv')
      if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python environment.' }
      return
    }
  }

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    $version = & $python.Source -c 'import sys; print(sys.version_info.major * 100 + sys.version_info.minor)'
    if ([int]$version -ge 312) {
      & $python.Source -m venv (Join-Path $projectRoot '.venv')
      if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python environment.' }
      return
    }
  }

  throw 'Python 3.12 is required. Install it with: winget install Python.Python.3.12'
}

function Wait-ForApp([string]$Url, [Diagnostics.Process]$Process, [string]$Name) {
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($Process.HasExited) {
      throw "$Name stopped during startup."
    }
    try {
      Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1 | Out-Null
      return
    }
    catch {
      Start-Sleep -Milliseconds 500
    }
  }
  throw "$Name did not become ready at $Url."
}

function Stop-ProcessTree([Diagnostics.Process]$Process) {
  if ($null -ne $Process -and -not $Process.HasExited) {
    & taskkill.exe /PID $Process.Id /T /F 2>$null | Out-Null
  }
}

function Get-DatabaseMigrationState {
  $schemaCheck = @'
import sys
from pathlib import Path

sys.path.insert(0, "backend")

from sqlalchemy import create_engine, inspect, text

from app import models  # noqa: F401
from app.config import get_settings
from app.database import Base

database_path = Path(get_settings().database_path)
if not database_path.exists():
    print("unversioned")
    raise SystemExit(0)

engine = create_engine(f"sqlite:///{database_path.resolve().as_posix()}")
inspector = inspect(engine)
actual_tables = set(inspector.get_table_names())
if "alembic_version" not in actual_tables:
    print("unversioned")
    raise SystemExit(0)

with engine.connect() as connection:
    version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()

schema_is_current = all(
    table.name in actual_tables
    and {column.name for column in table.columns}.issubset(
        {column["name"] for column in inspector.get_columns(table.name)}
    )
    for table in Base.metadata.sorted_tables
)

if version == "0001_initial" and schema_is_current:
    print("current-schema-stale-marker")
else:
    print("normal")
'@

  $output = $schemaCheck | & $venvPython -
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the local database.' }
  return ($output | Select-Object -Last 1).Trim()
}

function Invoke-Alembic([string[]]$Arguments) {
  & $venvPython -m alembic @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Could not update the local database.' }
}

Set-Location $projectRoot
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

try {
  if (-not (Test-Path $venvPython)) {
    New-PythonEnvironment
    & $venvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw 'Could not update pip.' }
    & $venvPython -m pip install "${projectRoot}[dev]"
    if ($LASTEXITCODE -ne 0) { throw 'Could not install the backend dependencies.' }
  }

  if (-not (Test-Path (Join-Path $projectRoot '.env'))) {
    Copy-Item (Join-Path $projectRoot '.env.example') (Join-Path $projectRoot '.env')
  }

  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  if (-not (Test-Path (Join-Path $frontendRoot 'node_modules\.bin\vite.cmd'))) {
    Write-Host 'Installing frontend dependencies (first run only)...' -ForegroundColor Cyan
    Push-Location $frontendRoot
    try {
      & $npm install --no-package-lock
      if ($LASTEXITCODE -ne 0) { throw 'Could not install the frontend dependencies.' }
    }
    finally {
      Pop-Location
    }
  }

  Write-Host 'Updating the local database...' -ForegroundColor Cyan
  $migrationState = Get-DatabaseMigrationState
  if ($migrationState -eq 'unversioned') {
    Invoke-Alembic @('upgrade', '0001_initial')
    $migrationState = Get-DatabaseMigrationState
  }
  if ($migrationState -eq 'current-schema-stale-marker') {
    Write-Host 'Repairing a legacy migration marker (workout data is unchanged)...' -ForegroundColor DarkGray
    Invoke-Alembic @('stamp', 'head')
  }
  Invoke-Alembic @('upgrade', 'head')

  Write-Host 'Building the current app for PC and phone...' -ForegroundColor Cyan
  Push-Location $frontendRoot
  try {
    & $npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Could not build the current app.' }
  }
  finally {
    Pop-Location
  }

  Write-Host 'Starting FORM...' -ForegroundColor Cyan
  $backendProcess = Start-Process -FilePath $venvPython `
    -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', '8000') `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $backendLog -RedirectStandardError $backendErrorLog

  if ($Dev) {
    $frontendProcess = Start-Process -FilePath $npm `
      -ArgumentList @('run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort') `
      -WorkingDirectory $frontendRoot -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendErrorLog
  }

  Wait-ForApp $backendUrl $backendProcess 'Backend'
  if ($Dev) { Wait-ForApp $frontendUrl $frontendProcess 'Frontend' }

  Write-Host ''
  Write-Host "FORM is running at $frontendUrl" -ForegroundColor Green
  Write-Host 'Press Ctrl+C here to stop the app.' -ForegroundColor DarkGray
  Write-Host "Logs: $logRoot" -ForegroundColor DarkGray

  if (-not $NoBrowser) {
    Start-Process $frontendUrl
  }

  while (-not $backendProcess.HasExited -and ($null -eq $frontendProcess -or -not $frontendProcess.HasExited)) {
    Start-Sleep -Seconds 1
  }

  throw 'One of the app processes stopped unexpectedly. Check the log folder shown above.'
}
finally {
  Stop-ProcessTree $frontendProcess
  Stop-ProcessTree $backendProcess
  Write-Host 'FORM stopped.' -ForegroundColor DarkGray
}
