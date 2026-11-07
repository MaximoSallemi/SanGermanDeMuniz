@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 22.16 o superior para iniciar la aplicacion.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Preparando dependencias por primera vez. Este paso requiere Internet.
  call npm.cmd ci --no-fund --no-audit
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Preparando San German de Muniz...
call npm.cmd run build
if errorlevel 1 (
  pause
  exit /b 1
)
echo Mantene esta ventana abierta mientras uses la aplicacion.
node scripts/launch.mjs
pause
