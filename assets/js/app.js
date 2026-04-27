(function () {
  const todayEl = document.getElementById('todayLabel');
  if (todayEl) {
    const now = new Date();
    const label = `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日`;
    todayEl.textContent = label;
  }

  const path = window.location.pathname;
  const page = (path.split('/').pop() || 'index.html').toLowerCase();
  const isHome = page === '' || page === 'index.html';

  const main = document.querySelector('main');
  if (!main) return;

  if (document.querySelector('.actions')) {
    document.body.classList.add('has-sticky-actions');
  }

  if (!isHome && !document.querySelector('.back-home-link')) {
    const topLink = document.createElement('a');
    topLink.href = 'index.html';
    topLink.className = 'back-home-link no-print';
    topLink.textContent = '← トップへ戻る';
    main.insertAdjacentElement('afterbegin', topLink);
  }

  const navLinks = [
    { href: 'index.html', label: 'トップ', pages: ['index.html'] },
    { href: 'inventory-memo.html', label: '在庫', pages: ['inventory-memo.html'] },
    { href: 'gc-day-plan.html', label: 'GC当日', pages: ['gc-day-plan.html'] },
    { href: 'gc-method-finder.html', label: 'GC条件', pages: ['gc-method-finder.html'] },
    { href: 'gc-rt-library.html', label: 'RT', pages: ['gc-rt-library.html'] },
    { href: 'gc-std-master.html', label: 'STD', pages: ['gc-std-master.html'] }
  ];

  if (!document.querySelector('.quick-nav')) {
    const nav = document.createElement('nav');
    nav.className = 'quick-nav no-print';
    nav.setAttribute('aria-label', '主要ページ');
    nav.innerHTML = navLinks.map((item) => {
      const active = item.pages.includes(page) ? ' class="active" aria-current="page"' : '';
      return `<a href="${item.href}"${active}>${item.label}</a>`;
    }).join('');
    document.body.appendChild(nav);
    document.body.classList.add('has-floating-nav');
  }

  if (!isHome && !document.querySelector('.home-floating-button')) {
    const floatingButton = document.createElement('a');
    floatingButton.href = 'index.html';
    floatingButton.className = 'home-floating-button no-print';
    floatingButton.textContent = 'トップ';
    floatingButton.setAttribute('aria-label', 'トップへ戻る');
    document.body.appendChild(floatingButton);
  }
})();
