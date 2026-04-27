(function () {
  const PATHS = {
    workplaces: 'data/gc-workplaces.json',
    machines: 'data/gc-machines.json',
    columns: 'data/gc-columns.json',
    tempPrograms: 'data/gc-temp-programs.json',
    rtLibrary: 'data/gc-rt-library.json',
    analyteAliases: 'data/gc-analyte-aliases.json',
    analyteDisplay: 'data/gc-analyte-display.json',
    favorites: 'data/gc-favorite-analytes.json',
    rules: 'data/gc-method-rules.json'
  };

  const el = {
    workplaceCodeSelect: document.getElementById('workplaceCodeSelect'),
    applyWorkplaceConditionBtn: document.getElementById('applyWorkplaceConditionBtn'),
    applyWorkplaceAllBtn: document.getElementById('applyWorkplaceAllBtn'),
    machineFilter: document.getElementById('machineFilter'),
    columnFilter: document.getElementById('columnFilter'),
    tempFilter: document.getElementById('tempFilter'),
    analysisTimeLimitInput: document.getElementById('analysisTimeLimitInput'),
    analysisTimeFilterStatus: document.getElementById('analysisTimeFilterStatus'),
    analyteInput: document.getElementById('analyteInput'),
    analyteList: document.getElementById('analyteList'),
    quickAnalytes: document.getElementById('quickAnalytes'),
    quickLiquidAnalytes: document.getElementById('quickLiquidAnalytes'),
    selectedAnalytes: document.getElementById('selectedAnalytes'),
    addAnalyteBtn: document.getElementById('addAnalyteBtn'),
    clearAnalytesBtn: document.getElementById('clearAnalytesBtn'),
    suggestBtn: document.getElementById('suggestBtn'),
    multiGcStartTime: document.getElementById('multiGcStartTime'),
    multiSetupBufferInput: document.getElementById('multiSetupBufferInput'),
    multiWorkplaceInputs: document.getElementById('multiWorkplaceInputs'),
    addMultiWorkplaceBtn: document.getElementById('addMultiWorkplaceBtn'),
    multiSuggestBtn: document.getElementById('multiSuggestBtn'),
    multiPlanSummary: document.getElementById('multiPlanSummary'),
    multiPlanDetails: document.getElementById('multiPlanDetails'),
    dataWarning: document.getElementById('dataWarning'),
    recommendations: document.getElementById('recommendations'),
    rtSummary: document.getElementById('rtSummary'),
    rtGraph: document.getElementById('rtGraph'),
    graphMeta: document.getElementById('graphMeta'),
    graphLegend: document.getElementById('graphLegend'),
    unknownAnalytesPanel: document.getElementById('unknownAnalytesPanel'),
    rtTableBody: document.getElementById('rtTableBody'),
    selectedMethodMemo: document.getElementById('selectedMethodMemo')
  };

  const state = {
    data: null,
    selectedAnalytes: new Map(),
    ranked: [],
    workplaceMap: new Map(),
    lastFilterReport: null,
    multiWorkplaces: [],
    chosenMethodMemos: [],
    favoriteMeta: { common: new Set(), liquid_standard: new Set(), all: new Set() }
  };

  init();

  async function init() {
    try {
      state.data = await loadData();
      fillFilterOptions();
      fillAnalyteOptions();
      bindEvents();
      initMultiPlanSection();
      loadChosenMethodMemos();
      showInitialWarnings();
    } catch (error) {
      console.error(error);
      el.recommendations.innerHTML = '<p class="empty-text">データ読み込みに失敗しました。JSON形式を確認してください。</p>';
    }
  }

  async function loadData() {
    const [workplaces, machines, columns, tempPrograms, rtLibrary, analyteAliases, analyteDisplay, favorites, rules] = await Promise.all([
      fetchJson(PATHS.workplaces),
      fetchJson(PATHS.machines),
      fetchJson(PATHS.columns),
      fetchJson(PATHS.tempPrograms),
      fetchJson(PATHS.rtLibrary),
      fetchJson(PATHS.analyteAliases),
      fetchJson(PATHS.analyteDisplay),
      fetchJson(PATHS.favorites, { common: [], liquid_standard: [] }),
      fetchJson(PATHS.rules)
    ]);

    const aliasBundle = buildAliasBundle(analyteAliases, rules, analyteDisplay);
    const normalizedRtLibrary = normalizeRtLibrary(rtLibrary, aliasBundle.aliasLookup);
    const validationReport = validateRtLibrary(normalizedRtLibrary);
    const analyteCatalog = buildAnalyteCatalog(aliasBundle, normalizedRtLibrary);
    const favoriteMeta = buildFavoriteMeta(favorites, aliasBundle, analyteCatalog);
    state.favoriteMeta = favoriteMeta;
    const methods = buildMethods(machines, columns, tempPrograms, normalizedRtLibrary);

    return {
      workplaces,
      machines,
      columns,
      tempPrograms,
      rtLibrary: normalizedRtLibrary,
      rules,
      aliasBundle,
      analyteCatalog,
      favoriteMeta,
      methods,
      validationReport,
      dataDensityLow: normalizedRtLibrary.length < 30
    };
  }

  function buildAliasBundle(analyteAliases, rules, analyteDisplay) {
    const canonicalToAliases = new Map();
    const aliasLookup = new Map();
    const displayNames = new Map();

    Object.entries(analyteDisplay || {}).forEach(([id, label]) => {
      if (!id || !label) return;
      displayNames.set(id, String(label));
      aliasLookup.set(normalizeName(id), id);
    });

    Object.entries(analyteAliases || {}).forEach(([canonical, aliases]) => {
      const list = [canonical].concat(Array.isArray(aliases) ? aliases : []).map((n) => String(n || '')).filter(Boolean);
      canonicalToAliases.set(canonical, list);
      list.forEach((name) => {
        aliasLookup.set(normalizeName(name), canonical);
      });
    });

    (rules?.analytes || []).forEach((row) => {
      const canonical = resolveCanonicalFromRule(row, aliasLookup);
      if (!canonical) return;
      if (!canonicalToAliases.has(canonical)) {
        canonicalToAliases.set(canonical, [row.label || canonical]);
      }
      [row.id, row.label].concat(row.aliases || []).forEach((name) => {
        if (!name) return;
        aliasLookup.set(normalizeName(name), canonical);
        const list = canonicalToAliases.get(canonical) || [];
        if (!list.includes(name)) list.push(name);
        canonicalToAliases.set(canonical, list);
      });
    });

    canonicalToAliases.forEach((aliases, canonical) => {
      if (!displayNames.has(canonical)) {
        displayNames.set(canonical, aliases[0] || canonical);
      }
    });

    return { canonicalToAliases, aliasLookup, displayNames };
  }

  function normalizeRtLibrary(rtLibrary, aliasLookup) {
    return (rtLibrary || []).map((row) => {
      const analyteNormalizedRaw = String(row.analyte_normalized || '').trim();
      const resolvedFromAlias = aliasLookup.get(normalizeName(analyteNormalizedRaw || row.analyte_original || ''));
      const analyteNormalized = resolvedFromAlias || analyteNormalizedRaw;

      return {
        machine_id: row.machine_id,
        column_id: row.column_id,
        temp_program_id: row.temp_program_id,
        analyte_original: row.analyte_original || analyteNormalized || '-',
        analyte_normalized: analyteNormalized,
        rt_min: Number(row.rt_min),
        certainty: String(row.certainty || 'medium').toLowerCase(),
        source: row.source || 'manual_scan',
        note: row.note || ''
      };
    });
  }

  function validateRtLibrary(rtLibrary) {
    const errors = [];
    const duplicateMap = new Map();

    (rtLibrary || []).forEach((row, idx) => {
      const line = idx + 1;
      if (!row.machine_id) errors.push('line ' + line + ': machine_id が未定義');
      if (!row.column_id) errors.push('line ' + line + ': column_id が未定義');
      if (!row.temp_program_id) errors.push('line ' + line + ': temp_program_id が未定義');
      if (!String(row.analyte_normalized || '').trim()) errors.push('line ' + line + ': analyte_normalized が空');
      if (!Number.isFinite(row.rt_min)) errors.push('line ' + line + ': rt_min が数値ではない');

      const dupKey = [row.machine_id, row.column_id, row.temp_program_id, normalizeName(row.analyte_normalized)].join('__');
      if (duplicateMap.has(dupKey)) {
        errors.push('line ' + line + ': 重複候補 (' + dupKey + ')');
      } else {
        duplicateMap.set(dupKey, true);
      }
    });

    return { errors };
  }

  function buildAnalyteCatalog(aliasBundle, rtLibrary) {
    const map = new Map();

    aliasBundle.canonicalToAliases.forEach((aliases, canonical) => {
      const displayName = getDisplayName(canonical, aliasBundle.displayNames, aliases[0] || canonical);
      map.set(canonical, {
        id: canonical,
        label: displayName,
        aliases: aliases.map(normalizeName)
      });
    });

    (rtLibrary || []).forEach((row) => {
      const id = row.analyte_normalized;
      if (!id) return;
      if (!map.has(id)) {
        const displayName = getDisplayName(id, aliasBundle.displayNames, row.analyte_original || id);
        map.set(id, {
          id,
          label: displayName,
          aliases: [normalizeName(row.analyte_original), normalizeName(id)].filter(Boolean)
        });
      }
    });

    return Array.from(map.values())
      .filter((item, idx, list) => list.findIndex((x) => normalizeName(x.id) === normalizeName(item.id)) === idx);
  }

  function getSortedAnalyteCatalog() {
    return state.data.analyteCatalog
      .map((item) => ({ item, rtOrder: getAnalyteRtOrder(item.id), favRank: getFavoriteRank(item.id) }))
      .sort((a, b) => compareFavoriteRank(a.favRank, b.favRank) || compareRtOrder(a.rtOrder, b.rtOrder, a.item, b.item))
      .map((entry) => entry.item);
  }

  function getAnalyteRtOrder(analyteId) {
    const rows = (state.data.rtLibrary || []).filter((row) => row.analyte_normalized === analyteId);
    if (!rows.length) {
      return {
        priority: 2,
        rt: Number.POSITIVE_INFINITY,
        fallbackRt: Number.POSITIVE_INFINITY
      };
    }

    const matchedRows = rows.filter((row) => matchesCurrentFilters(row));
    const matchedRt = getMinRt(matchedRows);
    const fallbackRt = getMinRt(rows);

    if (Number.isFinite(matchedRt)) {
      return {
        priority: 0,
        rt: matchedRt,
        fallbackRt
      };
    }

    return {
      priority: 1,
      rt: fallbackRt,
      fallbackRt
    };
  }

  function matchesCurrentFilters(row) {
    if (el.machineFilter.value && row.machine_id !== el.machineFilter.value) return false;
    if (el.columnFilter.value && row.column_id !== el.columnFilter.value) return false;
    if (el.tempFilter.value && row.temp_program_id !== el.tempFilter.value) return false;
    return true;
  }

  function getMinRt(rows) {
    const rtValues = (rows || []).map((row) => Number(row.rt_min)).filter(Number.isFinite);
    if (!rtValues.length) return Number.POSITIVE_INFINITY;
    return Math.min(...rtValues);
  }

  function compareRtOrder(orderA, orderB, itemA, itemB) {
    if (orderA.priority !== orderB.priority) return orderA.priority - orderB.priority;
    if (orderA.rt !== orderB.rt) return orderA.rt - orderB.rt;
    if (orderA.fallbackRt !== orderB.fallbackRt) return orderA.fallbackRt - orderB.fallbackRt;
    return itemA.label.localeCompare(itemB.label, 'ja');
  }


  function buildFavoriteMeta(favorites, aliasBundle, analyteCatalog) {
    const idLookup = new Map();
    (analyteCatalog || []).forEach((item) => {
      [item.id, item.label].concat(item.aliases || []).forEach((name) => {
        idLookup.set(normalizeName(name), item.id);
      });
    });

    function resolveId(entry) {
      const keys = [entry?.normalized_name, entry?.display_name];
      const aliasNames = aliasBundle.canonicalToAliases.get(entry?.normalized_name) || [];
      keys.push(...aliasNames);
      for (const key of keys) {
        const hit = idLookup.get(normalizeName(key));
        if (hit) return hit;
      }
      return null;
    }

    const common = new Set((favorites?.common || []).map(resolveId).filter(Boolean));
    const liquid = new Set((favorites?.liquid_standard || []).map(resolveId).filter(Boolean));
    return { common, liquid_standard: liquid, all: new Set([...common, ...liquid]) };
  }

  function getFavoriteRank(analyteId) {
    if (state.data?.favoriteMeta?.common?.has(analyteId)) return 0;
    if (state.data?.favoriteMeta?.liquid_standard?.has(analyteId)) return 1;
    return 2;
  }

  function compareFavoriteRank(a, b) {
    if (a === b) return 0;
    return a - b;
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

  async function fetchJson(path, fallbackValue) {
    const res = await fetch(path);
    if (!res.ok) {
      if (fallbackValue !== undefined) return fallbackValue;
      throw new Error(path + ' の読み込みに失敗');
    }
    return res.json();
  }

  function bindEvents() {
    if (el.workplaceCodeSelect) {
      el.workplaceCodeSelect.addEventListener('change', () => applyWorkplacePreset(false));
    }
    if (el.applyWorkplaceConditionBtn) {
      el.applyWorkplaceConditionBtn.addEventListener('click', () => applyWorkplacePreset(false));
    }
    if (el.applyWorkplaceAllBtn) {
      el.applyWorkplaceAllBtn.addEventListener('click', () => applyWorkplacePreset(true));
    }

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
      const selected = Array.from(state.selectedAnalytes.values());
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
        fillAnalyteOptions();
        syncQuickChipState();
        if (state.ranked.length) {
          state.ranked = rankMethods(Array.from(state.selectedAnalytes.values()));
          renderRecommendations();
          if (state.ranked[0]) showMethodDetails(state.ranked[0]);
        }
      });
    });

    if (el.analysisTimeLimitInput) {
      el.analysisTimeLimitInput.addEventListener('input', () => {
        updateAnalysisTimeFilterStatus();
        if (state.ranked.length) {
          state.ranked = rankMethods(Array.from(state.selectedAnalytes.values()));
          renderRecommendations();
          if (state.ranked[0]) showMethodDetails(state.ranked[0]);
        }
      });
    }

    if (el.addMultiWorkplaceBtn) {
      el.addMultiWorkplaceBtn.addEventListener('click', () => {
        state.multiWorkplaces.push(createMultiWorkplaceEntry());
        renderMultiWorkplaceInputs();
      });
    }

    if (el.multiSuggestBtn) {
      el.multiSuggestBtn.addEventListener('click', suggestMultiWorkplacePlan);
    }

    updateAnalysisTimeFilterStatus();
  }

  function showInitialWarnings() {
    const warnings = [];
    if (state.data.validationReport.errors.length) {
      warnings.push('RTデータ検証エラー: ' + state.data.validationReport.errors.slice(0, 3).join(' / '));
    }
    if (state.data.dataDensityLow) {
      warnings.push('候補精度は暫定です（データ件数が少ないため）。');
    }
    showWarning(warnings.join(' '));
  }

  function fillFilterOptions() {
    fillWorkplaceOptions();
    fillSelect(el.machineFilter, state.data.machines, 'name');
    fillSelect(el.columnFilter, state.data.columns, 'name');
    fillSelect(el.tempFilter, state.data.tempPrograms, 'display_name');
  }

  function fillWorkplaceOptions() {
    if (!el.workplaceCodeSelect) return;
    el.workplaceCodeSelect.innerHTML = '<option value="">選択してください</option>';
    state.workplaceMap = new Map();
    (state.data.workplaces || []).forEach((row) => {
      if (!row || !row.id) return;
      const option = document.createElement('option');
      option.value = row.id;
      option.textContent = row.display_label || row.id;
      el.workplaceCodeSelect.appendChild(option);
      state.workplaceMap.set(row.id, row);
    });
  }

  function fillSelect(selectEl, list, labelKey) {
    (list || []).forEach((row) => {
      const option = document.createElement('option');
      option.value = row.id;
      option.textContent = row[labelKey] || row.label || row.id;
      selectEl.appendChild(option);
    });
  }

  function fillAnalyteOptions() {
    const sortedCatalog = getSortedAnalyteCatalog();
    el.analyteList.innerHTML = '';
    el.quickAnalytes.innerHTML = '';
    if (el.quickLiquidAnalytes) el.quickLiquidAnalytes.innerHTML = '';

    sortedCatalog.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.label;
      el.analyteList.appendChild(option);
    });

    getFavoriteAnalyteItems('common').forEach((item) => {
      const chip = buildAnalyteChip(item);
      el.quickAnalytes.appendChild(chip);
    });

    if (el.quickLiquidAnalytes) {
      getFavoriteAnalyteItems('liquid_standard').forEach((item) => {
        const liquidChip = buildAnalyteChip(item, 'liquid-chip');
        el.quickLiquidAnalytes.appendChild(liquidChip);
      });
    }
  }

  function buildAnalyteChip(item, extraClassName) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'quick-chip' + (extraClassName ? ' ' + extraClassName : '');
    chip.dataset.analyteId = item.id;
    chip.textContent = item.label;
    chip.setAttribute('aria-pressed', state.selectedAnalytes.has(item.id) ? 'true' : 'false');
    chip.addEventListener('click', () => {
      if (state.selectedAnalytes.has(item.id)) {
        state.selectedAnalytes.delete(item.id);
      } else {
        state.selectedAnalytes.set(item.id, { id: item.id, label: item.label, known: true });
      }
      renderSelectedAnalytes();
      syncQuickChipState();
    });
    return chip;
  }

  function getFavoriteAnalyteItems(kind) {
    const target = kind === 'liquid_standard' ? state.data?.favoriteMeta?.liquid_standard : state.data?.favoriteMeta?.common;
    return getSortedAnalyteCatalog().filter((item) => target?.has(item.id));
  }

  function addAnalyteFromInput() {
    const raw = el.analyteInput.value.trim();
    if (!raw) return;

    const resolved = resolveAnalyte(raw);
    state.selectedAnalytes.set(resolved.id, resolved);

    el.analyteInput.value = '';
    renderSelectedAnalytes();
    syncQuickChipState();
  }

  function resolveAnalyte(raw) {
    const norm = normalizeName(raw);
    const fromCatalog = getSortedAnalyteCatalog().find((item) => {
      if (normalizeName(item.label) === norm || normalizeName(item.id) === norm) return true;
      return item.aliases.includes(norm);
    });

    if (fromCatalog) {
      return { id: fromCatalog.id, label: fromCatalog.label, known: true };
    }

    return {
      id: 'unknown__' + norm,
      label: raw,
      known: false
    };
  }

  function renderSelectedAnalytes() {
    if (!state.selectedAnalytes.size) {
      el.selectedAnalytes.textContent = 'なし';
      return;
    }

    el.selectedAnalytes.innerHTML = Array.from(state.selectedAnalytes.entries()).map(([id, item]) => {
      const className = item.known ? 'selected-tag' : 'selected-tag unregistered';
      const suffix = item.known ? '' : '（未登録）';
      return '<span class="' + className + '">' + escapeHtml(item.label + suffix) +
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
    [el.quickAnalytes, el.quickLiquidAnalytes].filter(Boolean).forEach((container) => {
      Array.from(container.children).forEach((chip) => {
        const selected = state.selectedAnalytes.has(chip.dataset.analyteId);
        chip.classList.toggle('active', selected);
        chip.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    });
  }

  function applyWorkplacePreset(includeAnalytes) {
    const code = el.workplaceCodeSelect?.value || '';
    if (!code || !state.workplaceMap.has(code)) return;

    const workplace = state.workplaceMap.get(code);
    el.machineFilter.value = workplace.machine_id || '';
    el.columnFilter.value = workplace.column_id || '';
    el.tempFilter.value = workplace.temp_program_id || '';
    fillAnalyteOptions();
    syncQuickChipState();

    if (includeAnalytes) {
      applyWorkplaceAnalytes(workplace.default_analytes || []);
    }

    clearOutputs();
  }

  function applyWorkplaceAnalytes(analyteIds) {
    (analyteIds || []).forEach((analyteId) => {
      const resolved = resolveAnalyte(String(analyteId || ''));
      if (!resolved.id || !resolved.known) return;
      state.selectedAnalytes.set(resolved.id, resolved);
    });
    renderSelectedAnalytes();
    syncQuickChipState();
  }

  function initMultiPlanSection() {
    if (!el.multiWorkplaceInputs) return;
    const setupDefault = Number(state.data?.rules?.multi_workplace_plan?.default_setup_buffer_per_unit_min);
    if (el.multiSetupBufferInput && Number.isFinite(setupDefault) && setupDefault >= 0) {
      el.multiSetupBufferInput.value = setupDefault.toFixed(1);
    }
    state.multiWorkplaces = [createMultiWorkplaceEntry('A01'), createMultiWorkplaceEntry('A02')];
    renderMultiWorkplaceInputs();
    resetMultiPlanOutput();
  }

  function createMultiWorkplaceEntry(defaultCode) {
    const seed = defaultCode || suggestNextWorkplaceCode(state.multiWorkplaces);
    return {
      key: 'mw_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      code: seed,
      selectedAnalytes: new Map()
    };
  }

  function suggestNextWorkplaceCode(entries) {
    const used = new Set((entries || []).map((item) => String(item.code || '').trim().toUpperCase()));
    for (let i = 1; i <= 99; i += 1) {
      const candidate = 'A' + String(i).padStart(2, '0');
      if (!used.has(candidate)) return candidate;
    }
    return 'B01';
  }

  function renderMultiWorkplaceInputs() {
    if (!el.multiWorkplaceInputs) return;
    el.multiWorkplaceInputs.innerHTML = '';

    state.multiWorkplaces.forEach((entry, index) => {
      const card = document.createElement('article');
      card.className = 'multi-workplace-card';
      card.innerHTML = [
        '<div class="multi-workplace-head">',
        '<label>単位作業場所コード<input type="text" class="multi-workplace-code" data-key="', escapeHtml(entry.key), '" value="', escapeHtml(entry.code), '" placeholder="例: A01"></label>',
        '<button type="button" class="plain danger-text multi-clear-btn" data-key="', escapeHtml(entry.key), '">この作業場をクリア</button>',
        '</div>',
        '<div class="input-row">',
        '<input type="text" class="multi-analyte-input" data-key="', escapeHtml(entry.key), '" list="analyteList" placeholder="物質を入力">',
        '<button type="button" class="plain multi-add-btn" data-key="', escapeHtml(entry.key), '">物質を追加</button>',
        '</div>',
        '<div class="quick-chips multi-quick-chips" data-key="', escapeHtml(entry.key), '"></div>',
        '<div class="selected-row"><strong>入力物質</strong><div class="selected-chips multi-selected-chips" data-key="', escapeHtml(entry.key), '">なし</div></div>',
        index >= 2 ? '<button type="button" class="plain danger-text multi-remove-btn" data-key="' + escapeHtml(entry.key) + '">作業場を削除</button>' : ''
      ].join('');
      el.multiWorkplaceInputs.appendChild(card);

      renderMultiQuickChips(entry, card.querySelector('.multi-quick-chips'));
      renderMultiSelectedAnalytes(entry, card.querySelector('.multi-selected-chips'));
    });

    bindMultiWorkplaceEvents();
  }

  function bindMultiWorkplaceEvents() {
    Array.from(el.multiWorkplaceInputs.querySelectorAll('.multi-workplace-code')).forEach((input) => {
      input.addEventListener('input', () => {
        const entry = state.multiWorkplaces.find((item) => item.key === input.dataset.key);
        if (!entry) return;
        entry.code = sanitizeWorkplaceCode(input.value);
        input.value = entry.code;
      });
    });

    Array.from(el.multiWorkplaceInputs.querySelectorAll('.multi-add-btn')).forEach((button) => {
      button.addEventListener('click', () => addMultiAnalyte(button.dataset.key));
    });

    Array.from(el.multiWorkplaceInputs.querySelectorAll('.multi-analyte-input')).forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        addMultiAnalyte(input.dataset.key);
      });
    });

    Array.from(el.multiWorkplaceInputs.querySelectorAll('.multi-clear-btn')).forEach((button) => {
      button.addEventListener('click', () => {
        const entry = state.multiWorkplaces.find((item) => item.key === button.dataset.key);
        if (!entry) return;
        entry.selectedAnalytes.clear();
        renderMultiWorkplaceInputs();
      });
    });

    Array.from(el.multiWorkplaceInputs.querySelectorAll('.multi-remove-btn')).forEach((button) => {
      button.addEventListener('click', () => {
        state.multiWorkplaces = state.multiWorkplaces.filter((item) => item.key !== button.dataset.key);
        if (!state.multiWorkplaces.length) state.multiWorkplaces.push(createMultiWorkplaceEntry('A01'));
        renderMultiWorkplaceInputs();
      });
    });
  }

  function renderMultiQuickChips(entry, container) {
    if (!container) return;
    getFavoriteAnalyteItems('common').forEach((item) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'quick-chip' + (entry.selectedAnalytes.has(item.id) ? ' active' : '');
      chip.setAttribute('aria-pressed', entry.selectedAnalytes.has(item.id) ? 'true' : 'false');
      chip.textContent = item.label;
      chip.addEventListener('click', () => {
        if (entry.selectedAnalytes.has(item.id)) {
          entry.selectedAnalytes.delete(item.id);
        } else {
          entry.selectedAnalytes.set(item.id, { id: item.id, label: item.label, known: true });
        }
        renderMultiWorkplaceInputs();
      });
      container.appendChild(chip);
    });
  }

  function renderMultiSelectedAnalytes(entry, container) {
    if (!container) return;
    if (!entry.selectedAnalytes.size) {
      container.textContent = 'なし';
      return;
    }
    container.innerHTML = Array.from(entry.selectedAnalytes.entries()).map(([id, item]) => {
      const className = item.known ? 'selected-tag' : 'selected-tag unregistered';
      const suffix = item.known ? '' : '（未登録）';
      return '<span class="' + className + '">' + escapeHtml(item.label + suffix) +
        '<button type="button" class="multi-remove-analyte" data-workplace-key="' + escapeHtml(entry.key) + '" data-remove-id="' + escapeHtml(id) + '">×</button></span>';
    }).join('');

    Array.from(container.querySelectorAll('.multi-remove-analyte')).forEach((button) => {
      button.addEventListener('click', () => {
        const target = state.multiWorkplaces.find((item) => item.key === button.dataset.workplaceKey);
        if (!target) return;
        target.selectedAnalytes.delete(button.dataset.removeId);
        renderMultiWorkplaceInputs();
      });
    });
  }

  function addMultiAnalyte(workplaceKey) {
    const entry = state.multiWorkplaces.find((item) => item.key === workplaceKey);
    const input = el.multiWorkplaceInputs.querySelector('.multi-analyte-input[data-key="' + workplaceKey + '"]');
    if (!entry || !input) return;
    const raw = String(input.value || '').trim();
    if (!raw) return;
    const resolved = resolveAnalyte(raw);
    entry.selectedAnalytes.set(resolved.id, resolved);
    input.value = '';
    renderMultiWorkplaceInputs();
  }

  function sanitizeWorkplaceCode(value) {
    const upper = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return upper.slice(0, 4);
  }

  function suggestMultiWorkplacePlan() {
    const prepared = state.multiWorkplaces.map((entry, index) => ({
      key: entry.key,
      code: sanitizeWorkplaceCode(entry.code) || suggestNextWorkplaceCode(state.multiWorkplaces.slice(0, index)),
      selectedEntries: Array.from(entry.selectedAnalytes.values())
    })).filter((entry) => entry.selectedEntries.length > 0);

    if (!prepared.length) {
      el.multiPlanSummary.innerHTML = '<p class="empty-text">先に各作業場へ物質を1つ以上入力してください。</p>';
      el.multiPlanDetails.innerHTML = '';
      return;
    }

    const results = prepared.map((row) => {
      const ranked = rankMethods(row.selectedEntries, {});
      return {
        code: row.code,
        selectedEntries: row.selectedEntries,
        ranked,
        top: ranked[0] || null
      };
    });

    const setupBufferPerUnit = Math.max(0, Number(el.multiSetupBufferInput?.value || 1) || 1);
    const totalAnalysis = results.reduce((sum, row) => sum + (Number(row.top?.analysisTime) || 0), 0);
    const totalBuffer = setupBufferPerUnit * results.length;
    const totalMinutes = totalAnalysis + totalBuffer;
    const plan = buildMultiPlanJudgement(results, totalMinutes);

    renderMultiPlanSummary(plan, totalMinutes, totalAnalysis, totalBuffer, setupBufferPerUnit, results.length);
    renderMultiPlanDetails(results);
  }

  function renderMultiPlanSummary(plan, totalMinutes, totalAnalysis, totalBuffer, setupBufferPerUnit, unitCount) {
    const hasStart = Boolean(el.multiGcStartTime?.value);
    const startLabel = hasStart ? el.multiGcStartTime.value : '未入力';
    const endLabel = hasStart ? calcEndTimeLabel(el.multiGcStartTime.value, totalMinutes) : '開始時刻入力で表示';
    const commentHtml = plan.comments.map((msg) => '<li>' + escapeHtml(msg) + '</li>').join('');
    const consultClass = plan.requiresConsultation ? ' needs-consultation' : '';

    el.multiPlanSummary.innerHTML = [
      '<article class="multi-summary-card', consultClass, '">',
      '<h3>全体プラン（候補提案）</h3>',
      '<p>使用候補機械: <strong>', escapeHtml(plan.machineSummary), '</strong></p>',
      '<p>GC2014優先: <strong>', plan.prefersGc2014 ? 'はい' : '要確認', '</strong></p>',
      '<p>作業場数: <strong>', unitCount, '単位</strong></p>',
      '<p>合計分析時間: <strong>', formatCompactNumber(totalAnalysis, 1, 2), ' min</strong></p>',
      '<p>段取り余裕時間: <strong>', formatCompactNumber(totalBuffer, 1, 2), ' min</strong>（', formatCompactNumber(setupBufferPerUnit, 1, 2), ' min × ', unitCount, '）</p>',
      '<p>合計目安: <strong>', formatCompactNumber(totalMinutes, 1, 2), ' min</strong></p>',
      '<p>開始時刻: <strong>', escapeHtml(startLabel), '</strong> / 終了目安: <strong>', escapeHtml(endLabel), '</strong></p>',
      '<p class="hint">※ 最終判断は装置状況・実測で要確認です。</p>',
      '<ul class="multi-comment-list">', commentHtml, '</ul>',
      '</article>'
    ].join('');
  }

  function renderMultiPlanDetails(results) {
    if (!results.length) {
      el.multiPlanDetails.innerHTML = '';
      return;
    }
    el.multiPlanDetails.innerHTML = results.map((row) => {
      const analytes = row.selectedEntries.map((item) => item.label).join('、');
      if (!row.top) {
        return [
          '<article class="multi-result-card">',
          '<h4>', escapeHtml(row.code), '</h4>',
          '<p>入力物質: ', escapeHtml(analytes), '</p>',
          '<p>推奨候補: 要確認</p>',
          '<p class="provisional-badge">データ不足のため候補を出せませんでした。</p>',
          '</article>'
        ].join('');
      }
      const best = row.top;
      return [
        '<article class="multi-result-card">',
        '<h4>', escapeHtml(row.code), '</h4>',
        '<p>入力物質: ', escapeHtml(analytes), '</p>',
        '<p>推奨候補: 第1候補（要確認）</p>',
        '<p>機械: <strong>', escapeHtml(best.method.machine?.name || '-'), '</strong></p>',
        '<p>カラム: <strong>', escapeHtml(best.method.column?.name || '-'), '</strong></p>',
        '<p>温度条件: <strong>', escapeHtml(getTempProgramDisplay(best.method.tempProgram)), '</strong></p>',
        '<p>分析時間: <strong>', formatAnalysisTime(best.analysisTime), '</strong></p>',
        '<p>最小RT差: <strong>', formatCompactNumber(best.minGap, 2, 3), ' min</strong></p>',
        '<p>信頼度: <strong>', escapeHtml(best.confidenceLabel), '</strong></p>',
        '<p>注意点: ', escapeHtml(buildJudgementMemo(best)), '</p>',
        best.provisional ? '<p class="provisional-badge">暫定候補（要確認）</p>' : '',
        '</article>'
      ].join('');
    }).join('');
  }

  function buildMultiPlanJudgement(results, totalMinutes) {
    const planningRules = state.data?.rules?.multi_workplace_plan || {};
    const unitCount = results.length;
    const singleMachineMaxUnits = Number(planningRules.single_machine_priority_units_max ?? 2);
    const consultationMinUnits = Number(planningRules.consultation_units_min ?? 3);
    const shortThreshold = Number(planningRules.short_total_min ?? 20);
    const longThreshold = Number(planningRules.long_total_min ?? 30);
    const lateStartThreshold = String(planningRules.late_start_time || '16:00');
    const missingCount = results.filter((row) => !row.top).length;
    const topMachines = results.map((row) => row.top?.method?.machine?.name).filter(Boolean);
    const gc2014Name = state.data.machines.find((m) => m.id === 'gc2014')?.name || 'GC2014';
    const comments = [];
    let requiresConsultation = false;
    let machineSummary = topMachines.length ? Array.from(new Set(topMachines)).join(' / ') : '要確認';
    let prefersGc2014 = true;

    if (unitCount <= 1) {
      comments.push('1単位のため、1台運用候補です。');
      comments.push(gc2014Name + 'を優先した候補提案です。');
      machineSummary = gc2014Name + ' 1台運用候補';
    } else if (unitCount <= singleMachineMaxUnits) {
      comments.push(unitCount + '単位のため、' + gc2014Name + ' 1台で処理候補です。');
      machineSummary = gc2014Name + ' 1台運用候補';
    } else if (unitCount >= consultationMinUnits) {
      comments.push('3単位以上のため要相談です。');
      requiresConsultation = true;
      prefersGc2014 = false;
      if (totalMinutes <= shortThreshold) {
        comments.push('合計時間が短いため、' + gc2014Name + ' 1台でも対応候補です。');
      }
      if (totalMinutes > longThreshold) {
        comments.push('合計時間が長いため、複数台運用も検討してください。');
      }
    } else {
      comments.push('運用条件を要確認です。');
    }

    if (isLateStartTime(el.multiGcStartTime?.value, lateStartThreshold)) {
      comments.push('開始時刻が遅いため、複数台運用も検討してください。');
    }
    if (missingCount > 0) {
      comments.push('一部データ未登録のため要確認です。');
    }
    if (!comments.length) {
      comments.push('候補提案です。要確認のうえ運用判断してください。');
    }

    return {
      machineSummary,
      comments,
      requiresConsultation,
      prefersGc2014
    };
  }

  function calcEndTimeLabel(startTime, plusMinutes) {
    const base = parseTimeToMinutes(startTime);
    if (!Number.isFinite(base) || !Number.isFinite(plusMinutes)) return '要確認';
    const total = base + plusMinutes;
    const normalized = ((Math.round(total) % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hour = String(Math.floor(normalized / 60)).padStart(2, '0');
    const minute = String(normalized % 60).padStart(2, '0');
    return hour + ':' + minute + '頃';
  }

  function parseTimeToMinutes(time) {
    const text = String(time || '');
    if (!text.includes(':')) return null;
    const [h, m] = text.split(':').map((n) => Number(n));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return (h * 60) + m;
  }

  function isLateStartTime(startTime, thresholdTime) {
    const start = parseTimeToMinutes(startTime);
    const threshold = parseTimeToMinutes(thresholdTime);
    if (!Number.isFinite(start) || !Number.isFinite(threshold)) return false;
    return start >= threshold;
  }

  function resetMultiPlanOutput() {
    if (el.multiPlanSummary) {
      el.multiPlanSummary.innerHTML = '<p class="empty-text">作業場入力後に「まとめて候補提案」を押してください。</p>';
    }
    if (el.multiPlanDetails) {
      el.multiPlanDetails.innerHTML = '';
    }
  }

  function rankMethods(selectedEntries, overrideFilters) {
    const selectedKnownIds = selectedEntries
      .filter((item) => item.known && !isUndeterminedId(item.id))
      .map((item) => item.id);
    const selectedUndetermined = selectedEntries.filter((item) => item.known && isUndeterminedId(item.id));
    const unknownItems = selectedEntries.filter((item) => !item.known);
    const candidateMethods = state.data.methods.filter((method) => matchFilters(method, overrideFilters));
    const analysisTimeLimit = getAnalysisTimeLimit();
    const weights = state.data.rules.weights || {};
    const thresholds = state.data.rules.thresholds || {};
    const certaintyScore = state.data.rules.certainty_score || { high: 1, medium: 0.6, low: 0.3 };

    const evaluated = candidateMethods
      .map((method) => {
        const scoredRecords = method.records.filter((row) => !isUndeterminedRow(row));
        const matches = scoredRecords.filter((row) => selectedKnownIds.includes(row.analyte_normalized));
        if (!matches.length) return null;
        const hasUndeterminedInMethod = method.records.some(isUndeterminedRow);
        const lowCertaintyMatchCount = matches.filter((row) => String(row.certainty || '').toLowerCase() === 'low').length;

        const coverageRate = selectedKnownIds.length ? matches.length / selectedKnownIds.length : 0;
        const minGap = calcMinGap(matches);
        const separationScore = calcSeparationScore(minGap, thresholds);
        const certaintyAvg = average(matches.map((row) => certaintyScore[String(row.certainty || 'medium').toLowerCase()] ?? 0.4));
        const runtime = Number(method.tempProgram?.runtime_min || method.tempProgram?.estimated_runtime_min || 0);
        const runtimeScore = runtime > 0 ? Math.max(0, 1 - runtime / (state.data.rules.runtime_reference_min || 30)) : 0.2;
        const analysisTime = calcAnalysisTime(matches);
        const analysisTimeScore = calcAnalysisTimeScore(analysisTime, state.data.rules);
        const analysisTimeWeight = Number(weights.analysis_time ?? 4);
        const rtGapPenalty = minGap < (thresholds.warn_rt_gap_min || 0.15) ? 8 : 0;
        const undeterminedPenalty = hasUndeterminedInMethod ? 4 : 0;
        const lowCertaintyPenalty = lowCertaintyMatchCount * 2;
        const selectedUndeterminedPenalty = selectedUndetermined.length * 4;

        const score =
          coverageRate * (weights.coverage || 0) +
          separationScore * (weights.separation || 0) +
          runtimeScore * (weights.runtime || 0) +
          analysisTimeScore * analysisTimeWeight +
          certaintyAvg * (weights.certainty || 0) -
          rtGapPenalty -
          undeterminedPenalty -
          lowCertaintyPenalty -
          selectedUndeterminedPenalty;

        const missingKnown = selectedKnownIds.filter((id) => !matches.some((row) => row.analyte_normalized === id));
        const missing = missingKnown.concat(unknownItems.map((item) => item.label));
        const dataCount = method.records.length;
        const dataShortage = matches.length < 2 || dataCount < 4;
        const provisional = missing.length > 0 || dataShortage || lowCertaintyMatchCount > 0;

        return {
          method,
          matches,
          score,
          coverageRate,
          minGap,
          certaintyAvg,
          runtime,
          analysisTime,
          rtRange: calcRtRange(matches),
          missing,
          unknownItems,
          matchCount: matches.length,
          selectedCount: selectedEntries.length,
          dataCount,
          provisional,
          confidenceLabel: toConfidenceLabel(certaintyAvg),
          hasUndeterminedInMethod,
          lowCertaintyMatchCount,
          dataShortage,
          selectedUndetermined
        };
      })
      .filter(Boolean);

    const EPSILON = 1e-9;
    const kept = [];
    let excludedByAnalysisTime = 0;
    evaluated.forEach((item) => {
      if (!Number.isFinite(analysisTimeLimit)) {
        kept.push(item);
        return;
      }
      if (Number(item.analysisTime) <= analysisTimeLimit + EPSILON) {
        kept.push(item);
      } else {
        excludedByAnalysisTime += 1;
      }
    });

    state.lastFilterReport = {
      analysisTimeLimit,
      excludedByAnalysisTime,
      baseCandidateCount: evaluated.length,
      finalCandidateCount: kept.length
    };

    return kept
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  function matchFilters(method, overrideFilters) {
    const machineFilter = overrideFilters?.machine ?? el.machineFilter.value;
    const columnFilter = overrideFilters?.column ?? el.columnFilter.value;
    const tempFilter = overrideFilters?.temp ?? el.tempFilter.value;
    if (machineFilter && method.machine?.id !== machineFilter) return false;
    if (columnFilter && method.column?.id !== columnFilter) return false;
    if (tempFilter && method.tempProgram?.id !== tempFilter) return false;
    return true;
  }

  function renderRecommendations() {
    updateAnalysisTimeFilterStatus(state.lastFilterReport);

    if (!state.ranked.length) {
      const selected = Array.from(state.selectedAnalytes.values());
      const hasKnown = selected.some((item) => item.known);
      const reasonSet = [];
      if (selected.filter((item) => !item.known).length >= Math.ceil(selected.length / 2)) {
        reasonSet.push('未登録溶剤が多い');
      }
      if (el.machineFilter.value || el.columnFilter.value || el.tempFilter.value) {
        reasonSet.push('条件フィルタが厳しすぎる');
      }
      if (hasKnown) reasonSet.push('データ件数不足');
      if (state.lastFilterReport?.excludedByAnalysisTime > 0) {
        reasonSet.push('分析時間上限で除外');
      }
      if (!reasonSet.length) reasonSet.push('入力溶剤が未登録');
      const emptyReason = '候補が0件です。理由: ' + reasonSet.join(' / ') + '。';
      const strictTimeMessage = state.lastFilterReport?.excludedByAnalysisTime > 0
        ? '<br>分析時間上限を緩めると候補が見つかる可能性があります。'
        : '';
      el.recommendations.innerHTML = '<p class="empty-text">条件に合う候補がありません。<br>' + escapeHtml(emptyReason) + strictTimeMessage + '</p>';
      clearDetails();
      showWarning('候補提案できません。フィルタ緩和・alias追記・RTデータ追加を確認してください。');
      return;
    }

    el.recommendations.innerHTML = '';
    const hasMissing = state.ranked.some((item) => item.missing.length);
    const hasProvisional = state.ranked.some((item) => item.provisional);
    const hasUnknown = state.ranked.some((item) => item.unknownItems.length);
    const hasUndetermined = state.ranked.some((item) => item.hasUndeterminedInMethod);
    const hasLowCertainty = state.ranked.some((item) => item.lowCertaintyMatchCount > 0);

    const warnings = [];
    if (hasMissing || hasUnknown) warnings.push('未登録またはデータ不足の溶剤があります。');
    if (hasUndetermined) warnings.push('「名称未確定」データを含む条件は低優先で評価しています。');
    if (hasLowCertainty) warnings.push('信頼度「低」を含む候補は注意表示しています。');
    if (state.lastFilterReport?.excludedByAnalysisTime > 0) {
      warnings.push('分析時間上限で ' + state.lastFilterReport.excludedByAnalysisTime + ' 件除外しました。');
    }
    if (state.data.dataDensityLow || hasProvisional) warnings.push('候補精度は暫定です。');
    if (state.data.validationReport.errors.length) warnings.push('RTデータ検証エラーあり。');
    showWarning(warnings.join(' '));

    state.ranked.forEach((item, idx) => {
      const card = document.createElement('article');
      card.className = 'rec-card' + (idx === 0 ? ' top' : '');

      const memo = buildJudgementMemo(item);
      const tempLabel = getTempProgramDisplay(item.method.tempProgram);

      card.innerHTML = [
        '<div class="rank-row">',
        '<p><span class="rank-badge">第', (idx + 1), '候補</span><strong>', escapeHtml(item.method.machine?.name || item.method.machine?.id || '-'), '</strong></p>',
        '<p>評価 ', item.score.toFixed(1), '</p>',
        '</div>',
        '<p class="reason">',
        'カラム: ', escapeHtml(item.method.column?.name || '-'), '<br>',
        '温度条件: ', escapeHtml(tempLabel), '<br>',
        '一致件数: ', item.matchCount, '/', item.selectedCount, '<br>',
        'RT範囲: ', item.rtRange || '-', '<br>',
        '分析時間: ', formatAnalysisTime(item.analysisTime), '<br>',
        '最小RT差: ', item.minGap.toFixed(2), ' min<br>',
        '信頼度: ', escapeHtml(item.confidenceLabel), '<br>',
        '判定メモ: ', escapeHtml(memo),
        item.lowCertaintyMatchCount > 0 ? '<br><span class="provisional-badge">注意: 信頼度「低」のデータを含む</span>' : '',
        item.hasUndeterminedInMethod ? '<br><span class="provisional-badge">名称未確定データ含む</span>' : '',
        item.dataShortage ? '<br><span class="provisional-badge">データ不足</span>' : '',
        item.provisional ? '<br><span class="provisional-badge">暫定候補</span>' : '',
        '</p>',
        '<div class="rec-action-row">',
        '<button type="button" class="rec-select-btn" data-method-id="', escapeHtml(item.method.id), '">RT一覧を見る</button>',
        '<button type="button" class="plain rec-use-btn" data-method-id="', escapeHtml(item.method.id), '">この条件を使う</button>',
        '</div>'
      ].join('');

      card.querySelector('.rec-select-btn').addEventListener('click', () => showMethodDetails(item));
      card.querySelector('.rec-use-btn').addEventListener('click', () => saveChosenMethod(item));
      el.recommendations.appendChild(card);
    });
  }

  function showMethodDetails(item) {
    const tempLabel = getTempProgramDisplay(item.method.tempProgram);
    el.rtSummary.innerHTML = [
      '<strong>', escapeHtml(item.method.machine?.name || '-'), '</strong> × ',
      '<strong>', escapeHtml(item.method.column?.name || '-'), '</strong> × ',
      '<strong>', escapeHtml(tempLabel), '</strong>',
      '<br>対象溶剤カバー: ', (item.coverageRate * 100).toFixed(0), '% / 一致: ', item.matchCount, '/', item.selectedCount,
      '<br>RT範囲: ', item.rtRange || '-',
      '<br>分析時間: ', formatAnalysisTime(item.analysisTime),
      item.missing.length ? '<br>未登録・不足: ' + escapeHtml(item.missing.join(', ')) : '',
      item.hasUndeterminedInMethod ? '<br>注意: RT一覧に「名称未確定」データを含みます。' : ''
    ].join('');

    renderUnknownAnalytes(item.unknownItems);
    const matchedIds = item.matches.map((row) => row.analyte_normalized);
    renderGraph(item.matches, item.runtime, matchedIds);
    renderTable(item.matches, matchedIds);
  }

  function renderGraph(rows, runtime, selectedIds) {
    if (!rows.length) {
      el.rtGraph.innerHTML = '<p class="empty-text">表示データがありません。</p>';
      el.graphMeta.innerHTML = '';
      el.graphLegend.innerHTML = '';
      return;
    }

    const sortedRows = rows.slice().sort((a, b) => a.rt_min - b.rt_min);
    const rtValues = sortedRows.map((row) => Number(row.rt_min) || 0);
    const maxRtObserved = Math.max(...rtValues, 0);
    const runtimeValue = Number(runtime) || 0;
    const axisMax = getGraphAxisMax(maxRtObserved, runtimeValue);
    const tickStep = getTickStep(axisMax);

    const track = document.createElement('div');
    track.className = 'graph-track';

    const labelLevels = assignLabelLevels(sortedRows, axisMax);
    const levelCount = Math.max(...labelLevels, 0) + 1;
    track.style.setProperty('--label-levels', String(levelCount));

    const ticksLayer = document.createElement('div');
    ticksLayer.className = 'graph-ticks';
    for (let tick = 0; tick <= axisMax + 1e-6; tick += tickStep) {
      const left = (tick / axisMax) * 100;
      const tickEl = document.createElement('span');
      tickEl.className = 'tick';
      tickEl.style.left = Math.min(left, 100) + '%';
      tickEl.textContent = formatTickLabel(tick, tickStep);
      ticksLayer.appendChild(tickEl);
    }
    track.appendChild(ticksLayer);

    if (runtimeValue > 0) {
      const runtimeLine = document.createElement('span');
      runtimeLine.className = 'runtime-line';
      runtimeLine.style.left = Math.min((runtimeValue / axisMax) * 100, 100) + '%';
      track.appendChild(runtimeLine);
    }

    sortedRows.forEach((row, idx) => {
      const rt = Number(row.rt_min) || 0;
      const left = (rt / axisMax) * 100;
      const isSelected = selectedIds.includes(row.analyte_normalized);
      const isLow = String(row.certainty || '').toLowerCase() === 'low';
      const level = labelLevels[idx] || 0;

      const guide = document.createElement('span');
      guide.className = 'graph-guide' + (isSelected ? ' highlighted' : '') + (isLow ? ' low-certainty' : '');
      guide.style.left = Math.min(left, 100) + '%';
      track.appendChild(guide);

      const marker = document.createElement('span');
      marker.className = 'graph-marker' + (isSelected ? ' highlighted' : '') + (isLow ? ' low-certainty' : '');
      marker.style.left = Math.min(left, 100) + '%';
      track.appendChild(marker);

      const label = document.createElement('span');
      label.className = 'graph-label' + (isSelected ? ' highlighted' : '') + (isLow ? ' low-certainty' : '');
      label.style.left = Math.min(left, 100) + '%';
      label.style.top = 'calc(6px + ' + (level * 16) + 'px)';
      label.textContent = (idx + 1) + '. ' + toAnalyteLabel(row.analyte_normalized, row.analyte_original) + ' (' + rt.toFixed(2) + ')';
      track.appendChild(label);
    });

    el.rtGraph.innerHTML = '';
    el.rtGraph.appendChild(track);

    const axis = document.createElement('div');
    axis.className = 'axis-label';
    axis.innerHTML = 'RT(min): <strong>0 〜 ' + formatAxisValue(axisMax) + '</strong>' +
      (runtimeValue > 0 ? '<span class="runtime-axis-note">分析時間: ' + formatCompactNumber(runtimeValue, 2, 3) + ' min</span>' : '');
    el.rtGraph.appendChild(axis);

    const minGap = getMinimumRtGap(rtValues);
    const selectedCount = sortedRows.filter((row) => selectedIds.includes(row.analyte_normalized)).length;
    const compactFlag = axisMax <= 4 ? '<span class="meta-chip">短時間レンジ最適化</span>' : '';
    el.graphMeta.innerHTML = [
      '<span class="meta-chip strong">分析時間: ', runtimeValue > 0 ? formatCompactNumber(runtimeValue, 2, 3) : '-', ' min</span>',
      minGap !== null ? '<span class="meta-chip">最小RT差: ' + formatCompactNumber(minGap, 2, 3) + ' min</span>' : '',
      selectedCount > 0 ? '<span class="meta-chip">対象溶剤のみ強調: ' + selectedCount + '件</span>' : '',
      compactFlag
    ].join('');

    el.graphLegend.innerHTML = sortedRows.map((row, idx) => {
      const certainty = String(row.certainty || '-').toLowerCase();
      const lowClass = certainty === 'low' ? ' low' : '';
      return '<span class="legend-item">[' + (idx + 1) + '] ' +
        escapeHtml(toAnalyteLabel(row.analyte_normalized, row.analyte_original)) +
        ' / RT: ' + formatCompactNumber(Number(row.rt_min), 2, 3) +
        ' <span class="legend-certainty' + lowClass + '">' + escapeHtml(toCertaintyLabel(certainty)) + '</span></span>';
    }).join('');
  }

  function getGraphAxisMax(maxRtObserved, runtimeValue) {
    const basis = Math.max(maxRtObserved, runtimeValue, 0.6);
    const withMargin = basis * 1.04;
    return roundUpAxis(withMargin);
  }

  function roundUpAxis(value) {
    if (value <= 3) return Math.ceil(value * 2) / 2;
    if (value <= 12) return Math.ceil(value * 2) / 2;
    return Math.ceil(value);
  }

  function getTickStep(axisMax) {
    if (axisMax <= 1.5) return 0.1;
    if (axisMax <= 3) return 0.25;
    if (axisMax <= 6) return 0.5;
    if (axisMax <= 10) return 1;
    if (axisMax <= 20) return 2;
    return 5;
  }

  function formatTickLabel(value, tickStep) {
    const decimal = tickStep < 0.2 ? 2 : tickStep < 1 ? 1 : 0;
    return value.toFixed(decimal);
  }

  function assignLabelLevels(rows, axisMax) {
    const levels = [];
    const levelRt = [];
    const collisionThreshold = axisMax <= 4 ? 0.18 : axisMax <= 8 ? 0.24 : 0.35;

    rows.forEach((row) => {
      const rt = Number(row.rt_min) || 0;
      let level = 0;
      while (levelRt[level] !== undefined && Math.abs(rt - levelRt[level]) < collisionThreshold) {
        level += 1;
      }
      levels.push(level);
      levelRt[level] = rt;
    });

    return levels;
  }

  function getMinimumRtGap(rtValues) {
    if (!Array.isArray(rtValues) || rtValues.length < 2) return null;
    const sorted = rtValues.slice().sort((a, b) => a - b);
    let minGap = Number.POSITIVE_INFINITY;
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = sorted[i] - sorted[i - 1];
      if (gap < minGap) minGap = gap;
    }
    return Number.isFinite(minGap) ? minGap : null;
  }

  function renderTable(rows, selectedIds) {
    if (!rows.length) {
      el.rtTableBody.innerHTML = '<tr><td colspan="4" class="empty-cell">表示するデータがありません。</td></tr>';
      return;
    }

    el.rtTableBody.innerHTML = rows.slice().sort((a, b) => a.rt_min - b.rt_min).map((row, idx) => {
      const certainty = String(row.certainty || '-').toLowerCase();
      const certaintyLabel = '<span class="certainty-badge ' + (certainty === 'low' ? 'low' : '') + '">' + escapeHtml(toCertaintyLabel(certainty)) + '</span>';
      const rowClass = selectedIds.includes(row.analyte_normalized) ? ' class="highlighted-row"' : '';
      return [
        '<tr' + rowClass + '>',
        '<td><span class="rt-index">', (idx + 1), '</span> ', escapeHtml(toAnalyteLabel(row.analyte_normalized, row.analyte_original)), '</td>',
        '<td>', formatCompactNumber(Number(row.rt_min), 2, 3), '</td>',
        '<td>', certaintyLabel, '</td>',
        '<td>', escapeHtml(row.note || '-'), '</td>',
        '</tr>'
      ].join('');
    }).join('');
  }

  function clearOutputs() {
    el.recommendations.innerHTML = '<p class="empty-text">溶剤を追加して「候補を表示」を押してください。</p>';
    clearDetails();
    showInitialWarnings();
    state.ranked = [];
  }

  function clearDetails() {
    el.rtSummary.textContent = '候補が選択されていません。';
    el.rtGraph.innerHTML = '';
    el.graphMeta.innerHTML = '';
    el.graphLegend.innerHTML = '';
    el.unknownAnalytesPanel.hidden = true;
    el.unknownAnalytesPanel.textContent = '';
    el.rtTableBody.innerHTML = '<tr><td colspan="4" class="empty-cell">表示するデータがありません。</td></tr>';
  }

  function renderUnknownAnalytes(unknownItems) {
    if (!unknownItems.length) {
      el.unknownAnalytesPanel.hidden = true;
      el.unknownAnalytesPanel.textContent = '';
      return;
    }
    el.unknownAnalytesPanel.hidden = false;
    el.unknownAnalytesPanel.innerHTML = '未登録溶剤（RT位置図には非表示）: ' +
      unknownItems.map((item) => '<strong>' + escapeHtml(item.label) + '</strong>').join(', ');
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

  function getAnalysisTimeLimit() {
    if (!el.analysisTimeLimitInput) return null;
    const raw = String(el.analysisTimeLimitInput.value || '').trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return null;
    return value;
  }

  function updateAnalysisTimeFilterStatus(report) {
    if (!el.analysisTimeFilterStatus) return;
    const limit = Number.isFinite(report?.analysisTimeLimit) ? report.analysisTimeLimit : getAnalysisTimeLimit();
    if (!Number.isFinite(limit)) {
      el.analysisTimeFilterStatus.textContent = '分析時間上限: 未指定（全候補を対象）';
      return;
    }

    let text = '分析時間上限: ' + formatLimitNumber(limit) + ' min 以下';
    if (report && Number.isFinite(report.excludedByAnalysisTime) && report.excludedByAnalysisTime > 0) {
      text += '（' + report.excludedByAnalysisTime + '件除外）';
    }
    el.analysisTimeFilterStatus.textContent = text;
  }

  function formatLimitNumber(value) {
    if (!Number.isFinite(value)) return '-';
    return Number(value.toFixed(3)).toString();
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
    return 0.15;
  }

  function calcRtRange(rows) {
    if (!rows.length) return null;
    const values = rows.map((r) => Number(r.rt_min)).filter(Number.isFinite);
    if (!values.length) return null;
    return Math.min(...values).toFixed(2) + '〜' + Math.max(...values).toFixed(2) + ' min';
  }

  function calcAnalysisTime(rows) {
    const values = (rows || []).map((row) => Number(row.rt_min)).filter(Number.isFinite);
    if (!values.length) return null;
    return Math.max(...values) + 0.4;
  }

  function calcAnalysisTimeScore(analysisTime, rules) {
    if (!Number.isFinite(analysisTime)) return 0;
    const referenceMin = Number(rules?.analysis_time_reference_min || rules?.runtime_reference_min || 20);
    return Math.max(0, 1 - analysisTime / referenceMin);
  }

  function formatAnalysisTime(analysisTime) {
    if (!Number.isFinite(analysisTime)) return '算出不可';
    return formatCompactNumber(analysisTime, 2, 3) + ' min';
  }

  function buildJudgementMemo(item) {
    const parts = [];
    const coverage = Math.round(item.coverageRate * 100);
    parts.push('一致率' + coverage + '%');
    if (item.minGap >= 0.3) {
      parts.push('分離良好');
    } else if (item.minGap >= 0.15) {
      parts.push('分離やや接近');
    } else {
      parts.push('RT接近に注意');
    }
    if (item.confidenceLabel === '高') {
      parts.push('信頼度高');
    } else if (item.confidenceLabel === '中') {
      parts.push('信頼度中');
    } else {
      parts.push('信頼度低');
    }
    if (item.missing.length) parts.push('一部データ不足');
    return parts.join('・');
  }

  function toConfidenceLabel(certaintyAvg) {
    if (certaintyAvg >= 0.8) return '高';
    if (certaintyAvg >= 0.6) return '中';
    return '低';
  }

  function toCertaintyLabel(certainty) {
    if (certainty === 'high') return '高';
    if (certainty === 'medium') return '中';
    if (certainty === 'low') return '低';
    return '-';
  }

  function getTempProgramDisplay(tempProgram) {
    if (!tempProgram) return '-';
    return tempProgram.display_name || tempProgram.label || tempProgram.id || '-';
  }

  function formatCompactNumber(value, minDigits, maxDigits) {
    if (!Number.isFinite(value)) return '-';
    const fixed = Number(value).toFixed(maxDigits);
    const trimmed = fixed.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');
    if (!trimmed.includes('.')) return trimmed;
    const decimal = trimmed.split('.')[1].length;
    if (decimal >= minDigits) return trimmed;
    return Number(value).toFixed(minDigits);
  }

  function formatAxisValue(value) {
    return formatCompactNumber(value, 1, 2);
  }

  function isUndeterminedRow(row) {
    return normalizeName(row?.analyte_normalized) === normalizeName('未確定');
  }

  function isUndeterminedId(id) {
    return normalizeName(id) === normalizeName('未確定');
  }

  function average(arr) {
    if (!arr.length) return 0;
    return arr.reduce((sum, n) => sum + n, 0) / arr.length;
  }

  function resolveCanonicalFromRule(ruleRow, aliasLookup) {
    const names = [ruleRow?.id, ruleRow?.label].concat(ruleRow?.aliases || []);
    const matched = names.find((name) => aliasLookup.has(normalizeName(name)));
    if (matched) return aliasLookup.get(normalizeName(matched));
    return ruleRow?.id || '';
  }

  function getDisplayName(id, displayNames, fallback) {
    return displayNames.get(id) || fallback || id;
  }

  function toAnalyteLabel(normalizedId, fallbackOriginal) {
    if (!state.data?.aliasBundle?.displayNames) return fallbackOriginal || normalizedId;
    return getDisplayName(normalizedId, state.data.aliasBundle.displayNames, fallbackOriginal || normalizedId);
  }

  function normalizeName(text) {
    return String(text || '').trim().toLowerCase().replace(/\s+/g, '');
  }


  function saveChosenMethod(item) {
    const selectedLabels = Array.from(state.selectedAnalytes.values()).map((row) => row.label);
    const memo = {
      savedAt: new Date().toISOString(),
      analytes: selectedLabels,
      machine: item.method.machine?.name || '-',
      column: item.method.column?.name || '-',
      temp: getTempProgramDisplay(item.method.tempProgram),
      analysisTime: Number(item.analysisTime) || null,
      confidence: item.confidenceLabel
    };
    state.chosenMethodMemos.unshift(memo);
    state.chosenMethodMemos = state.chosenMethodMemos.slice(0, 6);
    localStorage.setItem('gc_selected_method_memos', JSON.stringify(state.chosenMethodMemos));
    renderChosenMethodMemos();
  }

  function loadChosenMethodMemos() {
    try {
      const raw = localStorage.getItem('gc_selected_method_memos');
      if (!raw) {
        renderChosenMethodMemos();
        return;
      }
      const parsed = JSON.parse(raw);
      state.chosenMethodMemos = Array.isArray(parsed) ? parsed.slice(0, 6) : [];
    } catch (error) {
      state.chosenMethodMemos = [];
    }
    renderChosenMethodMemos();
  }

  function renderChosenMethodMemos() {
    if (!el.selectedMethodMemo) return;
    if (!state.chosenMethodMemos.length) {
      el.selectedMethodMemo.textContent = 'まだ選択されていません。';
      return;
    }
    el.selectedMethodMemo.innerHTML = state.chosenMethodMemos.map((memo) => {
      const date = new Date(memo.savedAt || Date.now());
      const dateLabel = Number.isNaN(date.getTime()) ? '-' :
        date.getFullYear() + '/' + String(date.getMonth() + 1).padStart(2, '0') + '/' + String(date.getDate()).padStart(2, '0') +
        ' ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
      return [
        '<div class="memo-card">',
        '<strong>', escapeHtml(dateLabel), '</strong><br>',
        '対象物質: ', escapeHtml((memo.analytes || []).join('、') || '-'), '<br>',
        '機械: ', escapeHtml(memo.machine || '-'), ' / カラム: ', escapeHtml(memo.column || '-'), '<br>',
        '温度条件: ', escapeHtml(memo.temp || '-'), ' / 分析時間: ', Number.isFinite(memo.analysisTime) ? formatCompactNumber(memo.analysisTime, 2, 3) + ' min' : '-', '<br>',
        '信頼度: ', escapeHtml(memo.confidence || '-') ,
        '</div>'
      ].join('');
    }).join('');
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
