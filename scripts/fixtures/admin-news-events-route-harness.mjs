import { readFileSync } from "node:fs";
import path from "node:path";
import { ADMIN_DATA_STATES } from "../../admin/v2/src/core/data-state.js";

// Route graph executes unchanged; component doubles record trees and callbacks.
// Real drawer focus/layout and transport remain separate browser qualifications.
export function createNewsEventsHarness() {
  const nodes = [], tables = [], drawers = [], frames = [];
  const fields = new Map(), modules = new Map();
  function createElement(tag, options = {}) {
    const node = { tag, className: options.className || "", textContent: options.text ?? "",
      attrs: { ...options.attrs }, dataset: { ...options.dataset }, children: [], listeners: {},
      append(...children) { this.children.push(...children.flat().filter((child) => child != null && child !== false)); },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      async dispatch(type) { return this.listeners[type]?.({ currentTarget: this }); },
    };
    node.classList = { add(name) { node.className += ` ${name}`; } };
    node.append(options.children); nodes.push(node); return node;
  }
  function AdminField(options) {
    const field = { options, value: options.value ?? "", control: createElement(options.type || "input"), element: createElement("field"), focused: 0,
      getValue() { return String(this.value); }, setError(error) { this.error = error; }, focus() { this.focused += 1; },
    };
    fields.set(options.name, field); return field;
  }
  function AdminDataTable(options) {
    const table = { options, rows: [], cells: [], element: createElement("table"),
      setRows(rows) { this.rows = rows; this.cells = rows.map((row, index) => options.columns.map((column) => column.render ? column.render(row[column.key], row, index) : row[column.key])); this.element.children = this.cells.flat(); },
    };
    tables.push(table); return table;
  }
  function AdminDrawer(options) {
    const drawer = { options, element: createElement("drawer"), opens: [], closed: 0, destroyed: 0,
      open(opener) { this.opens.push(opener); },
      close() { this.closed += 1; this.element.dispatch("admin-dialog-close"); },
      destroy() { this.destroyed += 1; },
    };
    drawers.push(drawer); return drawer;
  }
  const component = (kind) => (options) => ({ kind, options });
  const components = { AdminDataTable, AdminField, AdminDrawer, AdminIcon: component("icon"),
    AdminEmptyState: component("empty"), AdminErrorState: component("error"), AdminStaleState: component("stale"),
    AdminPageFrame: (options) => { const frame = { element: createElement("page", { children: options.content }), options }; frames.push(frame); return frame; },
  };
  const directory = path.resolve("admin/v2/src/routes/news-events");
  const seams = new Map([
    [path.resolve(directory, "../../components/index.js"), components],
    [path.resolve(directory, "../../components/dom.js"), { createElement }],
    [path.resolve(directory, "../../core/data-state.js"), { ADMIN_DATA_STATES }],
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
    modules.set(filename, loaded); return loaded;
  }
  return { NewsEventsRoute: load(path.join(directory, "NewsEventsRoute.js")).NewsEventsRoute, nodes, fields, tables, drawers, frames };
}

export function newsEventsModel() {
  return {
    summary: { eventCount: 1, newsPublicationCount: 3, activeCount: 1, upcomingCount: 1, failedCount: 1 },
    panels: { history: { status: "ready" }, effects: { status: "ready" }, campaign: { status: "ready" } },
    campaigns: [{ temporalStatus: "upcoming", phase: "shortage", scheduledAt: "2026-11-11T01:00:00Z", eventSequence: 14 }],
    events: [{ rowKey: "event-1", eventKey: "logistics_disruption", reason: "가상 물류 소식", fromPhase: "rivalry", toPhase: "shortage", lifecycle: "past", occurredAt: "2026-11-10T01:00:00Z", sequence: 14, actorType: "system", triggerKey: "synthetic.trigger" }],
    news: [
      { rowKey: "news-1", newsDefinitionId: "news.failed", audience: "all_players", lifecycle: "failed", createdAt: "2026-11-10T04:00:00Z", lastErrorCode: "delivery_failed", attemptCount: 3 },
      { rowKey: "news-2", newsDefinitionId: "news.completed", audience: "all_players", lifecycle: "past", createdAt: "2026-11-10T02:00:00Z", completedAt: "2026-11-10T03:00:00Z", attemptCount: 1 },
      { rowKey: "news-3", newsDefinitionId: "news.processing", audience: "affected_locations", lifecycle: "active", createdAt: "2026-11-10T01:00:00Z", claimedAt: "2026-11-10T02:30:00Z", attemptCount: 1 },
    ],
  };
}
