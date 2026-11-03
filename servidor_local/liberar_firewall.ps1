# Libera a porta do Smart Report no Firewall do Windows, só para redes PRIVADAS (rede do escritório).
# Sem isso, este computador abre o sistema, mas os outros da rede não conseguem acessar.
# COMO USAR: clique com o botão direito neste arquivo -> "Executar com o PowerShell" e aceite o aviso de administrador.
param([int]$Porta = 5001)

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Porta $Porta"
    exit
}
$nome = "Smart Report (porta $Porta)"
if (Get-NetFirewallRule -DisplayName $nome -ErrorAction SilentlyContinue) {
    Write-Host "A regra '$nome' já existe."
} else {
    New-NetFirewallRule -DisplayName $nome -Direction Inbound -Protocol TCP -LocalPort $Porta -Action Allow -Profile Private | Out-Null
    Write-Host "Regra criada: '$nome' (entrada TCP $Porta, somente rede privada)."
}
Write-Host "Se o Windows classificou a rede do escritório como 'Pública', mude para 'Privada' em Configurações > Rede."
Read-Host "Pressione Enter para fechar"
