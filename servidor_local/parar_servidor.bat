@echo off
rem Para o servidor do Smart Report (e impede o reinício automático até você iniciar de novo).
chcp 65001 >nul
net session >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
for %%I in ("%~dp0..") do set RAIZ=%%~fI
schtasks /End /TN "SmartReportServidor" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '%RAIZ%\python\*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Servidor parado. Para ligar de novo use "Iniciar servidor" no menu Iniciar.
pause
