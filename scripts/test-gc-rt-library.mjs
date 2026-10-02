import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import model from '../assets/js/gc-rt-model.js';
const rows = JSON.parse(fs.readFileSync('data/gc-rt-library.json','utf8'));
const temps = JSON.parse(fs.readFileSync('data/gc-temp-programs.json','utf8'));
const fixtures = [
  ['120c',30,'acetone:1.787 methanol:1.844 ethyl_acetate:1.845 IPA:1.861 MEK:1.887 dcm:1.906 toluene:2.228 butyl_acetate:2.237 isobutanol:2.244 1-butanol:2.448 ethylbenzene:2.565 p-xylene:2.605 o-xylene:2.910 styrene:3.436 cyclohexanone:3.935 ブチセロ:5.074'],
  ['90c_2',30,'n-ヘキサン:1.695 acetone:1.960 ethyl_acetate:2.101 methanol:2.128 MEK:2.169 IPA:2.181 MIBK:2.667 toluene:2.961 isobutyl_acetate:2.982 butyl_acetate:3.119 isobutanol:3.219 1-butanol:3.862 ethylbenzene:3.878 p-xylene:3.990 o-xylene:4.809 セロアセ:7.155 ブチセロ:12.299'],
  ['80c',30,'n-ヘキサン:1.705 acetone:2.033 ethyl_acetate:2.247 methanol:2.288 MEK:2.340 IPA:2.378 cyclohexane:2.474 MIBK:3.012 toluene:3.443 SBT:3.713 isobutanol:3.847 ethylbenzene:4.718 1-butanol:4.801 p-xylene:4.877 o-xylene:6.070'],
  ['70c_isothermal',30,'n-ヘキサン:1.705 acetone:2.171 ethyl_acetate:2.458 methanol:2.552 MEK:2.575 IPA:2.689 dcm:2.809 isobutyl_acetate:3.602 toluene:4.149 butyl_acetate:4.618 ethylbenzene:6.061 p-xylene:6.282 1-butanol:6.421 o-xylene:8.077'],
  ['60c',30,'n-ヘキサン:1.750 ethyl_acetate:2.812 MEK:2.966 methanol:2.973 toluene:5.260'],
  ['50c_gc2014',25,'n-ヘキサン:2.121 MEK:4.085 methanol:4.165'],
  ['90c_15',15,'n-ヘキサン:3.319 ethyl_acetate:4.135 methanol:4.192 MEK:4.287 MIBK:5.265 toluene:5.885 isobutanol:6.324 ethylbenzene:7.673 p-xylene:7.875 o-xylene:9.515'],
  ['82c',20,'n-ヘキサン:2.501 ethyl_acetate:3.272']
];
let numericChecks = 0;
for (const [temp, velocity, expected] of fixtures) {
  const actual = rows.filter(r => r.measurement_type === 'measured' && r.machine_id === 'gc2014' && r.column_id === 'cbp' && r.temp_program_id === temp && r.linear_velocity_cm_s === velocity);
  assert.equal(actual.length, expected.split(' ').length, temp);
  for (const entry of expected.split(' ')) {
    const [id,value] = entry.split(':');
    const row = actual.find(r => r.analyte_normalized === id);
    assert.ok(row, `${temp} ${id} missing`);
    assert.equal(row.rt_min, Number(value), `${temp} ${id}`);
    assert.equal(row.measurement_type, 'measured'); numericChecks++;
  }
}
const unique = new Set();
for (const r of rows) {
  assert.ok(Number.isFinite(r.rt_min) && r.rt_min > 0);
  assert.ok(temps.some(t => t.id === r.temp_program_id));
  assert.ok(['measured','estimated'].includes(r.measurement_type));
  assert.ok(r.row_id && r.source);
  const key = model.conditionKey(r) + '__' + r.analyte_normalized;
  assert.ok(!unique.has(key), `duplicate ${key}`); unique.add(key);
  if (r.source.startsWith('photo:')) assert.equal(r.measured_date, null);
}
assert.ok(rows.filter(r => r.verification_status === 'legacy_unreviewed').every(r => r.linear_velocity_cm_s === null && r.split_ratio === null));
assert.equal(rows.find(r => r.analyte_normalized === 'SBT').name_status, 'unresolved');
assert.ok(!rows.some(r => r.machine_id === 'gc2014' && r.temp_program_id === '90c_2' && [2.153,2.959].includes(r.rt_min)));
assert.equal(JSON.parse(fs.readFileSync('data/gc-rt-quarantine.json')).length, 2);
const predictions = rows.filter(r => r.measurement_type === 'estimated');
assert.equal(predictions.length, 58);
assert.deepEqual(predictions.map(({row_id,...r}) => r), model.estimateMissingRts(rows));
const atBasic = predictions.filter(r => r.temp_program_id === '82c' && r.linear_velocity_cm_s === 19);
assert.equal(atBasic.length,17);
assert.equal(atBasic.find(r => r.analyte_normalized === 'n-ヘキサン').rt_min, 2.633);
assert.equal(atBasic.find(r => r.analyte_normalized === 'ethyl_acetate').rt_min, 3.444);
for (const r of predictions) {
  assert.equal(r.measured_date,null); assert.equal(r.certainty,'low');
  assert.ok(Number.isFinite(r.temperature_c) && Number.isFinite(r.linear_velocity_cm_s));
  assert.ok(r.prediction.source_row_ids.length && r.prediction.source_row_ids.every(id => rows.some(s => s.row_id === id && s.measurement_type === 'measured' && s.machine_id === r.machine_id && s.column_id === r.column_id && ['verified_photo','user_confirmed'].includes(s.verification_status))));
  assert.ok(!['SBT','cyclohexane','styrene','cyclohexanone'].includes(r.analyte_normalized));
}
const p = atBasic[0];
const measured = {...p,measurement_type:'measured',rt_min:2.7};
assert.equal(model.preferMeasured([p,measured], true)[0].rt_min,2.7);
assert.equal(model.preferMeasured([measured,p], true)[0].rt_min,2.7);
assert.equal(model.preferMeasured(predictions).length,0);
assert.ok(!model.estimate82At19([...rows,measured]).some(r => r.analyte_normalized === p.analyte_normalized));
assert.equal(model.velocityKey({linear_velocity_cm_s:null}),'unknown');
assert.notEqual(model.conditionKey({...p,linear_velocity_cm_s:15}),model.conditionKey({...p,linear_velocity_cm_s:30}));
const pairs = model.nearPairs(rows.filter(r => r.temp_program_id === '80c' && r.machine_id === 'gc2014'));
assert.equal(pairs.find(p => p.first.analyte_normalized === 'ethyl_acetate' && p.second.analyte_normalized === 'methanol').gap,0.041);
assert.ok(model.nearPairs([{...measured,rt_min:2},{...measured,analyte_normalized:'second',linear_velocity_cm_s:20,rt_min:2.01}]).length === 0);
// Validate production finder grouping/normalization: speed changes must stay separate
// and predictions must not leak into automatic recommendations or day planning.
const finder = fs.readFileSync('assets/js/gc-finder.js','utf8');
const normalizeFn = finder.slice(finder.indexOf('  function normalizeRtLibrary('),finder.indexOf('  function validateRtLibrary('));
const methodsFn = finder.slice(finder.indexOf('  function buildMethods('),finder.indexOf('  async function fetchJson('));
const funcs = vm.runInNewContext(normalizeFn + methodsFn + '\n({normalizeRtLibrary,buildMethods})',{window:{GcRtModel:model},normalizeName:s=>String(s).toLowerCase()});
const normalized = funcs.normalizeRtLibrary(rows,new Map());
assert.ok(normalized.every(r => r.measurement_type === 'measured' && r.analyte_normalized !== 'SBT'));
const methods = funcs.buildMethods([],[],temps,normalized);
const at90 = methods.filter(m => m.machine === undefined && m.records[0].machine_id === 'gc2014' && m.records[0].temperature_c !== 82 && ['90c_2','90c_15'].includes(m.records[0].temp_program_id));
assert.equal(at90.length,2);
assert.ok(at90.every(m => new Set(m.records.map(r => r.linear_velocity_cm_s)).size === 1));
const at82 = methods.filter(m => m.records[0].temp_program_id === '82c');
assert.equal(at82.length,1); assert.equal(at82[0].records[0].linear_velocity_cm_s,20);
assert.ok(at82[0].tempProgram.display_name.includes('20 cm/s'));
const day = fs.readFileSync('assets/js/gc-day-plan.js','utf8');
assert.ok(day.includes('window.GcRtModel.planningRows'));
assert.ok(day.includes('window.GcRtModel.conditionKey'));
console.log(`RT library: ${numericChecks} exact measured values, ${predictions.length} reproducible predictions, condition isolation, real-measurement priority, near pairs, quarantine and production finder/day-plan guards passed.`);
