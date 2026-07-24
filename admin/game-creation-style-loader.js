const href = new URL("./css/game-creation-controls.css", import.meta.url).href;

function existingStylesheet() {
  return [...document.styleSheets].find((sheet) => sheet.href === href) || null;
}

async function loadStylesheet() {
  if (existingStylesheet()) return;

  const existingLink = document.querySelector(
    'link[data-econovaria-game-creation-styles="true"]',
  );
  if (existingLink instanceof HTMLLinkElement) {
    if (existingLink.sheet) return;
    await new Promise((resolve, reject) => {
      existingLink.addEventListener("load", resolve, { once: true });
      existingLink.addEventListener(
        "error",
        () => reject(new Error("Game creation stylesheet failed to load.")),
        { once: true },
      );
    });
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.econovariaGameCreationStyles = "true";
  await new Promise((resolve, reject) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener(
      "error",
      () => reject(new Error("Game creation stylesheet failed to load.")),
      { once: true },
    );
    document.head.append(link);
  });
}

await loadStylesheet();
window.EconovariaAdminGameCreationStylesReady = true;
