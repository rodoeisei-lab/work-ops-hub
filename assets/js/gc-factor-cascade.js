(() => {
  const hidden = document.getElementById('calc-group');
  const column = document.getElementById('calc-column');
  const temp = document.getElementById('calc-temp');
  const analyte = document.getElementById('calc-analyte');
  const summaryCards = document.getElementById('factor-summary-cards');
  const message = document.getElementById('calc-message');
  if (!hidden || !column || !temp || !analyte) return;

  let internalDispatch = false;

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
      .map((value) => `<option value="${value}">${formatter(value)}</option>`)
      .join('');
  }

  function unique(values) {
    return [...new Set(values)];
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
    const rows = groups()
      .filter((group) => group.column === selectedColumn && group.temp === selectedTemp)
      .sort((a, b) => a.analyte.localeCompare(b.analyte, 'ja'));

    analyte.innerHTML = '<option value="">選択してください</option>' + rows
      .map((group) => `<option value="${group.key}">${group.analyte}</option>`)
      .join('');
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
    if (message) message.textContent = temp.value ? '物質を選択してください。' : '温度を選択してください。';
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

  rebuildColumns();
})();