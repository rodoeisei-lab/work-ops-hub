(function () {
  const todayEl = document.getElementById('todayLabel');
  if (!todayEl) return;

  const now = new Date();
  const label = `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日`;
  todayEl.textContent = label;
})();
