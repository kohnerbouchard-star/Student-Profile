import { escapeHtml, formatCurrency, formatNumber, formatPercent } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderMetric, renderStatusPill } from "../components/ui.js";

function hiddenBusinessKey(business) {
  return `<input name="businessKey" type="hidden" value="${escapeHtml(business.company.id)}" />`;
}

function productRow(product, business, currencyCode) {
  return `<article class="player-terminal-business-product">
    <span class="player-terminal-product-icon">${icon(product.icon || "factory")}</span>
    <div><small>${escapeHtml(product.category)}</small><strong>${escapeHtml(product.name)}</strong><p>${escapeHtml(product.description)}</p></div>
    <dl><div><dt>PRICE</dt><dd>${escapeHtml(formatCurrency(product.price, currencyCode))}</dd></div><div><dt>MARGIN</dt><dd>${escapeHtml(formatPercent(product.margin, 1))}</dd></div><div><dt>DEMAND</dt><dd>${escapeHtml(product.demand)}</dd></div></dl>
    <form data-player-form="business-price" data-endpoint="businessPrice" data-product-id="${escapeHtml(product.id)}">
      ${hiddenBusinessKey(business)}
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
  return `<details class="player-terminal-disclosure"><summary><span>${icon("factory")}</span><div><strong>Create a product</strong><small>Configure price, cost, capacity, demand, and quality</small></div>${icon("chevronRight")}</summary><form data-player-form="business-product-create" data-endpoint="businessProductCreate">
    ${hiddenBusinessKey(business)}
    <label>PRODUCT NAME<input name="name" maxlength="120" required /></label>
    <label>CATEGORY<input name="category" maxlength="80" value="general" required /></label>
    <label>UNIT PRICE<input name="unitPrice" type="number" min="0.01" max="1000000" step="0.01" required /></label>
    <label>INPUT COST<input name="unitInputCost" type="number" min="0" max="1000000" step="0.01" value="0" required /></label>
    <label>LABOR COST<input name="unitLaborCost" type="number" min="0" max="1000000" step="0.01" value="0" required /></label>
    <label>CAPACITY UNITS<input name="capacityUnits" type="number" min="1" max="100000" step="1" value="100" required /></label>
    <label>BASE DEMAND<input name="baseDemandUnits" type="number" min="0" max="100000" step="1" value="20" required /></label>
    <label>QUALITY SCORE<input name="qualityScore" type="number" min="0" max="100" step="1" value="50" required /></label>
    <button class="player-terminal-secondary-button" type="submit">${icon("factory")} Create product</button>
  </form></details>`;
}

function inputPurchaseForm(business) {
  return `<details class="player-terminal-disclosure"><summary><span>${icon("inventory")}</span><div><strong>Purchase production inputs</strong><small>Inputs are priced and settled by the authoritative business service</small></div>${icon("chevronRight")}</summary><form data-player-form="business-input-purchase" data-endpoint="businessInputPurchase">
    ${hiddenBusinessKey(business)}
    <label>PRODUCT<select name="productKey" required ${business.products.length ? "" : "disabled"}>${business.products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)}</option>`).join("") || `<option value="">Create a product first</option>`}</select></label>
    <label>QUANTITY<input name="quantity" type="number" min="1" max="100000" step="1" value="10" required /></label>
    <button class="player-terminal-secondary-button" type="submit" ${business.products.length ? "" : "disabled"}>${icon("inventory")} Purchase inputs</button>
  </form></details>`;
}

function employeeRows(business, code) {
  const activeEmployees = (business.employees || []).filter((employee) => String(employee.status).toLowerCase() === "active");
  if (!activeEmployees.length) {
    return renderEmptyState({ title: "No active employees", detail: "Hire labor only when the business can sustain its wage obligation.", iconName: "users" });
  }
  return activeEmployees.map((employee) => `<article class="player-terminal-business-product">
    <span class="player-terminal-product-icon">${icon("users")}</span>
    <div><small>${escapeHtml(employee.contractType)}</small><strong>${escapeHtml(employee.role)}</strong><p>${escapeHtml(formatCurrency(employee.wage, code))} per cycle · ${escapeHtml(employee.productivity)}× productivity</p></div>
    <form data-player-form="business-terminate" data-endpoint="businessTerminate" data-employee-id="${escapeHtml(employee.id)}">
      ${hiddenBusinessKey(business)}
      <label>REASON<input name="reason" minlength="2" maxlength="500" required /></label>
      <button class="player-terminal-compact-button" type="submit">Terminate</button>
    </form>
  </article>`).join("");
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
  const code = data.session.currencyCode;
  if (!business.configured) {
    return `<section class="player-terminal-page player-terminal-business-page">
      <div class="player-terminal-page-heading"><div><small>PLAYER ENTERPRISE</small><h2>Business</h2><p>Create or acquire one game-scoped enterprise using your authoritative country and currency.</p></div></div>
      <div class="player-terminal-business-layout">${createBusinessPanel(code)}</div>
    </section>`;
  }

  const capacityTone = business.operations.capacityUse >= 90 ? "red" : business.operations.capacityUse >= 75 ? "amber" : "green";
  return `<section class="player-terminal-page player-terminal-business-page">
    <div class="player-terminal-page-heading"><div><small>PLAYER ENTERPRISE</small><h2>Business</h2><p>Operate a bounded company model with server-authoritative settlement and accounting.</p></div><div class="player-terminal-heading-actions">${renderStatusPill(business.company.status, "green")}</div></div>

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
        <div class="player-terminal-capacity-block"><div><small>CAPACITY UTILIZATION</small><strong>${escapeHtml(business.operations.capacityUse)}%</strong></div><div class="player-terminal-progress-track is-${capacityTone}"><i style="width:${Math.min(100,business.operations.capacityUse)}%"></i></div><p>${escapeHtml(business.operations.capacityNote)}</p></div>
      </section>

      <section class="player-terminal-panel player-terminal-business-actions">
        <header class="player-terminal-panel-header"><div><span>OPERATIONS</span><strong>Run the company</strong></div>${renderStatusPill("CONFIRMATION REQUIRED", "amber")}</header>
        <details class="player-terminal-disclosure" open><summary><span>${icon("factory")}</span><div><strong>Start a production run</strong><small>Choose a product, run size, and priority</small></div>${icon("chevronRight")}</summary><form data-player-form="business-production" data-endpoint="businessProduction">
          ${hiddenBusinessKey(business)}
          <label>PRODUCT<select name="productId" required ${business.products.length ? "" : "disabled"}>${business.products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)}</option>`).join("") || `<option value="">No products configured</option>`}</select></label>
          <label>RUN SIZE<input name="quantity" type="number" min="1" max="${escapeHtml(business.operations.maxRun)}" value="10" required /></label>
          <label>PRIORITY<select name="priority"><option value="standard">Standard</option><option value="expedite">Expedite</option></select></label>
          <button class="player-terminal-primary-button" type="submit" ${business.products.length && business.operations.maxRun > 0 ? "" : "disabled"}>${icon("factory")} Start production</button>
        </form></details>
        <details class="player-terminal-disclosure"><summary><span>${icon("users")}</span><div><strong>Hire an employee</strong><small>Add capacity only when operations require it</small></div>${icon("chevronRight")}</summary><form data-player-form="business-hire" data-endpoint="businessHire">
          ${hiddenBusinessKey(business)}
          <label>PLAYER ID <small>Optional</small><input name="employeePlayerIdentifier" maxlength="160" /></label>
          <label>ROLE<input name="role" maxlength="120" value="Production Specialist" required /></label>
          <label>CONTRACT<select name="contractType"><option value="cycle">One cycle</option><option value="permanent">Permanent</option></select></label>
          <label>WAGE PER CYCLE<input name="wagePerCycle" type="number" min="0.01" max="1000000" step="0.01" required /></label>
          <label>PRODUCTIVITY INDEX<input name="productivityIndex" type="number" min="0.25" max="3" step="0.05" value="1" required /></label>
          <button class="player-terminal-secondary-button" type="submit">${icon("users")} Hire employee</button>
        </form></details>
        ${productCreationForm(business)}
        ${inputPurchaseForm(business)}
        ${statusForm(business)}
      </section>

      <section class="player-terminal-panel player-terminal-business-products">
        <header class="player-terminal-panel-header"><div><span>PRODUCT LINE</span><strong>${escapeHtml(business.products.length)} active products</strong></div><small>Pricing changes apply only after confirmation</small></header>
        <div>${business.products.length ? business.products.map((product) => productRow(product, business, code)).join("") : renderEmptyState({ title: "No products configured", detail: "Create a product before purchasing inputs or running production.", iconName: "business" })}</div>
      </section>

      <section class="player-terminal-panel player-terminal-business-products">
        <header class="player-terminal-panel-header"><div><span>EMPLOYMENT</span><strong>${escapeHtml((business.employees || []).filter((employee) => String(employee.status).toLowerCase() === "active").length)} active employees</strong></div><small>Wages settle through the business ledger</small></header>
        <div>${employeeRows(business, code)}</div>
      </section>

      <section class="player-terminal-panel player-terminal-business-suppliers">
        <header class="player-terminal-panel-header"><div><span>INPUT INVENTORY</span><strong>${escapeHtml((business.inventory || []).length)} tracked inputs</strong></div>${renderStatusPill("LEDGER BACKED", "green")}</header>
        <div>${(business.inventory || []).length ? business.inventory.map((item) => `<article><span class="is-green"></span><div><strong>${escapeHtml(item.itemKey)}</strong><small>${escapeHtml(item.kind)}</small></div><div><strong>${escapeHtml(formatNumber(item.quantity, 2))}</strong><small>${escapeHtml(formatCurrency(item.unitCost, code))} each</small></div></article>`).join("") : renderEmptyState({ title: "No inputs held", detail: "Purchase inputs for an approved product before production.", iconName: "inventory" })}</div>
      </section>
    </div>
  </section>`;
}
