import fs from 'node:fs';
import model from '../assets/js/gc-rt-model.js';
const file = 'data/gc-rt-library.json';
const rows = JSON.parse(fs.readFileSync(file,'utf8')).filter(r => r.source !== 'local_rt_model_v1');
const estimates = model.estimate82At19(rows).map(r => ({row_id:'gc2014_cbp_82c_19_'+r.analyte_normalized,...r}));
fs.writeFileSync(file,JSON.stringify([...rows,...estimates],null,2)+'\n');
console.log(`82 C / 19 cm/s: refreshed ${estimates.length} predictions; measured records preserved.`);
