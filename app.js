'use strict';

/* =========================================================
   Minhas Finanças — app de controle financeiro (PWA)
   Os dados ficam salvos no próprio aparelho (localStorage).
   ========================================================= */

const CHAVE = 'financas-v1';
const CORES = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#64748b', '#9f1239'];
const DIAS_LEMBRETE_BACKUP = 30;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function dadosIniciais() {
  let i = 0;
  const cat = (nome, tipo) => ({ id: uid(), nome, tipo, cor: CORES[i++ % CORES.length] });
  return {
    versao: 1,
    contas: [
      { id: uid(), nome: 'Flash', orcamento: 1144, cor: '#db2777' },
      { id: uid(), nome: 'Cartão de crédito', orcamento: 0, cor: '#2563eb' },
      { id: uid(), nome: 'Conta corrente', orcamento: 0, cor: '#0f766e' },
    ],
    categorias: [
      ...['Mercado', 'Refeição', 'Proteína', 'Frutas', 'Doce', 'Banheiro', 'Roupa', 'Casa',
        'Transporte', 'Saúde', 'Lazer', 'Assinaturas', 'Outros'].map(n => cat(n, 'despesa')),
      ...['Salário', 'Benefício', 'Reembolso', 'Outras receitas'].map(n => cat(n, 'receita')),
    ],
    lancamentos: [],
    ultimoBackup: null,
  };
}

// ---------- Armazenamento ----------

function normalizar(d) {
  if (!d || !Array.isArray(d.contas) || !Array.isArray(d.categorias) || !Array.isArray(d.lancamentos)) {
    throw new Error('Arquivo não parece um backup deste app.');
  }
  d.versao = 1;
  d.ultimoBackup = d.ultimoBackup || null;
  d.contas.forEach(c => { c.orcamento = Number(c.orcamento) || 0; c.cor = c.cor || CORES[0]; });
  d.lancamentos.forEach(l => {
    l.quantidade = Number(l.quantidade) || 1;
    l.valorUnitario = Number(l.valorUnitario) || 0;
    l.valor = arred(l.quantidade * l.valorUnitario);
    l.criado = l.criado || 0;
  });
  return d;
}

const arred = v => Math.round(v * 100) / 100;

function carregar() {
  const texto = localStorage.getItem(CHAVE);
  if (!texto) return dadosIniciais();
  try {
    return normalizar(JSON.parse(texto));
  } catch (e) {
    // Nunca sobrescreve dados que não conseguiu ler: guarda uma cópia antes de recomeçar
    console.error(e);
    localStorage.setItem(`${CHAVE}-ilegivel-${Date.now()}`, texto);
    alert('Não foi possível ler os dados salvos. Uma cópia foi guardada; restaure um backup em Ajustes.');
    return dadosIniciais();
  }
}

function salvar() {
  localStorage.setItem(CHAVE, JSON.stringify(db));
}

let db = carregar();
salvar();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

// ---------- Utilidades ----------

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = v => fmtBRL.format(v || 0);
const eixo = v => v >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : Math.round(v).toLocaleString('pt-BR');
const num = v => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const pct = v => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = sel => document.querySelector(sel);

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const mesDe = data => data.slice(0, 7);
const mesAtual = () => mesDe(hoje());

function somarMes(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function diasNoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m, 0).getDate();
}
function nomeMes(mes, curto) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1, 1);
  return curto
    ? d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
    : d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
function nomeDia(data) {
  const [a, m, d] = data.split('-').map(Number);
  const s = new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  return s[0].toUpperCase() + s.slice(1);
}

// Aceita "52,11", "16.75-1.76", "3*4,29" etc. (como fórmula do Excel)
function avaliarValor(texto) {
  const s = String(texto || '').trim().replace(/^=/, '').replace(/,/g, '.');
  if (!s) return NaN;
  if (!/^[\d+\-*/().\s]+$/.test(s)) return NaN;
  try {
    const v = Function(`"use strict"; return (${s});`)();
    return Number.isFinite(v) ? v : NaN;
  } catch (e) {
    return NaN;
  }
}

const contaPorId = id => db.contas.find(c => c.id === id);
const catPorId = id => db.categorias.find(c => c.id === id);

function lancamentosDoMes(mes, contaId) {
  return db.lancamentos.filter(l => mesDe(l.data) === mes && (!contaId || contaId === 'todas' || l.contaId === contaId));
}
const somaTipo = (lista, tipo) => arred(lista.filter(l => l.tipo === tipo).reduce((s, l) => s + l.valor, 0));

function ordenarRecentes(lista) {
  return [...lista].sort((a, b) => (b.data.localeCompare(a.data)) || (b.criado - a.criado));
}

function aviso(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.classList.add('mostrar');
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => el.classList.remove('mostrar'), 2200);
}

// ---------- Estado da tela ----------

const estado = {
  aba: 'inicio',
  mes: mesAtual(),
  filtroConta: 'todas',
  busca: '',
  contaAnalise: 'todas',
};

function render() {
  const titulo = nomeMes(estado.mes);
  $('#mes-titulo').textContent = titulo[0].toUpperCase() + titulo.slice(1);
  document.querySelectorAll('.abas [data-aba]').forEach(b => b.classList.toggle('ativa', b.dataset.aba === estado.aba));
  const telas = { inicio: telaInicio, lancamentos: telaLancamentos, analise: telaAnalise, ajustes: telaAjustes };
  $('#conteudo').innerHTML = telas[estado.aba]();
  if (estado.aba === 'lancamentos') $('#lista-lanc').innerHTML = listaLancamentos();
}

// ---------- Tela: Início ----------

function infoOrcamento(conta, mes) {
  const gasto = somaTipo(lancamentosDoMes(mes, conta.id), 'despesa');
  const resta = arred(conta.orcamento - gasto);
  const uso = conta.orcamento > 0 ? gasto / conta.orcamento : 0;
  let porDia = null, diasRestantes = 0;
  if (mes === mesAtual() && resta > 0) {
    diasRestantes = diasNoMes(mes) - Number(hoje().slice(8)) + 1;
    porDia = resta / diasRestantes;
  }
  return { gasto, resta, uso, porDia, diasRestantes };
}

function cartaoConta(conta) {
  const lista = lancamentosDoMes(estado.mes, conta.id);
  if (!(conta.orcamento > 0)) {
    const gasto = somaTipo(lista, 'despesa');
    const receita = somaTipo(lista, 'receita');
    return `<div class="cartao"><div class="conta-topo">
      <span class="conta-nome"><span class="ponto" style="display:inline-block;background:${esc(conta.cor)}"></span> ${esc(conta.nome)}</span>
      <span class="conta-valor">${receita ? `<span class="pos">+${brl(receita)}</span> · ` : ''}<span class="neg">${brl(gasto)}</span></span>
    </div></div>`;
  }
  const o = infoOrcamento(conta, estado.mes);
  const classe = o.uso >= 1 ? 'estouro' : o.uso >= 0.8 ? 'alerta' : '';
  return `<div class="cartao">
    <div class="conta-topo">
      <span class="conta-nome"><span class="ponto" style="display:inline-block;background:${esc(conta.cor)}"></span> ${esc(conta.nome)}</span>
      <span class="conta-valor">${brl(o.gasto)} de ${brl(conta.orcamento)}</span>
    </div>
    <div class="barra ${classe}"><i style="width:${Math.min(100, o.uso * 100)}%"></i></div>
    <div class="conta-rodape">
      <span>${o.resta >= 0 ? `Restam <b>${brl(o.resta)}</b>` : `Passou <b class="neg">${brl(-o.resta)}</b>`} (${pct(o.uso)} usado)</span>
      ${o.porDia !== null ? `<span>≈ <b>${brl(o.porDia)}</b>/dia por ${o.diasRestantes} dia${o.diasRestantes > 1 ? 's' : ''}</span>` : ''}
    </div>
  </div>`;
}

function telaInicio() {
  const lista = lancamentosDoMes(estado.mes);
  const rec = somaTipo(lista, 'receita');
  const desp = somaTipo(lista, 'despesa');
  const saldo = arred(rec - desp);

  let banner = '';
  const dias = db.ultimoBackup ? (Date.now() - new Date(db.ultimoBackup).getTime()) / 864e5 : Infinity;
  if (db.lancamentos.length >= 5 && dias > DIAS_LEMBRETE_BACKUP) {
    banner = `<div class="banner">💾 Seus dados ficam só neste aparelho. ${db.ultimoBackup ? 'Faz um tempo desde o último backup.' : 'Que tal fazer um backup?'}
      <button class="btn-texto" data-acao="exportar-json">Fazer backup</button></div>`;
  }

  const recentes = ordenarRecentes(lista).slice(0, 5);
  return `${banner}
    <div class="cartao resumo">
      <div><small>Receitas</small><strong class="pos">${brl(rec)}</strong></div>
      <div><small>Despesas</small><strong class="neg">${brl(desp)}</strong></div>
      <div><small>Saldo</small><strong class="${saldo >= 0 ? 'pos' : 'neg'}">${brl(saldo)}</strong></div>
    </div>
    <h2>Contas e orçamentos</h2>
    ${db.contas.map(cartaoConta).join('')}
    <h2>Últimos lançamentos</h2>
    ${recentes.length ? `<div class="lista">${recentes.map(linhaLancamento).join('')}</div>
      <button class="btn-texto" data-aba="lancamentos">Ver todos →</button>`
      : `<div class="vazio">Nenhum lançamento neste mês.<br>Toque no <b>+</b> para adicionar.</div>`}`;
}

// ---------- Tela: Lançamentos ----------

function linhaLancamento(l) {
  const cat = catPorId(l.categoriaId);
  const conta = contaPorId(l.contaId);
  const sub = [cat ? cat.nome : 'Sem categoria', conta ? conta.nome : ''].filter(Boolean).join(' · ');
  const qtd = l.quantidade !== 1 ? ` · ${num(l.quantidade)} × ${brl(l.valorUnitario)}` : '';
  return `<button class="item" data-lanc="${l.id}">
    <span class="ponto" style="background:${esc(cat ? cat.cor : '#999')}"></span>
    <span class="item-meio"><div class="item-desc">${esc(l.descricao)}</div><div class="item-sub">${esc(sub)}${qtd}</div></span>
    <span class="item-valor ${l.tipo === 'receita' ? 'pos' : ''}">${l.tipo === 'receita' ? '+' : '−'}${brl(l.valor)}</span>
  </button>`;
}

function telaLancamentos() {
  const chips = [{ id: 'todas', nome: 'Todas' }, ...db.contas]
    .map(c => `<button class="chip ${estado.filtroConta === c.id ? 'ativo' : ''}" data-filtro="${c.id}">${esc(c.nome)}</button>`).join('');
  return `<div class="filtros">${chips}</div>
    <input class="busca" type="search" id="busca" placeholder="Buscar por descrição ou categoria" value="${esc(estado.busca)}">
    <div id="lista-lanc"></div>`;
}

function listaLancamentos() {
  const termo = estado.busca.trim().toLowerCase();
  let lista = lancamentosDoMes(estado.mes, estado.filtroConta);
  if (termo) {
    lista = lista.filter(l => l.descricao.toLowerCase().includes(termo) ||
      (catPorId(l.categoriaId)?.nome || '').toLowerCase().includes(termo));
  }
  if (!lista.length) return `<div class="vazio">Nenhum lançamento encontrado.</div>`;

  const grupos = new Map();
  ordenarRecentes(lista).forEach(l => {
    if (!grupos.has(l.data)) grupos.set(l.data, []);
    grupos.get(l.data).push(l);
  });
  const desp = somaTipo(lista, 'despesa'), rec = somaTipo(lista, 'receita');
  let html = `<p class="nota">${lista.length} lançamento${lista.length > 1 ? 's' : ''} · despesas <b class="neg">${brl(desp)}</b>${rec ? ` · receitas <b class="pos">${brl(rec)}</b>` : ''}</p>`;
  for (const [data, itens] of grupos) {
    const totalDia = somaTipo(itens, 'despesa');
    html += `<div class="dia-grupo"><div class="dia-titulo"><span>${nomeDia(data)}</span><span>${totalDia ? '−' + brl(totalDia) : ''}</span></div>
      <div class="lista">${itens.map(linhaLancamento).join('')}</div></div>`;
  }
  return html;
}

// ---------- Tela: Análise ----------

function telaAnalise() {
  const contaSel = estado.contaAnalise === 'todas' ? null : contaPorId(estado.contaAnalise);
  if (!contaSel) estado.contaAnalise = 'todas';
  const lista = lancamentosDoMes(estado.mes, estado.contaAnalise).filter(l => l.tipo === 'despesa');
  const total = somaTipo(lista, 'despesa');
  const orcamento = contaSel ? contaSel.orcamento : db.contas.reduce((s, c) => s + c.orcamento, 0);

  const ehAtual = estado.mes === mesAtual();
  const futuro = estado.mes > mesAtual();
  const diasDecorridos = futuro ? 0 : ehAtual ? Number(hoje().slice(8)) : diasNoMes(estado.mes);
  const maior = lista.reduce((m, l) => (!m || l.valor > m.valor ? l : m), null);

  const opcoes = [{ id: 'todas', nome: 'Todas as contas' }, ...db.contas]
    .map(c => `<option value="${c.id}" ${estado.contaAnalise === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');

  const kpis = [
    ['Total gasto', `<span class="neg">${brl(total)}</span>`],
    orcamento > 0 ? ['Saldo do orçamento', `<span class="${orcamento - total >= 0 ? 'pos' : 'neg'}">${brl(orcamento - total)}</span>`] : null,
    orcamento > 0 ? ['% do orçamento usado', pct(total / orcamento)] : null,
    ['Nº de itens', lista.length],
    ['Média por dia', brl(diasDecorridos ? total / diasDecorridos : 0)],
    ['Ticket médio por item', brl(lista.length ? total / lista.length : 0)],
    maior ? ['Maior gasto', `${brl(maior.valor)}<small>${esc(maior.descricao)}</small>`] : null,
  ].filter(Boolean).map(([r, v]) => `<div><small>${r}</small><strong>${v}</strong></div>`).join('');

  return `<select class="seletor" id="conta-analise">${opcoes}</select>
    <div class="kpis">${kpis}</div>
    <h2>Gasto por categoria</h2>
    <div class="cartao">${porCategoria(lista, total)}</div>
    <h2>Evolução no mês</h2>
    <div class="cartao grafico">${graficoDiario(lista, orcamento, futuro ? 0 : ehAtual ? diasDecorridos : diasNoMes(estado.mes))}</div>
    <h2>Últimos 6 meses</h2>
    <div class="cartao grafico">${graficoMeses()}</div>`;
}

function porCategoria(lista, total) {
  if (!lista.length) return `<div class="vazio">Sem despesas neste mês.</div>`;
  const mapa = new Map();
  lista.forEach(l => {
    const r = mapa.get(l.categoriaId) || { total: 0, n: 0 };
    r.total += l.valor; r.n++;
    mapa.set(l.categoriaId, r);
  });
  return [...mapa.entries()].sort((a, b) => b[1].total - a[1].total).map(([id, r]) => {
    const cat = catPorId(id);
    const p = total ? r.total / total : 0;
    return `<div class="cat-linha">
      <div class="cat-topo"><span>${esc(cat ? cat.nome : 'Sem categoria')} <small class="nota">(${r.n})</small></span><span>${brl(r.total)} · ${pct(p)}</span></div>
      <div class="cat-barra"><i style="width:${p * 100}%;background:${esc(cat ? cat.cor : '#999')}"></i></div>
    </div>`;
  }).join('');
}

function graficoDiario(lista, orcamento, ateDia) {
  const N = diasNoMes(estado.mes);
  const porDia = Array(N + 1).fill(0);
  lista.forEach(l => { porDia[Number(l.data.slice(8))] += l.valor; });
  const acum = [];
  let s = 0;
  for (let d = 1; d <= N; d++) { s += porDia[d]; acum[d] = s; }

  const W = 340, H = 190, E = 38, D = 8, T = 10, B = 22;
  const maxV = Math.max(orcamento, s, 1) * 1.08;
  const x = d => E + (d - 0.5) * (W - E - D) / N;
  const y = v => H - B - v * (H - B - T) / maxV;
  const larg = Math.max(1, (W - E - D) / N - 2);

  let svg = '';
  [0, 0.5, 1].forEach(f => {
    const v = maxV / 1.08 * f;
    svg += `<line x1="${E}" x2="${W - D}" y1="${y(v)}" y2="${y(v)}" stroke="var(--borda)"/>
      <text x="${E - 4}" y="${y(v) + 3}" text-anchor="end">${eixo(v)}</text>`;
  });
  for (let d = 1; d <= N; d++) {
    if (porDia[d] > 0) svg += `<rect x="${x(d) - larg / 2}" y="${y(porDia[d])}" width="${larg}" height="${H - B - y(porDia[d])}" fill="var(--marca-claro)" rx="1.5"><title>Dia ${d}: ${brl(porDia[d])}</title></rect>`;
    if (d === 1 || d % 5 === 0) svg += `<text x="${x(d)}" y="${H - 6}" text-anchor="middle">${d}</text>`;
  }
  if (orcamento > 0) {
    svg += `<line x1="${E}" x2="${W - D}" y1="${y(orcamento)}" y2="${y(orcamento)}" stroke="var(--perigo)" stroke-dasharray="5 4" stroke-width="1.5"/>`;
  }
  if (ateDia > 0) {
    const pts = [];
    for (let d = 1; d <= ateDia; d++) pts.push(`${x(d).toFixed(1)},${y(acum[d]).toFixed(1)}`);
    svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--marca)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto acumulado por dia">${svg}</svg>
    <div class="legenda"><span><i style="background:var(--marca)"></i>Acumulado</span><span><i style="background:var(--marca-claro);height:8px"></i>Gasto no dia</span>${orcamento > 0 ? '<span><i style="background:var(--perigo)"></i>Orçamento</span>' : ''}</div>`;
}

function graficoMeses() {
  const meses = [];
  for (let i = 5; i >= 0; i--) meses.push(somarMes(estado.mes, -i));
  const dados = meses.map(m => {
    const l = lancamentosDoMes(m, estado.contaAnalise);
    return { m, desp: somaTipo(l, 'despesa'), rec: somaTipo(l, 'receita') };
  });
  const W = 340, H = 170, E = 38, D = 8, T = 10, B = 22;
  const maxV = Math.max(1, ...dados.map(d => Math.max(d.desp, d.rec))) * 1.08;
  const passo = (W - E - D) / meses.length;
  const y = v => H - B - v * (H - B - T) / maxV;
  const larg = Math.min(18, passo / 2 - 4);
  let svg = '';
  [0, 0.5, 1].forEach(f => {
    const v = maxV / 1.08 * f;
    svg += `<line x1="${E}" x2="${W - D}" y1="${y(v)}" y2="${y(v)}" stroke="var(--borda)"/>
      <text x="${E - 4}" y="${y(v) + 3}" text-anchor="end">${eixo(v)}</text>`;
  });
  dados.forEach((d, i) => {
    const cx = E + passo * (i + 0.5);
    svg += `<rect x="${cx - larg - 1}" y="${y(d.rec)}" width="${larg}" height="${H - B - y(d.rec)}" fill="var(--receita)" rx="2"><title>Receitas: ${brl(d.rec)}</title></rect>
      <rect x="${cx + 1}" y="${y(d.desp)}" width="${larg}" height="${H - B - y(d.desp)}" fill="var(--despesa)" rx="2"><title>Despesas: ${brl(d.desp)}</title></rect>
      <text x="${cx}" y="${H - 6}" text-anchor="middle">${nomeMes(d.m, true)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e despesas por mês">${svg}</svg>
    <div class="legenda"><span><i style="background:var(--receita);height:8px"></i>Receitas</span><span><i style="background:var(--despesa);height:8px"></i>Despesas</span></div>`;
}

// ---------- Tela: Ajustes ----------

function telaAjustes() {
  const contas = db.contas.map(c => `<div class="ajuste-linha"><button class="item" data-conta="${c.id}">
      <span class="ponto" style="background:${esc(c.cor)}"></span>
      <span class="item-meio"><div class="item-desc">${esc(c.nome)}</div><div class="item-sub">${c.orcamento > 0 ? 'Orçamento mensal ' + brl(c.orcamento) : 'Sem orçamento'}</div></span>
      <span class="nota">›</span></button></div>`).join('');
  const cats = tipo => db.categorias.filter(c => c.tipo === tipo).map(c => `<div class="ajuste-linha"><button class="item" data-cat="${c.id}">
      <span class="ponto" style="background:${esc(c.cor)}"></span>
      <span class="item-meio"><div class="item-desc">${esc(c.nome)}</div></span><span class="nota">›</span></button></div>`).join('');
  const ultimo = db.ultimoBackup ? new Date(db.ultimoBackup).toLocaleDateString('pt-BR') : 'nunca';

  return `<h2>Contas</h2>
    <div class="cartao">${contas}<button class="btn-texto" data-acao="nova-conta">+ Nova conta</button></div>
    <h2>Categorias de despesa</h2>
    <div class="cartao">${cats('despesa')}<button class="btn-texto" data-acao="nova-cat" data-tipo="despesa">+ Nova categoria</button></div>
    <h2>Categorias de receita</h2>
    <div class="cartao">${cats('receita')}<button class="btn-texto" data-acao="nova-cat" data-tipo="receita">+ Nova categoria</button></div>
    <h2>Backup</h2>
    <div class="cartao">
      <p class="nota" style="margin-top:0">Os dados ficam salvos <b>só neste aparelho</b>. Faça backup de vez em quando — dá para salvar no Drive, mandar por e-mail etc. Último backup: <b>${ultimo}</b>.</p>
      <button class="btn prim largo" data-acao="exportar-json">Fazer backup (arquivo .json)</button>
      <button class="btn largo" data-acao="importar-json">Restaurar backup</button>
      <button class="btn largo" data-acao="exportar-csv">Exportar para Excel (.csv)</button>
    </div>
    <h2>Instalar no celular</h2>
    <div class="cartao nota">
      <p style="margin-top:0"><b>iPhone:</b> abra no Safari → botão Compartilhar → “Adicionar à Tela de Início”.</p>
      <p style="margin-bottom:0"><b>Android:</b> abra no Chrome → menu ⋮ → “Instalar app” ou “Adicionar à tela inicial”.</p>
    </div>
    <h2>Zona de perigo</h2>
    <div class="cartao"><button class="btn perigo" data-acao="apagar-tudo">Apagar todos os dados deste aparelho</button></div>
    <p class="nota" style="text-align:center">${db.lancamentos.length} lançamentos guardados</p>`;
}

// ---------- Formulário de lançamento ----------

const dlgLanc = $('#dlg-lanc');
const formLanc = $('#form-lanc');
let lancEditando = null;

function preencherCategorias(tipo, selecionada) {
  const cats = db.categorias.filter(c => c.tipo === tipo);
  formLanc.categoriaId.innerHTML = cats.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  if (selecionada && cats.some(c => c.id === selecionada)) formLanc.categoriaId.value = selecionada;
}

function atualizarTotal() {
  const v = avaliarValor(formLanc.valor.value);
  const q = avaliarValor(formLanc.quantidade.value || '1');
  const mostrar = Number.isFinite(v) && Number.isFinite(q) && (q !== 1 || /[+\-*/]/.test(formLanc.valor.value.replace(/^-/, '')));
  $('#lanc-total').textContent = mostrar ? `Total: ${brl(arred(v * q))}` : '';
}

function abrirLancamento(l) {
  lancEditando = l || null;
  formLanc.reset();
  $('#lanc-erro').textContent = '';
  $('#lanc-titulo').textContent = l ? 'Editar lançamento' : 'Novo lançamento';
  formLanc.querySelector('[data-acao="excluir-lanc"]').hidden = !l;
  formLanc.querySelector('[data-acao="salvar-outro"]').hidden = !!l;

  const nomes = [...new Set(ordenarRecentes(db.lancamentos).map(x => x.descricao))].slice(0, 300);
  $('#sugestoes').innerHTML = nomes.map(n => `<option value="${esc(n)}">`).join('');
  formLanc.contaId.innerHTML = db.contas.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');

  if (l) {
    formLanc.tipo.value = l.tipo;
    formLanc.descricao.value = l.descricao;
    formLanc.valor.value = String(l.valorUnitario).replace('.', ',');
    formLanc.quantidade.value = String(l.quantidade).replace('.', ',');
    formLanc.contaId.value = l.contaId;
    formLanc.data.value = l.data;
    preencherCategorias(l.tipo, l.categoriaId);
  } else {
    const ultimo = ordenarRecentes(db.lancamentos)[0];
    formLanc.tipo.value = 'despesa';
    formLanc.quantidade.value = '1';
    if (ultimo && contaPorId(ultimo.contaId)) formLanc.contaId.value = ultimo.contaId;
    formLanc.data.value = estado.mes === mesAtual() ? hoje() : `${estado.mes}-01`;
    preencherCategorias('despesa');
  }
  atualizarTotal();
  dlgLanc.showModal();
  if (!l) formLanc.descricao.focus();
}

function lerFormulario() {
  const f = formLanc;
  const descricao = f.descricao.value.trim();
  const valorUnitario = avaliarValor(f.valor.value);
  const quantidade = avaliarValor(f.quantidade.value || '1');
  if (!descricao) return 'Preencha a descrição.';
  if (!Number.isFinite(valorUnitario) || valorUnitario <= 0) return 'Valor inválido. Use números, como 52,11 ou 16,75-1,76.';
  if (!Number.isFinite(quantidade) || quantidade <= 0) return 'Quantidade inválida.';
  if (!f.data.value) return 'Escolha a data.';
  return {
    tipo: f.tipo.value,
    descricao,
    valorUnitario: arred(valorUnitario),
    quantidade,
    valor: arred(valorUnitario * quantidade),
    categoriaId: f.categoriaId.value,
    contaId: f.contaId.value,
    data: f.data.value,
  };
}

function salvarLancamento(continuar) {
  const r = lerFormulario();
  if (typeof r === 'string') { $('#lanc-erro').textContent = r; return; }
  if (lancEditando) {
    Object.assign(lancEditando, r);
  } else {
    db.lancamentos.push({ id: uid(), criado: Date.now(), ...r });
  }
  salvar();
  if (mesDe(r.data) !== estado.mes && !lancEditando) estado.mes = mesDe(r.data);
  render();
  if (continuar) {
    formLanc.descricao.value = '';
    formLanc.valor.value = '';
    formLanc.quantidade.value = '1';
    $('#lanc-erro').textContent = '';
    atualizarTotal();
    formLanc.descricao.focus();
    aviso(`“${r.descricao}” salvo`);
  } else {
    dlgLanc.close();
    aviso(lancEditando ? 'Lançamento atualizado' : 'Lançamento salvo');
  }
}

formLanc.addEventListener('submit', e => { e.preventDefault(); salvarLancamento(false); });
formLanc.addEventListener('input', e => {
  if (e.target.name === 'valor' || e.target.name === 'quantidade') atualizarTotal();
});
formLanc.addEventListener('change', e => {
  if (e.target.name === 'tipo') preencherCategorias(e.target.value);
  // Ao escolher uma descrição já usada, repete categoria, conta e valor da última vez
  if (e.target.name === 'descricao' && !lancEditando) {
    const nome = e.target.value.trim().toLowerCase();
    const anterior = ordenarRecentes(db.lancamentos).find(l => l.descricao.toLowerCase() === nome);
    if (anterior) {
      formLanc.tipo.value = anterior.tipo;
      preencherCategorias(anterior.tipo, anterior.categoriaId);
      if (contaPorId(anterior.contaId)) formLanc.contaId.value = anterior.contaId;
      if (!formLanc.valor.value) formLanc.valor.value = String(anterior.valorUnitario).replace('.', ',');
      atualizarTotal();
    }
  }
});

// ---------- Formulário de conta / categoria ----------

const dlgItem = $('#dlg-item');
const formItem = $('#form-item');
let itemEditando = null; // { tipo: 'conta' | 'cat', obj }

function seletorCores(atual) {
  return `<div class="campo">Cor<div class="cores">${CORES.map(c =>
    `<label><input type="radio" name="cor" value="${c}" ${c === atual ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div></div>`;
}

function abrirConta(conta) {
  itemEditando = { tipo: 'conta', obj: conta || null };
  $('#item-titulo').textContent = conta ? 'Editar conta' : 'Nova conta';
  $('#item-campos').innerHTML = `
    <label class="campo">Nome<input name="nome" required value="${esc(conta ? conta.nome : '')}" placeholder="Ex.: Nubank, VR, Poupança"></label>
    <label class="campo">Orçamento mensal (R$) — deixe 0 se não quiser limite
      <input name="orcamento" inputmode="decimal" value="${conta ? String(conta.orcamento).replace('.', ',') : '0'}"></label>
    ${seletorCores(conta ? conta.cor : CORES[db.contas.length % CORES.length])}`;
  abrirItem(!!conta);
}

function abrirCategoria(cat, tipo) {
  itemEditando = { tipo: 'cat', obj: cat || null };
  const t = cat ? cat.tipo : tipo;
  $('#item-titulo').textContent = cat ? 'Editar categoria' : 'Nova categoria';
  $('#item-campos').innerHTML = `
    <div class="segmentado">
      <label><input type="radio" name="tipoCat" value="despesa" ${t === 'despesa' ? 'checked' : ''}><span>Despesa</span></label>
      <label><input type="radio" name="tipoCat" value="receita" ${t === 'receita' ? 'checked' : ''}><span>Receita</span></label>
    </div>
    <label class="campo">Nome<input name="nome" required value="${esc(cat ? cat.nome : '')}"></label>
    ${seletorCores(cat ? cat.cor : CORES[db.categorias.length % CORES.length])}`;
  abrirItem(!!cat);
}

function abrirItem(editando) {
  $('#item-erro').textContent = '';
  formItem.querySelector('[data-acao="excluir-item"]').hidden = !editando;
  dlgItem.showModal();
}

formItem.addEventListener('submit', e => {
  e.preventDefault();
  const nome = formItem.nome.value.trim();
  if (!nome) { $('#item-erro').textContent = 'Preencha o nome.'; return; }
  const cor = formItem.querySelector('input[name="cor"]:checked')?.value || CORES[0];
  if (itemEditando.tipo === 'conta') {
    const orcamento = avaliarValor(formItem.orcamento.value || '0');
    if (!Number.isFinite(orcamento) || orcamento < 0) { $('#item-erro').textContent = 'Orçamento inválido.'; return; }
    const dados = { nome, orcamento: arred(orcamento), cor };
    if (itemEditando.obj) Object.assign(itemEditando.obj, dados);
    else db.contas.push({ id: uid(), ...dados });
  } else {
    const dados = { nome, tipo: formItem.querySelector('input[name="tipoCat"]:checked').value, cor };
    if (itemEditando.obj) Object.assign(itemEditando.obj, dados);
    else db.categorias.push({ id: uid(), ...dados });
  }
  salvar();
  dlgItem.close();
  render();
  aviso('Salvo');
});

function excluirItem() {
  const { tipo, obj } = itemEditando;
  const campo = tipo === 'conta' ? 'contaId' : 'categoriaId';
  const usados = db.lancamentos.filter(l => l[campo] === obj.id).length;
  if (usados) {
    $('#item-erro').textContent = `Não dá para excluir: ${usados} lançamento(s) usam esta ${tipo === 'conta' ? 'conta' : 'categoria'}. Mude esses lançamentos antes.`;
    return;
  }
  if (tipo === 'conta' && db.contas.length === 1) { $('#item-erro').textContent = 'É preciso ter pelo menos uma conta.'; return; }
  if (tipo === 'cat' && db.categorias.filter(c => c.tipo === obj.tipo).length === 1) { $('#item-erro').textContent = 'É preciso ter pelo menos uma categoria deste tipo.'; return; }
  if (!confirm(`Excluir “${obj.nome}”?`)) return;
  if (tipo === 'conta') db.contas = db.contas.filter(c => c !== obj);
  else db.categorias = db.categorias.filter(c => c !== obj);
  salvar();
  dlgItem.close();
  render();
}

// ---------- Backup ----------

async function compartilharOuBaixar(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const arquivo = new File([blob], nome, { type: tipo });
  if (navigator.canShare && navigator.canShare({ files: [arquivo] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [arquivo], title: nome });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

async function exportarJSON() {
  const copia = { ...db, ultimoBackup: new Date().toISOString() };
  const ok = await compartilharOuBaixar(`financas-backup-${hoje()}.json`, JSON.stringify(copia, null, 1), 'application/json');
  if (ok) {
    db.ultimoBackup = copia.ultimoBackup;
    salvar();
    render();
    aviso('Backup gerado');
  }
}

async function exportarCSV() {
  const n = v => String(v).replace('.', ',');
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const linhas = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta', 'Quantidade', 'Valor unitário', 'Valor'].join(';')];
  [...db.lancamentos].sort((a, b) => a.data.localeCompare(b.data) || a.criado - b.criado).forEach(l => {
    linhas.push([l.data.split('-').reverse().join('/'), l.tipo, q(l.descricao), q(catPorId(l.categoriaId)?.nome || ''),
      q(contaPorId(l.contaId)?.nome || ''), n(l.quantidade), n(l.valorUnitario), n(l.valor)].join(';'));
  });
  await compartilharOuBaixar(`financas-${hoje()}.csv`, '﻿' + linhas.join('\r\n'), 'text/csv');
}

$('#arquivo-backup').addEventListener('change', async e => {
  const arq = e.target.files[0];
  e.target.value = '';
  if (!arq) return;
  try {
    const novo = normalizar(JSON.parse(await arq.text()));
    if (!confirm(`Substituir os dados atuais (${db.lancamentos.length} lançamentos) pelos do backup (${novo.lancamentos.length} lançamentos)?`)) return;
    db = novo;
    salvar();
    render();
    aviso('Backup restaurado');
  } catch (err) {
    alert('Não foi possível ler o arquivo: ' + err.message);
  }
});

// ---------- Eventos gerais ----------

document.addEventListener('click', e => {
  const alvo = e.target.closest('[data-acao], [data-aba], [data-lanc], [data-conta], [data-cat], [data-filtro]');
  if (!alvo) return;
  const d = alvo.dataset;

  if (d.aba) { estado.aba = d.aba; render(); window.scrollTo(0, 0); return; }
  if (d.lanc) { abrirLancamento(db.lancamentos.find(l => l.id === d.lanc)); return; }
  if (d.conta) { abrirConta(contaPorId(d.conta)); return; }
  if (d.cat) { abrirCategoria(catPorId(d.cat)); return; }
  if (d.filtro) { estado.filtroConta = d.filtro; render(); return; }

  switch (d.acao) {
    case 'mes-anterior': estado.mes = somarMes(estado.mes, -1); render(); break;
    case 'mes-proximo': estado.mes = somarMes(estado.mes, 1); render(); break;
    case 'novo': abrirLancamento(); break;
    case 'fechar': alvo.closest('dialog').close(); break;
    case 'salvar-outro': salvarLancamento(true); break;
    case 'excluir-lanc':
      if (confirm(`Excluir “${lancEditando.descricao}”?`)) {
        db.lancamentos = db.lancamentos.filter(l => l !== lancEditando);
        salvar(); dlgLanc.close(); render(); aviso('Lançamento excluído');
      }
      break;
    case 'nova-conta': abrirConta(); break;
    case 'nova-cat': abrirCategoria(null, d.tipo); break;
    case 'excluir-item': excluirItem(); break;
    case 'exportar-json': exportarJSON(); break;
    case 'importar-json': $('#arquivo-backup').click(); break;
    case 'exportar-csv': exportarCSV(); break;
    case 'apagar-tudo':
      if (confirm('Apagar TODOS os lançamentos, contas e categorias deste aparelho?') &&
          confirm('Tem certeza? Sem backup, não dá para recuperar.')) {
        db = dadosIniciais(); salvar(); render(); aviso('Dados apagados');
      }
      break;
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'busca') {
    estado.busca = e.target.value;
    $('#lista-lanc').innerHTML = listaLancamentos();
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'conta-analise') { estado.contaAnalise = e.target.value; render(); }
});

// Fecha a folha ao tocar fora dela
[dlgLanc, dlgItem].forEach(dlg => dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }));

// Ao voltar para o app num novo dia/mês, atualiza a tela
let ultimoMesVisto = mesAtual();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && mesAtual() !== ultimoMesVisto) {
    if (estado.mes === ultimoMesVisto) estado.mes = mesAtual();
    ultimoMesVisto = mesAtual();
    render();
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker:', err));
}

render();
