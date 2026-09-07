const FACTOR_DIGITS = 7;
const DEFAULT_OUTLIER_THRESHOLD = 0.15;

function formatFactor(value) {
  return Number(value).toFixed(FACTOR_DIGITS);
}

function formatArea(value) {
  if (!Number.isFinite(value)) return '-';
  return Math.round(value).toLocaleString('ja-JP');
}

function formatStd(value) {
  return Number.isFinite(Number(value)) ? `${Number(value)} ppm` : '-';
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function classifyGroup(rows, threshold) {
  const sorted = rows
    .map((row, index) => ({ ...row, _order: index }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a._order - b._order);

  const accepted = [];
  return sorted.map((record) => {
    const factor = Number(record.factor);
    const referenceMean = mean(accepted);
    const deviationRatio = referenceMean ? (factor - referenceMean) / referenceMean : null;

    let isOutlier = false;
    if (record.outlier === true) {
      isOutlier = true;
    } else if (record.outlier === false || referenceMean === null) {
      isOutlier = false;
    } else {
      isOutlier = Math.abs(deviationRatio) > threshold;
    }

    if (!isOutlier) accepted.push(factor);

    return { ...record, isOutlier, deviationRatio, referenceMean };
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
      column_label: rows[0].column_label || rows[0].column_id.toUpperCase(),
      temp_c: rows[0].temp_c,
      analyte: rows[0].analyte,
      std_ppm: stdPpm,
      representative,
      representative_area: Number.isFinite(stdPpm) && representative ? stdPpm / representative : null,
      total_count: rows.length,
      accepted_count: accepted.length,
      outlier_count: rows.length - accepted.length,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null
    };
  });
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

function renderSummary(records, threshold) {
  const groups = summarize(records, threshold).sort((a, b) =>
    a.column_label.localeCompare(b.column_label, 'ja') ||
    a.temp_c - b.temp_c ||
    a.analyte.localeCompare(b.analyte, 'ja')
  );

  const tbody = document.getElementById('factor-summary-body');
  document.getElementById('summary-empty').hidden = groups.length !== 0;
  document.getElementById('summary-count').textContent = `${groups.length}条件`;

  tbody.innerHTML = groups.map((group) => `
    <tr>
      <td>${group.column_label}</td>
      <td>${group.temp_c}℃</td>
      <td>${group.analyte}</td>
      <td>${formatStd(group.std_ppm)}</td>
      <td class="number"><strong>${formatFactor(group.representative)}</strong></td>
      <td class="number"><strong>${formatArea(group.representative_area)}</strong></td>
      <td>${group.accepted_count}/${group.total_count}</td>
      <td>${group.outlier_count ? `<span class="factor-badge outlier">${group.outlier_count}件</span>` : '0件'}</td>
      <td class="number">${group.min === null ? '-' : `${formatFactor(group.min)} ～ ${formatFactor(group.max)}`}</td>
    </tr>
  `).join('');
}

function renderRecords(records, threshold) {
  const rows = groupedClassifiedRecords(records, threshold)
    .flat()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.analyte.localeCompare(b.analyte, 'ja'));

  const tbody = document.getElementById('factor-record-body');
  document.getElementById('record-empty').hidden = rows.length !== 0;

  tbody.innerHTML = rows.map((record) => {
    const area = Number(record.std_ppm) / Number(record.factor);
    const deviation = record.deviationRatio === null
      ? '基準'
      : `${record.deviationRatio >= 0 ? '+' : ''}${(record.deviationRatio * 100).toFixed(1)}%`;
    const status = record.isOutlier
      ? '<span class="factor-badge outlier">外れ値</span>'
      : '<span class="factor-badge ok">採用</span>';

    return `
      <tr class="${record.isOutlier ? 'outlier' : ''}">
        <td>${record.date}</td>
        <td>${record.column_label || record.column_id.toUpperCase()}</td>
        <td>${record.temp_c}℃</td>
        <td>${record.analyte}</td>
        <td>${formatStd(record.std_ppm)}</td>
        <td class="number">${formatFactor(record.factor)}</td>
        <td class="number">${formatArea(area)}</td>
        <td>${status}</td>
        <td>${deviation}</td>
      </tr>`;
  }).join('');
}

function render(records, threshold) {
  const filtered = filteredRecords(records);
  renderSummary(filtered, threshold);
  renderRecords(filtered, threshold);
}

async function init() {
  const response = await fetch('./data/gc-factor-library.json');
  if (!response.ok) throw new Error(`係数データを読み込めませんでした: ${response.status}`);
  const data = await response.json();
  const threshold = Number(data.outlier_threshold_ratio) || DEFAULT_OUTLIER_THRESHOLD;
  const records = data.records.filter((record) => record.machine_id === 'gc2014');

  renderFilters(records);
  render(records, threshold);

  ['filter-column', 'filter-temp', 'filter-analyte'].forEach((id) => {
    document.getElementById(id).addEventListener(id === 'filter-analyte' ? 'input' : 'change', () => render(records, threshold));
  });

  document.getElementById('filter-reset').addEventListener('click', () => {
    document.getElementById('filter-column').value = '';
    document.getElementById('filter-temp').value = '';
    document.getElementById('filter-analyte').value = '';
    render(records, threshold);
  });
}

init().catch((error) => {
  document.getElementById('load-error').textContent = error.message;
});
