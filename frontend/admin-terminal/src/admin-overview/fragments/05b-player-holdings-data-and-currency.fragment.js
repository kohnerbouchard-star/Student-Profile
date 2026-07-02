// Player holdings data, tabs, diversification, and currency/bank helpers.
  function getPlayerHoldingsData(player) {
    const rank = Number(player?.rank || 1) || 1;
    const readMoney = (value) => Number(String(value || "").replace(/[^0-9.-]/g, "")) || 0;
    const baseCash = Math.max(300, readMoney(player?.cash) || 1200);
    const currencyCatalog = getAdminTerminalCurrencyCatalog()
      .filter((currency) => currency.code !== "SC")
      .map((currency) => ({
        ...currency,
        country: String(currency.name || currency.code).replace(/\s+(Credit|Crown|Dinar|Volt|Ducat|Lira|Mark|Note|Vek)$/i, "")
      }));
    const hasFullHoldings = rank <= 4;
    const hasPartialHoldings = rank >= 5 && rank <= 12;
    const hasEmptyHoldings = rank >= 13;
    const currencyMultiplier = hasFullHoldings ? 1.45 : hasPartialHoldings ? .82 : .28;

    const currencies = currencyCatalog.map((currency, index) => ({
      category: "Currencies",
      code: currency.code,
      country: currency.country,
      name: currency.name,
      symbolKey: currency.symbolKey,
      value: Math.max(0, Math.round((baseCash / (index + 2)) * currencyMultiplier * (0.35 + ((rank + index) % 4) * 0.10))).toLocaleString()
    }));

    const loans = hasEmptyHoldings ? [] : hasFullHoldings ? [
      { category: "Loans", label: "Operating loan", amount: `${Math.max(350, rank * 275).toLocaleString()}`, origin: "Northreach", currency: "NRC", note: "Due in 12 days · 8.6% APR" },
      { category: "Loans", label: "Asset credit", amount: `${Math.max(240, rank * 180).toLocaleString()}`, origin: "Valerion", currency: "VAL", note: "Secured by holdings · 7.9% APR" },
      { category: "Loans", label: "Inventory financing", amount: `${Math.max(160, rank * 120).toLocaleString()}`, origin: "Eldoran", currency: "ELD", note: "Auto-debit weekly · 9.4% APR" }
    ] : [
      { category: "Loans", label: "Operating loan", amount: `${Math.max(220, rank * 185).toLocaleString()}`, origin: "Yrethia", currency: "YRC", note: "Due in 9 days · 8.9% APR" }
    ];

    const inventoryFull = [
      { category: "Consumable", type: "Intel", title: "Market intel token", quantity: 4, unitValue: 85, status: "Usable", source: "Store reward", tradable: true, usable: true, locked: false, meta: "Consumable · 4 owned", note: "Use to reveal one market signal before allocation.", image: "https://img.magnific.com/free-vector/cool-neon-server-processing-unit-cloud-storage-database_39422-619.jpg" },
      { category: "Consumable", type: "Research", title: "Priority research voucher", quantity: 1, unitValue: 140, status: "Usable", source: "Contract reward", tradable: true, usable: true, locked: false, meta: "Consumable · 1 owned", note: "Accelerates one research action or forecast request.", image: "https://img.magnific.com/free-vector/artificial-intelligence-isometric-composition-with-flowchart-silicon-chip-server-equipment-with-smartphone-house_1284-56583.jpg" },
      { category: "Access", type: "Credential", title: "RFID access card", quantity: 1, unitValue: 60, status: "Assigned", source: "Admin issued", tradable: false, usable: true, locked: true, meta: "Access · assigned", note: "Required for attendance scans and secure-area actions.", image: "https://img.magnific.com/free-vector/purple-microchip-memory-chip-3d-illustration-cartoon-drawing-equipment-programing-information-storage-3d-style-white-background-modern-technology-engineering-programming-concept_778687-1653.jpg" },
      { category: "Equipment", type: "Scanner", title: "Portable scanner rig", quantity: 1, unitValue: 320, status: "Active", source: "Equipment grant", tradable: false, usable: true, locked: false, meta: "Equipment · calibrated", note: "Enables field scans and inventory verification events.", image: "https://img.magnific.com/free-vector/game-futuristic-boxes-future-technology-chests_107791-18260.jpg" },
      { category: "Materials", type: "Trade good", title: "Composite alloy crate", quantity: 3, unitValue: 115, status: "Tradable", source: "Market purchase", tradable: true, usable: false, locked: false, meta: "Materials · 3 crates", note: "Can be sold or used as input for production contracts.", image: "https://img.magnific.com/free-vector/game-futuristic-boxes-future-technology-chests_107791-18088.jpg" },
      { category: "Equipment", type: "Storage", title: "Secure storage cube", quantity: 2, unitValue: 95, status: "Held", source: "Reward inventory", tradable: true, usable: false, locked: false, meta: "Equipment · 2 units", note: "Inventory container with moderate resale value.", image: "https://img.magnific.com/free-vector/3d-glass-cube-box-vector-isolated-transparent-background-crear-black-white-realistic-geometric-block-with-reflection-glossy-acrylic-object-design-polygon-set-glassy-futuristic-art-icon_107791-21841.jpg" }
    ];
    const inventoryPartial = [
      { category: "Consumable", type: "Intel", title: "Market intel token", quantity: 1, unitValue: 85, status: "Usable", source: "Store reward", tradable: true, usable: true, locked: false, meta: "Consumable · 1 owned", note: "Use to reveal one market signal before allocation.", image: "https://img.magnific.com/free-vector/cool-neon-server-processing-unit-cloud-storage-database_39422-619.jpg" },
      { category: "Access", type: "Credential", title: "RFID access card", quantity: 1, unitValue: 60, status: "Assigned", source: "Admin issued", tradable: false, usable: true, locked: true, meta: "Access · assigned", note: "Required for attendance scans and secure-area actions.", image: "https://img.magnific.com/free-vector/purple-microchip-memory-chip-3d-illustration-cartoon-drawing-equipment-programing-information-storage-3d-style-white-background-modern-technology-engineering-programming-concept_778687-1653.jpg" }
    ];

    const assetsFull = [
      { category: "Businesses", title: "Harbor kiosk", meta: "Business · cashflow +220.00/day" },
      { category: "Businesses", title: "Cold-chain resale stand", meta: "Business · margin 14%" },
      { category: "Real Estate", title: "Northreach storage unit", meta: "Real estate · collateral eligible" },
      { category: "Real Estate", title: "Crescent Bay micro-lot", meta: "Real estate · appreciation watch" }
    ];
    const assetsPartial = [
      { category: "Businesses", title: "Campus snack route", meta: "Business · cashflow +65.00/day" },
    ];

    const stocksFull = [
      { category: "Energy", symbol: "NRG", title: "Northreach Grid", value: "2,410.00", meta: "Energy · 18 shares" },
      { category: "Transport", symbol: "SBL", title: "Sable Logistics", value: "1,840.00", meta: "Transport · 12 shares" },
      { category: "Tech", symbol: "AUR", title: "Aurora Systems", value: "3,220.00", meta: "Tech · 9 shares" },
      { category: "Materials", symbol: "CRB", title: "Crescent Commodities", value: "1,115.00", meta: "Materials · 15 shares" },
      { category: "Finance", symbol: "VBF", title: "Valerion Bank Fund", value: "940.00", meta: "Finance · 6 shares" }
    ];
    const stocksPartial = [
      { category: "Transport", symbol: "SBL", title: "Sable Logistics", value: "760.00", meta: "Transport · 5 shares" },
      { category: "Materials", symbol: "CRB", title: "Crescent Commodities", value: "420.00", meta: "Materials · 6 shares" }
    ];

    const logsFull = [
      { category: "Trade", type: "portfolio", severity: "Info", impact: "Financial", date: "2026-06-26", time: "09:42", title: "Portfolio rebalance", detail: "Bought 3 shares of Aurora Systems.", item: "Aurora Systems", actor: player?.name || "Player", source: "Player terminal", eventId: `PL-${String(rank).padStart(2, "0")}-1042`, before: "6 shares", after: "9 shares", price: "-240.00" },
      { category: "Inventory", type: "inventory", severity: "Info", impact: "Inventory", date: "2026-06-26", time: "09:18", title: "Inventory used", detail: "Market intel token consumed for research.", item: "Market intel token", actor: player?.name || "Player", source: "Inventory action", eventId: `PL-${String(rank).padStart(2, "0")}-1018`, before: "4 units", after: "3 units", price: "0.00" },
      { category: "Financial", type: "liability", severity: "Review", impact: "Debt", date: "2026-06-26", time: "08:57", title: "Loan update", detail: "Operating loan balance recalculated.", item: "Operating loan", actor: "System", source: "Liability engine", eventId: `PL-${String(rank).padStart(2, "0")}-0957`, before: "Previous balance", after: "Updated balance", price: "0.00" },
      { category: "Access", type: "security", severity: "Info", impact: "Session", date: "2026-06-26", time: "08:05", title: "Login", detail: "Player entered simulation from roster session.", item: "Roster session", actor: player?.name || "Player", source: "Login page", eventId: `PL-${String(rank).padStart(2, "0")}-0905`, before: "Offline", after: "Online", price: "0.00" },
      { category: "Attendance", type: "attendance", severity: "Info", impact: "Reward", date: "2026-06-25", time: "15:52", title: "Attendance reward", detail: "On-time scan issued daily attendance reward.", item: "RFID access card", actor: "Scanner", source: "Attendance terminal", eventId: `PL-${String(rank).padStart(2, "0")}-0852`, before: "Unscanned", after: "Present", price: "+25.00" },
      { category: "Contract", type: "contract", severity: "Info", impact: "Progress", date: "2026-06-25", time: "15:40", title: "Contract progress", detail: "Submitted partial evidence for logistics contract.", item: "Logistics contract", actor: player?.name || "Player", source: "Contract console", eventId: `PL-${String(rank).padStart(2, "0")}-0840`, before: "40%", after: "65%", price: "0.00" },
      { category: "Asset", type: "finance", severity: "Info", impact: "Income", date: "2026-06-25", time: "15:30", title: "Business income posted", detail: "Harbor kiosk generated daily cashflow.", item: "Harbor kiosk", actor: "System", source: "Business income job", eventId: `PL-${String(rank).padStart(2, "0")}-0830`, before: "Pending", after: "Posted", price: "+220.00" },
      { category: "Admin", type: "admin", severity: "Review", impact: "Adjustment", date: "2026-06-25", time: "14:12", title: "Admin note added", detail: "Admin flagged portfolio explanation for review.", item: "Portfolio explanation", actor: "Admin", source: "Player drawer", eventId: `PL-${String(rank).padStart(2, "0")}-0712`, before: "No note", after: "Review note", price: "0.00" }
    ];
    const logsPartial = [
      { category: "Access", type: "security", severity: "Info", impact: "Session", date: "2026-06-26", time: "08:05", title: "Login", detail: "Player entered simulation from roster session.", item: "Roster session", actor: player?.name || "Player", source: "Login page", eventId: `PL-${String(rank).padStart(2, "0")}-0905`, before: "Offline", after: "Online", price: "0.00" },
      { category: "Trade", type: "portfolio", severity: "Info", impact: "Financial", date: "2026-06-25", time: "13:15", title: "Stock purchase", detail: "Bought Sable Logistics position.", item: "Sable Logistics", actor: player?.name || "Player", source: "Player terminal", eventId: `PL-${String(rank).padStart(2, "0")}-0615`, before: "0 shares", after: "5 shares", price: "-145.00" },
      { category: "Attendance", type: "attendance", severity: "Info", impact: "Reward", date: "2026-06-25", time: "08:01", title: "Attendance scan", detail: "Player scanned in on time.", item: "RFID access card", actor: "Scanner", source: "Attendance terminal", eventId: `PL-${String(rank).padStart(2, "0")}-0501`, before: "Unscanned", after: "Present", price: "+25.00" }
    ];

    return {
      currencies,
      loans,
      inventory: hasEmptyHoldings ? [] : hasFullHoldings ? inventoryFull : inventoryPartial,
      assets: hasEmptyHoldings ? [] : hasFullHoldings ? assetsFull : assetsPartial,
      stocks: hasEmptyHoldings ? [] : hasFullHoldings ? stocksFull : stocksPartial,
      logs: hasEmptyHoldings ? [] : hasFullHoldings ? logsFull : logsPartial
    };
  }

  function renderPlayerTabs(labels, group, active = "All") {
    return `<div class="admin-terminal-player-v240-tabs" role="tablist" aria-label="${escapeHtml(group)} filters">${labels.map((label) => {
      const category = getPlayerFilterSlug(label);
      return `<button type="button" class="${label === active ? "active" : ""}" data-admin-terminal-action="filter-player-panel" data-player-filter-group="${escapeHtml(group)}" data-player-filter-category="${escapeHtml(category)}">${escapeHtml(label)}</button>`;
    }).join("")}</div>`;
  }

  function renderPlayerEmptyState(message, group = "") {
    return `<article class="admin-terminal-player-v244-empty" data-filter-empty="${escapeHtml(group)}">${escapeHtml(message)}</article>`;
  }

  function renderPlayerFilterEmptyState(message, group = "") {
    return `<article class="admin-terminal-player-v244-empty is-filter-empty" hidden data-filter-empty="${escapeHtml(group)}">${escapeHtml(message)}</article>`;
  }

  function renderPlayerPortfolioDiversification(stocks, player = {}) {
    const parsePortfolioMoney = (value) => Number(String(value || "").replace(/[^0-9.-]/g, "")) || 0;
    if (!Array.isArray(stocks) || !stocks.length) {
      return `
        <div class="admin-terminal-player-v240-portfolio-chart is-empty" aria-label="Portfolio diversification unavailable">
          <div class="admin-terminal-player-v240-portfolio-empty">No positions to chart yet.</div>
        </div>`;
    }

    const grouped = new Map();
    stocks.forEach((stock) => {
      const category = String(stock.category || 'Other');
      const value = parsePortfolioMoney(stock.value || 0);
      const current = grouped.get(category) || { category, value: 0, count: 0 };
      current.value += value;
      current.count += 1;
      grouped.set(category, current);
    });

    const palette = {
      Energy: '#7dff8a',
      Transport: '#3fd6ff',
      Tech: '#00eaff',
      Materials: '#ffd44d',
      Finance: '#ff5cf4',
      Other: '#c8f7ff'
    };

    const entries = Array.from(grouped.values()).sort((a, b) => b.value - a.value);
    const total = entries.reduce((sum, entry) => sum + entry.value, 0) || 1;
    const domesticMeta = getPlayerBankCurrencyMeta(player);
    const renderPortfolioLegendAmount = (value) => {
      const converted = convertAdminTerminalCurrencyAmount(value, 'SC', domesticMeta.code);
      const amount = converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `<em class="admin-terminal-player-v240-portfolio-value"><b>${escapeHtml(amount)}</b><i>${escapeHtml(domesticMeta.code)}</i></em>`;
    };

    const lead = entries[0];
    const leadPercent = Math.round((lead.value / total) * 100);

    return `
      <div class="admin-terminal-player-v240-portfolio-chart is-fullwidth" aria-label="Portfolio diversification allocation table">
        <div class="admin-terminal-player-v240-portfolio-meta">
          <header>
            <small>Current portfolio concentration</small>
            <span>${entries.length} categories · Largest: ${escapeHtml(lead.category)} · Top weight: ${leadPercent}%</span>
          </header>
          <div class="admin-terminal-player-v240-portfolio-allocation-head" aria-hidden="true">
            <span>Category</span>
            <span>Weight</span>
            <span>Value</span>
          </div>
          <ul class="admin-terminal-player-v240-portfolio-legend">
            ${entries.map((entry) => {
              const percent = Math.round((entry.value / total) * 100);
              const swatch = palette[entry.category] || palette.Other;
              return `<li style="--swatch:${swatch};--weight:${percent}%">
                <div class="admin-terminal-player-v240-portfolio-legend-main">
                  <i></i>
                  <div class="admin-terminal-player-v240-portfolio-legend-copy">
                    <span>${escapeHtml(entry.category)}</span>
                    <small>${escapeHtml(String(entry.count))} holding${entry.count === 1 ? '' : 's'}</small>
                  </div>
                </div>
                <b>${percent}%</b>
                ${renderPortfolioLegendAmount(entry.value)}
                <div class="admin-terminal-player-v240-portfolio-bar" aria-hidden="true"><span></span></div>
              </li>`;
            }).join('')}
          </ul>
        </div>
      </div>`;
  }

  const ECONOVARIA_CURRENCY_SYMBOL_KEYS = Object.freeze({
    NRC: "saturn",
    YRC: "neptune",
    THD: "arsenic",
    SLV: "jupiter",
    ELD: "alumen",
    VAL: "gold",
    LUM: "lapis_lazuli",
    SYN: "alcali",
    XAL: "lead",
    DRV: "ferrum"
  });

  const ECONOVARIA_CURRENCY_ICON_ASSET_PATHS = Object.freeze({"saturn":"./assets/icons/currency-saturn.svg","neptune":"./assets/icons/currency-neptune.svg","arsenic":"./assets/icons/currency-arsenic.svg","jupiter":"./assets/icons/currency-jupiter.svg","alumen":"./assets/icons/currency-alumen.svg","gold":"./assets/icons/currency-gold.svg","lapis_lazuli":"./assets/icons/currency-lapis_lazuli.svg","alcali":"./assets/icons/currency-alcali.svg","lead":"./assets/icons/currency-lead.svg","ferrum":"./assets/icons/currency-ferrum.svg"});

  function getCurrencySymbolKey(currencyCode) {
    return ECONOVARIA_CURRENCY_SYMBOL_KEYS[String(currencyCode || "").trim().toUpperCase()] || "";
  }

  const ADMIN_TERMINAL_COUNTRY_CURRENCY_META = Object.freeze({
    NORTHREACH: { code: "NRC", name: "Northreach Credit", symbolKey: "saturn", rate: 1.25 },
    YRETHIA: { code: "YRC", name: "Yrethian Crown", symbolKey: "neptune", rate: 0.84 },
    THALORIS: { code: "THD", name: "Thaloris Dinar", symbolKey: "arsenic", rate: 2.10 },
    SOLVEND: { code: "SLV", name: "Solvend Volt", symbolKey: "jupiter", rate: 0.72 },
    ELDORAN: { code: "ELD", name: "Eldoran Ducat", symbolKey: "alumen", rate: 1.05 },
    VALERION: { code: "VAL", name: "Valerion Lira", symbolKey: "gold", rate: 0.68 },
    LUMENOR: { code: "LUM", name: "Lumenor Mark", symbolKey: "lapis_lazuli", rate: 1.40 },
    KAIVORA: { code: "LUM", name: "Lumenor Mark", symbolKey: "lapis_lazuli", rate: 1.40 },
    SYNDALIS: { code: "SYN", name: "Syndalis Note", symbolKey: "alcali", rate: 3.20 },
    XALVORIA: { code: "XAL", name: "Xalvorian Lira", symbolKey: "lead", rate: 1.85 },
    ORINTH: { code: "XAL", name: "Xalvorian Lira", symbolKey: "lead", rate: 1.85 },
    DRAVENLOK: { code: "DRV", name: "Dravenlok Vek", symbolKey: "ferrum", rate: 2.65 },
    DRAVIK: { code: "DRV", name: "Dravenlok Vek", symbolKey: "ferrum", rate: 2.65 }
  });

  function getAdminTerminalCurrencyCatalog() {
    const seen = new Set();
    const list = [{ code: "SC", name: "Standard Credits", symbolKey: "", rate: 1 }];
    Object.values(ADMIN_TERMINAL_COUNTRY_CURRENCY_META).forEach((meta) => {
      const code = String(meta?.code || "").toUpperCase();
      if (!code || seen.has(code)) return;
      seen.add(code);
      list.push(meta);
    });
    return list;
  }

  function getAdminTerminalCurrencyMetaByCode(code) {
    const normalized = String(code || "SC").trim().toUpperCase();
    const catalog = getAdminTerminalCurrencyCatalog();
    return catalog.find((meta) => meta.code === normalized) || catalog[0];
  }

  function convertAdminTerminalCurrencyAmount(amount, fromCode, toCode) {
    const numeric = readCurrencyNumber(amount) ?? 0;
    const fromMeta = getAdminTerminalCurrencyMetaByCode(fromCode);
    const toMeta = getAdminTerminalCurrencyMetaByCode(toCode);
    const fromRate = Number(fromMeta?.rate) || 1;
    const toRate = Number(toMeta?.rate) || 1;
    return (numeric / fromRate) * toRate;
  }

  function renderBankCurrencySelectOptions(selectedCode = "SC") {
    const selected = String(selectedCode || "SC").toUpperCase();
    return getAdminTerminalCurrencyCatalog().map((meta) => {
      const code = String(meta.code || "SC").toUpperCase();
      return `<option value="${escapeHtml(code)}" ${code === selected ? "selected" : ""}>${escapeHtml(code)} · ${escapeHtml(meta.name || code)}</option>`;
    }).join("");
  }

  function renderBankCalculatorOutput(amount, currencyCode) {
    const meta = getAdminTerminalCurrencyMetaByCode(currencyCode);
    const numeric = Number(amount || 0);
    const formatted = numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (meta.code === "SC") return `<em class="admin-terminal-bank-local-amount"><b>$${escapeHtml(formatted)}</b><i>SC</i></em>`;
    return renderBankLocalPreviewAmount(numeric, meta);
  }

  function renderBankCurrencyCalculator(player = {}) {
    const playerCurrencyMeta = getPlayerBankCurrencyMeta(player);
    const defaultAmount = 100;
    const defaultOutput = convertAdminTerminalCurrencyAmount(defaultAmount, "SC", playerCurrencyMeta.code);
    return `
          <section class="admin-terminal-bank-calculator" data-admin-bank-currency-calculator aria-label="Currency calculator">
            <header>
              <small>Currency Calculator</small>
            </header>
            <div class="admin-terminal-bank-calculator-grid">
              <label>From
                <select data-bank-calc-field data-bank-calc-from>${renderBankCurrencySelectOptions("SC")}</select>
              </label>
              <label>Amount
                <input type="number" inputmode="decimal" min="0" step="0.01" value="100.00" data-bank-calc-field data-bank-calc-amount>
              </label>
              <label>To
                <select data-bank-calc-field data-bank-calc-to>${renderBankCurrencySelectOptions(playerCurrencyMeta.code)}</select>
              </label>
              <div class="admin-terminal-bank-calculator-output">
                <small>Output</small>
                <output data-bank-calc-output>${renderBankCalculatorOutput(defaultOutput, playerCurrencyMeta.code)}</output>
              </div>
            </div>
          </section>`;
  }

  function updateAdminTerminalBankCalculator(target) {
    const root = target?.closest?.("[data-admin-bank-currency-calculator]") || target;
    if (!root?.querySelector) return;
    const fromCode = root.querySelector("[data-bank-calc-from]")?.value || "SC";
    const toCode = root.querySelector("[data-bank-calc-to]")?.value || "SC";
    const amount = root.querySelector("[data-bank-calc-amount]")?.value || "0";
    const output = root.querySelector("[data-bank-calc-output]");
    if (!output) return;
    const converted = convertAdminTerminalCurrencyAmount(amount, fromCode, toCode);
    output.innerHTML = renderBankCalculatorOutput(converted, toCode);
  }

  function getPlayerBankCurrencyMeta(player = {}) {
    const rawCountry = String(player.countryCode || player.country || player.location || "Northreach")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return ADMIN_TERMINAL_COUNTRY_CURRENCY_META[rawCountry] || ADMIN_TERMINAL_COUNTRY_CURRENCY_META.NORTHREACH;
  }

  function renderBankCurrencySymbol(symbolKey) {
    const src = ECONOVARIA_CURRENCY_ICON_ASSET_PATHS[String(symbolKey || "")] || "";
    if (!src) return "";
    return `<img class="admin-terminal-bank-currency-symbol" src="${escapeHtml(src)}" alt="" aria-hidden="true" loading="lazy">`;
  }

  function convertStandardCreditsToBankCurrency(value, currencyMeta) {
    const numeric = readCurrencyNumber(value) ?? 0;
    return numeric * (Number(currencyMeta?.rate) || 1);
  }

  function renderBankLocalPreviewAmount(value, currencyMeta) {
    const numeric = Number(value || 0);
    const amount = numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `<em class="admin-terminal-bank-local-amount">${renderBankCurrencySymbol(currencyMeta.symbolKey)}<b>${escapeHtml(amount)}</b><i>${escapeHtml(currencyMeta.code)}</i></em>`;
  }


  function readCurrencyNumber(value) {
    const numeric = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }

  function formatCurrencyNumber(value) {
    const raw = String(value ?? "").trim();
    if (!raw || raw === "—") return "—";
    const numeric = readCurrencyNumber(raw);
    if (numeric === null) return raw;
    const absAmount = Math.abs(numeric).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return numeric < 0 ? `-$${absAmount}` : `$${absAmount}`;
  }

  function getPlayerCurrencyCode(player = {}) {
    return getPlayerBankCurrencyMeta(player).code;
  }

  function renderCurrencyAmountBySymbolKey(value, symbolKey) {
    const amount = formatCurrencyNumber(value);
    if (amount === "—") return `<em class="admin-terminal-currency-amount is-empty"><b class="admin-terminal-currency-number">—</b></em>`;
    return `<em class="admin-terminal-currency-amount is-dollar"><b class="admin-terminal-currency-number">${escapeHtml(amount)}</b></em>`;
  }

  function renderCurrencyAmount(value, currencyCode) {
    return renderCurrencyAmountBySymbolKey(value, "");
  }

  function renderSignedCurrencyAmount(value, currencyCode = "USD") {
    const raw = String(value ?? "").trim();
    if (!raw || raw === "—") return `<em class="admin-terminal-currency-amount is-empty"><b class="admin-terminal-currency-number">—</b></em>`;
    const numeric = readCurrencyNumber(raw);
    if (numeric === null) return escapeHtml(raw);
    const absAmount = Math.abs(numeric).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sign = numeric < 0 || raw.includes("-") ? "-$" : numeric > 0 || raw.includes("+") ? "+$" : "$";
    const tone = numeric < 0 || raw.includes("-") ? "is-negative is-signed-negative" : numeric > 0 || raw.includes("+") ? "is-positive is-signed-positive" : "is-neutral";
    return `<em class="admin-terminal-currency-amount is-dollar ${tone}"><b class="admin-terminal-currency-sign">${escapeHtml(sign)}</b><b class="admin-terminal-currency-number">${escapeHtml(absAmount)}</b></em>`;
  }

  function renderCurrencySymbolForMeta(meta = {}) {
    const code = String(meta?.code || "SC").toUpperCase();
    if (code === "SC") return `<u aria-hidden="true">$</u>`;
    return renderBankCurrencySymbol(meta.symbolKey);
  }

  function renderPlayerCurrencyAmount(value, player = {}, fromCode = "SC") {
    const raw = String(value ?? "").trim();
    if (!raw || raw === "—") return `<em class="admin-terminal-currency-single-amount is-empty"><b>—</b></em>`;
    const domesticMeta = getPlayerBankCurrencyMeta(player);
    const numeric = readCurrencyNumber(value);
    if (numeric === null) return escapeHtml(raw);
    const converted = convertAdminTerminalCurrencyAmount(numeric, fromCode, domesticMeta.code);
    const amount = converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `<em class="admin-terminal-currency-single-amount">${renderCurrencySymbolForMeta(domesticMeta)}<b>${escapeHtml(amount)}</b><i>${escapeHtml(domesticMeta.code)}</i></em>`;
  }

  function renderPlayerCurrencyReserveAmount(value, player = {}, fromCode = "SC") {
    const raw = String(value ?? "").trim();
    if (!raw || raw === "—") return `<em class="admin-terminal-currency-dual-amount is-empty"><span class="admin-terminal-currency-primary"><b>—</b></span></em>`;
    const originalMeta = getAdminTerminalCurrencyMetaByCode(fromCode);
    const domesticMeta = getPlayerBankCurrencyMeta(player);
    const originalNumeric = readCurrencyNumber(value);
    if (originalNumeric === null) return escapeHtml(raw);
    const normalized = convertAdminTerminalCurrencyAmount(originalNumeric, originalMeta.code, domesticMeta.code);
    const originalAmount = originalNumeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const normalizedAmount = normalized.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `<em class="admin-terminal-currency-dual-amount"><span class="admin-terminal-currency-primary">${renderCurrencySymbolForMeta(originalMeta)}<b>${escapeHtml(originalAmount)}</b><i>${escapeHtml(originalMeta.code)}</i></span><small><u aria-hidden="true">≈</u>${renderCurrencySymbolForMeta(domesticMeta)}<b>${escapeHtml(normalizedAmount)}</b><i>${escapeHtml(domesticMeta.code)}</i></small></em>`;
  }

  function renderSignedPlayerCurrencyAmount(value, player = {}, fromCode = "SC") {
    const numeric = readCurrencyNumber(value);
    if (numeric === null) return escapeHtml(String(value ?? "—"));
    const domesticMeta = getPlayerBankCurrencyMeta(player);
    const converted = convertAdminTerminalCurrencyAmount(numeric, fromCode, domesticMeta.code);
    const absAmount = Math.abs(converted).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sign = converted < 0 ? "−" : converted > 0 ? "+" : "";
    const tone = converted < 0 ? "is-negative is-signed-negative" : converted > 0 ? "is-positive is-signed-positive" : "is-neutral";
    return `<em class="admin-terminal-currency-single-amount ${tone}">${renderCurrencySymbolForMeta(domesticMeta)}<b>${escapeHtml(sign)}${escapeHtml(absAmount)}</b><i>${escapeHtml(domesticMeta.code)}</i></em>`;
  }
