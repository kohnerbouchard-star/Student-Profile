import { isEndpointEnabled, isRouteEnabled } from "../../api/capabilities.js";
import { ipoPrice, ipoWhole, ipoTotal } from "../../api/business-ipo-backend-routes.js";
import { PlayerApi } from "../../api/player-api.js";
import { setButtonProcessing } from "../../core/dom.js";
import { exactIpoMoney } from "./business-ipo-panel.js";
const ENDPOINTS = { propose: "businessIpoPropose", vote: "businessIpoVote", subscribe: "businessIpoSubscribe" };
const REFRESH = { propose: ["businessIpos", "business"], vote: ["businessIpos", "business"], subscribe: ["businessIpos", "banking", "portfolio"] };
export function installBusinessIpoFlow({ mount, terminal, config }) {
  if (!(mount instanceof HTMLElement)) return { destroy() {} };
  const api = new PlayerApi(config); let pending = false; let destroyed = false;
  const state = () => terminal.getState();
  function error(message) { const host = mount.querySelector("[data-business-ipo-error]"); if (host) { host.textContent = message; host.hidden = false; host.focus?.(); } }
  function intent(form) {
    const kind = form.dataset.playerIpoForm; const model = state().data?.businessIpos;
    const value = name => String(form.elements.namedItem(name)?.value || "").trim();
    if (kind === "propose") return { kind, unitPrice: value("unitPrice"), offeredShares: value("offeredShares"), own: model?.ownBusiness };
    const ipoKey = form.dataset.ipoKey; const offer = model?.offers?.find(row => row.ipoKey === ipoKey);
    return { kind, ipoKey, offer, ...(kind === "vote" ? { decision: value("decision") } : { shares: value("shares") }) };
  }
  function valid(i) {
    if (i.kind === "propose") return i.own?.eligible && i.own.canPropose && ipoPrice(i.unitPrice) && ipoWhole(i.offeredShares) && BigInt(i.offeredShares) <= BigInt(i.own.availableShares) && (i.unitPrice.split(".")[1]?.length || 0) <= i.own.priceDecimalPlaces;
    if (i.kind === "vote") return i.offer?.canVote && ["approve", "reject"].includes(i.decision);
    return i.kind === "subscribe" && i.offer?.canSubscribe && ipoWhole(i.shares) && BigInt(i.shares) <= BigInt(i.offer.remainingShares);
  }
  async function refresh(resources = ["businessIpos"]) { try { const result = await terminal.refreshResources(resources); return !Object.keys(result?.errors || {}).length; } catch { return false; } }
  function review(form) {
    const i = intent(form); const host = form.querySelector("[data-ipo-cost]"); if (!host) return;
    if (!valid(i)) { host.textContent = "Enter valid terms within the available share allocation."; return; }
    if (i.kind === "subscribe") host.textContent = `Checking debit: ${exactIpoMoney(ipoTotal(i.offer.unitPrice, i.shares), i.offer.currencyCode)} for ${i.shares} shares.`;
    if (i.kind === "propose") {
      const before = BigInt(i.own.outstandingShares); const added = BigInt(i.offeredShares); const bps = added * 10000n / (before + added);
      host.textContent = `Proceeds at full allocation: ${exactIpoMoney(ipoTotal(i.unitPrice, i.offeredShares), i.own.currencyCode)}. Outstanding shares: ${before} → ${before + added}. New shares: ${bps / 100n}.${String(bps % 100n).padStart(2, "0")}% of the company.`;
    }
  }
  async function submit(form) {
    if (pending || destroyed) return;
    const i = intent(form); const endpoint = ENDPOINTS[i.kind]; const current = state();
    if (!["business", "market"].includes(current.route) || !isRouteEnabled(current.data?.capabilities, current.route) || !isEndpointEnabled(current.data?.capabilities, endpoint) || current.data?.resourceStatus?.businessIpos?.state !== "ready" || !valid(i)) { error("Refresh the offering and check its current terms before submitting."); return; }
    const payload = i.kind === "propose" ? { unitPrice: i.unitPrice, offeredShares: i.offeredShares } : i.kind === "vote" ? { decision: i.decision, ipoKey: i.ipoKey } : { shares: i.shares, ipoKey: i.ipoKey };
    const restore = setButtonProcessing(form.querySelector('button[type="submit"]'), "Submitting"); pending = true;
    try {
      api.setSession(config);
      const operation = await api.execute(endpoint, payload, i.ipoKey ? { ipoKey: i.ipoKey } : {});
      if (destroyed) return;
      const result = operation.result;
      // The validated committed result remains successful if subsequent reads fail.
      const message = i.kind === "subscribe" ? `${result.receipt.shares} shares issued for ${exactIpoMoney(result.receipt.total, result.receipt.currencyCode)}. Receipt ${result.receipt.receiptKey}.` : i.kind === "vote" ? "Your vote was recorded." : "Fixed IPO terms submitted for shareholder approval.";
      state().data.businessIpoOutcome = { message, refreshPending: true };
      form.closest("details")?.removeAttribute("open");
      const resources = REFRESH[i.kind].filter(key => key !== "business" || current.data.business?.configured);
      if (i.kind === "subscribe" && current.data.business?.configured) resources.push("business", "businessTreasury");
      const refreshed = await refresh(resources);
      if (destroyed) return;
      state().data.businessIpoOutcome = { message, refreshPending: !refreshed };
      terminal.requestRender?.(); terminal.showToast?.(message, "green");
    } catch (failure) {
      if (destroyed) return;
      if (Number(failure?.status) === 401) {
        const detail = { reason: "invalid_player_session", terminal: "player", status: 401, code: String(failure.code || "SESSION_INVALID") };
        try { config.onSessionInvalid?.(detail); } catch { /* Host callback must not prevent safe exit. */ }
        globalThis.dispatchEvent?.(new CustomEvent(config.sessionInvalidEvent || "econovaria:player-session-invalid", { detail })); return;
      }
      const code = String(failure?.code || "");
      error(Number(failure?.status) === 429 ? "Too many requests. Wait briefly, then retry the same terms." : /TIMEOUT|NETWORK|OFFLINE|INVALID_RESPONSE/u.test(code) ? "The result is uncertain. Keep these terms and retry to recover the original receipt." : "The offering could not be submitted. Review current allocation and available Checking funds.");
    } finally { restore(); pending = false; }
  }
  function onSubmit(event) { const form = event.target?.closest?.("[data-player-ipo-form]"); if (!form) return; event.preventDefault(); event.stopImmediatePropagation(); void submit(form); }
  function onInput(event) { const form = event.target?.closest?.("[data-player-ipo-form]"); if (form) review(form); }
  function onClick(event) { if (event.target?.closest?.("[data-business-ipo-refresh]")) { event.preventDefault(); void refresh(); } }
  mount.addEventListener("submit", onSubmit, true); mount.addEventListener("input", onInput); mount.addEventListener("click", onClick);
  return { destroy() { destroyed = true; mount.removeEventListener("submit", onSubmit, true); mount.removeEventListener("input", onInput); mount.removeEventListener("click", onClick); api.clearSession?.(); } };
}
