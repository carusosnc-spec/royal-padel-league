// RPL: mostra data e ora dell'ultimo caricamento classifica riuscito
(() => {
  const status = document.getElementById("status");
  if (!status) return;
  const stamp = () => {
    const current = status.textContent || "";
    if (!current.includes("Dati aggiornati dal database RPL")) return;
    if (status.querySelector(".rpl-db-updated-at")) return;
    const time = new Date().toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
    const label = document.createElement("span");
    label.className = "rpl-db-updated-at";
    label.textContent = " · Ultimo aggiornamento: " + time;
    label.style.cssText = "display:inline-block;margin-left:5px;font-size:inherit;color:inherit";
    status.appendChild(label);
  };
  stamp();
  new MutationObserver(() => {
    const old = status.querySelector(".rpl-db-updated-at");
    if (old) old.remove();
    stamp();
  }).observe(status, { childList: true, characterData: true, subtree: true });
})();