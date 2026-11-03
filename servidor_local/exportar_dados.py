"""Gera um ZIP com TUDO do servidor local, para levar a outro computador (mudança de PC) ou guardar como backup completo.

Uso:  python exportar_dados.py [--saida CAMINHO.zip]
O ZIP leva: o arquivo de dados inteiro (usuários, OS, laudos, painel, requisições, chaves de API do robô, configuração da
baixa de estoque), anexos de teste, PDFs/fotos de laudo e as chaves do config.env (Gemini, Omie, webhook).
ATENÇÃO: contém segredos (credenciais do Omie e senhas criptografadas). Guarde como se fosse uma senha.
No computador novo, o instalador (SmartReport-Setup) restaura este ZIP na instalação.
"""
import os
import sys
import json
import zipfile
import argparse
import datetime

AQUI = os.path.dirname(os.path.abspath(__file__))
PASTAS = ('laudo_assets', 'laudos_pdf', 'testes_midia')
CHAVES_ENV = ('GEMINI_API_KEY', 'GEMINI_MODEL', 'OMIE_WEBHOOK_TOKEN', 'OMIE_APP_KEY', 'OMIE_APP_SECRET', 'MIDIA_MAX_TOTAL_MB')


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--saida', default='')
    a = ap.parse_args()
    cfg = ler_config(os.path.join(AQUI, 'config.env'))
    pasta = os.environ.get('PASTA_DADOS') or cfg.get('PASTA_DADOS') or r'C:\SmartReportDados'
    dados = os.path.join(pasta, 'bateria_data.json')
    if not os.path.isfile(dados):
        sys.exit(f'Não achei os dados em {dados}. Confira a pasta de dados no config.env.')
    saida = a.saida or os.path.join(os.path.expanduser('~'), 'Desktop',
                                    'SmartReport-Dados-' + datetime.datetime.now().strftime('%Y%m%d_%H%M') + '.zip')
    os.makedirs(os.path.dirname(os.path.abspath(saida)), exist_ok=True)
    n = 0
    with zipfile.ZipFile(saida, 'w') as z:
        z.write(dados, 'bateria_data.json', compress_type=zipfile.ZIP_DEFLATED)
        for nome in PASTAS:
            raiz = os.path.join(pasta, nome)
            for r, _d, arqs in os.walk(raiz):
                for arq in arqs:
                    cam = os.path.join(r, arq)
                    z.write(cam, os.path.join(nome, os.path.relpath(cam, raiz)).replace('\\', '/'), compress_type=zipfile.ZIP_STORED)
                    n += 1
        meta = {"geradoEm": datetime.datetime.utcnow().isoformat() + "Z", "geradoPor": "exportar_dados.py", "arquivos": n,
                "env": {k: cfg[k] for k in CHAVES_ENV if cfg.get(k)}}
        z.writestr('meta.json', json.dumps(meta, ensure_ascii=False))
    print(f'Backup completo gravado em:\n  {saida}\n  ({os.path.getsize(saida) / 1048576:.1f} MB, {n} anexos + dados)')
    print('Ele contém segredos (Omie, senhas). Guarde com cuidado e apague depois de restaurar no PC novo.')


if __name__ == '__main__':
    main()
