import { AdminDataTable, AdminEmptyState, AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { displayMinor, displayNumber, displayTime, factGrid, sectionCard, titleCase } from "./WorldViewHelpers.js";

function metric(label, value, detail) {
  return createElement("article", {
    className: "admin-world-route__metric",
    children: [
      createElement("span", { text: label }),
      createElement("output", { text: displayNumber(value) }),
      createElement("small", { text: detail }),
    ],
  });
}

export function summary(model) {
  return createElement("section", {
    className: "admin-world-route__summary",
    attrs: { "aria-label": "World summary" },
    children: [
      metric("Countries", model.summary.countryCount, "Observed in authoritative World state"),
      metric("Currencies", model.summary.currencyCount, "Observed in residency and travel"),
      metric("Locations", model.summary.locationCount, "Initialized geography locations"),
      metric("Routes", model.summary.routeCount, "Authoritative geography routes"),
    ],
  });
}

export function failedPanelNotice(model) {
  const failed = Object.entries(model.panels || {})
    .filter(([, panel]) => panel.status === "failed");
  if (failed.length === 0) return null;
  return createElement("section", {
    className: "admin-world-route__partial-error",
    attrs: { role: "status", "aria-label": "Partial World data availability" },
    children: [
      AdminIcon({ name: "warning", size: 18 }),
      createElement("div", {
        children: [
          createElement("strong", { text: "Some World data is unavailable" }),
          createElement("p", {
            text: `${failed.map(([key]) => titleCase(key)).join(", ")} could not be loaded. Available authoritative panels remain visible.`,
          }),
        ],
      }),
    ],
  });
}

export function worldConfiguration(model) {
  const runtime = model.runtime;
  return sectionCard({
    id: "world-configuration",
    eyebrow: "World configuration",
    title: runtime ? "Authoritative runtime" : "Runtime metadata unavailable",
    description: "Runtime pack identity and revision are read directly from the current game-scoped World contract.",
    children: runtime
      ? [factGrid([
        ["Pack", runtime.packId || "—"],
        ["Version", runtime.packVersion || "—"],
        ["World revision", displayNumber(runtime.revision)],
        ["Initialized", displayTime(runtime.initializedAt)],
        ["Last updated", displayTime(runtime.updatedAt)],
      ])]
      : [AdminEmptyState({
        title: "World runtime is not initialized",
        message: "No authoritative World runtime metadata was returned for the selected game.",
        compact: true,
      })],
  });
}

export function countrySection(model) {
  const table = AdminDataTable({
    caption: "World countries",
    rows: model.countries,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "countryId",
        label: "Country",
        rowHeader: true,
        render: (value) => titleCase(value),
      },
      { key: "locationCount", label: "Locations", align: "end", render: displayNumber },
      { key: "residencyCount", label: "Residents", align: "end", render: displayNumber },
      {
        key: "pendingResidencyCount",
        label: "Pending moves",
        align: "end",
        render: displayNumber,
      },
      {
        key: "currencies",
        label: "Authoritative currencies",
        render: (value) => Array.isArray(value) && value.length ? value.join(", ") : "—",
      },
    ],
    emptyState: AdminEmptyState({
      title: "No countries observed",
      message: "Country state has not been initialized in the currently available World panels.",
      compact: true,
    }),
  });

  return sectionCard({
    eyebrow: "Countries & regions",
    title: `${displayNumber(model.countries.length)} countries observed`,
    description: "Country membership is derived only from initialized geography, Arrival Class, and residency state.",
    children: [createElement("div", {
      className: "admin-world-route__table admin-world-route__table--countries",
      children: table.element,
    })],
  });
}

export function currencySection(model) {
  const table = AdminDataTable({
    caption: "Authoritative World currencies",
    rows: model.currencies,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "currencyCode",
        label: "Currency",
        rowHeader: true,
      },
      {
        key: "residencyCount",
        label: "Residency records",
        align: "end",
        render: displayNumber,
      },
      {
        key: "journeyCount",
        label: "Travel records",
        align: "end",
        render: displayNumber,
      },
      {
        key: "journeyCostMinor",
        label: "Observed travel cost",
        align: "end",
        render: displayMinor,
      },
    ],
    emptyState: AdminEmptyState({
      title: "No currencies observed",
      message: "The current World contract returned no residency or travel currency codes.",
      compact: true,
    }),
  });

  return sectionCard({
    eyebrow: "Currency supervision",
    title: `${displayNumber(model.currencies.length)} authoritative currencies`,
    description: "Currency codes are read-only here because the current World Admin contract exposes no currency or FX mutation endpoint.",
    children: [createElement("div", {
      className: "admin-world-route__table admin-world-route__table--currencies",
      children: table.element,
    })],
  });
}
