(function () {
  const STORAGE_KEY = 'inventory-memo-compact-v7';

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (!Array.isArray(parsed.expiredEntries)) parsed.expiredEntries = [];
      return parsed;
    } catch (_) {
      return { expiredEntries: [] };
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function clearState() {
    localStorage.removeItem(STORAGE_KEY);
  }

  window.InventoryStorage = {
    loadState,
    saveState,
    clearState,
    STORAGE_KEY
  };
})();
