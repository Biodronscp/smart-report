@echo off
rem Copia a pasta de dados do Smart (dados, laudos, anexos de teste, backups diários) para outro lugar.
rem Uso:  backup_local.bat  D:\Backups\SmartReport        (se não informar o destino, usa D:\Backups\SmartReport)
chcp 65001 >nul
set ORIGEM=C:\SmartReportDados
set DESTINO=%~1
if "%DESTINO%"=="" set DESTINO=D:\Backups\SmartReport
if not exist "%ORIGEM%" ( echo Pasta de dados nao encontrada: %ORIGEM% & exit /b 1 )
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set CARIMBO=%%d
robocopy "%ORIGEM%" "%DESTINO%\%CARIMBO%" /E /R:1 /W:1 /XD logs /NFL /NDL /NJH /NJS
echo.
echo Backup salvo em: %DESTINO%\%CARIMBO%
