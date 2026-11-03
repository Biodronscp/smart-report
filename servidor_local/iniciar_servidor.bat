@echo off
rem Inicia o servidor local do Smart Report. Deixe esta janela aberta enquanto o sistema estiver em uso.
chcp 65001 >nul
cd /d "%~dp0.."
if not exist "servidor_local\config.env" (
    echo Criando servidor_local\config.env a partir do exemplo...
    copy "servidor_local\config.exemplo.env" "servidor_local\config.env" >nul
)
".venv\Scripts\python.exe" servidor_local\servidor.py
echo.
echo O servidor parou. Pressione uma tecla para fechar.
pause >nul
