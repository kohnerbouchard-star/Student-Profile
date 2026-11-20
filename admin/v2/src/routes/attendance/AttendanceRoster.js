import { AdminEmptyState, AdminField } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { rosterTable, titleCase } from "./AttendanceReadPanels.js";

const STATUSES = ["present", "late", "absent", "excused", "missing"];
const searchText = (value) => String(value ?? "").normalize("NFC").trim().toLowerCase();

// Search only the already-authorized display projection, never private IDs,
// credentials or notes. Preserve order, duplicate names and row identity.
export function filterAttendanceRoster(rows, query = "", status = "all") {
  const needle = searchText(query);
  const selected = STATUSES.includes(status) ? status : "all";
  if (!needle && selected === "all") return rows;
  return rows.filter((row) => (selected === "all" || row.attendanceStatus === selected)
    && (!needle || searchText(row.displayName).includes(needle) || searchText(row.rosterLabel).includes(needle)));
}

export function attendanceRoster(model) {
  const search = AdminField({
    name: "attendance-roster-search", label: "Find a player", type: "search", value: "",
    autocomplete: "off", maxLength: 200, placeholder: "Name or roster label",
    hint: "Filters this loaded roster only. Filters reset when attendance refreshes.",
  });
  const status = AdminField({
    name: "attendance-roster-status", label: "Attendance status", type: "select", value: "all",
    options: [{ value: "all", label: "All statuses" }, ...STATUSES.map((value) => ({ value, label: titleCase(value) }))],
  });
  const count = createElement("p");
  const emptyAnnouncement = createElement("p", {
    className: "admin-u-visually-hidden", attrs: { role: "status", "aria-live": "polite", "aria-atomic": "true" },
  });
  const table = rosterTable(model, { controller: true, emptyState: AdminEmptyState({
    title: "No matching players", message: "Change the name or status filter, or clear filters to show the loaded roster.", compact: true,
  }) });
  const reset = createElement("button", {
    className: "admin-button admin-button--quiet", attrs: { type: "button" },
    dataset: { attendanceAction: "clear-roster-filters" }, text: "Clear filters",
  });
  function render() {
    const rows = filterAttendanceRoster(model.rows, search.getValue(), status.getValue());
    count.textContent = `${rows.length} of ${model.rows.length} loaded roster entries shown. Summary totals and record actions are not filtered.`;
    table.setRows(rows);
    emptyAnnouncement.textContent = rows.length ? "" : "No matching players. Change or clear the roster filters.";
    reset.disabled = !search.getValue() && status.getValue() === "all";
  }
  search.control.addEventListener("input", render);
  status.control.addEventListener("change", render);
  reset.addEventListener("click", () => {
    search.setValue(""); status.setValue("all"); render(); search.focus();
  });
  render();
  return createElement("section", {
    className: "admin-attendance-route__roster", attrs: { "aria-label": "Attendance roster" },
    children: [search.element, status.element, reset, count, emptyAnnouncement, table.element],
  });
}
