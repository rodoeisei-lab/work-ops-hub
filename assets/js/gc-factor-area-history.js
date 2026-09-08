(() => {
  const groupSelect = document.getElementById('calc-group');
  const host = document.getElementById('calc-area-history');
  if (!groupSelect || !host) return;

  let records = [];
  let stdMap = new Map();

  const normalize = (value) => String(value ?? '').trim().toLowerCase();
  const fmtArea = (value) => Number.isFinite(value)
    ? Math.round(value).toLocaleString('ja-JP')
    : '—';
  const fmtDate = (value) => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return String(value || '');
    return `${Number(match[2])}/${Number(match[3])}`;
  };

  function buildStdMap(rows) {
    stdMap = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const value = Number(row?.std_value);
      if (!Number.isFinite(value)) return;
      [row?.display_name, row?.normalized_name, row?.raw_label, ...(Array.isArray(row?.aliases) ? row.aliases : [])]
        .forEach((key) => {
          const normalized = normalize(key);
          if (normalized) stdMap.set(normalized, value);
        });
    });
  }

  function render() {
    const key = groupSelect.value;
    if (!key) {
      host.textContent = '';
      return;
    }

    const [columnId, tempText, ...analyteParts] = key.split('|');
    const analyte = analyteParts.join('|');
    const temp = Number(tempText);
    const matched = records.filter((record) =>
      record.column_id === columnId &&
      Number(record.temp_c) === temp &&
      record.analyte === analyte
    );

    if (!matched.length) {
      host.textContent = '';
      return;
    }

    const masterStd = stdMap.get(normalize(analyte));
    const items = matched
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((record) => {
        const std = Number.isFinite(masterStd) ? masterStd : Number(record.std_ppm);
        const factor = Number(record.factor);
        const area = Number.isFinite(std) && Number.isFinite(factor) && factor > 0 ? std / factor : NaN;
        return `${fmtDate(record.date)} ${fmtArea(area)}`;
      });

    host.textContent = `STDエリア ${items.join(' / ')}`;
  }

  async function init() {
    try {
      const [factorRes, masterRes] = await Promise.all([
        fetch('./data/gc-factor-library.json', { cache: 'no-cache' }),
        fetch('./data/gc-std-master.json', { cache: 'no-cache' })
      ]);
      if (!factorRes.ok || !masterRes.ok) return;
      const [factorData, masterData] = await Promise.all([factorRes.json(), masterRes.json()]);
      records = (factorData.records || []).filter((record) => record.machine_id === 'gc2014');
      buildStdMap(masterData);
      render();
    } catch (_error) {
      host.textContent = '';
    }
  }

  groupSelect.addEventListener('change', render);
  init();
})();
