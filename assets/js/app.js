(function () {
  const todayEl = document.getElementById('todayLabel');
  if (todayEl) {
    const now = new Date();
    const label = `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日`;
    todayEl.textContent = label;
  }

  const path = window.location.pathname;
  const isHome = path.endsWith('/') || path.endsWith('/index.html') || path === 'index.html';
  if (isHome) return;

  const main = document.querySelector('main');
  if (!main) return;

  if (document.querySelector('.actions')) {
    document.body.classList.add('has-sticky-actions');
  }

  if (!document.querySelector('.back-home-link')) {
    const topLink = document.createElement('a');
    topLink.href = 'index.html';
    topLink.className = 'back-home-link no-print';
    topLink.textContent = '← トップへ戻る';
    main.insertAdjacentElement('afterbegin', topLink);
  }

  if (!document.querySelector('.home-floating-button')) {
    const floatingButton = document.createElement('a');
    floatingButton.href = 'index.html';
    floatingButton.className = 'home-floating-button no-print';
    floatingButton.textContent = 'トップ';
    floatingButton.setAttribute('aria-label', 'トップへ戻る');
    document.body.appendChild(floatingButton);
  }
})();
