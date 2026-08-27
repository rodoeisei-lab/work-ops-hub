import fs from 'node:fs';

const master = JSON.parse(fs.readFileSync('data/gc-std-master.json', 'utf8'));
const favorites = JSON.parse(fs.readFileSync('data/gc-favorite-analytes.json', 'utf8'));
const aliases = JSON.parse(fs.readFileSync('data/gc-analyte-aliases.json', 'utf8'));
const calculator = fs.readFileSync('assets/js/gc-calculator.js', 'utf8');
const calculatorHtml = fs.readFileSync('gc-calculator.html', 'utf8');
const calculatorCss = fs.readFileSync('assets/css/gc-calculator.css', 'utf8');

const normalize = (value) => String(value || '').trim().toLowerCase();
const lookup = new Map();
for (const item of master) {
  for (const key of [item.display_name, item.normalized_name, item.raw_label, ...(item.aliases || [])]) {
    if (key) lookup.set(normalize(key), item);
  }
}

function resolveFavorite(entry) {
  const normalizedName = String(entry?.normalized_name || '');
  const candidates = [
    entry?.display_name,
    normalizedName,
    ...(Array.isArray(aliases[normalizedName]) ? aliases[normalizedName] : [])
  ].filter(Boolean);
  return candidates.map((candidate) => lookup.get(normalize(candidate))).find(Boolean);
}

for (const group of ['common', 'liquid_standard']) {
  for (const entry of favorites[group] || []) {
    if (!resolveFavorite(entry)) {
      throw new Error(`Favorite does not resolve: ${group} / ${entry.display_name || entry.normalized_name}`);
    }
  }
}

for (const item of master) {
  if (item.std_value !== null && item.std_value !== undefined && Number(item.std_value) <= 0) {
    throw new Error(`STD must be positive: ${item.display_name}`);
  }
}

if (!master.some((item) => item.display_name === '酢酸ブチル')) {
  throw new Error('酢酸ブチル must exist in GC STD master');
}

const stdExpectations = new Map([
  ['酢酸ブチル', 15],
  ['シクロヘキサノン', 25.5]
]);
for (const [name, expected] of stdExpectations) {
  const item = master.find((row) => row.display_name === name);
  if (!item || Number(item.std_value) !== expected || item.status !== 'confirmed') {
    throw new Error(`${name} STD must be confirmed at ${expected}`);
  }
}
if (master.some((item) => item.display_name === 'シクロヘキサン')) {
  throw new Error('シクロヘキサン must not exist in GC STD master');
}
if ((favorites.liquid_standard || []).some((item) => item.display_name === 'シクロヘキサン' || item.normalized_name === 'cyclohexane')) {
  throw new Error('シクロヘキサン must not exist in GC favorites');
}
if (Object.prototype.hasOwnProperty.call(aliases, 'cyclohexane')) {
  throw new Error('cyclohexane alias mapping must be removed');
}
const display = JSON.parse(fs.readFileSync('data/gc-analyte-display.json', 'utf8'));
if (Object.prototype.hasOwnProperty.call(display, 'cyclohexane')) {
  throw new Error('cyclohexane display mapping must be removed');
}
if (calculator.includes("'シクロヘキサン'")) {
  throw new Error('シクロヘキサン must not remain in calculator target lists');
}

for (const required of [
  'std.value <= 0',
  'stdArea.value <= 0',
  'sample.value < 0',
  'els.copyTextOutput.value = buildCopyText();',
  'findMaterialsFromFavoriteEntries'
]) {
  if (!calculator.includes(required)) {
    throw new Error(`GC regression guard missing: ${required}`);
  }
}

for (const required of [
  'id="activeCardLabel"',
  'class="primary action-primary"',
  'class="card section-block copy-preview-block',
  'gc-calculator.css?v=20260827-numbered-samples-1'
]) {
  if (!calculatorHtml.includes(required)) {
    throw new Error(`GC calculator UI marker missing: ${required}`);
  }
}

for (const required of [
  '.calc-row.is-active',
  'grid-template-areas:',
  '.result-primary',
  '.quick-chips--grid',
  '.action-primary.is-copied'
]) {
  if (!calculatorCss.includes(required)) {
    throw new Error(`GC calculator CSS marker missing: ${required}`);
  }
}

for (const required of [
  'syncActiveRowState',
  'setActiveRow',
  "calc.coefficientText || '—'",
  'showCopySuccess',
  'resetCopyButton',
  'rowHasContent',
  '入力内容も削除されます',
  'clearAreaInputs',
  'validateOutputRows',
  'focusRow',
  '正式な物質名を使用してください',
  'row.stdAreaInput = \'\'',
  'activeMaterialName',
  'setActiveRowForInput',
  'syncActiveRowUi',
  "root.addEventListener('focusout'",
  'createEmptySample',
  'normalizeSamples',
  'renderSamples',
  'bindSampleEvents',
  'refreshSamples',
  "row.samples.push(createEmptySample())",
  'sample-ppm-output',
  'すでに当日STD登録済みです',
  '当日STDエリア',
]) {
  if (!calculator.includes(required)) {
    throw new Error(`GC calculator interaction marker missing: ${required}`);
  }
}

for (const required of [
  'STD・検体',
  '当日STD 1',
  '＋ 物質',
  'GC計算'
]) {
  if (!calculatorHtml.includes(required)) {
    throw new Error(`GC daily STD / multi-sample UI marker missing: ${required}`);
  }
}
if (!calculator.includes('＋ 検体')) {
  throw new Error('GC compact sample-add label missing');
}
for (const required of [
  '.samples-block',
  '.sample-row',
  '.sample-ppm-field',
  '.add-sample-btn',
  '.version-line'
]) {
  if (!calculatorCss.includes(required)) {
    throw new Error(`GC multi-sample CSS marker missing: ${required}`);
  }
}

for (const forbiddenHtml of [
  'page-header__lead',
  'calc-steps',
  'formula-strip',
  '横にスワイプして続きを表示',
  '複数の検体エリアを同じ係数でまとめて計算します'
]) {
  if (calculatorHtml.includes(forbiddenHtml)) {
    throw new Error(`GC large/simple UI guard failed: ${forbiddenHtml}`);
  }
}

const compactBlock = calculatorCss.split('/* 20260827 compact-grid: 横スクロール廃止・縦方向を圧縮 */')[1] || '';
for (const requiredCss of [
  'grid-template-columns:repeat(4,minmax(0,1fr));',
  'overflow:visible;',
  'height:36px;',
  'grid-template-areas:"index label area ppm delete";',
  '.status-message:empty { display:none; }'
]) {
  if (!compactBlock.includes(requiredCss)) {
    throw new Error(`GC compact UI marker missing: ${requiredCss}`);
  }
}
if (compactBlock.includes('overflow-x:auto')) {
  throw new Error('GC compact UI must not use horizontal chip scrolling');
}

const numberedSampleBlock = calculatorCss.split('/* numbered samples: 検体名入力なし */')[1] || '';
for (const requiredCss of [
  'grid-template-areas:"index area ppm delete";',
  'grid-template-columns:32px minmax(0,1fr) 68px 28px;'
]) {
  if (!numberedSampleBlock.includes(requiredCss)) {
    throw new Error('GC numbered samples CSS marker missing: ' + requiredCss);
  }
}
for (const requiredJs of [
  '<div class="sample-index">${index + 1}</div>',
  'String(index + 1)',
  'parts.push(`${index + 1}: エリア'
]) {
  if (!calculator.includes(requiredJs)) {
    throw new Error('GC numbered samples JS marker missing: ' + requiredJs);
  }
}


for (const forbidden of [
  "const selected = new Set(state.rows.map",
  "row.stdManual = true;\n    });\n    state.customMaterials",
  "root.addEventListener('pointerdown', () => setActiveRow(rowId)",
  'class="ppm-field result-field result-primary"',
  'class="memo-input"'
  'sample-label-input',
  'sample-label-field',
  '例：試料A',
  'sample.label'
]) {
  if (calculator.includes(forbidden)) {
    throw new Error(`GC calculator unsafe legacy pattern remains: ${forbidden}`);
  }
}

const updateViewBlock = calculator.match(/function updateRowComputedView\([\s\S]*?\n  }\n\n  function resolveMaterial/)?.[0] || '';
if (!updateViewBlock.includes('if (rerenderHead) syncActiveRowUi();')) {
  throw new Error('Input-time upper UI mutation guard is missing');
}
if (updateViewBlock.includes('syncFavoriteChipState();\n    syncActiveRowState();')) {
  throw new Error('Input-time upper UI mutation remains');
}

console.log('GC calculator regression, UI, safety, iOS input, and multi-sample checks passed.');
