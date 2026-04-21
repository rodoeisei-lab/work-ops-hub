(() => {
  const DATA_PATH = 'data/gc-std-master.json';

  const STATUS_LABEL = {
    confirmed: '確定',
    provisional: '仮採用',
    needs_review: '要確認'
  };

  const CONFIDENCE_LABEL = {
    high: '高',
    medium: '中',
    low: '低'
  };

  const els = {
    searchInput: document.getElementById('searchInput'),
    needsReviewOnly: document.getElementById('needsReviewOnly'),
    summaryText: document.getElementById('summaryText'),
    stdTableBody: document.getElementById('stdTableBody')
  };

  let allRows = [];

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function badge(className, text) {
    return `<span class="badge ${className}">${escapeHtml(text)}</span>`;
  }

  function getSearchText(row) {
    return [row.raw_label, row.display_name, row.normalized_name, row.note]
      .filter((item) => typeof item === 'string' && item.length > 0)
      .join(' ')
      .toLowerCase();
  }

  function filterRows() {
    const query = els.searchInput.value.trim().toLowerCase();
    const needsReviewOnly = els.needsReviewOnly.checked;

    return allRows.filter((row) => {
      if (needsReviewOnly && row.status !== 'needs_review') {
        return false;
      }

      if (!query) {
        return true;
      }

      return getSearchText(row).includes(query);
    });
  }

  function renderSummary(filteredRows) {
    const total = allRows.length;
    const current = filteredRows.length;
    const reviewCount = filteredRows.filter((row) => row.status === 'needs_review').length;
    els.summaryText.textContent = `表示 ${current} / 全 ${total} 件（要確認 ${reviewCount} 件）`;
  }

  function renderTable(filteredRows) {
    if (!filteredRows.length) {
      els.stdTableBody.innerHTML = '<tr><td colspan="6" class="empty-cell">該当データがありません。</td></tr>';
      return;
    }

    const rowsHtml = filteredRows
      .map((row) => {
        const confidenceLabel = CONFIDENCE_LABEL[row.confidence] || row.confidence || '-';
        const statusLabel = STATUS_LABEL[row.status] || row.status || '-';
        const stdValue = Number.isFinite(row.std_value) ? row.std_value.toFixed(2).replace(/\.00$/, '') : '-';

        return `
          <tr>
            <td>${escapeHtml(row.raw_label || '')}</td>
            <td>${escapeHtml(row.display_name || row.normalized_name || '')}</td>
            <td class="std-cell">${escapeHtml(stdValue)}</td>
            <td>${badge(`badge-confidence-${row.confidence}`, confidenceLabel)}</td>
            <td>${badge(`badge-status-${row.status}`, statusLabel)}</td>
            <td>${escapeHtml(row.note || '')}</td>
          </tr>
        `;
      })
      .join('');

    els.stdTableBody.innerHTML = rowsHtml;
  }

  function render() {
    const filteredRows = filterRows();
    renderSummary(filteredRows);
    renderTable(filteredRows);
  }

  async function init() {
    try {
      const response = await fetch(DATA_PATH, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`データ読み込みに失敗しました (${response.status})`);
      }
      const data = await response.json();
      allRows = Array.isArray(data) ? data : [];
      render();
    } catch (error) {
      console.error(error);
      els.summaryText.textContent = 'データ読み込みに失敗しました。';
      els.stdTableBody.innerHTML = `<tr><td colspan="6" class="empty-cell">${escapeHtml(error.message)}</td></tr>`;
    }
  }

  els.searchInput.addEventListener('input', render);
  els.needsReviewOnly.addEventListener('change', render);

  init();
})();
