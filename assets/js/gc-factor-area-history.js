(() => {
  const groupSelect = document.getElementById('calc-group');
  const historyHost = document.getElementById('calc-area-history');
  const ndHost = document.getElementById('calc-nd-threshold');
  const factorHost = document.getElementById('calc-factor');
  if (!groupSelect || !historyHost) return;

  const ND_LIMITS = new Map([
    ['メタノール', 5],
    ['アセトン', 1],
    ['ipa', 1],
    ['n-ヘキサン', 1],
    ['mek', 1],
    ['酢酸エチル', 1],
    ['イソブタノール', 1],
    ['1-ブタノール', 1],
    ['mibk', 1],
    ['トルエン', 1],
    ['酢酸イソブチル', 1],
    ['酢酸ブチル', 1],
    ['エチルベンゼン', 1],
    ['p-キシレン', 1],
    ['o-キシレン', 1],
    ['スチレン', 1],
    ['シクロヘキサノン', 0.1]
  ]);

  let records = [];
  let stdMap = new Map();

  const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const fmtArea = (value) => Number.isFinite(value)
    ? Math.round(value).toLocaleString('ja-JP')
    : '—';
  const fmtDate = (value) => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return String(value || '');
    return `${Number(match[2])}/${Number(match[3])}`;
  };

  function getNdLimit(analyte) {
    const name = normalize(analyte);
    if (!name) return null;
    if (name.includes('セロソルブ') || name.includes('セルソルブ') || name.includes('cellosolve')) return 0.1;
    return ND_LIMITS.get(name) ?? null;
  }

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
      historyHost.textContent = '';
      if (ndHost) ndHost.textContent = '';
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
      historyHost.textContent = '';
    } else {
      const masterStd = stdMap.get(normalize(analyte));
      const items = matched
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((record) => {
          const std = Number.isFinite(masterStd) ? masterStd : Number(record.std_ppm);
          const factor = Number(record.factor);
          const area = Number.isFinite(std) && Number.isFinite(factor) && factor > 0 ? std / factor : NaN;
          return `${fmtDate(record.date)} ${fmtArea(area)}`;
        });

      historyHost.textContent = `STDエリア ${items.join(' / ')}`;
    }

    if (ndHost) {
      const ndLimit = getNdLimit(analyte);
      const factor = Number(String(factorHost?.textContent || '').replace(/,/g, '').trim());
      if (ndLimit == null || !Number.isFinite(factor) || factor <= 0) {
        ndHost.textContent = '';
      } else {
        const ndArea = ndLimit / factor;
        ndHost.textContent = `ND基準エリア ${fmtArea(ndArea)} 未満 → ND（報告下限 ${ndLimit} ppm）`;
      }
    }
  }

  function scheduleRender() {
    window.setTimeout(render, 0);
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
      scheduleRender();
    } catch (_error) {
      historyHost.textContent = '';
      if (ndHost) ndHost.textContent = '';
    }
  }

  groupSelect.addEventListener('change', scheduleRender);
  init();
})();
