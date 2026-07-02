/**
   * Ensures the terminal stylesheet is present.
   * The old package embedded the entire CSS payload in this function. The CSS now
   * lives in css/admin-overview-terminal.css so UI edits are isolated from logic.
   */
  function injectStyles() {
    document.querySelectorAll("style[id^='admin-overview-terminal-style']").forEach((node) => {
      if (node.id !== STYLE_ID) node.remove();
    });

    if (document.getElementById(STYLE_ID)) return;

    const existingLink = document.querySelector("link[data-admin-terminal-stylesheet]");
    if (!existingLink) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "./css/admin-overview-terminal.css";
      link.setAttribute("data-admin-terminal-stylesheet", "");
      document.head.appendChild(link);
    }

    // Sentinel node keeps legacy duplicate-style cleanup logic intact.
    const sentinel = document.createElement("style");
    sentinel.id = STYLE_ID;
    sentinel.textContent = "";
    sentinel.setAttribute("data-admin-terminal-style-sentinel", "");
    document.head.appendChild(sentinel);
  }
