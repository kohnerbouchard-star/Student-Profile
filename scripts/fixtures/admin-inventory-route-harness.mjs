import { readFileSync } from "node:fs";
import path from "node:path";
import { ADMIN_DATA_STATES } from "../../admin/v2/src/core/data-state.js";

// Execute the actual local module graph. Component doubles record markup and
// callbacks; they do not certify browser focus, layout or server mutation gates.
export function createInventoryRouteHarness() {
  const nodes = [], tables = [], dialogs = [], frames = [];
  const fields = new Map(), modules = new Map();
  function createElement(tag, options = {}) {
    const node = { tag, className: options.className || "", textContent: options.text ?? "",
      attrs: { ...options.attrs }, dataset: { ...options.dataset }, children: [], listeners: {},
      classList: { add() {} }, id: options.attrs?.id, value: "", disabled: Boolean(options.attrs?.disabled), isConnected: true, focuses: [],
      append(...children) { this.children.push(...children.flat().filter((child) => child != null && child !== false)); },
      replaceChildren(...children) { this.children = []; this.append(...children); },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      async dispatch(type, extra = {}) { return this.listeners[type]?.({ currentTarget: this, preventDefault() {}, ...extra }); },
      focus(options) { this.focuses.push(options); },

    };
    node.append(options.children); nodes.push(node); return node;
  }
  function AdminField(options) {
    const field = { options, value: options.value ?? "", control: createElement(options.type || "input"), element: createElement("field"), focused: 0,
      getValue() { return String(this.value); }, setValue(value) { this.value = value; }, setError(error) { this.error = error; }, focus() { this.focused += 1; },
      setDisabled(value) { this.control.disabled = Boolean(value); },
    };
    fields.set(options.name, field); return field;
  }
  function AdminDataTable(options) {
    const table = { options, rows: options.rows || [], cells: [], element: createElement("table") };
    table.setRows = (rows) => {
      table.rows = rows;
      table.cells = rows.map((row, index) => options.columns.map((column) => column.render ? column.render(row[column.key], row, index) : row[column.key]));
      table.element.children = rows.length ? table.cells.flat() : [options.emptyState];
    };
    table.setRows(table.rows); tables.push(table); return table;
  }
  function AdminDialog(options) {
    const dialog = { options, opens: [], closes: [], busy: [], destroyed: 0,
      open(opener) { this.opens.push(opener); },
      close(reason) { this.closes.push(reason); options.onClose?.(); },
      setBusy(value) { this.busy.push(value); },
      destroy() { this.destroyed += 1; },
    };
    dialogs.push(dialog); return dialog;
  }
  const component = (kind) => (options) => ({ kind, options });
  const components = { AdminDataTable, AdminField, AdminDialog, AdminIcon: component("icon"),
    AdminEmptyState: component("empty"), AdminErrorState: component("error"), AdminStaleState: component("stale"),
    AdminPageFrame: (options) => { const frame = { element: createElement("page", { children: options.content }), options }; frames.push(frame); return frame; },
  };
  const directory = path.resolve("admin/v2/src/routes/inventory");
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
  return { InventoryRoute: load(path.join(directory, "InventoryRoute.js")).InventoryRoute,
    nodes, fields, tables, dialogs, frames,
    button(action) { return nodes.find((node) => node.dataset.inventoryAction === action); },
  };
}
