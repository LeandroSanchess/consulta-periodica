const $ = (selector) => document.querySelector(selector);
const state = { meta: null, records: [], selected: new Set(), page: 1, result: null, detail: null, detailChunks: new Map() };
const formatInt = (value) => new Intl.NumberFormat('pt-BR').format(value);
const formatNum = (value, digits = 4) => value === null || value === undefined || value === '' ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(Number(value));

function category(element) {
  if (element.number >= 57 && element.number <= 71) return '#aa94e7';
  if (element.number >= 89 && element.number <= 103) return '#d891b2';
  const type = (element.type || '').toLowerCase();
  if (type.includes('noble')) return '#80b2e5';
  if (type.includes('halogen')) return '#82d9b4';
  if (type.includes('alkali') && !type.includes('earth')) return '#e9a778';
  if (type.includes('alkaline')) return '#e8c17d';
  if (type.includes('transition')) return '#82b9d5';
  if (type.includes('metalloid')) return '#b9c98e';
  if (type.includes('nonmetal')) return '#79d3ca';
  return '#adbbd2';
}

function updateSelection() {
  for (const button of document.querySelectorAll('.element')) {
    const active = state.selected.has(button.dataset.symbol);
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  }
  $('#selected-count').textContent = `${state.selected.size} selecionado${state.selected.size === 1 ? '' : 's'}`;
  const area = $('#selected-elements');
  area.replaceChildren();
  if (!state.selected.size) {
    const empty = document.createElement('span');
    empty.className = 'empty-selection';
    empty.textContent = 'Nenhum elemento selecionado';
    area.append(empty);
    return;
  }
  for (const symbol of state.selected) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'selected-chip';
    button.textContent = `${symbol} ×`;
    button.title = `Remover ${symbol}`;
    button.addEventListener('click', () => {
      state.selected.delete(symbol);
      updateSelection();
      runSearch();
    });
    area.append(button);
  }
}

function buildTable() {
  const grid = $('#periodic-grid');
  const fragment = document.createDocumentFragment();
  for (const [row, text] of [[6, '57–71'], [7, '89–103']]) {
    const placeholder = document.createElement('span');
    placeholder.className = 'placeholder';
    placeholder.style.gridRow = String(row);
    placeholder.style.gridColumn = '3';
    placeholder.textContent = text;
    fragment.append(placeholder);
  }
  for (const element of state.meta.elements) {
    if (!element.gridCol) continue;
    const count = state.meta.elementCounts[element.symbol] || 0;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `element${count ? '' : ' absent'}`;
    button.dataset.symbol = element.symbol;
    button.style.gridRow = String(element.gridRow);
    button.style.gridColumn = String(element.gridCol);
    button.style.setProperty('--element-color', category(element));
    button.setAttribute('aria-label', `${element.name}, ${element.symbol}; ${formatInt(count)} estruturas`);
    button.setAttribute('aria-pressed', 'false');
    button.title = `${element.name} · ${formatInt(count)} estruturas`;
    for (const [className, text] of [['number', element.number], ['symbol', element.symbol], ['count', count ? formatInt(count) : '—']]) {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      button.append(span);
    }
    button.addEventListener('click', () => {
      if (state.selected.has(element.symbol)) state.selected.delete(element.symbol);
      else state.selected.add(element.symbol);
      updateSelection();
      runSearch();
    });
    fragment.append(button);
  }
  grid.append(fragment);
}

function buildSiteChoices() {
  for (const select of document.querySelectorAll('[data-site]')) {
    for (const symbol of state.meta.siteChoices[select.dataset.site]) {
      const option = document.createElement('option');
      option.value = symbol;
      option.textContent = symbol;
      select.append(option);
    }
  }
}

function tierLabel(row) {
  return { A: 'Tier A', B: 'Tier B', exploratory: 'Exploratório', unlisted: 'Não listado' }[row.tier] || row.tier;
}

function badgeClass(tier) {
  return { A: 'badge-a', B: 'badge-b', exploratory: 'badge-exploratory', unlisted: 'badge-outside' }[tier] || 'badge-outside';
}

function textCell(row, text, className = '') {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = text;
  row.append(td);
  return td;
}

function renderResults(data) {
  state.result = data;
  $('#result-count').textContent = formatInt(data.total);
  const quick = $('#quick-result');
  quick.replaceChildren();
  if (data.results.length) {
    const first = data.results[0];
    const text = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = `Primeiro resultado · ${tierLabel(first)}`;
    const formula = document.createElement('strong');
    formula.textContent = first.formula;
    text.append(label, formula);
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Ver dados';
    open.addEventListener('click', () => openDetail(first.id));
    quick.append(text, open);
  }
  const tbody = $('#results-body');
  tbody.replaceChildren();
  for (const item of data.results) {
    const row = document.createElement('tr');
    const formula = document.createElement('td');
    const title = document.createElement('span');
    title.className = 'formula';
    title.textContent = item.formula;
    const sites = document.createElement('span');
    sites.className = 'sites';
    sites.textContent = `A ${item.a} · B ${item.b} · B′ ${item.bp} · X ${item.x}`;
    formula.append(title, sites);
    row.append(formula);
    const tier = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `tier-badge ${badgeClass(item.tier)}`;
    badge.textContent = tierLabel(item);
    tier.append(badge);
    if (item.final_a) {
      const label = document.createElement('span');
      label.className = 'final-tag';
      label.textContent = 'Lista final A';
      tier.append(label);
    } else if (item.tier === 'unlisted' && item.model_tier !== 'outside_priority') {
      const label = document.createElement('span');
      label.className = 'final-tag';
      label.textContent = `Ranking geral: ${item.model_tier}`;
      tier.append(label);
    }
    row.append(tier);
    textCell(row, item.rank ? `#${formatInt(item.rank)}` : '—', 'number-cell');
    textCell(row, formatNum(item.likeness, 5), 'number-cell');
    textCell(row, formatNum(item.ehull, 5), 'number-cell');
    const action = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'detail-button';
    button.textContent = 'Ver dados';
    button.addEventListener('click', () => openDetail(item.id));
    action.append(button);
    row.append(action);
    tbody.append(row);
  }
  const first = (data.page - 1) * data.pageSize + 1;
  const last = Math.min(data.page * data.pageSize, data.total);
  $('#page-label').textContent = data.total ? `${formatInt(first)}–${formatInt(last)} de ${formatInt(data.total)}` : 'Nenhum resultado';
  $('#prev-page').disabled = data.page <= 1;
  $('#next-page').disabled = last >= data.total;
  $('#status').textContent = data.total ? '' : 'Nenhuma estrutura corresponde aos filtros. Tente selecionar outros elementos ou ampliar o tier.';
  const chosen = Array.from(state.selected).join(', ');
  $('#result-context').textContent = chosen ? `Elementos: ${chosen} · ${document.querySelector('input[name="mode"]:checked').value === 'all' ? 'todos presentes' : 'qualquer um presente'}` : 'Selecione elementos ou use os filtros de fórmula e sítio.';
}

function runSearch(resetPage = true) {
  if (!state.records.length) return;
  if (resetPage) state.page = 1;
  const selected = Array.from(state.selected);
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const tier = $('#tier').value;
  const formula = $('#formula').value.trim().toLowerCase();
  const siteFilters = Object.fromEntries(Array.from(document.querySelectorAll('[data-site]'))
    .filter((select) => select.value).map((select) => [select.dataset.site, select.value]));
  const matching = [];
  for (const row of state.records) {
    if (tier === 'tier_A_final' ? !row.final_a : tier !== 'all' && row.tier !== tier) continue;
    const rowElements = [row.a, row.b, row.bp, row.x];
    if (selected.length && (mode === 'all' ? !selected.every((symbol) => rowElements.includes(symbol))
      : !selected.some((symbol) => rowElements.includes(symbol)))) continue;
    if (Object.entries(siteFilters).some(([site, symbol]) => row[site === 'Bp' ? 'bp' : site.toLowerCase()] !== symbol)) continue;
    if (formula && !row.formula.toLowerCase().includes(formula)) continue;
    matching.push(row);
  }
  const start = (state.page - 1) * state.meta.pageSize;
  renderResults({ total: matching.length, page: state.page, pageSize: state.meta.pageSize,
    results: matching.slice(start, start + state.meta.pageSize) });
}

const descriptions = {
  candidate_row_index: 'Índice da linha candidata', formula_A2BBpX6: 'Fórmula A₂BB′X₆',
  canonical_material_key: 'Chave canônica', canonical_b_sites_swapped: 'Sítios B trocados na normalização',
  material: 'Material (representação original)', hasAllRadii: 'Todos os raios disponíveis',
  A_site_ion: 'Elemento A', B_site_ion: 'Elemento B', "B'_site_ion": 'Elemento B′', X_site_ion: 'Elemento X',
  priority_tier: 'Tier de prioridade', laboratory_priority_rank: 'Posição na prioridade de laboratório',
  discovery_priority_rank: 'Posição na lista de descoberta', experimental_likeness_score: 'Similaridade experimental',
  experimental_likeness_uncertainty: 'Incerteza da similaridade', experimental_likeness_percentile: 'Percentil de similaridade',
  domain_confidence_score: 'Confiança do domínio', domain_label: 'Classificação do domínio',
  constrained__energy_above_hull: 'Energia acima do hull restrita', constrained__G_hull_300K: 'G hull 300 K restrita',
  constrained__G_form_300K: 'G formação 300 K restrita', bartel_tau: 'Fator τ de Bartel',
  bartel_tau_classification: 'Classificação pelo fator τ', bartel_tau_domain_status: 'Domínio do fator τ',
  matches_known_experimental_structure: 'Corresponde a estrutura experimental conhecida',
  matches_classifier_training_structure: 'Corresponde ao treino do classificador',
  composition_novelty_status: 'Status de novidade da composição', matching_training_formulas: 'Fórmulas correspondentes no treino',
  matching_training_ids: 'IDs correspondentes no treino', exclusion_reason: 'Motivo da exclusão'
};
function fieldName(key) {
  if (descriptions[key]) return descriptions[key];
  return key.replaceAll('_', ' ').replaceAll('Bp', 'B′').replaceAll('en pauling', 'eletronegatividade Pauling');
}
function group(title, data, baseline = null) {
  if (!data) return null;
  const entries = Object.entries(data).filter(([key, value]) => !baseline || baseline[key] !== value);
  if (!entries.length) return null;
  const wrapper = document.createElement('details');
  wrapper.className = 'data-group';
  wrapper.open = title === 'Ranking e previsões' || title === 'Descritores do candidato';
  const summary = document.createElement('summary');
  summary.textContent = `${title} · ${entries.length} ${entries.length === 1 ? 'campo' : 'campos'}`;
  const list = document.createElement('dl');
  list.className = 'data-grid';
  for (const [key, value] of entries) {
    const pair = document.createElement('div');
    const term = document.createElement('dt');
    term.title = key;
    term.textContent = fieldName(key);
    const definition = document.createElement('dd');
    definition.textContent = value === '' || value === null ? '—' : String(value);
    pair.append(term, definition);
    list.append(pair);
  }
  wrapper.append(summary, list);
  return wrapper;
}

async function openDetail(id) {
  const dialog = $('#structure-dialog');
  $('#dialog-title').textContent = 'Carregando...';
  $('#dialog-content').replaceChildren();
  dialog.showModal();
  try {
    const chunk = Math.floor(id / state.meta.detailChunkSize);
    let details = state.detailChunks.get(chunk);
    if (!details) {
      details = await loadGzipJson(`./data/details-${String(chunk).padStart(2, '0')}.json.gz`);
      state.detailChunks.set(chunk, details);
    }
    const data = details[String(id)];
    if (!data) throw new Error('Estrutura não encontrada nos arquivos desta pasta');
    data.id = id;
    state.detail = data;
    const ranking = data.ranking;
    $('#dialog-title').textContent = ranking.formula_A2BBpX6;
    $('#dialog-subtitle').textContent = `A ${ranking.A_site_ion} · B ${ranking.B_site_ion} · B′ ${ranking["B'_site_ion"]} · X ${ranking.X_site_ion} · índice ${data.id}`;
    const summary = $('#dialog-summary');
    summary.replaceChildren();
    for (const [label, value] of [['Lista de descoberta', data.tierTable ? tierLabel({ tier: data.tierTable.priority_tier }) : 'Não listado'], ['Tier no ranking geral', ranking.priority_tier], ['Prioridade', ranking.laboratory_priority_rank ? `#${ranking.laboratory_priority_rank}` : '—'], ['Similaridade', formatNum(ranking.experimental_likeness_score, 5)], ['τ Bartel', formatNum(ranking.bartel_tau, 4)], ['Tier A final', data.finalTierA ? 'Sim' : 'Não']]) {
      const chip = document.createElement('span');
      chip.className = 'summary-chip';
      const strong = document.createElement('strong');
      strong.textContent = `${label}: `;
      chip.append(strong, document.createTextNode(value));
      summary.append(chip);
    }
    const content = $('#dialog-content');
    content.replaceChildren();
    for (const section of [
      group('Ranking e previsões', ranking),
      group('Descritores do candidato', data.descriptors),
      group('Campos adicionais do tier', data.tierTable, ranking),
      group('Lista final do Tier A', data.finalTierA, { ...ranking, ...data.tierTable }),
      group('Exclusão da lista final do Tier A', data.excludedTierA, { ...ranking, ...data.tierTable })
    ]) if (section) content.append(section);
    $('#dialog-source').textContent = 'Valores preservados dos CSVs do projeto.';
  } catch (error) {
    $('#dialog-title').textContent = 'Não foi possível abrir a estrutura';
    $('#dialog-source').textContent = error.message;
  }
}

async function initialize() {
  try {
    $('#status').textContent = 'Carregando os dados da pasta...';
    const response = await fetch('./data/manifest.json');
    if (!response.ok) throw new Error('Não foi possível ler o manifesto de dados');
    state.meta = await response.json();
    const index = await loadGzipJson(`./data/${state.meta.indexFile}`);
    state.records = index.rows.map((row) => ({
      id: row[0], formula: row[1], a: row[2], b: row[3], bp: row[4], x: row[5],
      tier: row[6], model_tier: row[7], rank: row[8], likeness: row[9],
      ehull: row[10], final_a: row[11]
    }));
    $('#total-count').textContent = formatInt(state.meta.total);
    $('#final-count').textContent = formatInt(state.meta.tiers.tier_A_final || 0);
    buildTable();
    buildSiteChoices();
    updateSelection();
    runSearch();
  } catch (error) {
    $('#status').textContent = `Erro ao carregar o dataset: ${error.message}`;
    $('#result-context').textContent = 'Abra esta pasta pelo GitHub Pages ou por um servidor local de arquivos.';
  }
}

async function loadGzipJson(path) {
  if (!('DecompressionStream' in window)) throw new Error('Este navegador não consegue abrir os arquivos de dados compactados. Atualize o navegador.');
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Não foi possível abrir ${path}`);
  const compressed = await response.arrayBuffer();
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

let formulaTimer;
$('#formula').addEventListener('input', () => { clearTimeout(formulaTimer); formulaTimer = setTimeout(() => runSearch(), 250); });
$('#tier').addEventListener('change', () => runSearch());
for (const radio of document.querySelectorAll('input[name="mode"]')) radio.addEventListener('change', () => runSearch());
for (const select of document.querySelectorAll('[data-site]')) select.addEventListener('change', () => runSearch());
$('#clear-elements').addEventListener('click', () => { state.selected.clear(); updateSelection(); runSearch(); });
$('#reset-filters').addEventListener('click', () => {
  state.selected.clear();
  $('#formula').value = '';
  $('#tier').value = 'all';
  document.querySelector('input[name="mode"][value="all"]').checked = true;
  for (const select of document.querySelectorAll('[data-site]')) select.value = '';
  updateSelection();
  runSearch();
});
$('#prev-page').addEventListener('click', () => { state.page--; runSearch(false); });
$('#next-page').addEventListener('click', () => { state.page++; runSearch(false); });
$('#close-dialog').addEventListener('click', () => $('#structure-dialog').close());
$('#copy-json').addEventListener('click', async () => {
  if (!state.detail) return;
  await navigator.clipboard.writeText(JSON.stringify(state.detail, null, 2));
  $('#copy-json').textContent = 'JSON copiado';
  setTimeout(() => { $('#copy-json').textContent = 'Copiar JSON completo'; }, 1800);
});
initialize();
