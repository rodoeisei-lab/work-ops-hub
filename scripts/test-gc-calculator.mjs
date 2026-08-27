import fs from 'node:fs';

const master = JSON.parse(fs.readFileSync('data/gc-std-master.json', 'utf8'));
const favorites = JSON.parse(fs.readFileSync('data/gc-favorite-analytes.json', 'utf8'));
const aliases = JSON.parse(fs.readFileSync('data/gc-analyte-aliases.json', 'utf8'));
const calculator = fs.readFileSync('assets/js/gc-calculator.js', 'utf8');

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

console.log('GC calculator regression checks passed.');
