# Painel de Acompanhamento de Manutenção (kanban)

Front-end estático (HTML + CSS + JavaScript puro, sem build). Mostra as OS da planilha "Acompanhamento de Manutenção"
em formato kanban, com 4 perfis de acesso (Administrador, Vendedor, Manutenção, Expedição).

## Arquivos
| Arquivo | O que é |
|---|---|
| `index.html` | Estrutura da tela: menu superior, cards de resumo, kanbans, modais e tela de login |
| `style.css` | Tema azul (claro/escuro automático), rolagens discretas, modais |
| `app.js` | Toda a lógica: regras de status e prazos, kanbans, permissões por perfil, modais e a camada de dados |
| `config.js` | URL/chave do backend e domínio dos e-mails de login (placeholders) |
| `BACKEND.md` | O que o backend precisa oferecer: dados, permissões e os pontos do `app.js` a adaptar |

## Como abrir
Sirva a pasta como site estático (qualquer servidor web, GitHub Pages, Netlify etc.). Não funciona abrindo o
`index.html` por `file://` com backend real, por causa de CORS e de módulos externos.

## Versão e cache
`VERSAO` no início do `app.js` e o `?v=` dos arquivos no `index.html` precisam ser trocados juntos a cada publicação;
senão o navegador pode continuar usando arquivos antigos. A versão aparece no rodapé da tela de login.

## O que está pronto no front-end
- Kanbans: Chegada de Equipamento, Aguardando Análise, Aguardando Aprovação, Fila de Manutenção, Em Execução,
  Teste de Equipamento, Finalizado, Equipamentos Condenados, Prontos para Envio, Enviados (o Administrador cria, renomeia e exclui kanbans).
- Status e atraso pela mesma fórmula da planilha (prazo em dias úteis por equipamento).
- Perfis, bloqueio de campos já salvos, regras para passar de um kanban a outro, Administrador movendo com pendências em amarelo.
- Visibilidade de kanbans e de cards do topo por perfil (tela "Visibilidade", só Administrador).
- Cards de resumo com contagem e valor total de "Em aberto".
- Atualização automática por tempo real, botão Atualizar e indicador "Salvo às hh:mm".
