# Registra a tarefa que inicia o servidor na INICIALIZAÇÃO do Windows (sem precisar de login), como SISTEMA.
# Chamado pelo instalador (administrador). Uso manual: powershell -ExecutionPolicy Bypass -File registrar_tarefa.ps1 -Raiz "C:\Program Files\SmartReport"
param([Parameter(Mandatory = $true)][string]$Raiz)
$tarefa = "SmartReportServidor"
$pyw = Join-Path $Raiz "python\pythonw.exe"
$script = Join-Path $Raiz "servidor_local\servidor.py"
if (-not (Test-Path $pyw)) { Write-Host "Não achei $pyw"; exit 1 }
$acao = New-ScheduledTaskAction -Execute $pyw -Argument "`"$script`"" -WorkingDirectory $Raiz
$gatilho = New-ScheduledTaskTrigger -AtStartup
$gatilho.Delay = "PT30S"      # espera a rede subir
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$config = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $tarefa -Action $acao -Trigger $gatilho -Principal $principal -Settings $config `
    -Description "Servidor do Biodron Smart Report (inicia com o Windows)" -Force | Out-Null
Write-Host "Tarefa '$tarefa' registrada (inicia com o Windows, como SISTEMA)."
