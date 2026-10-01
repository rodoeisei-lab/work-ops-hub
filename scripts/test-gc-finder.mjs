import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync('assets/js/gc-finder.js', 'utf8');
const storageFunctions = source.slice(source.indexOf('  function saveChosenMethod('), source.indexOf('  function loadChosenMethodMemos()'));
const previous = [{ savedAt: '2026-09-01', analytes: ['既存メモ'], machine: 'GC2014' }];
const state = { chosenMethodMemos: previous, selectedAnalytes: new Map([['acetone', { label: 'アセトン' }]]) };
const status = { textContent: '', classList: { add() {}, remove() {} } };
let saved;
let blocked = false;
const context = {
  state, document: { getElementById: () => status }, el: { selectedMethodMemo: {} },
  window: {}, getTempProgramDisplay: () => '90℃', renderChosenMethodMemos() {},
  localStorage: { setItem(key, value) { if (blocked) throw Error('storage blocked'); saved = { key, value }; } }
};
const { saveChosenMethod, persistChosenMethodMemos } = vm.runInNewContext(storageFunctions + '\n({saveChosenMethod,persistChosenMethodMemos})', context);
saveChosenMethod({ method: { machine: { name: 'GC-14B' }, column: { name: 'SBS' } }, analysisTime: 0.97, confidenceLabel: '高' });
assert.equal(saved.key, 'gc_selected_method_memos');
assert.equal(JSON.parse(saved.value)[0].machine, 'GC-14B');
assert.equal(JSON.parse(saved.value)[1].analytes[0], '既存メモ');
assert.equal(state.chosenMethodMemos.length, 2);
const savedState = state.chosenMethodMemos;
blocked = true;
assert.equal(persistChosenMethodMemos([], 'deleted'), false);
assert.equal(state.chosenMethodMemos, savedState);
assert.ok(status.textContent.includes('変更されていません'));
blocked = false;
assert.equal(persistChosenMethodMemos(previous, 'deleted'), true);
assert.equal(JSON.parse(saved.value).length, 1);

const rendering = source.slice(source.indexOf('  function renderRecommendations()'), source.indexOf('  function showMethodDetails('));
const recommendations = { innerHTML: '' };
const renderRecommendations = vm.runInNewContext(rendering + '\nrenderRecommendations', {
  state: { ranked: [], selectedAnalytes: new Map([['acetone', { known: true }]]), lastFilterReport: { excludedByAnalysisTime: 3 } },
  el: { machineFilter: { value: '' }, columnFilter: { value: '' }, tempFilter: { value: '' }, recommendations },
  updateAnalysisTimeFilterStatus() {}, clearDetails() {}, showWarning() {}, escapeHtml: text => text
});
renderRecommendations();
assert.ok(recommendations.innerHTML.includes('分析時間上限で除外'));
assert.ok(!recommendations.innerHTML.includes('RTデータなし'));
console.log('GC finder production memo preservation/storage-error and empty-result explanation checks passed.');
