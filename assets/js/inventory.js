(function () {
  const state = window.InventoryStorage.loadState();
  let defs = null;
  let reorderRules = {};
  const filterState = {
    keyword: '',
    alertOnly: false,
    filledOnly: false
  };

  const id = (text) => text.replace(/[^\w\u3040-\u30ff\u3400-\u9fff]+/g, '_');
  const setStatus = (message) => { document.getElementById('status').textContent = message; };

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
      <div class="name">${name}${hint}${warn}</div>
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
    return `<div class="check-row" data-filter-item="1" data-filter-alert="${state[key] ? '1' : '0'}" data-filter-filled="${state[key] ? '1' : '0'}" data-filter-text="${name.toLowerCase()}"><div class="name">${name}</div><label class="order-flag"><input id="${id(key)}" type="checkbox" ${checked}>注文</label></div>`;
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
