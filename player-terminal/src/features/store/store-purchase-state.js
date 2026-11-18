// Pure presentation transaction transitions. This module never sends a command,
// invents a receipt, owns replay keys, or publishes resource reads. The API owns
// idempotency and the request owner must fence every asynchronous publication.
export function transitionStorePurchase(current, event) {
  if (!current) return current;
  switch (event.type) {
    case "quote-reviewed":
      if (current.stage !== "select") return current;
      return {
        ...current, stage: "review", quantity: event.quantity, quote: event.quote,
        receipt: null, error: "", refreshState: "idle",
        allocationDraft: event.allocationDraft, fundingIntent: event.fundingIntent,
        quoteRequest: event.request, commandRequest: null,
      };
    case "settlement-started":
      if (current.stage !== "review" || current.processing || !current.quote?.quoteKey) return current;
      return { ...current, processing: true, error: "" };
    case "settlement-uncertain":
      if (current.stage !== "review") return current;
      // An error response can follow a server commit. Keep the exact quote and
      // request lineage; the API retains its original idempotency key.
      return { ...current, commandRequest: event.request, error: event.message, processing: false };
    case "offer-invalidated":
      if (current.stage !== "review") return current;
      return {
        ...current, item: event.refreshed.item, offer: event.refreshed.offer,
        stage: "select", quote: null, receipt: null,
        error: event.refreshed.refreshPending
          ? `${event.message} The authoritative Store refresh is still pending, so this offer remains unavailable.`
          : event.message,
        refreshState: event.refreshed.refreshPending ? "pending" : "idle",
        refreshWarning: event.refreshed.refreshPending ? "Authoritative Store refresh pending." : "",
        processing: false, fundingIntent: null, commandRequest: null,
      };
    case "settlement-committed":
      if (current.stage !== "review" || !event.receipt) return current;
      return {
        ...current, stage: "receipt", receipt: event.receipt, error: "",
        refreshState: "refreshing", refreshWarning: "", processing: false,
        invalidatedResources: Object.freeze([...new Set(Array.isArray(event.invalidatedResources)
          ? event.invalidatedResources : ["dashboard", "store", "inventory", "banking", "bankingFx"])]),
      };
    case "refresh-started":
      if (current.stage !== "receipt" || !current.receipt || current.refreshState !== "pending") return current;
      return { ...current, refreshState: "refreshing", refreshWarning: "" };
    case "refresh-finished":
      if (current.stage !== "receipt" || current.refreshState !== "refreshing") return current;
      return { ...current, refreshState: event.warnings.length ? "pending" : "complete", refreshWarning: event.warnings.join(" ") };
    case "quote-required":
      if (current.stage === "receipt" || current.processing) return current;
      return { ...current, stage: "select", ...(event.expired ? { quote: null } : {}), error: event.message };
    case "edit-selection":
      if (current.stage === "receipt" || current.processing) return current;
      return {
        ...current, stage: "select", quote: null, receipt: null, fundingIntent: null,
        commandRequest: null, error: "", refreshState: "idle", refreshWarning: "",
        invalidatedResources: [], processing: false,
      };
    default:
      throw new TypeError(`Unknown Store purchase transition: ${event.type}`);
  }
}
