import { AdminIcon } from "./AdminIcon.js";
import { AdminEmptyState } from "./AdminEmptyState.js";
import { AdminSkeleton } from "./AdminSkeleton.js";
import { appendContent, createElement, replaceContent } from "./dom.js";

function normalizeCell(value) {
  if (value instanceof Node) return value;
  return document.createTextNode(value == null ? "Not available" : String(value));
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
  const scroll = createElement("div", {
    className: "admin-data-table__scroll",
    attrs: { tabindex: "0", role: "region", "aria-label": `${caption}, horizontally scrollable` },
  });
  const table = createElement("table", { className: "admin-data-table__table" });
  const captionElement = createElement("caption", { className: "admin-u-visually-hidden", text: caption });
  const head = createElement("thead");
  const body = createElement("tbody");
  const status = createElement("div", { className: "admin-data-table__status" });

  function renderHead() {
    const row = createElement("tr");
    columns.forEach((column) => {
      const direction = sort?.key === column.key ? sort.direction : null;
      const cell = createElement("th", {
        className: "admin-data-table__heading",
        dataset: { align: column.align || "start" },
        attrs: {
          scope: "col",
          "aria-sort": column.sortable
            ? (direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none")
            : null,
          style: column.width ? `--admin-table-column-size: ${column.width}` : null,
        },
      });

      if (column.sortable) {
        const button = createElement("button", {
          className: "admin-data-table__sort",
          attrs: { type: "button" },
          children: [column.label, AdminIcon({ name: "sort", size: 15 })],
        });
        button.addEventListener("click", () => {
          const nextDirection = direction === "asc" ? "desc" : "asc";
          onSort?.({ key: column.key, direction: nextDirection });
        });
        cell.append(button);
      } else {
        cell.textContent = column.label;
      }
      row.append(cell);
    });
    head.replaceChildren(row);
  }

  function renderRows(nextRows) {
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

    scroll.hidden = nextRows.length === 0;
    status.hidden = nextRows.length > 0;
    if (nextRows.length === 0) {
      replaceContent(status, emptyState || AdminEmptyState({
        title: "No records found",
        message: "Try changing the current filters.",
        compact: true,
      }));
    }
  }

  function setRows(nextRows = []) {
    rows = nextRows;
    renderRows(rows);
  }

  function setLoading(loading, label = "Loading table data") {
    root.setAttribute("aria-busy", loading ? "true" : "false");
    if (loading) {
      scroll.hidden = true;
      status.hidden = false;
      replaceContent(status, AdminSkeleton({ label, count: 5, shape: "row" }));
    } else {
      renderRows(rows);
    }
  }

  function setSort(nextSort) {
    sort = nextSort;
    renderHead();
  }

  renderHead();
  table.append(captionElement, head, body);
  scroll.append(table);
  root.append(scroll, status);
  renderRows(rows);

  return { element: root, table, setRows, setLoading, setSort };
}
