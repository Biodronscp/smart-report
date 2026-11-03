"""Copia os dados do Smart que está no Render para este servidor local (para TESTE).

Só LÊ do Render (usa o backup completo que o administrador pode exportar). Não altera nada lá.
Uso:   .venv\\Scripts\\python.exe servidor_local\\copiar_dados_render.py [--token SEU_TOKEN] [--sobrescrever]

O token é de um usuário ADMINISTRADOR do Smart (variável SR_TOKEN, --token, ou o arquivo informado em --arquivo-token).
O que vem: usuários (com as mesmas senhas), OS, laudos, painel, requisições, filiais e configurações.
O que NÃO vem: sessões de login (todos entram de novo), chaves de API do robô, anexos de teste (fotos/vídeos) e arquivos de laudo.
A baixa de estoque do Omie é copiada em MODO SIMULAÇÃO, por segurança.
"""
import os
import sys
import json
import argparse
import urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)


def carregar_config(caminho):
    if os.path.isfile(caminho):
        with open(caminho, encoding='utf-8-sig') as f:
            for linha in f:
                linha = linha.strip()
                if linha and not linha.startswith('#') and '=' in linha:
                    k, _, v = linha.partition('=')
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def baixar(url, token):
    req = urllib.request.Request(url, headers={'Authorization': token})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--origem', default='https://smart-report-fnfo.onrender.com')
    ap.add_argument('--token', default=os.environ.get('SR_TOKEN', ''))
    ap.add_argument('--arquivo-token', default='')
    ap.add_argument('--sobrescrever', action='store_true', help='substitui os dados locais que já existirem')
    a = ap.parse_args()

    token = a.token
    if not token and a.arquivo_token and os.path.isfile(a.arquivo_token):
        token = open(a.arquivo_token, encoding='utf-8').read().strip()
    if not token:
        sys.exit('Informe o token de um administrador: --token XXXX (ou variável SR_TOKEN, ou --arquivo-token caminho).')

    carregar_config(os.path.join(AQUI, 'config.env'))
    pasta = os.environ.setdefault('PASTA_DADOS', r'C:\SmartReportDados')
    os.makedirs(pasta, exist_ok=True)
    os.environ.setdefault('DATA_FILE', os.path.join(pasta, 'bateria_data.json'))
    destino = os.environ['DATA_FILE']
    if os.path.exists(destino) and not a.sobrescrever:
        sys.exit(f'Já existem dados locais em {destino}.\nUse --sobrescrever para trocá-los pela cópia do Render (os atuais viram backup .antes).')
    if os.path.exists(destino):
        os.replace(destino, destino + '.antes')

    print(f'Baixando o backup de {a.origem} ...')
    exp = baixar(a.origem + '/api/export-config', token)
    try:
        cfg_estoque = baixar(a.origem + '/api/estoque/config', token)
    except Exception:
        cfg_estoque = {}

    sys.path.insert(0, RAIZ)
    import smart_report as sr   # lê DATA_FILE ao ser importado
    fd = sr.load_data()
    for k in ('globalConfig', 'users', 'laudos', 'userStates', 'filiais', 'painel', 'requisicoes'):
        if k in exp:
            fd[k] = exp[k]
    fd['reqSeq'] = exp.get('reqSeq', fd.get('reqSeq', 0))
    fd['sessions'] = {}        # todos fazem login de novo
    fd['apiTokens'] = {}       # chaves do robô não vêm (crie uma nova no servidor local, se for usar o robô)
    if cfg_estoque.get('codigoLocal'):
        fd['estoqueConsumoCfg'] = {'matriz': {'codigoLocal': cfg_estoque.get('codigoLocal'), 'motivo': cfg_estoque.get('motivo', ''), 'simular': True}}
    sr.save_data(fd)

    n_os = sum(len((s or {}).get('osDrafts') or []) for s in (fd.get('userStates') or {}).values())
    n_laudos = sum(len(m or {}) for m in (fd.get('laudos') or {}).values())
    print('Pronto! Dados gravados em:', destino)
    print(f'  usuários: {len(fd["users"])} | OS: {n_os} | laudos: {n_laudos} | requisições: {len(fd.get("requisicoes") or [])} | cartões do painel: {len(((fd.get("painel") or {}).get("ordens")) or [])}')
    print('  Baixa de estoque do Omie: SIMULAÇÃO (por segurança).')


if __name__ == '__main__':
    main()
