/* Royal Padel League — mapping loghi giocatori */
(() => {
  const previous = window.logoFile;
  const playerLogos = {
    'Paolo Cavallaro': './paolo-cavallaro.webp',
    'Vincenzo Ragona': 'https://vanbadzkxvextdvnqwtr.supabase.co/storage/v1/object/public/avatars/players/25/logo.jpg'
  };
  window.logoFile = function(name) {
    const key = String(name || '').trim();
    if (playerLogos[key]) return playerLogos[key];
    return typeof previous === 'function' ? previous(name) : '';
  };
  if (typeof window.loadRanking === 'function') {
    window.loadRanking().catch(err => console.error('RPL logo refresh:', err));
  }
})();