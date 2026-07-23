(() => {
  const script = document.currentScript;
  const baseUrl = new URL(".", script?.src || document.baseURI);
  const stylesheetUrl = new URL("./progression-review.css", baseUrl).href;
  if (![...document.styleSheets].some((sheet) => sheet.href === stylesheetUrl)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = stylesheetUrl;
    document.head.append(link);
  }
  import(new URL("./progression-review-surface.js", baseUrl).href).catch((error) => {
    console.error("Progression review surface failed to load.", error);
  });
})();
