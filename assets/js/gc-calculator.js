(() => {
  const DATA_PATH = 'data/gc-std-master.json';
  const ANALYTE_ALIASES_PATH = 'data/gc-analyte-aliases.json';
  const ANALYTE_DISPLAY_PATH = 'data/gc-analyte-display.json';
  const STORAGE_KEY = 'gc-calculator-state-v3';
  const LEGACY_STORAGE_KEYS = ['gc-calculator-state-v2'];
  const DEFAULT_ROWS = 1;
  const MAIN_CHIP_NAMES = ['メタノール', 'アセトン', 'IPA', 'n-ヘキサン', 'MEK', '酢酸エチル', 'イソブタノール', '1-ブタノール', 'MIBK', 'トルエン', '酢酸イソブチル', '酢酸ブチル', 'エチルベンゼン', 'p-キシレン', 'o-キシレン'];

  const STATUS_LABEL = { confirmed: '確定', provisional: '仮登録', needs_review: 'STD要確認' };

  const els = {
    rowsContainer: document.getElementById('rowsContainer'),
    addRowBtn: document.getElementById('addRowBtn'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    buildCopyTextBtn: document.getElementById('buildCopyTextBtn'),
    copyResultBtn: document.getElementById('copyResultBtn'),
    downloadCsvBtn: document.getElementById('downloadCsvBtn'),
    copyTextOutput: document.getElementById('copyTextOutput'),
    statusMessage: document.getElementById('statusMessage'),
    favoriteCommonChips: document.getElementById('favoriteCommonChips'),
    favoriteLiquidChips: document.getElementById('favoriteLiquidChips')
  };

  const state = {
    materials: [],
    optionLookup: new Map(),
    searchLookup: new Map(),
    rows: [],
    activeRowId: null,
    favorites: { common: [], liquid_standard: [] },
    analyteAliases: {},
    analyteDisplay: {}
  };

  init();

  async function init() {
    bindGlobalEvents();
    await loadMaster();
    await loadFavoriteData();
    restoreState();
    if (!state.rows.length) state.rows.push(createEmptyRow());
    renderRows();
    renderFavoriteChips();
    showStatus('入力内容はこの端末に自動保存されます。');
  }

  function bindGlobalEvents() {
    els.addRowBtn.addEventListener('click', () => {
      state.rows.push(createEmptyRow());
      normalizeCardsState();
      renderRows();
      renderFavoriteChips();
      persist();
    });

    els.clearAllBtn.addEventListener('click', () => {
      if (!window.confirm('入力内容をすべて消します。よろしいですか？')) return;
      state.rows = [createEmptyRow()];
      normalizeCardsState();
      localStorage.removeItem(STORAGE_KEY);
      els.copyTextOutput.value = '';
      renderRows();
      renderFavoriteChips();
      showStatus('入力内容をクリアしました。');
    });

    els.buildCopyTextBtn.addEventListener('click', () => {
      els.copyTextOutput.value = buildCopyText();
      persist();
      showStatus('コピー用テキストを作成しました。');
    });

    els.copyResultBtn.addEventListener('click', async () => {
      if (!els.copyTextOutput.value.trim()) els.copyTextOutput.value = buildCopyText();
      try {
        await navigator.clipboard.writeText(els.copyTextOutput.value);
        showStatus('計算結果をコピーしました。');
      } catch (_error) {
        showStatus('コピーに失敗しました。テキストを手動でコピーしてください。');
      }
    });

    els.downloadCsvBtn.addEventListener('click', () => {
      const csv = buildCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gc-calculation-${todayIso()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showStatus('CSVを保存しました。');
    });

    els.copyTextOutput.addEventListener('input', persist);
  }

  async function loadMaster() {
    const res = await fetch(DATA_PATH, { cache: 'no-cache' });
    const rows = await res.json();
    state.materials = (Array.isArray(rows) ? rows : []).map((item, index) => {
      const displayName = item.display_name || item.normalized_name || item.raw_label || `物質${index + 1}`;
      const rawLabel = item.raw_label || '';
      const stdValue = Number(item.std_value);
      return {
        key: `m_${index}`,
        optionLabel: displayName,
        displayName,
        rawLabel,
        normalizedName: String(item.normalized_name || ''),
        aliases: Array.isArray(item.aliases) ? item.aliases.map((a) => String(a || '')).filter(Boolean) : [],
        stdValue: Number.isFinite(stdValue) ? stdValue : null,
        confidence: String(item.confidence || ''),
        status: String(item.status || ''),
        note: String(item.note || '')
      };
    });

    state.materials.forEach((m) => {
      state.optionLookup.set(m.optionLabel, m);
      [m.optionLabel, m.displayName, m.rawLabel, m.normalizedName, ...m.aliases].forEach((k) => {
        const key = normalize(k);
        if (key) state.searchLookup.set(key, m);
      });
    });
  }

  async function loadFavoriteData() {
    if (!window.GcFavorites?.load) return;
    const [favorites, analyteAliases, analyteDisplay] = await Promise.all([
      window.GcFavorites.load(),
      fetchJsonSafe(ANALYTE_ALIASES_PATH, {}),
      fetchJsonSafe(ANALYTE_DISPLAY_PATH, {})
    ]);
    state.favorites = favorites;
    state.analyteAliases = analyteAliases || {};
    state.analyteDisplay = analyteDisplay || {};
  }

  function createEmptyRow() {
    return { id: `r_${Math.random().toString(36).slice(2)}`, materialInput: '', stdInput: '', stdAreaInput: '', sampleAreaInput: '', memo: '', stdManual: false, materialKey: '', rawLabel: '', displayName: '', normalizedName: '', status: '', confidence: '', note: '' };
  }


  function normalizeCardsState() {
    if (!Array.isArray(state.rows)) state.rows = [];
    state.rows = state.rows.map((row) => ({ ...createEmptyRow(), ...row }));
    if (!state.rows.length) state.rows.push(createEmptyRow());
    if (!state.rows.some((r) => r.id === state.activeRowId)) state.activeRowId = state.rows[0].id;
  }

  function renderRows() {
    els.rowsContainer.innerHTML = `${buildDatalistHtml()}${state.rows.map((r) => renderRow(r)).join('')}`;
    state.rows.forEach((row) => {
      const root = els.rowsContainer.querySelector(`[data-row-id="${row.id}"]`);
      if (root) bindRowEvents(root, row.id);
    });
    syncFavoriteChipState();
  }

  function buildDatalistHtml() {
    return `<datalist id="materialOptions">${state.materials.map((m) => `<option value="${escapeHtml(m.displayName)}"></option>`).join('')}</datalist>`;
  }

  function renderRow(row) {
    const material = resolveMaterial(row.materialInput, row.materialKey);
    const calc = calculate(row, material);
    const title = material?.displayName || '物質を選択してください';
    const raw = material?.rawLabel ? `raw: ${material.rawLabel}` : 'raw: -';
    const statusBadge = material?.status && material.status !== 'confirmed' ? `<span class="badge badge-review">${STATUS_LABEL[material.status] || '要確認'}</span>` : '';
    const manualBadge = row.stdManual ? '<span class="badge badge-manual">手入力</span>' : '';
    return `<article class="calc-row" data-row-id="${escapeHtml(row.id)}">
      <div class="row-head"><h3 class="row-title">${escapeHtml(title)}</h3><button type="button" class="danger remove-row-btn">削除</button></div>
      <div class="card-caption">${escapeHtml(material ? `計算カード：${material.displayName}` : '空の計算カード')}</div>
      <div class="meta-note">${escapeHtml(raw)}</div><div class="badges">${statusBadge}${manualBadge}</div>
      <div class="row-grid">
      <div class="field wide"><label>物質を選択<input type="search" class="material-input" list="materialOptions" value="${escapeHtml(row.materialInput)}" placeholder="物質名 / raw表記で検索"></label></div>
      <div class="field"><label>STD<input type="text" class="std-input ${row.stdManual ? '' : 'std-auto'}" inputmode="decimal" value="${escapeHtml(row.stdInput)}" readonly></label></div>
      <div class="field"><label>当日STDエリア<input type="text" class="std-area-input" inputmode="decimal" value="${escapeHtml(row.stdAreaInput)}"></label></div>
      <div class="field"><label>係数<div class="result-box coefficient-output">${escapeHtml(calc.coefficientText)}</div></label></div>
      <div class="field"><label>検体エリア<input type="text" class="sample-area-input" inputmode="decimal" value="${escapeHtml(row.sampleAreaInput)}"></label></div>
      <div class="field"><label>ppm<div class="result-box ppm-output">${escapeHtml(calc.ppmText || '—')}</div></label></div>
      <div class="field wide"><label>メモ欄<input type="text" class="memo-input" value="${escapeHtml(row.memo)}"></label></div>
      </div><div class="error-text">${escapeHtml(calc.errorText)}</div>
    </article>`;
  }

  function bindRowEvents(root, rowId) {
    const row = state.rows.find((r) => r.id === rowId);
    const materialInput = root.querySelector('.material-input');
    const stdInput = root.querySelector('.std-input');
    const stdAreaInput = root.querySelector('.std-area-input');
    const sampleAreaInput = root.querySelector('.sample-area-input');
    const memoInput = root.querySelector('.memo-input');

    const updateOnly = () => { updateRowComputedView(root, row); persist(); };

    materialInput.addEventListener('focus', () => { state.activeRowId = rowId; });
    materialInput.addEventListener('change', () => applyMaterialSelection(row, materialInput.value, root));
    materialInput.addEventListener('blur', () => applyMaterialSelection(row, materialInput.value, root));

    stdInput.addEventListener('input', () => { state.activeRowId = rowId; row.stdInput = stdInput.value; row.stdManual = true; updateOnly(); });
    stdInput.addEventListener('focus', () => { if (stdInput.readOnly) showStatus('STDは自動反映です。手入力したい場合は「手入力に切替」を押してください。'); });
    stdAreaInput.addEventListener('input', () => { state.activeRowId = rowId; row.stdAreaInput = stdAreaInput.value; updateOnly(); });
    sampleAreaInput.addEventListener('input', () => { state.activeRowId = rowId; row.sampleAreaInput = sampleAreaInput.value; updateOnly(); });
    memoInput.addEventListener('input', () => { row.memo = memoInput.value; persist(); });

    root.querySelector('.remove-row-btn').addEventListener('click', () => {
      state.rows = state.rows.filter((r) => r.id !== rowId);
      normalizeCardsState();
      renderRows();
      renderFavoriteChips();
      persist();
    });

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn-ghost std-toggle-btn';
    toggleBtn.textContent = row.stdManual ? '自動値に戻す' : '手入力に切替';
    toggleBtn.addEventListener('click', () => {
      row.stdManual = !row.stdManual;
      if (!row.stdManual) {
        const material = resolveMaterial(row.materialInput, row.materialKey);
        row.stdInput = material?.stdValue == null ? '' : String(material.stdValue);
      }
      stdInput.readOnly = !row.stdManual;
      stdInput.classList.toggle('std-auto', !row.stdManual);
      toggleBtn.textContent = row.stdManual ? '自動値に戻す' : '手入力に切替';
      updateOnly();
    });
    const stdField = root.querySelector('.std-input')?.closest('.field');
    if (stdField) stdField.appendChild(toggleBtn);
    stdInput.readOnly = !row.stdManual;
  }

  function applyMaterialSelection(row, text, root) {
    state.activeRowId = row.id;
    const selected = findStdEntry(text, row);
    if (!selected) {
      row.materialInput = text;
      row.materialKey = '';
      row.rawLabel = '';
      row.displayName = text || '';
      row.normalizedName = '';
      row.status = '';
      row.confidence = '';
      row.note = '';
      if (!row.stdManual) row.stdInput = '';
      updateRowComputedView(root, row);
      persist();
      return;
    }
    const duplicate = state.rows.some((r) => r.id !== row.id && resolveMaterial(r.materialInput)?.displayName === selected.displayName);
    if (duplicate) showStatus(`同じ物質「${selected.displayName}」が別カードにあります。`, true);
    row.materialInput = selected.displayName;
    row.materialKey = selected.key;
    row.rawLabel = selected.rawLabel || '';
    row.displayName = selected.displayName || '';
    row.normalizedName = selected.normalizedName || '';
    row.stdInput = selected.stdValue == null ? '' : String(selected.stdValue);
    row.status = selected.status || '';
    row.confidence = selected.confidence || '';
    row.note = selected.note || '';
    row.stdManual = false;
    updateRowComputedView(root, row, true);
    persist();
  }

  function updateRowComputedView(root, row, rerenderHead = false) {
    const material = resolveMaterial(row.materialInput, row.materialKey);
    const calc = calculate(row, material);
    root.querySelector('.coefficient-output').textContent = calc.coefficientText;
    root.querySelector('.ppm-output').textContent = calc.ppmText || '—';
    root.querySelector('.error-text').textContent = calc.errorText;
    if (rerenderHead) {
      root.querySelector('.row-title').textContent = material?.displayName || '物質を選択';
      root.querySelector('.card-caption').textContent = material ? `計算カード：${material.displayName}` : '計算カード（未選択）';
      root.querySelector('.meta-note').textContent = material?.rawLabel ? `raw: ${material.rawLabel}` : 'raw: -';
    }
    const stdInput = root.querySelector('.std-input');
    if (stdInput) {
      stdInput.value = row.stdInput || '';
      stdInput.readOnly = !row.stdManual;
      stdInput.classList.toggle('std-auto', !row.stdManual);
    }
    const toggleBtn = root.querySelector('.std-toggle-btn');
    if (toggleBtn) toggleBtn.textContent = row.stdManual ? '自動値に戻す' : '手入力に切替';
    const badges = [];
    if (material?.status && material.status !== 'confirmed') badges.push(`<span class="badge badge-review">${STATUS_LABEL[material.status] || '要確認'}</span>`);
    if (row.stdManual) badges.push('<span class="badge badge-manual">手入力</span>');
    root.querySelector('.badges').innerHTML = badges.join('');
    syncFavoriteChipState();
  }

  function resolveMaterial(input, materialKey = '') {
    if (materialKey) {
      const byKey = state.materials.find((m) => m.key === materialKey);
      if (byKey) return byKey;
    }
    const normalizedInput = normalize(input);
    if (!normalizedInput) return null;
    return state.searchLookup.get(normalizedInput) || null;
  }

  function findStdEntry(input, row = null) {
    const keyCandidates = [row?.rawLabel, row?.normalizedName, row?.displayName, input];
    for (const key of keyCandidates) {
      const matched = resolveMaterial(key, row?.materialKey || '');
      if (matched) return matched;
    }
    if (row?.materialKey) return resolveMaterial('', row.materialKey);
    return null;
  }

  const normalize = (v) => String(v || '').trim().toLowerCase();
  const parseNumber = (raw) => {
    const s = String(raw || '').trim(); if (!s) return { empty: true, valid: true, value: null };
    const n = Number(s.replace(/,/g, '')); return { empty: false, valid: Number.isFinite(n), value: n };
  };

  function calculate(row, material) {
    const std = parseNumber(row.stdInput); const stdArea = parseNumber(row.stdAreaInput); const sample = parseNumber(row.sampleAreaInput);
    if (!std.valid || !stdArea.valid || !sample.valid) return { coefficientText: '', ppmText: '', errorText: '数値を入力してください。' };
    if (std.empty) return { coefficientText: '', ppmText: '', errorText: 'STD値を取得できませんでした。物質マスタとの紐づけを確認してください。' };
    if (stdArea.empty || stdArea.value === 0) return { coefficientText: '', ppmText: '', errorText: 'STDエリアを入力してください。' };
    const c = std.value / stdArea.value; const ppm = sample.empty ? null : sample.value * c;
    return { coefficientText: Number(c.toPrecision(10)).toString(), ppmText: ppm == null ? '' : Number(ppm.toFixed(2)).toString(), errorText: '' };
  }

  function buildCopyText() {
    const parts = ['GC濃度計算', `日付: ${todayIso()}`, ''];
    state.rows.forEach((row) => {
      const material = resolveMaterial(row.materialInput, row.materialKey);
      const has = [row.materialInput, row.stdInput, row.stdAreaInput, row.sampleAreaInput, row.memo].some((x) => String(x || '').trim());
      if (!has) return;
      const calc = calculate(row, material);
      parts.push(material?.displayName || row.materialInput || '(未選択)', `STD: ${row.stdInput || '-'}`, `STDエリア: ${row.stdAreaInput || '-'}`, `係数: ${calc.coefficientText || '-'}`, `検体エリア: ${row.sampleAreaInput || '-'}`, `ppm: ${calc.ppmText || '-'}`, '');
    });
    return parts.join('\n').trim();
  }

  function buildCsv() {
    const lines = [['日付', '物質', 'STD', 'STDエリア', '係数', '検体エリア', 'ppm', '状態', 'メモ'].join(',')];
    state.rows.forEach((row) => {
      const has = [row.materialInput, row.stdInput, row.stdAreaInput, row.sampleAreaInput, row.memo].some((x) => String(x || '').trim());
      if (!has) return;
      const material = resolveMaterial(row.materialInput, row.materialKey); const calc = calculate(row, material);
      lines.push([todayIso(), material?.displayName || row.materialInput || '', row.stdInput || '', row.stdAreaInput || '', calc.coefficientText || '', row.sampleAreaInput || '', calc.ppmText || '', STATUS_LABEL[material?.status] || '', row.memo || ''].map(csvEscape).join(','));
    });
    return lines.join('\n');
  }

  function renderFavoriteChips() {
    const merged = [...(state.favorites.common || []), ...(state.favorites.liquid_standard || [])];
    const map = new Map();
    merged.forEach((entry) => {
      const matched = findMaterialByFavorite(entry);
      if (!matched) return;
      const label = matched.displayName;
      if (!MAIN_CHIP_NAMES.includes(label) && !(label === 'n-ブタノール')) return;
      if (!map.has(label)) map.set(label, { display_name: label, normalized_name: matched.normalizedName });
    });
    renderFavoriteGroup(els.favoriteCommonChips, Array.from(map.values()), false);
  }
  function renderFavoriteGroup(container, list, secondary) {
    if (!container) return; container.innerHTML = '';
    list.forEach((entry) => {
      const matched = findMaterialByFavorite(entry);
      const chip = document.createElement('button'); chip.type = 'button'; chip.className = `quick-chip${secondary ? ' secondary' : ''}`;
      chip.textContent = entry.display_name || entry.normalized_name || '-'; chip.dataset.materialOption = matched?.displayName || '';
      chip.disabled = !matched; chip.addEventListener('click', () => applyFavoriteToActiveRow(chip.dataset.materialOption)); container.appendChild(chip);
    });
    syncFavoriteChipState();
  }
  function applyFavoriteToActiveRow(displayName) {
    if (!displayName) return;
    normalizeCardsState();
    const row = state.rows.find((r) => r.id === state.activeRowId) || state.rows[0];
    const root = els.rowsContainer.querySelector(`[data-row-id="${row.id}"]`);
    if (root) {
      root.querySelector('.material-input').value = displayName;
      applyMaterialSelection(row, displayName, root);
      showStatus('よく使う物質を反映しました。');
    }
  }
  function syncFavoriteChipState() {
    const selected = new Set(state.rows.map((r) => resolveMaterial(r.materialInput, r.materialKey)?.displayName).filter(Boolean));
    [els.favoriteCommonChips].forEach((c) => c && c.querySelectorAll('.quick-chip').forEach((chip) => chip.classList.toggle('active', selected.has(chip.dataset.materialOption))));
  }
  function findMaterialByFavorite(entry) {
    const keys = [entry?.normalized_name, entry?.display_name, ...(state.analyteAliases?.[entry?.normalized_name] || []), state.analyteDisplay?.[entry?.normalized_name]].map(normalize);
    return state.materials.find((m) => keys.some((k) => k && [m.displayName, m.rawLabel, m.normalizedName].map(normalize).includes(k))) || null;
  }

  function restoreState() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      const legacy = LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
      const parsed = JSON.parse(current || legacy || '{}');
      if (Array.isArray(parsed.rows)) {
        state.rows = parsed.rows.map((r) => {
          const row = { ...createEmptyRow(), ...r };
          const material = findStdEntry(row.materialInput, row);
          if (material && !row.materialKey) row.materialKey = material.key;
          if (material) {
            row.rawLabel = material.rawLabel || '';
            row.displayName = material.displayName || '';
            row.normalizedName = material.normalizedName || '';
            row.status = material.status || '';
            row.confidence = material.confidence || '';
            row.note = material.note || '';
          }
          if (material && !row.stdManual && !String(row.stdInput || '').trim()) row.stdInput = material.stdValue == null ? '' : String(material.stdValue);
          return row;
        });
      }
      state.activeRowId = parsed.activeRowId || null;
      normalizeCardsState();
      if (typeof parsed.copyTextOutput === 'string') els.copyTextOutput.value = parsed.copyTextOutput;
      LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch (_e) { state.rows = []; normalizeCardsState(); }
  }
  function persist() { normalizeCardsState(); localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: state.rows, activeRowId: state.activeRowId, copyTextOutput: els.copyTextOutput.value })); }
  async function fetchJsonSafe(path, fallback) { try { const r = await fetch(path); return r.ok ? await r.json() : fallback; } catch { return fallback; } }
  function csvEscape(v) { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t; }
  function todayIso() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }
  function showStatus(message, isError = false) { els.statusMessage.textContent = message; els.statusMessage.style.color = isError ? '#9b3f3f' : '#36507d'; }
  function escapeHtml(v) { return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
})();
