"""Servidor local do Biodron Smart Report Pro (substitui o Render).

Uso:  .venv\\Scripts\\python.exe servidor_local\\servidor.py      (ou clique em iniciar_servidor.bat)

Lê as configurações de servidor_local\\config.env (veja config.exemplo.env), grava tudo numa pasta de dados fora do
projeto e serve o aplicativo com o waitress (servidor de produção para Windows, no lugar do gunicorn do Render).
"""
import os
import sys
import socket
import logging
import logging.handlers

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)


def carregar_config(caminho):
    """Lê linhas CHAVE=VALOR (ignora vazias e #comentários). Variáveis já definidas no Windows têm prioridade."""
    if not os.path.isfile(caminho):
        return False
    with open(caminho, encoding='utf-8-sig') as f:
        for linha in f:
            linha = linha.strip()
            if not linha or linha.startswith('#') or '=' not in linha:
                continue
            chave, _, valor = linha.partition('=')
            os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))
    return True


tem_config = carregar_config(os.path.join(AQUI, 'config.env'))
PASTA_DADOS = os.environ.setdefault('PASTA_DADOS', r'C:\SmartReportDados')
os.makedirs(PASTA_DADOS, exist_ok=True)
os.environ.setdefault('DATA_FILE', os.path.join(PASTA_DADOS, 'bateria_data.json'))   # ANTES de importar o app
PORTA = int(os.environ.get('PORT', '5001'))

# ---- log em arquivo (o que o app imprime com print também vai para o arquivo; útil quando roda sem janela) ----
PASTA_LOGS = os.path.join(PASTA_DADOS, 'logs')
os.makedirs(PASTA_LOGS, exist_ok=True)
_handler = logging.handlers.RotatingFileHandler(os.path.join(PASTA_LOGS, 'servidor.log'), maxBytes=5_000_000, backupCount=5, encoding='utf-8')
_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s %(message)s'))
for nome in ('waitress', 'smart_report_tela'):
    lg = logging.getLogger(nome)
    lg.setLevel(logging.INFO)
    lg.propagate = False          # só o arquivo: sem isso o log voltaria para a tela e entraria em laço
    lg.addHandler(_handler)
_log_tela = logging.getLogger('smart_report_tela')


class _Tee:
    """Copia tudo que vai para a tela também para o arquivo de log."""
    def __init__(self, original):
        self.original = original

    def write(self, texto):
        if self.original:
            try:
                self.original.write(texto)
            except Exception:
                pass
        if texto.strip():
            _log_tela.info(texto.rstrip())
        return len(texto)

    def flush(self):
        if self.original:
            try:
                self.original.flush()
            except Exception:
                pass


sys.stdout = _Tee(sys.stdout)
sys.stderr = _Tee(sys.stderr)
sys.path.insert(0, RAIZ)

from waitress import serve          # noqa: E402
import smart_report                 # noqa: E402  (lê DATA_FILE e as chaves ao ser importado)


def enderecos_da_rede():
    """IPs privados desta máquina (para passar às outras pessoas do escritório)."""
    ips = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith('127.') and not ip.startswith('169.254.'):
                ips.append(ip)
    except Exception:
        pass
    return ips


class Comprime:
    """Comprime (gzip) páginas e dados de texto, como o Render fazia: a tela principal cai de ~480 KB para ~100 KB,
    o que acelera o Wi-Fi e evita travar em aparelhos mais sensíveis. Não mexe em imagens, vídeos nem em downloads."""
    TIPOS = ('text/', 'application/json', 'application/javascript', 'application/manifest+json', 'image/svg+xml')

    def __init__(self, app):
        self.app = app

    def __call__(self, environ, start_response):
        import gzip
        if 'gzip' not in (environ.get('HTTP_ACCEPT_ENCODING') or '').lower() or environ.get('HTTP_RANGE') \
                or environ.get('REQUEST_METHOD') == 'HEAD':
            return self.app(environ, start_response)
        cap = {}

        def sr(status, headers, exc_info=None):
            cap['status'], cap['headers'], cap['exc'] = status, list(headers), exc_info
            return lambda dado: None
        it = self.app(environ, sr)
        hd = {k.lower(): v for k, v in cap['headers']}
        tamanho = int(hd.get('content-length') or 0)
        if (cap['status'].startswith('200') and 1024 < tamanho <= 20 * 1024 * 1024 and 'content-encoding' not in hd
                and any(hd.get('content-type', '').startswith(t) for t in self.TIPOS)):
            try:
                corpo = b''.join(it)
            finally:
                if hasattr(it, 'close'):
                    it.close()
            corpo = gzip.compress(corpo, 5)
            cab = [(k, v) for k, v in cap['headers'] if k.lower() != 'content-length']
            cab += [('Content-Encoding', 'gzip'), ('Content-Length', str(len(corpo))), ('Vary', 'Accept-Encoding')]
            start_response(cap['status'], cab, cap['exc'])
            return [corpo]
        start_response(cap['status'], cap['headers'], cap['exc'])
        return it


class LogAcesso:
    """Registra cada acesso (quem, o quê, resultado, tempo) no servidor.log. Serve para descobrir por que um aparelho
    não consegue entrar: se a linha dele não aparece, a requisição nem chegou ao servidor (problema de rede)."""
    def __init__(self, app):
        self.app = app

    def __call__(self, environ, start_response):
        import time
        t0 = time.time()
        res = {}

        def sr(status, headers, exc_info=None):
            res['s'] = status.split(' ')[0]
            return start_response(status, headers, exc_info)
        try:
            return self.app(environ, sr)
        finally:
            ua = (environ.get('HTTP_USER_AGENT') or '-')[:180]
            caminho = environ.get('PATH_INFO', '')
            if not caminho.startswith('/api/painel/rev'):      # esse é chamado a cada 8 s por cada painel aberto
                _log_tela.info(f"ACESSO {environ.get('REMOTE_ADDR')} {environ.get('REQUEST_METHOD')} {caminho} {res.get('s', '-')} "
                               f"{int((time.time() - t0) * 1000)}ms {ua}")


def main():
    print('=' * 62)
    print(' BIODRON SMART REPORT PRO — servidor local (waitress)')
    print('=' * 62)
    print(f' Dados:   {os.environ["DATA_FILE"]}')
    print(f' Logs:    {os.path.join(PASTA_LOGS, "servidor.log")}')
    if not tem_config:
        print(' Aviso:   servidor_local\\config.env não existe — usando os padrões (copie o config.exemplo.env).')
    if os.environ.get('OMIE_SOMENTE_LEITURA') == '1':
        print(' MODO TESTE: gravação no Omie BLOQUEADA (só leitura).')
    else:
        print(' ATENÇÃO: gravação no Omie LIGADA (modo real).')
    print('-' * 62)
    print(f' Neste computador:   http://localhost:{PORTA}')
    for ip in enderecos_da_rede():
        print(f' Na rede (outros):   http://{ip}:{PORTA}')
    print(f' Pelo nome:          http://{socket.gethostname()}:{PORTA}')
    print('=' * 62)
    print(' Para parar: Ctrl+C (ou feche a janela).\n')
    # threads=1: mesmo comportamento do Render (1 worker): os dados ficam num arquivo JSON e as requisições
    # são atendidas uma por vez, sem risco de duas gravações simultâneas se perderem.
    serve(LogAcesso(Comprime(smart_report.app)), host='0.0.0.0', port=PORTA, threads=1, ident='SmartReport',
          channel_timeout=300, cleanup_interval=30, max_request_body_size=80 * 1024 * 1024, log_socket_errors=True)


if __name__ == '__main__':
    main()
