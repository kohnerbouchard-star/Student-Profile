(() => {
  const script = document.currentScript;
  const baseUrl = new URL(".", script?.src || document.baseURI);
  const stylesheetUrl = new URL("./messaging-moderation.css", baseUrl).href;
  if (![...document.styleSheets].some((sheet) => sheet.href === stylesheetUrl)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = stylesheetUrl;
    document.head.append(link);
  }
  Promise.all([
    import(new URL("./messaging-moderation-surface.js", baseUrl).href),
    import(new URL("./messaging-policy-surface.js", baseUrl).href),
  ]).catch((error) => {
    console.error("Messaging administration surface failed to load.", error);
  });
})();
