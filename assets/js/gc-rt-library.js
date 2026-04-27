(() => {
  const PATHS = {
    machines: 'data/gc-machines.json',
    columns: 'data/gc-columns.json',
    tempPrograms: 'data/gc-temp-programs.json',
    rtLibrary: 'data/gc-rt-library.json',
    analyteDisplay: 'data/gc-analyte-display.json',
    favorites: 'data/gc-favorite-analytes.json',
    analyteAliases: 'data/gc-analyte-aliases.json'
  };

  const els = {
    machineFilter: document.getElementById('machineFilter'),
    columnFilter: document.getElementById('columnFilter'),
    tempFilter: document.getElementById('tempFilter'),
    confidenceFilter: document.getElementById('confidenceFilter'),
    searchInput: document.getElementById('searchInput'),
    favoriteFilter: document.getElementById('favoriteFilter'),
    lowOnly: document.getElementById('lowOnly'),
    summaryText: document.getElementById('summaryText'),
    tableBody: document.getElementById('tableBody'),
    mobileCardList: document.getElementById('mobileCardList')
  };

  let rows = [];
  let favoriteMeta = { common: new Set(), liquid_standard: new Set(), all: new Set() };

  init();

  async function init() {
    const [machines, columns, tempPrograms, rtLibrary, analyteDisplay, favorites, analyteAliases] = await Promise.all([
      fetchJson(PATHS.machines), fetchJson(PATHS.columns), fetchJson(PATHS.tempPrograms), fetchJson(PATHS.rtLibrary), fetchJson(PATHS.analyteDisplay), fetchJson(PATHS.favorites, { common: [], liquid_standard: [] }), fetchJson(PATHS.analyteAliases, {})
    ]);

    const machineMap = new Map((machines || []).map((x) => [x.id, x.name]));
    const columnMap = new Map((columns || []).map((x) => [x.id, x.name]));
    const tempMap = new Map((tempPrograms || []).map((x) => [x.id, x.display_name || x.label || x.id]));
    const analyteMap = new Map(Object.entries(analyteDisplay || {}));

    fillSelect(els.machineFilter, machines, 'name');
    fillSelect(els.columnFilter, columns, 'name');
    fillSelect(els.tempFilter, tempPrograms, 'display_name');

    favoriteMeta = buildFavoriteMeta(favorites, analyteDisplay, analyteAliases);

    rows = (rtLibrary || []).map((r) => ({
      machine: machineMap.get(r.machine_id) || r.machine_id || '-',
      machineId: r.machine_id || '',
      column: columnMap.get(r.column_id) || r.column_id || '-',
      columnId: r.column_id || '',
      temp: tempMap.get(r.temp_program_id) || r.temp_program_id || '-',
      tempId: r.temp_program_id || '',
      analyte: analyteMap.get(r.analyte_normalized) || r.analyte_original || r.analyte_normalized || '-',
      analyteId: r.analyte_normalized || '',
      rt: Number(r.rt_min),
      confidence: String(r.certainty || 'medium').toLowerCase(),
      note: r.note || ''
    })).sort((a, b) => a.rt - b.rt);

    [els.machineFilter, els.columnFilter, els.tempFilter, els.confidenceFilter, els.searchInput, els.favoriteFilter, els.lowOnly].filter(Boolean).forEach((el) => {
      el.addEventListener(el === els.searchInput ? 'input' : 'change', render);
    });

    render();
  }

  function render() {
    const q = String(els.searchInput.value || '').trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (els.machineFilter.value && r.machineId !== els.machineFilter.value) return false;
      if (els.columnFilter.value && r.columnId !== els.columnFilter.value) return false;
      if (els.tempFilter.value && r.tempId !== els.tempFilter.value) return false;
      if (els.confidenceFilter.value && r.confidence !== els.confidenceFilter.value) return false;
      if (els.lowOnly.checked && !(r.confidence === 'low' || /要確認/.test(r.note))) return false;
      if (els.favoriteFilter?.value) {
        const group = getFavoriteGroup(r.analyteId, r.analyte);
        if (els.favoriteFilter.value === 'any' && !group) return false;
        if (els.favoriteFilter.value !== 'any' && group !== els.favoriteFilter.value) return false;
      }
      if (q && !(`${r.analyte} ${r.note}`.toLowerCase().includes(q))) return false;
      return true;
    });

    els.summaryText.textContent = `表示 ${filtered.length} / 全 ${rows.length} 件`;

    if (!filtered.length) {
      els.tableBody.innerHTML = '<tr><td colspan="7" class="empty-cell">該当データがありません。</td></tr>';
      els.mobileCardList.innerHTML = '<p class="empty-cell">該当データがありません。</p>';
      return;
    }

    els.tableBody.innerHTML = filtered.map((r) => `
      <tr>
        <td>${escapeHtml(r.machine)}</td>
        <td>${escapeHtml(r.column)}</td>
        <td>${escapeHtml(r.temp)}</td>
        <td>${escapeHtml(r.analyte)}${favoriteBadge(r)}</td>
        <td class="rt">${fmt(r.rt)}</td>
        <td>${confidenceBadge(r.confidence)}</td>
        <td>${escapeHtml(r.note || '-')}</td>
      </tr>
    `).join('');

    els.mobileCardList.innerHTML = filtered.map((r) => `
      <article class="mobile-data-card">
        <p><strong>${escapeHtml(r.analyte)}</strong>${favoriteBadge(r)}</p>
        <p>機械: ${escapeHtml(r.machine)}</p>
        <p>カラム: ${escapeHtml(r.column)}</p>
        <p>温度条件: ${escapeHtml(r.temp)}</p>
        <p>RT: ${fmt(r.rt)} min</p>
        <p>信頼度: ${r.confidence === 'high' ? '高' : r.confidence === 'low' ? '低' : '中'}</p>
        <p>備考: ${escapeHtml(r.note || '-')}</p>
      </article>
    `).join('');
  }


  function buildFavoriteMeta(favorites, analyteDisplay, analyteAliases) {
    const displayToId = new Map(Object.entries(analyteDisplay || {}).map(([id, label]) => [normalize(label), id]));

    function resolveId(entry) {
      const keys = [entry?.normalized_name, entry?.display_name].filter(Boolean);
      const aliases = analyteAliases?.[entry?.normalized_name] || [];
      keys.push(...aliases);
      for (const key of keys) {
        const normalized = normalize(key);
        if (analyteDisplay?.[key]) return key;
        if (displayToId.has(normalized)) return displayToId.get(normalized);
        if ((analyteAliases && analyteAliases[key]) || analyteDisplay?.[key]) return key;
      }
      return null;
    }

    const common = new Set((favorites?.common || []).map(resolveId).filter(Boolean));
    const liquid = new Set((favorites?.liquid_standard || []).map(resolveId).filter(Boolean));
    return { common, liquid_standard: liquid, all: new Set([...common, ...liquid]) };
  }

  function getFavoriteGroup(analyteId, analyteLabel) {
    if (favoriteMeta.common.has(analyteId) || favoriteMeta.common.has(normalize(analyteLabel))) return 'common';
    if (favoriteMeta.liquid_standard.has(analyteId) || favoriteMeta.liquid_standard.has(normalize(analyteLabel))) return 'liquid_standard';
    return '';
  }

  function favoriteBadge(row) {
    const group = getFavoriteGroup(row.analyteId, row.analyte);
    if (!group) return '';
    const text = group === 'liquid_standard' ? 'よく使う(液体STD)' : 'よく使う';
    return ` <span class="badge badge-favorite">${escapeHtml(text)}</span>`;
  }

  function fillSelect(el, list, key) { (list || []).forEach((x) => { const o = document.createElement('option'); o.value = x.id; o.textContent = x[key] || x.id; el.appendChild(o); }); }
  function confidenceBadge(value) { const label = value === 'high' ? '高' : value === 'low' ? '低' : '中'; return `<span class="badge badge-${value}">${label}</span>`; }
  function fmt(n) { return Number.isFinite(n) ? Number(n.toFixed(3)).toString() : '-'; }
  function escapeHtml(v) { return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
  function normalize(v) { return String(v || '').trim().toLowerCase().replace(/[\s　]+/g, '').replace(/[_-]/g, '').normalize('NFKC'); }
  async function fetchJson(path, fallbackValue) { const r = await fetch(path); if (!r.ok) { if (fallbackValue !== undefined) return fallbackValue; throw new Error(path + ' の読み込みに失敗'); } return r.json(); }
})();
