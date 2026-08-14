import { AdminIcon } from "./AdminIcon.js";
import { AdminEmptyState } from "./AdminEmptyState.js";
import { AdminSkeleton } from "./AdminSkeleton.js";
import { appendContent, createElement, replaceContent } from "./dom.js";

const NON_SORTABLE_KEYS = new Set(["actions", "action", "detail", "artwork", "recovery"]);

function normalizeCell(value) {
  if (value instanceof Node) return value;
  return document.createTextNode(value == null ? "Not available" : String(value));
}

function defaultSortValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (value.trim() && Number.isFinite(numeric)) return numeric;
    const timestamp = Date.parse(value);
    if (/\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(timestamp)) return timestamp;
    return value.normalize("NFKC").toLocaleLowerCase();
  }
  if (typeof value === "object") {
    const candidate = value.displayName || value.name || value.label || value.title || value.status || value.code;
    if (candidate !== undefined) return defaultSortValue(candidate);
  }
  return String(value).normalize("NFKC").toLocaleLowerCase();
}

function compareValues(left, right) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

function canSort(column) {
  if (column.sortable === true) return true;
  if (column.sortable === false) return false;
  return !NON_SORTABLE_KEYS.has(String(column.key || "").toLowerCase());
}

export function AdminDataTable({
  caption = "Data table",
  columns = [],
  rows = [],
  rowKey = (_row, index) => index,
  sort,
  onSort,
  emptyState,
} = {}) {
  const root = createElement("div", { className: "admin-data-table" });
  const resultStatus = createElement("div", {
    className: "admin-data-table__result-count",
    attrs: { role: "status", "aria-live": "polite" },
  });
  const scroll = createElement("div", {
    className: "admin-data-table__scroll",
    attrs: { tabindex: "0", role: "region", "aria-label": `${caption}, horizontally scrollable` },
  });
  const table = createElement("table", { className: "admin-data-table__table" });
  const captionElement = createElement("caption", { className: "admin-u-visually-hidden", text: caption });
  const head = createElement("thead");
  const body = createElement("tbody");
  const status = createElement("div", { className: "admin-data-table__status" });
  let sourceRows = Array.isArray(rows) ? rows : [];
  let localSort = sort || null;

  function activeSort() {
    return sort || localSort;
  }

  function sortedRows() {
    const current = activeSort();
    if (!current?.key) return sourceRows.slice();
    const column = columns.find((entry) => entry.key === current.key);
    if (!column || !canSort(column)) return sourceRows.slice();
    const direction = current.direction === "desc" ? -1 : 1;
    const valueFor = typeof column.sortValue === "function"
      ? (record, index) => column.sortValue(record?.[column.key], record, index)
      : (record) => defaultSortValue(record?.[column.key]);
    return sourceRows
      .map((record, index) => ({ record, index, value: valueFor(record, index) }))
      .sort((left, right) => {
        const comparison = compareValues(left.value, right.value);
        return comparison === 0 ? left.index - right.index : comparison * direction;
      })
      .map(({ record }) => record);
  }

  function renderHead() {
    const row = createElement("tr");
    const current = activeSort();
    columns.forEach((column) => {
      const sortable = canSort(column);
      const direction = current?.key === column.key ? current.direction : null;
      const cell = createElement("th", {
        className: "admin-data-table__heading",
        dataset: { align: column.align || "start" },
        attrs: {
          scope: "col",
          "aria-sort": sortable
            ? (direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none")
            : null,
          style: column.width ? `--admin-table-column-size: ${column.width}` : null,
        },
      });

      if (sortable) {
        const button = createElement("button", {
          className: "admin-data-table__sort",
          attrs: { type: "button", "aria-label": `Sort by ${column.label}${direction === "asc" ? ", descending" : ", ascending"}` },
          children: [column.label, AdminIcon({ name: "sort", size: 15 })],
        });
        button.addEventListener("click", () => {
          const nextSort = {
            key: column.key,
            direction: direction === "asc" ? "desc" : "asc",
          };
          if (typeof onSort === "function") {
            onSort(nextSort);
          } else {
            localSort = nextSort;
            renderHead();
            renderRows();
          }
        });
        cell.append(button);
      } else {
        cell.textContent = column.label;
      }
      row.append(cell);
    });
    head.replaceChildren(row);
  }

  function renderRows() {
    const nextRows = sortedRows();
    replaceContent(body, nextRows.map((record, rowIndex) => {
      const tableRow = createElement("tr", {
        className: "admin-data-table__row",
        dataset: { rowKey: rowKey(record, rowIndex) },
      });
      columns.forEach((column) => {
        const rawValue = record?.[column.key];
        const rendered = column.render
          ? column.render(rawValue, record, rowIndex)
          : rawValue;
        const cell = createElement(column.rowHeader ? "th" : "td", {
          className: "admin-data-table__cell",
          dataset: { align: column.align || "start", column: column.key },
          attrs: column.rowHeader ? { scope: "row" } : {},
        });
        appendContent(cell, normalizeCell(rendered));
        tableRow.append(cell);
      });
      return tableRow;
    }));

    const hasRows = nextRows.length > 0;
    scroll.hidden = !hasRows;
    status.hidden = hasRows;
    resultStatus.hidden = !hasRows;
    resultStatus.textContent = hasRows
      ? `Showing ${nextRows.length.toLocaleString()} record${nextRows.length === 1 ? "" : "s"}`
      : "";
    if (!hasRows) {
      replaceContent(status, emptyState || AdminEmptyState({
        title: "No records found",
        message: "Try changing the current filters.",
        compact: true,
      }));
    }
  }

  function setRows(nextRows = []) {
    sourceRows = Array.isArray(nextRows) ? nextRows : [];
    renderRows();
  }

  function setLoading(loading, label = "Loading table data") {
    root.setAttribute("aria-busy", loading ? "true" : "false");
    if (loading) {
      scroll.hidden = true;
      resultStatus.hidden = true;
      status.hidden = false;
      replaceContent(status, AdminSkeleton({ label, count: 5, shape: "row" }));
    } else {
      renderRows();
    }
  }

  function setSort(nextSort) {
    sort = nextSort;
    if (!onSort) localSort = nextSort;
    renderHead();
    renderRows();
  }

  renderHead();
  table.append(captionElement, head, body);
  scroll.append(table);
  root.append(resultStatus, scroll, status);
  renderRows();

  return { element: root, table, setRows, setLoading, setSort };
}
