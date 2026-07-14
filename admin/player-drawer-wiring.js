(function initEconovariaPlayerDrawerWiring() {
  "use strict";

  const FLAT_RECORD_SELECTOR = ".admin-terminal-player-real-data-v604";
  const DRAWER_SELECTOR = "[data-admin-terminal-player-drawer]";
  const RESTORED_ATTRIBUTE = "data-admin-player-drawer-restored";
  const TAB_DEFINITIONS = [
    ["overview", "Overview"],
    ["bank", "Bank Accounts"],
    ["assets", "Assets"],
    ["liabilities", "Liabilities"],
    ["inventory", "Inventory"],
    ["logs", "Logs"],
  ];

  let scheduled = false;

  function text(value) {
    return String(value ?? "").trim();
  }

  function normalized(value) {
    return text(value).replace(/\s+/g, " ").toLowerCase();
  }

  function element(tagName, className = "") {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    return node;
  }

  function appendText(parent, tagName, value) {
    const node = document.createElement(tagName);
    node.textContent = value;
    parent.append(node);
    return node;
  }

  function cloneNode(node) {
    return node instanceof Element ? node.cloneNode(true) : null;
  }

  function summaryArticle(flatRecord, label) {
    return [...flatRecord.querySelectorAll(".admin-terminal-player-real-summary-v604 > article")]
      .find((article) => normalized(article.querySelector("span")?.textContent) === normalized(label)) || null;
  }

  function recordSection(flatRecord, heading) {
    return [...flatRecord.querySelectorAll(".admin-terminal-player-real-grid-v604 > section")]
      .find((section) => normalized(section.querySelector("h4")?.textContent) === normalized(heading)) || null;
  }

  function sectionBody(source, fallbackMessage) {
    const body = element("div", "admin-terminal-player-restored-section-body");
    if (source) {
      [...source.children].forEach((child) => {
        if (child.matches?.("h4")) return;
        body.append(child.cloneNode(true));
      });
    }
    if (!body.children.length) {
      const empty = element("article", "admin-terminal-player-v244-empty");
      empty.setAttribute("data-filter-empty", "");
      empty.textContent = fallbackMessage;
      body.append(empty);
    }
    return body;
  }

  function visibleRecordCount(source) {
    if (!source) return 0;
    return [...source.children].filter((child) => {
      if (child.matches?.("h4")) return false;
      return !child.matches?.("[data-filter-empty]") &&
        !child.querySelector?.("[data-filter-empty]");
    }).length;
  }

  function card(kicker, title, meta, content, options = {}) {
    const section = element(
      "section",
      `admin-terminal-player-drawer-card-v301${options.className ? ` ${options.className}` : ""}`,
    );
    if (options.ariaLabel) section.setAttribute("aria-label", options.ariaLabel);

    const header = element("header");
    const heading = element("div");
    appendText(heading, "span", kicker);
    appendText(heading, "strong", title);
    header.append(heading);
    appendText(header, "em", meta);
    section.append(header, content);
    return section;
  }

  function summaryValue(article) {
    const value = article?.querySelector("strong");
    if (value) return value.cloneNode(true);
    const fallback = document.createElement("strong");
    fallback.textContent = "—";
    return fallback;
  }

  function accountRow(label, article, note, warning = false) {
    const row = element(
      "article",
      `admin-terminal-player-account-row-v301 admin-terminal-player-account-row-v303${warning ? " is-warning" : ""}`,
    );
    const copy = element("div");
    appendText(copy, "small", label);
    copy.append(summaryValue(article));
    appendText(copy, "span", note);
    row.append(copy);
    return row;
  }

  function buildOverviewPanel(flatRecord, sources) {
    const grid = element(
      "div",
      "admin-terminal-player-overview-grid-v301 admin-terminal-player-overview-grid-v303",
    );

    const accountStack = element(
      "div",
      "admin-terminal-player-account-stack-v301 admin-terminal-player-money-risk-v303",
    );
    accountStack.append(
      accountRow("Checking", sources.checking, "Spendable balance returned by the backend."),
      accountRow("Savings", sources.savings, "Reserved balance returned by the backend."),
      accountRow(
        "Liabilities",
        null,
        visibleRecordCount(sources.liabilities)
          ? `${visibleRecordCount(sources.liabilities)} liability record${visibleRecordCount(sources.liabilities) === 1 ? "" : "s"} returned.`
          : "No liability records returned.",
        visibleRecordCount(sources.liabilities) > 0,
      ),
    );

    const summary = cloneNode(flatRecord.querySelector(".admin-terminal-player-real-summary-v604")) ||
      element("div", "admin-terminal-player-real-summary-v604");

    grid.append(
      card(
        "Account",
        "Money and risk",
        visibleRecordCount(sources.liabilities) ? "Review" : "Clear",
        accountStack,
        { className: "is-account", ariaLabel: "Account overview" },
      ),
      card(
        "Backend Records",
        "Financial position and activity",
        "Authoritative",
        summary,
        { ariaLabel: "Authoritative player record overview" },
      ),
    );
    return grid;
  }

  function primaryBankCard(label, article, note) {
    const cardNode = element("article", "admin-terminal-player-bank-primary-card-v303");
    const icon = appendText(cardNode, "i", label === "Checking" ? "▤" : "◫");
    icon.setAttribute("aria-hidden", "true");
    const copy = element("div");
    appendText(copy, "small", label);
    copy.append(summaryValue(article));
    appendText(copy, "span", note);
    cardNode.append(copy);
    return cardNode;
  }

  function buildBankPanel(sources) {
    const content = element("div");
    const primary = element("div", "admin-terminal-player-bank-primary-grid-v303");
    primary.append(
      primaryBankCard("Checking", sources.checking, "Spendable balance"),
      primaryBankCard("Savings", sources.savings, "Reserved balance"),
    );
    const reserves = sectionBody(sources.currencies, "No currency reserve records were returned.");
    reserves.classList.add("admin-terminal-player-currency-grid-v303");
    content.append(primary, reserves);
    return card(
      "Bank Accounts",
      "Checking, savings, and reserves",
      `${visibleRecordCount(sources.currencies) + 2} records`,
      content,
      { ariaLabel: "Bank account records" },
    );
  }

  function buildAssetsPanel(sources) {
    const layout = element("div", "admin-terminal-player-assets-layout-v303");
    layout.append(
      card(
        "Portfolio",
        "Market positions",
        `${visibleRecordCount(sources.market)} records`,
        sectionBody(sources.market, "No market positions were returned."),
        { ariaLabel: "Market positions" },
      ),
      card(
        "Owned Assets",
        "Businesses and property",
        `${visibleRecordCount(sources.businesses)} records`,
        sectionBody(sources.businesses, "No business or property records were returned."),
        { ariaLabel: "Businesses and property" },
      ),
    );
    return layout;
  }

  function buildSingleCardPanel(kicker, title, source, fallback, ariaLabel) {
    return card(
      kicker,
      title,
      `${visibleRecordCount(source)} records`,
      sectionBody(source, fallback),
      { ariaLabel },
    );
  }

  function tabButton(key, label, active) {
    const button = element("button", active ? "active" : "");
    button.type = "button";
    button.setAttribute("data-admin-terminal-action", "select-player-drawer-tab");
    button.setAttribute("data-player-drawer-tab", key);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", active ? "true" : "false");
    button.textContent = label;
    return button;
  }

  function tabPanel(key, active, content) {
    const panel = element(
      "section",
      `admin-terminal-player-tab-panel-v301${active ? " is-active" : ""}`,
    );
    panel.setAttribute("data-player-drawer-panel", key);
    panel.setAttribute("role", "tabpanel");
    panel.hidden = !active;
    panel.append(content);
    return panel;
  }

  function restoreDrawer(flatRecord) {
    if (!(flatRecord instanceof Element)) return false;
    const dossier = flatRecord.closest(".admin-terminal-player-dossier-v296");
    if (!dossier || dossier.hasAttribute(RESTORED_ATTRIBUTE)) return false;
    if (dossier.querySelector(DRAWER_SELECTOR)) {
      dossier.setAttribute(RESTORED_ATTRIBUTE, "");
      return false;
    }

    const sources = {
      checking: summaryArticle(flatRecord, "Checking"),
      savings: summaryArticle(flatRecord, "Savings"),
      portfolio: summaryArticle(flatRecord, "Portfolio"),
      netWorth: summaryArticle(flatRecord, "Net worth"),
      market: recordSection(flatRecord, "Market positions"),
      businesses: recordSection(flatRecord, "Businesses and property"),
      liabilities: recordSection(flatRecord, "Loans and liabilities"),
      inventory: recordSection(flatRecord, "Inventory"),
      currencies: recordSection(flatRecord, "Currency reserves"),
      logs: recordSection(flatRecord, "Recent activity"),
    };

    const drawer = element(
      "section",
      "admin-terminal-player-drawer-tabs-v301 admin-terminal-player-drawer-tabs-v303",
    );
    drawer.setAttribute("data-admin-terminal-player-drawer", "");
    drawer.setAttribute("data-admin-player-drawer-authoritative", "");
    drawer.setAttribute("aria-label", "Player drawer tabs");

    const tablist = element("div", "admin-terminal-player-tablist-v301");
    tablist.setAttribute("role", "tablist");
    tablist.setAttribute("aria-label", "Player record sections");
    TAB_DEFINITIONS.forEach(([key, label], index) => {
      tablist.append(tabButton(key, label, index === 0));
    });

    const panels = element("div", "admin-terminal-player-tab-panels-v301");
    panels.append(
      tabPanel("overview", true, buildOverviewPanel(flatRecord, sources)),
      tabPanel("bank", false, buildBankPanel(sources)),
      tabPanel("assets", false, buildAssetsPanel(sources)),
      tabPanel(
        "liabilities",
        false,
        buildSingleCardPanel(
          "Liabilities",
          "Loans and obligations",
          sources.liabilities,
          "No liability records were returned.",
          "Loans and liabilities",
        ),
      ),
      tabPanel(
        "inventory",
        false,
        buildSingleCardPanel(
          "Inventory",
          "Owned items",
          sources.inventory,
          "No inventory records were returned.",
          "Player inventory",
        ),
      ),
      tabPanel(
        "logs",
        false,
        buildSingleCardPanel(
          "Player Log",
          "Latest actions",
          sources.logs,
          "No player activity records were returned.",
          "Player activity log",
        ),
      ),
    );

    drawer.append(tablist, panels);
    flatRecord.replaceWith(drawer);
    dossier.setAttribute(RESTORED_ATTRIBUTE, "");
    return true;
  }

  function decorate(root = document) {
    const records = [];
    if (root instanceof Element && root.matches(FLAT_RECORD_SELECTOR)) records.push(root);
    records.push(...(root.querySelectorAll?.(FLAT_RECORD_SELECTOR) || []));
    [...new Set(records)].forEach(restoreDrawer);
  }

  function scheduleDecorate(root = document) {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      decorate(root);
    });
  }

  if (document.body && typeof MutationObserver === "function") {
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) =>
        [...mutation.addedNodes].some((node) =>
          node instanceof Element &&
          (node.matches?.(FLAT_RECORD_SELECTOR) || node.querySelector?.(FLAT_RECORD_SELECTOR)),
        ),
      );
      if (relevant) scheduleDecorate(document);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-admin-terminal-action="select-player-panel"], [data-admin-section="Players"]')) {
      window.setTimeout(() => scheduleDecorate(document), 0);
    }
  }, true);

  window.addEventListener("load", () => scheduleDecorate(document), { once: true });
  scheduleDecorate(document);

  window.EconovariaPlayerDrawerWiring = {
    decorate,
    restoreDrawer,
  };
})();
