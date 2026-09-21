@echo off
setlocal
cd /d "%~dp0"

echo [1/3] Installing dependencies...
py -m pip install -r requirements.txt
if errorlevel 1 goto :error

echo [2/3] Installing PyInstaller...
py -m pip install pyinstaller
if errorlevel 1 goto :error

echo [3/3] Building Windows EXE...
py -m PyInstaller --noconfirm --clean --onefile --windowed --name "配料表日期生成器" app.py
if errorlevel 1 goto :error

echo.
echo Build complete:
echo %CD%\dist\配料表日期生成器.exe
pause
exit /b 0

:error
echo.
echo Build failed. Please check the messages above.
pause
exit /b 1
