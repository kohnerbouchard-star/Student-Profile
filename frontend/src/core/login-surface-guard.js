"use strict";

(function installLoginSurfaceGuard() {
  document.documentElement.classList.remove("preload");
  const image = document.querySelector("[data-econovaria-brand-image]");
  const mark = image?.closest(".logo-mark");
  const fail = function () { mark?.classList.add("has-brand-error"); };
  image?.addEventListener("load", function () { mark?.classList.remove("has-brand-error"); });
  image?.addEventListener("error", fail, { once: true });
  if (image?.complete && image.naturalWidth === 0) fail();
})();
