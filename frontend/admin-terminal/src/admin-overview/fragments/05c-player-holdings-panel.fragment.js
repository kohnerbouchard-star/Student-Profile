// Player drawer holdings, banking, portfolio, liabilities, inventory, and log panels.
  function renderPlayerHoldingsPanel(player) {
    const data = getPlayerHoldingsData(player);
    const checkingAccountBalance = player.cash || "0";
    const savingsAccountBalance = ((readCurrencyNumber(checkingAccountBalance) ?? 0) * 0.25).toFixed(2);
    const domesticMeta = getPlayerBankCurrencyMeta(player);
    const readMoney = (value) => readCurrencyNumber(value) ?? 0;
    const businessAssets = data.assets.filter((asset) => String(asset.category).toLowerCase() === "businesses");
    const realEstateAssets = data.assets.filter((asset) => String(asset.category).toLowerCase() === "real estate");
    const recentLogs = data.logs.slice(0, 8);
    const checkingApy = `${(1.2 + (Number(player.rank || 1) % 4) * 0.35).toFixed(2)}% APY`;
    const savingsApy = `${(3.4 + (Number(player.rank || 1) % 5) * 0.25).toFixed(2)}% APY`;

    const liabilityLocationRates = Object.freeze({
      NORTHREACH: { label: "Northreach", baseRate: 5.25, volatility: "+0.35" },
      YRETHIA: { label: "Yrethia", baseRate: 6.10, volatility: "+0.55" },
      SOLVEND: { label: "Solvend", baseRate: 4.90, volatility: "+0.20" },
      ELDORAN: { label: "Eldoran", baseRate: 6.85, volatility: "+0.70" },
      THALORIS: { label: "Thaloris", baseRate: 7.35, volatility: "+0.90" },
      VALERION: { label: "Valerion", baseRate: 5.80, volatility: "+0.45" },
      SYNDALIS: { label: "Syndalis", baseRate: 8.25, volatility: "+1.10" },
      KAIVORA: { label: "Kaivora", baseRate: 5.65, volatility: "+0.40" },
      ORINTH: { label: "Orinth", baseRate: 6.55, volatility: "+0.65" },
      DRAVIK: { label: "Dravik", baseRate: 7.70, volatility: "+0.85" }
    });

    const normalizeLiabilityLocation = (value) => String(value || "Northreach")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    const formatLiabilityNumber = (value) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const renderLiabilityMoney = (value, code = domesticMeta.code) => `<em class="admin-terminal-player-liability-money-v452"><b>${escapeHtml(formatLiabilityNumber(value))}</b><i>${escapeHtml(String(code || domesticMeta.code).toUpperCase())}</i></em>`;

    const buildLiabilityPaymentHistory = (loan, metrics, index) => {
      const weeks = [3, 2, 1];
      return weeks.map((weekOffset, historyIndex) => {
        const isLate = metrics.lateFees > 0 && historyIndex === 1;
        const payment = Math.max(0, metrics.weeklyMinimum * (isLate ? .92 : 1));
        const interest = Math.max(0, payment * (.20 + historyIndex * .025));
        const principal = Math.max(0, payment - interest - (isLate ? metrics.lateFees / Math.max(1, metrics.lateCount) : 0));
        const day = String(Math.max(1, 26 - weekOffset * 7 - index)).padStart(2, "0");
        return {
          date: `2026-06-${day}`,
          status: isLate ? "Late" : "Paid",
          principal,
          interest,
          fee: isLate ? metrics.lateFees / Math.max(1, metrics.lateCount) : 0
        };
      });
    };

    const buildLiabilityMetrics = (loan, index) => {
      const rank = Number(player.rank || 1) || 1;
      const localCode = String(loan.currency || domesticMeta.code || "SC").toUpperCase();
      const remainingPrincipal = convertAdminTerminalCurrencyAmount(loan.amount, "SC", localCode);
      const locationKey = normalizeLiabilityLocation(loan.origin);
      const locationRate = liabilityLocationRates[locationKey] || liabilityLocationRates.NORTHREACH;
      const statedApr = Number(String(loan.apr || loan.note || "").match(/([0-9.]+)%\s*APR/i)?.[1] || 0);
      const riskSpread = Math.max(2.1, Number.isFinite(statedApr) && statedApr > 0 ? statedApr - locationRate.baseRate : 2.9 + index * .35);
      const rateAdjustment = ((rank + index) % 4) * .15;
      const locationVolatility = Math.abs(Number(locationRate.volatility || 0)) || .35;
      const variableApr = Number((locationRate.baseRate + riskSpread + rateAdjustment).toFixed(2));
      const aprFloor = Number(Math.max(0, locationRate.baseRate + riskSpread - locationVolatility).toFixed(2));
      const aprCeiling = Number((locationRate.baseRate + riskSpread + locationVolatility + .45).toFixed(2));
      const aprRangeWidth = Math.max(.01, aprCeiling - aprFloor);
      const aprRangePosition = Math.min(100, Math.max(0, ((variableApr - aprFloor) / aprRangeWidth) * 100));
      const aprBandLabel = aprRangePosition < 34 ? "Lower band" : aprRangePosition < 67 ? "Mid band" : "Upper band";
      const termWeeks = Number(loan.termWeeks || 12 + index * 4 + (rank % 3) * 2);
      const paidPeriods = Math.min(termWeeks - 1, Number(loan.periodsPaid || Math.max(2, Math.round(termWeeks * (.30 + ((rank + index) % 4) * .06)))));
      const periodsRemaining = Math.max(1, termWeeks - paidPeriods);
      const originalPrincipal = Number(loan.principal || Math.max(remainingPrincipal, remainingPrincipal * (1 + (paidPeriods / Math.max(1, termWeeks)) * .72)));
      const principalPaid = Math.max(0, originalPrincipal - remainingPrincipal);
      const weeklyRate = variableApr / 100 / 52;
      const basePayment = remainingPrincipal / periodsRemaining;
      const weeklyInterest = remainingPrincipal * weeklyRate;
      const weeklyMinimum = Math.max(0, basePayment + weeklyInterest);
      const interestPaid = Math.max(0, (originalPrincipal + remainingPrincipal) / 2 * weeklyRate * paidPeriods);
      const lateCount = Number(loan.lateCount ?? ((rank + index) % 3 === 0 ? 1 : 0));
      const lateFees = Math.max(0, lateCount * Math.max(6, weeklyMinimum * .10));
      const projectedInterest = Math.max(0, (remainingPrincipal / 2) * weeklyRate * periodsRemaining);
      const remainingToPay = remainingPrincipal + projectedInterest + lateFees;
      const domesticRemaining = convertAdminTerminalCurrencyAmount(remainingPrincipal, localCode, domesticMeta.code);
      const domesticWeeklyMinimum = convertAdminTerminalCurrencyAmount(weeklyMinimum, localCode, domesticMeta.code);
      const domesticLateFees = convertAdminTerminalCurrencyAmount(lateFees, localCode, domesticMeta.code);
      const metrics = {
        ...loan,
        index,
        localCode,
        locationRate,
        variableApr,
        aprFloor,
        aprCeiling,
        aprRangePosition,
        aprBandLabel,
        locationVolatility,
        riskSpread,
        rateAdjustment,
        termWeeks,
        paidPeriods,
        periodsRemaining,
        originalPrincipal,
        principalPaid,
        interestPaid,
        remainingPrincipal,
        remainingToPay,
        weeklyMinimum,
        lateCount,
        lateFees,
        domesticRemaining,
        domesticWeeklyMinimum,
        domesticLateFees,
        progressPercent: Math.min(100, Math.max(0, (paidPeriods / Math.max(1, termWeeks)) * 100))
      };
      metrics.paymentHistory = buildLiabilityPaymentHistory(loan, metrics, index);
      return metrics;
    };

    const liabilityDetails = data.loans.map(buildLiabilityMetrics);
    const totalLoanAmount = liabilityDetails.reduce((sum, loan) => sum + loan.domesticRemaining, 0);
    const totalWeeklyMinimum = liabilityDetails.reduce((sum, loan) => sum + loan.domesticWeeklyMinimum, 0);
    const totalLateFees = liabilityDetails.reduce((sum, loan) => sum + loan.domesticLateFees, 0);
    const totalRemainingToPay = liabilityDetails.reduce((sum, loan) => sum + convertAdminTerminalCurrencyAmount(loan.remainingToPay, loan.localCode, domesticMeta.code), 0);
    const weightedDebtApr = liabilityDetails.length ? liabilityDetails.reduce((sum, loan) => sum + loan.variableApr * loan.domesticRemaining, 0) / Math.max(1, totalLoanAmount) : 0;
    const weightedAprFloor = liabilityDetails.length ? liabilityDetails.reduce((sum, loan) => sum + loan.aprFloor * loan.domesticRemaining, 0) / Math.max(1, totalLoanAmount) : 0;
    const weightedAprCeiling = liabilityDetails.length ? liabilityDetails.reduce((sum, loan) => sum + loan.aprCeiling * loan.domesticRemaining, 0) / Math.max(1, totalLoanAmount) : 0;
    const debtApr = liabilityDetails.length ? `${weightedDebtApr.toFixed(2)}% APR` : "0.00% APR";
    const debtAprRange = liabilityDetails.length ? `${weightedAprFloor.toFixed(2)}–${weightedAprCeiling.toFixed(2)}% range` : "0.00–0.00% range";
    const aprRangeSpread = Math.max(0.01, weightedAprCeiling - weightedAprFloor);
    const weightedAprPosition = liabilityDetails.length ? Math.min(100, Math.max(0, ((weightedDebtApr - weightedAprFloor) / aprRangeSpread) * 100)) : 0;
    const lateLiabilityCount = liabilityDetails.filter((loan) => Number(loan.lateFees || 0) > 0 || Number(loan.lateCount || 0) > 0).length;
    const weightedAprBandLabel = weightedAprPosition < 34 ? "Lower band" : weightedAprPosition < 67 ? "Mid band" : "Upper band";

    const stockDetails = data.stocks.map((stock, index) => {
      const value = readMoney(stock.value);
      const sharesMatch = String(stock.meta || "").match(/(\d+)\s+shares?/i);
      const shares = Number(stock.shares || sharesMatch?.[1] || (index + 3));
      const avgPrice = Number(stock.avgPrice || Math.max(8, (value / Math.max(1, shares)) * (0.86 + (index % 3) * 0.04)));
      const currentPrice = Number(stock.currentPrice || Math.max(8, value / Math.max(1, shares)));
      const gainValue = (currentPrice - avgPrice) * shares;
      const gainPct = avgPrice ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
      const country = stock.country || ["Northreach", "Yrethia", "Solvend", "Eldoran", "Valerion"][index % 5];
      return { ...stock, shares, avgPrice, currentPrice, gainValue, gainPct, country };
    });

    const totalPortfolioValue = stockDetails.reduce((sum, stock) => sum + readMoney(stock.value), 0);
    const totalUnrealized = stockDetails.reduce((sum, stock) => sum + Number(stock.gainValue || 0), 0);
    const totalCashflow = data.assets.reduce((sum, asset, index) => {
      const cashflowMatch = String(asset.meta || "").match(/cashflow\s*\+?([0-9,.]+)/i);
      return sum + Number(String(cashflowMatch?.[1] || (asset.category === "Businesses" ? 65 + index * 35 : asset.category === "Real Estate" ? 24 + index * 16 : 0)).replace(/,/g, ""));
    }, 0);

    const currencyEntries = data.currencies.map((currency) => ({
      type: "currency",
      category: "Currency Reserve",
      title: currency.name,
      label: currency.code,
      value: currency.value,
      note: `${currency.country} reserve balance`,
      symbolKey: currency.symbolKey
    }));

    const inventoryDetails = data.inventory.map((item, index) => {
      const quantity = Math.max(1, Number(item.quantity || item.qty || String(item.meta || "").match(/(\d+)\s+owned/i)?.[1] || 1));
      const unitValue = Number(item.unitValue || item.pricePaid || Math.max(25, (index + 1) * 40 + Number(player.rank || 1) * 5));
      const totalValue = Number(item.totalValue || Math.max(0, unitValue * quantity));
      const statusText = item.status || (item.locked ? "Locked" : item.usable ? "Usable" : item.tradable ? "Tradable" : "Held");
      const normalizedCategory = String(item.category || "Inventory").replace(/s$/i, "");
      return {
        ...item,
        index,
        quantity,
        unitValue,
        totalValue,
        statusText,
        normalizedCategory,
        typeLabel: item.type || normalizedCategory,
        sourceLabel: item.source || "Player inventory",
        image: item.image || "https://img.magnific.com/free-vector/game-futuristic-boxes-future-technology-chests_107791-18260.jpg"
      };
    });
    const inventoryUnitCount = inventoryDetails.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const inventoryTotalValue = inventoryDetails.reduce((sum, item) => sum + Number(item.totalValue || 0), 0);
    const usableInventoryCount = inventoryDetails.filter((item) => item.usable || /usable|active|assigned/i.test(item.statusText)).length;
    const tradableInventoryCount = inventoryDetails.filter((item) => item.tradable || /tradable/i.test(item.statusText)).length;
    const lockedInventoryCount = inventoryDetails.filter((item) => item.locked || /locked|assigned/i.test(item.statusText)).length;
    const inventoryCategoryCounts = inventoryDetails.reduce((map, item) => {
      const key = item.normalizedCategory || "Inventory";
      map[key] = (map[key] || 0) + Number(item.quantity || 0);
      return map;
    }, {});
    const largestInventoryCategory = Object.entries(inventoryCategoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "None";

    const normalizePlayerLogType = (entry) => String(entry.type || entry.category || "activity")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "activity";

    const playerLogToneMap = Object.freeze({
      security: "security",
      access: "security",
      attendance: "attendance",
      inventory: "inventory",
      store: "inventory",
      contract: "contract",
      contracts: "contract",
      finance: "finance",
      financial: "finance",
      portfolio: "finance",
      trade: "finance",
      liability: "liability",
      liabilities: "liability",
      admin: "admin",
      settings: "admin"
    });

    const buildPlayerAuditLog = (entry, index) => {
      const typeKey = normalizePlayerLogType(entry);
      const tone = playerLogToneMap[typeKey] || playerLogToneMap[String(entry.category || "").toLowerCase()] || "activity";
      const priceValue = readMoney(entry.price || entry.amount || 0);
      const hasCashImpact = Math.abs(priceValue) > 0;
      const severity = entry.severity || (tone === "liability" || tone === "admin" ? "Review" : "Info");
      const eventId = entry.eventId || `PL-${String(player.id || player.rank || "00").replace(/[^0-9A-Za-z]/g, "").slice(-4) || "0000"}-${String(index + 1).padStart(3, "0")}`;
      return {
        ...entry,
        index,
        typeKey,
        tone,
        severity,
        eventId,
        priceValue,
        hasCashImpact,
        actor: entry.actor || player.name || "Player",
        source: entry.source || "Player record",
        location: entry.location || player.location || "Simulation",
        item: entry.item || String(entry.detail || "").replace(/^(Bought|Player entered|Market intel token consumed for|Operating loan balance|Harbor kiosk generated|Submitted partial evidence for)\s*/i, "").replace(/\.$/, "") || "—",
        before: entry.before || "—",
        after: entry.after || "—",
        impactLabel: entry.impact || (hasCashImpact ? "Financial" : tone === "inventory" ? "Inventory" : tone === "attendance" ? "Attendance" : "Record"),
        exchangeContext: entry.exchangeContext || entry.context || `${entry.actor || player.name || "Player"} triggered this ${String(entry.category || entry.type || "activity").toLowerCase()} event through ${entry.source || "the player record"}. The record moved from ${entry.before || "—"} to ${entry.after || "—"}.`
      };
    };

    const playerLogDetails = recentLogs.map(buildPlayerAuditLog);
    const manualPlayerLogCount = playerLogDetails.filter((entry) => !/^system$/i.test(entry.actor || "") && !/^scanner$/i.test(entry.actor || "")).length;
    const financialPlayerLogCount = playerLogDetails.filter((entry) => entry.hasCashImpact || ["finance", "liability"].includes(entry.tone)).length;
    const inventoryPlayerLogCount = playerLogDetails.filter((entry) => entry.tone === "inventory").length;
    const reviewPlayerLogCount = playerLogDetails.filter((entry) => /review|warning|attention|high/i.test(entry.severity || "")).length;
    const selectedPlayerLog = playerLogDetails[0] || {
      eventId: "—",
      title: "No selected event",
      detail: "No player actions recorded yet.",
      date: "—",
      time: "—",
      tone: "activity",
      severity: "Empty",
      actor: "—",
      source: "—",
      location: player.location || "—",
      item: "—",
      before: "—",
      after: "—",
      impactLabel: "None",
      priceValue: 0,
      hasCashImpact: false
    };

    const renderPlayerLogMetric = (label, value, note, tone = "") => `
      <article class="admin-terminal-player-log-metric-v463 ${tone ? `is-${tone}` : ""}">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(String(value))}</strong>
        <span>${escapeHtml(note)}</span>
      </article>`;

    const renderPlayerLogImpact = (entry) => entry.hasCashImpact
      ? `<strong class="${entry.priceValue >= 0 ? "is-signed-positive" : "is-signed-negative"}">${renderSignedPlayerCurrencyAmount(entry.priceValue, player)}</strong>`
      : `<span>${escapeHtml(entry.impactLabel || "No cash impact")}</span>`;

    const renderPlayerAuditLogRow = (entry) => `
      <article class="admin-terminal-player-audit-log-row-v463 is-${escapeHtml(entry.tone)}" data-player-log-type="${escapeHtml(entry.tone)}" data-player-log-id="${escapeHtml(entry.eventId)}">
        <time datetime="${escapeHtml(`${entry.date || ""}T${entry.time || "00:00"}`)}"><span>${escapeHtml(entry.date || "—")}</span><b>${escapeHtml(entry.time || "—")}</b></time>
        <i>${escapeHtml(String(entry.category || entry.typeKey || "Activity"))}</i>
        <div>
          <strong>${escapeHtml(entry.title || "Player action")}</strong>
          <span>${escapeHtml(entry.detail || "No detail provided.")}</span>
          <small>${escapeHtml(entry.eventId)} · ${escapeHtml(entry.actor)} via ${escapeHtml(entry.source)}</small>
        </div>
        <mark class="is-${escapeHtml(String(entry.severity || "info").toLowerCase())}">${escapeHtml(entry.severity || "Info")}</mark>
        <em>${renderPlayerLogImpact(entry)}</em>
        <button type="button" data-admin-terminal-action="open-player-log-detail">View</button>
      </article>`;

    const renderPlayerLogDetail = (entry) => `
      <aside class="admin-terminal-player-log-detail-v463 is-${escapeHtml(entry.tone)}" aria-label="Selected player log detail">
        <header>
          <span>Selected event</span>
          <strong>${escapeHtml(entry.title || "Player action")}</strong>
          <em>${escapeHtml(entry.eventId || "—")}</em>
        </header>
        <p>${escapeHtml(entry.detail || "No detail provided.")}</p>
        <dl>
          <div><dt>Time</dt><dd>${escapeHtml(entry.date || "—")} · ${escapeHtml(entry.time || "—")}</dd></div>
          <div><dt>Actor</dt><dd>${escapeHtml(entry.actor || "—")}</dd></div>
          <div><dt>Source</dt><dd>${escapeHtml(entry.source || "—")}</dd></div>
          <div><dt>Location</dt><dd>${escapeHtml(entry.location || "—")}</dd></div>
          <div><dt>Interacted item</dt><dd>${escapeHtml(entry.item || "—")}</dd></div>
          <div><dt>Impact</dt><dd>${renderPlayerLogImpact(entry)}</dd></div>
        </dl>
        <section aria-label="Before and after values">
          <article><span>Before</span><b>${escapeHtml(entry.before || "—")}</b></article>
          <article><span>After</span><b>${escapeHtml(entry.after || "—")}</b></article>
        </section>
        <footer>
          <button type="button" data-admin-terminal-action="copy-player-log-id">Copy ID</button>
          <button type="button" data-admin-terminal-action="flag-player-log-event">Flag</button>
        </footer>
      </aside>`;

    const renderDrawerTabButton = (key, label, active = false) => `
      <button type="button" class="${active ? "active" : ""}" data-admin-terminal-action="select-player-drawer-tab" data-player-drawer-tab="${escapeHtml(key)}" role="tab" aria-selected="${active ? "true" : "false"}">${escapeHtml(label)}</button>`;

    const renderRateChip = (label, value, tone = "") => {
      const normalizedLabel = String(label || "").toLowerCase();
      const normalizedValue = String(value || "").toLowerCase();
      const rateTone = normalizedLabel.includes("apr") || normalizedValue.includes("apr")
        ? "is-apr"
        : normalizedLabel.includes("apy") || normalizedValue.includes("apy") || normalizedLabel.includes("yield")
          ? "is-apy"
          : "";
      return `<em class="admin-terminal-player-rate-chip-v303 ${tone} ${rateTone}"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></em>`;
    };

    const renderMoneyRiskRows = () => `
      <div class="admin-terminal-player-account-stack-v301 admin-terminal-player-money-risk-v303">
        <article class="admin-terminal-player-account-row-v301 admin-terminal-player-account-row-v303">
          <div><small>Checking</small><strong>${renderPlayerCurrencyAmount(checkingAccountBalance, player)}</strong></div>
          ${renderRateChip("Yield", checkingApy)}
        </article>
        <article class="admin-terminal-player-account-row-v301 admin-terminal-player-account-row-v303">
          <div><small>Savings</small><strong>${renderPlayerCurrencyAmount(savingsAccountBalance, player)}</strong></div>
          ${renderRateChip("Yield", savingsApy)}
        </article>
        <article class="admin-terminal-player-account-row-v301 admin-terminal-player-account-row-v303 ${data.loans.length ? "is-warning" : ""}">
          <div><small>Debt</small><strong>${data.loans.length ? renderPlayerCurrencyAmount(totalLoanAmount, player, domesticMeta.code) : "None"}</strong><span>${data.loans.length ? "Outstanding loan exposure" : "No loan records"}</span></div>
          ${renderRateChip("Rate", debtApr, data.loans.length ? "is-warning" : "")}
        </article>
      </div>`;

    const renderHoldingSummaryIcon = (type) => {
      const icons = {
        stocks: './assets/icons/holding-stock-shares.svg',
        businesses: './assets/icons/holding-businesses.svg',
        realEstate: './assets/icons/holding-real-estate.svg'
      };
      const src = icons[type] || icons.stocks;
      const alt = type === 'stocks' ? 'Stock shares' : type === 'businesses' ? 'Businesses' : 'Real estate';
      return `<img src="${src}" alt="${alt}">`;
    };

    const renderCompactList = (items, emptyMessage, renderItem) => items.length ? items.map(renderItem).join("") : renderPlayerEmptyState(emptyMessage);
    const formatSigned = (value) => {
      const numeric = Number(value || 0);
      const sign = numeric > 0 ? "+" : numeric < 0 ? "−" : "";
      return `${sign}$${Math.abs(numeric).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    const formatPct = (value) => `${Number(value || 0) >= 0 ? "+" : ""}${Number(value || 0).toFixed(1)}%`;

    const buildExposureEntries = (items, key) => {
      const grouped = new Map();
      items.forEach((item) => {
        const label = String(item[key] || "Other");
        const current = grouped.get(label) || { label, value: 0 };
        current.value += readMoney(item.value);
        grouped.set(label, current);
      });
      const total = Array.from(grouped.values()).reduce((sum, entry) => sum + entry.value, 0) || 1;
      return Array.from(grouped.values()).sort((a, b) => b.value - a.value).map((entry) => ({ ...entry, pct: Math.round((entry.value / total) * 100) }));
    };
    const industryExposure = buildExposureEntries(stockDetails, "category");
    const countryExposure = buildExposureEntries(stockDetails, "country");

    return `
      <section class="admin-terminal-player-drawer-tabs-v301 admin-terminal-player-drawer-tabs-v303" data-admin-terminal-player-drawer aria-label="Player drawer tabs">
        <div class="admin-terminal-player-tablist-v301" role="tablist" aria-label="Player record sections">
          ${renderDrawerTabButton("overview", "Overview", true)}
          ${renderDrawerTabButton("bank", "Bank Accounts")}
          ${renderDrawerTabButton("assets", "Assets")}
          ${renderDrawerTabButton("liabilities", "Liabilities")}
          ${renderDrawerTabButton("inventory", "Inventory")}
          ${renderDrawerTabButton("logs", "Logs")}
        </div>

        <div class="admin-terminal-player-tab-panels-v301">
          <section class="admin-terminal-player-tab-panel-v301 is-active" data-player-drawer-panel="overview" role="tabpanel">
            <div class="admin-terminal-player-overview-grid-v301 admin-terminal-player-overview-grid-v303">
              <section class="admin-terminal-player-drawer-card-v301 is-account" aria-label="Account overview">
                <header>
                  <div><span>Account</span><strong>Money and risk</strong></div>
                  <em>${data.loans.length ? `${data.loans.length} loans` : "Clear"}</em>
                </header>
                ${renderMoneyRiskRows()}
              </section>

              <section class="admin-terminal-player-drawer-card-v301" aria-label="Holdings overview">
                <header>
                  <div><span>Assets</span><strong>Holdings and yield</strong></div>
                  <em>${escapeHtml(stockDetails.length + businessAssets.length + realEstateAssets.length)} records</em>
                </header>
                <div class="admin-terminal-player-holding-summary-v303">
                  <article><b>${renderHoldingSummaryIcon("stocks")}</b><strong>${escapeHtml(stockDetails.reduce((sum, stock) => sum + Number(stock.shares || 0), 0))}</strong><span>Stock shares</span></article>
                  <article><b>${renderHoldingSummaryIcon("businesses")}</b><strong>${escapeHtml(businessAssets.length)}</strong><span>Businesses</span></article>
                  <article><b>${renderHoldingSummaryIcon("realEstate")}</b><strong>${escapeHtml(realEstateAssets.length)}</strong><span>Real estate</span></article>
                </div>
                <div class="admin-terminal-player-yield-strip-v303">
                  <article><small>Unrealized gain / loss</small><strong class="${totalUnrealized >= 0 ? "is-positive is-signed-positive" : "is-negative is-signed-negative"}">${renderSignedPlayerCurrencyAmount(totalUnrealized, player)}</strong></article>
                  <article><small>Cashflow</small><strong class="${totalCashflow >= 0 ? "is-positive is-signed-positive" : "is-negative is-signed-negative"}">${renderSignedPlayerCurrencyAmount(totalCashflow, player)}/day</strong></article>
                  <article><small>Portfolio value</small><strong class="is-portfolio">${renderPlayerCurrencyAmount(totalPortfolioValue || player.portfolioValue || "—", player)}</strong></article>
                </div>
              </section>
            </div>
          </section>

          <section class="admin-terminal-player-tab-panel-v301" data-player-drawer-panel="bank" role="tabpanel" hidden>
            <section class="admin-terminal-player-drawer-card-v301" aria-label="Bank account records">
              <header>
                <div><span>Bank Accounts</span><strong>Checking, savings, and reserves</strong></div>
                <em>${escapeHtml(currencyEntries.length + 2)} records</em>
              </header>
              <div class="admin-terminal-player-bank-primary-grid-v303">
                <article class="admin-terminal-player-bank-primary-card-v303">
                  <i aria-hidden="true"><img src="./assets/icons/bank-checking.svg" alt="" loading="lazy" decoding="async" /></i>
                  <div><small>Checking</small><strong>${renderPlayerCurrencyAmount(checkingAccountBalance, player)}</strong></div>
                  ${renderRateChip("Yield", checkingApy)}
                </article>
                <article class="admin-terminal-player-bank-primary-card-v303">
                  <i aria-hidden="true"><img src="./assets/icons/bank-savings.svg" alt="" loading="lazy" decoding="async" /></i>
                  <div><small>Savings</small><strong>${renderPlayerCurrencyAmount(savingsAccountBalance, player)}</strong></div>
                  ${renderRateChip("Yield", savingsApy)}
                </article>
              </div>
              <div class="admin-terminal-player-currency-grid-v303">
                ${renderCompactList(currencyEntries, "No currency reserves recorded.", (entry) => `
                  <article class="admin-terminal-player-currency-card-v303">
                    <i aria-hidden="true">${renderBankCurrencySymbol(entry.symbolKey)}</i>
                    <div><small>${escapeHtml(entry.label)}</small><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.note)}</span></div>
                    <b>${renderPlayerCurrencyReserveAmount(entry.value, player, entry.label)}</b>
                  </article>`)}
              </div>
              <p class="admin-terminal-player-normalized-note-v303">Currency reserves keep their original currency. The ≈ line shows the rough domestic value: ${escapeHtml(domesticMeta.name)} (${escapeHtml(domesticMeta.code)}).</p>
            </section>
          </section>

          <section class="admin-terminal-player-tab-panel-v301" data-player-drawer-panel="assets" role="tabpanel" hidden>
            <div class="admin-terminal-player-assets-layout-v303">
              <section class="admin-terminal-player-drawer-card-v301" aria-label="Portfolio exposure">
                <header>
                  <div><span>Portfolio</span><strong>Diversification split</strong></div>
                  <em>Total ${renderPlayerCurrencyAmount(totalPortfolioValue || player.portfolioValue || "—", player)}</em>
                </header>
                <div class="admin-terminal-player-portfolio-dashboard-v303">
                  ${renderPlayerPortfolioDiversification(stockDetails, player)}
                  <div class="admin-terminal-player-exposure-grid-v303">
                    <section><h4>Industry exposure</h4>${renderCompactList(industryExposure, "No industry exposure.", (entry) => `<p><span>${escapeHtml(entry.label)}</span><b>${escapeHtml(entry.pct)}%</b></p>`)}</section>
                    <section><h4>Country exposure</h4>${renderCompactList(countryExposure, "No country exposure.", (entry) => `<p><span>${escapeHtml(entry.label)}</span><b>${escapeHtml(entry.pct)}%</b></p>`)}</section>
                  </div>
                </div>
                <div class="admin-terminal-player-stock-table-v303">
                  ${renderCompactList(stockDetails, "No stock positions yet.", (stock) => `
                    <article class="admin-terminal-player-stock-row-v303">
                      <i>${escapeHtml(stock.symbol)}</i>
                      <div class="admin-terminal-player-stock-identity-v435">
                        <small>${escapeHtml(stock.category)} · ${escapeHtml(stock.country)}</small>
                        <strong>${escapeHtml(stock.title)}</strong>
                        <span>${escapeHtml(stock.shares)} shares</span>
                      </div>
                      <div class="admin-terminal-player-stock-price-grid-v435" aria-label="Price details">
                        <p><span>Avg price</span><strong>${renderPlayerCurrencyAmount(stock.avgPrice, player)}</strong></p>
                        <p><span>Current</span><strong>${renderPlayerCurrencyAmount(stock.currentPrice, player)}</strong></p>
                      </div>
                      <b class="admin-terminal-player-stock-return-v435 ${stock.gainValue >= 0 ? "is-positive is-signed-positive" : "is-negative is-signed-negative"}">
                        <small>Return</small>
                        ${renderSignedPlayerCurrencyAmount(stock.gainValue, player)}
                        <em>${escapeHtml(formatPct(stock.gainPct))}</em>
                      </b>
                    </article>`)}
                </div>
              </section>

              <section class="admin-terminal-player-drawer-card-v301" aria-label="Businesses and real estate assets">
                <header>
                  <div><span>Owned Assets</span><strong>Businesses and real estate</strong></div>
                  <em>${escapeHtml(data.assets.length)} visible</em>
                </header>
                <div class="admin-terminal-player-asset-card-list-v303">
                  ${renderCompactList(data.assets, "No businesses or real estate owned yet.", (item, index) => {
                    const cashflowMatch = String(item.meta || "").match(/cashflow\s*\+?([0-9,.]+)/i);
                    const cashflow = Number(String(cashflowMatch?.[1] || (item.category === "Businesses" ? 65 + index * 35 : 18 + index * 12)).replace(/,/g, ""));
                    const value = item.value || Math.max(450, cashflow * 42).toLocaleString();
                    const assetImageUrl = getPlayerAssetImageUrl(item);
                    const assetImageMarkup = assetImageUrl
                      ? `<img src="${escapeHtml(assetImageUrl)}" alt="" loading="lazy" decoding="async">`
                      : escapeHtml(item.category === "Businesses" ? "▣" : "⌂");
                    return `
                    <details class="admin-terminal-player-business-card-v303">
                      <summary>
                        <span class="admin-terminal-player-business-image-v303" aria-hidden="true">${assetImageMarkup}</span>
                        <div><small>${escapeHtml(item.category)}</small><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.meta)}</span></div>
                        <b>⌄</b>
                      </summary>
                      <div class="admin-terminal-player-business-detail-v303">
                        <p><span>Value</span><strong>${renderCurrencyAmount(value, "USD")}</strong></p>
                        <p><span>Cashflow</span><strong class="${cashflow >= 0 ? "is-signed-positive" : "is-signed-negative"}">${escapeHtml(formatSigned(cashflow))}/day</strong></p>
                        <p><span>Status</span><strong>Active</strong></p>
                      </div>
                    </details>`;})}
                </div>
              </section>
            </div>
          </section>

          <section class="admin-terminal-player-tab-panel-v301" data-player-drawer-panel="liabilities" role="tabpanel" hidden>
            <section class="admin-terminal-player-drawer-card-v301 is-liability" aria-label="Liability records">
              <header>
                <div><span>Liabilities</span><strong>Debt and risk exposure</strong></div>
                <em>${data.loans.length ? `${data.loans.length} loans` : "Clear"}</em>
              </header>
              <div class="admin-terminal-player-liability-layout-v303">
                <aside class="admin-terminal-player-liability-overview-v303 is-v456-overview-dashboard" aria-label="Current liabilities overview">
                  <header class="admin-terminal-player-liability-hero-v456">
                    <span>Current liabilities</span>
                    <b>${liabilityDetails.length ? renderLiabilityMoney(totalRemainingToPay, domesticMeta.code) : "None"}</b>
                  </header>
                  <section class="admin-terminal-player-liability-kpis-v456" aria-label="Current liability summary metrics">
                    <div><span>Loans</span><b>${escapeHtml(String(liabilityDetails.length))}</b></div>
                    <div><span>Weekly min</span><b>${liabilityDetails.length ? renderLiabilityMoney(totalWeeklyMinimum, domesticMeta.code) : "—"}</b></div>
                    <div><span>Principal</span><b>${liabilityDetails.length ? renderLiabilityMoney(totalLoanAmount, domesticMeta.code) : "—"}</b></div>
                    <div><span>Late fees</span><b>${liabilityDetails.length ? renderLiabilityMoney(totalLateFees, domesticMeta.code) : "—"}</b></div>
                  </section>
                  <section class="admin-terminal-player-liability-apr-card-v456" aria-label="Weighted variable APR range">
                    <header><span>Variable APR position</span><b class="admin-terminal-weighted-apr-value is-rate-apr">${escapeHtml(debtApr)}</b></header>
                    <p>${escapeHtml(debtAprRange)} · ${escapeHtml(weightedAprBandLabel)} · ${weightedAprPosition.toFixed(0)}% through range</p>
                    <div class="admin-terminal-player-liability-apr-track-v456"><i style="--liability-rate-position:${weightedAprPosition.toFixed(1)}%"></i></div>
                    <footer><span>Floor ${weightedAprFloor.toFixed(2)}%</span><span>Ceiling ${weightedAprCeiling.toFixed(2)}%</span></footer>
                  </section>
                </aside>
                <div class="admin-terminal-player-liability-list-v303">
                  ${renderCompactList(liabilityDetails, "No loans or liabilities recorded.", (loan) => {
                    const rateBasis = `${loan.locationRate.baseRate.toFixed(2)}% ${loan.locationRate.label} base + ${loan.riskSpread.toFixed(2)}% risk spread${loan.rateAdjustment ? ` + ${loan.rateAdjustment.toFixed(2)}% variable adjustment` : ""}`;
                    const rateRange = `${loan.aprFloor.toFixed(2)}–${loan.aprCeiling.toFixed(2)}% APR range`;
                    return `
                    <details class="admin-terminal-player-liability-row-v303">
                      <summary>
                        <div><small><mark>Debt</mark>${escapeHtml(loan.locationRate.label)} · ${escapeHtml(loan.localCode)} · variable rate</small><strong>${escapeHtml(loan.label)}</strong><span>${escapeHtml(loan.variableApr.toFixed(2))}% APR · ${renderLiabilityMoney(loan.weeklyMinimum, loan.localCode)} / week minimum</span></div>
                        <b>${renderLiabilityMoney(loan.remainingToPay, loan.localCode)}<small>remaining to pay</small></b>
                      </summary>
                      <div class="admin-terminal-player-liability-detail-v303">
                        <section class="admin-terminal-player-liability-snapshot-v453">
                          <article class="is-due"><small>Remaining to pay</small><strong>${renderLiabilityMoney(loan.remainingToPay, loan.localCode)}</strong><span>Includes projected interest and late fees</span></article>
                          <article><small>Weekly minimum</small><strong>${renderLiabilityMoney(loan.weeklyMinimum, loan.localCode)}</strong><span>${escapeHtml(loan.variableApr.toFixed(2))}% variable APR</span></article>
                          <article><small>Payment progress</small><strong>${escapeHtml(String(loan.paidPeriods))} / ${escapeHtml(String(loan.termWeeks))}</strong><span>${escapeHtml(String(loan.periodsRemaining))} periods left</span></article>
                        </section>
                        <section class="admin-terminal-player-liability-progress-v453" aria-label="Loan payment progress">
                          <div><span style="--liability-progress:${loan.progressPercent.toFixed(1)}%"></span></div>
                          <p><b>${escapeHtml(loan.progressPercent.toFixed(0))}% paid by period count</b><em>${escapeHtml(String(loan.periodsRemaining))} weeks remaining</em></p>
                        </section>
                        <section class="admin-terminal-player-liability-rate-range-v454" aria-label="Variable interest range for ${escapeHtml(loan.label)}">
                          <header><small>Variable interest range</small><strong>${escapeHtml(loan.variableApr.toFixed(2))}% APR</strong><span>${escapeHtml(rateRange)} · ${escapeHtml(loan.aprBandLabel)}</span></header>
                          <div><span style="--liability-rate-position:${loan.aprRangePosition.toFixed(1)}%"></span></div>
                          <footer><span>Floor ${escapeHtml(loan.aprFloor.toFixed(2))}%</span><b>Current ${escapeHtml(loan.aprRangePosition.toFixed(0))}% through range</b><span>Ceiling ${escapeHtml(loan.aprCeiling.toFixed(2))}%</span></footer>
                        </section>
                        <section class="admin-terminal-player-liability-breakdown-v453" aria-label="Loan cost breakdown">
                          <article><small>Principal</small><strong>${renderLiabilityMoney(loan.remainingPrincipal, loan.localCode)}</strong><span>Original ${renderLiabilityMoney(loan.originalPrincipal, loan.localCode)}</span></article>
                          <article><small>Paid to date</small><strong>${renderLiabilityMoney(loan.principalPaid, loan.localCode)}</strong><span>Principal paid</span></article>
                          <article><small>Interest paid</small><strong>${renderLiabilityMoney(loan.interestPaid, loan.localCode)}</strong><span>${escapeHtml(rateBasis)}</span></article>
                          <article><small>Late fees</small><strong>${renderLiabilityMoney(loan.lateFees, loan.localCode)}</strong><span>${escapeHtml(String(loan.lateCount))} late period${loan.lateCount === 1 ? "" : "s"}</span></article>
                        </section>
                        <section class="admin-terminal-player-liability-history-v452 is-v453-clean" aria-label="Payment history for ${escapeHtml(loan.label)}">
                          <header><span>Date / status</span><b>Principal</b><b>Interest</b><b>Fees</b></header>
                          ${loan.paymentHistory.map((payment) => `<article class="${payment.status === "Late" ? "is-late" : ""}"><span><em>${escapeHtml(payment.date)}</em><strong>${escapeHtml(payment.status)}</strong></span><b>${renderLiabilityMoney(payment.principal, loan.localCode)}</b><b>${renderLiabilityMoney(payment.interest, loan.localCode)}</b><b>${renderLiabilityMoney(payment.fee, loan.localCode)}</b></article>`).join("")}
                        </section>
                      </div>
                    </details>`;})}
                </div>
              </div>
            </section>
          </section>

          <section class="admin-terminal-player-tab-panel-v301" data-player-drawer-panel="inventory" role="tabpanel" hidden>
            <section class="admin-terminal-player-drawer-card-v301 admin-terminal-player-inventory-dashboard-v459" aria-label="Inventory overview and item holdings">
              <header>
                <div><span>Inventory</span><strong>Current item holdings</strong></div>
                <em>${inventoryDetails.length ? `${inventoryDetails.length} records · ${inventoryUnitCount} units` : "Empty"}</em>
              </header>
              <div class="admin-terminal-player-inventory-layout-v459">
                <aside class="admin-terminal-player-inventory-overview-v459" aria-label="Inventory overview">
                  <header>
                    <span>Inventory value</span>
                    <b>${inventoryDetails.length ? renderPlayerCurrencyAmount(inventoryTotalValue, player) : "None"}</b>
                    <small>${escapeHtml(String(inventoryUnitCount))} units across ${escapeHtml(String(inventoryDetails.length))} records</small>
                  </header>
                  <section aria-label="Inventory status counts">
                    <article><span>Usable</span><b>${escapeHtml(String(usableInventoryCount))}</b></article>
                    <article><span>Tradable</span><b>${escapeHtml(String(tradableInventoryCount))}</b></article>
                    <article><span>Locked</span><b>${escapeHtml(String(lockedInventoryCount))}</b></article>
                    <article><span>Top type</span><b>${escapeHtml(largestInventoryCategory)}</b></article>
                  </section>
                  <p>Sample item images are pulled from Magnific stock assets for inventory UI testing.</p>
                </aside>
                <div class="admin-terminal-player-inventory-table-v459" aria-label="Inventory holdings table">
                  <div class="admin-terminal-player-inventory-head-v459" aria-hidden="true"><span>Item</span><span>Type</span><span>Qty</span><span>Unit value</span><span>Total</span><span>Status</span></div>
                  ${renderCompactList(inventoryDetails, "No inventory items owned.", (item) => `
                    <details class="admin-terminal-player-inventory-row-v459">
                      <summary>
                        <div class="admin-terminal-player-inventory-item-v459">
                          <figure><img src="${escapeHtml(item.image)}" alt="" loading="lazy"></figure>
                          <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.sourceLabel)}</small></div>
                        </div>
                        <span>${escapeHtml(item.typeLabel)}</span>
                        <b>${escapeHtml(String(item.quantity))}</b>
                        <em>${renderPlayerCurrencyAmount(item.unitValue, player)}</em>
                        <em>${renderPlayerCurrencyAmount(item.totalValue, player)}</em>
                        <mark class="${item.locked ? "is-locked" : item.tradable ? "is-tradable" : item.usable ? "is-usable" : ""}">${escapeHtml(item.statusText)}</mark>
                        <i>⌄</i>
                      </summary>
                      <div class="admin-terminal-player-inventory-detail-v459">
                        <p><span>Use state</span><strong>${escapeHtml(item.usable ? "Usable" : "Not directly usable")}</strong></p>
                        <p><span>Trade state</span><strong>${escapeHtml(item.tradable ? "Tradable" : "Restricted")}</strong></p>
                        <p><span>Storage</span><strong>${escapeHtml(item.locked ? "Locked / assigned" : "Player-held")}</strong></p>
                        <p><span>Note</span><strong>${escapeHtml(item.note || item.meta || "Inventory record")}</strong></p>
                      </div>
                    </details>`)}
                </div>
              </div>
            </section>
          </section>

          <section class="admin-terminal-player-tab-panel-v301" data-player-drawer-panel="logs" role="tabpanel" hidden>
            <section class="admin-terminal-player-drawer-card-v301 admin-terminal-player-logs-simple-v464" aria-label="Player log">
              <header>
                <div><span>Player Log</span><strong>Latest actions</strong></div>
                <em>${playerLogDetails.length ? `${playerLogDetails.length} shown` : "Empty"}</em>
              </header>
              <div class="admin-terminal-player-log-table-v303 admin-terminal-player-log-table-v464" data-player-log-list>
                <div class="admin-terminal-player-log-head-v303 admin-terminal-player-log-head-v464" aria-hidden="true"><span>Date</span><span>Time</span><span>Location</span><span>Action</span><span>Interacted item</span><span>Impact</span><span>View</span></div>
                ${playerLogDetails.length ? playerLogDetails.map((entry) => {
                  const impactText = entry.hasCashImpact ? `${entry.priceValue >= 0 ? "+" : "−"}${Math.abs(entry.priceValue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${domesticMeta.code}` : (entry.impactLabel || "Record");
                  return `
                  <article class="admin-terminal-player-log-row-v303 admin-terminal-player-log-row-v464" data-log-date="${escapeHtml(entry.date || "")}" data-player-log-id="${escapeHtml(entry.eventId)}">
                    <span>${escapeHtml(entry.date || "—")}</span>
                    <span>${escapeHtml(entry.time || "—")}</span>
                    <span>${escapeHtml(entry.location || player.location || "—")}</span>
                    <strong>${escapeHtml(entry.title || entry.category || "Action")}</strong>
                    <span>${escapeHtml(entry.item || "—")}</span>
                    <b class="${entry.hasCashImpact ? (entry.priceValue >= 0 ? "is-signed-positive" : "is-signed-negative") : ""}">${entry.hasCashImpact ? renderSignedPlayerCurrencyAmount(entry.priceValue, player) : escapeHtml(entry.impactLabel || "Record")}</b>
                    <button type="button"
                      data-admin-terminal-action="open-player-log-detail"
                      data-log-event-id="${escapeHtml(entry.eventId || "—")}"
                      data-log-title="${escapeHtml(entry.title || entry.category || "Action")}"
                      data-log-detail="${escapeHtml(entry.detail || "No detail provided.")}"
                      data-log-date="${escapeHtml(entry.date || "—")}"
                      data-log-time="${escapeHtml(entry.time || "—")}"
                      data-log-actor="${escapeHtml(entry.actor || "—")}"
                      data-log-source="${escapeHtml(entry.source || "—")}"
                      data-log-location="${escapeHtml(entry.location || player.location || "—")}"
                      data-log-item="${escapeHtml(entry.item || "—")}"
                      data-log-before="${escapeHtml(entry.before || "—")}"
                      data-log-after="${escapeHtml(entry.after || "—")}"
                      data-log-impact="${escapeHtml(impactText)}"
                      data-log-severity="${escapeHtml(entry.severity || "Info")}"
                      data-log-context="${escapeHtml(entry.exchangeContext || "No additional context recorded.")}">View</button>
                  </article>`;}).join("") : renderPlayerEmptyState("No player actions recorded yet.", "logs")}
              </div>
            </section>
          </section>
        </div>
      </section>`;
  }
