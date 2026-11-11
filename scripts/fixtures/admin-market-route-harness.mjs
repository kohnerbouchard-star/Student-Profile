import { readFileSync } from "node:fs";
import path from "node:path";
import { ADMIN_DATA_STATES } from "../../admin/v2/src/core/data-state.js";

// Shared-component doubles record route trees and lifetimes, while executing
// the actual route-module graph. Real browser layout and focus remain separate.
export function createMarketRouteHarness() {
  const nodes = [];
  const fields = new Map();
  const tables = [];
  const drawers = [];
  const details = [];
  const modules = new Map();
  function createElement(tag, options = {}) {
    const node = {
      tag, className: options.className || "", textContent: options.text ?? "",
      attrs: { ...options.attrs }, dataset: { ...options.dataset }, children: [], listeners: {},
      append(...children) { this.children.push(...children.flat().filter((child) => child != null && child !== false)); },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      async dispatch(type) { return this.listeners[type]?.({ currentTarget: this }); },
    };
    node.append(options.children);
    nodes.push(node);
    return node;
  }
  function AdminField(options) {
    const field = {
      options, value: options.value ?? "", control: createElement(options.type || "input"),
      element: createElement("field"),
      getValue() { return String(this.value); },
      setValue(value) { this.value = value; },
    };
    fields.set(options.name, field);
    return field;
  }
  function AdminDataTable(options) {
    const table = {
      options, rows: [], cells: [], element: createElement("table"),
      setRows(rows) {
        this.rows = rows;
        this.cells = rows.map((row, index) => options.columns.map((column) => column.render ? column.render(row[column.key], row, index) : row[column.key]));
        this.element.children = this.cells.flat();
      },
    };
    tables.push(table);
    return table;
  }
  function AdminDrawer(options) {
    const drawer = {
      options, element: createElement("drawer"), panel: createElement("panel"), opened: false, opens: [], destroyed: 0,
      open(opener) { this.opened = true; this.opens.push(opener); },
      close() { this.opened = false; options.onClose?.(); },
      isOpen() { return this.opened; },
      setTitle(title) { this.title = title; },
      setDescription(description) { this.description = description; },
      setContent(content) { this.content = content; },
      destroy() { this.destroyed += 1; this.opened = false; },
    };
    drawers.push(drawer);
    return drawer;
  }
  const component = (kind) => (options) => ({ kind, options });
  const components = {
    AdminDataTable, AdminField, AdminDrawer, AdminIcon: component("icon"),
    AdminEmptyState: component("empty"), AdminErrorState: component("error"), AdminStaleState: component("stale"),
    AdminPageFrame: (options) => ({ element: createElement("page", { children: options.content }), options }),
  };
  const directory = path.resolve("admin/v2/src/routes/market");
  const seams = new Map([
    [path.resolve(directory, "../../components/index.js"), components],
    [path.resolve(directory, "../../components/dom.js"), { createElement }],
    [path.resolve(directory, "../../core/data-state.js"), { ADMIN_DATA_STATES }],
    [path.join(directory, "MarketInstrumentDetail.js"), { MarketInstrumentDetail: (options) => { details.push(options); return { kind: "detail", options }; } }],
    [path.join(directory, "MarketSkeleton.js"), { MarketSkeleton: () => ({ kind: "skeleton" }) }],
  ]);
  function load(filename) {
    if (seams.has(filename)) return seams.get(filename);
    if (modules.has(filename)) return modules.get(filename);
    if (path.dirname(filename) !== directory) throw new Error(`Unexpected route dependency: ${filename}`);
    const source = readFileSync(filename, "utf8");
    const exports = [...source.matchAll(/export function (\w+)/g)].map((match) => match[1]);
    const executable = source.replace(/import\s+\{([\s\S]*?)\}\s+from\s+"([^"]+)";/g,
      (_match, names, specifier) => `const {${names}} = load(${JSON.stringify(path.resolve(path.dirname(filename), specifier))});`)
      .replace(/export function /g, "function ");
    const loaded = new Function("load", `${executable}\nreturn { ${exports.join(", ")} };`)(load);
    modules.set(filename, loaded);
    return loaded;
  }
  return {
    MarketRoute: load(path.join(directory, "MarketRoute.js")).MarketRoute,
    nodes, fields, tables, drawers, details,
    button(action) { return nodes.findLast((node) => node.dataset.marketAction === action); },
  };
}

export function marketModel() {
  return {
    summary: { listedCount: 2, sectorCount: 2, recentTradeCount: 1, markedActiveEventCount: 1 },
    isEmpty: false, sectors: ["Rare Minerals", "Technology", " rare   minerals "], countries: ["NORTHREACH", "HANSEONG"],
    instruments: [
      { rowKey: "FGRM", symbol: "FGRM", name: "서리문 희토류 광업", description: "Fictional listed company", type: "stock", sector: "Rare Minerals", countryCode: "NORTHREACH", currentPrice: 84.5, change: 2.5, changePct: 3.04, status: "active" },
      { rowKey: "TECH", symbol: "TECH", name: "Technology", type: "stock", sector: "Technology", countryCode: "HANSEONG", currentPrice: 0.00456, change: -0.001, changePct: -2, status: "inactive" },
    ],
    panels: { trades: { status: "ready" }, events: { status: "ready" } },
    trades: [{ symbol: "FGRM", assetName: "서리문 희토류 광업", side: "buy", quantity: 3, executionPrice: 84.5 }],
    events: [{ headline: "물류 공급 소식", active: true, status: "active", explanation: "Fictional event", category: "logistics", sentiment: "positive", source: "simulation", magnitude: 1.2, volatilityImpact: 0.1 }],
  };
}
