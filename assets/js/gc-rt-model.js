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
  // Empirical local model, NOT a calibrated retention-factor model. No t0/dimensions
  // were supplied. Predictions are limited to 82 C / 19 cm/s, identical GC/column.
  // Two 82 C / 20 cm/s anchors calibrate the 80--90 C log(total RT) interpolation.
  function estimate82At19(rows) {
    const measured = preferMeasured(rows).filter(r => r.machine_id === 'gc2014' && r.column_id === 'cbp' && r.name_status !== 'unresolved' && ['verified_photo', 'user_confirmed'].includes(r.verification_status));
    const anchors = measured.filter(r => r.temperature_c === 82 && r.linear_velocity_cm_s === 20);
    const cold = new Map(measured.filter(r => r.temperature_c === 80 && r.linear_velocity_cm_s === 30).map(r => [r.analyte_normalized, r]));
    const hot = new Map(measured.filter(r => r.temperature_c === 90 && r.linear_velocity_cm_s === 30).map(r => [r.analyte_normalized, r]));
    const interpolate = (a, b) => Math.exp(0.8 * Math.log(a.rt_min) + 0.2 * Math.log(b.rt_min));
    const calibrationAnchors = anchors.filter(r => cold.has(r.analyte_normalized) && hot.has(r.analyte_normalized));
    if (calibrationAnchors.length < 2) return [];
    const calibration = Math.exp(calibrationAnchors.reduce((sum, r) => sum + Math.log(r.rt_min / (interpolate(cold.get(r.analyte_normalized), hot.get(r.analyte_normalized)) * 30 / 20)), 0) / calibrationAnchors.length);
    const target = new Set(preferMeasured(rows).filter(r => r.machine_id === 'gc2014' && r.column_id === 'cbp' && r.temperature_c === 82 && r.linear_velocity_cm_s === 19).map(r => r.analyte_normalized));
    const direct = new Map(anchors.map(r => [r.analyte_normalized, r]));
    const ids = new Set([...direct.keys(), ...[...cold.keys()].filter(id => hot.has(id))]);
    const estimated = [];
    for (const id of ids) {
      if (target.has(id)) continue;
      const anchor = direct.get(id);
      const a = cold.get(id), b = hot.get(id);
      const basis = anchor || a;
      const raw = anchor ? anchor.rt_min * 20 / 19 : interpolate(a, b) * 30 / 19 * calibration;
      estimated.push({
        machine_id: 'gc2014', column_id: 'cbp', temp_program_id: '82c',
        temperature_c: 82, linear_velocity_cm_s: 19, split_ratio: '2:1',
        analyte_original: basis.analyte_original, analyte_normalized: id,
        rt_min: Math.round(raw * 1000) / 1000, measurement_type: 'estimated',
        certainty: 'low', measured_date: null, source: 'local_rt_model_v1',
        verification_status: 'unvalidated_estimate', name_status: 'confirmed',
        note: '予測・未検証。次回の設定案：split 2:1。標準試料で実測して確認。',
        prediction: {
          method: anchor ? 'same_temperature_inverse_velocity' : 'local_log_rt_interpolation_calibrated_inverse_velocity',
          source_row_ids: anchor ? [anchor.row_id] : [a.row_id, b.row_id, ...calibrationAnchors.map(r => r.row_id)],
          calibration_factor: anchor ? null : calibration,
          formula: anchor ? 'RT(82,19) = measured RT(82,20) * 20/19' : 'RT(82,19) = exp(0.8*ln(RT80,30)+0.2*ln(RT90,30))*30/19*calibration',
          limitation: 'カラム寸法・ホールドアップ時間は未確認。予測精度は未検証。split変更による影響はモデル化していない。'
        }
      });
    }
    return estimated;
  }
  function planningRows(rows) {
    return preferMeasured(rows).filter(r => r.name_status !== 'unresolved' && r.verification_status !== 'quarantined');
  }
  function methodTempProgram(program, row) {
    const velocity = row.linear_velocity_cm_s == null ? '線速度 未記録' : `${row.linear_velocity_cm_s} cm/s`;
    return { ...(program || {}), display_name: `${program?.display_name || row.temp_program_id} / ${velocity}${row.split_ratio ? ' / split ' + row.split_ratio : ''}` };
  }
  return { conditionKey, velocityKey, preferMeasured, nearPairs, estimate82At19, planningRows, methodTempProgram };
});
