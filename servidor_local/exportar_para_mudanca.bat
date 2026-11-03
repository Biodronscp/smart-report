@echo off
rem Gera o backup completo (dados + anexos + chaves) para levar a outro computador. O ZIP vai para a Area de Trabalho.
chcp 65001 >nul
set PY=%~dp0..\python\python.exe
if not exist "%PY%" set PY=%~dp0..\.venv\Scripts\python.exe
"%PY%" "%~dp0exportar_dados.py"
echo.
pause
