@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo   配料表日期生成器 - 本地测试环境安装
echo ========================================
echo.

where py >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Python 启动器 py。
  echo 请先安装 Python 3.10 或更高版本，并勾选 Add Python to PATH。
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/3] 创建虚拟环境...
  py -m venv .venv
  if errorlevel 1 goto :error
) else (
  echo [1/3] 虚拟环境已存在，跳过创建。
)

echo [2/3] 升级 pip...
".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto :error

echo [3/3] 安装项目依赖...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :error

echo.
echo 安装完成。
echo 以后双击 run_local.bat 即可直接测试，不需要打包 EXE。
pause
exit /b 0

:error
echo.
echo 安装失败，请检查上面的错误信息。
pause
exit /b 1
