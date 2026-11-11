import { readFileSync } from "node:fs";
import path from "node:path";
import { ADMIN_DATA_STATES } from "../../admin/v2/src/core/data-state.js";
import * as dateTime from "../../admin/v2/src/core/date-time.js";

// Component-seam doubles, not a browser: retain route-created trees, handlers,
// field values and dialog lifetimes while exercising the actual module graph.
export function createCraftingRouteHarness() {
  const fields = new Map();
  const tables = [];
  const dialogs = [];
  const reviews = [];
  const microtasks = [];
  const nodes = [];
  const modules = new Map();

  function createElement(tag, options = {}) {
    const node = {
      tag,
      className: options.className || "",
      textContent: options.text ?? "",
      attrs: { ...options.attrs },
      dataset: { ...options.dataset },
      children: [],
      listeners: {},
      focusCount: 0,
      append(...children) {
        this.children.push(...children.flat().filter((child) => child != null && child !== false));
      },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      async dispatch(type) {
        return this.listeners[type]?.({ currentTarget: this, preventDefault() {} });
      },
      requestSubmit() { return this.dispatch("submit"); },
      querySelector(selector) {
        if (selector !== "[aria-invalid='true']") throw new Error(`Unexpected selector: ${selector}`);
        return [...fields.values()].find((field) => field.error)?.control;
      },
      focus() { this.focusCount += 1; },
    };
    node.append(options.children);
    nodes.push(node);
    return node;
  }

  function AdminField(options) {
    const control = createElement(options.type || "input");
    const field = {
      options, control, value: options.value ?? "", error: "",
      element: createElement("field", { children: control }),
      getValue() { return String(this.value); },
      setError(error) { this.error = error; },
      setReadOnly(value, reason) { this.readOnly = value; this.readOnlyReason = reason; },
      focus() { control.focus(); },
    };
    fields.set(options.name, field);
    return field;
  }

  function AdminDataTable(options) {
    const table = {
      options, rows: [], cells: [], element: createElement("table"),
      setRows(rows) {
        this.rows = rows;
        this.cells = rows.map((row) => options.columns.map((column) => (
          column.render ? column.render(row[column.key], row) : row[column.key]
        )));
        this.element.children = this.cells.flat();
      },
    };
    tables.push(table);
    return table;
  }

  function AdminDialog(options) {
    const dialog = {
      options, opened: false, destroyed: 0, busy: [], closes: [],
      open(opener) { this.opened = true; this.opener = opener; },
      close(reason) {
        this.closes.push(reason);
        this.opened = false;
        options.onClose?.();
      },
      destroy() { this.destroyed += 1; this.opened = false; },
      setBusy(busy) { this.busy.push(busy); },
      isOpen() { return this.opened; },
    };
    dialogs.push(dialog);
    return dialog;
  }

  function AdminConfirmDialog(options) {
    const review = {
      options, destroyed: 0,
      open(opener) {
        this.opener = opener;
        return new Promise((resolve) => { this.resolve = resolve; });
      },
      destroy() { this.destroyed += 1; },
      async accept() { await options.onConfirm(); this.resolve(true); },
      cancel() { this.resolve(false); },
    };
    reviews.push(review);
    return review;
  }

  const component = (kind) => (options) => createElement(kind, { ...options, children: options?.content });
  const components = {
    AdminField, AdminDataTable, AdminDialog, AdminConfirmDialog,
    AdminIcon: component("icon"),
    AdminEmptyState: component("empty"),
    AdminErrorState: (options) => ({ kind: "error", options }),
    AdminStaleState: (options) => ({ kind: "stale", options }),
    AdminPageFrame: (options) => ({ element: createElement("page", { children: options.content }), options }),
  };
  const directory = path.resolve("admin/v2/src/routes/crafting");
  const seams = new Map([
    [path.resolve(directory, "../../components/index.js"), components],
    [path.resolve(directory, "../../components/dom.js"), { createElement }],
    [path.resolve(directory, "../../core/data-state.js"), { ADMIN_DATA_STATES }],
    [path.resolve(directory, "../../core/date-time.js"), dateTime],
    [path.join(directory, "CraftingSkeleton.js"), { CraftingSkeleton: () => ({ kind: "skeleton" }) }],
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
    const loaded = new Function("load", "queueMicrotask", `${executable}\nreturn { ${exports.join(", ")} };`)(
      load, (callback) => microtasks.push(callback),
    );
    modules.set(filename, loaded);
    return loaded;
  }

  return {
    CraftingRoute: load(path.join(directory, "CraftingRoute.js")).CraftingRoute,
    fields, tables, dialogs, reviews, nodes,
    button(action) { return nodes.findLast((node) => node.dataset.craftingAction === action); },
    table(caption) { return tables.find((table) => table.options.caption === caption); },
    flush() { while (microtasks.length) microtasks.shift()(); },
  };
}

export function craftingModel() {
  return {
    summary: { observedRecipeCount: 1, activeJobCount: 1, claimedJobCount: 1, constrainedSupplyCount: 1, invariantViolations: 2 },
    pack: { packKey: "pack", contentVersion: "1", status: "active", activatedAt: "2026-08-01T00:00:00Z" },
    recipes: [{ rowKey: "recipe", recipeKey: "sensor", recipeName: "Sensor", jobCount: 2, claimedCount: 1, failedCount: 1 }],
    jobs: [
      { rowKey: "failed", jobKey: "cft_failed", recipeKey: "sensor", recipeName: "Sensor", playerLabel: "Player One", countryCode: "LUM", status: "failed", quantity: 2, qualityBand: "high", difficulty: "advanced", failureCode: "reservation_conflict" },
      { rowKey: "claimed", jobKey: "cft_claimed", recipeName: "Battery", playerLabel: "Player Two", countryCode: "ZED", status: "claimed", quantity: 1 },
    ],
    supply: [{ rowKey: "supply", itemKey: "sensor", countryCode: "LUM", scarcityBand: "constrained", availableQuantity: 4, reservedQuantity: 2, eventMultiplier: 1.25, routeMultiplier: 0.8, sourceEventKey: "event.001", expiresAt: null }],
    effects: [{ rowKey: "effect", effectCode: "mobility_boost", summary: "Mobility", kind: "temporary", scope: "player", durationSeconds: 900, cooldownSeconds: 30, stackingRule: "replace", maxStacks: 1, enabled: true }],
    invariants: { negativeOwned: 0, negativeReserved: 1, reservedAboveOwned: 0, reservationProjectionMismatch: 1, duplicateOutputGrants: 0 },
  };
}
