(function () {
  const state = window.InventoryStorage.loadState();
  let defs = null;
  let reorderRules = {};
  const filterState = {
    keyword: '',
    alertOnly: false,
    filledOnly: false
  };
  const ICON_SVG = {
    solvent: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M7 2h6v1.4l-1.2 1.5v3.7l4.1 6.2A2 2 0 0 1 14.2 18H5.8a2 2 0 0 1-1.7-3.2L8.2 8.6V4.9L7 3.4V2Zm2.5 7.4-3.8 5.8c-.2.3 0 .8.3.8h8c.4 0 .6-.5.3-.8l-3.8-5.8h-1Z"/></svg>',
    detector_tube: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.3 4.3a2 2 0 0 1 2.8 0l8.6 8.6a2 2 0 0 1-2.8 2.8L4.3 7a2 2 0 0 1 0-2.8Zm2 1.4-.6.6 8.6 8.6.6-.6-8.6-8.6ZM6.8 8.5l4.7 4.7-.9.9-4.7-4.7.9-.9Z"/></svg>',
    reagent: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M6 3.5A1.5 1.5 0 0 1 7.5 2h5A1.5 1.5 0 0 1 14 3.5V5h1a1 1 0 1 1 0 2h-.1l-.7 8.2a2.2 2.2 0 0 1-2.2 2H8a2.2 2.2 0 0 1-2.2-2L5.1 7H5a1 1 0 0 1 0-2h1V3.5Zm2 .5v1h4V4H8Zm-.2 3 .6 8h3.2l.6-8H7.8Z"/></svg>',
    supply: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 6.5 10 3l7 3.5V15l-7 3-7-3V6.5Zm7-1.3L5.4 7.5 10 9.8l4.6-2.3L10 5.2Zm-5 3.6v5l4 1.7v-5l-4-1.7Zm6 6.7 4-1.7v-5l-4 1.7v5Z"/></svg>',
    visual_check: '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 4c4.3 0 7.9 2.5 9.4 6-1.5 3.5-5.1 6-9.4 6S2.1 13.5.6 10C2.1 6.5 5.7 4 10 4Zm0 2C6.8 6 4 7.8 2.7 10 4 12.2 6.8 14 10 14s6-1.8 7.3-4C16 7.8 13.2 6 10 6Zm0 1.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4Z"/></svg>'
  };
  const ITEM_ICON_OVERRIDES = {
    'アセトン': 'solvent',
    'イソプロピルアルコール': 'solvent',
    'トルエン': 'solvent',
    'N,N-ジメチルホルムアミド': 'solvent',
    'メチルエチルケトン（5本）': 'solvent',
    '硝酸': 'reagent',
    '塩酸': 'reagent',
    '苛性ソーダ': 'reagent'
  };
  const DETECTOR_TUBE_KEYWORDS = ['検知管', 'チューブ', '吸収缶', 'フィルタ', 'カートリッジ', '発煙管', 'ろ紙'];
  const SOLVENT_KEYWORDS = ['アルコール', 'アセトン', 'トルエン', 'ホルム', 'ベンゼン', 'キシレン', '酢酸', 'ケトン', 'ブタノール'];
  const REAGENT_KEYWORDS = ['標準液', '試薬', '硝酸', '塩酸', '苛性'];

  const id = (text) => text.replace(/[^\w\u3040-\u30ff\u3400-\u9fff]+/g, '_');
  const setStatus = (message) => { document.getElementById('status').textContent = message; };
  const hasKeyword = (name, keywords) => keywords.some((keyword) => name.includes(keyword));

  function iconType(name, section) {
    if (ITEM_ICON_OVERRIDES[name]) return ITEM_ICON_OVERRIDES[name];
    if (section === 'visual') return 'visual_check';
    if (hasKeyword(name, SOLVENT_KEYWORDS)) return 'solvent';
    if (hasKeyword(name, REAGENT_KEYWORDS)) return 'reagent';
    if (hasKeyword(name, DETECTOR_TUBE_KEYWORDS)) return 'detector_tube';
    return section === 'tube' ? 'detector_tube' : 'supply';
  }

  function itemName(name, section) {
    const type = iconType(name, section);
    const icon = ICON_SVG[type] ? `<span class="item-icon icon-${type}" aria-hidden="true">${ICON_SVG[type]}</span>` : '';
    return `<span class="name-main">${icon}<span class="name-label">${name}</span></span>`;
  }

  async function loadConfig() {
    const [itemsRes, rulesRes] = await Promise.all([
      fetch('data/inventory-items.json', { cache: 'no-cache' }),
      fetch('data/reorder-rules.json', { cache: 'no-cache' })
    ]);
    const itemData = await itemsRes.json();
    const ruleData = await rulesRes.json();
    defs = itemData;
    reorderRules = (ruleData.rules || []).reduce((acc, rule) => {
      acc[rule.name] = rule;
      return acc;
    }, {});
  }

  function save() {
    window.InventoryStorage.saveState(state);
    setStatus('この端末に保存しました。');
  }

  function itemRow(section, group, name) {
    const key = `${section}__${group}__${name}`;
    const point = reorderRules[name];
    const hint = point ? `<div class="hint">${point.label}</div>` : '';
    const warn = point ? `<div class="warn-note">${point.limit}${point.unit}以下で注意</div>` : '';
    const warnClass = point && state[key] !== '' && state[key] !== undefined && Number(state[key]) <= point.limit;
    return `<div class="${warnClass ? 'row alert' : 'row'}" data-row-key="${key}" data-filter-item="1" data-filter-alert="${warnClass ? '1' : '0'}" data-filter-filled="${state[key] !== '' && state[key] !== undefined ? '1' : '0'}" data-filter-text="${name.toLowerCase()}">
      <div class="name">${itemName(name, section)}${hint}${warn}</div>
      <input class="qty" id="${id(key)}" type="number" min="0" step="1" inputmode="numeric" value="${state[key] ?? ''}" placeholder="0">
    </div>`;
  }

  function memoField(section, group, name) {
    const key = `${section}__${group}__${name}`;
    return `<div data-filter-item="1" data-filter-alert="0" data-filter-filled="${(state[key] || '').trim() ? '1' : '0'}" data-filter-text="${name.toLowerCase()}"><label for="${id(key)}" class="sub">${name}</label><textarea id="${id(key)}">${state[key] ?? ''}</textarea></div>`;
  }

  function checkRow(section, group, name) {
    const key = `${section}__${group}__${name}__order`;
    const checked = state[key] ? 'checked' : '';
    return `<div class="check-row" data-filter-item="1" data-filter-alert="${state[key] ? '1' : '0'}" data-filter-filled="${state[key] ? '1' : '0'}" data-filter-text="${name.toLowerCase()}"><div class="name">${itemName(name, section)}</div><label class="order-flag"><input id="${id(key)}" type="checkbox" ${checked}>注文</label></div>`;
  }

  function expiredMemoBody() {
    const memo = defs.expiredMemo;
    return `<div class="expired-box">
      <p class="expired-help">${memo.description} 在庫入力は箱数ですが、ここは本数で記録します。</p>
      <div class="expired-form">
        <input id="expiredType" type="text" placeholder="種類">
        <input id="expiredCount" type="number" min="1" step="1" inputmode="numeric" placeholder="本数">
        <button type="button" class="plain tiny" id="addExpired">追加</button>
      </div>
      <div class="expired-list" id="expiredList"></div>
    </div>`;
  }

  function sectionGroups(section) {
    const groups = defs[section].map((group) => ({ ...group }));
    if (section === 'tube') groups.push({ title: defs.expiredMemo.title, expiredMemo: true });
    const notes = defs.notes[section];
    if (notes && notes.length) groups.push({ title: 'メモ', textareas: notes });
    return groups;
  }

  function render(section) {
    const groups = sectionGroups(section);
    document.getElementById(section).innerHTML = groups.map((group) => {
      let body = '';
      if (group.items) {
        body = `<div class="rows">${group.items.map((name) => itemRow(section, group.title, name)).join('')}</div>`;
      } else if (group.textareas) {
        body = `<div class="memo-wrap">${group.textareas.map((name) => memoField(section, group.title, name)).join('')}</div>`;
      } else if (group.checklist) {
        body = `<p class="visual-help">数値入力なし。少なければ右側の「注文」にチェック。</p><div class="check-wrap">${group.checklist.map((name) => checkRow(section, group.title, name)).join('')}</div>`;
      } else if (group.expiredMemo) {
        body = expiredMemoBody();
      }
      return `<details class="card group" data-section="${section}" ${group.open ? 'open' : ''}><summary>${group.title}</summary>${body}</details>`;
    }).join('');
  }

  function bindAccordion() {
    document.querySelectorAll('details.group').forEach((detail) => {
      detail.addEventListener('toggle', () => {
        if (!detail.open) return;
        const section = detail.dataset.section;
        document.querySelectorAll(`details.group[data-section="${section}"]`).forEach((other) => {
          if (other !== detail) other.open = false;
        });
      });
    });
  }

  function renderExpiredList() {
    const list = document.getElementById('expiredList');
    if (!list) return;
    if (!state.expiredEntries.length) {
      list.innerHTML = '<div class="sub">まだ登録はありません。</div>';
      return;
    }
    list.innerHTML = state.expiredEntries.map((entry, idx) => `
      <div class="expired-item">
        <div class="name">${entry.type}</div>
        <div class="expired-count">${entry.count}本</div>
        <button type="button" class="danger tiny" data-remove-expired="${idx}">削除</button>
      </div>
    `).join('');

    list.querySelectorAll('[data-remove-expired]').forEach((button) => {
      button.addEventListener('click', () => {
        state.expiredEntries.splice(Number(button.dataset.removeExpired), 1);
        save();
        renderExpiredList();
      });
    });
  }

  function refreshWarnings() {
    Object.keys(reorderRules).forEach((name) => {
      const rule = reorderRules[name];
      ['tube', 'supplies'].forEach((section) => {
        sectionGroups(section).forEach((group) => {
          if (!(group.items || []).includes(name)) return;
          const key = `${section}__${group.title}__${name}`;
          const row = document.querySelector(`[data-row-key="${key}"]`);
          const value = state[key];
          if (!row) return;
          const warning = value !== '' && value !== undefined && Number(value) <= rule.limit;
          row.classList.toggle('alert', warning);
        });
      });
    });
  }

  function applyFilters() {
    document.querySelectorAll('.section').forEach((sectionEl) => {
      sectionEl.querySelectorAll('details.group').forEach((groupEl) => {
        let visibleCount = 0;
        const filterItems = groupEl.querySelectorAll('[data-filter-item]');
        filterItems.forEach((itemEl) => {
          const text = itemEl.dataset.filterText || '';
          const isAlert = itemEl.dataset.filterAlert === '1';
          const hasValue = itemEl.dataset.filterFilled === '1';
          const matchKeyword = !filterState.keyword || text.includes(filterState.keyword);
          const matchAlert = !filterState.alertOnly || isAlert;
          const matchFilled = !filterState.filledOnly || hasValue;
          const show = matchKeyword && matchAlert && matchFilled;
          itemEl.classList.toggle('filtered-out', !show);
          if (show) visibleCount += 1;
        });
        groupEl.classList.toggle('filtered-out-group', filterItems.length > 0 && visibleCount === 0);
      });
    });
  }

  function syncFilterFilledState() {
    document.querySelectorAll('.row[data-row-key]').forEach((row) => {
      const key = row.dataset.rowKey;
      const value = state[key];
      row.dataset.filterFilled = value !== undefined && value !== '' ? '1' : '0';
      row.dataset.filterAlert = row.classList.contains('alert') ? '1' : '0';
      row.dataset.filterText = (row.querySelector('.name')?.textContent || '').toLowerCase();
    });
    document.querySelectorAll('.check-row').forEach((row) => {
      const checked = row.querySelector('input[type="checkbox"]')?.checked;
      row.dataset.filterFilled = checked ? '1' : '0';
      row.dataset.filterAlert = checked ? '1' : '0';
      row.dataset.filterText = (row.querySelector('.name')?.textContent || '').toLowerCase();
    });
    document.querySelectorAll('.memo-wrap > div').forEach((wrap) => {
      const label = wrap.querySelector('label')?.textContent || '';
      const value = (wrap.querySelector('textarea')?.value || '').trim();
      wrap.dataset.filterItem = '1';
      wrap.dataset.filterText = label.toLowerCase();
      wrap.dataset.filterFilled = value ? '1' : '0';
      wrap.dataset.filterAlert = '0';
    });
  }

  function bindInputs() {
    ['tube', 'supplies', 'visual'].forEach((section) => {
      sectionGroups(section).forEach((group) => {
        (group.items || []).forEach((name) => {
          const key = `${section}__${group.title}__${name}`;
          document.getElementById(id(key)).addEventListener('input', (event) => {
            state[key] = event.target.value;
            save();
            refreshWarnings();
            syncFilterFilledState();
            applyFilters();
          });
        });
        (group.textareas || []).forEach((name) => {
          const key = `${section}__${group.title}__${name}`;
          document.getElementById(id(key)).addEventListener('input', (event) => {
            state[key] = event.target.value;
            save();
            syncFilterFilledState();
            applyFilters();
          });
        });
        (group.checklist || []).forEach((name) => {
          const key = `${section}__${group.title}__${name}__order`;
          document.getElementById(id(key)).addEventListener('change', (event) => {
            state[key] = event.target.checked;
            save();
            syncFilterFilledState();
            applyFilters();
          });
        });
      });
    });

    document.getElementById('checkDate').addEventListener('input', (event) => {
      state.checkDate = event.target.value;
      save();
    });

    document.querySelectorAll('.tab').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
        document.querySelectorAll('.section').forEach((sec) => sec.classList.remove('active'));
        button.classList.add('active');
        document.getElementById(button.dataset.tab).classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    document.getElementById('itemFilter').addEventListener('input', (event) => {
      filterState.keyword = (event.target.value || '').trim().toLowerCase();
      applyFilters();
    });

    document.getElementById('alertOnly').addEventListener('change', (event) => {
      filterState.alertOnly = event.target.checked;
      applyFilters();
    });

    document.getElementById('filledOnly').addEventListener('change', (event) => {
      filterState.filledOnly = event.target.checked;
      applyFilters();
    });

    const addBtn = document.getElementById('addExpired');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const typeEl = document.getElementById('expiredType');
        const countEl = document.getElementById('expiredCount');
        const type = (typeEl.value || '').trim();
        const count = Number(countEl.value || '');
        if (!type || !count || count < 1) {
          setStatus('期限切れメモは種類と本数を入力してください。');
          return;
        }
        state.expiredEntries.push({ type, count });
        typeEl.value = '';
        countEl.value = '';
        save();
        renderExpiredList();
        syncFilterFilledState();
        applyFilters();
      });
    }
  }

  function initMeta() {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    document.getElementById('checkDate').value = state.checkDate || today;
    if (!state.checkDate) state.checkDate = today;
  }

  function summaryText() {
    const lines = [`点検日: ${state.checkDate || ''}`, ''];
    const labels = { tube: '【検知管】', supplies: '【備品】', visual: '【目視確認】' };

    ['tube', 'supplies', 'visual'].forEach((section) => {
      lines.push(labels[section]);
      sectionGroups(section).forEach((group) => {
        let added = false;
        (group.items || []).forEach((name) => {
          const key = `${section}__${group.title}__${name}`;
          const value = state[key];
          if (value !== undefined && value !== '') {
            if (!added) { lines.push(`■ ${group.title}`); added = true; }
            lines.push(`${name}: ${value}箱`);
          }
        });
        if (group.expiredMemo && state.expiredEntries.length) {
          if (!added) { lines.push(`■ ${group.title}`); added = true; }
          state.expiredEntries.forEach((entry) => lines.push(`${entry.type}: ${entry.count}本`));
        }
        (group.textareas || []).forEach((name) => {
          const key = `${section}__${group.title}__${name}`;
          const value = (state[key] || '').trim();
          if (value) {
            if (!added) { lines.push(`■ ${group.title}`); added = true; }
            lines.push(`${name}: ${value}`);
          }
        });
        (group.checklist || []).forEach((name) => {
          const key = `${section}__${group.title}__${name}__order`;
          if (state[key]) {
            if (!added) { lines.push(`■ ${group.title}`); added = true; }
            lines.push(`${name}: 注文`);
          }
        });
        if (added) lines.push('');
      });
    });

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function csvText() {
    const rows = [['点検日', '区分', '分類', '品目', '数量または内容']];
    const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const sectionLabel = { tube: '検知管', supplies: '備品', visual: '目視確認' };

    ['tube', 'supplies', 'visual'].forEach((section) => {
      sectionGroups(section).forEach((group) => {
        (group.items || []).forEach((name) => {
          const key = `${section}__${group.title}__${name}`;
          const value = state[key];
          if (value !== undefined && value !== '') rows.push([state.checkDate || '', sectionLabel[section], group.title, name, `${value}箱`]);
        });
        if (group.expiredMemo) {
          state.expiredEntries.forEach((entry) => rows.push([state.checkDate || '', '期限切れ検知管', group.title, entry.type, `${entry.count}本`]));
        }
        (group.textareas || []).forEach((name) => {
          const key = `${section}__${group.title}__${name}`;
          const value = (state[key] || '').trim();
          if (value) rows.push([state.checkDate || '', sectionLabel[section], group.title, name, value]);
        });
        (group.checklist || []).forEach((name) => {
          const key = `${section}__${group.title}__${name}__order`;
          if (state[key]) rows.push([state.checkDate || '', sectionLabel[section], group.title, name, '注文']);
        });
      });
    });

    return rows.map((row) => row.map(quote).join(',')).join('\r\n');
  }

  function downloadCsv() {
    const blob = new Blob([csvText()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-memo-${state.checkDate || 'data'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('CSVを保存しました。');
  }

  function copySummary() {
    const area = document.getElementById('summary');
    if (!area.value.trim()) {
      setStatus('先にコピー用テキスト作成を押してください。');
      return;
    }
    area.select();
    area.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(area.value)
      .then(() => setStatus('コピーしました。'))
      .catch(() => setStatus('手動でコピーしてください。'));
  }

  function resetForm() {
    if (!window.confirm('この端末の入力を消します。よろしいですか。')) return;
    window.InventoryStorage.clearState();
    location.reload();
  }

  async function init() {
    await loadConfig();
    render('tube');
    render('supplies');
    render('visual');
    initMeta();
    bindInputs();
    bindAccordion();
    renderExpiredList();
    refreshWarnings();
    syncFilterFilledState();
    applyFilters();

    document.getElementById('buildSummary').addEventListener('click', () => {
      document.getElementById('summary').value = summaryText();
      document.getElementById('resultCard').classList.remove('hidden');
      document.getElementById('copySummary').disabled = false;
      setStatus('コピー用テキストを作成しました。');
      document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    document.getElementById('downloadCsv').addEventListener('click', downloadCsv);
    document.getElementById('copySummary').addEventListener('click', copySummary);
    document.getElementById('resetForm').addEventListener('click', resetForm);
  }

  init().catch(() => {
    setStatus('初期データの読み込みに失敗しました。ファイル配置を確認してください。');
  });
})();
