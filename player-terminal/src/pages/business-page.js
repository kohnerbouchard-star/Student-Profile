import { escapeHtml, formatCurrency, formatNumber, formatPercent } from "../core/format.js";
import { icon } from "../components/icons.js";
import { renderEmptyState, renderMetric, renderStatusPill } from "../components/ui.js";

function productRow(product, currencyCode) {
  return `<article class="player-terminal-business-product">
    <span class="player-terminal-product-icon">${icon(product.icon || "factory")}</span>
    <div><small>${escapeHtml(product.category)}</small><strong>${escapeHtml(product.name)}</strong><p>${escapeHtml(product.description)}</p></div>
    <dl><div><dt>PRICE</dt><dd>${escapeHtml(formatCurrency(product.price, currencyCode))}</dd></div><div><dt>MARGIN</dt><dd>${escapeHtml(formatPercent(product.margin, 1))}</dd></div><div><dt>DEMAND</dt><dd>${escapeHtml(product.demand)}</dd></div></dl>
    <form data-player-form="business-price" data-endpoint="businessPrice" data-product-id="${escapeHtml(product.id)}">
      <label>NEW PRICE<input name="price" type="number" min="1" step="1" value="${escapeHtml(product.price)}" required /></label>
      <button class="player-terminal-compact-button" type="submit">${icon("edit")} Update</button>
    </form>
  </article>`;
}

export function renderBusinessPage(data) {
  const business = data.business;
  const code = data.session.currencyCode;
  const capacityTone = business.operations.capacityUse >= 90 ? "red" : business.operations.capacityUse >= 75 ? "amber" : "green";
  return `<section class="player-terminal-page player-terminal-business-page">
    <div class="player-terminal-page-heading"><div><small>PLAYER ENTERPRISE</small><h2>Business</h2><p>Operate a compact company model without turning the player terminal into a full ERP system.</p></div><div class="player-terminal-heading-actions">${renderStatusPill(business.company.status, "green")}</div></div>

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
          <label>PRODUCT<select name="productId" required ${business.products.length ? "" : "disabled"}>${business.products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)}</option>`).join("") || `<option value="">No products configured</option>`}</select></label>
          <label>RUN SIZE<input name="quantity" type="number" min="1" max="${escapeHtml(business.operations.maxRun)}" value="10" required /></label>
          <label>PRIORITY<select name="priority"><option value="standard">Standard</option><option value="expedite">Expedite</option></select></label>
          <button class="player-terminal-primary-button" type="submit" ${business.products.length ? "" : "disabled"}>${icon("factory")} Start production</button>
        </form></details>
        <details class="player-terminal-disclosure"><summary><span>${icon("users")}</span><div><strong>Hire an employee</strong><small>Add capacity only when operations require it</small></div>${icon("chevronRight")}</summary><form data-player-form="business-hire" data-endpoint="businessHire">
          <label>ROLE<select name="role"><option>Production Specialist</option><option>Sales Analyst</option><option>Logistics Coordinator</option></select></label>
          <label>CONTRACT<select name="contractType"><option value="cycle">One cycle</option><option value="permanent">Permanent</option></select></label>
          <button class="player-terminal-secondary-button" type="submit">${icon("users")} Hire employee</button>
        </form></details>
      </section>

      <section class="player-terminal-panel player-terminal-business-products">
        <header class="player-terminal-panel-header"><div><span>PRODUCT LINE</span><strong>${escapeHtml(business.products.length)} active products</strong></div><small>Pricing changes apply only after confirmation</small></header>
        <div>${business.products.length ? business.products.map((product) => productRow(product, code)).join("") : renderEmptyState({ title: "No products configured", detail: "The company product line will appear after business data is connected.", iconName: "business" })}</div>
      </section>

      <section class="player-terminal-panel player-terminal-business-suppliers">
        <header class="player-terminal-panel-header"><div><span>SUPPLY NETWORK</span><strong>Supplier status</strong></div>${renderStatusPill(`${business.suppliers.filter((item) => item.status === "Stable").length} STABLE`, "green")}</header>
        <div>${business.suppliers.length ? business.suppliers.map((supplier) => `<article><span class="is-${escapeHtml(supplier.tone)}"></span><div><strong>${escapeHtml(supplier.name)}</strong><small>${escapeHtml(supplier.material)} · ${escapeHtml(supplier.country)}</small></div><div><strong>${escapeHtml(supplier.status)}</strong><small>${escapeHtml(supplier.leadTime)}</small></div></article>`).join("") : renderEmptyState({ title: "No suppliers connected", detail: "Supplier status will appear after the business service returns a supply network.", iconName: "factory" })}</div>
      </section>
    </div>
  </section>`;
}
