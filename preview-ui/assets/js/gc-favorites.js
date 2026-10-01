(() => {
  const DEFAULT_PATH = 'data/gc-favorite-analytes.json';

  function normalize(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s　]+/g, '')
      .replace(/[_-]/g, '')
      .normalize('NFKC');
  }

  async function load(path = DEFAULT_PATH) {
    try {
      const response = await fetch(path, { cache: 'no-cache' });
      if (!response.ok) throw new Error('favorite data load failed');
      const data = await response.json();
      return {
        common: Array.isArray(data?.common) ? data.common : [],
        liquid_standard: Array.isArray(data?.liquid_standard) ? data.liquid_standard : []
      };
    } catch (_error) {
      return { common: [], liquid_standard: [] };
    }
  }

  window.GcFavorites = {
    load,
    normalize
  };
})();
