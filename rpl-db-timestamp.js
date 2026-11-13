// RPL: mostra data e ora dell'ultimo aggiornamento riuscito della classifica
(() => {
  function install() {
    const status = document.getElementById("status");
    if (!status || status.dataset.rplTimestampObserver === "1") return;
    status.dataset.rplTimestampObserver = "1";

    function stamp() {
      const current = status.textContent || "";
      if (!current.includes("Dati aggiornati dal database RPL")) return;
      if (status.querySelector(".rpl-db-updated-at")) return;

      const label = document.createElement("span");
      label.className = "rpl-db-updated-at";
      label.textContent = " · Ultimo aggiornamento: " + new Date().toLocaleString("it-IT", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
      label.style.cssText = "display:inline-block;margin-left:5px;font-size:inherit;color:inherit";
      status.appendChild(label);
    }

    stamp();
    const observer = new MutationObserver(records => {
      // Ignora le mutazioni create dall'etichetta stessa: evita un ciclo infinito.
      const onlyOwnLabel = records.every(record =>
        [...record.addedNodes, ...record.removedNodes].every(node =>
          node.nodeType === 1 && node.classList && node.classList.contains("rpl-db-updated-at")
        )
      );
      if (!onlyOwnLabel) {
        const label = status.querySelector(".rpl-db-updated-at");
        if (label && !(status.textContent || "").includes("Dati aggiornati dal database RPL")) label.remove();
        stamp();
      }
    });
    observer.observe(status, { childList: true, characterData: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();