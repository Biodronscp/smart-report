# Monta e compila o instalador do servidor do Smart Report (SmartReport-Setup-<versão>.exe).
# Uso:  powershell -ExecutionPolicy Bypass -File instalador\montar.ps1 [-Versao 1.0.0]
# Precisa: o .venv do projeto (com as bibliotecas) e o Inno Setup 6 instalado.
param([string]$Versao = "1.0.0")
$ErrorActionPreference = "Stop"
$aqui = $PSScriptRoot
$raiz = Split-Path $aqui -Parent
$venv = Join-Path $raiz ".venv"
$staging = Join-Path $aqui "_staging"
$py = Join-Path $staging "python"
$app = Join-Path $staging "app"

# --- Inno Setup ---
$iscc = @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "Inno Setup 6 não encontrado." }

# --- Python base (de onde o .venv foi criado) ---
$base = ((Get-Content (Join-Path $venv "pyvenv.cfg") | Where-Object { $_ -match '^home' }) -replace 'home\s*=\s*', '').Trim()
if (-not (Test-Path (Join-Path $base "python.exe"))) { throw "Python base não encontrado em $base" }

Write-Host "1/4 Montando o Python enxuto (sem os pacotes de outros projetos)..."
Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $py, $app | Out-Null
foreach ($f in "python.exe", "pythonw.exe", "LICENSE.txt") { Copy-Item (Join-Path $base $f) $py }
Get-ChildItem $base -File -Filter "*.dll" | ForEach-Object { Copy-Item $_.FullName $py }          # python3.dll, python312.dll, vcruntime*
robocopy (Join-Path $base "DLLs") (Join-Path $py "DLLs") /E /NFL /NDL /NJH /NJS /NP | Out-Null
robocopy (Join-Path $base "Lib") (Join-Path $py "Lib") /E /XD site-packages test idlelib tkinter turtledemo lib2to3 __pycache__ ensurepip /NFL /NDL /NJH /NJS /NP | Out-Null

Write-Host "2/4 Copiando só as bibliotecas que o servidor usa..."
$sp = Join-Path $venv "Lib\site-packages"
$spd = Join-Path $py "Lib\site-packages"
New-Item -ItemType Directory -Force $spd | Out-Null
$pacotes = "bcrypt", "blinker", "chardet", "click", "colorama", "flask", "itsdangerous", "jinja2", "markupsafe", "openpyxl", "et_xmlfile", "PIL", "reportlab", "waitress", "werkzeug"
foreach ($p in $pacotes) {
    if (-not (Test-Path (Join-Path $sp $p))) { throw "Pacote ausente no .venv: $p" }
    robocopy (Join-Path $sp $p) (Join-Path $spd $p) /E /XD __pycache__ /NFL /NDL /NJH /NJS /NP | Out-Null
    Get-ChildItem $sp -Directory -Filter "*.dist-info" | Where-Object { ($_.Name -replace '-\d.*$', '') -ieq $p } | ForEach-Object {
        robocopy $_.FullName (Join-Path $spd $_.Name) /E /NFL /NDL /NJH /NJS /NP | Out-Null }
}
Get-ChildItem $spd -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force

Write-Host "3/4 Copiando o aplicativo..."
Copy-Item (Join-Path $raiz "smart_report.py") $app
robocopy (Join-Path $raiz "painel") (Join-Path $app "painel") /E /XD __pycache__ /NFL /NDL /NJH /NJS /NP | Out-Null
robocopy (Join-Path $raiz "servidor_local") (Join-Path $app "servidor_local") /E /XF config.env /XD __pycache__ /NFL /NDL /NJH /NJS /NP | Out-Null

# --- teste do pacote montado: usa SÓ o python montado (-I ignora o Python e as bibliotecas desta máquina) ---
$tmp = Join-Path $env:TEMP ("sr_montagem_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory $tmp | Out-Null
$env:DATA_FILE = Join-Path $tmp "d.json"
$teste = "import sys; sys.path.insert(0, r'$app'); import flask, bcrypt, reportlab, PIL, waitress, werkzeug, openpyxl, smart_report; " +
         "assert r'$staging' in flask.__file__, flask.__file__; print('pacote montado OK, flask em', flask.__file__)"
& (Join-Path $py "python.exe") -I -c $teste
if ($LASTEXITCODE -ne 0) { throw "O pacote montado não importa o servidor." }
Remove-Item Env:DATA_FILE; Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem $staging -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
$mb = (Get-ChildItem $staging -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Host ("   tamanho montado: {0:N0} MB (antes de comprimir)" -f $mb)

Write-Host "4/4 Compilando o instalador..."
& $iscc "/DAppVersion=$Versao" (Join-Path $aqui "SmartReport.iss")
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o instalador." }
$exe = Get-ChildItem (Join-Path $aqui "saida") -Filter "SmartReport-Setup-*.exe" | Sort-Object LastWriteTime | Select-Object -Last 1
Write-Host ("Pronto: {0} ({1:N1} MB)" -f $exe.FullName, ($exe.Length / 1MB))
