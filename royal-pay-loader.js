/* Royal Padel League — integrazione Royal Pay v9.1.94
   Caricare questo file nella stessa cartella di index.html e royal-pay.js.
   Non modifica Royal Bet Lab e non gestisce crediti virtuali.
*/
(function () {
  "use strict";
  var SITE_VERSION = "9.1.94";
  var SCRIPT_ID = "rplRoyalPayModuleScript";

  function updateVersionBadge() {
    var badge = document.getElementById("rplVersionBadge");
    if (badge) badge.textContent = "RPL v" + SITE_VERSION;
    document.documentElement.dataset.rplVersion = SITE_VERSION;
  }

  function loadRoyalPay() {
    updateVersionBadge();
    if (document.getElementById(SCRIPT_ID)) return;
    if (!window.sb) {
      window.setTimeout(loadRoyalPay, 300);
      return;
    }
    var script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "./royal-pay.js?v=" + SITE_VERSION;
    script.async = true;
    script.onerror = function () {
      console.error("[RPL Royal Pay] Impossibile caricare royal-pay.js");
    };
    document.body.appendChild(script);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadRoyalPay, { once: true });
  } else {
    loadRoyalPay();
  }

  var observer = new MutationObserver(updateVersionBadge);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
