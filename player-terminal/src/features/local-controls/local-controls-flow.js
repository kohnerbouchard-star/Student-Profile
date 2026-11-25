import { marketHistoryChart, normalizeMarketObservations } from "../market/price-history.js";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function bankingTransactionsCsv(transactions) {
  const rows = [["Date", "Description", "Category", "Amount", "Currency", "Status"]];
  for (const transaction of list(transactions)) {
    rows.push([
      transaction?.date,
      transaction?.description,
      transaction?.category,
      Number.isFinite(Number(transaction?.amount)) ? Number(transaction.amount) : "",
      transaction?.currencyCode,
      transaction?.status,
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function marketRowMatchesQuery(text, query) {
  const term = String(query || "").trim().toLowerCase();
  return !term || String(text || "").toLowerCase().includes(term);
}

function marketSearchElements(mount) {
  return {
    button: mount.querySelector('[data-player-local-action="market-search"]'),
    panel: mount.querySelector("[data-player-market-search-panel]"),
    input: mount.querySelector("[data-player-market-search]"),
    status: mount.querySelector("[data-player-market-search-status]"),
    empty: mount.querySelector("[data-player-market-search-empty]"),
    rows: [...mount.querySelectorAll(".player-terminal-asset-row")],
  };
}

function applyMarketSearch(mount, query) {
  const elements = marketSearchElements(mount);
  let visibleCount = 0;
  for (const row of elements.rows) {
    row.hidden = !marketRowMatchesQuery(row.textContent, query);
    if (!row.hidden) visibleCount += 1;
  }
  if (elements.empty) elements.empty.hidden = visibleCount !== 0;
  if (elements.status) {
    elements.status.textContent = String(query || "").trim()
      ? `${visibleCount} matching instrument${visibleCount === 1 ? "" : "s"}`
      : `${elements.rows.length} listed instruments`;
  }
  return visibleCount;
}

function toggleMarketSearch(mount) {
  const elements = marketSearchElements(mount);
  if (!elements.panel || !elements.button || !elements.input) return false;
  const opening = elements.panel.hidden;
  elements.panel.hidden = !opening;
  elements.button.setAttribute("aria-expanded", String(opening));
  if (opening) {
    elements.input.focus({ preventScroll: true });
    applyMarketSearch(mount, elements.input.value);
  } else {
    elements.input.value = "";
    applyMarketSearch(mount, "");
    elements.button.focus({ preventScroll: true });
  }
  return true;
}

function updateMarketChart(mount, range) {
  const frame = mount.querySelector("[data-player-market-chart-history]");
  const line = frame?.querySelector(".player-terminal-chart-line");
  const area = frame?.querySelector(".player-terminal-chart-area");
  if (!frame || !line || !area) return false;

  let history = [];
  try {
    history = JSON.parse(frame.dataset.playerMarketChartHistory || "[]");
  } catch {
    history = [];
  }
  if (range !== "all" && range !== "recent") return false;
  const chart = marketHistoryChart(normalizeMarketObservations(history), range);
  if (!chart) return false;
  line.setAttribute("d", chart.line);
  area.setAttribute("d", chart.area);
  const dot = frame.querySelector("[data-player-market-chart-dot]");
  dot?.setAttribute("r", chart.dot ? "4" : "0");
  if (chart.dot) {
    dot?.setAttribute("cx", String(chart.dot.x));
    dot?.setAttribute("cy", String(chart.dot.y));
  }

  for (const button of mount.querySelectorAll('[data-player-local-action="chart-range"]')) {
    const active = button.dataset.range === range;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  const coverage = mount.querySelector("[data-player-market-chart-coverage]");
  if (coverage) coverage.textContent = chart.coverage;
  return true;
}

function downloadTransactions(terminal, runtime) {
  const transactions = terminal.getState()?.data?.banking?.transactions;
  if (!Array.isArray(transactions) || !transactions.length) {
    terminal.showToast("There are no posted transactions to export.", "amber");
    return false;
  }
  const csv = bankingTransactionsCsv(transactions);
  const BlobCtor = runtime.Blob;
  const createObjectUrl = runtime.URL?.createObjectURL?.bind(runtime.URL);
  const revokeObjectUrl = runtime.URL?.revokeObjectURL?.bind(runtime.URL);
  if (typeof BlobCtor !== "function" || typeof createObjectUrl !== "function") {
    terminal.showToast("Transaction export is unavailable in this browser.", "red");
    return false;
  }
  const href = createObjectUrl(new BlobCtor([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = runtime.document.createElement("a");
  anchor.href = href;
  anchor.download = `econovaria-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.hidden = true;
  runtime.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  runtime.setTimeout(() => revokeObjectUrl?.(href), 0);
  terminal.showToast(`Exported ${transactions.length} posted transaction${transactions.length === 1 ? "" : "s"}.`, "green");
  return true;
}

export function installLocalControlsFlow({ mount, terminal, runtime = globalThis }) {
  if (!(mount instanceof HTMLElement)) return { destroy() {} };
  if (!terminal || typeof terminal.getState !== "function" || typeof terminal.showToast !== "function") {
    throw new TypeError("Local controls require an active player terminal.");
  }

  function handleClick(event) {
    const actionControl = event.target.closest?.("[data-player-local-action]");
    if (!actionControl || actionControl.disabled || actionControl.getAttribute("aria-disabled") === "true") return;
    const action = actionControl.dataset.playerLocalAction;
    if (!["download-transactions", "market-search", "chart-range"].includes(action)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (action === "download-transactions") downloadTransactions(terminal, runtime);
    if (action === "market-search") toggleMarketSearch(mount);
    if (action === "chart-range") updateMarketChart(mount, actionControl.dataset.range);
  }

  function handleInput(event) {
    if (!event.target.matches?.("[data-player-market-search]")) return;
    applyMarketSearch(mount, event.target.value);
  }

  mount.addEventListener("click", handleClick, true);
  mount.addEventListener("input", handleInput, true);
  return {
    destroy() {
      mount.removeEventListener("click", handleClick, true);
      mount.removeEventListener("input", handleInput, true);
    },
  };
}
