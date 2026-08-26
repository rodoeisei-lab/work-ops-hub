(() => {
  const CACHE_VERSION = '20260826-std-sync-1';
  const DATA_PATH = `data/gc-std-master.json?v=${CACHE_VERSION}`;
  const ANALYTE_ALIASES_PATH = 'data/gc-analyte-aliases.json';
  const ANALYTE_DISPLAY_PATH = 'data/gc-analyte-display.json';
  const STORAGE_KEY = 'gc-calculator-state-v4';
  const CUSTOM_MATERIALS_STORAGE_KEY = 'gc-calculator-custom-materials-v1';
  const LEGACY_STORAGE_KEYS = ['gc-calculator-state-v3', 'gc-calculator-state-v2'];
  const MAIN_CHIP_NAMES = ['メタノール', 'アセトン', 'IPA', 'n-ヘキサン', 'MEK', '酢酸エチル', 'イソブタノール', '1-ブタノール', 'MIBK', 'トルエン', '酢酸イソブチル', '酢酸ブチル', 'エチルベンゼン', 'p-キシレン', 'o-キシレン'];
  const LIQUID_STD_NAMES = ['ブチルセロソルブ', 'スチレン', 'シクロヘキサン', 'シクロヘキサノン'];
  const OTHER_CHIP_NAMES = ['ジクロロメタン', '2-ブタノール', 'エチルセロソルブ', 'メチルセロソルブ', 'セロソルブアセテート', '酢酸イソペンチル', 'トリクレン', 'THF', 'クレゾール'];

  const STATUS_LABEL = { confirmed: '確定', provisional: '仮登録', needs_review: 'STD要確認', custom: 'この端末の登録' };

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
    favoriteLiquidChips: document.getElementById('favoriteLiquidChips'),
    favoriteOtherChips: document.getElementById('favoriteOtherChips'),
    customMaterialName: document.getElementById('customMaterialName'),
    customStdValue: document.getElementById('customStdValue'),
    addCustomMaterialBtn: document.getElementById('addCustomMaterialBtn'),
    customMaterialList: document.getElementById('customMaterialList')
  };

  const state = {
    materials: [],
    optionLookup: new Map(),
    searchLookup: new Map(),
    rows: [],
    activeRowId: null,
    favorites: { common: [], liquid_standard: [] },
    analyteAliases: {},
    analyteDisplay: {},
    customMaterials: []
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
    renderCustomMaterialList();
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

    els.addCustomMaterialBtn.addEventListener('click', addCustomMaterial);
    [els.customMaterialName, els.customStdValue].forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        addCustomMaterial();
      });
    });
  }

  async function loadMaster() {
    const res = await fetch(DATA_PATH, { cache: 'no-cache' });
    const masterRows = await res.json();
    state.customMaterials = loadCustomMaterials();
    state.optionLookup = new Map();
    state.searchLookup = new Map();
    const sourceRows = [
      ...state.customMaterials.map((item, sourceIndex) => ({ item, isCustom: true, sourceIndex })),
      ...(Array.isArray(masterRows) ? masterRows : []).map((item, sourceIndex) => ({ item, isCustom: false, sourceIndex }))
    ];
    const usedNames = new Set();
    state.materials = sourceRows.map(({ item, isCustom, sourceIndex }) => {
      const displayName = item.display_name || item.normalized_name || item.raw_label || `物質${sourceIndex + 1}`;
      const rawLabel = item.raw_label || '';
      const rawStdValue = item.std_value;
      const stdValue = rawStdValue === null || rawStdValue === undefined || String(rawStdValue).trim() === ''
        ? null
        : Number(rawStdValue);
      return {
        key: isCustom ? `c_${item.id}` : `m_${sourceIndex}`,
        optionLabel: displayName,
        displayName,
        rawLabel,
        normalizedName: String(item.normalized_name || ''),
        aliases: Array.isArray(item.aliases) ? item.aliases.map((a) => String(a || '')).filter(Boolean) : [],
        stdValue: Number.isFinite(stdValue) ? stdValue : null,
        confidence: String(item.confidence || ''),
        status: String(item.status || ''),
        note: String(item.note || ''),
        isCustom
      };
    }).filter((material) => {
      const key = normalize(material.displayName);
      if (!key || usedNames.has(key)) return false;
      usedNames.add(key);
      return true;
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
    syncAutomaticStd(row, material);
    const calc = calculate(row, material);
    const isUnregistered = Boolean(String(row.materialInput || '').trim()) && !material;
    const title = material?.displayName || (isUnregistered ? `${row.materialInput}（未登録）` : '物質を選択してください');
    const raw = material?.rawLabel ? `raw: ${material.rawLabel}` : 'raw: -';
    const statusBadge = material?.status && !['confirmed', 'custom'].includes(material.status) ? `<span class="badge badge-review">${STATUS_LABEL[material.status] || '要確認'}</span>` : '';
    const customBadge = material?.isCustom ? '<span class="badge badge-custom">この端末の登録</span>' : '';
    const stdNeedsCheck = (!row.stdManual && material && material.stdValue == null) ? '<span class="badge badge-review">STD値を確認してください</span>' : '';
    const manualBadge = row.stdManual ? '<span class="badge badge-manual">手入力</span>' : '';
    const unregisteredNote = `<div class="unregistered-note" ${isUnregistered ? '' : 'hidden'}><strong>この物質はマスタ未登録です。</strong><span>「STDを手入力する」で計算できます。繰り返し使う場合は、下の「一覧にない物質」へ保存できます。</span></div>`;
    return `<article class="calc-row${isUnregistered ? ' is-unregistered' : ''}" data-row-id="${escapeHtml(row.id)}">
      <div class="row-head"><h3 class="row-title">${escapeHtml(title)}</h3><button type="button" class="danger remove-row-btn">削除</button></div>
      <div class="card-caption">${escapeHtml(material ? `計算カード：${material.displayName}` : (isUnregistered ? '未登録物質の計算カード' : '空の計算カード'))}</div>
      <div class="meta-note">${escapeHtml(raw)}</div><div class="badges">${statusBadge}${customBadge}${stdNeedsCheck}${manualBadge}</div>
      <div class="row-grid">
      <div class="field wide"><label>物質を検索・入力<input type="search" class="material-input" list="materialOptions" value="${escapeHtml(row.materialInput)}" placeholder="物質名 / raw_label / 別名で検索" autocomplete="off" enterkeyhint="next"></label></div>
      <div class="field"><label>STD<input type="text" class="std-input ${row.stdManual ? '' : 'std-auto'}" inputmode="decimal" value="${escapeHtml(row.stdInput)}" readonly></label></div>
      <div class="field"><label>当日STDエリア<input type="text" class="std-area-input" inputmode="decimal" value="${escapeHtml(row.stdAreaInput)}"></label></div>
      <div class="field"><label>係数<div class="result-box coefficient-output">${escapeHtml(calc.coefficientText)}</div></label></div>
      <div class="field"><label>検体エリア<input type="text" class="sample-area-input" inputmode="decimal" value="${escapeHtml(row.sampleAreaInput)}"></label></div>
      <div class="field"><label>ppm<div class="result-box ppm-output">${escapeHtml(calc.ppmText || '—')}</div></label></div>
      <div class="field wide"><label>メモ欄<input type="text" class="memo-input" value="${escapeHtml(row.memo)}"></label></div>
      </div>${unregisteredNote}<div class="error-text">${escapeHtml(calc.errorText)}</div>
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
    materialInput.addEventListener('input', () => applyMaterialSelection(row, materialInput.value, root));
    materialInput.addEventListener('change', () => applyMaterialSelection(row, materialInput.value, root));
    materialInput.addEventListener('blur', () => applyMaterialSelection(row, materialInput.value, root));

    stdInput.addEventListener('input', () => { state.activeRowId = rowId; row.stdInput = stdInput.value; row.stdManual = true; updateOnly(); });
    stdInput.addEventListener('focus', () => { if (stdInput.readOnly) showStatus('STDは自動反映です。手入力する場合は「STDを手入力する」を押してください。'); });
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
    toggleBtn.textContent = row.stdManual ? '自動値に戻す' : 'STDを手入力する';
    toggleBtn.addEventListener('click', () => {
      row.stdManual = !row.stdManual;
      if (!row.stdManual) {
        const material = resolveMaterial(row.materialInput, row.materialKey);
        syncAutomaticStd(row, material);
      }
      stdInput.readOnly = !row.stdManual;
      stdInput.classList.toggle('std-auto', !row.stdManual);
      toggleBtn.textContent = row.stdManual ? '自動値に戻す' : 'STDを手入力する';
      toggleBtn.classList.toggle('is-required', Boolean(String(row.materialInput || '').trim()) && !resolveMaterial(row.materialInput, row.materialKey));
      updateOnly();
    });
    const stdField = root.querySelector('.std-input')?.closest('.field');
    if (stdField) stdField.appendChild(toggleBtn);
    stdInput.readOnly = !row.stdManual;
    toggleBtn.classList.toggle('is-required', Boolean(String(row.materialInput || '').trim()) && !resolveMaterial(row.materialInput, row.materialKey));
  }

  function applyMaterialSelection(row, text, root) {
    state.activeRowId = row.id;
    const selected = findStdEntry(text);
    if (!selected) {
      clearRowMaterialSelection(row, text);
      updateRowComputedView(root, row, true);
      persist();
      return;
    }
    const isSameMaterial = row.materialKey === selected.key;
    const duplicate = state.rows.some((r) => r.id !== row.id && resolveMaterial(r.materialInput, r.materialKey)?.displayName === selected.displayName);
    if (!isSameMaterial && duplicate) showStatus(`同じ物質「${selected.displayName}」が別カードにあります。`, true);
    setRowMaterial(row, selected, { preserveManualStd: isSameMaterial && row.stdManual });
    const materialInput = root.querySelector('.material-input');
    if (materialInput) materialInput.value = row.materialInput;
    updateRowComputedView(root, row, true);
    persist();
  }

  function clearRowMaterialSelection(row, text) {
    const materialChanged = Boolean(row.materialKey) || normalize(row.materialInput) !== normalize(text);
    row.materialInput = text;
    row.materialKey = '';
    row.rawLabel = '';
    row.displayName = text || '';
    row.normalizedName = '';
    row.status = '';
    row.confidence = '';
    row.note = '';
    if (materialChanged) {
      row.stdInput = '';
      row.stdManual = false;
    }
  }

  function setRowMaterial(row, selected, { preserveManualStd = false } = {}) {
    row.materialInput = selected.displayName;
    row.materialKey = selected.key;
    row.rawLabel = selected.rawLabel || '';
    row.displayName = selected.displayName || '';
    row.normalizedName = selected.normalizedName || '';
    row.status = selected.status || '';
    row.confidence = selected.confidence || '';
    row.note = selected.note || '';
    if (!preserveManualStd) {
      row.stdManual = false;
      syncAutomaticStd(row, selected);
    }
  }

  function updateRowComputedView(root, row, rerenderHead = false) {
    const material = resolveMaterial(row.materialInput, row.materialKey);
    syncAutomaticStd(row, material);
    const calc = calculate(row, material);
    const isUnregistered = Boolean(String(row.materialInput || '').trim()) && !material;
    root.querySelector('.coefficient-output').textContent = calc.coefficientText;
    root.querySelector('.ppm-output').textContent = calc.ppmText || '—';
    root.querySelector('.error-text').textContent = calc.errorText;
    if (rerenderHead) {
      root.querySelector('.row-title').textContent = material?.displayName || (isUnregistered ? `${row.materialInput}（未登録）` : '物質を選択');
      root.querySelector('.card-caption').textContent = material ? `計算カード：${material.displayName}` : (isUnregistered ? '未登録物質の計算カード' : '計算カード（未選択）');
      root.querySelector('.meta-note').textContent = material?.rawLabel ? `raw: ${material.rawLabel}` : 'raw: -';
    }
    root.classList.toggle('is-unregistered', isUnregistered);
    const unregisteredNote = root.querySelector('.unregistered-note');
    if (unregisteredNote) unregisteredNote.hidden = !isUnregistered;
    const stdInput = root.querySelector('.std-input');
    if (stdInput) {
      stdInput.value = row.stdInput || '';
      stdInput.readOnly = !row.stdManual;
      stdInput.classList.toggle('std-auto', !row.stdManual);
    }
    const toggleBtn = root.querySelector('.std-toggle-btn');
    if (toggleBtn) {
      toggleBtn.textContent = row.stdManual ? '自動値に戻す' : 'STDを手入力する';
      toggleBtn.classList.toggle('is-required', isUnregistered);
    }
    const badges = [];
    if (material?.status && !['confirmed', 'custom'].includes(material.status)) badges.push(`<span class="badge badge-review">${STATUS_LABEL[material.status] || '要確認'}</span>`);
    if (material?.isCustom) badges.push('<span class="badge badge-custom">この端末の登録</span>');
    if (!row.stdManual && material && material.stdValue == null) badges.push('<span class="badge badge-review">STD値を確認してください</span>');
    if (row.stdManual) badges.push('<span class="badge badge-manual">手入力</span>');
    root.querySelector('.badges').innerHTML = badges.join('');
    syncFavoriteChipState();
  }

  function resolveMaterial(input, materialKey = '') {
    const normalizedInput = normalize(input);
    if (normalizedInput) return state.searchLookup.get(normalizedInput) || null;
    if (materialKey) return state.materials.find((m) => m.key === materialKey) || null;
    return null;
  }

  function findStdEntry(input) {
    return resolveMaterial(input);
  }

  const normalize = (v) => String(v || '').trim().toLowerCase();
  const parseNumber = (raw) => {
    const s = String(raw || '').trim(); if (!s) return { empty: true, valid: true, value: null };
    const n = Number(s.replace(/,/g, '')); return { empty: false, valid: Number.isFinite(n), value: n };
  };

  function automaticStdText(material) {
    return material?.stdValue == null ? '' : String(material.stdValue);
  }

  function syncAutomaticStd(row, material) {
    if (!row.stdManual) row.stdInput = automaticStdText(material);
  }

  function calculate(row, material) {
    const stdText = row.stdManual ? row.stdInput : automaticStdText(material);
    const std = parseNumber(stdText); const stdArea = parseNumber(row.stdAreaInput); const sample = parseNumber(row.sampleAreaInput);
    if (!std.valid || !stdArea.valid || !sample.valid) return { coefficientText: '', ppmText: '', errorText: '数値を入力してください。' };
    if (std.empty) {
      const isUnregistered = Boolean(String(row.materialInput || '').trim()) && !material;
      return {
        coefficientText: '',
        ppmText: '',
        errorText: isUnregistered
          ? '未登録物質です。「STDを手入力する」でSTD値を入力するか、下の一覧に追加してください。'
          : 'STD値を取得できませんでした。STDを手入力するか、物質マスタとの紐づけを確認してください。'
      };
    }
    if (stdArea.empty || stdArea.value === 0) return { coefficientText: '', ppmText: '', errorText: 'STDエリアを入力してください。' };
    const c = std.value / stdArea.value; const ppm = sample.empty ? null : sample.value * c;
    return { coefficientText: Number(c.toPrecision(10)).toString(), ppmText: ppm == null ? '' : Number(ppm.toFixed(2)).toString(), errorText: '' };
  }

  function buildCopyText() {
    const parts = ['GC濃度計算', `日付: ${todayIso()}`, ''];
    state.rows.forEach((row) => {
      const material = resolveMaterial(row.materialInput, row.materialKey);
      syncAutomaticStd(row, material);
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
      const material = resolveMaterial(row.materialInput, row.materialKey);
      syncAutomaticStd(row, material);
      const has = [row.materialInput, row.stdInput, row.stdAreaInput, row.sampleAreaInput, row.memo].some((x) => String(x || '').trim());
      if (!has) return;
      const calc = calculate(row, material);
      lines.push([todayIso(), material?.displayName || row.materialInput || '', row.stdInput || '', row.stdAreaInput || '', calc.coefficientText || '', row.sampleAreaInput || '', calc.ppmText || '', STATUS_LABEL[material?.status] || '', row.memo || ''].map(csvEscape).join(','));
    });
    return lines.join('\n');
  }

  function renderFavoriteChips() {
    renderFavoriteGroup(els.favoriteCommonChips, findMaterialsByNames(MAIN_CHIP_NAMES), false);
    renderFavoriteGroup(els.favoriteLiquidChips, findMaterialsByNames(LIQUID_STD_NAMES), true);
    renderFavoriteGroup(els.favoriteOtherChips, findMaterialsByNames(OTHER_CHIP_NAMES), true);
  }

  function findMaterialsByNames(names) {
    const seen = new Set();
    return names.map((name) => resolveMaterial(name)).filter((material) => {
      if (!material || seen.has(material.key)) return false;
      seen.add(material.key);
      return true;
    });
  }

  function renderFavoriteGroup(container, list, secondary) {
    if (!container) return; container.innerHTML = '';
    list.forEach((material) => {
      const chip = document.createElement('button'); chip.type = 'button'; chip.className = `quick-chip${secondary ? ' secondary' : ''}`;
      chip.textContent = material.displayName || '-';
      chip.dataset.materialOption = material.displayName || '';
      chip.disabled = false;
      chip.addEventListener('click', () => applyFavoriteToActiveRow(chip.dataset.materialOption));
      container.appendChild(chip);
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
    [els.favoriteCommonChips, els.favoriteLiquidChips, els.favoriteOtherChips].forEach((c) => c && c.querySelectorAll('.quick-chip').forEach((chip) => chip.classList.toggle('active', selected.has(chip.dataset.materialOption))));
  }

  function loadCustomMaterials() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CUSTOM_MATERIALS_STORAGE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item, index) => {
        const name = String(item?.display_name || item?.normalized_name || '').trim();
        const std = parseNumber(item?.std_value);
        if (!name || std.empty || !std.valid || std.value <= 0) return null;
        return {
          id: String(item?.id || `legacy_${index}`),
          raw_label: 'この端末の登録',
          normalized_name: String(item?.normalized_name || name),
          display_name: name,
          std_value: std.value,
          confidence: 'user',
          status: 'custom',
          note: 'この端末で登録したSTD値',
          aliases: [name, ...(Array.isArray(item?.aliases) ? item.aliases : [])]
        };
      }).filter(Boolean);
    } catch (_error) {
      return [];
    }
  }

  function saveCustomMaterials() {
    localStorage.setItem(CUSTOM_MATERIALS_STORAGE_KEY, JSON.stringify(state.customMaterials));
  }

  async function addCustomMaterial() {
    const name = String(els.customMaterialName.value || '').trim();
    const std = parseNumber(els.customStdValue.value);
    if (!name) {
      showStatus('追加する物質名を入力してください。', true);
      els.customMaterialName.focus();
      return;
    }
    if (std.empty || !std.valid || std.value <= 0) {
      showStatus('STD値には0より大きい数値を入力してください。', true);
      els.customStdValue.focus();
      return;
    }

    const sameName = state.materials.find((material) => normalize(material.displayName) === normalize(name));
    if (sameName?.isCustom) {
      const existing = state.customMaterials.find((item) => String(item.id) === sameName.key.replace(/^c_/, ''));
      if (existing) existing.std_value = std.value;
    } else if (sameName?.stdValue != null) {
      showStatus('同じ物質はすでに登録済みです。一時的に変える場合は計算カードの「STDを手入力する」を使ってください。', true);
      return;
    } else {
      state.customMaterials.push({
        id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        raw_label: 'この端末の登録',
        normalized_name: name,
        display_name: name,
        std_value: std.value,
        confidence: 'user',
        status: 'custom',
        note: 'この端末で登録したSTD値',
        aliases: [name]
      });
    }

    saveCustomMaterials();
    await loadMaster();
    const selected = state.materials.find((material) => normalize(material.displayName) === normalize(name) && material.isCustom);
    const activeRow = state.rows.find((row) => row.id === state.activeRowId) || state.rows[0];
    if (selected && activeRow) setRowMaterial(activeRow, selected);
    els.customMaterialName.value = '';
    els.customStdValue.value = '';
    renderRows();
    renderFavoriteChips();
    renderCustomMaterialList();
    persist();
    showStatus(`「${name}」をこの端末の候補に追加しました。`);
  }

  function renderCustomMaterialList() {
    if (!els.customMaterialList) return;
    if (!state.customMaterials.length) {
      els.customMaterialList.innerHTML = '<p class="custom-material-empty">この端末に追加した物質は、まだありません。</p>';
      return;
    }
    els.customMaterialList.innerHTML = state.customMaterials.map((item) => `
      <div class="custom-material-item">
        <span><strong>${escapeHtml(item.display_name)}</strong>　STD: ${escapeHtml(item.std_value)}</span>
        <button type="button" class="danger custom-material-delete" data-custom-id="${escapeHtml(item.id)}">削除</button>
      </div>
    `).join('');
    els.customMaterialList.querySelectorAll('.custom-material-delete').forEach((button) => {
      button.addEventListener('click', () => removeCustomMaterial(button.dataset.customId));
    });
  }

  async function removeCustomMaterial(id) {
    const material = state.materials.find((item) => item.key === `c_${id}`);
    if (!window.confirm(`「${material?.displayName || 'この物質'}」をこの端末の候補から削除しますか？`)) return;
    state.rows.forEach((row) => {
      if (row.materialKey !== `c_${id}`) return;
      row.materialKey = '';
      row.stdManual = true;
    });
    state.customMaterials = state.customMaterials.filter((item) => String(item.id) !== String(id));
    saveCustomMaterials();
    await loadMaster();
    renderRows();
    renderFavoriteChips();
    renderCustomMaterialList();
    persist();
    showStatus('この端末の候補から削除しました。');
  }

  function restoreState() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      const legacy = LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
      const parsed = JSON.parse(current || legacy || '{}');
      if (Array.isArray(parsed.rows)) {
        state.rows = parsed.rows.map((r) => {
          const row = { ...createEmptyRow(), ...r };
          const material = findStdEntry(row.materialInput);
          if (material) row.materialKey = material.key;
          if (material) {
            row.rawLabel = material.rawLabel || '';
            row.displayName = material.displayName || '';
            row.normalizedName = material.normalizedName || '';
            row.status = material.status || '';
            row.confidence = material.confidence || '';
            row.note = material.note || '';
          }
          syncAutomaticStd(row, material);
          return row;
        });
      }
      state.activeRowId = parsed.activeRowId || null;
      normalizeCardsState();
      if (typeof parsed.copyTextOutput === 'string') els.copyTextOutput.value = parsed.copyTextOutput;
      LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch (_e) { state.rows = []; normalizeCardsState(); }
  }
  function persist() {
    normalizeCardsState();
    state.rows.forEach((row) => syncAutomaticStd(row, resolveMaterial(row.materialInput, row.materialKey)));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: state.rows, activeRowId: state.activeRowId, copyTextOutput: els.copyTextOutput.value }));
  }
  async function fetchJsonSafe(path, fallback) { try { const r = await fetch(path); return r.ok ? await r.json() : fallback; } catch { return fallback; } }
  function csvEscape(v) { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t; }
  function todayIso() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }
  function showStatus(message, isError = false) { els.statusMessage.textContent = message; els.statusMessage.style.color = isError ? '#9b3f3f' : '#36507d'; }
  function escapeHtml(v) { return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
})();
