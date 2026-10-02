/* Shared RT condition logic. Unknown velocity stays unknown; it is never 30 by default. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GcRtModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const velocityKey = r => r.linear_velocity_cm_s == null ? 'unknown' : String(r.linear_velocity_cm_s);
  const conditionKey = r => [r.machine_id, r.column_id, r.temp_program_id, velocityKey(r)].join('__');
  function preferMeasured(rows, includeEstimated = false) {
    const byAnalyte = new Map();
    rows.filter(r => Number.isFinite(r.rt_min) && r.rt_min > 0).forEach(r => {
      if (r.measurement_type === 'estimated' && !includeEstimated) return;
      const key = conditionKey(r) + '__' + r.analyte_normalized;
      const old = byAnalyte.get(key);
      if (!old || (old.measurement_type === 'estimated' && r.measurement_type !== 'estimated')) byAnalyte.set(key, r);
    });
    return [...byAnalyte.values()].sort((a, b) => a.rt_min - b.rt_min);
  }
  function nearPairs(rows, threshold = 0.15) {
    const groups = new Map();
    preferMeasured(rows, true).forEach(r => {
      const key = conditionKey(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    const pairs = [];
    for (const records of groups.values()) {
      for (let i = 0; i < records.length; i++) {
        for (let j = i + 1; j < records.length; j++) {
          const gap = Math.round((records[j].rt_min - records[i].rt_min) * 1000) / 1000;
          if (gap > threshold) break;
          pairs.push({ first: records[i], second: records[j], gap, estimated: [records[i], records[j]].some(r => r.measurement_type === 'estimated') });
        }
      }
    }
    return pairs.sort((a, b) => a.gap - b.gap);
  }
  // Empirical log(total RT) model, NOT a calibrated retention-factor model.
  // No t0, column dimensions or gas identity were supplied. The 10 C extrapolation
  // and 50 C source-span caps are software bounds, not validated accuracy
  // guarantees. Wider interpolation (>30 C) is marked separately in the UI.
  // Never chain estimates, assume unknown speed, infer SBT,
  // mix instruments/columns, or use a single temperature to infer another.
  const predictionLimits = Object.freeze({ max_extrapolation_c: 10, max_source_span_c: 50 });
  const plannedCondition = { machine_id: 'gc2014', column_id: 'cbp', temp_program_id: '82c', temperature_c: 82, linear_velocity_cm_s: 19, split_ratio: '2:1' };
  const eligibleSources = rows => preferMeasured(rows).filter(r => r.measurement_type === 'measured' && r.name_status === 'confirmed' && ['verified_photo', 'user_confirmed'].includes(r.verification_status) && Number.isFinite(r.temperature_c) && Number.isFinite(r.linear_velocity_cm_s) && r.linear_velocity_cm_s > 0 && r.row_id);
  const sameInstrument = (a, b) => a.machine_id === b.machine_id && a.column_id === b.column_id;
  const samePhysicalCondition = (a, b) => sameInstrument(a,b) && a.temperature_c === b.temperature_c && a.linear_velocity_cm_s === b.linear_velocity_cm_s;
  function atTemperature(records, temperature, velocity) {
    const points = [...new Map(records.filter(r => r.linear_velocity_cm_s === velocity).sort((a,b) => a.row_id.localeCompare(b.row_id)).map(r => [r.temperature_c,r])).values()].sort((a,b) => a.temperature_c - b.temperature_c);
    const direct = points.find(r => r.temperature_c === temperature);
    if (direct) return { raw:direct.rt_min, sources:[direct], velocity, mode:'same_temperature', extrapolation:0, range:[temperature,temperature], weight:null };
    if (points.length < 2) return null;
    let index = points.findIndex(r => r.temperature_c > temperature);
    if (index === 0) index = 1;
    if (index < 0) index = points.length - 1;
    const a = points[index - 1], b = points[index];
    const extrapolation = Math.max(a.temperature_c - temperature, temperature - b.temperature_c, 0);
    if (b.temperature_c - a.temperature_c > predictionLimits.max_source_span_c || extrapolation > predictionLimits.max_extrapolation_c) return null;
    const weight = (temperature - a.temperature_c) / (b.temperature_c - a.temperature_c);
    return { raw:Math.exp((1-weight)*Math.log(a.rt_min)+weight*Math.log(b.rt_min)), sources:[a,b], velocity, mode:extrapolation ? 'extrapolation' : 'interpolation', extrapolation, range:[a.temperature_c,b.temperature_c], weight };
  }
  function chooseBasis(records, target) {
    const candidates = [...new Set(records.map(r => r.linear_velocity_cm_s))].map(v => atTemperature(records,target.temperature_c,v)).filter(Boolean);
    // Exact-temperature measurements always precede temperature fitting. Then
    // prefer interpolation, the closest source temperatures, and nearby speed.
    const score = p => [p.mode === 'same_temperature' ? 0 : p.mode === 'interpolation' ? 1 : 2, Math.max(...p.range.map(t => Math.abs(t-target.temperature_c))), Math.abs(Math.log(p.velocity/target.linear_velocity_cm_s))];
    return candidates.sort((a,b) => {
      const sa = score(a), sb = score(b);
      for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i];
      return a.velocity-b.velocity;
    })[0];
  }
  function velocityCalibration(sources, target, baseVelocity) {
    if (baseVelocity === target.linear_velocity_cm_s) return { factor:1, sources:[] };
    const other = sources.filter(r => r.temperature_c === target.temperature_c && r.linear_velocity_cm_s !== baseVelocity);
    const nearest = [...new Set(other.map(r => r.linear_velocity_cm_s))].sort((a,b) => Math.abs(Math.log(a/target.linear_velocity_cm_s))-Math.abs(Math.log(b/target.linear_velocity_cm_s)) || a-b)[0];
    const anchors = other.filter(r => r.linear_velocity_cm_s === nearest).map(r => ({row:r, basis:atTemperature(sources.filter(s => s.analyte_normalized === r.analyte_normalized),target.temperature_c,baseVelocity)})).filter(a => a.basis);
    if (anchors.length < 2) return { factor:1, sources:[] };
    const factor = Math.exp(anchors.reduce((sum,a) => sum+Math.log(a.row.rt_min*a.row.linear_velocity_cm_s/(a.basis.raw*baseVelocity)),0)/anchors.length);
    // A large mismatch signals that inverse-speed conversion is unsuitable here.
    if (factor < 0.75 || factor > 1.25) return null;
    return { factor, sources:anchors.flatMap(a => [a.row,...a.basis.sources]) };
  }
  function estimateMissingRts(rows, additionalConditions = [plannedCondition]) {
    const measured = preferMeasured(rows).filter(r => r.measurement_type === 'measured');
    const sources = eligibleSources(rows);
    const targets = new Map();
    for (const r of [...sources,...additionalConditions]) {
      if (!Number.isFinite(r.temperature_c) || !Number.isFinite(r.linear_velocity_cm_s) || r.linear_velocity_cm_s <= 0) continue;
      const key = conditionKey(r);
      if (!targets.has(key)) {
        const splits = [...new Set(measured.filter(s => conditionKey(s) === key).map(s => s.split_ratio ?? null))];
        targets.set(key,{ machine_id:r.machine_id,column_id:r.column_id,temp_program_id:r.temp_program_id,temperature_c:r.temperature_c,linear_velocity_cm_s:r.linear_velocity_cm_s,split_ratio:splits.length === 1 ? splits[0] : splits.length ? null : r.split_ratio ?? null });
      }
    }
    const estimates = [];
    for (const target of targets.values()) {
      const instrumentSources = sources.filter(r => sameInstrument(r,target));
      const present = new Set(measured.filter(r => samePhysicalCondition(r,target)).map(r => r.analyte_normalized));
      const ids = [...new Set(instrumentSources.map(r => r.analyte_normalized))].sort();
      const calibrations = new Map();
      for (const id of ids) {
        if (present.has(id)) continue;
        const basis = chooseBasis(instrumentSources.filter(r => r.analyte_normalized === id),target);
        if (!basis) continue;
        if (!calibrations.has(basis.velocity)) calibrations.set(basis.velocity,velocityCalibration(instrumentSources,target,basis.velocity));
        const calibration = calibrations.get(basis.velocity);
        if (!calibration) continue;
        const velocityFactor = basis.velocity / target.linear_velocity_cm_s;
        const raw = basis.raw * velocityFactor * calibration.factor;
        if (!Number.isFinite(raw) || raw <= 0) continue;
        const [a,b] = basis.sources;
        const term = basis.mode === 'same_temperature' ? `measured RT(${target.temperature_c},${basis.velocity})` : `exp((1-${basis.weight})*ln(RT${a.temperature_c},${basis.velocity})+${basis.weight}*ln(RT${b.temperature_c},${basis.velocity}))`;
        const modeNote = basis.mode === 'extrapolation' ? `温度外挿 ${basis.extrapolation}℃。` : basis.mode === 'interpolation' ? '温度補間。' : '同温度の線速度換算。';
        estimates.push({
          ...target, analyte_original:a.analyte_original, analyte_normalized:id,
          rt_min:Math.round(raw*1000)/1000, measurement_type:'estimated', certainty:'low', measured_date:null,
          source:'local_rt_model_v2', verification_status:'unvalidated_estimate', name_status:'confirmed',
          note:`予測・精度未検証。${modeNote}標準試料で確認。${conditionKey(target) === conditionKey(plannedCondition) ? '次回設定案 split 2:1。' : ''}`,
          prediction:{
            method:basis.mode === 'same_temperature' ? 'same_temperature_inverse_velocity' : `local_log_rt_${basis.mode}_inverse_velocity`,
            temperature_mode:basis.mode, temperature_range_c:basis.range, extrapolation_c:basis.extrapolation,
            temperature_weight:basis.weight, base_velocity_cm_s:basis.velocity, velocity_factor:velocityFactor,
            calibration_factor:calibration.sources.length ? calibration.factor : null,
            source_row_ids:[...new Set([...basis.sources,...calibration.sources].map(r => r.row_id))],
            formula:`RT(${target.temperature_c},${target.linear_velocity_cm_s}) = ${term} * ${basis.velocity}/${target.linear_velocity_cm_s}${calibration.sources.length ? ' * calibration' : ''}`,
            limitation:'局所経験モデル。カラム寸法・ホールドアップ時間・キャリアガスは未確認。予測精度は未検証。温度外挿は補間より根拠が弱い。split変更はモデル化しない。'
          }
        });
      }
    }
    return estimates;
  }
  // Keep the former public entry point for callers adding the 82 C / 19 setting.
  function estimate82At19(rows) {
    return estimateMissingRts(rows).filter(r => samePhysicalCondition(r,plannedCondition));
  }
  function planningRows(rows) {
    return preferMeasured(rows).filter(r => r.name_status !== 'unresolved' && r.verification_status !== 'quarantined');
  }
  function methodTempProgram(program, row) {
    const velocity = row.linear_velocity_cm_s == null ? '線速度 未記録' : `${row.linear_velocity_cm_s} cm/s`;
    return { ...(program || {}), display_name: `${program?.display_name || row.temp_program_id} / ${velocity}${row.split_ratio ? ' / split ' + row.split_ratio : ''}` };
  }
  return { conditionKey, velocityKey, preferMeasured, nearPairs, estimate82At19, estimateMissingRts, predictionLimits, planningRows, methodTempProgram };
});
