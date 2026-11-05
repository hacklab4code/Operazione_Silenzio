@echo off
setlocal
set "PYTHONUTF8=1"
set "PYTHONUNBUFFERED=1"
pushd "%~dp0"
if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" -c "import sys; sys.exit(sys.version_info < (3, 11, 5))" >nul 2>nul
  if not errorlevel 1 (
    "%~dp0.venv\Scripts\python.exe" "%~dp0avvia.py" %*
    if errorlevel 1 goto errore
    popd
    exit /b 0
  )
)
for %%V in (3.12 3.13 3.11 3.14 3) do (
  py -%%V -c "import sys; sys.exit(sys.version_info < (3, 11, 5))" >nul 2>nul
  if not errorlevel 1 (
    py -%%V "%~dp0avvia.py" %*
    if errorlevel 1 goto errore
    popd
    exit /b 0
  )
)
python -c "import sys; sys.exit(sys.version_info < (3, 11, 5))" >nul 2>nul
if errorlevel 1 goto manca_python
python "%~dp0avvia.py" %*
if errorlevel 1 goto errore
popd
exit /b 0
:manca_python
echo Serve Python 3.11.5 o successivo. Installa Python 3.12 da python.org.
echo Durante l'installazione seleziona "Add python.exe to PATH".
:errore
echo.
echo Avvio non riuscito. Leggi il messaggio sopra o logs\backend.log.
pause
popd
exit /b 1
