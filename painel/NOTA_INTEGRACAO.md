# Integração com o Smart Report (2026-10-28)

Este painel roda dentro do Smart: servido em `/painel/` e usando o mesmo login (`localStorage.smartReportAuth`).
O Supabase foi **removido**; `app.js` fala com `/api/painel*` (ver seção PAINEL DE MANUTENÇÃO no `smart_report.py`).
Os dados ficam em `full_data['painel']` (entram no backup `/api/export-config`). Tempo real = consulta a `/api/painel/rev` a cada 8 s.

Papéis do Smart -> perfil do painel:
| Papel no Smart | Perfil no painel |
|---|---|
| admin, admin_master | Administrador (kanbans, visibilidade, valores, exclusão) |
| vendedor | Vendedor (cria OS, vê/grava valores). Ao entrar no Smart vai direto ao painel |
| expedicao | Expedição (cria OS só em Chegada, sem valores). Idem |
| user, almoxarife | Manutenção (4 kanbans padrão, sem valores) |

`BACKEND.md` e `LEIAME.md` são os originais e descrevem as regras de permissão — que agora são aplicadas no servidor do Smart.
`config.js` e a tela de login própria não existem mais.
