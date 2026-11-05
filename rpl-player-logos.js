/* Royal Padel League — Paolo Cavallaro / The Tow King */
(() => {
  const previous = window.logoFile;
  window.logoFile = function(name) {
    if (String(name || '').trim() === 'Paolo Cavallaro') return './paolo-cavallaro.webp';
    return typeof previous === 'function' ? previous(name) : '';
  };
  if (typeof window.loadRanking === 'function') {
    window.loadRanking().catch(err => console.error('RPL logo refresh:', err));
  }
})();
