@echo off
rem Inicia o servidor do Smart Report pela tarefa agendada do instalador (roda em segundo plano, sem janela).
chcp 65001 >nul
net session >nul 2>&1
if errorlevel 1 (
    rem a tarefa roda como Sistema: precisa de administrador para ser acionada. Pede a elevacao e roda de novo.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
schtasks /Run /TN "SmartReportServidor"
if errorlevel 1 (
    echo Nao foi possivel iniciar pela tarefa. Iniciando direto...
    start "" "%~dp0..\python\pythonw.exe" "%~dp0servidor.py"
)
echo Servidor iniciado. Aguarde uns segundos e abra o Smart pelo menu Iniciar.
pause
