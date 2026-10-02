import fs from 'node:fs';
import model from '../assets/js/gc-rt-model.js';
const file = 'data/gc-rt-library.json';
const rows = JSON.parse(fs.readFileSync(file,'utf8')).filter(r => !(r.measurement_type === 'estimated' && /^local_rt_model_v\d+$/.test(r.source)));
const estimates = model.estimateMissingRts(rows).map(r => ({row_id:[r.machine_id,r.column_id,r.temp_program_id,r.linear_velocity_cm_s,r.analyte_normalized].join('_'),...r}));
fs.writeFileSync(file,JSON.stringify([...rows,...estimates],null,2)+'\n');
console.log(`Refreshed ${estimates.length} predictions across ${new Set(estimates.map(model.conditionKey)).size} conditions; measured records preserved.`);
