(function initEconovariaAdminAssetWiring() {
  "use strict";

  const PLAYER_IDENTITY_MOTION = "./assets/media/player-identity-motion.svg";
  const MEDIA_PLACEHOLDER = "./assets/icons/media-placeholder.svg";

  function replaceBrokenMotionMedia(root = document) {
    root.querySelectorAll?.("video").forEach((video) => {
      const source = video.querySelector("source");
      const sourceValue = String(source?.getAttribute("src") || "");
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

  function installImageFallbacks(root = document) {
    root.querySelectorAll?.("img:not([data-admin-asset-fallback-bound])").forEach((image) => {
      image.setAttribute("data-admin-asset-fallback-bound", "true");
      image.addEventListener("error", () => {
        if (image.dataset.adminAssetFallbackApplied === "true") return;
        image.dataset.adminAssetFallbackApplied = "true";
        image.src = MEDIA_PLACEHOLDER;
        if (!image.alt) image.alt = "Media unavailable";
      }, { once: true });
    });
  }

  function reconcile(root = document) {
    replaceBrokenMotionMedia(root);
    installImageFallbacks(root);
  }

  const mount = document.getElementById("adminPreview");
  if (mount && typeof MutationObserver === "function") {
    const observer = new MutationObserver(() => reconcile(mount));
    observer.observe(mount, { childList: true, subtree: true });
  }

  window.addEventListener("load", () => reconcile(document), { once: true });
  reconcile(document);

  window.EconovariaAdminAssetWiring = {
    reconcile,
    PLAYER_IDENTITY_MOTION,
    MEDIA_PLACEHOLDER,
  };
})();
