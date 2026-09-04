(() => {
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

  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  const parseNumber = (value) => {
    const normalized = String(value || '').replace(/,/g, '').trim();
    if (!normalized) return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  };
  const formatArea = (value) => Number(value).toLocaleString('ja-JP', {
    maximumFractionDigits: 3
  });
  const formatLimit = (value) => Number(value).toString();
  const setText = (element, text) => {
    if (element && element.textContent !== text) element.textContent = text;
  };

  function getNdLimit(materialName) {
    const name = normalize(materialName);
    if (!name) return null;
    if (name.includes('セロソルブ') || name.includes('セルソルブ') || name.includes('cellosolve')) return 0.1;
    return ND_LIMITS.get(name) ?? null;
  }

  function getSelectedMaterialName(rowRoot) {
    const select = rowRoot.querySelector('.material-select');
    if (!select?.value) return '';
    return select.selectedOptions?.[0]?.textContent?.trim() || '';
  }

  function ensurePanel(rowRoot, samplesBlock) {
    let panel = rowRoot.querySelector('[data-nd-threshold-panel]');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'nd-threshold-panel';
    panel.dataset.ndThresholdPanel = '';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <span class="nd-threshold-panel__label">ND基準エリア</span>
      <strong class="nd-threshold-panel__area">—</strong>
      <span class="nd-threshold-panel__limit"></span>
    `;
    samplesBlock.before(panel);
    return panel;
  }

  function updateRow(rowRoot) {
    if (rowRoot.classList.contains('calc-row--collapsed')) return;
    const samplesBlock = rowRoot.querySelector('.samples-block');
    if (!samplesBlock) return;

    const materialName = getSelectedMaterialName(rowRoot);
    const ndLimit = getNdLimit(materialName);
    const existingPanel = rowRoot.querySelector('[data-nd-threshold-panel]');

    if (ndLimit == null) {
      existingPanel?.remove();
      return;
    }

    const panel = ensurePanel(rowRoot, samplesBlock);
    const areaOutput = panel.querySelector('.nd-threshold-panel__area');
    const limitOutput = panel.querySelector('.nd-threshold-panel__limit');
    const std = parseNumber(rowRoot.querySelector('.std-input')?.value);
    const stdArea = parseNumber(rowRoot.querySelector('.std-area-input')?.value);

    setText(limitOutput, `報告下限 ${formatLimit(ndLimit)} ppm`);

    if (std == null || std <= 0 || stdArea == null || stdArea <= 0) {
      panel.classList.remove('is-ready');
      setText(areaOutput, 'STDエリア入力後に表示');
      return;
    }

    const thresholdArea = ndLimit * stdArea / std;
    panel.classList.add('is-ready');
    setText(areaOutput, `エリア ${formatArea(thresholdArea)} 未満 → ND`);
  }

  function init() {
    const rowsContainer = document.getElementById('rowsContainer');
    if (!rowsContainer) return;

    let rafId = 0;
    const updateAll = () => {
      rafId = 0;
      rowsContainer.querySelectorAll('.calc-row').forEach(updateRow);
    };
    const scheduleUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(updateAll);
    };

    document.addEventListener('input', (event) => {
      if (event.target.closest?.('.calc-row')) scheduleUpdate();
    });
    document.addEventListener('change', (event) => {
      if (event.target.closest?.('.calc-row')) scheduleUpdate();
    });

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(rowsContainer, { childList: true, subtree: true });
    scheduleUpdate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
