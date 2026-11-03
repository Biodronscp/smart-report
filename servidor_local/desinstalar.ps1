# Remove o que o instalador criou FORA da pasta do programa: tarefa de inicialização, regra de firewall e o servidor em
# execução. Os DADOS (pasta de dados) NÃO são apagados. Chamado pelo desinstalador do Windows.
param([Parameter(Mandatory = $true)][string]$Raiz)
$ErrorActionPreference = "SilentlyContinue"
# porta desta instalação (para apagar só a regra de firewall dela)
$porta = "5001"
$cfg = Join-Path $Raiz "servidor_local\config.env"
if (Test-Path $cfg) { Get-Content $cfg | ForEach-Object { if ($_ -match '^\s*PORT\s*=\s*(\d+)') { $porta = $Matches[1] } } }
Stop-ScheduledTask -TaskName "SmartReportServidor"
Unregister-ScheduledTask -TaskName "SmartReportServidor" -Confirm:$false
# encerra qualquer servidor DESTE programa que ainda esteja rodando
Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($Raiz, [StringComparison]::OrdinalIgnoreCase) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-NetFirewallRule -DisplayName "Smart Report (porta $porta)" | Remove-NetFirewallRule
