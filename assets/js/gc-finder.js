(function () {
  const PATHS = {
    machines: 'data/gc-machines.json',
    columns: 'data/gc-columns.json',
    tempPrograms: 'data/gc-temp-programs.json',
    rtLibrary: 'data/gc-rt-library.json',
    analyteAliases: 'data/gc-analyte-aliases.json',
    analyteDisplay: 'data/gc-analyte-display.json',
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
    graphLegend: document.getElementById('graphLegend'),
    unknownAnalytesPanel: document.getElementById('unknownAnalytesPanel'),
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
      showInitialWarnings();
    } catch (error) {
      console.error(error);
      el.recommendations.innerHTML = '<p class="empty-text">データ読み込みに失敗しました。JSON形式を確認してください。</p>';
    }
  }

  async function loadData() {
    const [machines, columns, tempPrograms, rtLibrary, analyteAliases, analyteDisplay, rules] = await Promise.all([
      fetchJson(PATHS.machines),
      fetchJson(PATHS.columns),
      fetchJson(PATHS.tempPrograms),
      fetchJson(PATHS.rtLibrary),
      fetchJson(PATHS.analyteAliases),
      fetchJson(PATHS.analyteDisplay),
      fetchJson(PATHS.rules)
    ]);

    const aliasBundle = buildAliasBundle(analyteAliases, rules, analyteDisplay);
    const normalizedRtLibrary = normalizeRtLibrary(rtLibrary, aliasBundle.aliasLookup);
    const validationReport = validateRtLibrary(normalizedRtLibrary);
    const analyteCatalog = buildAnalyteCatalog(aliasBundle, normalizedRtLibrary);
    const methods = buildMethods(machines, columns, tempPrograms, normalizedRtLibrary);

    return {
      machines,
      columns,
      tempPrograms,
      rtLibrary: normalizedRtLibrary,
      rules,
      aliasBundle,
      analyteCatalog,
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
      .filter((item, idx, list) => list.findIndex((x) => normalizeName(x.id) === normalizeName(item.id)) === idx)
      .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
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
        if (state.ranked.length) {
          state.ranked = rankMethods(Array.from(state.selectedAnalytes.values()));
          renderRecommendations();
          if (state.ranked[0]) showMethodDetails(state.ranked[0]);
        }
      });
    });
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
    fillSelect(el.machineFilter, state.data.machines, 'name');
    fillSelect(el.columnFilter, state.data.columns, 'name');
    fillSelect(el.tempFilter, state.data.tempPrograms, 'display_name');
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
          state.selectedAnalytes.set(item.id, { id: item.id, label: item.label, known: true });
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
    state.selectedAnalytes.set(resolved.id, resolved);

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
    Array.from(el.quickAnalytes.children).forEach((chip) => {
      chip.classList.toggle('active', state.selectedAnalytes.has(chip.dataset.analyteId));
    });
  }

  function rankMethods(selectedEntries) {
    const selectedKnownIds = selectedEntries
      .filter((item) => item.known && !isUndeterminedId(item.id))
      .map((item) => item.id);
    const selectedUndetermined = selectedEntries.filter((item) => item.known && isUndeterminedId(item.id));
    const unknownItems = selectedEntries.filter((item) => !item.known);
    const candidateMethods = state.data.methods.filter(matchFilters);
    const weights = state.data.rules.weights || {};
    const thresholds = state.data.rules.thresholds || {};
    const certaintyScore = state.data.rules.certainty_score || { high: 1, medium: 0.6, low: 0.3 };

    return candidateMethods
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
        const rtGapPenalty = minGap < (thresholds.warn_rt_gap_min || 0.15) ? 8 : 0;
        const undeterminedPenalty = hasUndeterminedInMethod ? 4 : 0;
        const lowCertaintyPenalty = lowCertaintyMatchCount * 2;
        const selectedUndeterminedPenalty = selectedUndetermined.length * 4;

        const score =
          coverageRate * (weights.coverage || 0) +
          separationScore * (weights.separation || 0) +
          runtimeScore * (weights.runtime || 0) +
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
      if (!reasonSet.length) reasonSet.push('入力溶剤が未登録');
      const emptyReason = '候補が0件です。理由: ' + reasonSet.join(' / ') + '。';
      el.recommendations.innerHTML = '<p class="empty-text">' + escapeHtml(emptyReason) + '</p>';
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
    if (hasLowCertainty) warnings.push('certainty=low を含む候補は注意表示しています。');
    if (state.data.dataDensityLow || hasProvisional) warnings.push('候補精度は暫定です。');
    if (state.data.validationReport.errors.length) warnings.push('RTデータ検証エラーあり。');
    showWarning(warnings.join(' '));

    state.ranked.forEach((item, idx) => {
      const card = document.createElement('article');
      card.className = 'rec-card' + (idx === 0 ? ' top' : '');

      const reason = buildReasonText(item);

      card.innerHTML = [
        '<div class="rank-row">',
        '<p><strong>', (idx + 1), '位 候補提案</strong> ', escapeHtml(item.method.machine?.name || item.method.machine?.id || '-'), '</p>',
        '<p>スコア ', item.score.toFixed(1), '</p>',
        '</div>',
        '<p class="reason">',
        'カラム: ', escapeHtml(item.method.column?.name || '-'), '<br>',
        '温度条件: ', escapeHtml(item.method.tempProgram?.display_name || item.method.tempProgram?.label || '-'), '（', escapeHtml(item.method.tempProgram?.code || item.method.tempProgram?.id || '-'), '）<br>',
        '一致件数: ', item.matchCount, ' / ', item.selectedCount, '<br>',
        '想定RT範囲: ', item.rtRange || '-', '<br>',
        '最小RT差: ', item.minGap.toFixed(2), ' min<br>',
        'データ信頼度の目安: ', escapeHtml(item.confidenceLabel), '<br>',
        '理由: ', escapeHtml(reason),
        item.lowCertaintyMatchCount > 0 ? '<br><span class="provisional-badge">注意: certainty=low のデータを含む</span>' : '',
        item.hasUndeterminedInMethod ? '<br><span class="provisional-badge">名称未確定データ含む</span>' : '',
        item.dataShortage ? '<br><span class="provisional-badge">データ不足</span>' : '',
        item.provisional ? '<br><span class="provisional-badge">暫定候補</span>' : '',
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
      '<strong>', escapeHtml(item.method.tempProgram?.display_name || '-'), '</strong>',
      '<br>対象溶剤カバー: ', (item.coverageRate * 100).toFixed(0), '% / 一致件数: ', item.matchCount, ' / ', item.selectedCount,
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
      el.graphLegend.innerHTML = '';
      return;
    }

    const maxRt = Math.max(runtime || 0, ...rows.map((r) => Number(r.rt_min) || 0), 1);
    const track = document.createElement('div');
    track.className = 'graph-track';

    const sortedRows = rows.slice().sort((a, b) => a.rt_min - b.rt_min);
    sortedRows.forEach((row, idx) => {
      const left = ((Number(row.rt_min) || 0) / maxRt) * 100;
      const isSelected = selectedIds.includes(row.analyte_normalized);

      const marker = document.createElement('span');
      marker.className = isSelected ? 'graph-marker highlighted' : 'graph-marker';
      marker.style.left = Math.min(left, 100) + '%';
      track.appendChild(marker);

      const label = document.createElement('span');
      label.className = 'graph-label';
      label.style.left = Math.min(left, 100) + '%';
      label.textContent = (idx + 1) + '. ' + toAnalyteLabel(row.analyte_normalized, row.analyte_original) + ' (' + Number(row.rt_min).toFixed(2) + ')';
      track.appendChild(label);
    });

    el.rtGraph.innerHTML = '';
    el.rtGraph.appendChild(track);

    const axis = document.createElement('p');
    axis.className = 'axis-label';
    axis.textContent = 'RT(min): 0 〜 ' + maxRt.toFixed(1);
    el.rtGraph.appendChild(axis);

    el.graphLegend.innerHTML = sortedRows.map((row, idx) => {
      const certainty = String(row.certainty || '-').toLowerCase();
      const lowClass = certainty === 'low' ? ' low' : '';
      return '<span class="legend-item">[' + (idx + 1) + '] ' +
        escapeHtml(toAnalyteLabel(row.analyte_normalized, row.analyte_original)) +
        ' <span class="legend-certainty' + lowClass + '">' + escapeHtml(certainty) + '</span></span>';
    }).join('');
  }

  function renderTable(rows, selectedIds) {
    if (!rows.length) {
      el.rtTableBody.innerHTML = '<tr><td colspan="4" class="empty-cell">表示するデータがありません。</td></tr>';
      return;
    }

    el.rtTableBody.innerHTML = rows.slice().sort((a, b) => a.rt_min - b.rt_min).map((row, idx) => {
      const certainty = String(row.certainty || '-').toLowerCase();
      const certaintyLabel = '<span class="certainty-badge ' + (certainty === 'low' ? 'low' : '') + '">' + escapeHtml(certainty) + '</span>';
      const rowClass = selectedIds.includes(row.analyte_normalized) ? ' class="highlighted-row"' : '';
      return [
        '<tr' + rowClass + '>',
        '<td><span class="rt-index">', (idx + 1), '</span> ', escapeHtml(toAnalyteLabel(row.analyte_normalized, row.analyte_original)), '</td>',
        '<td>', Number(row.rt_min).toFixed(3), '</td>',
        '<td>', certaintyLabel, '</td>',
        '<td>', escapeHtml(row.note || '-'), '</td>',
        '</tr>'
      ].join('');
    }).join('');
  }

  function clearOutputs() {
    el.recommendations.innerHTML = '<p class="empty-text">溶剤を追加して「候補を提案する」を押してください。</p>';
    clearDetails();
    showInitialWarnings();
    state.ranked = [];
  }

  function clearDetails() {
    el.rtSummary.textContent = '候補が選択されていません。';
    el.rtGraph.innerHTML = '';
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

  function buildReasonText(item) {
    const parts = [];
    parts.push('入力溶剤カバー率 ' + (item.coverageRate * 100).toFixed(0) + '%');
    parts.push('最小RT差 ' + item.minGap.toFixed(2) + ' min');
    parts.push('certainty平均 ' + Math.round(item.certaintyAvg * 100) + '%');
    if (item.runtime) parts.push('推定分析時間 ' + item.runtime.toFixed(1) + ' min');
    if (item.missing.length) parts.push('未登録/不足あり');
    return parts.join(' / ');
  }

  function toConfidenceLabel(certaintyAvg) {
    if (certaintyAvg >= 0.8) return '高め';
    if (certaintyAvg >= 0.6) return '中程度';
    return '低め';
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

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
