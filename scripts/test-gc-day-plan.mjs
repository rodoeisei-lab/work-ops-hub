import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync('assets/js/gc-day-plan.js', 'utf8');
const judgementSource = source.slice(source.indexOf('  function missingAnalytes('), source.indexOf('  function rank('));
const parseTimeSource = source.match(/  function parseTime\(t\) \{[^\n]+\}/)[0];
const rules = JSON.parse(fs.readFileSync('data/gc-method-rules.json', 'utf8'));
const { buildJudgement } = vm.runInNewContext(judgementSource + parseTimeSource + '\n({ buildJudgement })', {
  state: {data:{rules}}, els:{gcStartTime:{value:'13:00'}}
});
const method = (id, name) => ({machine:{id,name},records:[{analyte_normalized:'methanol'}]});
const row = (m) => ({analytes:[{id:'methanol',label:'メタノール'}],top:{method:m}});
const gc14b = row(method('gc14b','GC-14B'));
const gc2014 = row(method('gc2014','GC2014'));

assert.equal(buildJudgement([gc14b], 2).machineSummary, 'GC-14B 1台運用候補');
assert.equal(buildJudgement([gc2014,gc2014], 4).machineSummary, 'GC2014 1台運用候補');
assert.equal(buildJudgement([gc14b,gc2014], 4).warn, true);
assert.equal(buildJudgement([gc14b,gc2014], 4).machineSummary, '要相談');
assert.equal(buildJudgement([gc14b,gc14b,gc14b], 6).warn, true);
const partial = {...gc14b,analytes:[...gc14b.analytes,{id:'unknown',label:'未登録物質',unknown:true}]};
assert.equal(buildJudgement([partial], 2).incomplete, true);
assert.equal(buildJudgement([partial], 2).machineSummary, '要相談');
assert.equal(buildJudgement([{analytes:partial.analytes,top:null}], 2).warn, true);
assert.equal(buildJudgement([gc14b], 31).comments.some(text=>text.includes('長め')), true);
console.log('Day plan actual-machine, mixed-machine, incomplete-data, and workload checks passed.');
