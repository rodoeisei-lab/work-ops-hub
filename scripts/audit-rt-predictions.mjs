// Dataset-internal leave-one-value-out diagnostic; not external validation.
import fs from 'node:fs';
import model from '../assets/js/gc-rt-model.js';
const measured = JSON.parse(fs.readFileSync('data/gc-rt-library.json','utf8')).filter(r => r.measurement_type === 'measured');
const verified = measured.filter(r => ['verified_photo','user_confirmed'].includes(r.verification_status));
const results = [];
for (const actual of verified) {
  const prediction = model.estimateMissingRts(measured.filter(r => r.row_id !== actual.row_id),[actual]).find(r => model.conditionKey(r) === model.conditionKey(actual) && r.analyte_normalized === actual.analyte_normalized);
  if (prediction) results.push({mode:prediction.prediction.temperature_mode,relative:Math.abs(prediction.rt_min-actual.rt_min)/actual.rt_min*100});
}
for (const mode of ['same_temperature','interpolation','extrapolation']) {
  const values = results.filter(r => r.mode === mode).map(r => r.relative).sort((a,b) => a-b);
  const middle = Math.floor(values.length/2);
  const median = values.length % 2 ? values[middle] : (values[middle-1]+values[middle])/2;
  console.log(JSON.stringify({mode,n:values.length,median_relative_error_pct:values.length ? Number(median.toFixed(2)) : null,max_relative_error_pct:values.length ? Number(values.at(-1).toFixed(2)) : null}));
}
console.log(`Predictable held-out values: ${results.length}/${verified.length}. These errors do not establish accuracy for missing substances or conditions.`);
