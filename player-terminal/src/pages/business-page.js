import { escapeHtml, formatCurrency, formatNumber, formatPercent } from "../core/format.js";
import { renderBusinessWorkforceMarket } from "./business-workforce-market.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderMetric, renderStatusPill } from "../components/ui.js";
import { isEndpointEnabled } from "../api/capabilities.js";

function hiddenBusinessKey(business) {
  return `<input name="businessKey" type="hidden" value="${escapeHtml(business.company.id)}" />`;
}

function playerBusinessCurrencyCode(data) {
  const countries = Array.isArray(data.countries) ? data.countries : [];
  const playerCountry = countries.find((country) => country?.isPlayerCountry === true);
  const candidate = String(playerCountry?.currencyCode || data.session?.currencyCode || "ECO").trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]{2,15}$/.test(candidate) ? candidate : "ECO";
}

function productRow(product, business, currencyCode) {
  return `<article class="player-terminal-business-product">
    <span class="player-terminal-product-icon">${icon(product.icon || "factory")}</span>
    <div><small>${escapeHtml(product.category)}</small><strong>${escapeHtml(product.name)}</strong><p>${escapeHtml(product.description)}</p></div>
    <dl><div><dt>PRICE</dt><dd>${escapeHtml(formatCurrency(product.price, currencyCode))}</dd></div><div><dt>MARGIN</dt><dd>${escapeHtml(formatPercent(product.margin, 1))}</dd></div><div><dt>DEMAND</dt><dd>${escapeHtml(product.demand)}</dd></div></dl>
    <form data-player-form="business-price" data-endpoint="businessPrice" data-product-id="${escapeHtml(product.id)}">
      ${hiddenBusinessKey(business)}
      <input name="productKey" type="hidden" value="${escapeHtml(product.id)}" />
      <input name="expectedVersion" type="hidden" value="${escapeHtml(product.version)}" />
      <label>NEW PRICE<input name="price" type="number" min="0.01" max="1000000" step="0.01" value="${escapeHtml(product.price)}" required /></label>
      <button class="player-terminal-compact-button" type="submit">${icon("edit")} Update</button>
    </form>
  </article>`;
}

function createBusinessPanel(code) {
  return `<section class="player-terminal-panel player-terminal-business-actions">
    <header class="player-terminal-panel-header"><div><span>BUSINESS FORMATION</span><strong>Create or acquire an enterprise</strong></div>${renderStatusPill("CONFIRMATION REQUIRED", "amber")}</header>
    <form data-player-form="business-create" data-endpoint="businessCreate">
      <label>LEGAL NAME<input name="legalName" maxlength="120" required /></label>
      <label>ENTITY TYPE<select name="entityType"><option value="sole_proprietorship">Sole proprietorship</option><option value="partnership">Partnership</option><option value="corporation">Corporation</option><option value="cooperative">Cooperative</option></select></label>
      <label>INDUSTRY CODE<input name="industryCode" maxlength="80" placeholder="manufacturing" required /></label>
      <label>STARTING CAPITAL (${escapeHtml(code)})<input name="capitalization" type="number" min="0" max="10000000" step="0.01" value="0" required /></label>
      <label>ACQUIRE BUSINESS KEY <small>Optional</small><input name="acquireBusinessKey" maxlength="36" placeholder="biz_…" /></label>
      <button class="player-terminal-primary-button" type="submit">${icon("business")} Submit formation</button>
    </form>
  </section>`;
}

function productCreationForm(business) {
  return `<details class="player-terminal-disclosure"><summary><span>${icon("factory")}</span><div><strong>Create a product</strong><small>Configure the product shell; workforce cost is server-owned</small></div>${icon("chevronRight")}</summary><form data-player-form="business-product-create" data-endpoint="businessProductCreate">
    ${hiddenBusinessKey(business)}
    <label>PRODUCT NAME<input name="name" maxlength="120" required /></label>
    <label>CATEGORY<input name="category" maxlength="80" value="general" required /></label>
    <label>UNIT PRICE<input name="unitPrice" type="number" min="0.01" max="1000000" step="0.01" required /></label>
    <label>INPUT COST<input name="unitInputCost" type="number" min="0" max="1000000" step="0.01" value="0" required /></label>
    <label>CAPACITY UNITS<input name="capacityUnits" type="number" min="1" max="100000" step="1" value="100" required /></label>
    <label>BASE DEMAND<input name="baseDemandUnits" type="number" min="0" max="100000" step="1" value="20" required /></label>
    <label>QUALITY SCORE<input name="qualityScore" type="number" min="0" max="100" step="1" value="50" required /></label>
    <button class="player-terminal-secondary-button" type="submit">${icon("factory")} Create product</button>
  </form></details>`;
}

function employeeRows(business, code) {
  const activeEmployees = (business.employees || []).filter((employee) => String(employee.status).toLowerCase() === "active");
  if (!activeEmployees.length) {
    return renderEmptyState({ title: "No active employees", detail: "Hire labor only when the business can sustain its wage obligation.", iconName: "users" });
  }
  return activeEmployees.map((employee) => `<article class="player-terminal-business-product">
    <span class="player-terminal-product-icon">${icon("users")}</span>
    <div><small>${escapeHtml(employee.contractType)}</small><strong>${escapeHtml(employee.role)}</strong><p>${escapeHtml(formatCurrency(employee.wage, code))} per payroll period</p></div>
    <form data-player-form="business-terminate" data-endpoint="businessTerminate" data-employee-id="${escapeHtml(employee.id)}">
      ${hiddenBusinessKey(business)}
      <input name="employeeKey" type="hidden" value="${escapeHtml(employee.id)}" />
      <label>REASON<input name="reason" minlength="2" maxlength="500" required /></label>
      <button class="player-terminal-compact-button" type="submit">Terminate</button>
    </form>
  </article>`).join("");
}

function workforceUtilizationPanel(business, displayCurrency) {
  const utilization = business.workforceUtilization;
  const employees = Array.isArray(utilization?.employees) ? utilization.employees : [];
  const payroll = utilization?.payroll;
  if (!utilization?.businessKey || !utilization?.payrollPeriodKey || !payroll) {
    return renderEmptyState({
      title: "Workforce utilization unavailable",
      detail: "Production still uses server-authoritative labor checks even when this readout is unavailable.",
      iconName: "users"
    });
  }
  const currency = payroll.currencyCode || displayCurrency;
  return `<div data-business-workforce-utilization>
    <div class="player-terminal-business-metrics">
      ${renderMetric({ label: "Payroll period", value: utilization.payrollPeriodKey, meta: String(payroll.status || "not_settled").replace(/[_-]+/g, " "), tone: "cyan", iconName: "users" })}
      ${renderMetric({ label: "Wages due", value: formatCurrency(payroll.wageDue || 0, currency), meta: `${formatCurrency(payroll.wagePaid || 0, currency)} paid`, tone: "amber", iconName: "wallet" })}
      ${renderMetric({ label: "Unpaid wages", value: formatCurrency(payroll.wageUnpaid || 0, currency), meta: `${formatNumber(payroll.employeeCount || 0)} workers`, tone: payroll.wageUnpaid > 0 ? "red" : "green", iconName: "warning" })}
    </div>
    <div>${employees.length ? employees.map((employee) => `<article class="player-terminal-business-product" data-workforce-employee-id="${escapeHtml(employee.employeeKey)}">
      <span class="player-terminal-product-icon">${icon("users")}</span>
      <div><small>${escapeHtml(employee.roleKey)} · ${escapeHtml(employee.latestPayrollStatus)}</small><strong>${escapeHtml(employee.roleName || "Workforce")}</strong><p>${escapeHtml(formatNumber(employee.utilizedMinutes))} / ${escapeHtml(formatNumber(employee.capacityMinutes))} minutes used · ${escapeHtml(formatPercent((employee.utilizationBasisPoints || 0) / 100, 0))} utilization · ${escapeHtml(formatNumber(employee.availableMinutes))} minutes available</p><p>${escapeHtml(formatCurrency(employee.wagePaid || 0, employee.currencyCode || currency))} paid · ${escapeHtml(formatCurrency(employee.wageUnpaid || 0, employee.currencyCode || currency))} unpaid</p></div>
    </article>`).join("") : renderEmptyState({ title: "No active workers", detail: "Hire a server-listed candidate before running recipes that require workforce labor.", iconName: "users" })}</div>
  </div>`;
}

function manufacturingTimestamp(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed);
}

function storeSalesPanel(business, displayCurrency) {
  const snapshot = business.storeSales && typeof business.storeSales === "object"
    ? business.storeSales
    : {};
  const sales = Array.isArray(snapshot.sales) ? snapshot.sales : [];
  const activity = Array.isArray(snapshot.activity) ? snapshot.activity : [];
  const currency = String(snapshot.currencyCode || displayCurrency).trim().toUpperCase() || displayCurrency;
  const activityByReceipt = new Map(
    activity.map((event) => [String(event.receiptKey || ""), event]),
  );
  const summary = `<div class="player-terminal-business-metrics">
    ${renderMetric({ label: "Recent Store sales", value: formatNumber(snapshot.recentReceiptCount || 0), meta: `${formatNumber(snapshot.recentQuantitySold || 0)} units sold`, tone: "cyan", iconName: "store" })}
    ${renderMetric({ label: "Store revenue", value: formatCurrency(snapshot.recentGrossRevenue || 0, currency), meta: "Committed seller receipts", tone: "green", iconName: "wallet" })}
    ${renderMetric({ label: "Store COGS", value: formatCurrency(snapshot.recentCostOfGoodsSold || 0, currency), meta: `${formatCurrency(snapshot.recentGrossMargin || 0, currency)} gross margin`, tone: "amber", iconName: "chart" })}
  </div>`;
  const detail = sales.length
    ? sales.map((sale) => {
      const event = activityByReceipt.get(String(sale.receiptKey || ""));
      return `<article class="player-terminal-business-product" data-business-store-sale-receipt="${escapeHtml(sale.receiptKey)}">
        <span class="player-terminal-product-icon">${icon("store")}</span>
        <div><small>${escapeHtml(manufacturingTimestamp(sale.completedAt))} · ${escapeHtml(sale.offerKey)}</small><strong>${escapeHtml(sale.itemKey)}</strong><p>${escapeHtml(formatNumber(sale.quantity))} units · receipt ${escapeHtml(sale.receiptKey)}</p>${event ? `<p data-business-store-sale-activity="${escapeHtml(event.activityKey)}">Activity committed · ${escapeHtml(event.reasonCode)}</p>` : ""}</div>
        <dl><div><dt>REVENUE</dt><dd>${escapeHtml(formatCurrency(sale.grossRevenue, sale.currencyCode || currency))}</dd></div><div><dt>COGS</dt><dd>${escapeHtml(formatCurrency(sale.costOfGoodsSold, sale.currencyCode || currency))}</dd></div><div><dt>MARGIN</dt><dd>${escapeHtml(formatCurrency(sale.grossMargin, sale.currencyCode || currency))}</dd></div></dl>
      </article>`;
    }).join("")
    : renderEmptyState({
      title: "No committed Store sales",
      detail: "Business-offer purchases will appear here from immutable Store receipts and activity evidence.",
      iconName: "store",
    });
  return `<section class="player-terminal-panel player-terminal-business-products" data-business-store-sales aria-live="polite">
    <header class="player-terminal-panel-header"><div><span>STORE SALES · FINANCE · ACTIVITY</span><strong>Committed seller evidence</strong></div>${renderStatusPill("RECEIPT BACKED", "green")}</header>
    ${summary}<div>${detail}</div>
  </section>`;
}

function manufacturingJobsPanel(business) {
  const jobs = Array.isArray(business.manufacturingJobs)
    ? business.manufacturingJobs
    : [];
  if (!jobs.length) {
    return renderEmptyState({
      title: "No manufacturing jobs",
      detail: "Start an exact catalog recipe when materials, labor, and installed equipment are ready.",
      iconName: "factory",
    });
  }
  return jobs.map((job) => {
    const status = String(job.status || "queued").replace(/_/g, " ");
    const due = job.completedAt || job.cancelledAt || job.failedAt ||
      job.completesAt || job.startedAt || job.queuedAt;
    return `<article class="player-terminal-business-product" data-business-manufacturing-job="${escapeHtml(job.jobKey)}">
      <span class="player-terminal-product-icon">${icon("factory")}</span>
      <div><small>${escapeHtml(status.toUpperCase())} · ${escapeHtml(job.priority)}</small><strong>${escapeHtml(job.productName)}</strong><p>${escapeHtml(formatNumber(job.quantity))} units · ${escapeHtml(job.resourceState.replace(/_/g, " "))} · ${escapeHtml(manufacturingTimestamp(due))}</p>${job.failureCode ? `<p>${escapeHtml(job.failureCode)}</p>` : ""}</div>
      ${job.canCancel ? `<form data-player-form="business-manufacturing-cancel" data-endpoint="businessManufacturingCancel" data-business-id="${escapeHtml(job.businessKey)}" data-job-id="${escapeHtml(job.jobKey)}"><button class="player-terminal-compact-button" type="submit">Cancel job</button></form>` : renderStatusPill(status.toUpperCase(), job.status === "completed" ? "green" : job.status === "failed" ? "red" : "cyan")}
    </article>`;
  }).join("");
}

function businessMoney(value) {
  const amount = typeof value?.amount === "string" ? value.amount.trim() : "";
  const precision = Number(value?.precision);
  const currencyCode = String(value?.currencyCode || "").trim().toUpperCase();
  if (
    !/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(amount) ||
    !Number.isSafeInteger(precision) || precision < 0 || precision > 18 ||
    !/^[A-Z0-9_]{3,16}$/u.test(currencyCode)
  ) {
    return "Unavailable";
  }
  const [whole, fraction = ""] = amount.split(".");
  if (fraction.length > precision) return "Unavailable";
  const groupedWhole = whole.replace(/\B(?=(?:[0-9]{3})+(?![0-9]))/gu, ",");
  const fixedFraction = fraction.padEnd(precision, "0");
  return `${currencyCode} ${groupedWhole}${precision ? `.${fixedFraction}` : ""}`;
}

function positiveBusinessAmount(value) {
  const amount = typeof value?.amount === "string" ? value.amount.trim() : "";
  return /^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(amount) &&
    /[1-9]/u.test(amount);
}

function businessDecimalStep(value) {
  const precision = Number(value);
  if (!Number.isSafeInteger(precision) || precision < 0 || precision > 18) return "any";
  return precision === 0 ? "1" : `0.${"0".repeat(precision - 1)}1`;
}

export function formatBusinessRatePercent(value) {
  const rate = typeof value === "string" ? value.trim() : "";
  if (!/^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(rate)) {
    return "Unavailable";
  }
  const [whole, fraction = ""] = rate.split(".");
  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + 2;
  const padded = decimalIndex >= digits.length
    ? digits.padEnd(decimalIndex + 1, "0")
    : digits;
  const percentWhole = padded.slice(0, decimalIndex).replace(/^0+(?=[0-9])/u, "") || "0";
  const rawFraction = padded.slice(decimalIndex).replace(/0+$/u, "");
  const percentFraction = rawFraction.padEnd(2, "0");
  return `${percentWhole}.${percentFraction}%`;
}

function businessTimestamp(value, unavailableText = "Unavailable") {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return unavailableText;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(parsed));
}

function shortBusinessKey(value) {
  const key = String(value || "");
  return key.length > 17 ? `${key.slice(0, 8)}…${key.slice(-6)}` : key;
}

function treasuryCurrencies(treasury) {
  const currencies = new Set([treasury.reportingCurrencyCode]);
  for (const account of treasury.accounts || []) currencies.add(account.currencyCode);
  for (const rate of treasury.rates || []) {
    currencies.add(rate.sourceCurrencyCode);
    currencies.add(rate.targetCurrencyCode);
  }
  return [...currencies].filter(Boolean).sort();
}

function treasuryAccountCard(account) {
  const usable = account.status === "active" || account.status === "open";
  return `<article class="player-terminal-business-treasury-account${usable ? "" : " is-restricted"}" data-business-treasury-account="${escapeHtml(account.accountKey)}">
    <header><div><small>${escapeHtml(account.currencyCode)} BUSINESS CHECKING</small><strong>${escapeHtml(shortBusinessKey(account.accountKey))}</strong></div>${renderStatusPill(account.status.toUpperCase(), usable ? "green" : "amber")}</header>
    <dl>
      <div><dt>POSTED</dt><dd>${escapeHtml(businessMoney(account.posted))}</dd></div>
      <div><dt>HELD</dt><dd>${escapeHtml(businessMoney(account.held))}</dd></div>
      <div><dt>AVAILABLE</dt><dd>${escapeHtml(businessMoney(account.available))}</dd></div>
    </dl>
  </article>`;
}

function treasuryQuoteReview(treasury, capabilities) {
  const quote = treasury.currentQuote;
  if (!quote) {
    return `<div class="player-terminal-business-treasury-quote is-empty" data-business-treasury-quote aria-live="polite"><small>IMMUTABLE FX QUOTE</small><strong>Review required before conversion</strong><p>Select the source, destination currency, amount, and product to request exact server-owned terms.</p></div>`;
  }
  const expired = Date.parse(quote.expiresAt) <= Date.now();
  const endpointKey = quote.product === "instant"
    ? "businessTreasuryFxInstant"
    : "businessTreasuryFxStandard";
  const enabled = isEndpointEnabled(capabilities, endpointKey) && !expired;
  return `<div class="player-terminal-business-treasury-quote${expired ? " is-expired" : ""}" data-business-treasury-quote aria-live="polite">
    <header><div><small>${expired ? "QUOTE EXPIRED" : "IMMUTABLE FX QUOTE"}</small><strong>${escapeHtml(quote.sourceAmount.currencyCode)} → ${escapeHtml(quote.targetAmount.currencyCode)} · ${escapeHtml(quote.product.toUpperCase())}</strong></div>${renderStatusPill(treasury.currentQuoteOutcome === "replayed" ? "REPLAYED" : expired ? "EXPIRED" : "READY", treasury.currentQuoteOutcome === "replayed" ? "purple" : expired ? "amber" : "cyan")}</header>
    <dl>
      <div><dt>SOURCE DEBIT</dt><dd>${escapeHtml(businessMoney(quote.sourceAmount))}</dd></div>
      <div><dt>REFERENCE RATE</dt><dd>${escapeHtml(quote.referenceRate)}</dd></div>
      <div><dt>CUSTOMER RATE</dt><dd>${escapeHtml(quote.customerRate)}</dd></div>
      <div><dt>BANK SPREAD</dt><dd>${escapeHtml(formatBusinessRatePercent(quote.spreadRate))}</dd></div>
      <div><dt>${quote.product === "instant" ? `INSTANT FEE · ${escapeHtml(formatBusinessRatePercent(quote.feeRate))}` : "SEPARATE FEE"}</dt><dd>${escapeHtml(businessMoney(quote.feeAmount))}</dd></div>
      <div><dt>TARGET CREDIT</dt><dd>${escapeHtml(businessMoney(quote.targetAmount))}</dd></div>
    </dl>
    <p>${escapeHtml(quote.roundingDisclosure)} · Fixing ${escapeHtml(shortBusinessKey(quote.fixingKey))} · ${quote.product === "standard" ? `settles ${escapeHtml(businessTimestamp(quote.settlesAt))}` : "settles immediately after confirmation"} · expires ${escapeHtml(businessTimestamp(quote.expiresAt))}</p>
    <form data-player-business-treasury-form="order" data-endpoint="${escapeHtml(endpointKey)}">
      <button class="player-terminal-primary-button" type="submit" ${enabled ? "" : "disabled"}>${icon("arrowSwap")} ${quote.product === "instant" ? "Convert instantly" : "Reserve standard order"}</button>
    </form>
  </div>`;
}

function treasuryOrderRow(order, capabilities) {
  const canCancel = order.product === "standard" && order.completedAt === null &&
    !new Set(["cancelled", "failed", "settled", "completed"]).has(order.status) &&
    isEndpointEnabled(capabilities, "businessTreasuryFxCancel");
  return `<article class="player-terminal-business-treasury-evidence" data-business-treasury-order="${escapeHtml(order.orderKey)}">
    <div><small>${escapeHtml(order.product.toUpperCase())} · ${escapeHtml(order.status.toUpperCase())}</small><strong>${escapeHtml(businessMoney(order.sourceAmount))} → ${escapeHtml(businessMoney(order.targetAmount))}</strong><p>${escapeHtml(shortBusinessKey(order.orderKey))} · submitted ${escapeHtml(businessTimestamp(order.submittedAt))} · settles ${escapeHtml(businessTimestamp(order.settlesAt))}</p></div>
    ${canCancel ? `<form data-player-business-treasury-form="cancel" data-endpoint="businessTreasuryFxCancel" data-order-key="${escapeHtml(order.orderKey)}"><button class="player-terminal-compact-button" type="submit">Cancel pending order</button></form>` : renderStatusPill(order.status.toUpperCase(), order.status === "settled" || order.status === "completed" ? "green" : order.status === "failed" ? "red" : "cyan")}
  </article>`;
}

function treasuryReceiptRow(receipt) {
  return `<article class="player-terminal-business-treasury-evidence" data-business-treasury-receipt="${escapeHtml(receipt.receiptKey)}">
    <div><small>IMMUTABLE ${escapeHtml(receipt.product.toUpperCase())} RECEIPT</small><strong>${escapeHtml(businessMoney(receipt.sourceAmount))} → ${escapeHtml(businessMoney(receipt.targetAmount))}</strong><p>${escapeHtml(shortBusinessKey(receipt.receiptKey))} · ${escapeHtml(businessTimestamp(receipt.completedAt))} · fee ${escapeHtml(businessMoney(receipt.feeAmount))} · target reserve draw ${escapeHtml(businessMoney(receipt.reserveDrawAmount))} · source reserve repayment ${escapeHtml(businessMoney(receipt.reserveRepaymentAmount))}</p></div>${renderStatusPill("COMMITTED", "green")}
  </article>`;
}

function businessTreasuryPanel(data) {
  const treasury = data.businessTreasury;
  const resource = data.resourceStatus?.businessTreasury;
  const capabilities = data.capabilities || { actions: {} };
  const state = resource?.state || (treasury ? "ready" : "loading");
  const hasSnapshot = treasury && treasury.businessKey === data.business.company.id;
  if (!hasSnapshot) {
    const unsupported = resource?.code === "CAPABILITY_UNAVAILABLE";
    return `<section class="player-terminal-panel player-terminal-business-treasury" data-business-treasury-state="${escapeHtml(state)}" aria-live="polite">
      <header class="player-terminal-panel-header"><div><span>BUSINESS TREASURY</span><strong>${state === "loading" || state === "refreshing" ? "Loading canonical accounts" : unsupported ? "Treasury not enabled" : state === "empty" ? "No treasury snapshot" : "Treasury unavailable"}</strong></div>${renderStatusPill(state === "loading" || state === "refreshing" ? "LOADING" : unsupported ? "NOT ENABLED" : state === "empty" ? "EMPTY" : "ERROR", state === "loading" || state === "refreshing" ? "cyan" : "amber")}</header>
      ${state === "loading" || state === "refreshing" ? `<div class="player-terminal-business-treasury-loading" aria-label="Loading Business treasury"><i></i><i></i><i></i></div>` : renderEmptyState({ title: unsupported ? "Treasury capability unavailable" : state === "empty" ? "No canonical treasury snapshot" : "Current balances could not be refreshed", detail: unsupported ? "This game has not enabled Business treasury controls." : "No cached amount is treated as current. Retry the public-key treasury read.", iconName: "wallet" })}
      ${state === "loading" || state === "refreshing" || unsupported ? "" : `<button class="player-terminal-secondary-button" type="button" data-business-treasury-refresh>${icon("refresh")} Retry treasury</button>`}
    </section>`;
  }

  const accounts = Array.isArray(treasury.accounts) ? treasury.accounts : [];
  const currencies = treasuryCurrencies(treasury);
  const ownedCurrencies = new Set(accounts.map((entry) => entry.currencyCode));
  const openCurrencies = currencies.filter((currency) => !ownedCurrencies.has(currency));
  const sourceAccounts = accounts.filter((entry) =>
    new Set(["active", "open"]).has(entry.status) && positiveBusinessAmount(entry.available)
  );
  const quoteTargets = currencies.filter((currency) =>
    sourceAccounts.some((account) => account.currencyCode !== currency)
  );
  const freshness = state === "ready"
    ? { label: "BANKING AUTHORITY", tone: "green", message: "" }
    : state === "refreshing"
    ? { label: "REFRESHING", tone: "cyan", message: "A canonical refresh is in progress. Existing evidence remains visible; submit controls use the last validated snapshot." }
    : { label: "STALE", tone: "amber", message: "The last validated treasury snapshot is preserved, but current balances could not be confirmed. Refresh before starting a new economic action." };
  const sourcePrecision = sourceAccounts[0]?.precision;
  return `<section class="player-terminal-panel player-terminal-business-treasury" data-business-treasury-state="${escapeHtml(state)}" aria-live="polite">
    <header class="player-terminal-panel-header"><div><span>BUSINESS TREASURY</span><strong>Canonical Checking accounts & FX</strong></div>${renderStatusPill(freshness.label, freshness.tone)}</header>
    ${freshness.message ? `<div class="player-terminal-business-treasury-freshness" role="status"><p>${escapeHtml(freshness.message)}</p><button class="player-terminal-compact-button" type="button" data-business-treasury-refresh>${icon("refresh")} Refresh canonical state</button></div>` : ""}
    <div class="player-terminal-business-treasury-meta"><span>Reporting currency <strong>${escapeHtml(treasury.reportingCurrencyCode)}</strong></span><span>Generated <strong>${escapeHtml(businessTimestamp(treasury.generatedAt))}</strong></span><button class="player-terminal-compact-button" type="button" data-business-treasury-refresh>${icon("refresh")} Refresh</button></div>
    <div class="player-terminal-business-treasury-accounts">${accounts.length ? accounts.map(treasuryAccountCard).join("") : renderEmptyState({ title: "No Business Checking accounts", detail: "Open the reporting-currency account before procurement or treasury FX.", iconName: "wallet" })}</div>
    <div class="player-terminal-business-treasury-actions">
      <details class="player-terminal-disclosure"><summary><span>${icon("banking")}</span><div><strong>Open a currency account</strong><small>One canonical zero-balance Business Checking account per currency</small></div>${icon("chevronRight")}</summary>
        <form data-player-business-treasury-form="account" data-endpoint="businessTreasuryAccountOpen">
          <label>CURRENCY<select name="currencyCode" required ${openCurrencies.length ? "" : "disabled"}>${openCurrencies.map((currency) => `<option value="${escapeHtml(currency)}">${escapeHtml(currency)}</option>`).join("") || `<option value="">All active currencies are open</option>`}</select></label>
          <button class="player-terminal-secondary-button" type="submit" ${openCurrencies.length && isEndpointEnabled(capabilities, "businessTreasuryAccountOpen") ? "" : "disabled"}>Open Checking account</button>
        </form>
      </details>
      <details class="player-terminal-disclosure" open><summary><span>${icon("arrowSwap")}</span><div><strong>Convert treasury currency</strong><small>Review the exact accepted fixing, 0.50% spread, and product timing</small></div>${icon("chevronRight")}</summary>
        <form data-player-business-treasury-form="quote" data-endpoint="businessTreasuryFxQuote">
          <label>SOURCE CHECKING<select name="sourceAccountKey" required ${sourceAccounts.length ? "" : "disabled"}>${sourceAccounts.map((account) => `<option value="${escapeHtml(account.accountKey)}" data-currency-code="${escapeHtml(account.currencyCode)}" data-precision="${escapeHtml(account.precision)}">${escapeHtml(account.currencyCode)} · ${escapeHtml(businessMoney(account.available))} available</option>`).join("") || `<option value="">No funded account available</option>`}</select></label>
          <label>TARGET CURRENCY<select name="targetCurrencyCode" required ${quoteTargets.length ? "" : "disabled"}>${quoteTargets.map((currency) => `<option value="${escapeHtml(currency)}">${escapeHtml(currency)}</option>`).join("") || `<option value="">Open another currency first</option>`}</select></label>
          <label>SOURCE AMOUNT<input name="sourceAmount" type="number" min="${escapeHtml(businessDecimalStep(sourcePrecision))}" step="${escapeHtml(businessDecimalStep(sourcePrecision))}" inputmode="decimal" required /></label>
          <label>PRODUCT<select name="product" required><option value="standard">Standard · next game-local 08:00</option><option value="instant">Instant · separate 2.00% fee</option></select></label>
          <button class="player-terminal-primary-button" type="submit" ${sourceAccounts.length && quoteTargets.length && isEndpointEnabled(capabilities, "businessTreasuryFxQuote") ? "" : "disabled"}>${icon("eye")} Review exact quote</button>
        </form>
        <p class="player-terminal-inline-error" role="alert" tabindex="-1" data-business-treasury-error hidden></p>
        ${treasuryQuoteReview(treasury, capabilities)}
      </details>
    </div>
    ${treasury.refreshPending && treasury.lastCommittedOrder ? `<div class="player-terminal-business-treasury-recovery" role="status"><strong>Conversion committed; refresh pending</strong><p>Receipt ${escapeHtml(shortBusinessKey(treasury.lastCommittedOrder.receiptKey || treasury.lastCommittedOrder.orderKey))} is authoritative. Balances will refresh without resubmitting.</p><button class="player-terminal-secondary-button" type="button" data-business-treasury-refresh>Refresh committed result</button></div>` : ""}
    ${treasury.accountRefreshPending && treasury.lastAccountOpen ? `<div class="player-terminal-business-treasury-recovery" role="status"><strong>Account opened; refresh pending</strong><p>${escapeHtml(treasury.lastAccountOpen.currencyCode)} Business Checking ${escapeHtml(shortBusinessKey(treasury.lastAccountOpen.accountKey))} is authoritative. Refresh the treasury projection without resubmitting.</p><button class="player-terminal-secondary-button" type="button" data-business-treasury-refresh>Refresh opened account</button></div>` : ""}
    <div class="player-terminal-business-treasury-ledger"><section><header><small>PENDING & RECENT ORDERS</small><strong>${escapeHtml(treasury.orders.length)} orders</strong></header>${treasury.orders.length ? treasury.orders.map((entry) => treasuryOrderRow(entry, capabilities)).join("") : renderEmptyState({ title: "No treasury orders", detail: "Standard reservations and instant results will appear here after server confirmation.", iconName: "arrowSwap" })}</section><section><header><small>IMMUTABLE FX RECEIPTS</small><strong>${escapeHtml(treasury.receipts.length)} receipts</strong></header>${treasury.receipts.length ? treasury.receipts.map(treasuryReceiptRow).join("") : renderEmptyState({ title: "No FX receipts", detail: "Committed conversions will appear here as immutable public-key evidence.", iconName: "document" })}</section></div>
  </section>`;
}

function procurementAllocationRows(accounts, reportingCurrencyCode, reportingPrecision) {
  const options = accounts.map((account) => `<option value="${escapeHtml(account.accountKey)}">${escapeHtml(account.currencyCode)} · ${escapeHtml(businessMoney(account.available))} available</option>`).join("");
  const step = businessDecimalStep(reportingPrecision);
  return [0, 1, 2].map((index) => `<div class="player-terminal-business-procurement-allocation" data-business-procurement-allocation data-allocation-index="${index}">
    <label>ACCOUNT ${index + 1}<select name="sourceAccountKey" ${index === 0 ? "required" : ""} ${index > 0 ? "disabled" : ""}><option value="">${index === 0 ? "Choose Checking account" : "Not used"}</option>${options}</select></label>
    <label><span data-business-procurement-allocation-label>${index === 0 ? "SERVER-DERIVED REMAINDER" : `FIXED CONTRIBUTION · ${escapeHtml(reportingCurrencyCode)}`}</span><input name="targetAmount" type="number" min="${escapeHtml(step)}" step="${escapeHtml(step)}" inputmode="decimal" placeholder="${index === 0 ? "Server derives the full bill" : "Enter fixed amount"}" disabled /></label>
  </div>`).join("");
}

function businessProcurementPanel(data) {
  const treasury = data.businessTreasury;
  if (!treasury || treasury.businessKey !== data.business?.company?.id) return "";
  const accounts = treasury.accounts.filter((entry) => new Set(["active", "open"]).has(entry.status));
  const reportingPrecision = accounts.find((entry) =>
    entry.currencyCode === treasury.reportingCurrencyCode
  )?.precision;
  const items = Array.isArray(data.store?.items)
    ? data.store.items.filter((entry) => /^[a-z0-9_-]{1,64}$/u.test(String(entry.itemKey || entry.id || "")) && Number(entry.stock) > 0)
    : [];
  const quote = treasury.currentProcurementQuote;
  const receipt = treasury.lastProcurementReceipt;
  const expired = quote ? Date.parse(quote.expiresAt) <= Date.now() : false;
  return `<section class="player-terminal-panel player-terminal-business-procurement" data-business-procurement-state="${quote ? expired ? "expired" : "quoted" : receipt ? "settled" : "ready"}" aria-live="polite">
    <header class="player-terminal-panel-header"><div><span>FUNDED STORE PROCUREMENT</span><strong>Quote, fund, and deliver atomically</strong></div>${renderStatusPill("WAREHOUSE DELIVERY", "cyan")}</header>
    <form data-player-business-procurement-form="quote" data-endpoint="businessStoreQuote">
      <div class="player-terminal-business-procurement-intent"><label>STORE ITEM<select name="itemKey" required ${items.length ? "" : "disabled"}>${items.map((item) => `<option value="${escapeHtml(item.itemKey || item.id)}">${escapeHtml(item.name)} · ${escapeHtml(formatCurrency(item.price, item.currencyCode))} · ${escapeHtml(item.stock)} available</option>`).join("") || `<option value="">No Store input is available</option>`}</select></label><label>QUANTITY<input name="quantity" type="number" min="1" max="100000" step="1" value="1" required /></label></div>
      <div class="player-terminal-business-procurement-summary"><span><small>AUTHORITATIVE BILL</small><strong data-business-procurement-estimate>Server-derived at quote</strong></span><span><small>FIXED ALLOCATIONS</small><strong data-business-procurement-funded>None</strong></span><span><small>REMAINDER</small><strong data-business-procurement-remaining>Choose the final account</strong></span></div>
      <p>Choose one to three ordered, unique Business Checking accounts. Enter exact reporting-currency amounts only for accounts before the last; the server derives the entire authoritative Store bill and assigns its remaining amount to the final account.</p>
      <div class="player-terminal-business-procurement-allocations">${procurementAllocationRows(accounts, treasury.reportingCurrencyCode, reportingPrecision)}</div>
      <button class="player-terminal-primary-button" type="submit" data-business-procurement-quote-submit disabled>${icon("eye")} Review funded procurement quote</button>
    </form>
    <p class="player-terminal-inline-error" role="alert" tabindex="-1" data-business-procurement-error hidden></p>
    <div class="player-terminal-business-procurement-quote${quote ? expired ? " is-expired" : "" : " is-empty"}" data-business-procurement-quote>
      ${quote ? `<header><div><small>${expired ? "FUNDED QUOTE EXPIRED" : "IMMUTABLE FUNDED QUOTE"}</small><strong>${escapeHtml(quote.itemName)} · ${escapeHtml(quote.quantity)} units</strong></div>${renderStatusPill(quote.replayed ? "REPLAYED" : expired ? "EXPIRED" : "READY", quote.replayed ? "purple" : expired ? "amber" : "cyan")}</header><dl><div><dt>TARGET BILL</dt><dd>${escapeHtml(businessMoney(quote.fundingQuote.targetAmount))}</dd></div><div><dt>FUNDING LINES</dt><dd>${escapeHtml(quote.fundingQuote.lines.length)}</dd></div><div><dt>EXPIRES</dt><dd>${escapeHtml(businessTimestamp(quote.expiresAt))}</dd></div></dl><div>${quote.fundingQuote.lines.map((line) => `<p><strong>${escapeHtml(line.sourceCurrencyCode)}</strong> ${escapeHtml(businessMoney(line.sourceDebit))} debit → ${escapeHtml(businessMoney(line.targetContribution))} · reference ${escapeHtml(line.referenceRate)} · customer ${escapeHtml(line.customerRate)} · spread ${escapeHtml(formatBusinessRatePercent(line.spreadRate))} · ${escapeHtml(line.roundingDisclosure)}</p>`).join("")}</div><form data-player-business-procurement-form="purchase" data-endpoint="businessStorePurchase"><button class="player-terminal-primary-button" type="submit" ${expired || !isEndpointEnabled(data.capabilities, "businessStorePurchase") ? "disabled" : ""}>${icon("cart")} Confirm atomic procurement</button></form>` : `<small>IMMUTABLE FUNDED QUOTE</small><strong>No quote under review</strong><p>Create a current quote before stock, money, or Warehouse state can change.</p>`}
    </div>
    ${receipt ? `<article class="player-terminal-business-procurement-receipt" data-business-procurement-receipt="${escapeHtml(receipt.receiptKey)}"><header><div><small>IMMUTABLE PROCUREMENT RECEIPT</small><strong>${escapeHtml(receipt.itemName)} · ${escapeHtml(receipt.quantity)} units delivered</strong></div>${renderStatusPill(receipt.alreadyCompleted ? "REPLAYED" : "COMMITTED", receipt.alreadyCompleted ? "purple" : "green")}</header><dl><div><dt>TOTAL PAID</dt><dd>${escapeHtml(businessMoney(receipt.fundingReceipt.targetAmount))}</dd></div><div><dt>WAREHOUSE QUANTITY</dt><dd>${escapeHtml(formatNumber(receipt.warehouseQuantityOwned, 4))}</dd></div><div><dt>AVERAGE COST</dt><dd>${escapeHtml(businessMoney(receipt.warehouseAverageUnitCostMoney))}</dd></div></dl><p>Funding ${escapeHtml(shortBusinessKey(receipt.fundingReceipt.receiptKey))} · Banking ${escapeHtml(shortBusinessKey(receipt.fundingReceipt.bankTransactionKey))} · ${escapeHtml(businessTimestamp(receipt.completedAt))}</p></article>` : ""}
    ${treasury.procurementRefreshPending && receipt ? `<div class="player-terminal-business-treasury-recovery" role="status"><strong>Procurement committed; refresh pending</strong><p>The receipt above is authoritative. Refresh Warehouse, Store, and treasury projections without resubmitting.</p><button class="player-terminal-secondary-button" type="button" data-business-procurement-refresh>Refresh committed result</button></div>` : ""}
  </section>`;
}

function statusForm(business) {
  return `<details class="player-terminal-disclosure"><summary><span>${icon("warning")}</span><div><strong>Change business status</strong><small>Restructure, recover, or permanently close</small></div>${icon("chevronRight")}</summary><form data-player-form="business-status" data-endpoint="businessStatus">
    ${hiddenBusinessKey(business)}
    <label>TRANSITION<select name="transition"><option value="restructure">Restructure</option><option value="recover">Recover</option><option value="close">Close permanently</option></select></label>
    <label>REASON<textarea name="reason" minlength="2" maxlength="500" required></textarea></label>
    <button class="player-terminal-secondary-button" type="submit">Apply status change</button>
  </form></details>`;
}

export function renderBusinessPage(data) {
  const business = data.business;
  const code = playerBusinessCurrencyCode(data);
  if (!business.configured) {
    return `<section class="player-terminal-page player-terminal-business-page" data-page="business">
      <div class="player-terminal-page-heading"><div><small>PLAYER ENTERPRISE</small><h2>Business</h2><p>Create or acquire one game-scoped enterprise using your authoritative country and currency.</p></div></div>
      <div class="player-terminal-business-layout">${createBusinessPanel(code)}</div>
    </section>`;
  }

  const capacityTone = business.operations.capacityUse >= 90 ? "red" : business.operations.capacityUse >= 75 ? "amber" : "green";
  const statusLabel = String(business.company.status || "").trim().toUpperCase();
  return `<section class="player-terminal-page player-terminal-business-page" data-page="business">
    <div class="player-terminal-page-heading"><div><small>PLAYER ENTERPRISE</small><h2>Business</h2><p>Operate a bounded company model with server-authoritative settlement and accounting.</p></div><div class="player-terminal-heading-actions">${renderStatusPill(statusLabel, "green")}</div></div>

    <div class="player-terminal-business-metrics">
      ${renderMetric({ label: "Company value", value: formatCurrency(business.company.valuation, code), meta: `${business.company.valuationChange >= 0 ? "+" : ""}${business.company.valuationChange.toFixed(1)}% this cycle`, tone: "cyan", iconName: "business" })}
      ${renderMetric({ label: "Operating cash", value: formatCurrency(business.company.cash, code), meta: "Available for operations", tone: "green", iconName: "wallet" })}
      ${renderMetric({ label: "Cycle revenue", value: formatCurrency(business.company.revenue, code), meta: `${business.company.margin.toFixed(1)}% operating margin`, tone: "amber", iconName: "chart" })}
      ${renderMetric({ label: "Reputation", value: `${business.company.reputation}/100`, meta: business.company.reputationLabel, tone: "purple", iconName: "star" })}
    </div>

    <div class="player-terminal-business-layout">
      <section class="player-terminal-panel player-terminal-company-overview">
        <header class="player-terminal-panel-header"><div><span>COMPANY PROFILE</span><strong>${escapeHtml(business.company.name)}</strong></div>${renderStatusPill(business.company.industry, "cyan")}</header>
        <div class="player-terminal-company-identity"><span>${icon("business")}</span><div><small>${escapeHtml(business.company.registration)}</small><h3>${escapeHtml(business.company.name)}</h3><p>${escapeHtml(business.company.summary)}</p></div></div>
        <dl class="player-terminal-company-facts">
          <div><dt>HEADQUARTERS</dt><dd>${escapeHtml(business.company.headquarters)}</dd></div>
          <div><dt>EMPLOYEES</dt><dd>${escapeHtml(formatNumber(business.operations.employees))}</dd></div>
          <div><dt>PRODUCTION</dt><dd>${escapeHtml(formatNumber(business.operations.output))} units</dd></div>
          <div><dt>BACKLOG</dt><dd>${escapeHtml(formatNumber(business.operations.backlog))} units</dd></div>
        </dl>
        <div class="player-terminal-capacity-block"><div><small>PRODUCT UNIT CAPACITY</small><strong>${escapeHtml(business.operations.capacityUse)}%</strong></div><div class="player-terminal-progress-track is-${capacityTone}"><i style="width:${Math.min(100,business.operations.capacityUse)}%"></i></div><p>${escapeHtml(business.operations.capacityNote)}</p></div>
      </section>

      ${businessTreasuryPanel(data)}

      ${businessProcurementPanel(data)}

      <section class="player-terminal-panel player-terminal-business-actions">
        <header class="player-terminal-panel-header"><div><span>OPERATIONS</span><strong>Run the company</strong></div>${renderStatusPill("CONFIRMATION REQUIRED", "amber")}</header>
        <details class="player-terminal-disclosure" open><summary><span>${icon("factory")}</span><div><strong>Start manufacturing</strong><small>The server reserves exact materials, labor, equipment, and completion time</small></div>${icon("chevronRight")}</summary><form data-player-form="business-manufacturing-start" data-endpoint="businessManufacturingStart" data-business-id="${escapeHtml(business.company.id)}">
          <label>PRODUCT<select name="productKey" required ${business.products.length ? "" : "disabled"}>${business.products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)}</option>`).join("") || `<option value="">No exact catalog products available</option>`}</select></label>
          <label>RUN SIZE<input name="quantity" type="number" min="1" max="${escapeHtml(Math.min(10000, Math.max(1, business.operations.maxRun || 1)))}" value="10" required /></label>
          <label>PRIORITY<select name="priority"><option value="standard">Standard</option><option value="expedite">Expedite</option></select></label>
          <button class="player-terminal-primary-button" type="submit" ${business.products.length && business.operations.maxRun > 0 ? "" : "disabled"}>${icon("factory")} Start manufacturing</button>
        </form><div data-business-manufacturing-jobs>${manufacturingJobsPanel(business)}</div></details>
        <details class="player-terminal-disclosure" open><summary><span>${icon("users")}</span><div><strong>Workforce utilization & payroll</strong><small>Finite labor minutes and recurring wage settlement</small></div>${icon("chevronRight")}</summary>${workforceUtilizationPanel(business, code)}</details>
        <details class="player-terminal-disclosure"><summary><span>${icon("users")}</span><div><strong>Workforce candidates</strong><small>Select from server-priced, role-grouped candidates</small></div>${icon("chevronRight")}</summary><div class="player-terminal-workforce-market">${renderBusinessWorkforceMarket(data.businessWorkforce, business, code)}</div></details>
        ${productCreationForm(business)}
        ${statusForm(business)}
      </section>

      <section class="player-terminal-panel player-terminal-business-products">
        <header class="player-terminal-panel-header"><div><span>PRODUCT LINE</span><strong>${escapeHtml(business.products.length)} active products</strong></div><small>Pricing changes apply only after confirmation</small></header>
        <div>${business.products.length ? business.products.map((product) => productRow(product, business, code)).join("") : renderEmptyState({ title: "No products configured", detail: "Create a product before running production.", iconName: "business" })}</div>
      </section>

      ${storeSalesPanel(business, code)}

      <section class="player-terminal-panel player-terminal-business-products">
        <header class="player-terminal-panel-header"><div><span>EMPLOYMENT</span><strong>${escapeHtml((business.employees || []).filter((employee) => String(employee.status).toLowerCase() === "active").length)} active employees</strong></div><small>Wages settle through recurring Business payroll</small></header>
        <div>${employeeRows(business, code)}</div>
      </section>

      <section class="player-terminal-panel player-terminal-business-suppliers">
        <header class="player-terminal-panel-header"><div><span>INPUT INVENTORY</span><strong>${escapeHtml((business.inventory || []).length)} tracked inputs</strong></div>${renderStatusPill("LEDGER BACKED", "green")}</header>
        <div>${(business.inventory || []).length ? business.inventory.map((item) => `<article><span class="is-green"></span><div><strong>${escapeHtml(item.itemKey)}</strong><small>${escapeHtml(item.kind)}</small></div><div><strong>${escapeHtml(formatNumber(item.quantity, 2))}</strong><small>${escapeHtml(formatCurrency(item.unitCost, code))} each</small></div></article>`).join("") : renderEmptyState({ title: "No inputs held", detail: "Purchase inputs for an approved product before production.", iconName: "inventory" })}</div>
      </section>
    </div>
  </section>`;
}
