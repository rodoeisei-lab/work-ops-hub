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

  document.body.classList.remove('has-floating-nav');
})();
