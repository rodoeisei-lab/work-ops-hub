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
  'gc-calculator.css?v=20260827-ios-input-scroll-1'
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
  '.scroll-hint',
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
  'row.sampleAreaInput = \'\'',
  'activeMaterialName',
  'メモ: ${row.memo}',
  'setActiveRowForInput',
  'syncActiveRowUi',
  "root.addEventListener('focusout'"
]) {
  if (!calculator.includes(required)) {
    throw new Error(`GC calculator interaction marker missing: ${required}`);
  }
}

if (!calculatorHtml.includes('横にスワイプして続きを表示')) {
  throw new Error('GC calculator scroll affordance text missing');
}

for (const forbidden of [
  "const selected = new Set(state.rows.map",
  "row.stdManual = true;\n    });\n    state.customMaterials",
  "root.addEventListener('pointerdown', () => setActiveRow(rowId)"
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

console.log('GC calculator regression, UI, safety, and iOS input checks passed.');
