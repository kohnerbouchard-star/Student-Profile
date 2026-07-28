const STYLESHEET_ID = "econovaria-admin-game-session-compact-layering-stylesheet";

if (!document.getElementById(STYLESHEET_ID)) {
  const stylesheet = document.createElement("link");
  stylesheet.id = STYLESHEET_ID;
  stylesheet.rel = "stylesheet";
  stylesheet.href = new URL("./css/game-session-compact-layering.css", import.meta.url).href;

  await new Promise((resolve, reject) => {
    stylesheet.addEventListener("load", resolve, { once: true });
    stylesheet.addEventListener("error", () => reject(new Error(
      "Compact Admin session-control styles could not be loaded.",
    )), { once: true });
    document.head.append(stylesheet);
  });
}
