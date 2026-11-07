/* Royal Padel League — mapping loghi giocatori */
(() => {
  const previous = window.logoFile;
  const playerLogos = {
    'Paolo Cavallaro': './paolo-cavallaro.webp',
    'Vincenzo Ragona': 'https://vanbadzkxvextdvnqwtr.supabase.co/storage/v1/object/public/avatars/players/25/logo.jpg'
  };
  window.logoFile = function(name) {
    const key = String(name || '').trim();
    // I loghi dei nuovi giocatori vengono letti direttamente dalla colonna
    // players.logo_url: non occorre più modificare manualmente questa mappa.
    const player = (window.dbPlayers || []).find(p => String(p.name || '').trim() === key);
    if (player && player.logo_url) return player.logo_url;
    if (playerLogos[key]) return playerLogos[key];
    return typeof previous === 'function' ? previous(name) : '';
  };
  if (typeof window.loadRanking === 'function') {
    window.loadRanking().catch(err => console.error('RPL logo refresh:', err));
  }
})();