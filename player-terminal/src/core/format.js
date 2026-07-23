export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatCurrency(value, code = "NVC") {
  const amount = Number(value) || 0;
  return `${code} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value, maximumFractionDigits = 0) {
  return (Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits });
}

export function formatPercent(value, digits = 2) {
  const amount = Number(value) || 0;
  return `${amount >= 0 ? "+" : ""}${amount.toFixed(digits)}%`;
}

export function formatCompact(value) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
}

export function toneFromChange(value) {
  const amount = Number(value) || 0;
  return amount > 0 ? "is-good" : amount < 0 ? "is-bad" : "is-neutral";
}

export function serializeForm(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  const employeeKey = String(form?.dataset?.employeeId || "").trim();
  if (employeeKey && !payload.employeeKey) payload.employeeKey = employeeKey;
  return payload;
}
