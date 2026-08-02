"use strict";

(function clearSignedOutAdminState() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reason") !== "signed-out") return;
    window.sessionStorage.removeItem("econovaria.admin.auth.v1");
    window.EconovariaAdminGameSelection?.clear?.();
    window.sessionStorage.removeItem("econovaria.admin.csrf.v1");
  } catch (_) {}
})();
