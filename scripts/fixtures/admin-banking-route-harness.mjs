import { readFileSync } from "node:fs";
import path from "node:path";
import { ADMIN_DATA_STATES } from "../../admin/v2/src/core/data-state.js";
import { normalizeBankingReadModel, normalizeBankingHistory } from "../../admin/v2/src/routes/banking/BankingController.js";

// Exercise the actual local module graph with component-seam doubles. This is
// source behavior evidence, not a substitute for real-browser focus/layout QA.
export function createBankingRouteHarness() {
  const nodes = [], tables = [], dialogs = [], confirmations = [], validations = [], frames = [];
  const fields = new Map(), modules = new Map();
  function createElement(tag, options = {}) {
    const node = {
      tag, className: options.className || "", textContent: options.text ?? "",
      attrs: { ...options.attrs }, dataset: { ...options.dataset }, children: [], listeners: {},
      append(...children) { this.children.push(...children.flat().filter((child) => child != null && child !== false)); },
      replaceChildren(...children) { this.children = []; this.append(...children); },
      setAttribute(name, value) { this.attrs[name] = String(value); },
      removeAttribute(name) { delete this.attrs[name]; },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      dispatch(type) { return this.listeners[type]?.({ currentTarget: this, preventDefault() {} }); },
      requestSubmit() { return this.dispatch("submit"); },
    };
    node.classList = { add(name) { node.className += ` ${name}`; } };
    node.append(options.children); nodes.push(node); return node;
  }
  function AdminField(options) {
    const control = createElement(options.type || "input"); control.id = options.name;
    const field = { options, value: options.value ?? "", control, element: createElement("field"),
      getValue() { return String(this.value); }, setValue(value) { this.value = value; },
      setError(error) { this.error = error; },
    };
    fields.set(options.name, field); return field;
  }
  function AdminDataTable(options) {
    const table = { options, rows: [], cells: [], element: createElement("table"),
      setRows(rows) {
        this.rows = rows;
        this.cells = rows.map((row, index) => options.columns.map((column) => column.render ? column.render(row[column.key], row, index) : row[column.key]));
        this.element.children = this.cells.flat();
      },
    };
    table.setRows(options.rows || []); tables.push(table); return table;
  }
  function makeDialog(options, collection) {
    const dialog = { options, element: createElement("dialog"), opened: false, opens: [], closes: [], destroyed: 0,
      open(opener) { this.opened = true; this.opens.push(opener); },
      close(reason) { this.opened = false; this.closes.push(reason); options.onClose?.(reason); },
      isOpen() { return this.opened; },
      destroy() { this.destroyed += 1; this.opened = false; },
    };
    collection.push(dialog); return dialog;
  }
  const component = (kind) => (options) => ({ kind, options });
  const components = {
    AdminDataTable, AdminField, AdminIcon: component("icon"), AdminSkeleton: component("skeleton"),
    AdminEmptyState: component("empty"), AdminErrorState: component("error"), AdminStaleState: component("stale"),
    AdminDialog: (options) => makeDialog(options, dialogs),
    AdminConfirmDialog: (options) => makeDialog(options, confirmations),
    AdminValidationSummary: () => {
      const validation = { element: createElement("validation"), setErrors(errors, options) { this.errors = errors; this.options = options; } };
      validations.push(validation); return validation;
    },
    AdminPageFrame: (options) => { const frame = { element: createElement("page", { children: options.content }), options }; frames.push(frame); return frame; },
  };
  const directory = path.resolve("admin/v2/src/routes/banking");
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
  return { BankingRoute: load(path.join(directory, "BankingRoute.js")).BankingRoute,
    nodes, fields, tables, dialogs, confirmations, validations, frames,
    button(action) { return nodes.findLast((node) => node.dataset.bankingAction === action); },
  };
}

export function bankingModel() {
  return normalizeBankingReadModel({ data: { players: [
    { id: "10000000-0000-4000-8000-000000000001", displayName: "가상 학생", rosterLabel: "Class A", countryName: "Northreach", status: "active", balances: [
      { accountType: "checking", balance: 1250.5, currencyCode: "LOC", updatedAt: "2026-11-10T01:00:00Z" },
      { accountType: "savings", balance: 0, currencyCode: "LOC" },
    ] },
    { id: "20000000-0000-4000-8000-000000000002", displayName: "Sample Student", countryName: "Southreach", status: "inactive", balances: [
      { accountType: "checking", balance: -12, currencyCode: "ALT" },
    ] },
  ] } });
}

export function bankingHistory() {
  return normalizeBankingHistory({ data: { ledgerEntries: [
    { account_type: "checking", amount: -25, currency_code: "LOC", entry_type: "debit", source_domain: "banking", source_action: "savings_transfer", created_at: "2026-11-10T02:00:00Z" },
    { account_type: "savings", amount: 25, currency_code: "LOC", entry_type: "credit", source_domain: "banking", source_action: "savings_transfer", created_at: "2026-11-10T02:00:00Z" },
  ] } });
}
