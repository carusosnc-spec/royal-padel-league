/* Royal Padel League — Ultimi 10 set nel profilo pubblico
 * Release 1.0. Caricare nella root del repository e includere con:
 * <script src="./rpl-last-sets.js?v=1" defer></script>
 */
(function () {
  "use strict";

  const STYLE_ID = "rpl-last-sets-style";
  const SECTION_ID = "rpl-last-sets-section";
  const MAX_SETS = 10;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function playerName(id, players) {
    const p = players.find(function (x) { return String(x.id) === String(id); });
    return p ? (p.name || ("Giocatore " + id)) : ("Giocatore " + id);
  }

  function playerLabel(id, players) {
    const p = players.find(function (x) { return String(x.id) === String(id); });
    if (!p) return "Giocatore " + id;
    return p.nickname ? p.name + " “" + p.nickname + "”" : p.name;
  }

  function dateLabel(value) {
    if (!value) return "Data non disponibile";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Data non disponibile";
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SECTION_ID}{margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12)}
      #${SECTION_ID} .rpl-ls-title{font-size:15px;font-weight:900;letter-spacing:.04em;margin:0 0 10px}
      #${SECTION_ID} .rpl-ls-sub{font-size:12px;opacity:.72;margin:-5px 0 10px}
      #${SECTION_ID} .rpl-ls-row{display:grid;grid-template-columns:54px minmax(0,1fr) 20px;align-items:center;gap:9px;width:100%;text-align:left;padding:10px 8px;margin:5px 0;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.035);color:inherit;cursor:pointer}
      #${SECTION_ID} .rpl-ls-mark{font-size:26px;line-height:1;font-weight:1000;text-align:center}
      #${SECTION_ID} .rpl-ls-mark.win{color:#20c878}
      #${SECTION_ID} .rpl-ls-mark.loss{color:#ff5c62}
      #${SECTION_ID} .rpl-ls-main{min-width:0}
      #${SECTION_ID} .rpl-ls-score{font-size:14px;font-weight:900}
      #${SECTION_ID} .rpl-ls-date{font-size:11px;opacity:.72;margin-top:2px}
      #${SECTION_ID} .rpl-ls-chevron{opacity:.65;font-size:14px}
      #${SECTION_ID} .rpl-ls-detail{display:none;padding:2px 12px 11px 71px;font-size:12px;line-height:1.55;overflow-wrap:anywhere}
      #${SECTION_ID} .rpl-ls-detail.open{display:block}
      #${SECTION_ID} .rpl-ls-detail b{opacity:.9}
      #${SECTION_ID} .rpl-ls-empty{font-size:13px;opacity:.75;padding:10px 0}
      @media(max-width:420px){#${SECTION_ID} .rpl-ls-row{grid-template-columns:46px minmax(0,1fr) 16px;padding:9px 6px;gap:7px}#${SECTION_ID} .rpl-ls-mark{font-size:24px}#${SECTION_ID} .rpl-ls-detail{padding-left:59px}}
    `;
    document.head.appendChild(style);
  }

  async function loadSets(playerId) {
    const sb = window.sb;
    if (!sb || typeof sb.from !== "function") throw new Error("Connessione al database non disponibile.");
    const [playersResult, matchesResult] = await Promise.all([
      sb.from("players").select("id,name,nickname").eq("active", true),
      sb.from("matches").select("id,played_at,approval_status").or("approval_status.eq.confirmed,approval_status.is.null").order("played_at", { ascending: false }).limit(100)
    ]);
    if (playersResult.error) throw playersResult.error;
    if (matchesResult.error) throw matchesResult.error;

    const players = playersResult.data || [];
    const matches = matchesResult.data || [];
    if (!matches.length) return { players: players, items: [] };

    const matchIds = matches.map(function (m) { return m.id; });
    const setsResult = await sb.from("sets")
      .select("id,match_id,set_number,pair_a_player_1,pair_a_player_2,pair_b_player_1,pair_b_player_2,games_a,games_b")
      .in("match_id", matchIds)
      .order("set_number", { ascending: false });
    if (setsResult.error) throw setsResult.error;

    const matchMap = new Map(matches.map(function (m) { return [String(m.id), m]; }));
    const items = (setsResult.data || []).filter(function (s) {
      return [s.pair_a_player_1, s.pair_a_player_2, s.pair_b_player_1, s.pair_b_player_2]
        .some(function (id) { return String(id) === String(playerId); });
    }).map(function (s) {
      const sideA = [s.pair_a_player_1, s.pair_a_player_2];
      const sideB = [s.pair_b_player_1, s.pair_b_player_2];
      const isA = sideA.some(function (id) { return String(id) === String(playerId); });
      const mySide = isA ? sideA : sideB;
      const otherSide = isA ? sideB : sideA;
      const mine = Number(isA ? s.games_a : s.games_b);
      const theirs = Number(isA ? s.games_b : s.games_a);
      const match = matchMap.get(String(s.match_id)) || {};
      return {
        id: s.id,
        matchId: s.match_id,
        setNumber: s.set_number,
        date: match.played_at,
        partner: mySide.find(function (id) { return String(id) !== String(playerId); }),
        opponents: otherSide,
        mine: mine,
        theirs: theirs,
        won: mine > theirs
      };
    });

    items.sort(function (a, b) {
      const da = new Date(a.date || 0).getTime();
      const db = new Date(b.date || 0).getTime();
      return db - da || Number(b.matchId) - Number(a.matchId) || Number(b.setNumber) - Number(a.setNumber);
    });
    return { players: players, items: items.slice(0, MAX_SETS) };
  }

  function renderSection(body, playerId, data) {
    const existing = body.querySelector("#" + SECTION_ID);
    if (existing) existing.remove();
    const section = document.createElement("section");
    section.id = SECTION_ID;
    const rows = data.items.map(function (item, i) {
      const detailId = SECTION_ID + "-detail-" + i;
      const score = item.mine + "–" + item.theirs;
      const partner = item.partner == null ? "Non indicato" : playerLabel(item.partner, data.players);
      const opponents = item.opponents.map(function (id) { return playerLabel(id, data.players); }).join(" e ");
      return `
        <button type="button" class="rpl-ls-row" aria-expanded="false" aria-controls="${detailId}" data-rpl-ls-toggle="${detailId}">
          <span class="rpl-ls-mark ${item.won ? "win" : "loss"}">${item.won ? "V" : "P"}</span>
          <span class="rpl-ls-main"><span class="rpl-ls-score">${esc(score)} <span style="font-size:11px;font-weight:700;opacity:.72">· Set ${esc(item.setNumber || "—")}</span></span><span class="rpl-ls-date">${esc(dateLabel(item.date))}</span></span>
          <span class="rpl-ls-chevron">⌄</span>
        </button>
        <div class="rpl-ls-detail" id="${detailId}">
          <div><b>Compagno:</b> ${esc(partner)}</div>
          <div><b>Avversari:</b> ${esc(opponents)}</div>
          <div><b>Risultato:</b> ${esc(score)} · ${item.won ? "Vittoria" : "Sconfitta"}</div>
          <div><b>Partita:</b> ${esc(dateLabel(item.date))}</div>
        </div>`;
    }).join("");
    section.innerHTML = `
      <h3 class="rpl-ls-title">🎾 ULTIMI 10 SET</h3>
      <p class="rpl-ls-sub">Tocca un set per vedere compagno, avversari e risultato.</p>
      ${rows || '<div class="rpl-ls-empty">Nessun set confermato disponibile.</div>'}`;
    section.addEventListener("click", function (event) {
      const button = event.target.closest("[data-rpl-ls-toggle]");
      if (!button) return;
      const detail = section.querySelector("#" + button.getAttribute("data-rpl-ls-toggle"));
      if (!detail) return;
      const open = detail.classList.toggle("open");
      button.setAttribute("aria-expanded", open ? "true" : "false");
      const chevron = button.querySelector(".rpl-ls-chevron");
      if (chevron) chevron.textContent = open ? "⌃" : "⌄";
    });
    body.appendChild(section);
  }

  let requestToken = 0;
  async function maybeLoadProfile() {
    const modal = document.getElementById("rplPlayerProfileModal");
    const body = document.getElementById("rplPlayerProfileModalBody");
    if (!modal || !body || modal.classList.contains("hidden")) return;
    const title = body.querySelector(".rpl-profile-modal-title");
    if (!title) return;
    const playerId = window.__rplLastSetsPlayerId;
    if (!playerId) return;
    const token = ++requestToken;
    ensureStyles();
    try {
      const data = await loadSets(playerId);
      if (token !== requestToken || modal.classList.contains("hidden")) return;
      renderSection(body, playerId, data);
    } catch (error) {
      if (token !== requestToken) return;
      const old = body.querySelector("#" + SECTION_ID);
      if (old) old.remove();
      const section = document.createElement("section");
      section.id = SECTION_ID;
      section.innerHTML = '<h3 class="rpl-ls-title">🎾 ULTIMI 10 SET</h3><div class="rpl-ls-empty">Impossibile caricare lo storico dei set in questo momento.</div>';
      body.appendChild(section);
      console.warn("[RPL ultimi set]", error);
    }
  }

  function getPlayerIdFromProfileCall() {
    const original = window.openRplPlayerProfile;
    if (typeof original !== "function" || original.__rplLastSetsWrapped) return false;
    const wrapped = async function (playerId) {
      window.__rplLastSetsPlayerId = playerId;
      const result = await original.apply(this, arguments);
      window.setTimeout(maybeLoadProfile, 80);
      return result;
    };
    wrapped.__rplLastSetsWrapped = true;
    window.openRplPlayerProfile = wrapped;
    return true;
  }

  function init() {
    ensureStyles();
    if (getPlayerIdFromProfileCall()) return;
    let attempts = 0;
    const timer = window.setInterval(function () {
      attempts += 1;
      if (getPlayerIdFromProfileCall() || attempts > 80) window.clearInterval(timer);
    }, 250);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();