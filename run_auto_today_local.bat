@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo 尚未初始化本地测试环境。
  call setup_local.bat
  if errorlevel 1 exit /b 1
)

echo 测试自动生成今天的配料表...
".venv\Scripts\python.exe" app.py --auto-today
if errorlevel 1 (
  echo.
  echo 自动生成失败。
  pause
  exit /b 1
)

echo.
echo 自动生成测试完成。
pause
