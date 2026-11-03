# Servidor local do Smart Report (no lugar do Render)

Roda o mesmo aplicativo em um computador do escritório, com o **waitress** (servidor de produção para Windows) no lugar do gunicorn do Render. Os dados ficam em `C:\SmartReportDados`.

## Estado atual: TESTE
- O **Render continua no ar** e é o sistema oficial. O servidor local é uma cópia para testar.
- A cópia dos dados foi feita em 03/11/2026. Depois disso, **local e Render passam a divergir** (cada um grava só no seu).
- Por segurança, o servidor de teste roda com `OMIE_SOMENTE_LEITURA=1`: **nada é gravado no Omie** (enviar OS, baixa de estoque, troca de etapa ficam bloqueados com a mensagem "Servidor de teste: gravação no Omie bloqueada"). Leituras (catálogo, saldo, OS) funcionam normalmente.
- A baixa de estoque (Consumo interno) foi copiada em **modo simulação**.

## Como usar
| O que fazer | Como |
|---|---|
| Iniciar | duplo clique em `iniciar_servidor.bat` (deixe a janela aberta) |
| Acessar neste PC | http://localhost:5001 |
| Acessar de outro computador/celular da mesma rede | http://IP-DESTE-PC:5001 (o IP do Wi-Fi/cabo; hoje: `192.168.4.60`) |
| Parar | Ctrl+C na janela (ou feche-a) |
| Ver o que aconteceu | `C:\SmartReportDados\logs\servidor.log` |

Entre com o **seu usuário e senha de sempre** (as senhas foram copiadas). Todos precisam fazer login de novo (as sessões não vêm).

### Liberar o acesso de outros computadores (uma vez)
Clique com o botão direito em `liberar_firewall.ps1` → *Executar com o PowerShell* e aceite o aviso. Ele libera a porta 5001 **só para redes privadas**. A rede do escritório precisa estar como "Privada" (Configurações → Rede).

### Iniciar sozinho ao ligar o PC (opcional)
Botão direito em `instalar_inicio_automatico.ps1` → *Executar com o PowerShell*. Para remover: `instalar_inicio_automatico.ps1 -Remover`.
Neste notebook, em *Opções de energia*, coloque "Suspender: Nunca" quando ligado na tomada, senão o sistema cai quando ele dormir.

## Roteiro de teste sugerido
1. Entrar com seu usuário e conferir OS, laudos, painel e requisições.
2. Abrir de um celular/outro PC pelo IP (testa firewall e rede).
3. Criar/editar OS, preencher laudo, anexar foto de teste, mover cartão do painel.
4. Consumo interno: registrar (fica simulado) e conferir que nada vai ao Omie.
5. Deixar uns dias rodando e comparar a velocidade com o Render.

## Diferenças em relação ao Render
- **Sem HTTPS**: acesso por `http://` dentro da rede (suficiente para o escritório; a câmera/anexos funcionam).
- **Uma requisição por vez** (`threads=1`), igual ao Render, porque os dados ficam em um arquivo JSON. Consultas lentas ao Omie seguram a fila.
- **Só funciona com o computador ligado e na rede**. Se ele dormir ou desligar, o Smart cai para todos.
- **Webhook do Omie** (status de OS em tempo real) precisa de endereço público; na rede interna ele **não chega**. Ver "Virada".
- **Não vieram do Render**: anexos de teste (fotos/vídeos), arquivos de laudo/PDF e as chaves de API do robô.

## Virada definitiva (quando aprovar) — checklist
1. **Escolher o PC definitivo** (ligado 24h), instalar Python 3.12, copiar o projeto, criar o `.venv` e instalar `requirements.txt` + `servidor_local\requirements_local.txt`.
2. **IP fixo**: reservar o IP do PC no roteador (ou usar o nome do computador), para o endereço não mudar.
3. **Cópia final dos dados**: avisar a equipe, parar de usar o Render, e refazer a cópia (`copiar_dados_render.py --sobrescrever`). Pendências dessa cópia: anexos de teste e arquivos de laudo (precisam de um export completo do Render) e as chaves de API.
4. **Remover** `OMIE_SOMENTE_LEITURA=1` do `config.env` (liga a gravação no Omie) e conferir a configuração da baixa de estoque (Requisições → Consumo interno → Configuração).
5. **Robô de faturamento** (`omie_faturar`): apontar `SR_BASE` para o novo endereço e **gerar uma nova chave de API** no servidor local.
6. **Webhook do Omie**: se for usado, trocar a URL no portal do desenvolvedor (precisa de endereço acessível pela internet, ex.: túnel).
7. **Backup**: agendar `backup_local.bat` (cópia da pasta de dados para outro disco/nuvem). O Smart já guarda 14 backups diários do JSON na pasta `backups`, mas isso **não protege contra falha do disco**.
8. Deixar o Render **desligado só depois** de alguns dias estáveis. Para voltar atrás, basta religar o Render (e apontar o robô de volta).

## Atualizar o sistema local
Quando houver versão nova: `git pull` na pasta do projeto e reiniciar o servidor.

---

## Mudar o servidor para outro PC (instalador)
O instalador `SmartReport-Setup-<versão>.exe` leva o Python e as bibliotecas dentro dele (não precisa de internet nem de Python no PC novo).

**No computador ANTIGO (o que roda o servidor hoje)**
1. Menu Iniciar → *Biodron Smart Report* → **Gerar backup para mudança de PC** (ou `servidor_local\exportar_para_mudanca.bat`).
   Gera `SmartReport-Dados-AAAAMMDD_HHMM.zip` na Área de Trabalho: dados, anexos, laudos, chave do robô e as chaves do config.env.
   **O ZIP tem segredos** (Omie, senhas): guarde como senha e apague depois.
2. Pare de usar o sistema (o que for gravado depois do backup não vai para o PC novo).

**No computador NOVO**
1. Rode `SmartReport-Setup-<versão>.exe` (pede administrador uma vez). O Windows pode avisar "editor desconhecido" (o instalador não é assinado): *Mais informações → Executar assim mesmo*.
2. Siga o assistente: pasta do programa, **pasta dos dados** (padrão `C:\SmartReportDados`), **porta** (padrão 5001) e, no passo *Restaurar dados*, escolha o ZIP do backup.
3. Deixe marcadas as opções **iniciar com o Windows** (roda mesmo sem ninguém logado) e **liberar o Firewall** (redes privadas).
4. Pronto: o servidor sobe sozinho. Acesse `http://IP-DO-PC-NOVO:5001`.

**Depois de trocar (checklist)**
- Reservar o IP do PC novo no roteador (ou lembrar de trocar o endereço da TV, dos celulares e dos atalhos).
- Robô de faturamento (`omie_faturar`): apontar `SR_BASE` para o endereço novo (a chave de API do robô veio no backup).
- Opções de energia do PC novo: "Suspender: Nunca" na tomada.
- Desligar o servidor do PC antigo (menu Iniciar → *Parar servidor*, e remover a tarefa `SmartReportServidorLocal`, se existir).
- Se o PC novo estiver numa rede onde alguém usa Chrome no Android e der erro, veja a seção de acesso por celular acima.

**Instalar sem o assistente (silencioso):**
`SmartReport-Setup-1.0.0.exe /VERYSILENT /SUPPRESSMSGBOXES /DADOS="D:\SmartReportDados" /PORTA=5001 /BACKUP="C:\...\SmartReport-Dados.zip"`
(`/NAOINICIAR=1` instala sem ligar o servidor.)

**Atualizar versão:** rode o instalador novo por cima. A configuração e os dados são mantidos; ele não pergunta de novo.
**Desinstalar:** Configurações do Windows → Aplicativos. Os **dados não são apagados** (ficam na pasta de dados).

**Gerar o instalador** (neste projeto): `powershell -ExecutionPolicy Bypass -File instalador\montar.ps1 -Versao 1.0.0`
(precisa do `.venv` do projeto e do Inno Setup 6; o resultado sai em `instalador\saida\`).
