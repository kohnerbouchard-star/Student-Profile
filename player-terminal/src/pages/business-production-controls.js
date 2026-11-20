import { isEndpointEnabled } from "../api/capabilities.js";
import { renderEmptyState } from "../components/ui.js";
import { escapeHtml, formatNumber } from "../core/format.js";

const rows = (value) => Array.isArray(value) ? value : [];
const ready = (data, resource) => data?.resourceStatus?.[resource]?.state === "ready";
const enabled = (data, endpoint) => ready(data, "business") && isEndpointEnabled(data?.capabilities, endpoint);
const hidden = (name, value) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}"/>`;
const positiveWhole = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;

export function renderBusinessEquipmentInstall(data) {
  if (!ready(data, "businessEquipment")) return "";
  const available = rows(data.businessEquipment?.availableEquipment);
  if (!available.length) return renderEmptyState({
    title: "No equipment ready to install",
    detail: "Buy equipment for your Business in Procurement. Only eligible equipment in this Business warehouse can be installed.",
    iconName: "factory",
  });
  return `<div data-business-installable-equipment>${available.map((item) => `<article class="player-terminal-business-product"><div><small>BUSINESS WAREHOUSE</small><strong>${escapeHtml(item.name)}</strong><p>Install this machine to make its capacity available to production.</p></div><form data-player-form="business-equipment-install" data-endpoint="businessEquipmentInstall">${hidden("equipmentKey", item.equipmentKey)}<button class="player-terminal-primary-button" type="submit" ${enabled(data, "businessEquipmentInstall") ? "" : "disabled"}>Install equipment</button></form></article>`).join("")}</div>`;
}

function finishedGoods(data) {
  return ready(data, "businessStockroom") ? rows(data.businessStockroom?.items).filter((item) =>
    item.locationKey === "finished_goods" && positiveWhole(item.quantityAvailable) > 0
  ) : [];
}

export function renderBusinessOfferDrafts(data) {
  if (!ready(data, "businessEquipment") || !ready(data, "businessStockroom")) return renderEmptyState({
    title: "Listing stock unavailable",
    detail: "Refresh Business catalog and Stockroom data before creating or stocking an offer.",
    iconName: "warning",
  });
  const offered = new Set(rows(data.business?.salesOffers).map((offer) => offer.itemKey));
  const candidates = finishedGoods(data).flatMap((stock) => {
    // Match the exact canonical catalog identity. Display names are not identity evidence.
    const catalog = rows(data.businessEquipment?.saleableStoreItems).find((item) => item.catalogItemKey === stock.itemKey);
    if (!catalog || offered.has(stock.itemKey) || !/^[a-z0-9_-]{1,64}$/.test(catalog.itemKey || "")) return [];
    return [{ stock, catalog }];
  });
  if (!candidates.length) return `<p data-business-offer-draft-empty>Manufacture finished goods to create a new offer. For products already listed, add stock below.</p>`;
  return `<div data-business-offer-drafts>${candidates.map(({ stock, catalog }) => `<article class="player-terminal-business-product"><div><small>${formatNumber(stock.quantityAvailable)} FINISHED UNITS</small><strong>${escapeHtml(stock.name)}</strong><p>Create a draft, then stock and publish it to the Store.</p></div><form data-player-form="business-store-offer-create" data-endpoint="businessStoreOfferCreate">${hidden("itemKey", catalog.itemKey)}<label>UNIT PRICE (${escapeHtml(catalog.currencyCode)})<input name="unitPrice" type="number" min="0.01" max="1000000" step="0.01" required aria-label="Unit price for ${escapeHtml(stock.name)}"/></label><button class="player-terminal-primary-button" type="submit" ${enabled(data, "businessStoreOfferCreate") ? "" : "disabled"}>Create draft offer</button></form></article>`).join("")}</div>`;
}

export function renderBusinessOfferStock(data, offer) {
  if (!["draft", "active", "paused"].includes(offer.status) || !positiveWhole(offer.version)) return "";
  const stock = finishedGoods(data).find((item) => item.itemKey === offer.itemKey);
  const available = positiveWhole(stock?.quantityAvailable);
  const identity = hidden("offerKey", offer.offerKey) + hidden("expectedOfferVersion", offer.version);
  const stockForm = available ? `<form data-player-form="business-store-offer-stock" data-endpoint="businessStoreOfferStock">${identity}<label>ADD FINISHED UNITS<input name="quantity" type="number" min="1" max="${available}" step="1" value="1" required/></label><p>${formatNumber(available)} available in Finished Goods. Listing stock moves it out of the Stockroom.</p><button class="player-terminal-compact-button" type="submit" ${enabled(data, "businessStoreOfferStock") ? "" : "disabled"}>Add listing stock</button></form>` : "";
  const publishForm = ["draft", "paused"].includes(offer.status) && positiveWhole(offer.quantityAvailable)
    ? `<form data-player-form="business-store-offer-publish" data-endpoint="businessStoreOfferPublish">${identity}<p>Publishing makes these units available for other players to buy at the displayed price.</p><button class="player-terminal-primary-button" type="submit" ${enabled(data, "businessStoreOfferPublish") ? "" : "disabled"}>Publish offer</button></form>` : "";
  return `<div class="player-terminal-heading-actions" data-business-offer-stock-controls="${escapeHtml(offer.offerKey)}">${stockForm}${publishForm}</div>`;
}

// Read-only job guidance. Scheduled time never overrides the server job status.
export function renderBusinessManufacturingProgress(job) {
  const states = {
    queued: ['Waiting to start', 'This job is queued. Review its recorded status before starting another run.', 'Queued at', 'queuedAt'],
    in_progress: ['Production in progress', 'A scheduled finish is not a completion receipt. Refresh Business data to check the recorded outcome.', 'Scheduled finish', 'completesAt'],
    completed: ['Production completed', 'Review the Stockroom for current finished goods. Completed output is not current available stock or sales revenue.', 'Completed at', 'completedAt'],
    cancelled: ['Production cancelled', 'This job is no longer scheduled to produce output. Review current readiness before starting a separate run.', 'Cancelled at', 'cancelledAt'],
    failed: ['Production needs attention', 'Review current requirements and recorded resource state before starting a separate run. No retry is submitted here.', 'Failed at', 'failedAt'],
  };
  const state = Object.hasOwn(states, job?.status) ? states[job.status] : null;
  if (!state) return '<p data-business-job-progress>Job progress unavailable. Refresh Business data to check its recorded status.</p>';
  const [title, detail, timeLabel, timeKey] = state;
  const timestamp = typeof job[timeKey] === 'string' ? Date.parse(job[timeKey]) : NaN;
  const time = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
  const timing = time ? `<time datetime="${time}">${escapeHtml(time.replace('T', ' ').replace('.000Z', 'Z').replace(/Z$/, ' UTC'))}</time>` : 'Not reported';
  const rawOutput = job.completedOutputQuantity;
  const output = (typeof rawOutput === 'number' || (typeof rawOutput === 'string' && rawOutput.trim() !== ''))
    && Number.isSafeInteger(Number(rawOutput)) && Number(rawOutput) >= 0 ? formatNumber(Number(rawOutput)) : 'Unavailable';
  return `<div data-business-job-progress="${escapeHtml(job.status)}"><strong>${title}</strong><p>${detail}</p><p>${timeLabel}: ${timing}</p>${job.status === 'completed' ? `<p>Recorded completed output: ${output} units.</p><a class="player-terminal-compact-button" href="#business-workspace-stockroom" data-business-workspace-link="stockroom">Review Stockroom</a>` : ''}</div>`;
}

// Display the loaded custody projection; never infer sales from missing stock.
export function renderBusinessOfferCustody(offer) {
  const quantity = (value) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const owned = quantity(offer?.quantityOwned);
  const reserved = quantity(offer?.quantityReserved);
  const available = quantity(offer?.quantityAvailable);
  const display = (value) => value === null ? 'Unavailable' : formatNumber(value);
  const explanations = {
    draft: 'Draft only: stocking this offer does not publish it. Review the price and available units before publishing.',
    active: 'Published offer: a completed buyer purchase is still required for a sale. Available listing units are not earned revenue.',
    paused: 'Paused offer: review its current stock and price before publishing again.',
    withdrawal_pending: 'Withdrawal pending: purchases are disabled. The scheduled time is not confirmation that stock has returned; refresh to check the recorded outcome.',
  };
  const detail = Object.hasOwn(explanations, offer?.status) ? explanations[offer.status] : 'Offer lifecycle unavailable. Refresh Business data before deciding what to do next.';
  const reservation = reserved !== null && reserved > 0
    ? '<p>Reserved units are not currently available for another sale or listing reduction. A pending withdrawal may need reservations to clear.</p>' : '';
  const empty = available === 0
    ? '<p>No listing units are currently available. This does not prove they were sold; check reservations and committed sales receipts.</p>' : '';
  return `<div data-business-offer-custody><dl><div><dt>OWNED IN LISTING</dt><dd>${display(owned)}</dd></div><div><dt>RESERVED IN LISTING</dt><dd>${display(reserved)}</dd></div><div><dt>AVAILABLE IN LISTING</dt><dd>${display(available)}</dd></div></dl><p>${detail}</p>${reservation}${empty}</div>`;
}
