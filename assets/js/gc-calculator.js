(() => {
  const CACHE_VERSION = '20260827-numbered-samples-1';
  const DATA_PATH = `data/gc-std-master.json?v=${CACHE_VERSION}`;
  const ANALYTE_ALIASES_PATH = 'data/gc-analyte-aliases.json';
  const ANALYTE_DISPLAY_PATH = 'data/gc-analyte-display.json';
  const STORAGE_KEY = 'gc-calculator-state-v4';
  const CUSTOM_MATERIALS_STORAGE_KEY = 'gc-calculator-custom-materials-v1';
  const LEGACY_STORAGE_KEYS = ['gc-calculator-state-v3', 'gc-calculator-state-v2'];
  const MAIN_CHIP_NAMES = ['メタノール', 'アセトン', 'IPA', 'n-ヘキサン', 'MEK', '酢酸エチル', 'イソブタノール', '1-ブタノール', 'MIBK', 'トルエン', '酢酸イソブチル', '酢酸ブチル', 'エチルベンゼン', 'p-キシレン', 'o-キシレン'];
  const LIQUID_STD_NAMES = ['ブチルセロソルブ', 'スチレン', 'シクロヘキサノン'];
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
    activeCardLabel: document.getElementById('activeCardLabel'),
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

  let copyFeedbackTimer = null;

  init();

  async function init() {
    document.documentElement.dataset.gcCalculatorVersion = CACHE_VERSION;
    bindGlobalEvents();
    await loadMaster();
    await loadFavoriteData();
    restoreState();
    if (!state.rows.length) state.rows.push(createEmptyRow());
    renderRows();
    renderFavoriteChips();
    renderCustomMaterialList();
    showStatus('');
  }

  function bindGlobalEvents() {
    els.addRowBtn.addEventListener('click', () => {
      const newRow = createEmptyRow();
      state.rows.push(newRow);
      state.activeRowId = newRow.id;
      normalizeCardsState();
      renderRows();
      renderFavoriteChips();
      persist();
      requestAnimationFrame(() => {
        els.rowsContainer.querySelector(`[data-row-id="${newRow.id}"] .material-select`)?.focus();
      });
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
      const validation = validateOutputRows();
      if (!validation.ok) {
        resetCopyButton();
        showStatus(validation.message, true);
        focusRow(validation.rowId);
        return;
      }
      // 常に現在の入力値から作り直す。過去に生成したコピー文を再利用しない。
      els.copyTextOutput.value = buildCopyText();
      if (!els.copyTextOutput.value.trim()) {
        showStatus('コピーする計算結果がありません。', true);
        return;
      }
      persist();
      try {
        await navigator.clipboard.writeText(els.copyTextOutput.value);
        showCopySuccess();
        showStatus('計算結果をコピーしました。');
      } catch (_error) {
        resetCopyButton();
        showStatus('コピーに失敗しました。テキストを手動でコピーしてください。');
      }
    });

    els.downloadCsvBtn.addEventListener('click', () => {
      const validation = validateOutputRows();
      if (!validation.ok) {
        showStatus(validation.message, true);
        focusRow(validation.rowId);
        return;
      }
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
    const loadedCustomMaterials = loadCustomMaterials();
    const normalizedMasterRows = Array.isArray(masterRows) ? masterRows : [];
    const masterByName = new Map(normalizedMasterRows.map((item) => [
      normalize(item.display_name || item.normalized_name || item.raw_label),
      item
    ]));
    // 共有マスタに有効なSTDがある物質は、端末保存値で上書きしない。
    // 共有マスタのSTDが未設定、または共有マスタに存在しない物質だけ端末値を使う。
    state.customMaterials = loadedCustomMaterials.filter((item) => {
      const key = normalize(item.display_name || item.normalized_name);
      const master = masterByName.get(key);
      if (!master) return true;
      const rawStd = master.std_value;
      const hasMasterStd = rawStd !== null
        && rawStd !== undefined
        && String(rawStd).trim() !== ''
        && Number.isFinite(Number(rawStd));
      return !hasMasterStd;
    });
    if (state.customMaterials.length !== loadedCustomMaterials.length) saveCustomMaterials();

    state.optionLookup = new Map();
    state.searchLookup = new Map();
    const sourceRows = [
      ...state.customMaterials.map((item, sourceIndex) => ({ item, isCustom: true, sourceIndex })),
      ...normalizedMasterRows.map((item, sourceIndex) => ({ item, isCustom: false, sourceIndex }))
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

  function createEmptySample() {
    return { id: `s_${Math.random().toString(36).slice(2)}`, areaInput: '' };
  }

  function createEmptyRow() {
    return {
      id: `r_${Math.random().toString(36).slice(2)}`,
      materialInput: '',
      stdInput: '',
      stdAreaInput: '',
      stdManual: false,
      materialKey: '',
      rawLabel: '',
      displayName: '',
      normalizedName: '',
      status: '',
      confidence: '',
      note: '',
      samples: [createEmptySample()]
    };
  }

  function normalizeSamples(row, hadSamples = true) {
    const legacyArea = String(row.sampleAreaInput || '');
    if (hadSamples && Array.isArray(row.samples) && row.samples.length) {
      row.samples = row.samples.map((sample) => ({
        id: String(sample?.id || createEmptySample().id),
        areaInput: String(sample?.areaInput || '')
      }));
    } else {
      row.samples = [createEmptySample()];
      if (legacyArea) row.samples[0].areaInput = legacyArea;
    }
    delete row.sampleAreaInput;
    delete row.memo;
  }

  function normalizeCardsState() {
    if (!Array.isArray(state.rows)) state.rows = [];
    state.rows = state.rows.map((rawRow) => {
      const hadSamples = Array.isArray(rawRow?.samples);
      const row = { ...createEmptyRow(), ...rawRow };
      normalizeSamples(row, hadSamples);
      return row;
    });
    if (!state.rows.length) state.rows.push(createEmptyRow());
    if (!state.rows.some((r) => r.id === state.activeRowId)) state.activeRowId = state.rows[0].id;
  }

  function renderRows() {
    els.rowsContainer.innerHTML = state.rows.map((r, index) => renderRow(r, index)).join('');
    state.rows.forEach((row) => {
      const root = els.rowsContainer.querySelector(`[data-row-id="${row.id}"]`);
      if (root) bindRowEvents(root, row.id);
    });
    syncFavoriteChipState();
    syncActiveRowState();
  }

  function renderRow(row, index) {
    const material = resolveMaterial(row.materialInput, row.materialKey);
    const stdText = resolvedStdText(row, material);
    const calc = calculate(row, material, '');
    const isUnregistered = Boolean(String(row.materialInput || '').trim()) && !material;
    const cardNumber = index + 1;
    const title = material?.displayName || (isUnregistered ? `${row.materialInput}（未登録）` : '物質未選択');
    const statusBadge = material?.status && !['confirmed', 'custom'].includes(material.status) ? `<span class="badge badge-review">${STATUS_LABEL[material.status] || '要確認'}</span>` : '';
    const customBadge = material?.isCustom ? '<span class="badge badge-custom">この端末の登録</span>' : '';
    const stdNeedsCheck = (!row.stdManual && material && material.stdValue == null) ? '<span class="badge badge-review">STD値を確認</span>' : '';
    const manualBadge = row.stdManual ? '<span class="badge badge-manual">STD手入力</span>' : '';
    const unregisteredNote = `<div class="unregistered-note" ${isUnregistered ? '' : 'hidden'}><strong>マスタ未登録の物質です。</strong><span>「STDを手入力する」で計算できます。繰り返し使う場合は「一覧にない物質」へ保存できます。</span></div>`;
    const unregisteredEntry = `<details class="unregistered-entry" ${isUnregistered ? 'open' : ''}>
      <summary>一覧にない物質を一時的に使う</summary>
      <div class="unregistered-entry__body">
        <label>物質名<input type="text" class="unregistered-material-input" value="${escapeHtml(isUnregistered ? row.materialInput : '')}" placeholder="例：シクロヘキサノン" autocomplete="off" enterkeyhint="done"></label>
        <button type="button" class="plain unregistered-material-apply">未登録として設定</button>
        <p>設定後に「STDを手入力する」でSTD値を入力します。</p>
      </div>
    </details>`;
    return `<article class="calc-row${isUnregistered ? ' is-unregistered' : ''}${row.id === state.activeRowId ? ' is-active' : ''}" data-row-id="${escapeHtml(row.id)}" data-card-number="${cardNumber}">
      <div class="card-topline">
        <span class="card-caption">当日STD ${cardNumber}</span>
        <button type="button" class="remove-row-btn" aria-label="当日STD${cardNumber}を削除">×</button>
      </div>
      <div class="row-head">
        <div>
          <h3 class="row-title">${escapeHtml(title)}</h3>
          <div class="badges">${statusBadge}${customBadge}${stdNeedsCheck}${manualBadge}</div>
        </div>
      </div>
      <div class="row-grid">
        <div class="field material-field">
          <label><span class="field-heading"><span class="step-mini">1</span>物質</span><select class="material-select">${buildMaterialSelectOptions(material?.key || '')}</select></label>
        </div>
        <div class="field std-field">
          <label><span class="field-heading">STD</span><input type="text" class="std-input ${row.stdManual ? '' : 'std-auto'}" inputmode="decimal" value="${escapeHtml(stdText)}" readonly></label>
        </div>
        <div class="field std-area-field">
          <label><span class="field-heading"><span class="step-mini">2</span>当日STDエリア</span><input type="text" class="std-area-input input-main" inputmode="decimal" value="${escapeHtml(row.stdAreaInput)}" placeholder="例：125000"></label>
        </div>
        <div class="field coefficient-field result-field">
          <div class="result-label"><span>係数</span></div>
          <div class="result-box coefficient-output" aria-label="係数">${escapeHtml(calc.coefficientText || '—')}</div>
        </div>
      </div>
      <section class="samples-block" aria-label="${escapeHtml(title)}の検体">
        <div class="samples-heading">
          <div><strong>検体</strong></div>
          <button type="button" class="plain add-sample-btn no-print">＋ 検体</button>
        </div>
        <div class="samples-list">${renderSamples(row, material)}</div>
      </section>
      ${unregisteredEntry}${unregisteredNote}<div class="error-text">${escapeHtml(calc.errorText)}</div>
    </article>`;
  }

  function renderSamples(row, material) {
    return row.samples.map((sample, index) => renderSample(row, sample, index, material)).join('');
  }

  function renderSample(row, sample, index, material) {
    const calc = calculate(row, material, sample.areaInput);
    return `<div class="sample-row" data-sample-id="${escapeHtml(sample.id)}">
      <div class="sample-index">${index + 1}</div>
      <label class="sample-area-field"><span>検体エリア</span><input type="text" class="sample-area-input input-main" inputmode="decimal" value="${escapeHtml(sample.areaInput)}" placeholder="エリア"></label>
      <div class="sample-ppm-field">
        <span>ppm</span>
        <strong class="sample-ppm-output">${escapeHtml(calc.ppmText || '—')}</strong>
      </div>
      <button type="button" class="sample-delete-btn no-print" aria-label="検体${index + 1}を削除">×</button>
      <div class="sample-error">${escapeHtml(calc.sampleErrorText || '')}</div>
    </div>`;
  }

  function buildMaterialSelectOptions(selectedKey) {
    const common = findMaterialsByNames(MAIN_CHIP_NAMES);
    const liquid = findMaterialsByNames(LIQUID_STD_NAMES);
    const other = findMaterialsByNames(OTHER_CHIP_NAMES);
    const used = new Set([...common, ...liquid, ...other].map((material) => material.key));
    const custom = state.materials.filter((material) => material.isCustom && !used.has(material.key));
    const remaining = state.materials.filter((material) => !material.isCustom && !used.has(material.key));
    const group = (label, materials) => materials.length ? `<optgroup label="${escapeHtml(label)}">${materials.map((material) => `<option value="${escapeHtml(material.key)}" ${material.key === selectedKey ? 'selected' : ''}>${escapeHtml(material.displayName)}</option>`).join('')}</optgroup>` : '';
    return `<option value="">選択してください</option>${group('よく使う物質', common)}${group('液体STD・その他', liquid)}${group('その他の登録済み物質', [...other, ...remaining])}${group('この端末の登録', custom)}`;
  }

  function bindRowEvents(root, rowId) {
    const row = state.rows.find((r) => r.id === rowId);
    const materialSelect = root.querySelector('.material-select');
    const unregisteredMaterialInput = root.querySelector('.unregistered-material-input');
    const unregisteredMaterialApply = root.querySelector('.unregistered-material-apply');
    const stdInput = root.querySelector('.std-input');
    const stdAreaInput = root.querySelector('.std-area-input');

    const updateOnly = () => { updateRowComputedView(root, row); persist(); };

    // iPhone Safariでは、フォーカス直前にページ上部のDOMを更新すると
    // 入力欄へフォーカスした瞬間にスクロール位置が上へ跳ぶことがある。
    root.addEventListener('focusin', () => setActiveRowForInput(rowId));
    root.addEventListener('focusout', (event) => {
      if (event.relatedTarget && root.contains(event.relatedTarget)) return;
      window.requestAnimationFrame(() => syncActiveRowUi());
    });
    materialSelect.addEventListener('change', () => applyRegisteredMaterial(row, materialSelect.value, root));
    unregisteredMaterialApply.addEventListener('click', () => applyUnregisteredMaterial(row, unregisteredMaterialInput.value, root));
    unregisteredMaterialInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      applyUnregisteredMaterial(row, unregisteredMaterialInput.value, root);
    });

    stdInput.addEventListener('input', () => { row.stdInput = stdInput.value; row.stdManual = true; updateOnly(); });
    stdInput.addEventListener('focus', () => { if (stdInput.readOnly) showStatus('STDは自動反映です。手入力する場合は「STDを手入力する」を押してください。'); });
    stdAreaInput.addEventListener('input', () => { row.stdAreaInput = stdAreaInput.value; updateOnly(); });

    root.querySelector('.add-sample-btn')?.addEventListener('click', () => {
      row.samples.push(createEmptySample());
      refreshSamples(root, row);
      persist();
      showStatus('検体を追加しました。');
    });

    bindSampleEvents(root, row);

    root.querySelector('.remove-row-btn').addEventListener('click', () => {
      if (rowHasContent(row)) {
        const material = resolveMaterial(row.materialInput, row.materialKey);
        const label = material?.displayName || String(row.materialInput || '').trim() || 'この物質';
        if (!window.confirm(`「${label}」の当日STDと検体を削除しますか？入力内容も削除されます。`)) return;
      }
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
      const material = resolveMaterial(row.materialInput, row.materialKey);
      if (row.stdManual) {
        row.stdManual = false;
        syncAutomaticStd(row, material);
      } else {
        row.stdInput = resolvedStdText(row, material);
        row.stdManual = true;
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

  function bindSampleEvents(root, row) {
    root.querySelectorAll('.sample-row').forEach((sampleRoot) => {
      const sample = row.samples.find((item) => item.id === sampleRoot.dataset.sampleId);
      if (!sample) return;
      const areaInput = sampleRoot.querySelector('.sample-area-input');
      areaInput?.addEventListener('input', () => {
        sample.areaInput = areaInput.value;
        updateSampleComputedView(sampleRoot, row, sample);
        persist();
      });
      sampleRoot.querySelector('.sample-delete-btn')?.addEventListener('click', () => {
        if (row.samples.length === 1) {
          sample.areaInput = '';
        } else {
          row.samples = row.samples.filter((item) => item.id !== sample.id);
        }
        refreshSamples(root, row);
        persist();
      });
    });
  }

  function refreshSamples(root, row) {
    const material = resolveMaterial(row.materialInput, row.materialKey);
    const list = root.querySelector('.samples-list');
    if (!list) return;
    list.innerHTML = renderSamples(row, material);
    bindSampleEvents(root, row);
  }

  function rowHasContent(row) {
    const sampleHasContent = row.samples.some((sample) => String(sample.areaInput || '').trim());
    return [
      row.materialInput,
      row.stdManual ? row.stdInput : '',
      row.stdAreaInput
    ].some((value) => String(value || '').trim()) || sampleHasContent;
  }

  function setActiveRowForInput(rowId) {
    if (!state.rows.some((row) => row.id === rowId)) return;
    if (state.activeRowId === rowId) return;
    state.activeRowId = rowId;
    els.rowsContainer?.querySelectorAll('.calc-row').forEach((root) => {
      root.classList.toggle('is-active', root.dataset.rowId === state.activeRowId);
    });
  }

  function setActiveRow(rowId) {
    if (!state.rows.some((row) => row.id === rowId)) return;
    state.activeRowId = rowId;
    syncActiveRowUi();
  }

  function syncActiveRowUi() {
    syncActiveRowState();
    syncFavoriteChipState();
  }

  function syncActiveRowState() {
    els.rowsContainer?.querySelectorAll('.calc-row').forEach((root) => {
      root.classList.toggle('is-active', root.dataset.rowId === state.activeRowId);
    });
    if (!els.activeCardLabel) return;
    const index = state.rows.findIndex((row) => row.id === state.activeRowId);
    const row = index >= 0 ? state.rows[index] : state.rows[0];
    if (!row) {
      els.activeCardLabel.textContent = '当日STD 1';
      return;
    }
    const material = resolveMaterial(row.materialInput, row.materialKey);
    els.activeCardLabel.textContent = material
      ? `当日STD ${index + 1}（${material.displayName}）`
      : `当日STD ${index + 1}`;
  }

  function applyRegisteredMaterial(row, materialKey, root) {
    setActiveRow(row.id);
    const materialSelect = root.querySelector('.material-select');
    const selected = findMaterialByKey(materialKey);
    if (!selected) {
      clearRowMaterialSelection(row, '');
      clearAreaInputs(row, root);
      updateRowComputedView(root, row, true);
      persist();
      return;
    }
    const isSameMaterial = row.materialKey === selected.key;
    const duplicateRow = state.rows.find((r) => r.id !== row.id && resolveMaterial(r.materialInput, r.materialKey)?.displayName === selected.displayName);
    if (!isSameMaterial && duplicateRow) {
      showStatus(`「${selected.displayName}」はすでに当日STD登録済みです。既存カードを使用します。`);
      focusRow(duplicateRow.id);
      materialSelect.value = row.materialKey || '';
      return;
    }
    if (!isSameMaterial) clearAreaInputs(row, root);
    setRowMaterial(row, selected, { preserveManualStd: isSameMaterial && row.stdManual });
    if (materialSelect) materialSelect.value = selected.key;
    const unregisteredMaterialInput = root.querySelector('.unregistered-material-input');
    if (unregisteredMaterialInput) unregisteredMaterialInput.value = '';
    updateRowComputedView(root, row, true);
    persist();
  }

  function applyUnregisteredMaterial(row, text, root) {
    const name = String(text || '').trim();
    if (!name) {
      showStatus('未登録として使う物質名を入力してください。', true);
      root.querySelector('.unregistered-material-input')?.focus();
      return;
    }
    setActiveRow(row.id);
    const materialChanged = Boolean(row.materialKey) || normalize(row.materialInput) !== normalize(name);
    clearRowMaterialSelection(row, name);
    if (materialChanged) clearAreaInputs(row, root);
    const materialSelect = root.querySelector('.material-select');
    if (materialSelect) materialSelect.value = '';
    updateRowComputedView(root, row, true);
    persist();
    showStatus(`「${name}」を未登録物質として設定しました。`);
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

  function clearAreaInputs(row, root) {
    row.stdAreaInput = '';
    row.samples.forEach((sample) => {
      sample.areaInput = '';
      sample.label = '';
    });
    const stdAreaInput = root?.querySelector('.std-area-input');
    if (stdAreaInput) stdAreaInput.value = '';
    if (root) refreshSamples(root, row);
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
    const stdText = resolvedStdText(row, material);
    if (!row.stdManual) row.stdInput = stdText;
    const calc = calculate(row, material, '');
    const isUnregistered = Boolean(String(row.materialInput || '').trim()) && !material;
    root.querySelector('.coefficient-output').textContent = calc.coefficientText || '—';
    root.querySelector('.error-text').textContent = calc.errorText;
    root.querySelectorAll('.sample-row').forEach((sampleRoot) => {
      const sample = row.samples.find((item) => item.id === sampleRoot.dataset.sampleId);
      if (sample) updateSampleComputedView(sampleRoot, row, sample);
    });
    if (rerenderHead) {
      root.querySelector('.row-title').textContent = material?.displayName || (isUnregistered ? `${row.materialInput}（未登録）` : '物質を選択');
    }
    root.classList.toggle('is-unregistered', isUnregistered);
    const unregisteredNote = root.querySelector('.unregistered-note');
    if (unregisteredNote) unregisteredNote.hidden = !isUnregistered;
    const stdInput = root.querySelector('.std-input');
    if (stdInput) {
      stdInput.value = stdText;
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
    if (rerenderHead) syncActiveRowUi();
  }

  function updateSampleComputedView(sampleRoot, row, sample) {
    const material = resolveMaterial(row.materialInput, row.materialKey);
    const calc = calculate(row, material, sample.areaInput);
    sampleRoot.querySelector('.sample-ppm-output').textContent = calc.ppmText || '—';
    sampleRoot.querySelector('.sample-error').textContent = calc.sampleErrorText || '';
  }

  function resolveMaterial(input, materialKey = '') {
    // 表示されている物質名を最優先にする。古い保存データのキーが残っていても、
    // 選択欄と内部の物質が食い違わないようにする。
    const normalizedInput = normalize(input);
    const byInput = normalizedInput ? state.searchLookup.get(normalizedInput) : null;
    if (byInput) return byInput;
    if (materialKey) {
      const byKey = findMaterialByKey(materialKey);
      if (byKey) return byKey;
    }
    return null;
  }

  function findMaterialByKey(materialKey) {
    return state.materials.find((material) => material.key === materialKey) || null;
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

  function resolvedStdText(row, material) {
    // 自動STDは row.stdInput を参照しない。選択中の物質のマスタ値が唯一の正しい値。
    // row.stdInput は手入力モードの場合だけ使用する。
    return row.stdManual ? String(row.stdInput ?? '') : automaticStdText(material);
  }

  function syncAutomaticStd(row, material) {
    // 保存データを最新マスタ値に正規化する。表示・計算は resolvedStdText を使うため、
    // 途中の入力処理が古い保存値を拾ってSTDを変えることはない。
    if (!row.stdManual) row.stdInput = automaticStdText(material);
  }

  function calculate(row, material, sampleAreaInput = '') {
    const std = parseNumber(resolvedStdText(row, material));
    const stdArea = parseNumber(row.stdAreaInput);
    const sample = parseNumber(sampleAreaInput);
    if (!std.valid || !stdArea.valid) {
      return { coefficientText: '', ppmText: '', errorText: '数値を入力してください。', sampleErrorText: '' };
    }
    const noMaterial = !String(row.materialInput || '').trim();
    if (noMaterial && std.empty && stdArea.empty && sample.empty) {
      return { coefficientText: '', ppmText: '', errorText: '', sampleErrorText: '' };
    }
    if (std.empty) {
      const isUnregistered = Boolean(String(row.materialInput || '').trim()) && !material;
      return {
        coefficientText: '',
        ppmText: '',
        errorText: isUnregistered
          ? '未登録物質です。「STDを手入力する」でSTD値を入力するか、下の一覧に追加してください。'
          : 'STD値を取得できませんでした。STDを手入力するか、物質マスタとの紐づけを確認してください。',
        sampleErrorText: ''
      };
    }
    if (std.value <= 0) {
      return { coefficientText: '', ppmText: '', errorText: 'STD値には0より大きい数値を入力してください。', sampleErrorText: '' };
    }
    if (stdArea.empty) {
      return { coefficientText: '', ppmText: '', errorText: '当日STDエリアを入力してください。', sampleErrorText: '' };
    }
    if (stdArea.value <= 0) {
      return { coefficientText: '', ppmText: '', errorText: 'STDエリアには0より大きい数値を入力してください。', sampleErrorText: '' };
    }
    const coefficient = std.value / stdArea.value;
    if (!sample.valid) {
      return {
        coefficientText: Number(coefficient.toPrecision(10)).toString(),
        ppmText: '',
        errorText: '',
        sampleErrorText: '数値を入力してください。'
      };
    }
    if (!sample.empty && sample.value < 0) {
      return {
        coefficientText: Number(coefficient.toPrecision(10)).toString(),
        ppmText: '',
        errorText: '',
        sampleErrorText: '検体エリアには0以上の数値を入力してください。'
      };
    }
    const ppm = sample.empty ? null : sample.value * coefficient;
    return {
      coefficientText: Number(coefficient.toPrecision(10)).toString(),
      ppmText: ppm == null ? '' : Number(ppm.toFixed(2)).toString(),
      errorText: '',
      sampleErrorText: ''
    };
  }

  function validateOutputRows() {
    const rows = state.rows.filter(rowHasContent);
    if (!rows.length) {
      return { ok: false, rowId: null, message: '出力する計算結果がありません。' };
    }
    for (const row of rows) {
      const material = resolveMaterial(row.materialInput, row.materialKey);
      if (!material && !String(row.materialInput || '').trim()) {
        return { ok: false, rowId: row.id, message: '物質が未選択の当日STDがあります。物質を選択してください。' };
      }
      const baseCalc = calculate(row, material, '');
      if (baseCalc.errorText) {
        return { ok: false, rowId: row.id, message: `計算エラーのある当日STDがあります：${baseCalc.errorText}` };
      }
      for (const sample of row.samples) {
        if (!String(sample.areaInput || '').trim()) continue;
        const calc = calculate(row, material, sample.areaInput);
        if (calc.sampleErrorText) {
          return { ok: false, rowId: row.id, message: `検体の入力エラーがあります：${calc.sampleErrorText}` };
        }
      }
    }
    return { ok: true, rowId: null, message: '' };
  }

  function focusRow(rowId) {
    if (!rowId) return;
    setActiveRow(rowId);
    const root = els.rowsContainer.querySelector(`[data-row-id="${rowId}"]`);
    root?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function buildCopyText() {
    const parts = ['GC濃度計算', `日付: ${todayIso()}`, ''];
    state.rows.forEach((row) => {
      if (!rowHasContent(row)) return;
      const material = resolveMaterial(row.materialInput, row.materialKey);
      const stdText = resolvedStdText(row, material);
      const baseCalc = calculate(row, material, '');
      parts.push(
        material?.displayName || row.materialInput || '(未選択)',
        `STD: ${stdText || '-'}`,
        `当日STDエリア: ${row.stdAreaInput || '-'}`,
        `係数: ${baseCalc.coefficientText || '-'}`
      );
      row.samples.forEach((sample, index) => {
        if (!String(sample.areaInput || '').trim()) return;
        const calc = calculate(row, material, sample.areaInput);
        parts.push(`${index + 1}: エリア ${sample.areaInput} / ${calc.ppmText || '-'} ppm`);
      });
      parts.push('');
    });
    return parts.join('\n').trim();
  }

  function buildCsv() {
    const lines = [['日付', '物質', 'STD', '当日STDエリア', '係数', '検体', '検体エリア', 'ppm', '状態'].join(',')];
    state.rows.forEach((row) => {
      if (!rowHasContent(row)) return;
      const material = resolveMaterial(row.materialInput, row.materialKey);
      const stdText = resolvedStdText(row, material);
      const baseCalc = calculate(row, material, '');
      const filledSamples = row.samples
        .map((sample, index) => ({ sample, index }))
        .filter(({ sample }) => String(sample.areaInput || '').trim());
      if (!filledSamples.length) {
        lines.push([todayIso(), material?.displayName || row.materialInput || '', stdText || '', row.stdAreaInput || '', baseCalc.coefficientText || '', '', '', '', STATUS_LABEL[material?.status] || ''].map(csvEscape).join(','));
        return;
      }
      filledSamples.forEach(({ sample, index }) => {
        const calc = calculate(row, material, sample.areaInput);
        lines.push([
          todayIso(),
          material?.displayName || row.materialInput || '',
          stdText || '',
          row.stdAreaInput || '',
          baseCalc.coefficientText || '',
          String(index + 1),
          sample.areaInput || '',
          calc.ppmText || '',
          STATUS_LABEL[material?.status] || ''
        ].map(csvEscape).join(','));
      });
    });
    return lines.join('\n');
  }

  function renderFavoriteChips() {
    renderFavoriteGroup(
      els.favoriteCommonChips,
      findMaterialsFromFavoriteEntries(state.favorites.common, MAIN_CHIP_NAMES),
      false
    );
    renderFavoriteGroup(
      els.favoriteLiquidChips,
      findMaterialsFromFavoriteEntries(state.favorites.liquid_standard, LIQUID_STD_NAMES),
      true
    );
    renderFavoriteGroup(els.favoriteOtherChips, findMaterialsByNames(OTHER_CHIP_NAMES), true);
  }

  function findMaterialsFromFavoriteEntries(entries, fallbackNames) {
    if (!Array.isArray(entries) || !entries.length) return findMaterialsByNames(fallbackNames);
    const seen = new Set();
    return entries.map((entry) => {
      const normalizedName = String(entry?.normalized_name || '');
      const candidates = [
        entry?.display_name,
        normalizedName,
        state.analyteDisplay?.[normalizedName],
        ...(Array.isArray(state.analyteAliases?.[normalizedName]) ? state.analyteAliases[normalizedName] : [])
      ].filter(Boolean);
      return candidates.map((candidate) => resolveMaterial(candidate)).find(Boolean) || null;
    }).filter((material) => {
      if (!material || seen.has(material.key)) return false;
      seen.add(material.key);
      return true;
    });
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
    const material = findStdEntry(displayName);
    if (root && material) {
      applyRegisteredMaterial(row, material.key, root);
      showStatus('よく使う物質を反映しました。');
    }
  }
  function syncFavoriteChipState() {
    const activeRow = state.rows.find((row) => row.id === state.activeRowId) || state.rows[0];
    const activeMaterialName = activeRow
      ? resolveMaterial(activeRow.materialInput, activeRow.materialKey)?.displayName || ''
      : '';
    [els.favoriteCommonChips, els.favoriteLiquidChips, els.favoriteOtherChips].forEach((container) => {
      container?.querySelectorAll('.quick-chip').forEach((chip) => {
        chip.classList.toggle('active', Boolean(activeMaterialName) && chip.dataset.materialOption === activeMaterialName);
      });
    });
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

    const matched = resolveMaterial(name);
    if (matched?.isCustom) {
      const existing = state.customMaterials.find((item) => String(item.id) === matched.key.replace(/^c_/, ''));
      if (existing) existing.std_value = std.value;
    } else if (matched) {
      const exactDisplayName = normalize(name) === normalize(matched.displayName);
      if (!exactDisplayName) {
        showStatus(`「${name}」は「${matched.displayName}」の別名として登録済みです。正式な物質名を使用してください。`, true);
        return;
      }
      if (matched.stdValue != null) {
        showStatus('同じ物質はすでに登録済みです。一時的に変える場合は計算カードの「STDを手入力する」を使ってください。', true);
        return;
      }
      state.customMaterials.push({
        id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        raw_label: 'この端末の登録',
        normalized_name: matched.normalizedName || name,
        display_name: matched.displayName,
        std_value: std.value,
        confidence: 'user',
        status: 'custom',
        note: 'この端末で登録したSTD値',
        aliases: [matched.displayName]
      });
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
      row.stdInput = '';
      row.stdManual = false;
      row.stdAreaInput = '';
      row.samples = [createEmptySample()];
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
          // 保存済みキーはマスタの並び替え等で古くなるため、物質名から必ず再解決する。
          row.materialKey = material?.key || '';
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: state.rows, activeRowId: state.activeRowId, copyTextOutput: els.copyTextOutput.value }));
  }
  function showCopySuccess() {
    if (!els.copyResultBtn) return;
    if (copyFeedbackTimer) window.clearTimeout(copyFeedbackTimer);
    els.copyResultBtn.textContent = '✓ コピーしました';
    els.copyResultBtn.classList.add('is-copied');
    copyFeedbackTimer = window.setTimeout(resetCopyButton, 1600);
  }

  function resetCopyButton() {
    if (copyFeedbackTimer) {
      window.clearTimeout(copyFeedbackTimer);
      copyFeedbackTimer = null;
    }
    if (!els.copyResultBtn) return;
    els.copyResultBtn.textContent = '計算結果をコピー';
    els.copyResultBtn.classList.remove('is-copied');
  }

  async function fetchJsonSafe(path, fallback) { try { const r = await fetch(path); return r.ok ? await r.json() : fallback; } catch { return fallback; } }
  function csvEscape(v) { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t; }
  function todayIso() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }
  function showStatus(message, isError = false) { els.statusMessage.textContent = message; els.statusMessage.style.color = isError ? '#9b3f3f' : '#36507d'; }
  function escapeHtml(v) { return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
})();
