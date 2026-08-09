@echo off
setlocal
title Iniciar Financo

set "PORT=3002"
set "APP_DIR=%~dp0"
set "APP_URL=http://127.0.0.1:%PORT%/dashboard"

cd /d "%APP_DIR%"

echo Encerrando instancias antigas do Financo...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$app = [Regex]::Escape('%APP_DIR%'); Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match $app -and $_.CommandLine -match 'next' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

echo Iniciando servidor do Financo na porta %PORT%...
start "Financo Dev" /D "%APP_DIR%" npm.cmd run dev -- --port %PORT%

echo Aguardando o servidor iniciar...
timeout /t 10 /nobreak >nul

echo Abrindo %APP_URL%...
start "" "%APP_URL%"

echo.
echo Se o navegador nao abrir, acesse manualmente:
echo %APP_URL%
echo.
pause
endlocal
