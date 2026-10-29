'use strict';

/* =========================================================
   Minhas Finanças — app de controle financeiro (PWA)
   Os dados ficam salvos no próprio aparelho (localStorage).
   ========================================================= */

const CHAVE = 'financas-v1';
const CORES = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#64748b', '#9f1239'];
const DIAS_LEMBRETE_BACKUP = 30;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const TIPOS_CONTA = {
  corrente: 'Conta corrente / dinheiro',
  cartao: 'Cartão de crédito',
  beneficio: 'Benefício (Flash, VR…)',
  outro: 'Outro (poupança, investimento…)',
};
const ICONE_CONTA = { corrente: '🏦', cartao: '💳', beneficio: '🎫', outro: '💰' };

// ---------- Utilidades ----------

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const arred = v => Math.round(v * 100) / 100;
const pad = n => String(n).padStart(2, '0');
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = v => fmtBRL.format(v || 0);
const num = v => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const pct = v => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const maiuscula = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const $ = sel => document.querySelector(sel);

function eixo(v) {
  const a = Math.abs(v);
  const s = a >= 1000 ? (a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : Math.round(a).toLocaleString('pt-BR');
  return (v < 0 ? '−' : '') + s;
}

// Datas sempre como texto 'AAAA-MM-DD' (sem fuso horário)
function dataStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function paraData(s) { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); }
function hoje() { return dataStr(new Date()); }
function addDias(s, n) { const d = paraData(s); d.setDate(d.getDate() + n); return dataStr(d); }
function diffDias(a, b) { return Math.round((paraData(b) - paraData(a)) / 864e5); }
function mesDe(data) { return data.slice(0, 7); }
function mesAtual() { return mesDe(hoje()); }
function somarMes(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function diasNoMes(mes) { const [a, m] = mes.split('-').map(Number); return new Date(a, m, 0).getDate(); }
// Dia "31" vira o último dia do mês em meses mais curtos
function diaNoMes(mes, dia) { return `${mes}-${pad(Math.min(dia, diasNoMes(mes)))}`; }
function nomeMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return maiuscula(new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
}
function fmtDiaMes(s) { return `${Number(s.slice(8))} ${MESES[Number(s.slice(5, 7)) - 1]}`; }
function fmtCurta(s) { return `${s.slice(8)}/${s.slice(5, 7)}`; }
function nomeDia(data) {
  return maiuscula(paraData(data).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }));
}
const maxData = (...ds) => ds.filter(Boolean).sort().pop();
// Número para campo de texto: 2531.2 -> "2531,20"; 120 -> "120"
const dec = v => (Number.isInteger(v) ? String(v) : arred(v).toFixed(2)).replace('.', ',');

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

// ---------- Dados ----------

function dadosIniciais() {
  let i = 0;
  const cat = (nome, tipo) => ({ id: uid(), nome, tipo, cor: CORES[i++ % CORES.length] });
  return {
    versao: 2,
    contas: [
      { id: uid(), nome: 'Conta corrente', tipo: 'corrente', orcamento: 0, saldoInicial: 0, cor: '#0f766e' },
      { id: uid(), nome: 'Cartão de crédito', tipo: 'cartao', orcamento: 0, saldoInicial: 0, cor: '#2563eb' },
      { id: uid(), nome: 'Flash', tipo: 'beneficio', orcamento: 1144, saldoInicial: 0, cor: '#db2777' },
    ],
    categorias: [
      ...['Mercado', 'Refeição', 'Proteína', 'Frutas', 'Doce', 'Banheiro', 'Roupa', 'Casa', 'Contas da casa',
        'Transporte', 'Saúde', 'Academia', 'Lazer', 'Assinaturas', 'Outros'].map(n => cat(n, 'despesa')),
      ...['Salário', 'Benefício', 'Reembolso', 'Outras receitas'].map(n => cat(n, 'receita')),
    ],
    lancamentos: [],
    recorrencias: [],
    ultimoBackup: null,
  };
}

function tipoProvavel(conta) {
  const n = (conta.nome || '').toLowerCase();
  if (n.includes('cart') || n.includes('crédito') || n.includes('credito')) return 'cartao';
  if (/flash|vr|va\b|vale|alelo|sodexo|ticket|benef/.test(n)) return 'beneficio';
  return 'corrente';
}

// Completa/atualiza dados antigos ou vindos de backup para o formato atual
function normalizar(d) {
  if (!d || !Array.isArray(d.contas) || !Array.isArray(d.categorias) || !Array.isArray(d.lancamentos)) {
    throw new Error('Arquivo não parece um backup deste app.');
  }
  d.versao = 2;
  d.ultimoBackup = d.ultimoBackup || null;
  d.recorrencias = Array.isArray(d.recorrencias) ? d.recorrencias : [];
  d.contas.forEach(c => {
    c.orcamento = Number(c.orcamento) || 0;
    c.saldoInicial = Number(c.saldoInicial) || 0;
    c.cor = c.cor || CORES[0];
    if (!TIPOS_CONTA[c.tipo]) c.tipo = tipoProvavel(c);
  });
  d.lancamentos.forEach(l => {
    l.criado = l.criado || 0;
    if (l.tipo === 'transferencia') {
      l.quantidade = 1;
      l.valorUnitario = Number(l.valorUnitario ?? l.valor) || 0;
    } else {
      l.quantidade = Number(l.quantidade) || 1;
      l.valorUnitario = Number(l.valorUnitario) || 0;
    }
    l.valor = arred(l.quantidade * l.valorUnitario);
  });
  d.recorrencias.forEach(r => {
    r.valor = Number(r.valor) || 0;
    r.dia = Math.min(31, Math.max(1, Number(r.dia) || 1));
    r.ativa = r.ativa !== false;
    r.inicio = r.inicio || hoje();
    r.geradoAte = r.geradoAte || addDias(r.inicio, -1);
  });
  return d;
}

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

const contaPorId = id => db.contas.find(c => c.id === id);
const catPorId = id => db.categorias.find(c => c.id === id);
const recPorId = id => db.recorrencias.find(r => r.id === id);
const nomeConta = c => c ? `${ICONE_CONTA[c.tipo]} ${c.nome}` : '—';
// Contas que formam o "dinheiro livre": conta corrente e cartão (benefícios e poupança ficam de fora)
const contaLivre = c => c.tipo === 'corrente' || c.tipo === 'cartao';

const somaTipo = (lista, tipo) => arred(lista.filter(l => l.tipo === tipo).reduce((s, l) => s + l.valor, 0));
const ordenarRecentes = lista => [...lista].sort((a, b) => b.data.localeCompare(a.data) || b.criado - a.criado);

// ---------- Saldos ----------

// Quanto um lançamento muda o saldo de uma conta
function efeito(l, contaId) {
  if (l.tipo === 'receita') return l.contaId === contaId ? l.valor : 0;
  if (l.tipo === 'despesa') return l.contaId === contaId ? -l.valor : 0;
  return (l.contaDestinoId === contaId ? l.valor : 0) - (l.contaId === contaId ? l.valor : 0);
}
function efeitoLivre(l) {
  return db.contas.filter(contaLivre).reduce((s, c) => s + efeito(l, c.id), 0);
}
function saldoConta(conta, ate = hoje()) {
  return arred(db.lancamentos.reduce((s, l) => (l.data <= ate ? s + efeito(l, conta.id) : s), conta.saldoInicial));
}

// ---------- Recorrentes ----------

function ocorrencias(r, de, ate) {
  const datas = [];
  if (!r.ativa || de > ate) return datas;
  for (let mes = mesDe(de); mes <= mesDe(ate); mes = somarMes(mes, 1)) {
    const d = diaNoMes(mes, r.dia);
    if (d >= de && d <= ate && d >= r.inicio && (!r.fim || d <= r.fim)) datas.push(d);
  }
  return datas;
}

function lancDeRecorrencia(r, data) {
  return {
    id: uid(), criado: Date.now(), tipo: r.tipo, descricao: r.descricao, quantidade: 1,
    valorUnitario: r.valor, valor: r.valor, categoriaId: r.categoriaId, contaId: r.contaId, data, recorrenciaId: r.id,
  };
}

// Lança automaticamente os recorrentes que venceram até hoje
function gerarRecorrentes() {
  const h = hoje();
  let n = 0;
  db.recorrencias.forEach(r => {
    if (!r.ativa) return;
    ocorrencias(r, addDias(r.geradoAte, 1), h).forEach(data => { db.lancamentos.push(lancDeRecorrencia(r, data)); n++; });
    if (r.geradoAte < h) r.geradoAte = h;
  });
  salvar();
  return n;
}

// O que ainda vai acontecer entre duas datas: recorrentes futuros + lançamentos agendados
function previstos(de, ate) {
  const h = hoje();
  const lista = [];
  db.recorrencias.forEach(r => {
    ocorrencias(r, maxData(de, addDias(r.geradoAte, 1), addDias(h, 1)), ate)
      .forEach(data => lista.push({ ...lancDeRecorrencia(r, data), previsto: true }));
  });
  db.lancamentos.forEach(l => { if (l.data > h && l.data >= de && l.data <= ate) lista.push(l); });
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}

// O salário é a maior receita recorrente que cai na conta corrente
function recSalario() {
  return db.recorrencias
    .filter(r => r.ativa && r.tipo === 'receita' && contaPorId(r.contaId)?.tipo === 'corrente')
    .sort((a, b) => b.valor - a.valor)[0] || null;
}
function proximoSalario() {
  const r = recSalario();
  if (!r) return null;
  const h = hoje();
  return ocorrencias(r, addDias(h, 1), addDias(h, 70))[0] || null;
}
function inicioCiclo(r, desloc = 0) {
  let mes = mesAtual();
  if (diaNoMes(mes, r.dia) > hoje()) mes = somarMes(mes, -1);
  return diaNoMes(somarMes(mes, desloc), r.dia);
}

// ---------- Períodos (mês ou ciclo do salário) ----------

const estado = {
  aba: 'inicio',
  modo: null,     // 'mes' | 'ciclo'
  desloc: 0,      // 0 = período atual, -1 = anterior...
  filtroConta: 'todas',
  busca: '',
  contaAnalise: 'todas',
  contaVer: null,
  limiteExtrato: 60,
};

function modoAtual() {
  if (!estado.modo) estado.modo = recSalario() ? 'ciclo' : 'mes';
  if (estado.modo === 'ciclo' && !recSalario()) estado.modo = 'mes';
  return estado.modo;
}

function periodo(desloc = estado.desloc) {
  const r = modoAtual() === 'ciclo' ? recSalario() : null;
  if (!r) {
    const mes = somarMes(mesAtual(), desloc);
    return { inicio: `${mes}-01`, fim: `${mes}-${pad(diasNoMes(mes))}`, titulo: nomeMes(mes), rotulo: MESES[Number(mes.slice(5)) - 1], mes };
  }
  const inicio = inicioCiclo(r, desloc);
  const fim = addDias(diaNoMes(somarMes(mesDe(inicio), 1), r.dia), -1);
  return { inicio, fim, titulo: `${fmtDiaMes(inicio)} – ${fmtDiaMes(fim)}`, rotulo: fmtCurta(inicio) };
}

function noPeriodo(p, contaId) {
  return db.lancamentos.filter(l => l.data >= p.inicio && l.data <= p.fim &&
    (!contaId || contaId === 'todas' || l.contaId === contaId || l.contaDestinoId === contaId));
}

function aviso(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.classList.add('mostrar');
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => el.classList.remove('mostrar'), 2400);
}

// ---------- Renderização ----------

function render() {
  const comPeriodo = estado.aba === 'lancamentos' || estado.aba === 'analise';
  let titulo;
  if (comPeriodo) titulo = periodo().titulo;
  else if (estado.aba === 'inicio') titulo = `Hoje, ${fmtDiaMes(hoje())}`;
  else if (estado.aba === 'conta') titulo = contaPorId(estado.contaVer)?.nome || '';
  else titulo = 'Ajustes';
  $('#mes-titulo').textContent = titulo;
  document.querySelectorAll('.mes-btn').forEach(b => { b.style.visibility = comPeriodo ? 'visible' : 'hidden'; });
  document.querySelectorAll('.abas [data-aba]').forEach(b => b.classList.toggle('ativa', b.dataset.aba === estado.aba));

  const telas = { inicio: telaInicio, lancamentos: telaLancamentos, analise: telaAnalise, ajustes: telaAjustes, conta: telaConta };
  $('#conteudo').innerHTML = telas[estado.aba]();
  if (estado.aba === 'lancamentos') $('#lista-lanc').innerHTML = listaLancamentos();
}

function seletorModo() {
  const m = modoAtual();
  return `<div class="segmentado modo">
    <label><input type="radio" name="modo" value="ciclo" ${m === 'ciclo' ? 'checked' : ''}><span>Ciclo do salário</span></label>
    <label><input type="radio" name="modo" value="mes" ${m === 'mes' ? 'checked' : ''}><span>Mês</span></label>
  </div>`;
}

function linhaLancamento(l, extra = '') {
  const futuro = l.data > hoje() ? ' · agendado' : '';
  const rec = l.recorrenciaId && recPorId(l.recorrenciaId) ? ' · ↻' : '';
  const atributo = l.previsto ? `data-rec="${l.recorrenciaId}"` : `data-lanc="${l.id}"`;
  if (l.tipo === 'transferencia') {
    return `<button class="item" ${atributo}>
      <span class="ponto" style="background:var(--suave)"></span>
      <span class="item-meio"><div class="item-desc">${esc(l.descricao)}</div>
        <div class="item-sub">⇄ ${esc(nomeConta(contaPorId(l.contaId)))} → ${esc(nomeConta(contaPorId(l.contaDestinoId)))}${futuro}</div></span>
      <span class="item-dir"><span class="item-valor neutro">${brl(l.valor)}</span>${extra}</span>
    </button>`;
  }
  const cat = catPorId(l.categoriaId);
  const qtd = l.quantidade !== 1 ? ` · ${num(l.quantidade)} × ${brl(l.valorUnitario)}` : '';
  return `<button class="item" ${atributo}>
    <span class="ponto" style="background:${esc(cat ? cat.cor : '#999')}"></span>
    <span class="item-meio"><div class="item-desc">${esc(l.descricao)}</div>
      <div class="item-sub">${esc(cat ? cat.nome : 'Sem categoria')} · ${esc(nomeConta(contaPorId(l.contaId)))}${rec}${qtd}${futuro}</div></span>
    <span class="item-dir"><span class="item-valor ${l.tipo === 'receita' ? 'pos' : ''}">${l.tipo === 'receita' ? '+' : '−'}${brl(l.valor)}</span>${extra}</span>
  </button>`;
}

// ---------- Tela: Início (visão contínua) ----------

function telaInicio() {
  const h = hoje();
  let banner = '';
  const dias = db.ultimoBackup ? (Date.now() - new Date(db.ultimoBackup).getTime()) / 864e5 : Infinity;
  if (db.lancamentos.length >= 5 && dias > DIAS_LEMBRETE_BACKUP) {
    banner = `<div class="banner">💾 Seus dados ficam só neste aparelho. ${db.ultimoBackup ? 'Faz um tempo desde o último backup.' : 'Que tal fazer um backup?'}
      <button class="btn-texto" data-acao="exportar-json">Fazer backup</button></div>`;
  }

  const rSal = recSalario();
  const D = proximoSalario();
  const fim = D ? addDias(D, -1) : `${mesAtual()}-${pad(diasNoMes(mesAtual()))}`;
  const livres = db.contas.filter(contaLivre);
  const futuros = previstos(addDias(h, 1), fim);
  const somaFuturos = arred(futuros.reduce((s, l) => s + efeitoLivre(l), 0));
  const saldoHoje = arred(livres.reduce((s, c) => s + saldoConta(c), 0));
  const livre = arred(saldoHoje + somaFuturos);
  const diasRestantes = diffDias(h, fim) + 1;
  const porDia = livre / diasRestantes;

  const desde = rSal ? inicioCiclo(rSal) : `${mesAtual()}-01`;
  const despLivres = db.lancamentos.filter(l => l.tipo === 'despesa' && contaLivre(contaPorId(l.contaId) || {}));
  const gastoHoje = somaTipo(despLivres.filter(l => l.data === h), 'despesa');
  const gastoCiclo = somaTipo(despLivres.filter(l => l.data >= desde && l.data <= h), 'despesa');

  const linhasConta = livres.map(c => {
    const s = saldoConta(c);
    const rotulo = c.tipo === 'cartao' ? `${nomeConta(c)} (fatura)` : nomeConta(c);
    return `<div class="linha-valor"><span>${esc(rotulo)}</span><b class="${s < 0 ? 'neg' : ''}">${brl(s)}</b></div>`;
  }).join('');

  const destaque = `<div class="cartao destaque">
    <small>${D ? `Livre até o salário (${fmtDiaMes(D)}, em ${diffDias(h, D)} dia${diffDias(h, D) > 1 ? 's' : ''})` : 'Livre até o fim do mês'}</small>
    <div class="grande ${livre >= 0 ? '' : 'neg'}">${brl(livre)}</div>
    <div class="por-dia">${livre >= 0
      ? `≈ <b>${brl(porDia)}</b> por dia nos próximos ${diasRestantes} dia${diasRestantes > 1 ? 's' : ''}`
      : `Faltam <b>${brl(-livre)}</b> para fechar a conta até lá`}</div>
    <div class="linhas-valor">
      ${linhasConta}
      <div class="linha-valor"><span>Previstos até ${fmtDiaMes(fim)} (${futuros.length})</span><b class="${somaFuturos < 0 ? 'neg' : 'pos'}">${brl(somaFuturos)}</b></div>
    </div>
    <div class="mini-kpis">
      <div><small>Gasto hoje</small><b>${brl(gastoHoje)}</b></div>
      <div><small>Gasto desde ${rSal ? 'o salário' : 'o dia 1º'}</small><b>${brl(gastoCiclo)}</b></div>
    </div>
    ${rSal ? '' : `<p class="nota">Cadastre seu salário como recorrente para o app calcular até o próximo pagamento.
      <button class="btn-texto" data-acao="novo-salario">Cadastrar salário</button></p>`}
  </div>`;

  // Projeção vai até a véspera do salário seguinte, para mostrar um ciclo inteiro pela frente
  const fimGrafico = D ? addDias(ocorrencias(rSal, addDias(D, 1), addDias(D, 70))[0] || addDias(D, 30), -1) : fim;
  const grafico = `<h2>Saldo livre ao longo do tempo</h2>
    <div class="cartao grafico">${graficoSaldo(serieSaldoLivre(addDias(h, -45), fimGrafico))}</div>`;

  const listaFuturos = futuros.length
    ? `<h2>Previstos até ${D ? 'o salário' : 'o fim do mês'}</h2>
      <div class="lista">${futuros.map(l => linhaLancamento(l, `<small class="sub-dir">${fmtCurta(l.data)}</small>`)).join('')}</div>`
    : '';

  const recentes = ordenarRecentes(db.lancamentos.filter(l => l.data <= h)).slice(0, 5);
  return `${banner}${destaque}${grafico}
    <h2>Contas</h2>
    ${db.contas.map(cartaoConta).join('')}
    ${listaFuturos}
    <h2>Últimos lançamentos</h2>
    ${recentes.length ? `<div class="lista">${recentes.map(l => linhaLancamento(l)).join('')}</div>
      <button class="btn-texto" data-aba="lancamentos">Ver todos →</button>`
      : `<div class="vazio">Nenhum lançamento ainda.<br>Toque no <b>+</b> para adicionar.</div>`}`;
}

function ultimoPagamento(cartao) {
  return ordenarRecentes(db.lancamentos.filter(l => l.tipo === 'transferencia' && l.contaDestinoId === cartao.id && l.data <= hoje()))[0];
}
// Compras do cartão feitas depois do último pagamento da fatura
function comprasDaFatura(cartao) {
  const pag = ultimoPagamento(cartao);
  return db.lancamentos.filter(l => l.tipo === 'despesa' && l.contaId === cartao.id && l.data <= hoje() &&
    (!pag || l.data > pag.data || (l.data === pag.data && l.criado > pag.criado)));
}

function cartaoConta(conta) {
  const saldo = saldoConta(conta);
  const ponto = `<span class="ponto" style="display:inline-block;background:${esc(conta.cor)}"></span>`;
  let corpo = '';
  if (conta.tipo === 'cartao') {
    const pag = ultimoPagamento(conta);
    const compras = comprasDaFatura(conta);
    const recorrentes = compras.filter(l => l.recorrenciaId).length;
    corpo = `<div class="conta-rodape"><span>${compras.length} compra${compras.length !== 1 ? 's' : ''} ${pag ? `desde o pagamento de ${fmtCurta(pag.data)}` : 'registradas'}${recorrentes ? ` · ${recorrentes} recorrente${recorrentes > 1 ? 's' : ''}` : ''}</span>
      ${saldo < 0 ? `<button class="btn-texto" data-acao="pagar-fatura" data-id="${conta.id}">Pagar fatura</button>` : ''}</div>`;
  } else if (conta.orcamento > 0) {
    const mes = mesAtual();
    const gasto = somaTipo(db.lancamentos.filter(l => l.contaId === conta.id && mesDe(l.data) === mes), 'despesa');
    const uso = gasto / conta.orcamento;
    const resta = arred(conta.orcamento - gasto);
    const classe = uso >= 1 ? 'estouro' : uso >= 0.8 ? 'alerta' : '';
    const diasR = diasNoMes(mes) - Number(hoje().slice(8)) + 1;
    corpo = `<div class="barra ${classe}"><i style="width:${Math.min(100, uso * 100)}%"></i></div>
      <div class="conta-rodape">
        <span>${brl(gasto)} de ${brl(conta.orcamento)} em ${MESES[Number(mes.slice(5)) - 1]} · ${resta >= 0 ? `restam <b>${brl(resta)}</b>` : `passou <b class="neg">${brl(-resta)}</b>`}</span>
        ${resta > 0 ? `<span>≈ <b>${brl(resta / diasR)}</b>/dia</span>` : ''}
      </div>`;
  }
  let valorTopo = `<span class="conta-valor"><b class="${saldo < 0 ? 'neg' : ''}">${brl(saldo)}</b></span>`;
  if (conta.tipo === 'cartao') valorTopo = `<span class="conta-valor">fatura <b class="${saldo < 0 ? 'neg' : ''}">${brl(-saldo)}</b></span>`;
  else if (conta.orcamento > 0) valorTopo = ''; // contas com orçamento mostram o uso do mês logo abaixo
  return `<div class="cartao clicavel" data-ver-conta="${conta.id}">
    <div class="conta-topo"><span class="conta-nome">${ponto} ${esc(nomeConta(conta))}</span>${valorTopo}</div>
    ${corpo}
  </div>`;
}

// Saldo livre (conta corrente + cartão) dia a dia: passado real e futuro projetado
function serieSaldoLivre(de, ate) {
  const h = hoje();
  const atual = db.contas.filter(contaLivre).reduce((s, c) => s + saldoConta(c), 0);
  const porDia = new Map();
  db.lancamentos.forEach(l => {
    if (l.data > h) return;
    const e = efeitoLivre(l);
    if (e) porDia.set(l.data, (porDia.get(l.data) || 0) + e);
  });
  const pontos = [];
  let v = atual;
  for (let d = h; d >= de; d = addDias(d, -1)) {
    pontos.unshift({ d, v, proj: false });
    v -= porDia.get(d) || 0;
  }
  const fut = new Map();
  previstos(addDias(h, 1), ate).forEach(l => fut.set(l.data, (fut.get(l.data) || 0) + efeitoLivre(l)));
  v = atual;
  for (let d = addDias(h, 1); d <= ate; d = addDias(d, 1)) {
    v += fut.get(d) || 0;
    pontos.push({ d, v, proj: true });
  }
  return pontos;
}

function graficoSaldo(pontos) {
  const W = 340, H = 190, E = 44, D = 8, T = 12, B = 22;
  const vs = pontos.map(p => p.v);
  let min = Math.min(0, ...vs), max = Math.max(0, ...vs);
  if (max - min < 1) max = min + 1;
  const folga = (max - min) * 0.08;
  max += folga; if (min < 0) min -= folga;
  const n = pontos.length;
  const x = i => E + i * (W - E - D) / Math.max(1, n - 1);
  const y = v => T + (max - v) * (H - B - T) / (max - min);
  const iHoje = pontos.findIndex(p => p.proj) === -1 ? n - 1 : pontos.findIndex(p => p.proj) - 1;

  let svg = '';
  const ticks = [...new Set([min < 0 ? min + folga : null, 0, max - folga].filter(t => t !== null))];
  ticks.forEach(t => {
    svg += `<line x1="${E}" x2="${W - D}" y1="${y(t)}" y2="${y(t)}" stroke="var(--borda)" ${t === 0 ? 'stroke-width="1.5"' : ''}/>
      <text x="${E - 4}" y="${y(t) + 3}" text-anchor="end">${eixo(t)}</text>`;
  });
  svg += `<line x1="${x(iHoje)}" x2="${x(iHoje)}" y1="${T}" y2="${H - B}" stroke="var(--suave)" stroke-dasharray="2 3"/>`;
  const real = pontos.slice(0, iHoje + 1).map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`);
  const proj = pontos.slice(iHoje).map((p, i) => `${x(i + iHoje).toFixed(1)},${y(p.v).toFixed(1)}`);
  svg += `<polyline points="${real.join(' ')}" fill="none" stroke="var(--marca)" stroke-width="2.5" stroke-linejoin="round"/>`;
  if (proj.length > 1) svg += `<polyline points="${proj.join(' ')}" fill="none" stroke="var(--marca)" stroke-width="2.5" stroke-dasharray="5 4" opacity=".75"/>`;
  svg += `<circle cx="${x(iHoje)}" cy="${y(pontos[iHoje].v)}" r="4" fill="var(--marca)"><title>Hoje: ${brl(pontos[iHoje].v)}</title></circle>`;
  [[0, 'start'], [iHoje, 'middle'], [n - 1, 'end']].forEach(([i, ancora], k) => {
    if (k !== 1 && Math.abs(x(i) - x(iHoje)) < 45) return; // evita sobrepor o rótulo "hoje"
    svg += `<text x="${x(i)}" y="${H - 6}" text-anchor="${ancora}">${k === 1 ? 'hoje' : fmtCurta(pontos[i].d)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo livre por dia">${svg}</svg>
    <div class="legenda"><span><i style="background:var(--marca)"></i>Conta corrente − fatura do cartão</span><span><i style="background:var(--marca);opacity:.6"></i>Projeção (recorrentes)</span></div>`;
}

// ---------- Tela: extrato de uma conta ----------

function telaConta() {
  const c = contaPorId(estado.contaVer);
  if (!c) { estado.aba = 'inicio'; return telaInicio(); }
  const h = hoje();
  const movs = db.lancamentos.filter(l => l.contaId === c.id || l.contaDestinoId === c.id)
    .sort((a, b) => a.data.localeCompare(b.data) || a.criado - b.criado);
  const saldos = new Map();
  let s = c.saldoInicial;
  movs.forEach(l => { s = arred(s + efeito(l, c.id)); saldos.set(l.id, s); });
  const saldo = saldoConta(c);
  const lista = movs.reverse();

  let resumo = '';
  if (c.tipo === 'cartao') {
    const pag = ultimoPagamento(c);
    const compras = comprasDaFatura(c);
    const rec = compras.filter(l => l.recorrenciaId);
    resumo = `<div class="cartao">
      <div class="linha-valor"><span>Fatura atual</span><b class="neg">${brl(-saldo)}</b></div>
      <div class="linha-valor"><span>Compras ${pag ? `desde ${fmtCurta(pag.data)}` : ''}</span><b>${brl(somaTipo(compras, 'despesa'))} (${compras.length})</b></div>
      <div class="linha-valor"><span>↻ Recorrentes (assinaturas, academia…)</span><b>${brl(somaTipo(rec, 'despesa'))} (${rec.length})</b></div>
      ${saldo < 0 ? `<button class="btn prim largo" data-acao="pagar-fatura" data-id="${c.id}">Pagar fatura</button>` : ''}
    </div>`;
  } else {
    resumo = `<div class="cartao"><div class="linha-valor"><span>Saldo hoje</span><b class="${saldo < 0 ? 'neg' : ''}">${brl(saldo)}</b></div>
      <p class="nota" style="margin-bottom:0">O saldo está diferente do banco? Ajuste em Ajustes → Contas.</p></div>`;
  }

  const mostrar = lista.slice(0, estado.limiteExtrato);
  return `<button class="btn-texto" data-aba="inicio">‹ Voltar</button>
    ${resumo}
    <h2>Extrato</h2>
    ${mostrar.length ? `<div class="lista">${mostrar.map(l => linhaLancamento(l,
      `<small class="sub-dir">${fmtCurta(l.data)} · ${c.tipo === 'cartao' ? `fatura ${brl(-saldos.get(l.id))}` : `saldo ${brl(saldos.get(l.id))}`}</small>`)).join('')}</div>`
      : '<div class="vazio">Nenhuma movimentação.</div>'}
    ${lista.length > mostrar.length ? '<button class="btn largo" data-acao="mais-extrato">Mostrar mais</button>' : ''}`;
}

// ---------- Tela: Lançamentos ----------

function telaLancamentos() {
  const chips = [{ id: 'todas', nome: 'Todas' }, ...db.contas]
    .map(c => `<button class="chip ${estado.filtroConta === c.id ? 'ativo' : ''}" data-filtro="${c.id}">${esc(c.tipo ? nomeConta(c) : c.nome)}</button>`).join('');
  return `${seletorModo()}<div class="filtros">${chips}</div>
    <input class="busca" type="search" id="busca" placeholder="Buscar por descrição ou categoria" value="${esc(estado.busca)}">
    <div id="lista-lanc"></div>`;
}

function listaLancamentos() {
  const termo = estado.busca.trim().toLowerCase();
  let lista = noPeriodo(periodo(), estado.filtroConta);
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
      <div class="lista">${itens.map(l => linhaLancamento(l)).join('')}</div></div>`;
  }
  return html;
}

// ---------- Tela: Análise ----------

function telaAnalise() {
  const p = periodo();
  const contaSel = estado.contaAnalise === 'todas' ? null : contaPorId(estado.contaAnalise);
  if (!contaSel) estado.contaAnalise = 'todas';
  const doPeriodo = noPeriodo(p, estado.contaAnalise);
  const lista = doPeriodo.filter(l => l.tipo === 'despesa' && (!contaSel || l.contaId === contaSel.id));
  const total = somaTipo(lista, 'despesa');
  const receitas = somaTipo(doPeriodo.filter(l => l.tipo === 'receita'), 'receita');

  // Linha de referência do gráfico: orçamento (no modo mês) ou receitas do ciclo
  let ref = 0, refRotulo = '';
  if (modoAtual() === 'mes') {
    ref = contaSel ? contaSel.orcamento : db.contas.reduce((s, c) => s + c.orcamento, 0);
    refRotulo = 'Orçamento';
  } else if (receitas > 0) {
    ref = receitas;
    refRotulo = 'Receitas do ciclo';
  }

  const h = hoje();
  const N = diffDias(p.inicio, p.fim) + 1;
  const diasDecorridos = h < p.inicio ? 0 : h > p.fim ? N : diffDias(p.inicio, h) + 1;
  const maior = lista.reduce((m, l) => (!m || l.valor > m.valor ? l : m), null);

  const opcoes = [{ id: 'todas', nome: 'Todas as contas' }, ...db.contas]
    .map(c => `<option value="${c.id}" ${estado.contaAnalise === c.id ? 'selected' : ''}>${esc(c.tipo ? nomeConta(c) : c.nome)}</option>`).join('');

  const kpis = [
    ['Total gasto', `<span class="neg">${brl(total)}</span>`],
    receitas ? ['Receitas', `<span class="pos">${brl(receitas)}</span>`] : null,
    ref > 0 && refRotulo === 'Orçamento' ? ['Saldo do orçamento', `<span class="${ref - total >= 0 ? 'pos' : 'neg'}">${brl(ref - total)}</span>`] : null,
    ref > 0 ? [`% ${refRotulo === 'Orçamento' ? 'do orçamento' : 'das receitas'} usado`, pct(total / ref)] : null,
    ['Nº de itens', lista.length],
    ['Média por dia', brl(diasDecorridos ? total / diasDecorridos : 0)],
    ['Ticket médio por item', brl(lista.length ? total / lista.length : 0)],
    maior ? ['Maior gasto', `${brl(maior.valor)}<small>${esc(maior.descricao)}</small>`] : null,
  ].filter(Boolean).map(([r, v]) => `<div><small>${r}</small><strong>${v}</strong></div>`).join('');

  const porConta = contaSel ? '' : `<h2>Por forma de pagamento</h2><div class="cartao">${barras(lista, total,
    l => l.contaId, id => { const c = contaPorId(id); return { nome: nomeConta(c), cor: c ? c.cor : '#999' }; })}</div>`;
  const fixos = `<h2>Fixos (recorrentes) × variáveis</h2><div class="cartao">${barras(lista, total,
    l => (l.recorrenciaId ? 'fixo' : 'var'), k => (k === 'fixo' ? { nome: '↻ Recorrentes', cor: '#7c3aed' } : { nome: 'Variáveis', cor: '#0891b2' }))}</div>`;

  return `${seletorModo()}<select class="seletor" id="conta-analise">${opcoes}</select>
    <div class="kpis">${kpis}</div>
    <h2>Gasto por categoria</h2>
    <div class="cartao">${barras(lista, total, l => l.categoriaId, id => { const c = catPorId(id); return { nome: c ? c.nome : 'Sem categoria', cor: c ? c.cor : '#999' }; })}</div>
    ${porConta}${fixos}
    <h2>Evolução no período</h2>
    <div class="cartao grafico">${graficoDiario(lista, p, ref, refRotulo, diasDecorridos)}</div>
    <h2>Últimos 6 ${modoAtual() === 'ciclo' ? 'ciclos' : 'meses'}</h2>
    <div class="cartao grafico">${graficoPeriodos()}</div>`;
}

function barras(lista, total, chave, info) {
  if (!lista.length) return `<div class="vazio">Sem despesas neste período.</div>`;
  const mapa = new Map();
  lista.forEach(l => {
    const k = chave(l);
    const r = mapa.get(k) || { total: 0, n: 0 };
    r.total += l.valor; r.n++;
    mapa.set(k, r);
  });
  return [...mapa.entries()].sort((a, b) => b[1].total - a[1].total).map(([k, r]) => {
    const { nome, cor } = info(k);
    const p = total ? r.total / total : 0;
    return `<div class="cat-linha">
      <div class="cat-topo"><span>${esc(nome)} <small class="nota">(${r.n})</small></span><span>${brl(r.total)} · ${pct(p)}</span></div>
      <div class="cat-barra"><i style="width:${p * 100}%;background:${esc(cor)}"></i></div>
    </div>`;
  }).join('');
}

function graficoDiario(lista, p, ref, refRotulo, ateDia) {
  const N = diffDias(p.inicio, p.fim) + 1;
  const porDia = Array(N + 1).fill(0);
  lista.forEach(l => { porDia[diffDias(p.inicio, l.data) + 1] += l.valor; });
  const acum = [];
  let s = 0;
  for (let d = 1; d <= N; d++) { s += porDia[d]; acum[d] = s; }

  const W = 340, H = 190, E = 38, D = 8, T = 10, B = 22;
  const maxV = Math.max(ref, s, 1) * 1.08;
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
    const data = addDias(p.inicio, d - 1);
    if (porDia[d] > 0) svg += `<rect x="${x(d) - larg / 2}" y="${y(porDia[d])}" width="${larg}" height="${H - B - y(porDia[d])}" fill="var(--marca-claro)" rx="1.5"><title>${fmtCurta(data)}: ${brl(porDia[d])}</title></rect>`;
    if (d === 1 || d % 5 === 0) svg += `<text x="${x(d)}" y="${H - 6}" text-anchor="middle">${Number(data.slice(8))}</text>`;
  }
  if (ref > 0) {
    svg += `<line x1="${E}" x2="${W - D}" y1="${y(ref)}" y2="${y(ref)}" stroke="var(--perigo)" stroke-dasharray="5 4" stroke-width="1.5"/>`;
  }
  if (ateDia > 0) {
    const pts = [];
    for (let d = 1; d <= ateDia; d++) pts.push(`${x(d).toFixed(1)},${y(acum[d]).toFixed(1)}`);
    svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--marca)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto acumulado por dia">${svg}</svg>
    <div class="legenda"><span><i style="background:var(--marca)"></i>Gasto acumulado</span><span><i style="background:var(--marca-claro);height:8px"></i>Gasto no dia</span>${ref > 0 ? `<span><i style="background:var(--perigo)"></i>${refRotulo}</span>` : ''}</div>`;
}

function graficoPeriodos() {
  const dados = [];
  for (let k = -5; k <= 0; k++) {
    const p = periodo(estado.desloc + k);
    const l = noPeriodo(p, estado.contaAnalise);
    dados.push({ p, desp: somaTipo(l, 'despesa'), rec: somaTipo(l, 'receita') });
  }
  const W = 340, H = 170, E = 38, D = 8, T = 10, B = 22;
  const maxV = Math.max(1, ...dados.map(d => Math.max(d.desp, d.rec))) * 1.08;
  const passo = (W - E - D) / dados.length;
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
      <text x="${cx}" y="${H - 6}" text-anchor="middle">${d.p.rotulo}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e despesas por período">${svg}</svg>
    <div class="legenda"><span><i style="background:var(--receita);height:8px"></i>Receitas</span><span><i style="background:var(--despesa);height:8px"></i>Despesas</span></div>`;
}

// ---------- Tela: Ajustes ----------

function telaAjustes() {
  const contas = db.contas.map(c => `<div class="ajuste-linha"><button class="item" data-conta="${c.id}">
      <span class="ponto" style="background:${esc(c.cor)}"></span>
      <span class="item-meio"><div class="item-desc">${esc(nomeConta(c))}</div>
        <div class="item-sub">${TIPOS_CONTA[c.tipo]}${c.orcamento > 0 ? ' · orçamento ' + brl(c.orcamento) : ''}</div></span>
      <span class="nota">${c.tipo === 'cartao' ? 'fatura ' + brl(-saldoConta(c)) : brl(saldoConta(c))} ›</span></button></div>`).join('');
  const recs = db.recorrencias.map(r => `<div class="ajuste-linha"><button class="item" data-rec="${r.id}">
      <span class="ponto" style="background:${r.tipo === 'receita' ? 'var(--receita)' : 'var(--despesa)'}"></span>
      <span class="item-meio"><div class="item-desc">${esc(r.descricao)}${r.ativa ? '' : ' <small class="nota">(pausado)</small>'}</div>
        <div class="item-sub">${r.dia === 31 ? 'Todo último dia' : `Todo dia ${r.dia}`} ·${esc(nomeConta(contaPorId(r.contaId)))}</div></span>
      <span class="item-valor ${r.tipo === 'receita' ? 'pos' : ''}">${r.tipo === 'receita' ? '+' : '−'}${brl(r.valor)}</span></button></div>`).join('');
  const cats = tipo => db.categorias.filter(c => c.tipo === tipo).map(c => `<div class="ajuste-linha"><button class="item" data-cat="${c.id}">
      <span class="ponto" style="background:${esc(c.cor)}"></span>
      <span class="item-meio"><div class="item-desc">${esc(c.nome)}</div></span><span class="nota">›</span></button></div>`).join('');
  const ultimo = db.ultimoBackup ? new Date(db.ultimoBackup).toLocaleDateString('pt-BR') : 'nunca';

  return `<h2>Contas</h2>
    <div class="cartao">${contas}<button class="btn-texto" data-acao="nova-conta">+ Nova conta</button></div>
    <h2>Recorrentes</h2>
    <div class="cartao">
      ${recs || '<p class="nota" style="margin-top:0">Salário, aluguel, academia, assinaturas… Cadastre uma vez e o app lança sozinho todo mês.</p>'}
      <button class="btn-texto" data-acao="nova-rec">+ Novo recorrente</button>
    </div>
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

const opcoesContas = () => db.contas.map(c => `<option value="${c.id}">${esc(nomeConta(c))}</option>`).join('');

function preencherCategorias(tipo, selecionada) {
  const cats = db.categorias.filter(c => c.tipo === tipo);
  formLanc.categoriaId.innerHTML = cats.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  if (selecionada && cats.some(c => c.id === selecionada)) formLanc.categoriaId.value = selecionada;
}

function aplicarTipo(tipo) {
  formLanc.dataset.tipo = tipo;
  $('#rotulo-conta').textContent = tipo === 'transferencia' ? 'De' : 'Conta';
  if (tipo === 'transferencia') {
    formLanc.quantidade.value = '1';
    if (!formLanc.contaDestinoId.value || formLanc.contaDestinoId.value === formLanc.contaId.value) {
      const destino = db.contas.find(c => c.tipo === 'cartao' && c.id !== formLanc.contaId.value) || db.contas.find(c => c.id !== formLanc.contaId.value);
      if (destino) formLanc.contaDestinoId.value = destino.id;
    }
  } else {
    preencherCategorias(tipo, formLanc.categoriaId.value);
  }
}

function atualizarTotal() {
  const v = avaliarValor(formLanc.valor.value);
  const q = avaliarValor(formLanc.quantidade.value || '1');
  const mostrar = Number.isFinite(v) && Number.isFinite(q) && (q !== 1 || /[+\-*/]/.test(formLanc.valor.value.replace(/^-/, '')));
  $('#lanc-total').textContent = mostrar ? `Total: ${brl(arred(v * q))}` : '';
}

// predef: valores iniciais para um lançamento novo (ex.: pagar fatura)
function abrirLancamento(l, predef = {}) {
  lancEditando = l || null;
  formLanc.reset();
  $('#lanc-erro').textContent = '';
  $('#lanc-titulo').textContent = l ? 'Editar lançamento' : 'Novo lançamento';
  formLanc.dataset.editando = l ? 'sim' : '';
  formLanc.querySelector('[data-acao="excluir-lanc"]').hidden = !l;
  formLanc.querySelector('[data-acao="salvar-outro"]').hidden = !!l;
  const rec = l && l.recorrenciaId && recPorId(l.recorrenciaId);
  $('#lanc-origem').textContent = rec ? `↻ Lançado automaticamente pelo recorrente “${rec.descricao}”. Mudanças aqui valem só para este mês.` : '';

  const nomes = [...new Set(ordenarRecentes(db.lancamentos).map(x => x.descricao))].slice(0, 300);
  $('#sugestoes').innerHTML = nomes.map(n => `<option value="${esc(n)}">`).join('');
  formLanc.contaId.innerHTML = opcoesContas();
  formLanc.contaDestinoId.innerHTML = opcoesContas();

  const base = l || predef;
  const tipo = base.tipo || 'despesa';
  formLanc.tipo.value = tipo;
  formLanc.descricao.value = base.descricao || '';
  formLanc.valor.value = base.valorUnitario ? dec(base.valorUnitario) : '';
  formLanc.quantidade.value = String(base.quantidade || 1).replace('.', ',');
  const ultimo = ordenarRecentes(db.lancamentos.filter(x => x.tipo !== 'transferencia'))[0];
  const conta = base.contaId || (ultimo && contaPorId(ultimo.contaId) ? ultimo.contaId : db.contas[0]?.id);
  if (conta) formLanc.contaId.value = conta;
  if (base.contaDestinoId) formLanc.contaDestinoId.value = base.contaDestinoId;
  const p = periodo();
  const h = hoje();
  formLanc.data.value = base.data || (estado.aba === 'lancamentos' && (h < p.inicio || h > p.fim) ? p.inicio : h);
  preencherCategorias(tipo === 'transferencia' ? 'despesa' : tipo, base.categoriaId);
  aplicarTipo(tipo);
  atualizarTotal();
  dlgLanc.showModal();
  if (!l && !predef.tipo) formLanc.descricao.focus();
}

function lerFormulario() {
  const f = formLanc;
  const tipo = f.tipo.value;
  const valorUnitario = avaliarValor(f.valor.value);
  const quantidade = tipo === 'transferencia' ? 1 : avaliarValor(f.quantidade.value || '1');
  let descricao = f.descricao.value.trim();
  if (!Number.isFinite(valorUnitario) || valorUnitario <= 0) return 'Valor inválido. Use números, como 52,11 ou 16,75-1,76.';
  if (!Number.isFinite(quantidade) || quantidade <= 0) return 'Quantidade inválida.';
  if (!f.data.value) return 'Escolha a data.';
  const dados = { tipo, valorUnitario: arred(valorUnitario), quantidade, valor: arred(valorUnitario * quantidade), contaId: f.contaId.value, data: f.data.value };
  if (tipo === 'transferencia') {
    if (f.contaId.value === f.contaDestinoId.value) return 'Escolha contas diferentes em “De” e “Para”.';
    if (!descricao) descricao = contaPorId(f.contaDestinoId.value)?.tipo === 'cartao' ? 'Pagamento da fatura' : 'Transferência';
    return { ...dados, descricao, contaDestinoId: f.contaDestinoId.value, categoriaId: null };
  }
  if (!descricao) return 'Preencha a descrição.';
  return { ...dados, descricao, categoriaId: f.categoriaId.value, contaDestinoId: null };
}

function salvarLancamento(continuar) {
  const r = lerFormulario();
  if (typeof r === 'string') { $('#lanc-erro').textContent = r; return; }
  if (lancEditando) {
    Object.assign(lancEditando, r);
  } else {
    const novo = { id: uid(), criado: Date.now(), ...r };
    if (formLanc.repetir.checked && r.tipo !== 'transferencia') {
      // Lançamento no último dia do mês vira "todo último dia"
      const dia = r.data.slice(8) === pad(diasNoMes(mesDe(r.data))) ? 31 : Number(r.data.slice(8));
      const rec = {
        id: uid(), tipo: r.tipo, descricao: r.descricao, valor: r.valor, categoriaId: r.categoriaId,
        contaId: r.contaId, dia, inicio: r.data, geradoAte: maxData(r.data, hoje()), ativa: true,
      };
      db.recorrencias.push(rec);
      novo.recorrenciaId = rec.id;
    }
    db.lancamentos.push(novo);
  }
  salvar();
  render();
  if (continuar) {
    formLanc.descricao.value = '';
    formLanc.valor.value = '';
    formLanc.quantidade.value = '1';
    formLanc.repetir.checked = false;
    $('#lanc-erro').textContent = '';
    atualizarTotal();
    formLanc.descricao.focus();
    aviso(`“${r.descricao}” salvo`);
  } else {
    dlgLanc.close();
    aviso(lancEditando ? 'Lançamento atualizado' : formLanc.repetir.checked ? 'Salvo e marcado como recorrente' : 'Lançamento salvo');
  }
}

formLanc.addEventListener('submit', e => { e.preventDefault(); salvarLancamento(false); });
formLanc.addEventListener('input', e => {
  if (e.target.name === 'valor' || e.target.name === 'quantidade') atualizarTotal();
});
formLanc.addEventListener('change', e => {
  if (e.target.name === 'tipo') aplicarTipo(e.target.value);
  if (e.target.name === 'contaId' && formLanc.dataset.tipo === 'transferencia') aplicarTipo('transferencia');
  // Ao escolher uma descrição já usada, repete categoria, conta e valor da última vez
  if (e.target.name === 'descricao' && !lancEditando) {
    const nome = e.target.value.trim().toLowerCase();
    const anterior = ordenarRecentes(db.lancamentos).find(l => l.descricao.toLowerCase() === nome);
    if (anterior) {
      formLanc.tipo.value = anterior.tipo;
      if (contaPorId(anterior.contaId)) formLanc.contaId.value = anterior.contaId;
      if (anterior.contaDestinoId) formLanc.contaDestinoId.value = anterior.contaDestinoId;
      if (anterior.categoriaId) preencherCategorias(anterior.tipo, anterior.categoriaId);
      aplicarTipo(anterior.tipo);
      if (!formLanc.valor.value) formLanc.valor.value = dec(anterior.valorUnitario);
      atualizarTotal();
    }
  }
});

// ---------- Formulário de conta / categoria / recorrente ----------

const dlgItem = $('#dlg-item');
const formItem = $('#form-item');
let itemEditando = null; // { tipo: 'conta' | 'cat' | 'rec', obj }

function seletorCores(atual) {
  return `<div class="campo">Cor<div class="cores">${CORES.map(c =>
    `<label><input type="radio" name="cor" value="${c}" ${c === atual ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div></div>`;
}

function abrirConta(conta) {
  itemEditando = { tipo: 'conta', obj: conta || null };
  const tipo = conta ? conta.tipo : 'corrente';
  const saldo = conta ? saldoConta(conta) : 0;
  $('#item-titulo').textContent = conta ? 'Editar conta' : 'Nova conta';
  $('#item-campos').innerHTML = `
    <label class="campo">Nome<input name="nome" required value="${esc(conta ? conta.nome : '')}" placeholder="Ex.: Nubank, VR, Poupança"></label>
    <label class="campo">Tipo<select name="tipoConta">${Object.entries(TIPOS_CONTA).map(([k, v]) =>
      `<option value="${k}" ${k === tipo ? 'selected' : ''}>${ICONE_CONTA[k]} ${v}</option>`).join('')}</select></label>
    <label class="campo"><span id="rotulo-saldo"></span>
      <input name="saldo" inputmode="decimal" value="${dec(tipo === 'cartao' ? -saldo : saldo)}" data-original="${dec(tipo === 'cartao' ? -saldo : saldo)}"></label>
    <label class="campo">Orçamento mensal (R$) — deixe 0 se não quiser limite
      <input name="orcamento" inputmode="decimal" value="${conta ? dec(conta.orcamento) : '0'}"></label>
    ${seletorCores(conta ? conta.cor : CORES[db.contas.length % CORES.length])}`;
  rotuloSaldo();
  abrirItem(!!conta);
}
function rotuloSaldo() {
  const el = $('#rotulo-saldo');
  if (el) el.textContent = formItem.tipoConta.value === 'cartao' ? 'Fatura atual — quanto você deve hoje (R$)' : 'Saldo atual hoje (R$)';
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

function abrirRecorrencia(rec, predef = {}) {
  itemEditando = { tipo: 'rec', obj: rec || null };
  const b = rec || predef;
  const t = b.tipo || 'despesa';
  $('#item-titulo').textContent = rec ? 'Editar recorrente' : 'Novo recorrente';
  $('#item-campos').innerHTML = `
    <div class="segmentado">
      <label><input type="radio" name="tipoRec" value="despesa" ${t === 'despesa' ? 'checked' : ''}><span>Despesa</span></label>
      <label><input type="radio" name="tipoRec" value="receita" ${t === 'receita' ? 'checked' : ''}><span>Receita</span></label>
    </div>
    <label class="campo">Descrição<input name="nome" required value="${esc(b.descricao || '')}" placeholder="Ex.: Academia, Netflix, Salário"></label>
    <div class="linha">
      <label class="campo">Valor (R$)<input name="valor" inputmode="decimal" value="${b.valor ? dec(b.valor) : ''}"></label>
      <label class="campo qtd">Dia<input name="dia" type="number" min="1" max="31" inputmode="numeric" value="${b.dia || Number(hoje().slice(8))}"></label>
    </div>
    <p class="dica">Dia 31 = último dia de cada mês.</p>
    <div class="linha">
      <label class="campo">Categoria<select name="categoriaRec"></select></label>
      <label class="campo">Conta<select name="contaRec">${opcoesContas()}</select></label>
    </div>
    <label class="campo">Começa em<input type="date" name="inicio" value="${b.inicio || hoje()}"></label>
    ${rec ? `<label class="marcar"><input type="checkbox" name="ativa" ${rec.ativa ? 'checked' : ''}> Ativo (desmarque para pausar)</label>` : ''}
    <p class="dica">O app lança sozinho no dia de cada mês. Se o valor mudar num mês, edite só aquele lançamento.</p>`;
  if (b.contaId) formItem.contaRec.value = b.contaId;
  categoriasRec(t, b.categoriaId);
  abrirItem(!!rec);
}
function categoriasRec(tipo, selecionada) {
  const cats = db.categorias.filter(c => c.tipo === tipo);
  formItem.categoriaRec.innerHTML = cats.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  if (selecionada && cats.some(c => c.id === selecionada)) formItem.categoriaRec.value = selecionada;
}

function abrirItem(editando) {
  $('#item-erro').textContent = '';
  formItem.querySelector('[data-acao="excluir-item"]').hidden = !editando;
  dlgItem.showModal();
}

formItem.addEventListener('change', e => {
  if (e.target.name === 'tipoRec') categoriasRec(e.target.value);
  if (e.target.name === 'tipoConta') rotuloSaldo();
});

formItem.addEventListener('submit', e => {
  e.preventDefault();
  const erro = t => { $('#item-erro').textContent = t; };
  const nome = formItem.nome.value.trim();
  if (!nome) return erro('Preencha o nome.');
  const cor = formItem.querySelector('input[name="cor"]:checked')?.value || CORES[0];
  const { tipo, obj } = itemEditando;

  if (tipo === 'conta') {
    const orcamento = avaliarValor(formItem.orcamento.value || '0');
    if (!Number.isFinite(orcamento) || orcamento < 0) return erro('Orçamento inválido.');
    const tipoConta = formItem.tipoConta.value;
    const saldoTxt = formItem.saldo.value || '0';
    const informado = avaliarValor(saldoTxt);
    if (!Number.isFinite(informado)) return erro('Saldo inválido.');
    const dados = { nome, tipo: tipoConta, orcamento: arred(orcamento), cor };
    if (obj) {
      const mudouSaldo = saldoTxt !== formItem.saldo.dataset.original || tipoConta !== obj.tipo;
      Object.assign(obj, dados);
      if (mudouSaldo) {
        // Ajusta o saldo inicial para o saldo de hoje bater com o informado
        const desejado = tipoConta === 'cartao' ? -informado : informado;
        obj.saldoInicial = arred(obj.saldoInicial + desejado - saldoConta(obj));
      }
    } else {
      db.contas.push({ id: uid(), ...dados, saldoInicial: arred(tipoConta === 'cartao' ? -informado : informado) });
    }
  } else if (tipo === 'cat') {
    const dados = { nome, tipo: formItem.querySelector('input[name="tipoCat"]:checked').value, cor };
    if (obj) Object.assign(obj, dados);
    else db.categorias.push({ id: uid(), ...dados });
  } else {
    const valor = avaliarValor(formItem.valor.value);
    const dia = Number(formItem.dia.value);
    if (!Number.isFinite(valor) || valor <= 0) return erro('Valor inválido.');
    if (!(dia >= 1 && dia <= 31)) return erro('Dia deve ser entre 1 e 31.');
    if (!formItem.inicio.value) return erro('Escolha a data de início.');
    const dados = {
      tipo: formItem.querySelector('input[name="tipoRec"]:checked').value, descricao: nome, valor: arred(valor), dia: Math.round(dia),
      categoriaId: formItem.categoriaRec.value, contaId: formItem.contaRec.value, inicio: formItem.inicio.value,
    };
    if (obj) {
      const reativou = !obj.ativa && formItem.ativa.checked;
      Object.assign(obj, dados, { ativa: formItem.ativa.checked });
      // Ao reativar, não lança os meses em que ficou pausado
      if (reativou) obj.geradoAte = maxData(obj.geradoAte, addDias(hoje(), -1));
    } else {
      db.recorrencias.push({ id: uid(), ...dados, ativa: true, geradoAte: addDias(dados.inicio, -1) });
    }
    const n = gerarRecorrentes();
    if (n) aviso(`${n} lançamento${n > 1 ? 's' : ''} recorrente${n > 1 ? 's' : ''} adicionado${n > 1 ? 's' : ''}`);
  }
  salvar();
  dlgItem.close();
  render();
  if (tipo !== 'rec') aviso('Salvo');
});

function excluirItem() {
  const { tipo, obj } = itemEditando;
  const erro = t => { $('#item-erro').textContent = t; };
  if (tipo === 'rec') {
    if (!confirm(`Excluir o recorrente “${obj.descricao}”? Os lançamentos já feitos continuam.`)) return;
    db.recorrencias = db.recorrencias.filter(r => r !== obj);
  } else {
    const usados = tipo === 'conta'
      ? db.lancamentos.filter(l => l.contaId === obj.id || l.contaDestinoId === obj.id).length + db.recorrencias.filter(r => r.contaId === obj.id).length
      : db.lancamentos.filter(l => l.categoriaId === obj.id).length + db.recorrencias.filter(r => r.categoriaId === obj.id).length;
    if (usados) return erro(`Não dá para excluir: ${usados} lançamento(s) ou recorrente(s) usam esta ${tipo === 'conta' ? 'conta' : 'categoria'}. Mude-os antes.`);
    if (tipo === 'conta' && db.contas.length === 1) return erro('É preciso ter pelo menos uma conta.');
    if (tipo === 'cat' && db.categorias.filter(c => c.tipo === obj.tipo).length === 1) return erro('É preciso ter pelo menos uma categoria deste tipo.');
    if (!confirm(`Excluir “${obj.nome}”?`)) return;
    if (tipo === 'conta') db.contas = db.contas.filter(c => c !== obj);
    else db.categorias = db.categorias.filter(c => c !== obj);
  }
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
  const linhas = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta', 'Para conta', 'Recorrente', 'Quantidade', 'Valor unitário', 'Valor'].join(';')];
  [...db.lancamentos].sort((a, b) => a.data.localeCompare(b.data) || a.criado - b.criado).forEach(l => {
    linhas.push([l.data.split('-').reverse().join('/'), l.tipo, q(l.descricao), q(catPorId(l.categoriaId)?.nome || ''),
      q(contaPorId(l.contaId)?.nome || ''), q(contaPorId(l.contaDestinoId)?.nome || ''), l.recorrenciaId ? 'sim' : '',
      n(l.quantidade), n(l.valorUnitario), n(l.valor)].join(';'));
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
    gerarRecorrentes();
    render();
    aviso('Backup restaurado');
  } catch (err) {
    alert('Não foi possível ler o arquivo: ' + err.message);
  }
});

// ---------- Eventos gerais ----------

document.addEventListener('click', e => {
  const alvo = e.target.closest('[data-acao], [data-aba], [data-lanc], [data-conta], [data-cat], [data-rec], [data-filtro], [data-ver-conta]');
  if (!alvo) return;
  const d = alvo.dataset;

  if (d.aba) { estado.aba = d.aba; render(); window.scrollTo(0, 0); return; }
  if (d.lanc) { abrirLancamento(db.lancamentos.find(l => l.id === d.lanc)); return; }
  if (d.conta) { abrirConta(contaPorId(d.conta)); return; }
  if (d.cat) { abrirCategoria(catPorId(d.cat)); return; }
  if (d.rec) { const r = recPorId(d.rec); if (r) abrirRecorrencia(r); return; }
  if (d.filtro) { estado.filtroConta = d.filtro; render(); return; }
  if (d.verConta) { estado.aba = 'conta'; estado.contaVer = d.verConta; estado.limiteExtrato = 60; render(); window.scrollTo(0, 0); return; }

  switch (d.acao) {
    case 'periodo-anterior': estado.desloc--; render(); break;
    case 'periodo-proximo': estado.desloc++; render(); break;
    case 'novo': abrirLancamento(); break;
    case 'fechar': alvo.closest('dialog').close(); break;
    case 'salvar-outro': salvarLancamento(true); break;
    case 'excluir-lanc':
      if (confirm(`Excluir “${lancEditando.descricao}”?`)) {
        db.lancamentos = db.lancamentos.filter(l => l !== lancEditando);
        salvar(); dlgLanc.close(); render(); aviso('Lançamento excluído');
      }
      break;
    case 'pagar-fatura': {
      const cartao = contaPorId(d.id);
      const origem = db.contas.find(c => c.tipo === 'corrente');
      abrirLancamento(null, {
        tipo: 'transferencia', descricao: 'Pagamento da fatura', valorUnitario: arred(-saldoConta(cartao)),
        contaId: origem ? origem.id : undefined, contaDestinoId: cartao.id, data: hoje(),
      });
      break;
    }
    case 'novo-salario': {
      const corrente = db.contas.find(c => c.tipo === 'corrente');
      const cat = db.categorias.find(c => c.tipo === 'receita' && c.nome.toLowerCase().startsWith('sal'));
      abrirRecorrencia(null, { tipo: 'receita', descricao: 'Salário', dia: 31, contaId: corrente?.id, categoriaId: cat?.id });
      break;
    }
    case 'mais-extrato': estado.limiteExtrato += 100; render(); break;
    case 'nova-conta': abrirConta(); break;
    case 'nova-cat': abrirCategoria(null, d.tipo); break;
    case 'nova-rec': abrirRecorrencia(); break;
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
  if (e.target.name === 'modo' && e.target.closest('#conteudo')) {
    if (e.target.value === 'ciclo' && !recSalario()) {
      aviso('Cadastre o salário como recorrente (Ajustes) para usar o ciclo');
      render();
      return;
    }
    estado.modo = e.target.value;
    estado.desloc = 0;
    render();
  }
});

// Fecha a folha ao tocar fora dela
[dlgLanc, dlgItem].forEach(dlg => dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }));

// Ao voltar para o app num novo dia, lança recorrentes e atualiza a tela
let ultimoDiaVisto = hoje();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && hoje() !== ultimoDiaVisto) {
    ultimoDiaVisto = hoje();
    gerarRecorrentes();
    render();
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker:', err));
}

const gerados = gerarRecorrentes();
render();
if (gerados) aviso(`${gerados} lançamento${gerados > 1 ? 's' : ''} recorrente${gerados > 1 ? 's' : ''} adicionado${gerados > 1 ? 's' : ''}`);
