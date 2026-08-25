import { escapeHtml, formatCurrency, formatNumber, formatPercent } from "../core/format.js";
import { renderBusinessWorkforceMarket } from "./business-workforce-market.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderMetric, renderStatusPill } from "../components/ui.js";

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
    return `<section class="player-terminal-page player-terminal-business-page">
      <div class="player-terminal-page-heading"><div><small>PLAYER ENTERPRISE</small><h2>Business</h2><p>Create or acquire one game-scoped enterprise using your authoritative country and currency.</p></div></div>
      <div class="player-terminal-business-layout">${createBusinessPanel(code)}</div>
    </section>`;
  }

  const capacityTone = business.operations.capacityUse >= 90 ? "red" : business.operations.capacityUse >= 75 ? "amber" : "green";
  const statusLabel = String(business.company.status || "").trim().toUpperCase();
  return `<section class="player-terminal-page player-terminal-business-page">
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
