"use strict";
const VERSAO = "2026.10.21.1";   // aparece na tela de login e ao passar o mouse sobre o perfil; atualize junto com o ?v= do index.html
/* ===== Dados da planilha ===== */
const EQUIPAMENTOS = ["Bateria", "Drone", "Carregador", "Gerador", "Controle", "Motor", "Placa", "Outros"];
const MODELOS = ["T10", "T20", "T20P", "T25", "T25P", "T30", "T40", "T50", "T55P", "T70", "T70P", "T100", "T100 Dual", "Consumer", "Aviônica", "Outros"];
const GARANTIAS = ["Sim", "Não", "Condenado"];

/* ===== Kanbans e regras para entrar em cada um ===== */
const BASE = [
  { id: "chegada", name: "Chegada de Equipamento" },
  { id: "analise", name: "Aguardando Análise" },
  { id: "aprov", name: "Aguardando Aprovação" },
  { id: "fila", name: "Fila de Manutenção" },
  { id: "exec", name: "Em Execução" },
  { id: "teste", name: "Teste de Equipamento" },
  { id: "final", name: "Finalizado" },
  { id: "condenado", name: "Equipamentos Condenados" },
  { id: "pronto", name: "Prontos para Envio" },
  { id: "enviado", name: "Enviados" }
];
const FLUXO = BASE.filter(b => b.id !== "condenado");   // etapas sequenciais (condenado é saída lateral)
const REQ = {
  chegada: ["equipamento", "modelo", "serie", "dChegada"],
  analise: ["os", "cliente", "garantia", "vendedor", "valorProposta"],
  aprov: ["dAnalise", "tecnico"],
  fila: ["dAprovacao"],
  exec: ["dExecucao"],
  teste: ["dTeste"],
  final: ["dFinalizado"],
  pronto: [],
  enviado: ["dEnvio", "rastreio"],
  condenado: []
};
const LABEL = {
  vendedor: "Vendedor", valorProposta: "Valor da Proposta",
  valorAlterado: "Alterar o Valor da Proposta (diferente do valor na chegada à análise)",
  os: "Ordem de Serviço", cliente: "Cliente", equipamento: "Equipamento",
  modelo: "Modelo", serie: "Nº Série", garantia: "Garantia", tecnico: "Técnico Responsável",
  enviado: "Enviado ao Cliente", rastreio: "Código de Rastreio", dChegada: "Data de chegada",
  dAnalise: "Data de análise", dAprovacao: "Data de aprovação", dExecucao: "Data de execução",
  dTeste: "Data de teste de equipamento", dFinalizado: "Data de finalizado", dEnvio: "Data de envio"
};

/* ===== Estado ===== */
let S = { cols: [], cards: [] };
let termo = "";

/* ===== Perfis de acesso (o que cada perfil vê na tela; as regras reais ficam no banco — veja schema.sql) ===== */
// "cols" é só o padrão enquanto a lista do banco (tabela visibilidade) não é carregada
const PERFIS = {
  admin:      { nome: "Administrador", cols: null, criar: true,  kanbans: true,  valores: true,  editarTudo: true,  excluir: true },
  vendedor:   { nome: "Vendedor",      cols: null, criar: true,  kanbans: false, valores: true,  editarTudo: false, excluir: false },
  manutencao: { nome: "Manutenção",    cols: ["analise", "fila", "exec", "teste"], criar: false, kanbans: false, valores: false, editarTudo: false, excluir: false },
  expedicao:  { nome: "Expedição",     cols: ["chegada", "final", "condenado", "pronto", "enviado"], criar: true, kanbans: false, valores: false, editarTudo: false, excluir: false }
};
let ROLE = null;
const P = () => PERFIS[ROLE] || {};
let VIS = {}, CARDS = {}, RESUMO = null;        // definidos pelo Administrador: kanbans e cards do topo por perfil; RESUMO = contagens do servidor
// kanbans que o perfil vê (null = todos); sem configuração no banco vale o padrão de PERFIS
const colunasDe = p => VIS[p] || (p === "admin" || !PERFIS[p].cols ? null : PERFIS[p].cols);
const colVisivel = id => { const l = colunasDe(ROLE); return !l || l.includes(id); };
// cards do topo: ids "aberto", "atrasadas" e os ids dos kanbans. Sem escolha explícita, acompanham os kanbans visíveis
const cardsPadrao = p => {
  const l = colunasDe(p);
  return [...(PERFIS[p].valores ? ["aberto"] : []), ...S.cols.map(c => c.id).filter(id => !l || l.includes(id)), "atrasadas"];
};
const cardAtivo = id => (CARDS[ROLE] || cardsPadrao(ROLE)).includes(id);
const rotulo = k => (!P().valores && (k === "valorProposta" || k === "valorAlterado")) ? "atualização do valor da proposta (a cargo do Vendedor)" : LABEL[k];
// fora do Administrador, o que já foi salvo não é editado (exceto o valor da proposta enquanto a OS está em análise)
// Fora o Administrador: o que já foi salvo não é editado, exceto valor, técnico e "enviado ao cliente" (e a garantia, para o Vendedor),
// que podem mudar até a OS chegar em Enviados. Depois de Enviados, nada mais pode ser alterado.
const EDITAVEIS_ATE_ENVIO = ["valorProposta", "tecnico", "enviado"];
const enviada = c => c.col === "enviado";
const somenteLeitura = c => !P().editarTudo && enviada(c);
const bloqueado = (k, c) => {
  if (P().editarTudo) return false;
  if (enviada(c)) return true;
  if (EDITAVEIS_ATE_ENVIO.includes(k) || (k === "garantia" && ROLE === "vendedor")) return false;
  return String(c[k] || "").trim() !== "";
};
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, ch => { const r = Math.random() * 16 | 0; return (ch === "x" ? r : (r & 3 | 8)).toString(16); }));

/* ===== Banco de dados (API do Smart Report) ===== */
// Mesmo login do Smart: o token fica em localStorage.smartReportAuth. As permissões reais são aplicadas no servidor.
const CAMPOS_OS = ["col", "equipamento", "modelo", "serie", "os", "cliente", "garantia", "tecnico", "vendedor", "enviado", "rastreio",
  "dChegada", "dAnalise", "dAprovacao", "dExecucao", "dTeste", "dFinalizado", "dEnvio"];
let AUTH = null;
try { AUTH = JSON.parse(localStorage.getItem("smartReportAuth") || "null"); } catch (e) { AUTH = null; }
let REV = null;

let snap = {}, snapCols = "[]", pendente = false, fila = Promise.resolve(), escrevendo = 0, geracao = 0, houveErro = false;
function snapshot() { snap = {}; S.cards.forEach(c => snap[c.id] = JSON.stringify(c)); snapCols = JSON.stringify(S.cols); }

function mostrarStatus(txt, cls) {
  const el = $("status-salvo"); if (!el) return;
  el.textContent = txt; el.className = "salvo " + (cls || "");
}
function erroDeSessao(e) { return !!(e && (e.status === 401 || /não autorizado/i.test(String(e.message || e)))); }
async function api(caminho, corpo, metodo) {
  const r = await fetch(caminho, {
    method: metodo || (corpo === undefined ? "GET" : "POST"),
    headers: { "Authorization": AUTH && AUTH.token || "", "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });
  let d = null; try { d = await r.json(); } catch (e) {}
  if (!r.ok) { const e = new Error((d && d.error) || ("Erro " + r.status)); e.status = r.status; throw e; }
  return d;
}
function linhaParaCard(r) {
  const c = { id: r.id };
  CAMPOS_OS.forEach(k => { const v = r[k]; c[k] = v == null ? "" : v; });
  c.valorProposta = r.valorProposta || "";
  c.valorBase = r.valorBase || "";
  return c;
}
async function carregar(avisar, imediato) {
  if (!ROLE) return;
  if (!imediato) await fila;                    // espera as gravações pendentes terminarem
  const g = geracao;
  let d;
  try { d = await api("/api/painel"); }
  catch (e) {
    if (erroDeSessao(e)) return sair("Sua sessão expirou. Entre novamente no Smart.");
    toast("Erro ao carregar: " + e.message, true); return;
  }
  if (!ROLE) return;
  // se algo foi salvo durante a leitura, estes dados já estão desatualizados: lê de novo em vez de sobrescrever a tela
  if (g !== geracao || escrevendo) { setTimeout(() => carregar(avisar), 400); return; }
  REV = d.rev;
  VIS = {}; CARDS = {};
  Object.entries(d.vis || {}).forEach(([p, v]) => { if (v.colunas) VIS[p] = v.colunas; if (v.cards) CARDS[p] = v.cards; });
  RESUMO = {}; (d.resumo || []).forEach(r => { RESUMO[r.col] = r; });
  S = { cols: d.cols.map(c => ({ id: c.id, name: c.name, custom: c.custom })), cards: d.ordens.map(linhaParaCard) };
  snapshot(); render();
  if (avisar) toast("Informações atualizadas");
}
const sincronizar = avisar => carregar(avisar);

async function gravarCard(p) {
  if (p.del) { await api("/api/painel/ordem/" + encodeURIComponent(p.del), undefined, "DELETE"); return; }
  const c = p.c, a = p.antes || {}, campos = {};
  CAMPOS_OS.forEach(k => { if (p.novo || c[k] !== a[k]) campos[k] = c[k] == null ? "" : c[k]; });
  const valorMudou = p.novo ? !!(c.valorProposta || c.valorBase) : (c.valorProposta !== a.valorProposta || c.valorBase !== a.valorBase);
  const corpo = { id: c.id, novo: !!p.novo, campos };
  if (P().valores && valorMudou) corpo.valor = { valorProposta: c.valorProposta || "", valorBase: c.valorBase || "" };   // inclui apagar o valor
  if (p.novo || Object.keys(campos).length || corpo.valor) await api("/api/painel/ordem", corpo);
}
async function gravarCols(cols) {
  await api("/api/painel/colunas", { cols: cols.map(c => ({ id: c.id, name: c.name })) });
}
// save() continua síncrono: compara com o último estado conhecido e envia só o que mudou
function save() {
  if (!AUTH) return;
  const tarefas = [];
  const atuais = new Set(S.cards.map(c => c.id));
  S.cards.forEach(c => {
    const js = JSON.stringify(c);
    if (snap[c.id] === js) return;
    const p = { novo: snap[c.id] === undefined, c: JSON.parse(js), antes: snap[c.id] ? JSON.parse(snap[c.id]) : null };
    tarefas.push(() => gravarCard(p));
  });
  Object.keys(snap).forEach(id => { if (!atuais.has(id)) tarefas.push(() => gravarCard({ del: id })); });
  if (JSON.stringify(S.cols) !== snapCols && P().kanbans) {
    const cols = JSON.parse(JSON.stringify(S.cols));
    tarefas.push(() => gravarCols(cols));
  }
  snapshot();
  if (!tarefas.length) return;
  geracao++;
  houveErro = false; mostrarStatus("Salvando…", "ocupado");
  tarefas.forEach(t => {
    escrevendo++;
    fila = fila.then(t).catch(e => {
      houveErro = true;
      if (erroDeSessao(e)) return sair("Sua sessão expirou. Entre novamente no Smart.");
      mostrarStatus("Erro ao salvar", "erro");
      toast("Não foi possível salvar: " + (e.message || e) + ". A tela será recarregada com os dados do servidor.", true);
      return carregar(false, true);
    }).then(() => {
      if (--escrevendo === 0) {
        if (!houveErro) mostrarStatus("Salvo às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }), "ok");
        if (pendente && $("overlay").hidden) { pendente = false; carregar(); }
      }
    });
  });
}
let inscrito = false, agenda = null;
function assinarMudancas() {                   // outro acesso salvou algo -> atualiza sozinho (consulta leve a cada 8 s)
  if (inscrito) return; inscrito = true;
  const aviso = () => {
    clearTimeout(agenda);
    agenda = setTimeout(() => {
      if (!ROLE) return;
      const digitando = document.activeElement && document.activeElement.closest && document.activeElement.closest("#board");
      if ($("overlay").hidden && $("conf").hidden && !escrevendo && !digitando) carregar(); else pendente = true;
    }, 300);
  };
  setInterval(async () => {
    if (!ROLE || escrevendo || document.hidden) return;
    try { const d = await api("/api/painel/rev"); if (REV !== null && d.rev !== REV) aviso(); }
    catch (e) { if (erroDeSessao(e)) sair("Sua sessão expirou. Entre novamente no Smart."); }
  }, 8000);
}

const $ = id => document.getElementById(id);
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

/* ===== Datas e regra de status (mesma fórmula da planilha) ===== */
const parse = s => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = d => d ? d.toLocaleDateString("pt-BR") : "";
const numValor = v => {                // "R$ 1.500,50" | "1500.5" | "1.500" -> número
  let t = String(v || "").replace(/[^\d.,-]/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = parseFloat(t); return isNaN(n) ? 0 : n;
};
const brl = n => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

function prazo(eq) {
  if (eq === "Drone" || eq === "Bateria") return 5;
  if (eq === "Placa") return 1;
  if (eq === "Carregador" || eq === "Gerador") return 7;
  return 10;
}
function workday(d, n) {               // DIATRABALHO
  const r = new Date(d);
  while (n > 0) { r.setDate(r.getDate() + 1); const w = r.getDay(); if (w !== 0 && w !== 6) n--; }
  return r;
}
function diasUteisAtraso(limite) {     // dias úteis entre o limite e hoje
  const r = new Date(limite), h = hoje(); let n = 0;
  while (r < h) { r.setDate(r.getDate() + 1); const w = r.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}
function info(c) {
  const p = prazo(c.equipamento), h = hoje();
  let status = "", limite = null, atrasado = false;
  if (c.col === "condenado") return { status: "Equipamento Condenado", limite, atrasado, diasAtraso: 0 };
  if (c.dFinalizado) status = "Manutenção Finalizada";
  else if (c.dTeste) status = "Teste de Equipamento";
  else if (c.dExecucao) {
    limite = workday(parse(c.dExecucao), p);
    atrasado = limite < h; status = atrasado ? "Manutenção em Atraso" : "Em manutenção";
  } else if (c.dAprovacao) status = "Aguardando Execução";
  else if (c.dAnalise) status = "Aguardando Aprovação";
  else if (c.dChegada) {
    limite = workday(parse(c.dChegada), p);
    atrasado = limite < h; status = atrasado ? "Análise Atrasada" : "Aguardando Análise";
  }
  return { status, limite, atrasado, diasAtraso: atrasado ? diasUteisAtraso(limite) : 0 };
}

/* ===== Regras de movimentação ===== */
const baseIdx = id => FLUXO.findIndex(b => b.id === id);
const proxima = id => { const i = FLUXO.findIndex(b => b.id === id); return i < 0 ? null : S.cols.slice(S.cols.findIndex(x => x.id === id) + 1).find(x => x.id !== "condenado") || null; };
const anterior = id => { const k = S.cols.findIndex(x => x.id === id); return S.cols.slice(0, k).reverse().find(x => x.id !== "condenado") || null; };
const DATA_COL = { chegada: "dChegada", analise: "dChegada", aprov: "dAnalise", fila: "dAprovacao", exec: "dExecucao",
  teste: "dTeste", final: "dFinalizado", pronto: "dFinalizado", enviado: "dEnvio" };   // data que levou a OS à coluna
const vazio = (c, k) => !String(c[k] || "").trim();

const semValor = c => c.garantia === "Sim";   // equipamento em garantia dispensa o valor da proposta
function exigidos(c, de, t) {                  // campos exigidos para ir da etapa de+1 até a etapa t
  const falta = [];
  for (let i = Math.max(de, -1) + 1; i <= t; i++)
    REQ[FLUXO[i].id].forEach(k => {
      if (vazio(c, k) && !falta.includes(k) && !(semValor(c) && k === "valorProposta")) falta.push(k);
    });
  return falta;
}
function faltando(c, colId) {
  const t = baseIdx(colId);
  if (t < 0 || colId === "condenado") return [];
  const de = baseIdx(c.col);
  if (t <= de) return [];               // voltar etapa não exige nada
  const falta = exigidos(c, de, t);
  // saindo de Aguardando Análise para Aguardando Aprovação: o valor da proposta precisa ter sido alterado
  if (c.col === "analise" && t >= baseIdx("aprov") && !semValor(c) && numValor(c.valorProposta) === numValor(c.valorBase) && !falta.includes("valorProposta"))
    falta.push("valorAlterado");
  return falta;
}
const pendentes = c => { const t = baseIdx(c.col); return t < 0 ? [] : exigidos(c, -1, t); };   // o que já deveria estar preenchido no kanban atual
function mover(c, colId, silencioso) {
  if (somenteLeitura(c) && colId !== c.col) {   // OS enviada: só o Administrador mexe
    if (!silencioso) toast("Esta OS já foi enviada; somente o Administrador pode alterá-la.", true);
    return false;
  }
  const f = faltando(c, colId);
  if (f.length && !P().editarTudo) {       // só o Administrador move com campos pendentes
    if (!silencioso) toast("Para mover para “" + colName(colId) + "” preencha: " + f.map(rotulo).join(", "));
    return false;
  }
  c.col = colId;
  if (colId === "analise") c.valorBase = c.valorProposta || "";
  if (colId === "enviado") c.enviado = "Sim";
  save(); render();
  if (f.length && !silencioso) toast("OS movida com campos pendentes (em amarelo na OS): " + f.map(rotulo).join(", "));
  else if (!colVisivel(colId)) toast("OS enviada para “" + colName(colId) + "”");
  return true;
}
const colName = id => (S.cols.find(c => c.id === id) || {}).name || "";

/* ===== Render ===== */
function visiveis() {
  const sem = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const t = sem(termo).trim();
  const soAtrasadas = t.startsWith("atras");
  return S.cards.filter(c => {
    if (!colVisivel(c.col)) return false;
    const i = info(c);
    if (!t) return true;
    if (soAtrasadas) return i.atrasado;
    return [c.os, c.cliente, c.serie, c.equipamento, c.modelo, c.tecnico, c.rastreio, i.status].some(v => sem(v).includes(t));
  });
}
function cardHtml(c) {
  const i = info(c);
  const gar = c.garantia === "Sim" ? '<span class="tag warn">Garantia</span> ' : c.garantia === "Condenado" ? '<span class="tag">Condenado</span> ' : "";
  let prazoTxt = "";
  if (i.atrasado) prazoTxt = `<span class="tag late">⚠ Atrasada${i.diasAtraso ? " · " + i.diasAtraso + " d.u." : ""}</span>`;
  else if (i.limite) prazoTxt = `<span class="tag">Prazo: ${fmt(i.limite)}</span>`;
  const ico = i.atrasado ? '<svg class="lateico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><title>Atrasada</title><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' : "";
  return `<div class="card ${i.atrasado ? "late" : ""}" draggable="true" data-id="${c.id}">
    <h3><span>${esc(c.equipamento)} ${esc(c.modelo)}</span>${ico}</h3>
    <p>${esc(c.cliente || "Cliente não informado")}</p>
    <p>Série: ${esc(c.serie)}</p>
    <div>${gar}${prazoTxt}</div>
    <div class="foot"><span>${c.os ? "OS " + esc(c.os) : "Sem OS"}</span><span>${esc(i.status)}</span></div>
  </div>`;
}
function render() {
  if (!ROLE) return;
  const board = $("board");
  const sl = board.scrollLeft;
  const tops = [...board.querySelectorAll(".cards")].map(e => e.scrollTop);

  const vis = visiveis();
  const kb = P().kanbans;
  board.innerHTML = S.cols.filter(col => colVisivel(col.id)).map(col => {
    const dk = DATA_COL[col.id] || "dChegada";           // mais antigo no topo (pela data de entrada na coluna)
    const dataOrd = c => c[dk] || c.dChegada || "9999-99-99";
    const its = vis.filter(c => c.col === col.id).sort((a, b) =>
      dataOrd(a).localeCompare(dataOrd(b)) || (a.dChegada || "").localeCompare(b.dChegada || "") || String(a.id).localeCompare(String(b.id)));
    const total = S.cards.filter(c => c.col === col.id).length;
    return `<div class="col" data-col="${col.id}">
      <h2><span class="ttl" ${kb ? 'data-act="rename" title="Clique para renomear"' : ""}>${esc(col.name)}</span>
        ${kb ? '<button class="ib" data-act="rename" title="Renomear">✎</button>' : ""}
        ${kb && col.custom && !total ? '<button class="ib" data-act="del" title="Excluir kanban">✕</button>' : ""}
        <b>${its.length}</b></h2>
      <div class="cards">${its.map(cardHtml).join("") || '<div class="empty">Sem OS</div>'}</div>
    </div>`;
  }).join("") + (kb ? '<div class="col add" data-act="addcol">+ Novo kanban</div>' : "");
  board.scrollLeft = sl;
  board.querySelectorAll(".cards").forEach((e, i) => { if (tops[i]) e.scrollTop = tops[i]; });

  // painel
  const COM_VALOR = ["analise", "aprov", "fila", "exec", "teste", "final"];
  // contagem e valor de um kanban: kanbans visíveis vêm da tela (atualiza na hora); os ocultos vêm do resumo do servidor
  const contagem = id => {
    if (colVisivel(id) || !RESUMO) {
      const l = S.cards.filter(c => c.col === id);
      return { qtd: l.length, valor: l.reduce((t, c) => t + numValor(c.valorProposta), 0) };
    }
    const r = RESUMO[id];
    return { qtd: r ? Number(r.qtd) : 0, valor: r ? Number(r.valor || 0) : 0 };
  };
  const tiles = [];
  if (cardAtivo("aberto")) {                    // todas as OS que ainda não foram enviadas nem condenadas
    const ab = S.cols.filter(c => c.id !== "enviado" && c.id !== "condenado").map(c => contagem(c.id));
    tiles.push(["Em aberto", ab.reduce((t, x) => t + x.qtd, 0), "", P().valores ? brl(ab.reduce((t, x) => t + x.valor, 0)) : ""]);
  }
  S.cols.forEach(col => {
    if (!cardAtivo(col.id)) return;
    const ct = contagem(col.id);
    tiles.push([col.name, ct.qtd, "", P().valores && COM_VALOR.includes(col.id) ? brl(ct.valor) : ""]);
  });
  const tile = ([l, v, k, valor]) => `<div class="stat ${k}"><span class="n">${v}</span><span class="l">${esc(l)}</span>${valor ? `<span class="v">${valor}</span>` : ""}</div>`;
  const atr = S.cards.filter(c => colVisivel(c.col) && info(c).atrasado).length;
  $("stats").innerHTML = tiles.map(tile).join("") + (cardAtivo("atrasadas") ? tile(["Atrasadas", atr, "late"]) : "");
}

/* ===== Eventos do quadro ===== */
$("board").addEventListener("click", e => {
  const card = e.target.closest(".card");
  if (card) return abrir(card.dataset.id);
  const act = e.target.closest("[data-act]");
  if (!act || !P().kanbans) return;
  const colEl = e.target.closest(".col");
  if (act.dataset.act === "addcol") {
    const id = "c" + Date.now();
    S.cols.push({ id, name: "Novo kanban", custom: true });
    liberarNovoKanban(id);

    save(); render();
    const t = $("board").querySelector(`[data-col="${id}"] .ttl`);
    $("board").scrollLeft = $("board").scrollWidth;
    if (t) renomear(id);
  } else if (act.dataset.act === "rename") renomear(colEl.dataset.col);
  else if (act.dataset.act === "del") {
    S.cols = S.cols.filter(c => c.id !== colEl.dataset.col); save(); render();
  }
});
function renomear(id) {
  const h2 = $("board").querySelector(`[data-col="${id}"] h2`);
  const col = S.cols.find(c => c.id === id);
  if (!h2 || h2.querySelector("input")) return;
  const inp = document.createElement("input");
  inp.value = col.name;
  h2.querySelector(".ttl").replaceWith(inp);
  inp.focus(); inp.select();
  let feito = false;
  const fim = ok => {
    if (feito) return; feito = true;
    if (ok && inp.value.trim()) col.name = inp.value.trim();
    save(); render();
  };
  inp.onblur = () => fim(true);
  inp.onkeydown = e => { if (e.key === "Enter") fim(true); if (e.key === "Escape") fim(false); };
}

let arrastando = null;
$("board").addEventListener("dragstart", e => {
  const c = e.target.closest(".card"); if (!c) return;
  arrastando = c.dataset.id; c.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(arrastando));
});
$("board").addEventListener("dragend", () => { arrastando = null; render(); });
$("board").addEventListener("dragover", e => {
  const col = e.target.closest(".col[data-col]"); if (!col || arrastando == null) return;
  e.preventDefault();
  $("board").querySelectorAll(".col.over").forEach(x => x !== col && x.classList.remove("over"));
  col.classList.add("over");
});
$("board").addEventListener("drop", e => {
  const col = e.target.closest(".col[data-col]"); if (!col || arrastando == null) return;
  e.preventDefault();
  const c = S.cards.find(x => x.id === arrastando); arrastando = null;
  if (c && c.col !== col.dataset.col) mover(c, col.dataset.col); else render();
});

/* ===== Modal ===== */
let modal = null; // {modo:'novo'|'edit', id}
const val = k => ($("f_" + k) ? $("f_" + k).value.trim() : "");

const campo = (k, tipo, extra = "") => `<div><label for="f_${k}">${LABEL[k]}</label>${tipo === "date" ? `<input type="date" id="f_${k}">` : tipo === "text" ? `<input id="f_${k}" ${extra}>` : tipo}</div>`;
const sel = (k, opts, vazioTxt = "Selecione…") => `<div><label for="f_${k}">${LABEL[k]}</label><select id="f_${k}"><option value="">${vazioTxt}</option>${opts.map(o => `<option>${esc(o)}</option>`).join("")}</select></div>`;

const comAtual = (lista, atual) => atual && !lista.includes(atual) ? [...lista, atual] : lista;
function abrirModal(titulo, body, foot) {
  $("m-title").textContent = titulo; $("m-body").innerHTML = body; $("m-foot").innerHTML = foot;
  $("overlay").hidden = false;
}
function fechar() {
  $("overlay").hidden = true; modal = null;
  if (pendente) { pendente = false; sincronizar(); }
}
// fechar sem salvar (X, Esc, clique fora, Cancelar): se houver algo digitado, pergunta antes de descartar
const lerForm = () => [...$("m-body").querySelectorAll("[id^=f_]")].map(e => e.id + "=" + e.value).join("|");
function tentarFechar() {
  const sujo = modal && (modal.sujo ? modal.sujo() : (modal.inicial !== undefined && lerForm() !== modal.inicial));
  if (sujo && !confirm("Há alterações não salvas. Descartá-las?")) return;
  fechar();
}
$("m-x").onclick = tentarFechar;
$("overlay").addEventListener("mousedown", e => { if (e.target === $("overlay")) tentarFechar(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("overlay").hidden && $("conf").hidden) tentarFechar(); });

/* ===== Estatísticas (dias corridos, como na planilha) ===== */
function estatisticas(c) {
  const dif = (a, b) => (c[a] && c[b]) ? Math.round((parse(c[b]) - parse(c[a])) / 864e5) : null;
  const an = dif("dChegada", "dAnalise"), ap = dif("dAnalise", "dAprovacao"), fi = dif("dAprovacao", "dExecucao"),
    ex = dif("dExecucao", "dTeste"), te = dif("dTeste", "dFinalizado"), tot = dif("dChegada", "dEnvio");
  const man = [an, fi, ex, te].every(v => v !== null) ? an + fi + ex + te : null;
  const f = v => v === null ? "—" : v;
  return [["Tempo de Análise", f(an)], ["Tempo de Aprovação", f(ap)], ["Tempo de Fila", f(fi)],
    ["Tempo de Execução", f(ex)], ["Tempo de Teste de Equipamento", f(te)],
    ["Total de Dias de Manutenção", f(man)], ["Total de Dias", f(tot)]];
}


function novaOS() {
  if (!P().criar) return;
  modal = { modo: "novo" };
  abrirModal("Nova OS — Chegada de equipamento",
    `<p class="hint">Equipamento, modelo, série e data de chegada são obrigatórios; a garantia é opcional.</p>
     <div class="grid sec">${sel("equipamento", EQUIPAMENTOS)}${sel("modelo", MODELOS)}
     ${campo("serie", "text", 'placeholder="Ex.: 57PPL7QDA3006L ou SEM N/S"')}
     ${campo("dChegada", "date")}${sel("garantia", ["Sim", "Não"], "Não informado")}</div>`,
    `<button class="btn" onclick="tentarFechar()">Cancelar</button><button class="btn green" id="b-salvar" disabled>Registrar chegada</button>`);
  $("f_dChegada").value = iso(hoje());
  modal.inicial = lerForm();
  ["f_equipamento", "f_modelo", "f_serie", "f_dChegada"].forEach(i => { $(i).oninput = validarNovo; $(i).onchange = validarNovo; });
  $("b-salvar").onclick = () => {
    if (validarNovo()) return;
    const c = { id: novoId(), col: "chegada", equipamento: val("equipamento"), modelo: val("modelo"), serie: val("serie"), dChegada: val("dChegada"), garantia: val("garantia"), enviado: "Não" };
    S.cards.push(c); save(); fechar(); render(); toast("OS registrada em “" + colName("chegada") + "”");
  };
}
function validarNovo() {      // retorna true se há algo faltando
  const falta = REQ.chegada.some(k => !val(k));
  const b = $("b-salvar"); if (b) b.disabled = falta;
  return falta;
}

function abrir(id) {
  const c = S.cards.find(x => x.id === id); if (!c) return;
  modal = { modo: "edit", id };
  const idx = S.cols.findIndex(x => x.id === c.col);
  const prox = proxima(c.col), ant = anterior(c.col);
  const tecnicos = [...new Set(S.cards.map(x => x.tecnico).filter(Boolean))];
  const i = info(c);
  abrirModal(`${c.equipamento} ${c.modelo}${c.os ? " — OS " + c.os : ""}`,
    `<p class="hint">Kanban: <b>${esc(colName(c.col))}</b>${i.status ? " · Status: <b>" + esc(i.status) + "</b>" : ""}${i.limite ? " · Prazo: " + fmt(i.limite) : ""}</p>
     <div class="sec"><h4>1 · Identificação</h4><div class="grid">
       ${campo("os", "text")}${campo("cliente", "text")}
       ${sel("equipamento", comAtual(EQUIPAMENTOS, c.equipamento))}${sel("modelo", comAtual(MODELOS, c.modelo))}${campo("serie", "text")}
     </div></div>
     <div class="sec"><h4>2 · Garantia e técnico</h4><div class="grid">
       ${sel("garantia", GARANTIAS)}${campo("tecnico", "text", 'list="dl-tec"')}
       ${campo("vendedor", "text")}${P().valores ? campo("valorProposta", "text", 'inputmode="decimal" placeholder="R$ 0,00"') : ""}
       <datalist id="dl-tec">${tecnicos.map(t => `<option value="${esc(t)}">`).join("")}</datalist>
     </div></div>
     <div class="sec"><h4>3 · Envio ao cliente</h4><div class="grid">
       ${sel("enviado", ["Sim", "Não"], "—")}${campo("rastreio", "text")}
     </div></div>
     <div class="sec"><h4>4 · Datas</h4><div class="grid">
       ${campo("dChegada", "date")}${campo("dAnalise", "date")}${campo("dAprovacao", "date")}${campo("dExecucao", "date")}
       ${campo("dTeste", "date")}${campo("dFinalizado", "date")}${campo("dEnvio", "date")}
     </div></div>
     <div class="sec"><h4>5 · Estatísticas (dias)</h4><div class="grid" id="m-stats"></div></div>
     <p class="hint" id="m-falta"></p>`,
    `${P().excluir ? '<button class="btn danger" id="b-del">Excluir</button>' : ""}
     ${ant ? `<button class="btn" id="b-volta">← ${esc(ant.name)}</button>` : ""}
     <button class="btn" id="b-salvar">Salvar</button>
     ${prox ? `<button class="btn green" id="b-prox">Avançar → ${esc(prox.name)}</button>` : ""}`);
  Object.keys(LABEL).forEach(k => {
    const el = $("f_" + k); if (!el) return;
    el.value = c[k] || "";
    if (bloqueado(k, c)) el.disabled = true;     // já salvo: só o Administrador edita
  });
  modal.inicial = lerForm();
  if (!P().editarTudo) $("m-body").insertAdjacentHTML("afterbegin", somenteLeitura(c)
    ? '<p class="hint"><b>OS enviada: somente leitura.</b> Apenas o Administrador pode alterá-la.</p>'
    : '<p class="hint">Campos já salvos ficam bloqueados; valor, técnico e “enviado ao cliente” podem ser alterados até a OS chegar em Enviados. Apenas o Administrador altera o restante.</p>');

  const atualizaFalta = () => {
    const tmp = { ...c }; Object.keys(LABEL).forEach(k => { if ($("f_" + k)) tmp[k] = val(k); });
    $("m-stats").innerHTML = estatisticas(tmp).map(([l, v]) => `<div class="statrow"><span>${l}</span><b>${v}</b></div>`).join("");
    const adm = P().editarTudo;
    const pend = adm ? pendentes(tmp) : [];       // Administrador: campos exigidos e vazios ficam em amarelo
    Object.keys(LABEL).forEach(k => { const el = $("f_" + k); if (el) el.classList.toggle("pend", pend.includes(k)); });
    if (!prox) { $("m-falta").textContent = pend.length ? "Campos pendentes (em amarelo): " + pend.map(rotulo).join(", ") : ""; return; }
    const f = faltando(tmp, prox.id);
    $("m-falta").textContent = f.length
      ? (adm ? "Para avançar sem pendências, preencha: " : "Para avançar, preencha: ") + f.map(rotulo).join(", ")
      : (pend.length ? "Campos pendentes (em amarelo): " + pend.map(rotulo).join(", ") : "");
    $("b-prox").disabled = f.length > 0 && !adm;
  };
  $("m-body").oninput = atualizaFalta;
  $("m-body").onchange = atualizaFalta;
  atualizaFalta();

  const gravar = () => {
    const faltaIni = REQ.chegada.filter(k => !val(k));
    if (faltaIni.length) {
      faltaIni.forEach(k => $("f_" + k).classList.add("bad"));
      toast("Campos iniciais obrigatórios: " + faltaIni.map(k => LABEL[k]).join(", ")); return false;
    }
    Object.keys(LABEL).forEach(k => { if ($("f_" + k)) c[k] = val(k); });
    save(); return true;
  };
  $("b-salvar").onclick = () => { if (gravar()) { fechar(); render(); } };
  if (prox) $("b-prox").onclick = () => { if (gravar()) { const ok = mover(c, prox.id); if (ok) fechar(); } };
  if (ant) $("b-volta").onclick = () => { if (gravar() && mover(c, ant.id)) fechar(); };
  if (somenteLeitura(c)) ["b-salvar", "b-volta", "b-prox"].forEach(bid => { const b = $(bid); if (b) b.disabled = true; });   // OS enviada

  // escolher "Condenado" na garantia pede confirmação e leva a OS ao kanban de condenados
  let garAnt = c.garantia || "";
  $("f_garantia").addEventListener("change", () => {
    if ($("f_garantia").value !== "Condenado") { garAnt = $("f_garantia").value; return; }
    confirmarCondenado(c, () => {
      if (!gravar()) { $("f_garantia").value = garAnt; return; }
      c.col = "condenado"; save(); fechar(); render();
      toast("OS movida para “" + colName("condenado") + "”");
    }, () => { $("f_garantia").value = garAnt; atualizaFalta(); });
  });
  if ($("b-del")) $("b-del").onclick = () => {
    if (confirm("Excluir esta OS definitivamente?")) { S.cards = S.cards.filter(x => x.id !== id); S.deleted = [...(S.deleted || []), id]; save(); fechar(); render(); }
  };
}

function confirmarCondenado(c, sim, nao) {
  $("conf-msg").innerHTML = `Tem certeza que deseja marcar <b>${esc(c.equipamento)} ${esc(c.modelo)}${c.os ? " — OS " + esc(c.os) : ""}</b> como <b>Condenado</b>?<br>A OS será movida automaticamente para “${esc(colName("condenado"))}”.`;
  $("conf").hidden = false;
  const fim = cb => { $("conf").hidden = true; document.removeEventListener("keydown", esc_); cb(); };
  const esc_ = e => { if (e.key === "Escape") { e.stopImmediatePropagation(); fim(nao); } };
  document.addEventListener("keydown", esc_, true);
  $("conf-yes").onclick = () => fim(sim);
  $("conf-no").onclick = $("conf-x").onclick = () => fim(nao);
}

/* ===== Visibilidade dos kanbans e dos cards do topo, por perfil (só o Administrador) ===== */
// Novos kanbans entram automaticamente para o Administrador e o Vendedor; os demais perfis só passam a ver se o Administrador marcar
function liberarNovoKanban(id) {
  const linhas = [];
  ["admin", "vendedor"].forEach(p => {
    if (!VIS[p]) return;                         // sem lista própria: já vê todos
    VIS[p] = [...VIS[p], id];
    const l = { perfil: p, colunas: VIS[p] };
    if (CARDS[p]) { CARDS[p] = [...CARDS[p], id]; l.cards = CARDS[p]; }
    linhas.push(l);
  });
  if (linhas.length) api("/api/painel/visibilidade", { linhas }).catch(e => toast("Não foi possível liberar o novo kanban: " + e.message, true));
}
function abrirVisibilidade() {
  if (!P().editarTudo) return;
  const perfis = ["admin", "vendedor", "manutencao", "expedicao"];
  const ids = S.cols.map(c => c.id);
  const ordenar = set => ["aberto", ...ids, "atrasadas"].filter(x => set.has(x));
  const original = {}, rk = {}, rc = {}, manual = {};
  perfis.forEach(p => {
    original[p] = { cols: new Set(colunasDe(p) || ids), cards: new Set(CARDS[p] || cardsPadrao(p)) };
    rk[p] = new Set(original[p].cols);           // kanbans visíveis (rascunho)
    rc[p] = new Set(original[p].cards);          // cards do topo (rascunho)
    manual[p] = !!CARDS[p];                      // enquanto não escolher os cards à mão, eles acompanham os kanbans
  });
  let atual = "vendedor";
  modal = { modo: "vis" };
  abrirModal("Visibilidade por perfil",
    `<p class="hint">Escolha um perfil. Marque os <b>kanbans</b> que ele vê e, separadamente, os <b>cards de resumo</b> do topo. Um não depende do outro.</p>
     <div class="perfis vis-tabs" id="vis-tabs">${perfis.map(p => `<button type="button" class="perfil-op" data-p="${p}">${PERFIS[p].nome}</button>`).join("")}</div>
     <h4 class="vis-h">Kanbans visíveis</h4><div class="vis-lista" id="vis-kanbans"></div>
     <h4 class="vis-h">Cards do topo</h4><div class="vis-lista" id="vis-cards"></div>
     <p class="hint">“Em aberto” soma todas as OS não enviadas nem condenadas e mostra o valor total só para Administrador e Vendedor. “Atrasadas” conta apenas as OS dos kanbans visíveis. Um card de kanban oculto mostra a contagem do servidor.</p>`,
    `<button class="btn" onclick="tentarFechar()">Cancelar</button><button class="btn green" id="vis-salvar">Salvar</button>`);
  const estado = () => JSON.stringify(perfis.map(p => [[...rk[p]].sort(), [...rc[p]].sort(), manual[p]]));
  const inicial = estado();
  modal.sujo = () => estado() !== inicial;
  const item = (tipo, id, nome, marcado) =>
    `<label class="vis-item"><input type="checkbox" data-${tipo}="${esc(id)}" ${marcado ? "checked" : ""}> <span>${esc(nome)}</span></label>`;
  const desenhar = () => {
    document.querySelectorAll("#vis-tabs .perfil-op").forEach(b => b.classList.toggle("sel", b.dataset.p === atual));
    $("vis-kanbans").innerHTML = S.cols.map(c => item("k", c.id, c.name, rk[atual].has(c.id))).join("");
    $("vis-cards").innerHTML = item("t", "aberto", "Em aberto (total de OS e valor)", rc[atual].has("aberto"))
      + S.cols.map(c => item("t", c.id, c.name, rc[atual].has(c.id))).join("")
      + item("t", "atrasadas", "Atrasadas", rc[atual].has("atrasadas"));
  };
  const alterna = (set, id, v) => v ? set.add(id) : set.delete(id);
  $("vis-tabs").onclick = e => { const b = e.target.closest(".perfil-op"); if (b) { atual = b.dataset.p; desenhar(); } };
  $("vis-kanbans").onchange = e => {
    const cb = e.target.closest("input[data-k]"); if (!cb) return;
    alterna(rk[atual], cb.dataset.k, cb.checked);
    if (!manual[atual]) { alterna(rc[atual], cb.dataset.k, cb.checked); desenhar(); }   // cards ainda acompanham os kanbans
  };
  $("vis-cards").onchange = e => {
    const cb = e.target.closest("input[data-t]"); if (!cb) return;
    alterna(rc[atual], cb.dataset.t, cb.checked); manual[atual] = true;
  };
  desenhar();
  $("vis-salvar").onclick = async () => {
    const igual = (a, b) => [...a].sort().join() === [...b].sort().join();
    const linhas = [];
    perfis.forEach(p => {
      const mudouK = !igual(rk[p], original[p].cols);
      const mudouC = manual[p] && !igual(rc[p], original[p].cards);
      if (!mudouK && !mudouC) return;
      const l = { perfil: p, colunas: ordenar(rk[p]).filter(x => ids.includes(x)) };
      if (mudouC) l.cards = ordenar(rc[p]);
      linhas.push(l);
    });
    if (!linhas.length) return fechar();
    $("vis-salvar").disabled = true;
    try {
      await api("/api/painel/visibilidade", { linhas });
    } catch (e) {
      $("vis-salvar").disabled = false;
      return toast("Não foi possível salvar a visibilidade: " + (e.message || e), true);
    }
    linhas.forEach(l => { VIS[l.perfil] = l.colunas; if (l.cards) CARDS[l.perfil] = l.cards; });
    fechar(); render(); toast("Visibilidade atualizada");
  };
}
let tt;
function toast(m, erro) {                      // erros ficam mais tempo na tela e podem ser fechados com um clique
  const t = $("toast"); t.textContent = m; t.hidden = false; t.classList.toggle("err", !!erro);
  clearTimeout(tt); tt = setTimeout(() => t.hidden = true, erro ? 12000 : 4500);
}
$("toast").onclick = () => { $("toast").hidden = true; };

/* ===== Início ===== */
$("b-nova2").onclick = novaOS;
$("versao").textContent = "Versão " + VERSAO; $("perfil-nome").title = "Versão " + VERSAO;
$("b-vis").onclick = abrirVisibilidade;
$("user").onclick = () => { termo = ""; $("busca").value = ""; render(); };
$("busca").oninput = e => { termo = e.target.value; render(); };
$("b-atualizar").onclick = () => sincronizar(true);
$("hoje").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
snapshot();

/* ===== Início da sessão (login vem do Smart) ===== */
function aplicarPerfil() {
  $("b-nova2").hidden = !P().criar;
  $("b-vis").hidden = !P().editarTudo;
  $("perfil-nome").textContent = P().nome;
  $("user").textContent = P().nome.slice(0, 2).toUpperCase();
  termo = ""; $("busca").value = "";
}
function entrar(role) {
  ROLE = role;
  aplicarPerfil(); S = { cols: [], cards: [] }; snapshot(); render();
  assinarMudancas(); carregar();
}
// Sem sessão do Smart (ou expirada): volta para a tela de login do Smart.
function sair(msg) {
  ROLE = null;
  S = { cols: [], cards: [] }; snapshot();
  location.href = "/";
}
// Vendedor e Expedição só usam o painel: o botão encerra a sessão. Os demais perfis voltam ao Smart.
if (AUTH && (AUTH.role === "vendedor" || AUTH.role === "expedicao")) {
  $("b-sair").textContent = "Sair"; $("b-sair").title = "Encerrar a sessão";
  $("b-sair").onclick = async () => {
    try { await api("/api/logout", {}); } catch (e) {}
    try { localStorage.removeItem("smartReportAuth"); } catch (e) {}
    location.href = "/";
  };
} else $("b-sair").onclick = () => { location.href = "/"; };
(async function iniciar() {
  if (!AUTH || !AUTH.token) { location.href = "/"; return; }
  try {
    const d = await api("/api/painel");          // o servidor diz qual é o perfil deste usuário
    entrar(d.perfil in PERFIS ? d.perfil : "manutencao");
  } catch (e) { location.href = "/"; }
})();
let diaAtual = iso(hoje());
setInterval(() => {                    // na virada do dia, recalcula atrasos e pede novas justificativas
  if (iso(hoje()) !== diaAtual) { diaAtual = iso(hoje()); render(); }
}, 60 * 1000);
