"""Traz TUDO do Smart que está no Render para este servidor local: dados, anexos de teste, PDFs/fotos de laudo,
chaves de API do robô e as chaves de ambiente (Gemini/Omie/webhook).

Uso (com o servidor local PARADO):
  .venv\\Scripts\\python.exe servidor_local\\migrar_do_render.py --arquivo-token CAMINHO_DO_TOKEN [--modo-real]

--token / --arquivo-token : token de um usuário ADMINISTRADOR do Smart (a chave de API do robô serve).
--zip ARQUIVO             : restaura de um snapshot já baixado (não baixa de novo).
--modo-real               : REMOVE a trava OMIE_SOMENTE_LEITURA do config.env (liga a gravação no Omie). Sem isto, a trava fica.
--sem-env                 : não traz as chaves de ambiente (Gemini/Omie/webhook).

O que já existia na pasta de dados vai para PASTA_DADOS\\_antes_AAAAMMDD_HHMMSS (nada é apagado).
O snapshot baixado fica em PASTA_DADOS\\snapshots (contém segredos: guarde como senha).
"""
import os
import sys
import json
import shutil
import socket
import zipfile
import argparse
import datetime
import urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
PASTAS = ('laudo_assets', 'laudos_pdf', 'testes_midia')


def ler_config(caminho):
    cfg = {}
    if os.path.isfile(caminho):
        with open(caminho, encoding='utf-8-sig') as f:
            for linha in f:
                l = linha.strip()
                if l and not l.startswith('#') and '=' in l:
                    k, _, v = l.partition('=')
                    cfg[k.strip()] = v.strip().strip('"').strip("'")
    return cfg


def atualizar_config(caminho, novos, remover=()):
    """Atualiza/insere CHAVE=VALOR preservando comentários e a ordem das demais linhas."""
    linhas = open(caminho, encoding='utf-8-sig').read().splitlines() if os.path.isfile(caminho) else []
    vistos = set()
    saida = []
    for l in linhas:
        k = l.split('=', 1)[0].strip() if ('=' in l and not l.strip().startswith('#')) else None
        if k in remover:
            continue
        if k in novos:
            saida.append(f'{k}={novos[k]}')
            vistos.add(k)
        else:
            saida.append(l)
    for k, v in novos.items():
        if k not in vistos:
            saida.append(f'{k}={v}')
    with open(caminho, 'w', encoding='utf-8') as f:
        f.write('\n'.join(saida) + '\n')


def servidor_rodando(porta):
    s = socket.socket()
    s.settimeout(1)
    try:
        return s.connect_ex(('127.0.0.1', porta)) == 0
    finally:
        s.close()


def baixar(url, token, destino):
    req = urllib.request.Request(url, headers={'Authorization': token})
    total = 0
    with urllib.request.urlopen(req, timeout=600) as r, open(destino, 'wb') as f:
        while True:
            bloco = r.read(1024 * 1024)
            if not bloco:
                break
            f.write(bloco)
            total += len(bloco)
            print(f'\r  baixando... {total / 1048576:.1f} MB', end='', flush=True)
    print()
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--origem', default='https://smart-report-fnfo.onrender.com')
    ap.add_argument('--token', default=os.environ.get('SR_TOKEN', ''))
    ap.add_argument('--arquivo-token', default='')
    ap.add_argument('--zip', default='')
    ap.add_argument('--modo-real', action='store_true')
    ap.add_argument('--sem-env', action='store_true')
    ap.add_argument('--forcar', action='store_true', help='restaura mesmo com o servidor local ligado (não recomendado)')
    a = ap.parse_args()

    caminho_cfg = os.path.join(AQUI, 'config.env')
    if not os.path.isfile(caminho_cfg):
        shutil.copyfile(os.path.join(AQUI, 'config.exemplo.env'), caminho_cfg)
    cfg = ler_config(caminho_cfg)
    pasta = os.environ.get('PASTA_DADOS') or cfg.get('PASTA_DADOS') or r'C:\SmartReportDados'
    porta = int(cfg.get('PORT', '5001'))
    if servidor_rodando(porta) and not a.forcar:
        sys.exit(f'O servidor local está ligado na porta {porta}. Pare-o antes (feche a janela ou encerre o processo) e rode de novo.')
    os.makedirs(os.path.join(pasta, 'snapshots'), exist_ok=True)

    zip_path = a.zip
    if not zip_path:
        token = a.token
        if not token and a.arquivo_token and os.path.isfile(a.arquivo_token):
            token = open(a.arquivo_token, encoding='utf-8').read().strip()
        if not token:
            sys.exit('Informe o token de um administrador: --token XXXX ou --arquivo-token caminho.')
        zip_path = os.path.join(pasta, 'snapshots', 'snapshot_' + datetime.datetime.now().strftime('%Y%m%d_%H%M%S') + '.zip')
        print(f'Baixando o snapshot completo de {a.origem} ...')
        baixar(a.origem.rstrip('/') + '/api/admin/snapshot' + ('' if a.sem_env else '?env=1'), token, zip_path)

    z = zipfile.ZipFile(zip_path)
    if z.testzip() is not None:
        sys.exit('O arquivo ZIP está corrompido. Baixe de novo.')
    nomes = z.namelist()
    if 'bateria_data.json' not in nomes:
        sys.exit('ZIP inválido: não tem bateria_data.json.')
    meta = json.loads(z.read('meta.json')) if 'meta.json' in nomes else {}
    print(f'Snapshot de {meta.get("geradoEm", "?")}: {len(nomes)} arquivos.')

    # 1) guarda o que existe hoje (nada é apagado)
    carimbo = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    guardar = os.path.join(pasta, '_antes_' + carimbo)
    movidos = []
    for nome in ('bateria_data.json',) + PASTAS:
        origem = os.path.join(pasta, nome)
        if os.path.exists(origem):
            os.makedirs(guardar, exist_ok=True)
            shutil.move(origem, os.path.join(guardar, nome))
            movidos.append(nome)
    if movidos:
        print(f'  Dados anteriores guardados em {guardar}')

    # 2) extrai só o que é esperado (sem caminhos fora da pasta)
    n_arq = 0
    for nome in nomes:
        if nome == 'meta.json' or nome.endswith('/'):
            continue
        topo = nome.split('/')[0]
        if nome != 'bateria_data.json' and topo not in PASTAS:
            continue
        destino = os.path.normpath(os.path.join(pasta, nome))
        if not destino.startswith(os.path.normpath(pasta) + os.sep):
            continue
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        with z.open(nome) as src, open(destino, 'wb') as dst:
            shutil.copyfileobj(src, dst)
        n_arq += 1
    print(f'  {n_arq} arquivos restaurados em {pasta}')

    # 3) chaves de ambiente -> config.env (sem mostrar os valores)
    env = meta.get('env') or {}
    if env:
        atualizar_config(caminho_cfg, env)
        print('  Chaves copiadas para o config.env: ' + ', '.join(sorted(env)))
    elif not a.sem_env:
        print('  (o snapshot não trouxe chaves de ambiente)')
    if a.modo_real:
        atualizar_config(caminho_cfg, {}, remover=('OMIE_SOMENTE_LEITURA',))
        print('  MODO REAL: trava OMIE_SOMENTE_LEITURA removida (o servidor grava no Omie).')

    dados = json.load(open(os.path.join(pasta, 'bateria_data.json'), encoding='utf-8'))
    n_os = sum(len((x or {}).get('osDrafts') or []) for x in (dados.get('userStates') or {}).values())
    print('\nPronto. Resumo:')
    print(f'  usuários {len(dados.get("users") or {})} | OS {n_os} | laudos {sum(len(m or {}) for m in (dados.get("laudos") or {}).values())} '
          f'| requisições {len(dados.get("requisicoes") or [])} | cartões do painel {len((dados.get("painel") or {}).get("ordens") or {})} '
          f'| chaves de API {len(dados.get("apiTokens") or {})}')
    sim = ((dados.get('estoqueConsumoCfg') or {}).get('matriz') or {}).get('simular')
    print(f'  baixa de estoque do Omie: {"SIMULAÇÃO" if sim is not False else "REAL (ligada)"}')
    print(f'  trava de teste no Omie: {"LIGADA (só leitura)" if ler_config(caminho_cfg).get("OMIE_SOMENTE_LEITURA") == "1" else "desligada (grava no Omie)"}')


if __name__ == '__main__':
    main()
