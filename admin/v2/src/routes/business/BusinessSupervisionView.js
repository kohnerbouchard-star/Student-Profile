import { AdminDataTable, AdminEmptyState, AdminField } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { BUSINESS_SUPERVISION_FIELDS, BUSINESS_SUPERVISION_LABELS } from "./BusinessSupervisionModel.js";

function label(value) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function BusinessSupervisionView(model) {
  const selector = AdminField({
    name: "supervision-section", label: "Supervision section", type: "select", value: "readiness",
    options: Object.entries(BUSINESS_SUPERVISION_LABELS).map(([value, text]) => ({ value, label: text })),
  });
  const content = createElement("section", {
    className: "admin-business-supervision__content",
    attrs: { "aria-live": "polite", "aria-label": "Selected supervision evidence" },
  });
  function render() {
    const name = selector.getValue();
    const section = model?.sections?.[name];
    const title = BUSINESS_SUPERVISION_LABELS[name];
    content.replaceChildren(createElement("h3", { text: title }));
    if (!section || section.status === "unavailable") {
      content.append(AdminEmptyState({ title: "Evidence unavailable", message: "This source is not available in the current response. No zero balance or healthy status is inferred.", compact: true }));
      return;
    }
    if (section.status === "empty") {
      content.append(AdminEmptyState({ title: "No recorded evidence", message: "No records were returned for this Business and section. This is not a financial-health certification.", compact: true }));
      return;
    }
    content.append(createElement("p", {
      className: "admin-business-supervision__note",
      text: section.truncated ? "Showing the first 100 records in source order. Additional records exist; these rows are not an aggregate total."
        : section.window || "Canonical recorded evidence. Amounts retain source precision; currencies are not combined.",
    }));
    const table = AdminDataTable({
      caption: title,
      rowKey: (_row, index) => String(index),
      columns: BUSINESS_SUPERVISION_FIELDS[name].map((key, index) => ({
        key, label: label(key), rowHeader: index === 0, sortable: false,
        render: (value) => value === null || value === undefined || value === "" ? "Not available" : String(value),
      })),
    });
    table.setRows(section.rows);
    content.append(table.element);
  }
  selector.control.addEventListener("change", render);
  render();
  return createElement("section", {
    className: "admin-business-supervision", attrs: { "aria-label": "Business supervision" },
    children: [
      createElement("h3", { text: "Operations, finance and governance" }),
      createElement("p", { text: "Read-only evidence. Repair and durability are unsupported. No intervention, payroll, tax, inventory, FX or ownership commands are available here." }),
      createElement("p", { text: model?.generatedAt ? "Snapshot: " + model.generatedAt : "Snapshot time unavailable" }),
      createElement("p", { text: model?.healthFlags?.length ? "Attention evidence: " + model.healthFlags.map(label).join("; ") : "No attention flags returned. Review the source sections; this does not establish overall financial health." }),
      selector.element, content,
    ],
  });
}
