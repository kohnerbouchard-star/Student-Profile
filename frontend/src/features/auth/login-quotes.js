(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const auth = app.modules.auth = app.modules.auth || {};

  const LOGIN_QUOTES = Object.freeze([
    "Every decision has a cost. Every cost teaches a lesson.",
    "Markets reward patience, evidence, and timing.",
    "Good strategy starts with good information.",
    "A smart trade begins before the order is placed.",
    "Risk is not the enemy. Unmeasured risk is.",
    "The best investors learn from both wins and losses.",
    "Data gives you a signal. Judgment turns it into action.",
    "Small choices compound into major outcomes.",
    "Price tells a story. Your job is to read it carefully.",
    "In a market, preparation beats reaction.",
    "A forecast is stronger when it explains the why.",
    "Capital is limited. Strategy decides where it goes.",
    "The market does not wait, but it does leave clues.",
    "Strong decisions balance confidence with evidence.",
    "Opportunity looks different when you understand the numbers.",
    "Trading is easy. Thinking clearly is the hard part.",
    "Learn the pattern before you chase the price.",
    "A portfolio is a record of choices, not just assets.",
    "The goal is not guessing. The goal is reasoning better.",
    "Build the habit: observe, decide, review, improve."
  ]);

  function sanitize(value) {
    if (app.modules.sanitize && typeof app.modules.sanitize.sanitizeHtml === "function") {
      return app.modules.sanitize.sanitizeHtml(value);
    }

    if (typeof global.sanitize === "function") {
      return global.sanitize(value);
    }

    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  // display-only
  function getNextLoginQuote(currentIndex) {
    const count = LOGIN_QUOTES.length;
    const index = Number.isFinite(Number(currentIndex)) ? Number(currentIndex) : 0;
    const normalizedIndex = ((index % count) + count) % count;

    return {
      index: normalizedIndex,
      nextIndex: (normalizedIndex + 1) % count,
      text: LOGIN_QUOTES[normalizedIndex],
      count,
      countLabel: `${String(normalizedIndex + 1).padStart(2, "0")} / ${count}`
    };
  }

  // display-only
  function renderLoginQuote(quoteState) {
    const source = quoteState || getNextLoginQuote(0);

    return `
      <div class="login-quote" aria-live="polite">
        <div class="quote-label">Market note</div>
        <p id="loginQuoteText">${sanitize(source.text || "")}</p>
        <div id="loginQuoteCount" class="quote-count">${sanitize(source.countLabel || "")}</div>
      </div>
    `;
  }

  // display-only
  function rotateLoginQuote(root, currentIndex) {
    const documentRoot = root || global.document;
    const quote = getNextLoginQuote(currentIndex);
    const quoteEl = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("loginQuoteText")
      : null;
    const countEl = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("loginQuoteCount")
      : null;

    if (quoteEl) {
      quoteEl.textContent = quote.text;
      quoteEl.classList.remove("login-quote-slide");
      void quoteEl.offsetWidth;
      quoteEl.classList.add("login-quote-slide");
    }

    if (countEl) {
      countEl.textContent = quote.countLabel;
    }

    return quote;
  }

  auth.quotesStatus = "extracted";
  auth.LOGIN_QUOTES = LOGIN_QUOTES;
  auth.getNextLoginQuote = getNextLoginQuote;
  auth.renderLoginQuote = renderLoginQuote;
  auth.rotateLoginQuote = rotateLoginQuote;

  app.modules.loginQuotes = {
    status: "extracted",
    LOGIN_QUOTES,
    getNextLoginQuote,
    renderLoginQuote,
    rotateLoginQuote
  };
})(window);
