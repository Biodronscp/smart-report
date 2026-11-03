; Instalador do servidor do Biodron Smart Report. Compile com instalador\montar.ps1 (monta a pasta _staging e roda o ISCC).
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{B7D0F6E2-5A1C-4F0B-9C2E-5D3A7E1B9C44}
AppName=Biodron Smart Report (servidor)
AppVersion={#AppVersion}
AppPublisher=Biodron
DefaultDirName={autopf}\SmartReport
DefaultGroupName=Biodron Smart Report
DisableProgramGroupPage=yes
OutputDir=saida
OutputBaseFilename=SmartReport-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog commandline
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName=Biodron Smart Report (servidor)
VersionInfoVersion={#AppVersion}
SetupLogging=yes
CloseApplications=no

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "inicio"; Description: "Iniciar o servidor automaticamente com o Windows (mesmo sem ninguém logado)"; GroupDescription: "Servidor:"; Check: IsAdminInstallMode
Name: "firewall"; Description: "Liberar a porta no Firewall do Windows (somente redes privadas)"; GroupDescription: "Servidor:"; Check: IsAdminInstallMode
Name: "desktopicon"; Description: "Criar um atalho na Área de Trabalho"; GroupDescription: "Atalhos:"; Flags: unchecked

[Files]
Source: "_staging\python\*"; DestDir: "{app}\python"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "_staging\app\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\Abrir Smart Report"; Filename: "{sys}\cmd.exe"; Parameters: "/c start """" ""http://localhost:{code:GetPorta}"""; IconFilename: "{app}\python\pythonw.exe"
Name: "{group}\Ver o registro (log)"; Filename: "{win}\notepad.exe"; Parameters: """{code:GetDados}\logs\servidor.log"""
Name: "{group}\Iniciar servidor"; Filename: "{app}\servidor_local\iniciar_servico.bat"
Name: "{group}\Parar servidor"; Filename: "{app}\servidor_local\parar_servidor.bat"
Name: "{group}\Gerar backup para mudança de PC"; Filename: "{app}\servidor_local\exportar_para_mudanca.bat"
Name: "{group}\Desinstalar"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Smart Report"; Filename: "{sys}\cmd.exe"; Parameters: "/c start """" ""http://localhost:{code:GetPorta}"""; IconFilename: "{app}\python\pythonw.exe"; Tasks: desktopicon

[Run]
Filename: "http://localhost:{code:GetPorta}"; Description: "Abrir o Smart no navegador"; Flags: shellexec postinstall skipifsilent nowait

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\servidor_local\desinstalar.ps1"" -Raiz ""{app}"""; Flags: runhidden; RunOnceId: "RemoverServidor"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  PaginaDados: TInputDirWizardPage;
  PaginaPorta: TInputQueryWizardPage;
  PaginaRestaurar: TInputFileWizardPage;

function ArqConfig: String;
begin
  Result := ExpandConstant('{app}\servidor_local\config.env');
end;

function LerChave(const Chave, Padrao: String): String;
var
  Linhas: TArrayOfString;
  I, P: Integer;
  L: String;
begin
  Result := Padrao;
  if not LoadStringsFromFile(ArqConfig, Linhas) then Exit;
  for I := 0 to GetArrayLength(Linhas) - 1 do
  begin
    L := Trim(Linhas[I]);
    if (L <> '') and (L[1] <> '#') then
    begin
      P := Pos('=', L);
      if (P > 0) and (CompareText(Trim(Copy(L, 1, P - 1)), Chave) = 0) then
      begin
        Result := Trim(Copy(L, P + 1, MaxInt));
        Exit;
      end;
    end;
  end;
end;

{ Instalação nova usa o que foi digitado; atualização por cima mantém o config.env existente }
function GetPorta(Param: String): String;
begin
  if FileExists(ArqConfig) then Result := LerChave('PORT', '5001')
  else Result := PaginaPorta.Values[0];
end;

function GetDados(Param: String): String;
begin
  if FileExists(ArqConfig) then Result := LerChave('PASTA_DADOS', 'C:\SmartReportDados')
  else Result := PaginaDados.Values[0];
end;

procedure InitializeWizard;
begin
  PaginaDados := CreateInputDirPage(wpSelectDir, 'Pasta dos dados',
    'Onde o Smart vai guardar os dados?',
    'Usuários, OS, laudos, anexos de teste e os backups diários ficam nesta pasta. Escolha um lugar fora do Program Files, de preferência em um disco com espaço.',
    False, '');
  PaginaDados.Add('');
  PaginaDados.Values[0] := ExpandConstant('{param:DADOS|C:\SmartReportDados}');     { instalação silenciosa: /DADOS=pasta }

  PaginaPorta := CreateInputQueryPage(PaginaDados.ID, 'Porta do servidor',
    'Em qual porta o servidor vai atender?',
    'As pessoas acessam por http://IP-DO-COMPUTADOR:PORTA. A porta 5001 é a usada hoje; só mude se ela estiver ocupada.');
  PaginaPorta.Add('Porta:', False);
  PaginaPorta.Values[0] := ExpandConstant('{param:PORTA|5001}');                    { /PORTA=5001 }

  PaginaRestaurar := CreateInputFilePage(PaginaPorta.ID, 'Restaurar dados (opcional)',
    'Trazer os dados de outro computador?',
    'Se você está mudando o servidor de PC, escolha o backup (.zip) gerado no computador antigo pelo atalho "Gerar backup para mudança de PC". Deixe em branco para começar vazio.');
  PaginaRestaurar.Add('Arquivo de backup (.zip):', 'Backup do Smart (*.zip)|*.zip|Todos os arquivos (*.*)|*.*', '.zip');
  PaginaRestaurar.Values[0] := ExpandConstant('{param:BACKUP|}');                   { /BACKUP=caminho.zip }
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  { atualização por cima: já existe configuração, não pergunta de novo }
  if (PageID = PaginaDados.ID) or (PageID = PaginaPorta.ID) or (PageID = PaginaRestaurar.ID) then
    Result := FileExists(ArqConfig);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Porta: Integer;
begin
  Result := True;
  if CurPageID = PaginaDados.ID then
  begin
    if Trim(PaginaDados.Values[0]) = '' then
    begin
      MsgBox('Informe a pasta dos dados.', mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = PaginaPorta.ID then
  begin
    Porta := StrToIntDef(Trim(PaginaPorta.Values[0]), 0);
    if (Porta < 1024) or (Porta > 65535) then
    begin
      MsgBox('Informe um número de porta entre 1024 e 65535.', mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = PaginaRestaurar.ID then
  begin
    if (Trim(PaginaRestaurar.Values[0]) <> '') and (not FileExists(PaginaRestaurar.Values[0])) then
    begin
      MsgBox('O arquivo de backup informado não existe.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

{ Antes de copiar os arquivos: para o servidor, se uma versão anterior estiver rodando }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Codigo: Integer;
begin
  Result := '';
  if DirExists(ExpandConstant('{app}\python')) then
    Exec('powershell.exe',
      '-NoProfile -Command "Stop-ScheduledTask -TaskName SmartReportServidor -ErrorAction SilentlyContinue; ' +
      'Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like ''' + ExpandConstant('{app}') + '\python\*'' } | ' +
      'ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"',
      '', SW_HIDE, ewWaitUntilTerminated, Codigo);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Raiz, Dados, Porta, Zip, Config: String;
  Codigo: Integer;
begin
  if CurStep <> ssPostInstall then Exit;
  Raiz := ExpandConstant('{app}');

  { 1) configuração e (opcionalmente) restauração dos dados — só em instalação nova }
  if not FileExists(ArqConfig) then
  begin
    Dados := Trim(PaginaDados.Values[0]);
    Porta := Trim(PaginaPorta.Values[0]);
    ForceDirectories(Dados);
    Config := '# Gerado pelo instalador. Pode editar; reinicie o servidor depois.' + #13#10 +
              'PASTA_DADOS=' + Dados + #13#10 +
              'PORT=' + Porta + #13#10 +
              'MIDIA_MAX_TOTAL_MB=20000' + #13#10;
    SaveStringToFile(ArqConfig, Config, False);
    Zip := Trim(PaginaRestaurar.Values[0]);
    if Zip <> '' then
    begin
      if (not Exec(Raiz + '\python\python.exe',
            '"' + Raiz + '\servidor_local\migrar_do_render.py" --zip "' + Zip + '" --modo-real',
            Raiz, SW_HIDE, ewWaitUntilTerminated, Codigo)) or (Codigo <> 0) then
        MsgBox('Não consegui restaurar o backup (código ' + IntToStr(Codigo) + '). O Smart foi instalado, mas sem os dados. ' +
               'Você pode restaurar depois, com o servidor parado, rodando:' + #13#10 +
               '"' + Raiz + '\python\python.exe" "' + Raiz + '\servidor_local\migrar_do_render.py" --zip "' + Zip + '" --modo-real',
               mbError, MB_OK);
    end;
  end;

  Porta := LerChave('PORT', '5001');

  { 2) firewall, só redes privadas }
  if WizardIsTaskSelected('firewall') then
    Exec(ExpandConstant('{sys}\netsh.exe'),
      'advfirewall firewall add rule name="Smart Report (porta ' + Porta + ')" dir=in action=allow protocol=TCP localport=' + Porta + ' profile=private',
      '', SW_HIDE, ewWaitUntilTerminated, Codigo);

  { 3) início automático com o Windows e liga o servidor agora (/NAOINICIAR=1 não liga o servidor) }
  if WizardIsTaskSelected('inicio') then
    Exec('powershell.exe',
      '-NoProfile -ExecutionPolicy Bypass -File "' + Raiz + '\servidor_local\registrar_tarefa.ps1" -Raiz "' + Raiz + '"',
      '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  if ExpandConstant('{param:NAOINICIAR|0}') <> '1' then
  begin
    if WizardIsTaskSelected('inicio') then
      Exec(ExpandConstant('{sys}\schtasks.exe'), '/Run /TN "SmartReportServidor"', '', SW_HIDE, ewWaitUntilTerminated, Codigo)
    else
      Exec(Raiz + '\python\pythonw.exe', '"' + Raiz + '\servidor_local\servidor.py"', Raiz, SW_HIDE, ewNoWait, Codigo);
  end;
end;
