(function () {
  const DATA_FILES = {
    machines: 'data/gc-machines.json',
    columns: 'data/gc-columns.json',
    tempPrograms: 'data/gc-temp-programs.json',
    rtLibrary: 'data/gc-rt-library.json',
    rules: 'data/gc-method-rules.json'
  };

  const el = {
    solventSelector: document.getElementById('solventSelector'),
    selectedSolvents: document.getElementById('selectedSolvents'),
    clearSolventsBtn: document.getElementById('clearSolventsBtn'),
    suggestBtn: document.getElementById('suggestBtn'),
    recommendations: document.getElementById('recommendations'),
    rtSummary: document.getElementById('rtSummary'),
    rtGraph: document.getElementById('rtGraph'),
    rtTableBody: document.getElementById('rtTableBody')
  };

  const state = {
    data: null,
    selectedSolventIds: new Set(),
    rankedMethods: [],
    selectedMethodId: ''
  };

  init();

  async function init() {
    try {
      const data = await loadData();
      state.data = data;
      renderSolventSelector(data.solvents);
      bindActions();
    } catch (err) {
      console.error(err);
      el.recommendations.innerHTML = '<p class="empty-text">データ読込に失敗しました。JSON形式を確認してください。</p>';
    }
  }

  async function loadData() {
    const [machines, columns, tempPrograms, rtLibrary, rules] = await Promise.all(
      Object.values(DATA_FILES).map(fetchJson)
    );

    const solventMap = new Map();
    (rules.solvents || []).forEach((solvent) => {
      solventMap.set(solvent.id, solvent);
    });

    (rtLibrary.records || []).forEach((record) => {
      if (!solventMap.has(record.solventId)) {
        solventMap.set(record.solventId, {
          id: record.solventId,
          label: record.solventLabel || record.solventId,
          aliases: []
        });
      }
    });

    const methods = makeMethodCatalog({ machines, columns, tempPrograms, rtLibrary });

    return {
      machines,
      columns,
      tempPrograms,
      rtLibrary,
      rules,
      methods,
      solvents: Array.from(solventMap.values()).sort((a, b) => a.label.localeCompare(b.label, 'ja'))
    };
  }

  async function fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} の取得に失敗`);
    return res.json();
  }

  function makeMethodCatalog({ machines, columns, tempPrograms, rtLibrary }) {
    const machineMap = indexById(machines.machines);
    const columnMap = indexById(columns.columns);
    const tempProgramMap = indexById(tempPrograms.tempPrograms);

    const grouped = new Map();
    (rtLibrary.records || []).forEach((record) => {
      const methodKey = `${record.machineId}__${record.columnId}__${record.tempProgramId}`;
      if (!grouped.has(methodKey)) grouped.set(methodKey, []);
      grouped.get(methodKey).push(record);
    });

    return Array.from(grouped.entries()).map(([methodId, records]) => ({
      methodId,
      machine: machineMap.get(records[0].machineId),
      column: columnMap.get(records[0].columnId),
      tempProgram: tempProgramMap.get(records[0].tempProgramId),
      records: records.slice().sort((a, b) => a.rt - b.rt)
    }));
  }

  function indexById(items) {
    return new Map((items || []).map((item) => [item.id, item]));
  }

  function bindActions() {
    el.clearSolventsBtn.addEventListener('click', () => {
      state.selectedSolventIds.clear();
      renderSolventSelector(state.data.solvents);
      renderSelectedSolvents();
      resetResultPanels();
    });

    el.suggestBtn.addEventListener('click', () => {
      if (!state.selectedSolventIds.size) {
        el.recommendations.innerHTML = '<p class="empty-text">先に溶剤を1つ以上選択してください。</p>';
        return;
      }
      state.rankedMethods = rankMethods();
      renderRecommendations();
      if (state.rankedMethods[0]) {
        selectMethod(state.rankedMethods[0].method.methodId);
      }
    });
  }

  function renderSolventSelector(solvents) {
    el.solventSelector.innerHTML = '';
    solvents.forEach((solvent) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'solvent-chip';
      btn.textContent = solvent.label;
      if (state.selectedSolventIds.has(solvent.id)) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', () => {
        if (state.selectedSolventIds.has(solvent.id)) {
          state.selectedSolventIds.delete(solvent.id);
        } else {
          state.selectedSolventIds.add(solvent.id);
        }
        btn.classList.toggle('active');
        renderSelectedSolvents();
      });
      el.solventSelector.appendChild(btn);
    });
    renderSelectedSolvents();
  }

  function renderSelectedSolvents() {
    const list = Array.from(state.selectedSolventIds)
      .map((id) => state.data.solvents.find((s) => s.id === id)?.label || id);
    if (!list.length) {
      el.selectedSolvents.textContent = 'なし';
      return;
    }
    el.selectedSolvents.innerHTML = list.map((name) => `<span class="selected-tag">${escapeHtml(name)}</span>`).join('');
  }

  function rankMethods() {
    const settings = state.data.rules.scoreSettings || {};
    const selected = Array.from(state.selectedSolventIds);

    return state.data.methods
      .map((method) => {
        const coverage = method.records.filter((r) => selected.includes(r.solventId));
        const coverageRate = coverage.length / selected.length;
        const minGap = getMinGap(coverage);
        const avgQualityWeight = getAvgQualityWeight(coverage, settings.qualityWeight || {});
        const totalTime = method.tempProgram?.totalTimeMin || 0;

        const score =
          coverageRate * (settings.coverageWeight || 0) +
          normalizeGap(minGap, settings.gapIdealMin || 0.8) * (settings.gapWeight || 0) +
          avgQualityWeight * (settings.qualityScoreWeight || 0) +
          normalizeTime(totalTime, settings.maxPreferredTimeMin || 25) * (settings.timeWeight || 0);

        return {
          method,
          coverage,
          score,
          details: {
            coverageRate,
            minGap,
            avgQualityWeight,
            totalTime
          }
        };
      })
      .filter((item) => item.coverage.length)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  function getMinGap(records) {
    if (records.length <= 1) return 9.9;
    let min = Number.POSITIVE_INFINITY;
    for (let i = 1; i < records.length; i += 1) {
      min = Math.min(min, records[i].rt - records[i - 1].rt);
    }
    return Number.isFinite(min) ? min : 0;
  }

  function getAvgQualityWeight(records, qualityWeightMap) {
    if (!records.length) return 0;
    const sum = records.reduce((acc, r) => {
      const key = String(r.quality || '').toLowerCase();
      return acc + (qualityWeightMap[key] ?? 0.2);
    }, 0);
    return sum / records.length;
  }

  function normalizeGap(minGap, idealGap) {
    if (!idealGap) return 0;
    return Math.min(minGap / idealGap, 1);
  }

  function normalizeTime(totalTime, maxPreferred) {
    if (!maxPreferred) return 0;
    const ratio = Math.max(0, 1 - totalTime / maxPreferred);
    return Math.min(ratio, 1);
  }

  function renderRecommendations() {
    if (!state.rankedMethods.length) {
      el.recommendations.innerHTML = '<p class="empty-text">該当候補がありません。RTライブラリを追加してください。</p>';
      resetRtPanels();
      return;
    }

    el.recommendations.innerHTML = '';
    state.rankedMethods.forEach((item, idx) => {
      const card = document.createElement('article');
      card.className = `rec-card ${idx === 0 ? 'top-rank' : ''}`;
      const quality = Math.round(item.details.avgQualityWeight * 100);

      card.innerHTML = `
        <div class="rank-row">
          <p class="rank-label">${idx + 1}位: ${escapeHtml(item.method.machine?.label || item.method.machine?.id || '-')}</p>
          <p class="score">スコア ${item.score.toFixed(1)}</p>
        </div>
        <ul class="meta-list">
          <li>カラム: ${escapeHtml(item.method.column?.label || '-')}</li>
          <li>温度条件: ${escapeHtml(item.method.tempProgram?.label || '-')}</li>
          <li>入力溶剤カバー率: ${(item.details.coverageRate * 100).toFixed(0)}%</li>
          <li>最小RT差: ${item.details.minGap.toFixed(2)} min</li>
          <li>quality平均: ${quality}% 相当</li>
          <li>総分析時間: ${item.details.totalTime.toFixed(1)} min</li>
        </ul>
        <button type="button" class="rec-select-btn" data-method-id="${item.method.methodId}">この候補をRT表示</button>
      `;

      card.querySelector('.rec-select-btn').addEventListener('click', () => selectMethod(item.method.methodId));
      el.recommendations.appendChild(card);
    });
  }

  function selectMethod(methodId) {
    state.selectedMethodId = methodId;
    const item = state.rankedMethods.find((r) => r.method.methodId === methodId);
    if (!item) return;

    renderRtSummary(item);
    renderRtGraph(item);
    renderRtTable(item);
  }

  function renderRtSummary(item) {
    const selectedLabels = Array.from(state.selectedSolventIds)
      .map((id) => state.data.solvents.find((s) => s.id === id)?.label || id)
      .join(' / ');

    el.rtSummary.innerHTML = `
      <strong>${escapeHtml(item.method.machine?.label || '')}</strong> ×
      <strong>${escapeHtml(item.method.column?.label || '')}</strong> ×
      <strong>${escapeHtml(item.method.tempProgram?.label || '')}</strong><br>
      対象溶剤: ${escapeHtml(selectedLabels)}
    `;
  }

  function renderRtGraph(item) {
    const targets = item.method.records.filter((r) => state.selectedSolventIds.has(r.solventId));
    if (!targets.length) {
      el.rtGraph.innerHTML = '<p class="empty-text">グラフ表示対象がありません。</p>';
      return;
    }

    const total = item.method.tempProgram?.totalTimeMin || Math.max(...targets.map((r) => r.rt));
    el.rtGraph.innerHTML = '';

    const track = document.createElement('div');
    track.className = 'rt-track';

    targets.forEach((record) => {
      const ratio = total ? (record.rt / total) * 100 : 0;
      const dot = document.createElement('span');
      dot.className = 'rt-dot';
      dot.style.left = `${Math.min(ratio, 100)}%`;

      const label = document.createElement('span');
      label.className = 'rt-label';
      label.style.left = `${Math.min(ratio, 100)}%`;
      label.textContent = `${record.solventLabel || record.solventId} (${record.rt})`;

      track.appendChild(dot);
      track.appendChild(label);
    });

    el.rtGraph.appendChild(track);
    const axis = document.createElement('p');
    axis.className = 'hint';
    axis.textContent = `0 min 〜 ${total.toFixed(1)} min`;
    el.rtGraph.appendChild(axis);
  }

  function renderRtTable(item) {
    const targets = item.method.records
      .filter((r) => state.selectedSolventIds.has(r.solventId))
      .sort((a, b) => a.rt - b.rt);

    if (!targets.length) {
      el.rtTableBody.innerHTML = '<tr><td colspan="4" class="empty-cell">表示するデータがありません。</td></tr>';
      return;
    }

    el.rtTableBody.innerHTML = targets.map((record) => `
      <tr>
        <td>${escapeHtml(record.solventLabel || record.solventId)}</td>
        <td>${Number(record.rt).toFixed(2)}</td>
        <td>${escapeHtml(record.quality || '-')}</td>
        <td>${escapeHtml(record.note || '-')}</td>
      </tr>
    `).join('');
  }

  function resetResultPanels() {
    state.rankedMethods = [];
    state.selectedMethodId = '';
    el.recommendations.innerHTML = '<p class="empty-text">溶剤を選んで「候補を提案する」を押してください。</p>';
    resetRtPanels();
  }

  function resetRtPanels() {
    el.rtSummary.textContent = '候補が選択されていません。';
    el.rtGraph.innerHTML = '';
    el.rtTableBody.innerHTML = '<tr><td colspan="4" class="empty-cell">表示するデータがありません。</td></tr>';
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
