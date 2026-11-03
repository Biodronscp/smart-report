# Faz o servidor iniciar sozinho quando você entra no Windows (e reiniciar se cair), sem janela.
# COMO USAR: clique com o botão direito -> "Executar com o PowerShell". Para remover: -Remover
# Observação: roda quando o usuário está LOGADO. Para um PC dedicado, deixe o login automático configurado.
param([switch]$Remover)
$tarefa = "SmartReportServidorLocal"
if ($Remover) {
    Unregister-ScheduledTask -TaskName $tarefa -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Início automático removido."; exit
}
$raiz = Split-Path -Parent $PSScriptRoot
$pyw  = Join-Path $raiz ".venv\Scripts\pythonw.exe"
$script = Join-Path $raiz "servidor_local\servidor.py"
if (-not (Test-Path $pyw)) { Write-Host "Não achei $pyw"; exit 1 }
$acao = New-ScheduledTaskAction -Execute $pyw -Argument "`"$script`"" -WorkingDirectory $raiz
$gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$config = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $tarefa -Action $acao -Trigger $gatilho -Settings $config -Description "Servidor local do Biodron Smart Report" -Force | Out-Null
Write-Host "Pronto. O servidor vai iniciar no próximo login. Para iniciar agora: Start-ScheduledTask -TaskName $tarefa"
Write-Host "Os registros ficam em C:\SmartReportDados\logs\servidor.log"
