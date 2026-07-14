(function initEconovariaAdminAssetWiring() {
  "use strict";

  const PLAYER_IDENTITY_MOTION = "./assets/media/player-identity-motion.svg";
  const MEDIA_PLACEHOLDER = "./assets/icons/media-placeholder.svg";

  const ORIGINAL_CURRENCY_ICONS = {
    NRC: "./assets/icons/currency-saturn.svg",
    YRC: "./assets/icons/currency-neptune.svg",
    THD: "./assets/icons/currency-arsenic.svg",
    SLV: "./assets/icons/currency-jupiter.svg",
    ELD: "./assets/icons/currency-alumen.svg",
    VAL: "./assets/icons/currency-gold.svg",
    LUM: "./assets/icons/currency-lapis_lazuli.svg",
    SYN: "./assets/icons/currency-alcali.svg",
    XAL: "./assets/icons/currency-lead.svg",
    DRV: "./assets/icons/currency-ferrum.svg",
  };

  const ORIGINAL_PLAYER_ACTION_ICONS = {
    "open-player-profile": "./assets/icons/player-id.svg",
    "adjust-player-balance": "./assets/icons/adjust-balance.svg",
    "player-settings": "./assets/icons/player-settings.svg",
    "message-player": "./assets/icons/message-player.svg",
  };

  function text(value) {
    return String(value ?? "").trim();
  }

  function resetFallbackState(image) {
    image.removeAttribute("data-admin-asset-fallback-applied");
    image.removeAttribute("data-admin-asset-original-src");
    image.removeAttribute("data-admin-asset-fallback-bound");
    if (image.alt === "Media unavailable") image.alt = "";
  }

  function restoreUiImage(image, source) {
    if (!source) return;
    resetFallbackState(image);
    image.setAttribute("aria-hidden", "true");
    image.setAttribute("loading", "lazy");
    image.style.removeProperty("filter");
    if (image.getAttribute("src") !== source) image.setAttribute("src", source);
  }

  function restoreOriginalCurrencySymbols(root = document) {
    root.querySelectorAll?.("img.admin-terminal-bank-currency-symbol").forEach((image) => {
      const amount = image.closest(".admin-terminal-currency-single-amount");
      const code = text(amount?.querySelector("i")?.textContent).toUpperCase();
      restoreUiImage(image, ORIGINAL_CURRENCY_ICONS[code]);
    });
  }

  function restoreOriginalPlayerActionIcons(root = document) {
    root.querySelectorAll?.("button[data-admin-terminal-action] img").forEach((image) => {
      const button = image.closest("button[data-admin-terminal-action]");
      const action = text(button?.getAttribute("data-admin-terminal-action"));
      restoreUiImage(image, ORIGINAL_PLAYER_ACTION_ICONS[action]);
    });
  }

  function replaceBrokenMotionMedia(root = document) {
    root.querySelectorAll?.("video").forEach((video) => {
      const source = video.querySelector("source");
      const sourceValue = text(source?.getAttribute("src"));
      if (
        sourceValue !== "window.ECONOVARIA_ADMIN_MOTION_BACKGROUND" &&
        !sourceValue.includes("ECONOVARIA_ADMIN_MOTION_BACKGROUND")
      ) {
        return;
      }

      const image = document.createElement("img");
      image.src = PLAYER_IDENTITY_MOTION;
      image.alt = "Player identity and RFID card illustration";
      image.loading = "eager";
      image.decoding = "async";
      image.className = video.className;
      image.style.cssText = `${video.style.cssText};width:100%;height:100%;object-fit:cover;display:block`;
      video.replaceWith(image);
    });
  }

  function isUiSymbolImage(image) {
    if (image.matches(".admin-terminal-bank-currency-symbol, .admin-terminal-bank-account-svg")) return true;
    if (image.closest("button[data-admin-terminal-action]")) return true;
    const source = text(image.getAttribute("src"));
    return /\/assets\/icons\/(?:currency-|player-|adjust-balance|message-player|bank-)/i.test(source);
  }

  function isContentMediaImage(image) {
    if (isUiSymbolImage(image)) return false;
    if (image.hasAttribute("data-admin-media-fallback")) return true;

    const context = [
      image.className,
      image.getAttribute("data-testid"),
      image.getAttribute("data-admin-asset-type"),
      image.closest("[class]")?.className,
    ].map(text).join(" ");

    return /(thumbnail|media|preview|cover|photo|avatar|player-asset|inventory-image|store-item-image|contract-material|uploaded-image)/i.test(context);
  }

  function installMediaFallbacks(root = document) {
    root.querySelectorAll?.("img:not([data-admin-asset-fallback-bound])").forEach((image) => {
      if (!isContentMediaImage(image)) return;
      image.setAttribute("data-admin-asset-fallback-bound", "true");
      image.addEventListener("error", () => {
        if (image.dataset.adminAssetFallbackApplied === "true") return;
        image.dataset.adminAssetOriginalSrc = text(image.getAttribute("src"));
        image.dataset.adminAssetFallbackApplied = "true";
        image.src = MEDIA_PLACEHOLDER;
        if (!image.alt) image.alt = "Media unavailable";
      }, { once: true });
    });
  }

  function reconcile(root = document) {
    restoreOriginalCurrencySymbols(root);
    restoreOriginalPlayerActionIcons(root);
    replaceBrokenMotionMedia(root);
    installMediaFallbacks(root);
  }

  const observerRoot = document.body || document.documentElement;
  if (observerRoot && typeof MutationObserver === "function") {
    const observer = new MutationObserver(() => reconcile(document));
    observer.observe(observerRoot, { childList: true, subtree: true });
  }

  window.addEventListener("load", () => reconcile(document), { once: true });
  reconcile(document);

  window.EconovariaAdminAssetWiring = {
    reconcile,
    restoreOriginalCurrencySymbols,
    restoreOriginalPlayerActionIcons,
    PLAYER_IDENTITY_MOTION,
    MEDIA_PLACEHOLDER,
  };
})();