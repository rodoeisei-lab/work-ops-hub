import fs from 'node:fs';
import assert from 'node:assert/strict';
import model from '../assets/js/gc-rt-model.js';

const rows = JSON.parse(fs.readFileSync('data/gc-rt-library.json','utf8'));
const measured = rows.filter(r => r.measurement_type === 'measured');
const predictions = rows.filter(r => r.measurement_type === 'estimated');
const round = x => Math.round(x*1000)/1000;
const pick = (temp,velocity,id) => predictions.find(r => r.temperature_c === temp && r.linear_velocity_cm_s === velocity && r.analyte_normalized === id);
const expectedCounts = [[50,25,2],[60,30,9],[70,30,2],[80,30,4],[82,20,15],[82,19,17],[90,30,1],[90,15,8],[120,30,0]];
for (const [temp,velocity,count] of expectedCounts) assert.equal(predictions.filter(r => r.temperature_c === temp && r.linear_velocity_cm_s === velocity).length,count,`${temp}/${velocity}`);

// Independent calculations from the photo fixtures, not the model's helpers.
assert.equal(pick(80,30,'butyl_acetate').rt_min,round(Math.sqrt(4.618*3.119)));
assert.equal(pick(80,30,'isobutyl_acetate').rt_min,round(Math.sqrt(3.602*2.982)));
assert.equal(pick(80,30,'dcm').rt_min,round(Math.exp(0.8*Math.log(2.809)+0.2*Math.log(1.906))));
assert.equal(pick(90,30,'dcm').rt_min,round(Math.exp(0.6*Math.log(2.809)+0.4*Math.log(1.906))));
assert.equal(pick(70,30,'MIBK').rt_min,round(3.012**2/2.667));
assert.equal(pick(120,30,'MIBK'),undefined);
assert.equal(pick(80,30,'ブチセロ').rt_min,round(Math.exp(4/3*Math.log(12.299)-1/3*Math.log(5.074))));
const velocityPairs = [[1.695,3.319],[2.101,4.135],[2.128,4.192],[2.169,4.287],[2.667,5.265],[2.961,5.885],[3.219,6.324],[3.878,7.673],[3.990,7.875],[4.809,9.515]];
const correction90 = Math.exp(velocityPairs.reduce((sum,[fast,slow]) => sum+Math.log(slow/(2*fast)),0)/velocityPairs.length);
assert.equal(pick(90,15,'acetone').rt_min,round(1.960*2*correction90));
assert.equal(pick(90,15,'セロアセ').rt_min,round(7.155*2*correction90));
assert.equal(pick(90,15,'ブチセロ').rt_min,round(12.299*2*correction90));
assert.equal(pick(82,19,'n-ヘキサン').rt_min,round(2.501*20/19));
assert.equal(pick(82,19,'ethyl_acetate').rt_min,round(3.272*20/19));
// The original thirteen 82/19 reference positions remain stable in v2.
for (const [id,rt] of Object.entries({'n-ヘキサン':2.633,ethyl_acetate:3.444,acetone:3.128,methanol:3.495,MEK:3.572,IPA:3.622,MIBK:4.556,toluene:5.177,isobutanol:5.753,ethylbenzene:7.030,'1-butanol':7.123,'p-xylene':7.260,'o-xylene':8.979})) assert.equal(pick(82,19,id).rt_min,rt,id);

assert.deepEqual(model.estimateMissingRts(rows),model.estimateMissingRts(measured));
assert.deepEqual(model.estimateMissingRts([...rows,{...predictions[0],rt_min:999,machine_id:'foreign',temp_program_id:'fake'}]),model.estimateMissingRts(measured));
assert.deepEqual(model.estimate82At19(rows),model.estimateMissingRts(rows).filter(r => r.temperature_c === 82 && r.linear_velocity_cm_s === 19));
const byId = new Map(measured.map(r => [r.row_id,r]));
for (const r of predictions) {
  const p = r.prediction;
  const sources = p.source_row_ids.map(id => byId.get(id));
  assert.ok(sources.every(s => s && s.name_status === 'confirmed' && s.machine_id === r.machine_id && s.column_id === r.column_id && Number.isFinite(s.temperature_c) && s.linear_velocity_cm_s > 0));
  assert.ok(!measured.some(s => s.machine_id === r.machine_id && s.column_id === r.column_id && s.temperature_c === r.temperature_c && s.linear_velocity_cm_s === r.linear_velocity_cm_s && s.analyte_normalized === r.analyte_normalized));
  assert.ok(p.temperature_range_c[1]-p.temperature_range_c[0] <= 50);
  assert.ok(p.extrapolation_c <= 10);
  if (p.temperature_mode !== 'same_temperature') assert.ok(new Set(sources.filter(s => s.analyte_normalized === r.analyte_normalized && s.linear_velocity_cm_s === p.base_velocity_cm_s).map(s => s.temperature_c)).size >= 2);
  if (p.temperature_mode === 'extrapolation') assert.ok(p.extrapolation_c > 0 && r.note.includes('外挿'));
}

// Refuse out-of-range extrapolation, missing velocity, single-point temperature
// fitting, unknown identities, unreviewed sources and cross-instrument borrowing.
const reference = measured.find(r => r.machine_id === 'gc2014' && r.analyte_normalized === 'MIBK');
const sample = (temperature_c,rt_min,extra={}) => ({...reference,temperature_c,rt_min,temp_program_id:`t${temperature_c}`,row_id:`m${temperature_c}`,...extra});
const target = (temperature_c,extra={}) => ({machine_id:'gc2014',column_id:'cbp',temperature_c,linear_velocity_cm_s:30,temp_program_id:`t${temperature_c}`,...extra});
const sampleRows = [sample(80,3.012),sample(90,2.667)];
assert.equal(model.estimateMissingRts(sampleRows,[target(100)]).filter(r => r.temperature_c === 100).length,1);
assert.equal(model.estimateMissingRts(sampleRows,[target(101)]).filter(r => r.temperature_c === 101).length,0);
assert.equal(model.estimateMissingRts(sampleRows,[target(120)]).filter(r => r.temperature_c === 120).length,0);
assert.equal(model.estimateMissingRts([sample(70,3),sample(121,2)],[target(90)]).filter(r => r.temperature_c === 90).length,0);
assert.equal(model.estimateMissingRts([sample(80,3.012)],[target(82)]).filter(r => r.temperature_c === 82).length,0);
assert.equal(model.estimateMissingRts([sample(80,3.012)],[target(80,{linear_velocity_cm_s:20})]).find(r => r.linear_velocity_cm_s === 20)?.rt_min,4.518);
for (const extra of [{linear_velocity_cm_s:null},{name_status:'unresolved'},{verification_status:'legacy_unreviewed'},{machine_id:'foreign'},{column_id:'foreign'}]) assert.equal(model.estimateMissingRts(sampleRows.map(r => ({...r,...extra})),[target(82)]).filter(r => r.machine_id === 'gc2014' && r.column_id === 'cbp' && r.temperature_c === 82).length,0);
assert.equal(model.estimateMissingRts(sampleRows,[target(82,{linear_velocity_cm_s:null})]).filter(r => r.temperature_c === 82).length,0);
const newReal = {...predictions[0],row_id:'new-real',measurement_type:'measured',verification_status:'user_confirmed',rt_min:9.876};
assert.ok(!model.estimateMissingRts([...measured,newReal]).some(r => model.conditionKey(r) === model.conditionKey(newReal) && r.analyte_normalized === newReal.analyte_normalized));
assert.equal(model.preferMeasured([predictions[0],newReal],true)[0].rt_min,9.876);
console.log('RT predictions: 9 condition coverages, independent numeric calculations, 13 retained reference values, source provenance, bounds, no prediction chaining, and measured-priority guards passed.');
