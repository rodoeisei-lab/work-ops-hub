(() => {
  const hidden = document.getElementById('calc-group');
  const column = document.getElementById('calc-column');
  const temp = document.getElementById('calc-temp');
  const analyte = document.getElementById('calc-analyte');
  const summaryCards = document.getElementById('factor-summary-cards');
  const message = document.getElementById('calc-message');
  if (!hidden || !column || !temp || !analyte) return;

  let internalDispatch = false;
  let masterAnalytes = [];

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function parseKey(key) {
    const parts = String(key || '').split('|');
    return {
      column: parts[0] || '',
      temp: parts[1] || '',
      analyte: parts.slice(2).join('|') || ''
    };
  }

  function groups() {
    return [...hidden.options]
      .filter((option) => option.value)
      .map((option) => ({ ...parseKey(option.value), key: option.value }));
  }

  function setOptions(select, items, placeholder, formatter = (value) => value) {
    select.innerHTML = `<option value="">${placeholder}</option>` + items
      .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(formatter(value))}</option>`)
      .join('');
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function clearHiddenSelection() {
    hidden.value = '';
    internalDispatch = true;
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
    internalDispatch = false;
  }

  function rebuildColumns() {
    const all = groups();
    const current = column.value;
    const columns = unique(all.map((group) => group.column)).sort((a, b) => a.localeCompare(b, 'ja'));
    setOptions(column, columns, '選択', (value) => value.toUpperCase());
    if (columns.includes(current)) column.value = current;
  }

  function rebuildTemps() {
    const selectedColumn = column.value;
    const temps = unique(groups()
      .filter((group) => group.column === selectedColumn)
      .map((group) => group.temp))
      .sort((a, b) => Number(a) - Number(b));

    setOptions(temp, temps, '選択', (value) => `${value}℃`);
    temp.disabled = !selectedColumn;
    analyte.disabled = true;
    setOptions(analyte, [], '選択してください');
  }

  function rebuildAnalytes() {
    const selectedColumn = column.value;
    const selectedTemp = temp.value;
    const allGroups = groups();
    const availableRows = allGroups
      .filter((group) => group.column === selectedColumn && group.temp === selectedTemp)
      .sort((a, b) => a.analyte.localeCompare(b.analyte, 'ja'));

    const availableMap = new Map(availableRows.map((group) => [group.analyte, group]));
    const fallbackAnalytes = allGroups
      .filter((group) => group.column === selectedColumn)
      .map((group) => group.analyte);
    const allAnalytes = unique([...masterAnalytes, ...fallbackAnalytes, ...availableRows.map((group) => group.analyte)])
      .sort((a, b) => a.localeCompare(b, 'ja'));
    const unavailableAnalytes = allAnalytes.filter((name) => !availableMap.has(name));

    const availableOptions = availableRows
      .map((group) => `<option value="${escapeHtml(group.key)}">${escapeHtml(group.analyte)}</option>`)
      .join('');
    const unavailableOptions = unavailableAnalytes
      .map((name) => `<option disabled>${escapeHtml(name)}（${escapeHtml(selectedTemp)}℃係数未登録）</option>`)
      .join('');

    analyte.innerHTML = '<option value="">選択してください</option>'
      + (availableOptions ? `<optgroup label="この条件で使用可">${availableOptions}</optgroup>` : '')
      + (unavailableOptions ? `<optgroup label="係数未登録">${unavailableOptions}</optgroup>` : '');
    analyte.disabled = !(selectedColumn && selectedTemp);
  }

  function syncFromHidden() {
    if (!hidden.value) return;
    const selected = parseKey(hidden.value);
    rebuildColumns();
    column.value = selected.column;
    rebuildTemps();
    temp.value = selected.temp;
    rebuildAnalytes();
    analyte.value = hidden.value;
  }

  column.addEventListener('change', () => {
    rebuildTemps();
    clearHiddenSelection();
    if (message) message.textContent = column.value ? '温度を選択してください。' : 'カラムを選択してください。';
  });

  temp.addEventListener('change', () => {
    rebuildAnalytes();
    clearHiddenSelection();
    if (message) message.textContent = temp.value ? '物質を選択してください。係数未登録の物質も一覧で確認できます。' : '温度を選択してください。';
  });

  analyte.addEventListener('change', () => {
    hidden.value = analyte.value;
    internalDispatch = true;
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
    internalDispatch = false;
  });

  hidden.addEventListener('change', () => {
    if (!internalDispatch) syncFromHidden();
  });

  summaryCards?.addEventListener('click', (event) => {
    if (!event.target.closest('.factor-use-btn')) return;
    window.setTimeout(syncFromHidden, 0);
  });

  const observer = new MutationObserver(() => {
    rebuildColumns();
    if (hidden.value) syncFromHidden();
  });
  observer.observe(hidden, { childList: true });

  fetch('./data/gc-std-master.json', { cache: 'no-cache' })
    .then((response) => response.ok ? response.json() : [])
    .then((rows) => {
      masterAnalytes = unique((Array.isArray(rows) ? rows : [])
        .map((row) => row?.display_name || row?.normalized_name)
        .filter(Boolean));
      if (column.value && temp.value) rebuildAnalytes();
    })
    .catch(() => {
      masterAnalytes = [];
    });

  rebuildColumns();
})();