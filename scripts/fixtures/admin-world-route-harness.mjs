import { readFileSync } from "node:fs";
import path from "node:path";
import { ADMIN_DATA_STATES } from "../../admin/v2/src/core/data-state.js";
import { WORLD_ARRIVAL_CLASS_IDS } from "../../admin/v2/src/routes/world-management/WorldManagementApi.js";

// Component-seam doubles exercise the route's actual import graph and its
// callbacks. They do not certify real-browser layout, focus, or shared dialogs.
export function createWorldRouteHarness() {
  const nodes = [];
  const tables = [];
  const reviews = [];
  const modules = new Map();
  function createElement(tag, options = {}) {
    const node = {
      tag, className: options.className || "", textContent: options.text ?? "",
      attrs: { ...options.attrs }, dataset: { ...options.dataset }, children: [], listeners: {},
      append(...children) {
        for (const child of children.flat().filter((value) => value != null && value !== false)) {
          this.children.push(child);
          if (typeof child === "object") child.parent = this;
        }
      },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      async dispatch(type) { return this.listeners[type]?.({ currentTarget: this }); },
      closest(tagName) { return this.tag === tagName ? this : this.parent?.closest(tagName); },
      querySelector(tagName) {
        for (const child of this.children) {
          if (child?.tag === tagName) return child;
          const nested = child?.querySelector?.(tagName);
          if (nested) return nested;
        }
        return null;
      },
    };
    node.append(options.children);
    nodes.push(node);
    return node;
  }
  function AdminDataTable(options) {
    const table = { options, rows: options.rows, cells: [], element: createElement("table") };
    options.rows.forEach((row, rowIndex) => {
      const cells = options.columns.map((column) => (
        column.render ? column.render(row[column.key], row, rowIndex) : row[column.key]
      ));
      table.cells.push(cells);
      table.element.append(createElement("tr", { children: cells.map((cell) => createElement("td", { children: cell })) }));
    });
    tables.push(table);
    return table;
  }
  function AdminConfirmDialog(options) {
    const review = {
      options, opened: false, opens: 0, destroyed: 0,
      setTitle(value) { this.title = value; },
      setMessage(value) { this.message = value; },
      setDetail(value) { this.detail = value; },
      open(opener) {
        this.opened = true;
        this.opens += 1;
        this.opener = opener;
        return new Promise((resolve) => { this.resolve = resolve; });
      },
      async accept() { const result = await options.onConfirm(); this.opened = false; this.resolve?.(true); return result; },
      cancel() { this.opened = false; this.resolve?.(false); },
      destroy() { this.destroyed += 1; this.opened = false; this.resolve?.(false); },
    };
    reviews.push(review);
    return review;
  }
  const component = (kind) => (options) => ({ kind, options });
  const components = {
    AdminDataTable, AdminConfirmDialog, AdminIcon: component("icon"),
    AdminEmptyState: component("empty"), AdminErrorState: component("error"),
    AdminStaleState: component("stale"),
    AdminPageFrame: (options) => ({ element: createElement("page", { children: options.content }), options }),
  };
  const directory = path.resolve("admin/v2/src/routes/world-management");
  const seams = new Map([
    [path.resolve(directory, "../../components/index.js"), components],
    [path.resolve(directory, "../../components/dom.js"), { createElement }],
    [path.resolve(directory, "../../core/data-state.js"), { ADMIN_DATA_STATES }],
    [path.join(directory, "WorldManagementApi.js"), { WORLD_ARRIVAL_CLASS_IDS }],
    [path.join(directory, "WorldManagementSkeleton.js"), { WorldManagementSkeleton: () => ({ kind: "skeleton" }) }],
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
    WorldManagementRoute: load(path.join(directory, "WorldManagementRoute.js")).WorldManagementRoute,
    nodes, tables, reviews,
    button(action) { return nodes.find((node) => node.dataset.worldAction === action); },
    table(caption) { return tables.find((table) => table.options.caption === caption); },
  };
}

export function worldModel() {
  return {
    summary: { countryCount: 1, currencyCount: 1, locationCount: 2, routeCount: 1, failedEffectCount: 1 },
    panels: { geography: { status: "ready" } },
    runtime: { packId: "world-fixture", packVersion: "1", revision: 19, initializedAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-02T00:00:00Z" },
    countries: [{ rowKey: "country", countryId: "north_reach", locationCount: 2, residencyCount: 1, pendingResidencyCount: 0, currencies: ["NRC"] }],
    currencies: [{ rowKey: "currency", currencyCode: "NRC", residencyCount: 1, journeyCount: 1, journeyCostMinor: 12500 }],
    campaign: {
      current: { campaignId: "cmp_public", status: "active", currentPhase: "shortage", revision: 7, scheduledAt: "2026-08-02T00:00:00Z" },
      scheduler: { due: 1, active: 1, paused: 0, emergencyDisabled: 0 },
      history: [{ rowKey: "history", eventKey: "shortage_event", fromPhase: "rivalry", toPhase: "shortage", sequence: 14, reason: "Scheduled", occurredAt: "2026-08-01T00:00:00Z" }],
    },
    effects: [{ rowKey: "effect", effectId: "cec_public", effectKind: "set_route_state", status: "failed", attemptCount: 2, lastErrorCode: "route_conflict" }],
    arrivals: [{ rowKey: "arrival", assignmentId: "acl_public", countryId: "north_reach", classId: "navigator", source: "questionnaire", revision: 3 }],
    geography: {
      locations: [
        { rowKey: "port", locationId: "loc_port", displayName: "노스리치 북항", countryId: "north_reach", locationKind: "port", availability: "available", revision: 2 },
        { rowKey: "gate", locationId: "loc_gate", displayName: "한강 국제 물류 관문", countryId: "north_reach", locationKind: "trade_hub", availability: "available", revision: 5 },
      ],
      routes: [{ rowKey: "route", routeId: "rte_public", fromLocationId: "loc_port", toLocationId: "loc_gate", mode: "air", status: "open", baseCostMinor: 12500, baseDurationMinutes: 180, costMultiplierBasisPoints: 12500 }],
    },
    travel: { states: [{}], journeys: [{ rowKey: "journey", fromLocationId: "loc_port", toLocationId: "loc_gate", status: "completed", currencyCode: "NRC", totalCostMinor: 12500, totalDurationMinutes: 180, arrivalAt: "2026-08-03T00:00:00Z" }] },
    residency: [{ rowKey: "residency", currentCountryId: "north_reach", currencyCode: "NRC", pendingCountryId: null, eligibleCountryIds: ["hanseong_republic"], revision: 8, updatedAt: "2026-08-03T00:00:00Z" }],
  };
}
