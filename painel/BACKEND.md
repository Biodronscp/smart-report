# O que o backend precisa oferecer

O `app.js` conversa com o backend em poucos pontos (seção **"Banco de dados"**, no início do arquivo, e a tela de login/visibilidade).
Hoje essas chamadas usam o cliente do Supabase; para outro backend, troque essas funções mantendo o mesmo formato de dados.

## 1. Dados

**ordens** (uma linha por OS) — campos do front-end → coluna:
`id` (UUID gerado no navegador), `col` (id do kanban), `equipamento`, `modelo`, `serie`, `os`, `cliente`, `garantia` (Sim | Não | Condenado),
`tecnico`, `vendedor`, `enviado` (Sim | Não), `rastreio`, e as datas (AAAA-MM-DD) `dChegada`→`d_chegada`, `dAnalise`→`d_analise`,
`dAprovacao`→`d_aprovacao`, `dExecucao`→`d_execucao`, `dTeste`→`d_teste`, `dFinalizado`→`d_finalizado`, `dEnvio`→`d_envio`.
Também `criado_em` e `atualizado_em`. Campos de texto vazios podem ser `""`; datas vazias são `null`.

**os_valores** (1 para 1 com a OS): `ordem_id`, `valor_proposta` (texto, ex.: "R$ 1.500,50"), `valor_base` (valor no momento em que a OS entrou em
Aguardando Análise). Guardar separado para que Manutenção e Expedição nunca recebam o valor.

**colunas** (kanbans): `id`, `nome`, `ordem`, `custom`. Padrão: chegada, analise, aprov, fila, exec, teste, final, condenado, pronto, enviado.
O Administrador cria kanbans novos com id `c<timestamp>`.

**visibilidade** (uma linha por perfil: admin, vendedor, manutencao, expedicao): `perfil`, `colunas` (lista de ids de kanban visíveis),
`cards` (lista dos cards do topo: "aberto", "atrasadas" e ids de kanban; nulo = acompanham os kanbans visíveis).
Padrão: vendedor = todos; manutencao = analise, fila, exec, teste; expedicao = chegada, final, condenado, pronto, enviado.
A linha do admin só muda o que o Administrador vê na tela; no servidor ele lê tudo.

**resumo dos cards**: por kanban, `{ col, qtd, valor }` com a contagem de OS e a soma dos valores, **mesmo dos kanbans que o perfil não vê**
(para mostrar o card de um kanban oculto). O `valor` só vai para Administrador e Vendedor (nulo para os outros).
O front-end converte textos como "R$ 1.500,50", "1.500" e "2000" para número; o backend precisa fazer a mesma conversão.

**perfis**: associa o usuário autenticado a um dos 4 perfis.

## 2. Pontos do app.js a adaptar
| Função | O que faz | O que o backend precisa |
|---|---|---|
| `carregar()` | Lê colunas, ordens (com valores), visibilidade e resumo | Listagem paginada (o front lê em blocos de 1000) já filtrada pelo perfil |
| `gravarCard()` | Insere, atualiza só os campos que mudaram, grava o valor e exclui OS | Criar, atualizar parcialmente e excluir; `update` deve devolver erro se nenhuma linha foi alterada |
| `gravarCols()` | Salva a lista de kanbans (ordem e nomes) e exclui os removidos | Somente Administrador |
| `abrirVisibilidade()` / `liberarNovoKanban()` | Salvam a visibilidade e os cards | Somente Administrador |
| `assinarMudancas()` | Recarrega quando outro usuário salva | Tempo real (websocket) ou consulta periódica |
| `tentarLogin()` / `perfilDoUsuario()` / `retomarSessao()` | Login por perfil + senha | Autenticação com sessão e renovação; devolver o perfil do usuário |

O restante do `app.js` (regras de negócio, telas, status e prazos) não depende do backend.

## 3. Permissões que o backend deve impor
Fora o Administrador, que pode tudo:
- **Leitura de OS:** só dos kanbans visíveis ao perfil (tabela de visibilidade).
- **Valores:** só Administrador e Vendedor leem ou gravam; o Vendedor não grava depois que a OS está em Enviados.
- **Criar OS:** Administrador, Vendedor e Expedição (esta só em Chegada de Equipamento). Manutenção não cria.
- **Excluir OS, alterar kanbans, alterar visibilidade:** só Administrador.
- **Depois de Enviados:** nenhuma alteração, nem mudar a OS de kanban (só Administrador).
- **Antes de Enviados:** um campo já preenchido não pode mudar, exceto: técnico (todos), enviado ao cliente (todos), garantia (Vendedor) e valor (Vendedor).
  O kanban (`col`) pode mudar sempre. Campo vazio pode ser preenchido por qualquer perfil que veja a OS.
- **Mover/editar uma OS que vira invisível:** um perfil pode mover uma OS para um kanban que ele não vê (ela some da tela dele).

## 4. Regras que ficam só no front-end (o backend pode repetir se quiser)
- Campos exigidos para entrar em cada kanban:
  Aguardando Análise: OS, cliente, garantia, vendedor, valor · Aguardando Aprovação: data de análise, técnico, valor alterado ·
  Fila: data de aprovação · Em Execução: data de execução · Teste: data de teste · Finalizado: data de finalizado · Enviados: data de envio e rastreio.
  Com garantia "Sim" o valor não é exigido. O Administrador move mesmo com pendências.
- Status e atraso: prazo em dias úteis (Drone e Bateria 5; Placa 1; Carregador e Gerador 7; demais 10), contado da chegada (análise) ou da execução (manutenção).
- Estatísticas da OS (dias entre etapas) e ordem das OS dentro de cada kanban (atrasadas no topo).
- Listas de equipamentos e modelos do formulário.

## 5. Login
O front-end monta o e-mail `perfil@DOMINIO` (ver `config.js`) e pede só a senha; são 4 contas compartilhadas, uma por perfil.
Para contas individuais, troque `tentarLogin()` para pedir e-mail e senha e leia o perfil do usuário.
