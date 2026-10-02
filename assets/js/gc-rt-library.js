(() => {
  const model = window.GcRtModel;
  const ids = ['machineFilter', 'columnFilter', 'tempFilter', 'velocityFilter', 'searchInput', 'confidenceFilter', 'favoriteFilter', 'lowOnly', 'showEstimated', 'summaryText', 'conditionMeta', 'selectedCondition', 'rtChart', 'predictionNotice', 'nearPeakList', 'dataNotice', 'tableBody', 'mobileCardList'];
  const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  let rows = [], machines = [], columns = [], temps = [], display = {}, aliases = {}, favorites = {};
  const presets = { basic: ['gc2014', 'cbp', '82c', '19'], measured82: ['gc2014', 'cbp', '82c', '20'], paper80: ['gc2014', 'cbp', '80c', '30'] };
  const normalize = v => String(v || '').normalize('NFKC').toLowerCase().replace(/[\s_-]/g, '');
  const label = r => display[r.analyte_normalized] || r.analyte_original || r.analyte_normalized;
  const fmt = n => Number(n).toFixed(3);
  const html = v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const confidence = r => r.certainty === 'high' ? '高' : r.certainty === 'low' ? '低' : '中';
  const kind = r => r.measurement_type === 'estimated' ? '予測' : '実測';
  const badge = r => `<span class="badge badge-${r.measurement_type === 'estimated' ? 'estimated' : 'measured'}">${kind(r)}</span>`;
  const metaLabel = (list, id) => list.find(x => x.id === id)?.name || list.find(x => x.id === id)?.display_name || id;
  const uiTempKey = r => r.temperature_c == null ? r.temp_program_id : `${r.temperature_c}c`;
  init().catch(() => {
    window.WorkOpsUi?.error('RTデータを読み込めませんでした。ページを開き直してください。');
    el.summaryText.textContent = '読み込みに失敗しました。';
    el.rtChart.innerHTML = '<p class="rt-empty" role="alert">RTデータを読み込めませんでした。</p>';
    el.tableBody.innerHTML = '<tr><td colspan="7">読み込みに失敗しました。</td></tr>';
  });
  async function init() {
    const names = ['gc-machines', 'gc-columns', 'gc-temp-programs', 'gc-rt-library', 'gc-analyte-display', 'gc-analyte-aliases', 'gc-favorite-analytes'];
    [machines, columns, temps, rows, display, aliases, favorites] = await Promise.all(names.map(async name => {
      const res = await fetch(`data/${name}.json?v=20261002-8`, { cache: 'no-store' });
      if (!res.ok) throw new Error(name);
      return res.json();
    }));
    options(el.machineFilter, machines.filter(m => rows.some(r => r.machine_id === m.id)).map(m => [m.id, m.name]), 'gc2014');
    sync('80c', '30');
    el.machineFilter.addEventListener('change', () => { sync(); render(); });
    el.columnFilter.addEventListener('change', () => { syncTemps(); render(); });
    el.tempFilter.addEventListener('change', () => { syncVelocity(); render(); });
    [el.velocityFilter, el.confidenceFilter, el.favoriteFilter, el.lowOnly, el.showEstimated].forEach(node => node.addEventListener('change', render));
    el.searchInput.addEventListener('input', render);
    document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
      const [machine, column, temp, velocity] = presets[button.dataset.preset];
      el.machineFilter.value = machine; sync(temp, velocity, column); clearSearch(); el.showEstimated.checked = false; render();
    }));
    document.getElementById('clearSearch').addEventListener('click', () => { clearSearch(); render(); });
    render(); window.WorkOpsUi?.ready();
  }
  function clearSearch() { el.searchInput.value = ''; el.confidenceFilter.value = ''; el.favoriteFilter.value = ''; el.lowOnly.checked = false; }
  function options(select, values, preferred) {
    const old = preferred ?? select.value;
    select.innerHTML = values.map(([id, text]) => `<option value="${html(id)}">${html(text)}</option>`).join('');
    if (values.some(([id]) => id === old)) select.value = old;
  }
  function sync(temp, velocity, column) {
    options(el.columnFilter, columns.filter(c => rows.some(r => r.machine_id === el.machineFilter.value && r.column_id === c.id)).map(c => [c.id, c.name]), column || el.columnFilter.value || 'cbp');
    syncTemps(temp, velocity);
  }
  function syncTemps(temp, velocity) {
    const relevant = rows.filter(r => r.machine_id === el.machineFilter.value && r.column_id === el.columnFilter.value);
    const available = [...new Map(relevant.map(r => [uiTempKey(r), {id:uiTempKey(r), temperature:r.temperature_c ?? 999, name:r.temperature_c == null ? metaLabel(temps,r.temp_program_id) : `${r.temperature_c}℃`}])).values()].sort((a,b) => a.temperature - b.temperature);
    options(el.tempFilter, available.map(t => [t.id, t.name]), temp); syncVelocity(velocity);
  }
  function baseRows() { return rows.filter(r => r.machine_id === el.machineFilter.value && r.column_id === el.columnFilter.value && uiTempKey(r) === el.tempFilter.value); }
  function syncVelocity(velocity) {
    const velocities = [...new Set(baseRows().map(model.velocityKey))].sort((a,b) => Number(a) - Number(b));
    options(el.velocityFilter, velocities.map(v => [v, v === 'unknown' ? '未記録' : v]), velocity);
  }
  function favoriteGroup(r) {
    for (const group of ['common','liquid_standard']) {
      if ((favorites[group] || []).some(f => {
        const names = [r.analyte_normalized, label(r), ...(aliases[r.analyte_normalized] || [])].map(normalize);
        return [f.normalized_name, f.display_name].some(v => v && names.includes(normalize(v)));
      })) return group;
    }
    return '';
  }
  function render() {
    const conditionRows = baseRows().filter(r => model.velocityKey(r) === el.velocityFilter.value);
    const tempRow = baseRows()[0];
    const temperature = tempRow?.temperature_c == null ? metaLabel(temps,el.tempFilter.value) : `${tempRow.temperature_c}℃`;
    const selected = `${metaLabel(machines, el.machineFilter.value)} / ${metaLabel(columns, el.columnFilter.value)} / ${temperature} / ${el.velocityFilter.value === 'unknown' ? '線速度 未記録' : el.velocityFilter.value + ' cm/s'}`;
    el.selectedCondition.textContent = selected;
    const splits = [...new Set(conditionRows.map(r => r.split_ratio || '未記録'))];
    el.conditionMeta.textContent = `split ${splits.join(' / ')}${conditionRows.every(r => r.measurement_type === 'estimated') ? '（次回の設定案）' : ''}`;
    const allPreferred = model.preferMeasured(conditionRows, true);
    const predictionCount = allPreferred.filter(r => r.measurement_type === 'estimated').length;
    const measuredCount = allPreferred.length - predictionCount;
    const q = normalize(el.searchInput.value);
    const filtered = model.preferMeasured(conditionRows, el.showEstimated.checked).filter(r => {
      if (el.confidenceFilter.value && r.certainty !== el.confidenceFilter.value) return false;
      if (el.lowOnly.checked && r.certainty !== 'low' && r.name_status !== 'unresolved' && !/要確認/.test(r.note || '')) return false;
      const group = favoriteGroup(r);
      if (el.favoriteFilter.value && (el.favoriteFilter.value === 'any' ? !group : group !== el.favoriteFilter.value)) return false;
      return !q || [label(r), r.analyte_original, r.analyte_normalized, ...(aliases[r.analyte_normalized] || []), r.note].some(v => normalize(v).includes(q));
    });
    const m = filtered.filter(r => r.measurement_type !== 'estimated').length;
    el.summaryText.textContent = `実測 ${m}件 / 予測 ${filtered.length - m}件`;
    document.querySelectorAll('[data-preset]').forEach(button => {
      const key = [el.machineFilter.value, el.columnFilter.value, el.tempFilter.value, el.velocityFilter.value];
      button.setAttribute('aria-pressed', String(presets[button.dataset.preset].every((v,i) => v === key[i])));
    });
    el.predictionNotice.hidden = !filtered.some(r => r.measurement_type === 'estimated');
    el.predictionNotice.textContent = '予測・精度未検証。n-ヘキサンと酢酸エチルは82℃・20 cm/s実測から換算。その他は80〜90℃資料から推定しています。標準試料の実測RTで確認してください。';
    const pairs = model.nearPairs(filtered); renderGraph(filtered, pairs, { predictionCount, measuredCount }); renderPairs(pairs);
    el.dataNotice.textContent = measuredCount === 0 ? 'この条件の値はすべて予測です。実測RTは未登録です。' : conditionRows.some(r => r.verification_status === 'legacy_unreviewed') ? '既存資料のRTです。今回の写真照合対象外で、線速度・splitは未記録です。分析条件を確認してください。' : '写真の印字・手書き値、またはユーザー指定の実測を使用。RTだけで物質を確定せず、標準試料と照合してください。';
    renderTable(filtered);
  }
  function renderGraph(filtered, pairs, counts) {
    if (!filtered.length) {
      const missingMeasured = counts.measuredCount === 0 && !el.showEstimated.checked && counts.predictionCount > 0;
      el.rtChart.innerHTML = `<div class="rt-empty"><p>${missingMeasured ? 'この条件の実測RTは未登録です。' : '該当するRTデータがありません。物質の絞り込みを確認してください。'}</p>${missingMeasured ? `<button type="button" id="enablePredictions">予測${counts.predictionCount}件を表示</button>` : ''}</div>`;
      document.getElementById('enablePredictions')?.addEventListener('click', () => { el.showEstimated.checked = true; render(); }); return;
    }
    // Always starts at zero; no broken/truncated axis.
    const max = Math.ceil(Math.max(...filtered.map(r => r.rt_min)) * 1.04);
    const nearIds = new Set(pairs.flatMap(p => [p.first.analyte_normalized, p.second.analyte_normalized]));
    el.rtChart.innerHTML = `<div class="rt-axis"><span>物質名</span><div class="rt-axis-plot"><div class="rt-axis-ticks"><span>0</span><span>${max / 2}</span><span>${max} min</span></div></div></div><ol class="rt-bars">${filtered.map(r => {
      const estimated = r.measurement_type === 'estimated', width = (r.rt_min / max * 100).toFixed(5);
      return `<li class="rt-bar-row ${estimated ? 'is-estimated' : 'is-measured'} ${nearIds.has(r.analyte_normalized) ? 'is-near' : ''}" data-analyte="${html(r.analyte_normalized)}" data-rt="${r.rt_min}" data-measurement-type="${html(r.measurement_type || 'measured')}"><div class="rt-bar-label">${html(label(r))}${estimated ? '<br><span class="badge badge-estimated">予測</span>' : ''}</div><div class="rt-plot-cell"><div class="rt-track" style="--bar-width:${width}%"><span class="rt-bar" aria-hidden="true"></span><span class="rt-value">${fmt(r.rt_min)}<span class="sr-only"> min ${kind(r)}</span></span></div></div></li>`;
    }).join('')}</ol>`;
  }
  function renderPairs(pairs) {
    if (!pairs.length) { el.nearPeakList.innerHTML = '<p class="hint">表示範囲に近接する組はありません。</p>'; return; }
    const render = items => `<ul class="near-pairs">${items.map(p => `<li><span>${html(label(p.first))} / ${html(label(p.second))}<small>${fmt(p.first.rt_min)} / ${fmt(p.second.rt_min)} min${p.estimated ? '・予測を含む' : ''}</small></span><strong>RT差 ${fmt(p.gap)} min</strong></li>`).join('')}</ul>`;
    el.nearPeakList.innerHTML = render(pairs.slice(0,6)) + (pairs.length > 6 ? `<details><summary>残り${pairs.length - 6}組を見る</summary>${render(pairs.slice(6))}</details>` : '');
  }
  function detailText(r) {
    const original = r.analyte_original && r.analyte_original !== label(r) ? `原表記 ${r.analyte_original} / ` : '';
    const source = r.source?.startsWith('photo:') ? r.source.replace('photo:', '写真 ') : r.source === 'user_confirmed_2026-10-02' ? 'ユーザー確認' : r.source === 'local_rt_model_v1' ? '局所RT予測 v1' : r.source || '未記録';
    const formula = r.prediction?.formula ? ' / ' + r.prediction.formula : '';
    return `${original}${r.measured_date || '測定日未記録'} / ${source} / ${r.note || ''}${formula}`;
  }
  function renderTable(filtered) {
    el.tableBody.innerHTML = filtered.length ? filtered.map(r => `<tr><td>${html(label(r))}</td><td class="rt">${fmt(r.rt_min)}</td><td>${badge(r)}</td><td>${confidence(r)}</td><td>${html(r.linear_velocity_cm_s ?? '未記録')}</td><td>${html(r.split_ratio || '未記録')}</td><td>${html(detailText(r))}</td></tr>`).join('') : '<tr><td colspan="7">表示データがありません。</td></tr>';
    el.mobileCardList.innerHTML = filtered.map(r => `<article class="mobile-data-card"><p><strong>${html(label(r))}</strong> ${badge(r)}</p><p class="mobile-result">${fmt(r.rt_min)} min</p><p>信頼度 ${confidence(r)} / 線速度 ${html(r.linear_velocity_cm_s ?? '未記録')} / split ${html(r.split_ratio || '未記録')}</p><p>${html(detailText(r))}</p></article>`).join('');
  }
})();
