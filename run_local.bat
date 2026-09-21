@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo 尚未初始化本地测试环境。
  echo 正在启动 setup_local.bat...
  call setup_local.bat
  if errorlevel 1 exit /b 1
)

echo 启动配料表日期生成器（本地测试版）...
".venv\Scripts\python.exe" app.py
