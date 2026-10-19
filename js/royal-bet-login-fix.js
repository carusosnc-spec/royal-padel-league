(function () {
  'use strict';
  function show(message, kind) {
    var box = document.getElementById('rplFallbackError');
    if (!box) return;
    box.textContent = message;
    box.className = 'msg ' + (kind || '');
  }
  document.addEventListener('DOMContentLoaded', function () {
    var button = document.getElementById('rplLoginBtn');
    if (!button) return;
    button.addEventListener('click', function (event) {
      event.preventDefault();
      show('Pulsante ricevuto: verifica procedura di accesso…', '');
      if (typeof window.login !== 'function') {
        show('Errore tecnico: lo script principale di Royal Bet non ha caricato la funzione di accesso. Ricarica la pagina; se persiste, invia questo messaggio all’assistenza.', 'error');
        return;
      }
      try {
        var result = window.login();
        if (result && typeof result.catch === 'function') {
          result.catch(function (error) {
            show(error && error.message ? error.message : 'Errore durante l’accesso.', 'error');
          });
        }
      } catch (error) {
        show(error && error.message ? error.message : 'Errore durante l’accesso.', 'error');
      }
    });
  });
})();