export function installToastHostController(mount, documentRef = globalThis.document) {
  if (!(mount instanceof HTMLElement) || !documentRef?.body) return { destroy() {} };

  const host = documentRef.createElement("div");
  host.className = "player-terminal-toast-host";
  host.dataset.playerTerminalRoot = "true";
  host.dataset.playerTerminalToastHost = "true";
  documentRef.body.append(host);

  function externalizeToast(toast) {
    if (!(toast instanceof HTMLElement) || !toast.classList.contains("player-terminal-toast")) return;
    host.querySelector(".player-terminal-toast")?.remove();
    host.append(toast);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.classList.contains("player-terminal-toast")) externalizeToast(node);
        node.querySelectorAll?.(".player-terminal-toast").forEach(externalizeToast);
      }
    }
  });

  observer.observe(mount, { childList: true, subtree: true });
  mount.querySelectorAll(".player-terminal-toast").forEach(externalizeToast);

  return {
    destroy() {
      observer.disconnect();
      host.remove();
    }
  };
}
