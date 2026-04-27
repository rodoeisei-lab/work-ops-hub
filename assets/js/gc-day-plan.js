(() => {
  const PATHS = {
    machines: 'data/gc-machines.json',
    columns: 'data/gc-columns.json',
    tempPrograms: 'data/gc-temp-programs.json',
    rtLibrary: 'data/gc-rt-library.json',
    analyteAliases: 'data/gc-analyte-aliases.json',
    analyteDisplay: 'data/gc-analyte-display.json',
    rules: 'data/gc-method-rules.json',
    favorites: 'data/gc-favorite-analytes.json'
  };

  const els = {
    gcStartTime: document.getElementById('gcStartTime'),
    setupBufferInput: document.getElementById('setupBufferInput'),
    workplaceCards: document.getElementById('workplaceCards'),
    addWorkplaceBtn: document.getElementById('addWorkplaceBtn'),
    suggestAllBtn: document.getElementById('suggestAllBtn'),
    planSummary: document.getElementById('planSummary'),
    planDetails: document.getElementById('planDetails')
  };

  const state = { data: null, workplaceEntries: [] };

  init();

  async function init() {
    state.data = await loadData();
    const setupDefault = Number(state.data.rules?.multi_workplace_plan?.default_setup_buffer_per_unit_min ?? 1);
    if (Number.isFinite(setupDefault)) els.setupBufferInput.value = setupDefault.toFixed(1);
    state.workplaceEntries = [createEntry('A01'), createEntry('A02')];
    renderWorkplaces();
    bindEvents();
  }

  function bindEvents() {
    els.addWorkplaceBtn.addEventListener('click', () => { state.workplaceEntries.push(createEntry()); renderWorkplaces(); });
    els.suggestAllBtn.addEventListener('click', suggestPlan);
  }

  async function loadData() {
    const [machines, columns, tempPrograms, rtLibrary, analyteAliases, analyteDisplay, rules, favorites] = await Promise.all([
      fetchJson(PATHS.machines), fetchJson(PATHS.columns), fetchJson(PATHS.tempPrograms), fetchJson(PATHS.rtLibrary),
      fetchJson(PATHS.analyteAliases), fetchJson(PATHS.analyteDisplay), fetchJson(PATHS.rules),
      fetchJson(PATHS.favorites, { common: [], liquid_standard: [] })
    ]);
    const aliasLookup = new Map();
    const displayMap = new Map();
    Object.entries(analyteDisplay || {}).forEach(([k, v]) => { aliasLookup.set(norm(k), k); displayMap.set(k, String(v)); });
    Object.entries(analyteAliases || {}).forEach(([canonical, aliases]) => [canonical].concat(aliases || []).forEach((n) => aliasLookup.set(norm(n), canonical)));

    const machineMap = new Map((machines || []).map((x) => [x.id, x]));
    const columnMap = new Map((columns || []).map((x) => [x.id, x]));
    const tempMap = new Map((tempPrograms || []).map((x) => [x.id, x]));

    const rows = (rtLibrary || []).map((row) => ({
      machine_id: row.machine_id,
      column_id: row.column_id,
      temp_program_id: row.temp_program_id,
      analyte_normalized: aliasLookup.get(norm(row.analyte_normalized || row.analyte_original || '')) || row.analyte_normalized,
      analyte_original: row.analyte_original || row.analyte_normalized,
      rt_min: Number(row.rt_min),
      certainty: String(row.certainty || 'medium').toLowerCase(),
      note: row.note || ''
    }));

    const grouped = new Map();
    rows.forEach((row) => {
      const key = [row.machine_id, row.column_id, row.temp_program_id].join('__');
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });

    const methods = Array.from(grouped.entries()).map(([id, records]) => ({
      id,
      machine: machineMap.get(records[0].machine_id),
      column: columnMap.get(records[0].column_id),
      tempProgram: tempMap.get(records[0].temp_program_id),
      records: records.filter((r) => Number.isFinite(r.rt_min)).sort((a, b) => a.rt_min - b.rt_min)
    }));

    const analytes = Array.from(new Set(rows.map((r) => r.analyte_normalized).filter(Boolean))).map((id) => ({
      id,
      label: displayMap.get(id) || id
    })).sort((a, b) => a.label.localeCompare(b.label, 'ja'));

    const favoriteMeta = buildFavoriteMeta(favorites, analytes);
    return { methods, analytes, aliasLookup, displayMap, rules, machines, favoriteMeta };
  }

  function createEntry(code) { return { key: 'w_' + Math.random().toString(36).slice(2), code: code || suggestCode(), selected: new Map() }; }
  function suggestCode() {
    const used = new Set(state.workplaceEntries.map((x) => x.code));
    for (let i = 1; i < 99; i += 1) { const c = `A${String(i).padStart(2, '0')}`; if (!used.has(c)) return c; }
    return 'B01';
  }

  function renderWorkplaces() {
    els.workplaceCards.innerHTML = '';
    state.workplaceEntries.forEach((entry, idx) => {
      const card = document.createElement('article');
      card.className = 'workplace-card';
      card.innerHTML = `
        <label>匿名コード<input class="code-input" data-key="${entry.key}" value="${escapeHtml(entry.code)}" placeholder="例: A01"></label>
        <p class="chip-section-title">よく使う物質</p>
        <div class="quick-chips" data-key="${entry.key}" data-chip-kind="common"></div>
        <p class="chip-section-title subtle">液体STD</p>
        <div class="quick-chips liquid-std-chips" data-key="${entry.key}" data-chip-kind="liquid"></div>
        <div class="input-row">
          <input class="analyte-input" data-key="${entry.key}" list="analyteList" placeholder="全物質から選択">
          <button class="plain add-btn" data-key="${entry.key}" type="button">物質追加</button>
        </div>
        <div class="selected-row"><strong>選択中</strong><div class="selected-items" data-list="${entry.key}">なし</div></div>
        <div class="action-row">
          <button class="plain clear-btn" data-key="${entry.key}" type="button">クリア</button>
          ${idx >= 2 ? `<button class="danger remove-btn" data-key="${entry.key}" type="button">作業場を削除</button>` : '<span></span>'}
        </div>
      `;
      els.workplaceCards.appendChild(card);
      renderChips(entry, card.querySelector('.quick-chips[data-chip-kind="common"]'), 'common');
      renderChips(entry, card.querySelector('.quick-chips[data-chip-kind="liquid"]'), 'liquid_standard');
      renderSelected(entry, card.querySelector('[data-list]'));
    });
    renderDatalist();
    bindCardEvents();
  }

  function renderDatalist() {
    let dl = document.getElementById('analyteList');
    if (!dl) {
      dl = document.createElement('datalist'); dl.id = 'analyteList'; document.body.appendChild(dl);
    }
    dl.innerHTML = state.data.analytes.map((a) => `<option value="${escapeHtml(a.label)}"></option>`).join('');
  }

  function bindCardEvents() {
    els.workplaceCards.querySelectorAll('.code-input').forEach((n) => n.addEventListener('input', () => {
      const entry = findEntry(n.dataset.key); if (!entry) return;
      entry.code = String(n.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'A01';
      n.value = entry.code;
    }));
    els.workplaceCards.querySelectorAll('.add-btn').forEach((n) => n.addEventListener('click', () => addAnalyte(n.dataset.key)));
    els.workplaceCards.querySelectorAll('.analyte-input').forEach((n) => n.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addAnalyte(n.dataset.key); } }));
    els.workplaceCards.querySelectorAll('.clear-btn').forEach((n) => n.addEventListener('click', () => { const e = findEntry(n.dataset.key); if (!e) return; e.selected.clear(); renderWorkplaces(); }));
    els.workplaceCards.querySelectorAll('.remove-btn').forEach((n) => n.addEventListener('click', () => { state.workplaceEntries = state.workplaceEntries.filter((x) => x.key !== n.dataset.key); renderWorkplaces(); }));
  }

  function findEntry(key) { return state.workplaceEntries.find((x) => x.key === key); }

  function renderChips(entry, root, kind) {
    if (!root) return;
    const targets = getFavoriteAnalytes(kind);
    if (!targets.length) {
      root.innerHTML = '<span class="empty-chip-note">候補なし</span>';
      return;
    }
    targets.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = entry.selected.has(a.id) ? 'active' : '';
      b.setAttribute('aria-pressed', entry.selected.has(a.id) ? 'true' : 'false');
      b.textContent = a.label;
      b.addEventListener('click', () => { entry.selected.has(a.id) ? entry.selected.delete(a.id) : entry.selected.set(a.id, a); renderWorkplaces(); });
      root.appendChild(b);
    });
  }

  function getFavoriteAnalytes(kind) {
    const favorites = kind === 'liquid_standard'
      ? state.data.favoriteMeta.liquid_standard
      : state.data.favoriteMeta.common;
    return state.data.analytes.filter((item) => favorites.has(item.id));
  }

  function renderSelected(entry, root) {
    if (!entry.selected.size) { root.textContent = 'なし'; return; }
    root.innerHTML = Array.from(entry.selected.values()).map((a) => `<span class="selected-tag">${escapeHtml(a.label)}<button type="button" data-k="${entry.key}" data-id="${a.id}">×</button></span>`).join('');
    root.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const e = findEntry(b.dataset.k); if (!e) return; e.selected.delete(b.dataset.id); renderWorkplaces(); }));
  }

  function addAnalyte(key) {
    const entry = findEntry(key);
    const input = els.workplaceCards.querySelector(`.analyte-input[data-key="${key}"]`);
    if (!entry || !input) return;
    const raw = String(input.value || '').trim();
    if (!raw) return;
    const normalized = state.data.aliasLookup.get(norm(raw));
    if (normalized) {
      const label = state.data.displayMap.get(normalized) || normalized;
      entry.selected.set(normalized, { id: normalized, label });
    } else {
      const id = 'unknown__' + norm(raw);
      entry.selected.set(id, { id, label: raw, unknown: true });
    }
    input.value = '';
    renderWorkplaces();
  }

  function suggestPlan() {
    const rows = state.workplaceEntries.map((w) => ({ code: w.code, analytes: Array.from(w.selected.values()) })).filter((x) => x.analytes.length);
    if (!rows.length) { els.planSummary.textContent = '先に1つ以上の作業場へ物質を入力してください。'; els.planDetails.innerHTML = ''; return; }

    const results = rows.map((row) => {
      const ranked = rank(row.analytes);
      return { code: row.code, analytes: row.analytes, top: ranked[0] || null };
    });

    const setupBuffer = Math.max(0, Number(els.setupBufferInput.value || 0));
    const totalAnalysis = results.reduce((s, r) => s + (r.top?.analysisTime || 0), 0);
    const totalBuffer = setupBuffer * results.length;
    const total = totalAnalysis + totalBuffer;
    const judgement = buildJudgement(results.length, total, results.filter((r) => !r.top).length);
    const end = calcEnd(els.gcStartTime.value, total);

    els.planSummary.className = 'summary-box' + (judgement.warn ? ' warn' : '');
    els.planSummary.innerHTML = `
      使用候補機械: <strong>${escapeHtml(judgement.machineSummary)}</strong><br>
      合計分析時間: <strong>${fmt(totalAnalysis)} min</strong>（段取り余裕 ${fmt(totalBuffer)} min 含むと ${fmt(total)} min）<br>
      開始時刻: <strong>${escapeHtml(els.gcStartTime.value || '未入力')}</strong> / 終了目安: <strong>${escapeHtml(end)}</strong>
      <ul>${judgement.comments.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
    `;

    els.planDetails.innerHTML = results.map((row) => renderDetail(row)).join('');
  }

  function renderDetail(row) {
    if (!row.top) return `<article class="detail-card"><h3>${escapeHtml(row.code)}</h3><p>対象物質: ${escapeHtml(row.analytes.map((a) => a.label).join('、'))}</p><p>推奨候補: 要確認</p><p>一部データ不足あり</p></article>`;
    const t = row.top;
    return `<article class="detail-card"><h3>${escapeHtml(row.code)}</h3>
      <p>対象物質: ${escapeHtml(row.analytes.map((a) => a.label).join('、'))}</p>
      <p>推奨候補: 第1候補</p>
      <p>機械: <strong>${escapeHtml(t.method.machine?.name || '-')}</strong></p>
      <p>カラム: <strong>${escapeHtml(t.method.column?.name || '-')}</strong></p>
      <p>温度条件: <strong>${escapeHtml(t.method.tempProgram?.display_name || '-')}</strong></p>
      <p>分析時間: <strong>${fmt(t.analysisTime)} min</strong></p>
      <p>最小RT差: <strong>${fmt(t.minGap)} min</strong></p>
      <p>信頼度: <strong class="${t.confidence === '低' ? 'conf-low' : ''}">${escapeHtml(t.confidence)}</strong></p>
      <p>注意点: ${escapeHtml(t.memo)}</p>
    </article>`;
  }

  function buildJudgement(unitCount, total, missing) {
    const r = state.data.rules?.multi_workplace_plan || {};
    const gcName = state.data.machines.find((m) => m.id === 'gc2014')?.name || 'GC2014';
    const comments = [];
    let machineSummary = `${gcName} 1台運用候補`;
    let warn = false;
    if (unitCount <= Number(r.single_machine_priority_units_max ?? 2)) {
      comments.push(`${unitCount}単位のため、${gcName} 1台で処理候補`);
      comments.push('GC2014 1台運用候補');
    } else {
      comments.push('3単位以上のため要相談');
      warn = true;
      machineSummary = '要相談';
      if (total <= Number(r.short_total_min ?? 20)) comments.push('合計時間が短いため、1台運用も候補');
    }
    if (parseTime(els.gcStartTime.value) >= parseTime(String(r.late_start_time || '16:00'))) comments.push('開始時刻が遅い場合は複数台も検討');
    if (total > Number(r.long_total_min ?? 30)) comments.push('合計時間が長めのため複数台運用を検討');
    if (missing > 0) comments.push('一部データ不足あり');
    return { machineSummary, comments, warn };
  }

  function rank(selectedAnalytes) {
    const ids = selectedAnalytes.filter((a) => !a.unknown).map((a) => a.id);
    const unknownCount = selectedAnalytes.filter((a) => a.unknown).length;
    return state.data.methods.map((method) => {
      const matches = method.records.filter((r) => ids.includes(r.analyte_normalized));
      if (!matches.length) return null;
      const coverage = matches.length / Math.max(ids.length, 1);
      const minGap = getMinGap(matches.map((x) => x.rt_min));
      const analysisTime = Math.max(...matches.map((x) => x.rt_min)) + 0.4;
      const cAvg = avg(matches.map((x) => certaintyScore(x.certainty)));
      const score = coverage * 70 + cAvg * 20 + Math.max(0, 1 - analysisTime / 10) * 8 + Math.min(minGap, 0.4) * 10 - unknownCount * 2;
      const confidence = cAvg >= 0.8 ? '高' : cAvg >= 0.6 ? '中' : '低';
      const memo = unknownCount > 0 ? 'データ未登録の物質があります' : cAvg < 0.7 ? '要確認データを含みます' : '安定候補';
      return { method, analysisTime, minGap, confidence, memo, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 1);
  }

  function certaintyScore(c) { if (c === 'high') return 1; if (c === 'low') return 0.35; return 0.65; }
  function getMinGap(values) { if (values.length < 2) return 0.99; const s = values.slice().sort((a, b) => a - b); let m = Infinity; for (let i = 1; i < s.length; i += 1) m = Math.min(m, s[i] - s[i - 1]); return m; }
  function calcEnd(start, plus) { const base = parseTime(start); if (!Number.isFinite(base)) return '開始時刻入力で表示'; const t = (Math.round(base + plus) + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}頃`; }
  function parseTime(t) { if (!String(t).includes(':')) return NaN; const [h, m] = String(t).split(':').map(Number); return h * 60 + m; }
  function norm(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g, ''); }
  function buildFavoriteMeta(favorites, analytes) {
    const idByNorm = new Map();
    (analytes || []).forEach((item) => {
      idByNorm.set(norm(item.id), item.id);
      idByNorm.set(norm(item.label), item.id);
    });

    function toId(entry) {
      const keys = [entry?.normalized_name, entry?.display_name];
      for (const key of keys) {
        const found = idByNorm.get(norm(key));
        if (found) return found;
      }
      return null;
    }

    return {
      common: new Set((favorites?.common || []).map(toId).filter(Boolean)),
      liquid_standard: new Set((favorites?.liquid_standard || []).map(toId).filter(Boolean))
    };
  }
  function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
  function fmt(n) { return Number.isFinite(n) ? Number(n.toFixed(2)).toString() : '-'; }
  function escapeHtml(v) { return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
  async function fetchJson(path, fallback) {
    const res = await fetch(path);
    if (!res.ok) {
      if (typeof fallback !== 'undefined') return fallback;
      throw new Error(path + ' の読み込みに失敗');
    }
    return res.json();
  }
})();
