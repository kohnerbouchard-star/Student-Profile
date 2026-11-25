// This is display evidence, not a validator for the reward command or a ledger
// receipt. Public settlement evidence is not available here.
const fields = new Set(["checking", "cash", "items", "storyFlagsToSet"]);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const positiveAmount = (value) =>
  (typeof value === "number" || typeof value === "string")
  && /^[0-9]+(?:\.[0-9]{1,2})?$/u.test(String(value))
  && Number.isFinite(Number(value)) && Number(value) > 0;

function configuration(payload) {
  if (!record(payload) || Object.keys(payload).some((key) => !fields.has(key))
    || (Object.hasOwn(payload, "cash") && Object.hasOwn(payload, "checking"))) return "unknown";
  let configured = false;
  for (const [key, value] of Object.entries(payload)) {
    if (value === null) continue;
    if (key === "cash" || key === "checking") {
      if (!record(value) || !positiveAmount(value.amount)) return "unknown";
      configured = true;
      continue;
    }
    // Public projection strips item IDs. An item entry can show that something
    // is listed, but cannot establish that the issuer will apply it.
    if (!Array.isArray(value) || value.some((entry) => !record(entry)
      || (key === "items" ? !positiveAmount(entry.quantity) || !Number.isInteger(Number(entry.quantity))
        : typeof entry.flagKey !== "string" || !entry.flagKey.trim() || !Object.hasOwn(entry, "value")))) return "unknown";
    configured ||= value.length > 0;
  }
  return configured ? "configured" : "not-configured";
}

export function readContractRewardState(payload, progress, dateLabel) {
  const marker = progress?.rewardIssuedAt;
  if (typeof marker === "string" && Number.isFinite(Date.parse(marker))) {
    // Generic review result JSON may survive a marker-only writer. Neither
    // that JSON nor the timestamp establishes what, if anything, was paid.
    return { kind: "processed", date: dateLabel(marker) };
  }
  if (marker != null) return { kind: "unknown" };
  const configured = configuration(payload);
  if (configured === "not-configured") return { kind: "not-configured" };
  const status = String(progress?.status ?? "").toLowerCase().trim();
  return { kind: configured === "configured" && ["approved", "completed"].includes(status) ? "pending" : "unknown" };
}

export function contractRewardTimeline(reward) {
  const processed = reward.kind === "processed";
  return {
    label: "Reward status",
    time: processed ? `Processing recorded · ${reward.date}`
      : reward.kind === "pending" ? "Awaiting confirmation"
        : reward.kind === "not-configured" ? "None currently configured" : "Not confirmed",
    complete: processed,
  };
}
