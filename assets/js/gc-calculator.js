(() => {
  const DATA_PATH = 'data/gc-std-master.json';
  const STORAGE_KEY = 'gc-calculator-state-v1';
  const DEFAULT_ROWS = 3;

  const STATUS_LABEL = { confirmed: '確定', provisional: '仮', needs_review: '要確認' };
  const CONFIDENCE_LABEL = { high: '高', medium: '中', low: '低' };

  const els = {
    rowsContainer: document.getElementById('rowsContainer'),
    addRowBtn: document.getElementById('addRowBtn'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    buildCopyTextBtn: document.getElementById('buildCopyTextBtn'),
    copyResultBtn: document.getElementById('copyResultBtn'),
    downloadCsvBtn: document.getElementById('downloadCsvBtn'),
    copyTextOutput: document.getElementById('copyTextOutput'),
    statusMessage: document.getElementById('statusMessage')
  };

  const state = {
    materials: [],
    optionLookup: new Map(),
    rows: []
  };

  init();

  async function init() {
    bindGlobalEvents();
    await loadMaster();
    restoreState();
    if (!state.rows.length) {
      for (let i = 0; i < DEFAULT_ROWS; i += 1) state.rows.push(createEmptyRow());
    }
    renderRows();
    showStatus('入力内容はこの端末に自動保存されます。');
  }

  function bindGlobalEvents() {
    els.addRowBtn.addEventListener('click', () => {
      state.rows.push(createEmptyRow());
      renderRows();
      persist();
    });

    els.clearAllBtn.addEventListener('click', () => {
      const ok = window.confirm('入力内容をすべて消します。よろしいですか？');
      if (!ok) return;
      state.rows = Array.from({ length: DEFAULT_ROWS }, () => createEmptyRow());
      localStorage.removeItem(STORAGE_KEY);
      els.copyTextOutput.value = '';
      renderRows();
      showStatus('入力内容をクリアしました。');
    });

    els.buildCopyTextBtn.addEventListener('click', () => {
      els.copyTextOutput.value = buildCopyText();
      persist();
      showStatus('コピー用テキストを作成しました。');
    });

    els.copyResultBtn.addEventListener('click', async () => {
      if (!els.copyTextOutput.value.trim()) els.copyTextOutput.value = buildCopyText();
      const text = els.copyTextOutput.value;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          els.copyTextOutput.focus();
          els.copyTextOutput.select();
          document.execCommand('copy');
        }
        showStatus('計算結果をコピーしました。');
      } catch (error) {
        showStatus('コピーに失敗しました。テキストを手動でコピーしてください。');
      }
    });

    els.downloadCsvBtn.addEventListener('click', () => {
      const csv = buildCsv();
      const date = todayIso();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gc-calculation-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showStatus('CSVを保存しました。');
    });

    els.copyTextOutput.addEventListener('input', persist);
  }

  async function loadMaster() {
    try {
      const res = await fetch(DATA_PATH, { cache: 'no-cache' });
      if (!res.ok) throw new Error('STDマスタ読み込み失敗');
      const data = await res.json();
      const rows = Array.isArray(data) ? data : [];
      state.materials = rows.map((item, index) => {
        const display = item.display_name || item.normalized_name || item.raw_label || `物質${index + 1}`;
        const raw = item.raw_label || '';
        const base = raw && raw !== display ? `${display} / ${raw}` : display;
        const optionLabel = `${base}${rows.filter((x) => (x.display_name || x.normalized_name || x.raw_label) === display).length > 1 ? ` #${index + 1}` : ''}`;
        const stdValue = Number(item.std_value);
        return {
          key: `m_${index}`,
          optionLabel,
          displayName: display,
          rawLabel: raw,
          stdValue: Number.isFinite(stdValue) ? stdValue : null,
          confidence: String(item.confidence || ''),
          status: String(item.status || ''),
          note: item.note || ''
        };
      });
      state.optionLookup = new Map(state.materials.map((m) => [m.optionLabel, m]));
    } catch (error) {
      showStatus('STDマスタの読み込みに失敗しました。', true);
      state.materials = [];
      state.optionLookup = new Map();
    }
  }

  function createEmptyRow() {
    return {
      id: `r_${Math.random().toString(36).slice(2)}`,
      materialInput: '',
      stdInput: '',
      stdAreaInput: '',
      sampleAreaInput: '',
      memo: ''
    };
  }

  function restoreState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.rows)) return;
      state.rows = parsed.rows.map((row) => ({
        id: row.id || `r_${Math.random().toString(36).slice(2)}`,
        materialInput: String(row.materialInput || ''),
        stdInput: String(row.stdInput || ''),
        stdAreaInput: String(row.stdAreaInput || ''),
        sampleAreaInput: String(row.sampleAreaInput || ''),
        memo: String(row.memo || '')
      }));
      if (typeof parsed.copyTextOutput === 'string') els.copyTextOutput.value = parsed.copyTextOutput;
    } catch (_error) {
      state.rows = [];
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: state.rows, copyTextOutput: els.copyTextOutput.value }));
  }

  function renderRows() {
    if (!state.rows.length) {
      els.rowsContainer.innerHTML = '<p>行がありません。</p>';
      return;
    }

    const datalistHtml = buildDatalistHtml();
    els.rowsContainer.innerHTML = `${datalistHtml}${state.rows.map((row, idx) => renderRow(row, idx + 1)).join('')}`;

    state.rows.forEach((row) => {
      const root = els.rowsContainer.querySelector(`[data-row-id="${row.id}"]`);
      if (!root) return;
      bindRowEvents(root, row.id);
    });
  }

  function buildDatalistHtml() {
    return `<datalist id="materialOptions">${state.materials.map((m) => `<option value="${escapeHtml(m.optionLabel)}"></option>`).join('')}</datalist>`;
  }

  function renderRow(row, rowNo) {
    const resolved = resolveMaterial(row.materialInput);
    const calc = calculate(row, resolved);

    const badges = [];
    if (resolved?.status === 'needs_review') badges.push('<span class="badge badge-review">要確認</span>');
    if (resolved?.confidence === 'low') badges.push('<span class="badge badge-low">信頼度: 低</span>');

    const metaSmall = resolved
      ? `${escapeHtml(resolved.displayName)}${resolved.rawLabel ? `（raw: ${escapeHtml(resolved.rawLabel)}）` : ''}`
      : '物質を選択してください';

    return `
      <article class="calc-row" data-row-id="${escapeHtml(row.id)}">
        <div class="row-head">
          <h3 class="row-title">行 ${rowNo}</h3>
          <button type="button" class="danger remove-row-btn">削除</button>
        </div>
        <div class="row-grid">
          <div class="material-field field wide">
            <label>物質
              <input type="search" class="material-input" list="materialOptions" value="${escapeHtml(row.materialInput)}" placeholder="物質を検索して選択">
            </label>
            <div class="meta-note">${metaSmall}</div>
            <div class="badges">${badges.join('')}</div>
          </div>

          <div class="field">
            <label>STD
              <input type="text" class="std-input" inputmode="decimal" value="${escapeHtml(row.stdInput)}" placeholder="例: 128.7">
            </label>
          </div>

          <div class="field">
            <label>当日STDエリア
              <input type="text" class="std-area-input" inputmode="decimal" value="${escapeHtml(row.stdAreaInput)}" placeholder="例: 5000">
            </label>
          </div>

          <div class="field">
            <label>係数
              <div class="result-box coefficient-output">${escapeHtml(calc.coefficientText)}</div>
            </label>
          </div>

          <div class="field">
            <label>検体エリア
              <input type="text" class="sample-area-input" inputmode="decimal" value="${escapeHtml(row.sampleAreaInput)}" placeholder="例: 1200">
            </label>
          </div>

          <div class="field">
            <label>ppm
              <div class="result-box ppm-output">${escapeHtml(calc.ppmText)}</div>
            </label>
          </div>

          <div class="field wide">
            <label>メモ
              <input type="text" class="memo-input" value="${escapeHtml(row.memo)}" placeholder="補足メモ">
            </label>
          </div>
        </div>

        <div class="error-text">${escapeHtml(calc.errorText)}</div>
      </article>
    `;
  }

  function bindRowEvents(root, rowId) {
    const row = state.rows.find((r) => r.id === rowId);
    if (!row) return;

    const materialInput = root.querySelector('.material-input');
    const stdInput = root.querySelector('.std-input');
    const stdAreaInput = root.querySelector('.std-area-input');
    const sampleAreaInput = root.querySelector('.sample-area-input');
    const memoInput = root.querySelector('.memo-input');

    materialInput.addEventListener('input', () => {
      row.materialInput = materialInput.value;
      const selected = resolveMaterial(row.materialInput);
      if (selected && !String(row.stdInput || '').trim()) row.stdInput = selected.stdValue == null ? '' : String(selected.stdValue);
      if (selected && !String(stdInput.value || '').trim()) stdInput.value = row.stdInput;
      updateRowComputedView(root, row);
      persist();
    });

    stdInput.addEventListener('input', () => {
      row.stdInput = stdInput.value;
      updateRowComputedView(root, row);
      persist();
    });

    stdAreaInput.addEventListener('input', () => {
      row.stdAreaInput = stdAreaInput.value;
      updateRowComputedView(root, row);
      persist();
    });

    sampleAreaInput.addEventListener('input', () => {
      row.sampleAreaInput = sampleAreaInput.value;
      updateRowComputedView(root, row);
      persist();
    });

    memoInput.addEventListener('input', () => {
      row.memo = memoInput.value;
      persist();
    });

    root.querySelector('.remove-row-btn').addEventListener('click', () => {
      state.rows = state.rows.filter((r) => r.id !== rowId);
      if (!state.rows.length) state.rows.push(createEmptyRow());
      renderRows();
      persist();
    });
  }

  function updateRowComputedView(root, row) {
    const resolved = resolveMaterial(row.materialInput);
    const calc = calculate(row, resolved);

    const metaNote = root.querySelector('.meta-note');
    const badges = root.querySelector('.badges');
    const coefficientBox = root.querySelector('.coefficient-output');
    const ppmBox = root.querySelector('.ppm-output');
    const errorText = root.querySelector('.error-text');

    if (metaNote) {
      metaNote.textContent = resolved
        ? `${resolved.displayName}${resolved.rawLabel ? `（raw: ${resolved.rawLabel}）` : ''}`
        : '物質を選択してください';
    }

    if (badges) {
      const badgesHtml = [];
      if (resolved?.status === 'needs_review') badgesHtml.push('<span class="badge badge-review">要確認</span>');
      if (resolved?.confidence === 'low') badgesHtml.push('<span class="badge badge-low">信頼度: 低</span>');
      badges.innerHTML = badgesHtml.join('');
    }

    if (coefficientBox) coefficientBox.textContent = calc.coefficientText;
    if (ppmBox) ppmBox.textContent = calc.ppmText;
    if (errorText) errorText.textContent = calc.errorText;
  }

  function resolveMaterial(materialInput) {
    return state.optionLookup.get(String(materialInput || '').trim()) || null;
  }

  function parseNumber(raw) {
    const str = String(raw || '').trim();
    if (!str) return { empty: true, value: null, valid: true };
    const normalized = str.replace(/,/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) return { empty: false, value: null, valid: false };
    const value = Number(normalized);
    return { empty: false, value, valid: Number.isFinite(value) };
  }

  function calculate(row, material) {
    const stdParsed = parseNumber(row.stdInput);
    const stdAreaParsed = parseNumber(row.stdAreaInput);
    const sampleParsed = parseNumber(row.sampleAreaInput);

    const errors = [];
    if (!stdParsed.valid) errors.push('STDは数値で入力してください。');
    if (!stdAreaParsed.valid) errors.push('当日STDエリアは数値で入力してください。');
    if (!sampleParsed.valid) errors.push('検体エリアは数値で入力してください。');
    if (material?.status === 'needs_review') errors.push('要確認データです。STD値を確認してください。');
    if (material?.confidence === 'low') errors.push('信頼度が低いデータです。');

    const stdMissing = stdParsed.empty;
    const stdAreaMissing = stdAreaParsed.empty;

    let coefficient = null;
    let ppm = null;

    if (!errors.length && !stdMissing && !stdAreaMissing && stdAreaParsed.value !== 0) {
      coefficient = stdParsed.value / stdAreaParsed.value;
      if (!sampleParsed.empty) ppm = sampleParsed.value * coefficient;
    }

    if (!stdAreaParsed.empty && stdAreaParsed.value === 0) errors.push('当日STDエリアが0のため計算できません。');
    if (stdMissing && material && material.stdValue == null) errors.push('この物質はSTD値が未設定のため計算できません。');

    const coefficientText = coefficient == null ? '' : formatCoefficient(coefficient);
    const ppmText = ppm == null ? '' : formatPpm(ppm);

    return {
      coefficient,
      ppm,
      coefficientText,
      ppmText,
      errorText: errors.join(' ')
    };
  }

  function formatCoefficient(value) {
    if (!Number.isFinite(value)) return '';
    return Number(value.toPrecision(6)).toString();
  }

  function formatPpm(value) {
    if (!Number.isFinite(value)) return '';
    return Number(value.toFixed(4)).toString();
  }

  function buildCopyText() {
    const date = todayIso();
    const parts = [`GC濃度計算`, `日付: ${date}`, ''];

    state.rows.forEach((row) => {
      const material = resolveMaterial(row.materialInput);
      const calc = calculate(row, material);
      const hasAnyInput = [row.materialInput, row.stdInput, row.stdAreaInput, row.sampleAreaInput, row.memo].some((x) => String(x || '').trim());
      if (!hasAnyInput) return;
      const name = material?.displayName || row.materialInput || '(未選択)';

      parts.push(name);
      parts.push(`STD: ${row.stdInput || '-'}`);
      parts.push(`STDエリア: ${row.stdAreaInput || '-'}`);
      parts.push(`係数: ${calc.coefficientText || '-'}`);
      parts.push(`検体エリア: ${row.sampleAreaInput || '-'}`);
      parts.push(`ppm: ${calc.ppmText || '-'}`);
      if (row.memo) parts.push(`メモ: ${row.memo}`);
      if (calc.errorText) parts.push(`注意: ${calc.errorText}`);
      parts.push('');
    });

    return parts.join('\n').trim();
  }

  function buildCsv() {
    const date = todayIso();
    const header = ['日付', '物質', 'STD', 'STDエリア', '係数', '検体エリア', 'ppm', '信頼度', '状態', 'メモ'];
    const lines = [header.join(',')];

    state.rows.forEach((row) => {
      const material = resolveMaterial(row.materialInput);
      const calc = calculate(row, material);
      const cols = [
        date,
        material?.displayName || row.materialInput || '',
        row.stdInput || '',
        row.stdAreaInput || '',
        calc.coefficientText || '',
        row.sampleAreaInput || '',
        calc.ppmText || '',
        CONFIDENCE_LABEL[material?.confidence] || '',
        STATUS_LABEL[material?.status] || '',
        row.memo || ''
      ];
      lines.push(cols.map(csvEscape).join(','));
    });

    return lines.join('\n');
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) return `"${text.replaceAll('"', '""')}"`;
    return text;
  }

  function todayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function showStatus(message, isError = false) {
    els.statusMessage.textContent = message;
    els.statusMessage.style.color = isError ? '#9b3f3f' : '#36507d';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
})();
