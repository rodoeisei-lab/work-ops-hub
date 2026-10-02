(function () {
  const main = document.querySelector('main');
  if (!main) return;
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const links = [
    ['gc-calculator.html', 'GC係数・ppm計算', 'calculator'], ['gc-method-finder.html', 'GC条件提案', 'sliders-horizontal'],
    ['gc-rt-library.html', 'GC RTグラフ', 'chart-no-axes-gantt'], ['gc-day-plan.html', 'GC当日プラン', 'calendar-days'],
    ['gc-factors.html', 'GC係数ライブラリ', 'library-big'], ['gc-std-master.html', 'GC標準液マスタ', 'flask-conical'],
    ['inventory-memo.html', '在庫メモ', 'box'], ['qr-print.html', 'QR印刷', 'qr-code'], ['update-guide.html', '更新手順', 'book-open']
  ];
  const icon = name => `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="assets/icons/ui.svg#${name}"></use></svg>`;
  const todayEl = document.getElementById('todayLabel');
  if (todayEl) todayEl.textContent = new Intl.DateTimeFormat('ja-JP', {year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const skip = document.createElement('a');
  skip.className = 'skip-link no-print'; skip.href = '#mainContent'; skip.textContent = '本文へ移動';
  main.id = 'mainContent'; main.tabIndex = -1; document.body.prepend(skip);
  if (page !== 'index.html') {
    document.querySelectorAll('.back-home-link, .factor-back').forEach(el => el.remove());
    const nav = document.createElement('div'); nav.className = 'tool-nav no-print';
    const home = document.createElement('a'); home.href = 'index.html'; home.className = 'back-home-link'; home.innerHTML = icon('house') + '<span>ホーム</span>';
    const details = document.createElement('details'); details.className = 'tool-menu';
    const summary = document.createElement('summary'); summary.innerHTML = icon('layout-grid') + '<span>他の機能</span>';
    const menu = document.createElement('nav'); menu.setAttribute('aria-label', '他の業務ツール');
    links.filter(([href]) => href !== page).forEach(([href, title, name]) => {
      const a = document.createElement('a'); a.href = href; a.innerHTML = icon(name) + `<span>${title}</span>`; menu.appendChild(a);
    });
    details.append(summary, menu);
    details.addEventListener('keydown', event => { if (event.key === 'Escape') { details.open = false; summary.focus(); } });
    document.addEventListener('click', event => { if (!details.contains(event.target)) details.open = false; });
    nav.append(home, details); main.prepend(nav);
  }
  const status = document.createElement('p'); status.className = 'tool-load-status';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  if (links.slice(0,7).some(([href]) => href === page)) status.textContent = 'データを読み込み中…';
  const header = main.querySelector('header, .factor-head, .top'); (header || main).appendChild(status);
  document.querySelectorAll(".table-wrap, .factor-table-wrap").forEach(wrap => { wrap.tabIndex = 0; wrap.setAttribute("role", "region"); wrap.setAttribute("aria-label", "データ一覧（横にスクロールできます）"); });
  let downloadUrl = null;
  window.addEventListener("pagehide", () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); });
  window.WorkOpsUi = {
    downloadCsv(content, filename, target) {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadUrl = URL.createObjectURL(new Blob([content], {type:'text/csv;charset=utf-8;'}));
      const link = document.createElement('a');
      link.href = downloadUrl; link.download = filename; link.className = 'csv-fallback-link';
      link.textContent = '保存されない場合はCSVをダウンロード';
      target.appendChild(document.createElement('br')); target.appendChild(link);
      link.click();
    },
    ready() { status.textContent = ''; status.classList.remove('is-error'); },
    error(message) { status.textContent = 'エラー：' + message; status.classList.add('is-error'); status.setAttribute('role', 'alert'); },
    result(target) {
      const node = typeof target === 'string' ? document.querySelector(target) : target;
      if (!node) return;
      node.setAttribute('tabindex', '-1'); node.focus({preventScroll:true}); node.scrollIntoView({block:'start',behavior:'auto'});
    }
  };
  document.querySelectorAll('[data-reset-filters]').forEach(button => {
    button.addEventListener('click', () => {
      button.closest('section').querySelectorAll('select, input').forEach(input => {
        if (input.type === 'checkbox') input.checked = false; else input.value = '';
        input.dispatchEvent(new Event('input', {bubbles:true})); input.dispatchEvent(new Event('change', {bubbles:true}));
      });
      button.closest('section').querySelector('input[type="search"], select')?.focus();
    });
  });
})();
