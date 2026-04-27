(() => {
  const PATHS = {
    machines: 'data/gc-machines.json',
    columns: 'data/gc-columns.json',
    tempPrograms: 'data/gc-temp-programs.json',
    rtLibrary: 'data/gc-rt-library.json',
    analyteDisplay: 'data/gc-analyte-display.json'
  };

  const els = {
    machineFilter: document.getElementById('machineFilter'),
    columnFilter: document.getElementById('columnFilter'),
    tempFilter: document.getElementById('tempFilter'),
    confidenceFilter: document.getElementById('confidenceFilter'),
    searchInput: document.getElementById('searchInput'),
    lowOnly: document.getElementById('lowOnly'),
    summaryText: document.getElementById('summaryText'),
    tableBody: document.getElementById('tableBody')
  };

  let rows = [];

  init();

  async function init() {
    const [machines, columns, tempPrograms, rtLibrary, analyteDisplay] = await Promise.all([
      fetchJson(PATHS.machines), fetchJson(PATHS.columns), fetchJson(PATHS.tempPrograms), fetchJson(PATHS.rtLibrary), fetchJson(PATHS.analyteDisplay)
    ]);

    const machineMap = new Map((machines || []).map((x) => [x.id, x.name]));
    const columnMap = new Map((columns || []).map((x) => [x.id, x.name]));
    const tempMap = new Map((tempPrograms || []).map((x) => [x.id, x.display_name || x.label || x.id]));
    const analyteMap = new Map(Object.entries(analyteDisplay || {}));

    fillSelect(els.machineFilter, machines, 'name');
    fillSelect(els.columnFilter, columns, 'name');
    fillSelect(els.tempFilter, tempPrograms, 'display_name');

    rows = (rtLibrary || []).map((r) => ({
      machine: machineMap.get(r.machine_id) || r.machine_id || '-',
      machineId: r.machine_id || '',
      column: columnMap.get(r.column_id) || r.column_id || '-',
      columnId: r.column_id || '',
      temp: tempMap.get(r.temp_program_id) || r.temp_program_id || '-',
      tempId: r.temp_program_id || '',
      analyte: analyteMap.get(r.analyte_normalized) || r.analyte_original || r.analyte_normalized || '-',
      rt: Number(r.rt_min),
      confidence: String(r.certainty || 'medium').toLowerCase(),
      note: r.note || ''
    })).sort((a, b) => a.rt - b.rt);

    [els.machineFilter, els.columnFilter, els.tempFilter, els.confidenceFilter, els.searchInput, els.lowOnly].forEach((el) => {
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
      if (q && !(`${r.analyte} ${r.note}`.toLowerCase().includes(q))) return false;
      return true;
    });

    els.summaryText.textContent = `表示 ${filtered.length} / 全 ${rows.length} 件`;

    if (!filtered.length) {
      els.tableBody.innerHTML = '<tr><td colspan="7" class="empty-cell">該当データがありません。</td></tr>';
      return;
    }

    els.tableBody.innerHTML = filtered.map((r) => `
      <tr>
        <td>${escapeHtml(r.machine)}</td>
        <td>${escapeHtml(r.column)}</td>
        <td>${escapeHtml(r.temp)}</td>
        <td>${escapeHtml(r.analyte)}</td>
        <td class="rt">${fmt(r.rt)}</td>
        <td>${confidenceBadge(r.confidence)}</td>
        <td>${escapeHtml(r.note || '-')}</td>
      </tr>
    `).join('');
  }

  function fillSelect(el, list, key) { (list || []).forEach((x) => { const o = document.createElement('option'); o.value = x.id; o.textContent = x[key] || x.id; el.appendChild(o); }); }
  function confidenceBadge(value) { const label = value === 'high' ? '高' : value === 'low' ? '低' : '中'; return `<span class="badge badge-${value}">${label}</span>`; }
  function fmt(n) { return Number.isFinite(n) ? Number(n.toFixed(3)).toString() : '-'; }
  function escapeHtml(v) { return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
  async function fetchJson(path) { const r = await fetch(path); if (!r.ok) throw new Error(path + ' の読み込みに失敗'); return r.json(); }
})();
