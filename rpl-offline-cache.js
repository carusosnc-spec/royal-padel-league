// Royal Padel League - cache locale dei dati pubblici di classifica e giocatori
(() => {
  const DB_NAME = "rpl-offline-data";
  const STORE = "snapshots";
  const KEY = "ranking-and-players";
  let running = false;
  let apiRef = null;
  let lastSavedAt = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function readSnapshot() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => { db.close(); resolve(request.result || null); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }
  async function saveSnapshot(snapshot) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(snapshot, KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }
  function statusText(text) {
    const el = document.getElementById("status");
    if (el) el.textContent = text;
  }
  function formatDate(value) {
    return new Date(value).toLocaleString("it-IT", {
      day:"2-digit", month:"2-digit", year:"numeric",
      hour:"2-digit", minute:"2-digit", second:"2-digit"
    });
  }
  async function refresh() {
    if (running || !navigator.onLine || !apiRef) return;
    running = true;
    try {
      await apiRef.loadPlayers();
      apiRef.buildSets();
      await apiRef.loadRanking();
      const el = document.getElementById("status");
      if (!el || !(el.textContent || "").includes("Dati aggiornati dal database RPL")) return;
      const players = (apiRef.getPlayers() || []).map(p => ({
        id:p.id, name:p.name, nickname:p.nickname || "", is_guest:!!p.is_guest,
        active:!!p.active, fascia:p.fascia, fascia_value:p.fascia_value,
        logo_url:p.logo_url || null
      }));
      const stats = (apiRef.getStats() || []).map(s => ({
        id:s.id, name:s.name, nick:s.nick || "", fascia:s.fascia,
        value:s.value, sets:s.sets, pt:s.pt, games:s.games, mvp:s.mvp, imb:s.imb
      }));
      lastSavedAt = new Date().toISOString();
      await saveSnapshot({players, stats, savedAt:lastSavedAt, schema:1});
      apiRef.setHasSnapshot(true);
      // Scrive la data direttamente nel messaggio di stato dopo il salvataggio verificato.
      statusText("Dati aggiornati dal database RPL · Ultimo aggiornamento: " + formatDate(lastSavedAt) + ".");
    } catch (error) {
      // Se il refresh fallisce, i dati già mostrati restano disponibili.
      if (apiRef.hasSnapshot() && lastSavedAt) statusText("Classifica offline · dati salvati il " + formatDate(lastSavedAt) + ". Le modifiche richiedono la connessione.");
      else if (!apiRef.hasSnapshot()) statusText("Connessione al database RPL non disponibile. Riprova quando la rete torna attiva.");
    } finally {
      running = false;
    }
  }
  window.RPLOfflineBoot = async function(api) {
    apiRef = api;
    let snapshot = null;
    try { snapshot = await readSnapshot(); } catch (_) {}
    if (snapshot && snapshot.schema === 1 && Array.isArray(snapshot.players) && Array.isArray(snapshot.stats)) {
      api.setPlayers(snapshot.players);
      api.setStats(snapshot.stats);
      api.fill();
      api.render();
      api.setHasSnapshot(true);
      lastSavedAt = snapshot.savedAt;
      statusText("Classifica offline · dati salvati il " + formatDate(snapshot.savedAt) + ". In aggiornamento dal database RPL…");
    }
    if (navigator.onLine) {
      await refresh();
    } else if (snapshot) {
      statusText("Classifica offline · dati salvati il " + formatDate(snapshot.savedAt) + ". Le modifiche richiedono la connessione.");
    } else {
      statusText("Sei offline e non ci sono ancora dati RPL salvati su questo telefono. Riapri l'app con connessione per scaricarli.");
    }
    window.addEventListener("online", () => refresh());
  };
})();