const FACTOR_DIGITS = 7;
const DEFAULT_OUTLIER_THRESHOLD = 0.15;
const MIN_RECORDS_FOR_OUTLIER_CHECK = 3;
let quickCalcGroups = [];
let stdMasterMap = new Map();

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeStdKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function buildStdMasterMap(rows) {
  stdMasterMap = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const stdValue = Number(row?.std_value);
    if (!Number.isFinite(stdValue)) return;
    const keys = [
      row?.display_name,
      row?.normalized_name,
      row?.raw_label,
      ...(Array.isArray(row?.aliases) ? row.aliases : [])
    ];
    keys.forEach((key) => {
      const normalized = normalizeStdKey(key);
      if (normalized) stdMasterMap.set(normalized, stdValue);
    });
  });
}

function applyMasterStd(records) {
  return records.map((record) => {
    const masterStd = stdMasterMap.get(normalizeStdKey(record.analyte));
    return Number.isFinite(masterStd) ? { ...record, std_ppm: masterStd } : record;
  });
}

function formatFactor(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(FACTOR_DIGITS) : '-';
}

function formatArea(value) {
  if (!Number.isFinite(value)) return '-';
  return Math.round(value).toLocaleString('ja-JP');
}

function formatStd(value) {
  return Number.isFinite(Number(value)) ? `${Number(value)} ppm` : '-';
}

function formatPpm(value) {
  if (!Number.isFinite(value)) return '—';
  return Number(value.toFixed(2)).toString();
}

function parseArea(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { empty: true, valid: true, value: null };
  const value = Number(text.replace(/,/g, ''));
  return { empty: false, valid: Number.isFinite(value), value };
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function classifyGroup(rows, threshold) {
  const sorted = rows
    .map((row, index) => ({ ...row, _order: index }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a._order - b._order);

  const provisional = sorted.length < MIN_RECORDS_FOR_OUTLIER_CHECK;
  const medianCandidates = sorted
    .filter((record) => record.outlier !== true)
    .map((record) => Number(record.factor))
    .filter(Number.isFinite);
  const referenceMedian = median(medianCandidates);

  return sorted.map((record) => {
    const factor = Number(record.factor);
    const deviationRatio = referenceMedian ? (factor - referenceMedian) / referenceMedian : null;

    let isOutlier = false;
    if (!provisional) {
      if (record.outlier === true) {
        isOutlier = true;
      } else if (record.outlier === false) {
        isOutlier = false;
      } else {
        isOutlier = Math.abs(deviationRatio ?? 0) > threshold;
      }
    }

    return {
      ...record,
      isOutlier,
      isProvisional: provisional,
      deviationRatio,
      referenceMedian
    };
  });
}

function groupedClassifiedRecords(records, threshold) {
  const groups = new Map();
  records.forEach((record) => {
    const key = [record.column_id, record.temp_c, record.analyte].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  return [...groups.values()].map((rows) => classifyGroup(rows, threshold));
}

function summarize(records, threshold) {
  return groupedClassifiedRecords(records, threshold).map((rows) => {
    const accepted = rows.filter((row) => !row.isOutlier);
    const values = accepted.map((row) => Number(row.factor));
    const representative = mean(values);
    const stdPpm = Number(accepted.at(-1)?.std_ppm ?? rows.at(-1)?.std_ppm);
    return {
      key: [rows[0].column_id, rows[0].temp_c, rows[0].analyte].join('|'),
      column_id: rows[0].column_id,
      column_label: rows[0].column_label || rows[0].column_id.toUpperCase(),
      temp_c: rows[0].temp_c,
      analyte: rows[0].analyte,
      std_ppm: stdPpm,
      representative,
      representative_area: Number.isFinite(stdPpm) && representative ? stdPpm / representative : null,
      total_count: rows.length,
      accepted_count: accepted.length,
      outlier_count: rows.length - accepted.length,
      provisional: rows.length < MIN_RECORDS_FOR_OUTLIER_CHECK,
      reference_median: rows[0]?.referenceMedian ?? null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null
    };
  });
}

function sortedSummaries(records, threshold) {
  return summarize(records, threshold).sort((a, b) =>
    a.column_label.localeCompare(b.column_label, 'ja') ||
    a.temp_c - b.temp_c ||
    a.analyte.localeCompare(b.analyte, 'ja')
  );
}

function uniqueSorted(values, numeric = false) {
  return [...new Set(values)].sort(numeric ? ((a, b) => a - b) : ((a, b) => String(a).localeCompare(String(b), 'ja')));
}

function renderFilters(records) {
  const columnSelect = document.getElementById('filter-column');
  const tempSelect = document.getElementById('filter-temp');

  uniqueSorted(records.map((r) => r.column_id)).forEach((columnId) => {
    const sample = records.find((r) => r.column_id === columnId);
    const option = document.createElement('option');
    option.value = columnId;
    option.textContent = sample?.column_label || columnId.toUpperCase();
    columnSelect.appendChild(option);
  });

  uniqueSorted(records.map((r) => r.temp_c), true).forEach((temp) => {
    const option = document.createElement('option');
    option.value = String(temp);
    option.textContent = `${temp}℃`;
    tempSelect.appendChild(option);
  });
}

function filteredRecords(records) {
  const column = document.getElementById('filter-column').value;
  const temp = document.getElementById('filter-temp').value;
  const analyte = document.getElementById('filter-analyte').value.trim().toLowerCase();

  return records.filter((record) => {
    if (column && record.column_id !== column) return false;
    if (temp && String(record.temp_c) !== temp) return false;
    if (analyte && !record.analyte.toLowerCase().includes(analyte)) return false;
    return true;
  });
}

function renderQuickCalculator(records, threshold) {
  quickCalcGroups = sortedSummaries(records, threshold).filter((group) => Number.isFinite(group.representative));
  const select = document.getElementById('calc-group');

  select.innerHTML = '<option value="">選択してください</option>' + quickCalcGroups.map((group) =>
    `<option value="${escapeHtml(group.key)}">${escapeHtml(group.analyte)}（${escapeHtml(group.column_label)}・${group.temp_c}℃）</option>`
  ).join('');

  select.value = '';
  updateQuickCalculation();
}

function clearQuickSample() {
  const input = document.getElementById('calc-sample-area');
  input.value = '';
}

function handleCalcGroupChange() {
  clearQuickSample();
  updateQuickCalculation();
}

function useGroupInCalculator(groupKey) {
  const select = document.getElementById('calc-group');
  if (!quickCalcGroups.some((group) => group.key === groupKey)) return;
  select.value = groupKey;
  clearQuickSample();
  updateQuickCalculation();
  document.querySelector('.factor-calc-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => document.getElementById('calc-sample-area')?.focus({ preventScroll: true }), 350);
}

function updateQuickCalculation() {
  const selectedKey = document.getElementById('calc-group').value;
  const areaInput = document.getElementById('calc-sample-area');
  const factorHost = document.getElementById('calc-factor');
  const metaHost = document.getElementById('calc-factor-meta');
  const ppmHost = document.getElementById('calc-ppm');
  const messageHost = document.getElementById('calc-message');
  const group = quickCalcGroups.find((item) => item.key === selectedKey);

  if (!group) {
    factorHost.textContent = '—';
    metaHost.textContent = '';
    ppmHost.textContent = '—';
    messageHost.textContent = '物質・条件を選択してください。';
    return;
  }

  factorHost.textContent = formatFactor(group.representative);
  metaHost.textContent = group.provisional
    ? `暫定 ${group.total_count}件`
    : `採用 ${group.accepted_count}/${group.total_count}件${group.outlier_count ? `・外れ値 ${group.outlier_count}件` : ''}`;

  const area = parseArea(areaInput.value);
  if (!area.valid) {
    ppmHost.textContent = '—';
    messageHost.textContent = '検体エリアは数値で入力してください。';
    return;
  }
  if (area.empty) {
    ppmHost.textContent = '—';
    messageHost.textContent = '検体エリアを入力すると自動計算します。';
    return;
  }
  if (area.value < 0) {
    ppmHost.textContent = '—';
    messageHost.textContent = '検体エリアには0以上の数値を入力してください。';
    return;
  }

  const ppm = area.value * group.representative;
  ppmHost.textContent = formatPpm(ppm);
  messageHost.textContent = `${area.value.toLocaleString('ja-JP')} × ${formatFactor(group.representative)} = ${formatPpm(ppm)} ppm`;
}

function renderSummary(records, threshold) {
  const groups = sortedSummaries(records, threshold);
  const tbody = document.getElementById('factor-summary-body');
  const cards = document.getElementById('factor-summary-cards');
  document.getElementById('summary-empty').hidden = groups.length !== 0;
  document.getElementById('summary-count').textContent = `${groups.length}条件`;

  tbody.innerHTML = groups.map((group) => `
    <tr>
      <td>${escapeHtml(group.column_label)}</td>
      <td>${group.temp_c}℃</td>
      <td>${escapeHtml(group.analyte)}</td>
      <td>${formatStd(group.std_ppm)}</td>
      <td class="number"><strong>${formatFactor(group.representative)}</strong></td>
      <td class="number"><strong>${formatArea(group.representative_area)}</strong></td>
      <td>${group.provisional ? `暫定 ${group.total_count}件` : `${group.accepted_count}/${group.total_count}`}</td>
      <td>${group.provisional ? '—' : (group.outlier_count ? `<span class="factor-badge outlier">${group.outlier_count}件</span>` : '0件')}</td>
      <td class="number">${group.min === null ? '-' : `${formatFactor(group.min)} ～ ${formatFactor(group.max)}`}</td>
    </tr>
  `).join('');

  cards.innerHTML = groups.map((group) => `
    <article class="factor-mobile-card">
      <div class="factor-mobile-card-head">
        <div class="factor-mobile-card-title">
          <strong>${escapeHtml(group.analyte)}</strong>
          <span>${escapeHtml(group.column_label)}・${group.temp_c}℃</span>
        </div>
        ${group.provisional
          ? '<span class="factor-badge ok">暫定</span>'
          : (group.outlier_count ? `<span class="factor-badge outlier">外れ値 ${group.outlier_count}</span>` : '<span class="factor-badge ok">採用</span>')}
      </div>
      <div class="factor-mobile-factor">
        <div class="factor-mobile-metric">
          <span>代表係数</span>
          <strong>${formatFactor(group.representative)}</strong>
        </div>
        <div class="factor-mobile-metric">
          <span>換算面積</span>
          <strong>${formatArea(group.representative_area)}</strong>
        </div>
      </div>
      <div class="factor-mobile-meta">
        <span>STD ${formatStd(group.std_ppm)}</span>
        <span>${group.provisional ? `暫定 ${group.total_count}件` : `採用 ${group.accepted_count}/${group.total_count}件`}</span>
        <span>範囲 ${group.min === null ? '-' : `${formatFactor(group.min)}～${formatFactor(group.max)}`}</span>
      </div>
      <button class="factor-use-btn" type="button" data-group-key="${escapeHtml(group.key)}">この係数で計算</button>
    </article>
  `).join('');
}

function renderRecords(records, threshold) {
  const rows = groupedClassifiedRecords(records, threshold)
    .flat()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.analyte.localeCompare(b.analyte, 'ja'));

  const tbody = document.getElementById('factor-record-body');
  const cards = document.getElementById('factor-record-cards');
  document.getElementById('record-empty').hidden = rows.length !== 0;

  tbody.innerHTML = rows.map((record) => {
    const area = Number(record.std_ppm) / Number(record.factor);
    const deviation = record.isProvisional
      ? '暫定'
      : (record.deviationRatio === null
        ? '基準'
        : `${record.deviationRatio >= 0 ? '+' : ''}${(record.deviationRatio * 100).toFixed(1)}%`);
    const status = record.isProvisional
      ? '<span class="factor-badge ok">暫定</span>'
      : (record.isOutlier
        ? '<span class="factor-badge outlier">外れ値</span>'
        : '<span class="factor-badge ok">採用</span>');

    return `
      <tr class="${record.isOutlier ? 'outlier' : ''}">
        <td>${escapeHtml(record.date)}</td>
        <td>${escapeHtml(record.column_label || record.column_id.toUpperCase())}</td>
        <td>${record.temp_c}℃</td>
        <td>${escapeHtml(record.analyte)}</td>
        <td>${formatStd(record.std_ppm)}</td>
        <td class="number">${formatFactor(record.factor)}</td>
        <td class="number">${formatArea(area)}</td>
        <td>${status}</td>
        <td>${deviation}</td>
      </tr>`;
  }).join('');

  cards.innerHTML = rows.map((record) => {
    const area = Number(record.std_ppm) / Number(record.factor);
    const deviation = record.isProvisional
      ? '暫定'
      : (record.deviationRatio === null
        ? '基準'
        : `${record.deviationRatio >= 0 ? '+' : ''}${(record.deviationRatio * 100).toFixed(1)}%`);
    const badgeClass = record.isOutlier ? 'outlier' : 'ok';
    const badgeText = record.isProvisional ? '暫定' : (record.isOutlier ? '外れ値' : '採用');
    return `
      <article class="factor-mobile-card factor-mobile-history ${record.isOutlier ? 'outlier' : ''}">
        <div class="factor-mobile-card-head">
          <div class="factor-mobile-card-title">
            <strong>${escapeHtml(record.analyte)}</strong>
            <span>${escapeHtml(record.date)}・${escapeHtml(record.column_label || record.column_id.toUpperCase())}・${record.temp_c}℃</span>
          </div>
          <span class="factor-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="factor-mobile-factor">
          <div class="factor-mobile-metric">
            <span>係数</span>
            <strong>${formatFactor(record.factor)}</strong>
          </div>
          <div class="factor-mobile-metric">
            <span>換算面積</span>
            <strong>${formatArea(area)}</strong>
          </div>
        </div>
        <div class="factor-mobile-meta">
          <span>STD ${formatStd(record.std_ppm)}</span>
          <span>基準との差 ${deviation}</span>
        </div>
      </article>`;
  }).join('');
}

function renderFilteredData(records, threshold) {
  const filtered = filteredRecords(records);
  renderSummary(filtered, threshold);
  renderRecords(filtered, threshold);
}

async function init() {
  const [factorResponse, masterResponse] = await Promise.all([
    fetch('./data/gc-factor-library.json', { cache: 'no-cache' }),
    fetch('./data/gc-std-master.json', { cache: 'no-cache' })
  ]);

  if (!factorResponse.ok) throw new Error(`係数データを読み込めませんでした: ${factorResponse.status}`);
  if (!masterResponse.ok) throw new Error(`STDマスタを読み込めませんでした: ${masterResponse.status}`);

  const [data, stdMaster] = await Promise.all([
    factorResponse.json(),
    masterResponse.json()
  ]);

  buildStdMasterMap(stdMaster);
  const threshold = Number(data.outlier_threshold_ratio) || DEFAULT_OUTLIER_THRESHOLD;
  const records = applyMasterStd(data.records.filter((record) => record.machine_id === 'gc2014'));

  renderFilters(records);
  renderQuickCalculator(records, threshold);
  renderFilteredData(records, threshold);

  ['filter-column', 'filter-temp', 'filter-analyte'].forEach((id) => {
    document.getElementById(id).addEventListener(id === 'filter-analyte' ? 'input' : 'change', () => renderFilteredData(records, threshold));
  });

  document.getElementById('filter-reset').addEventListener('click', () => {
    document.getElementById('filter-column').value = '';
    document.getElementById('filter-temp').value = '';
    document.getElementById('filter-analyte').value = '';
    renderFilteredData(records, threshold);
  });

  document.getElementById('calc-group').addEventListener('change', handleCalcGroupChange);
  document.getElementById('calc-sample-area').addEventListener('input', updateQuickCalculation);
  document.getElementById('factor-summary-cards').addEventListener('click', (event) => {
    const button = event.target.closest('.factor-use-btn');
    if (!button) return;
    useGroupInCalculator(button.dataset.groupKey || '');
  });
}

init().catch((error) => {
  document.getElementById('load-error').textContent = error.message;
});
