(() => {
  const ADMIN_MOUNTED_EVENT = "econovaria:admin-route-mounted";
  const baseUrl = new URL(".", document.baseURI);
  let started = false;

  function mountReady() {
    const mount = document.getElementById("adminPreview");
    return Boolean(mount && !mount.hidden && mount.childElementCount > 0);
  }

  function loadMessagingSurfaces() {
    if (started || !mountReady()) return;
    started = true;

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
  }

  document.addEventListener(ADMIN_MOUNTED_EVENT, (event) => {
    if (event.target === document.getElementById("adminPreview")) loadMessagingSurfaces();
  });

  if (mountReady()) queueMicrotask(loadMessagingSurfaces);
})();
