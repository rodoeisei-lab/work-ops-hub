(function () {
  const targetUrl = 'https://rodoeisei-lab.github.io/work-ops-hub/inventory-memo.html';
  document.getElementById('targetUrl').textContent = targetUrl;
  document.getElementById('printBtn').addEventListener('click', () => window.print());
})();
