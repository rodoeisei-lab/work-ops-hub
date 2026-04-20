(function () {
  const PATHS = {
    machines: 'data/gc-machines.json',
    columns: 'data/gc-columns.json',
    tempPrograms: 'data/gc-temp-programs.json',
    rtLibrary: 'data/gc-rt-library.json',
    rules: 'data/gc-method-rules.json'
  };

  const el = {
    machineFilter: document.getElementById('machineFilter'),
    columnFilter: document.getElementById('columnFilter'),
    tempFilter: document.getElementById('tempFilter'),
    analyteInput: document.getElementById('analyteInput'),
    analyteList: document.getElementById('analyteList'),
    quickAnalytes: document.getElementById('quickAnalytes'),
    selectedAnalytes: document.getElementById('selectedAnalytes'),
    addAnalyteBtn: document.getElementById('addAnalyteBtn'),
    clearAnalytesBtn: document.getElementById('clearAnalytesBtn'),
    suggestBtn: document.getElementById('suggestBtn'),
    dataWarning: document.getElementById('dataWarning'),
    recommendations: document.getElementById('recommendations'),
    rtSummary: document.getElementById('rtSummary'),
    rtGraph: document.getElementById('rtGraph'),
    rtTableBody: document.getElementById('rtTableBody')
  };

  const state = {
    data: null,
    selectedAnalytes: new Map(),
    ranked: []
  };

  init();

  async function init() {
    try {
      state.data = await loadData();
      fillFilterOptions();
      fillAnalyteOptions();
      bindEvents();
    } catch (error) {
      console.error(error);
      el.recommendations.innerHTML = '<p class="empty-text">データ読み込みに失敗しました。JSON形式を確認してください。</p>';
    }
  }

  async function loadData() {
    const [machines, columns, tempPrograms, rtLibrary, rules] = await Promise.all([
      fetchJson(PATHS.machines),
      fetchJson(PATHS.columns),
      fetchJson(PATHS.tempPrograms),
      fetchJson(PATHS.rtLibrary),
      fetchJson(PATHS.rules)
    ]);

    const analyteCatalog = buildAnalyteCatalog(rtLibrary, rules);
    const methods = buildMethods(machines, columns, tempPrograms, rtLibrary);

    return { machines, columns, tempPrograms, rtLibrary, rules, analyteCatalog, methods };
  }

  function buildAnalyteCatalog(rtLibrary, rules) {
    const map = new Map();

    (rules.analytes || []).forEach((row) => {
      map.set(row.id, {
        id: row.id,
        label: row.label || row.id,
        aliases: (row.aliases || []).map(normalizeName)
      });
    });

    (rtLibrary || []).forEach((row) => {
      const id = row.analyte_id || normalizeName(row.analyte || '');
      if (!id) return;
      if (!map.has(id)) {
        map.set(id, {
          id,
          label: row.analyte || row.analyte_id,
          aliases: [normalizeName(row.analyte || ''), normalizeName(row.analyte_id || '')].filter(Boolean)
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  }

  function buildMethods(machines, columns, tempPrograms, rtLibrary) {
    const machineMap = new Map((machines || []).map((m) => [m.id, m]));
    const columnMap = new Map((columns || []).map((c) => [c.id, c]));
    const tempMap = new Map((tempPrograms || []).map((t) => [t.id, t]));
    const grouped = new Map();

    (rtLibrary || []).forEach((row) => {
      const key = [row.machine_id, row.column_id, row.temp_program_id].join('__');
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });

    return Array.from(grouped.entries()).map(([id, records]) => ({
      id,
      machine: machineMap.get(records[0].machine_id),
      column: columnMap.get(records[0].column_id),
      tempProgram: tempMap.get(records[0].temp_program_id),
      records: records.slice().sort((a, b) => a.rt_min - b.rt_min)
    }));
  }

  async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(path + ' の読み込みに失敗');
    return res.json();
  }

  function bindEvents() {
    el.addAnalyteBtn.addEventListener('click', addAnalyteFromInput);
    el.analyteInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addAnalyteFromInput();
      }
    });

    el.clearAnalytesBtn.addEventListener('click', () => {
      state.selectedAnalytes.clear();
      renderSelectedAnalytes();
      clearOutputs();
      syncQuickChipState();
    });

    el.suggestBtn.addEventListener('click', () => {
      const selected = Array.from(state.selectedAnalytes.keys());
      if (!selected.length) {
        el.recommendations.innerHTML = '<p class="empty-text">先に溶剤を1つ以上追加してください。</p>';
        return;
      }
      state.ranked = rankMethods(selected);
      renderRecommendations();
      if (state.ranked[0]) showMethodDetails(state.ranked[0]);
    });

    [el.machineFilter, el.columnFilter, el.tempFilter].forEach((node) => {
      node.addEventListener('change', () => {
        if (state.ranked.length) {
          state.ranked = rankMethods(Array.from(state.selectedAnalytes.keys()));
          renderRecommendations();
          if (state.ranked[0]) showMethodDetails(state.ranked[0]);
        }
      });
    });
  }

  function fillFilterOptions() {
    fillSelect(el.machineFilter, state.data.machines, 'name');
    fillSelect(el.columnFilter, state.data.columns, 'name');
    fillSelect(el.tempFilter, state.data.tempPrograms, 'label');
  }

  function fillSelect(selectEl, list, labelKey) {
    (list || []).forEach((row) => {
      const option = document.createElement('option');
      option.value = row.id;
      option.textContent = row[labelKey] || row.id;
      selectEl.appendChild(option);
    });
  }

  function fillAnalyteOptions() {
    el.analyteList.innerHTML = '';
    el.quickAnalytes.innerHTML = '';

    state.data.analyteCatalog.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.label;
      el.analyteList.appendChild(option);

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'quick-chip';
      chip.dataset.analyteId = item.id;
      chip.textContent = item.label;
      chip.addEventListener('click', () => {
        if (state.selectedAnalytes.has(item.id)) {
          state.selectedAnalytes.delete(item.id);
        } else {
          state.selectedAnalytes.set(item.id, item.label);
        }
        renderSelectedAnalytes();
        syncQuickChipState();
      });
      el.quickAnalytes.appendChild(chip);
    });
  }

  function addAnalyteFromInput() {
    const raw = el.analyteInput.value.trim();
    if (!raw) return;

    const resolved = resolveAnalyte(raw);
    state.selectedAnalytes.set(resolved.id, resolved.label);

    el.analyteInput.value = '';
    renderSelectedAnalytes();
    syncQuickChipState();
  }

  function resolveAnalyte(raw) {
    const norm = normalizeName(raw);
    const fromCatalog = state.data.analyteCatalog.find((item) => {
      if (normalizeName(item.label) === norm || normalizeName(item.id) === norm) return true;
      return item.aliases.includes(norm);
    });

    if (fromCatalog) return fromCatalog;

    return {
      id: norm || raw,
      label: raw,
      aliases: [norm]
    };
  }

  function renderSelectedAnalytes() {
    if (!state.selectedAnalytes.size) {
      el.selectedAnalytes.textContent = 'なし';
      return;
    }

    el.selectedAnalytes.innerHTML = Array.from(state.selectedAnalytes.entries()).map(([id, label]) => {
      return '<span class="selected-tag">' + escapeHtml(label) +
        '<button type="button" data-remove-id="' + escapeHtml(id) + '">×</button></span>';
    }).join('');

    Array.from(el.selectedAnalytes.querySelectorAll('button[data-remove-id]')).forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedAnalytes.delete(button.dataset.removeId);
        renderSelectedAnalytes();
        syncQuickChipState();
      });
    });
  }

  function syncQuickChipState() {
    Array.from(el.quickAnalytes.children).forEach((chip) => {
      chip.classList.toggle('active', state.selectedAnalytes.has(chip.dataset.analyteId));
    });
  }

  function rankMethods(selectedIds) {
    const candidateMethods = state.data.methods.filter(matchFilters);
    const weights = state.data.rules.weights || {};
    const thresholds = state.data.rules.thresholds || {};
    const certaintyScore = state.data.rules.certainty_score || { high: 1, medium: 0.6, low: 0.3 };

    return candidateMethods
      .map((method) => {
        const matches = method.records.filter((row) => selectedIds.includes(row.analyte_id));
        if (!matches.length) return null;

        const coverageRate = matches.length / selectedIds.length;
        const minGap = calcMinGap(matches);
        const separationScore = calcSeparationScore(minGap, thresholds);
        const certaintyAvg = average(matches.map((row) => certaintyScore[String(row.certainty || 'medium').toLowerCase()] ?? 0.4));
        const runtime = Number(method.tempProgram?.runtime_min || method.tempProgram?.estimated_runtime_min || 0);
        const runtimeScore = runtime > 0 ? Math.max(0, 1 - runtime / (state.data.rules.runtime_reference_min || 30)) : 0.2;

        const score =
          coverageRate * (weights.coverage || 0) +
          separationScore * (weights.separation || 0) +
          runtimeScore * (weights.runtime || 0) +
          certaintyAvg * (weights.certainty || 0);

        return {
          method,
          matches,
          score,
          coverageRate,
          minGap,
          certaintyAvg,
          runtime,
          rtRange: calcRtRange(matches),
          missing: selectedIds.filter((id) => !matches.some((row) => row.analyte_id === id))
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  function matchFilters(method) {
    if (el.machineFilter.value && method.machine?.id !== el.machineFilter.value) return false;
    if (el.columnFilter.value && method.column?.id !== el.columnFilter.value) return false;
    if (el.tempFilter.value && method.tempProgram?.id !== el.tempFilter.value) return false;
    return true;
  }

  function renderRecommendations() {
    if (!state.ranked.length) {
      el.recommendations.innerHTML = '<p class="empty-text">候補が見つかりません。フィルタ緩和かRTデータ追加を行ってください。</p>';
      clearDetails();
      showWarning('入力した溶剤のRTデータが不足しています。JSONを追加入力してください。');
      return;
    }

    el.recommendations.innerHTML = '';
    const hasMissing = state.ranked.some((item) => item.missing.length);
    showWarning(hasMissing ? '一部の溶剤でRTデータ不足があります。結果は暫定候補です。' : '');

    state.ranked.forEach((item, idx) => {
      const card = document.createElement('article');
      card.className = 'rec-card' + (idx === 0 ? ' top' : '');

      const reason = buildReasonText(item);

      card.innerHTML = [
        '<div class="rank-row">',
        '<p><strong>' + (idx + 1) + '位</strong> ' + escapeHtml(item.method.machine?.name || item.method.machine?.id || '-') + '</p>',
        '<p>スコア ' + item.score.toFixed(1) + '</p>',
        '</div>',
        '<p class="reason">',
        'カラム: ', escapeHtml(item.method.column?.name || '-'), '<br>',
        '温度条件: ', escapeHtml(item.method.tempProgram?.label || '-'), '<br>',
        '理由: ', escapeHtml(reason), '<br>',
        '想定RT範囲: ', item.rtRange || '-',
        '</p>',
        '<button type="button" class="rec-select-btn" data-method-id="', escapeHtml(item.method.id), '">この条件のRT一覧を表示</button>'
      ].join('');

      card.querySelector('.rec-select-btn').addEventListener('click', () => showMethodDetails(item));
      el.recommendations.appendChild(card);
    });
  }

  function showMethodDetails(item) {
    el.rtSummary.innerHTML = [
      '<strong>', escapeHtml(item.method.machine?.name || '-'), '</strong> × ',
      '<strong>', escapeHtml(item.method.column?.name || '-'), '</strong> × ',
      '<strong>', escapeHtml(item.method.tempProgram?.label || '-'), '</strong>',
      '<br>対象溶剤カバー: ', (item.coverageRate * 100).toFixed(0), '%'
    ].join('');

    renderGraph(item.matches, item.runtime);
    renderTable(item.matches);
  }

  function renderGraph(rows, runtime) {
    if (!rows.length) {
      el.rtGraph.innerHTML = '<p class="empty-text">表示データがありません。</p>';
      return;
    }

    const maxRt = Math.max(runtime || 0, ...rows.map((r) => Number(r.rt_min) || 0), 1);
    const track = document.createElement('div');
    track.className = 'graph-track';

    rows.slice().sort((a, b) => a.rt_min - b.rt_min).forEach((row) => {
      const left = ((Number(row.rt_min) || 0) / maxRt) * 100;

      const marker = document.createElement('span');
      marker.className = 'graph-marker';
      marker.style.left = Math.min(left, 100) + '%';
      track.appendChild(marker);

      const label = document.createElement('span');
      label.className = 'graph-label';
      label.style.left = Math.min(left, 100) + '%';
      label.textContent = (row.analyte || row.analyte_id) + ' (' + Number(row.rt_min).toFixed(2) + ')';
      track.appendChild(label);
    });

    el.rtGraph.innerHTML = '';
    el.rtGraph.appendChild(track);

    const axis = document.createElement('p');
    axis.className = 'axis-label';
    axis.textContent = 'RT(min): 0 〜 ' + maxRt.toFixed(1);
    el.rtGraph.appendChild(axis);
  }

  function renderTable(rows) {
    if (!rows.length) {
      el.rtTableBody.innerHTML = '<tr><td colspan="4" class="empty-cell">表示するデータがありません。</td></tr>';
      return;
    }

    el.rtTableBody.innerHTML = rows.slice().sort((a, b) => a.rt_min - b.rt_min).map((row) => {
      return [
        '<tr>',
        '<td>', escapeHtml(row.analyte || row.analyte_id), '</td>',
        '<td>', Number(row.rt_min).toFixed(3), '</td>',
        '<td>', escapeHtml(row.certainty || '-'), '</td>',
        '<td>', escapeHtml(row.note || '-'), '</td>',
        '</tr>'
      ].join('');
    }).join('');
  }

  function clearOutputs() {
    el.recommendations.innerHTML = '<p class="empty-text">溶剤を追加して「候補を提案する」を押してください。</p>';
    clearDetails();
    showWarning('');
    state.ranked = [];
  }

  function clearDetails() {
    el.rtSummary.textContent = '候補が選択されていません。';
    el.rtGraph.innerHTML = '';
    el.rtTableBody.innerHTML = '<tr><td colspan="4" class="empty-cell">表示するデータがありません。</td></tr>';
  }

  function showWarning(text) {
    if (!text) {
      el.dataWarning.hidden = true;
      el.dataWarning.textContent = '';
      return;
    }
    el.dataWarning.hidden = false;
    el.dataWarning.textContent = text;
  }

  function calcMinGap(rows) {
    if (rows.length <= 1) return 999;
    const sorted = rows.slice().sort((a, b) => a.rt_min - b.rt_min);
    let min = Number.POSITIVE_INFINITY;
    for (let i = 1; i < sorted.length; i += 1) {
      min = Math.min(min, sorted[i].rt_min - sorted[i - 1].rt_min);
    }
    return Number.isFinite(min) ? min : 0;
  }

  function calcSeparationScore(minGap, thresholds) {
    if (minGap >= (thresholds.good_rt_gap_min || 0.3)) return 1;
    if (minGap >= (thresholds.warn_rt_gap_min || 0.15)) return 0.55;
    return 0.2;
  }

  function calcRtRange(rows) {
    if (!rows.length) return null;
    const values = rows.map((r) => Number(r.rt_min)).filter(Number.isFinite);
    if (!values.length) return null;
    return Math.min(...values).toFixed(2) + '〜' + Math.max(...values).toFixed(2) + ' min';
  }

  function buildReasonText(item) {
    const parts = [];
    parts.push('入力溶剤カバー率 ' + (item.coverageRate * 100).toFixed(0) + '%');
    parts.push('最小RT差 ' + item.minGap.toFixed(2) + ' min');
    parts.push('certainty平均 ' + Math.round(item.certaintyAvg * 100) + '%');
    if (item.runtime) parts.push('推定分析時間 ' + item.runtime.toFixed(1) + ' min');
    if (item.missing.length) parts.push('未登録溶剤あり');
    return parts.join(' / ');
  }

  function average(arr) {
    if (!arr.length) return 0;
    return arr.reduce((sum, n) => sum + n, 0) / arr.length;
  }

  function normalizeName(text) {
    return String(text || '').trim().toLowerCase().replace(/\s+/g, '');
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
