import { readFileSync } from "node:fs";
import path from "node:path";
import { ADMIN_DATA_STATES } from "../../admin/v2/src/core/data-state.js";

// Execute the actual local module graph. Component doubles record markup and
// callbacks; they do not certify browser focus, layout or server mutation gates.
export function createAttendanceRouteHarness() {
  const nodes = [], tables = [], confirmations = [], frames = [];
  const fields = new Map(), modules = new Map();
  function createElement(tag, options = {}) {
    const node = { tag, className: options.className || "", textContent: options.text ?? "",
      attrs: { ...options.attrs }, dataset: { ...options.dataset }, children: [], listeners: {},
      id: options.attrs?.id, value: "", disabled: Boolean(options.attrs?.disabled), isConnected: true, focuses: [],
      append(...children) { this.children.push(...children.flat().filter((child) => child != null && child !== false)); },
      replaceChildren(...children) { this.children = []; this.append(...children); },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      async dispatch(type, extra = {}) { return this.listeners[type]?.({ currentTarget: this, preventDefault() {}, ...extra }); },
      focus(options) { this.focuses.push(options); },
      querySelector(selector) {
        if (selector !== "#adminAttendanceScannerInput:not(:disabled)") throw new Error(`Unexpected selector ${selector}`);
        const find = (item) => item?.id === "adminAttendanceScannerInput" && !item.disabled ? item : (item?.children || []).map(find).find(Boolean);
        return find(this) || null;
      },
    };
    node.append(options.children); nodes.push(node); return node;
  }
  function AdminField(options) {
    const field = { options, value: options.value ?? "", control: createElement(options.type || "input"), element: createElement("field"), focused: 0,
      getValue() { return String(this.value); }, setError(error) { this.error = error; }, focus() { this.focused += 1; },
      setDisabled(value) { this.control.disabled = Boolean(value); },
    };
    fields.set(options.name, field); return field;
  }
  function AdminDataTable(options) {
    const table = { options, rows: options.rows || [], cells: [], element: createElement("table") };
    table.cells = table.rows.map((row, index) => options.columns.map((column) => column.render ? column.render(row[column.key], row, index) : row[column.key]));
    table.element.children = table.cells.flat(); tables.push(table); return table;
  }
  function AdminConfirmDialog(options) {
    const confirm = { options, opens: [], destroyed: 0, resolve: null,
      open(opener) { this.opens.push(opener); return new Promise((resolve) => { this.resolve = resolve; }); },
      settle(accepted) { this.resolve?.(accepted); this.resolve = null; },
      setDetail(detail) { this.detail = detail; },
      destroy() { this.destroyed += 1; this.settle(false); },
    };
    confirmations.push(confirm); return confirm;
  }
  const component = (kind) => (options) => ({ kind, options });
  const components = { AdminDataTable, AdminField, AdminConfirmDialog, AdminIcon: component("icon"),
    AdminEmptyState: component("empty"), AdminErrorState: component("error"), AdminStaleState: component("stale"),
    AdminPageFrame: (options) => { const frame = { element: createElement("page", { children: options.content }), options }; frames.push(frame); return frame; },
  };
  const directory = path.resolve("admin/v2/src/routes/attendance");
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
  return { AttendanceRoute: load(path.join(directory, "AttendanceRoute.js")).AttendanceRoute,
    nodes, fields, tables, confirmations, frames,
    button(action) { return nodes.find((node) => node.dataset.attendanceAction === action); },
  };
}

export function attendanceModel() {
  return {
    attendanceDate: "2026-11-10", timezone: "Asia/Seoul", isEmpty: false, lock: { locked: false, reason: "" },
    summary: { presentCount: 1, lateCount: 0, absentCount: 1, excusedCount: 0, missingCount: 1, activePlayerCount: 2 },
    rows: [
      { rowKey: "attendance-player-1", displayName: "가상 학생", rosterLabel: "Class A", attendanceStatus: "present", clockedInAt: "2026-11-10T01:00:00Z", source: "scanner", note: "Synthetic note" },
      { rowKey: "attendance-player-2", displayName: "Sample Student", rosterLabel: "", attendanceStatus: "absent", clockedInAt: "", source: "not_scanned", note: "" },
    ],
  };
}
