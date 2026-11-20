import { AdminDataTable, AdminEmptyState, AdminField, AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { displayNumber, filterKey, finiteNumber, marketButton, publicRowKey, safeText, titleCase } from "./MarketViewHelpers.js";

function priceCell(value) {
  return createElement("span", {
    className: "admin-market-route__price",
    children: [
      createElement("strong", { text: displayNumber(value) }),
      finiteNumber(value) !== null
        ? createElement("small", { text: "Currency not exposed" })
        : null,
    ],
  });
}

function movementCell(instrument) {
  const change = finiteNumber(instrument?.change);
  const percentage = finiteNumber(instrument?.changePct);
  if (change === null && percentage === null) {
    return createElement("span", {
      className: "admin-market-route__movement",
      dataset: { tone: "unknown" },
      text: "Daily movement unavailable",
    });
  }
  const comparison = percentage ?? change;
  const tone = comparison > 0 ? "positive" : comparison < 0 ? "negative" : "flat";
  const label = tone === "positive" ? "Up" : tone === "negative" ? "Down" : "Flat";
  const parts = [label];
  if (change !== null) parts.push(displayNumber(change, { sign: true }));
  if (percentage !== null) {
    const sign = percentage > 0 ? "+" : percentage < 0 ? "−" : "";
    parts.push(`(${sign}${displayNumber(Math.abs(percentage))}%)`);
  }
  return createElement("span", {
    className: "admin-market-route__movement",
    dataset: { tone },
    text: parts.join(" "),
  });
}

function listingCell(value) {
  const state = ["active", "inactive", "recent"].includes(String(value)) ? String(value) : "unknown";
  return createElement("span", {
    className: "admin-market-route__listing-state",
    dataset: { status: state },
    text: `${titleCase(state)} marker`,
  });
}

function instrumentCopy(instrument) {
  return createElement("div", {
    className: "admin-market-route__instrument-copy",
    children: [
      createElement("code", { text: safeText(instrument.symbol, "Symbol unavailable", 24) }),
      createElement("strong", { text: safeText(instrument.name, "Instrument name unavailable", 240) }),
      instrument.description
        ? createElement("small", { text: safeText(instrument.description, "", 320) })
        : null,
    ],
  });
}

function selectOptions(values, allLabel) {
  const seen = new Set();
  const options = [{ value: "all", label: allLabel }];
  for (const rawValue of values || []) {
    const label = safeText(rawValue, "", 160);
    const value = filterKey(label);
    if (!label || !value || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label });
  }
  return options;
}

function normalizedFilter(value, options) {
  const candidate = filterKey(value) || "all";
  return options.some((option) => option.value === candidate) ? candidate : "all";
}

export function instrumentDirectory({ model, filters, onFiltersChange, onOpenDetail }) {
  const sectorOptions = selectOptions(model.sectors, "All sectors");
  const countryOptions = selectOptions(model.countries, "All countries");
  const typeOptions = [
    { value: "all", label: "All asset types" },
    { value: "stock", label: "Stock" },
    { value: "unknown", label: "Type unavailable" },
  ];
  const statusOptions = [
    { value: "all", label: "All listing markers" },
    { value: "active", label: "Active marker" },
    { value: "inactive", label: "Inactive marker" },
    { value: "recent", label: "Recent marker" },
    { value: "unknown", label: "Marker unavailable" },
  ];

  const search = AdminField({
    name: "market-search",
    label: "Search Market instruments",
    type: "search",
    placeholder: "Symbol, name, sector, type, or country",
    autocomplete: "off",
    value: safeText(filters?.query, "", 160),
    prefix: AdminIcon({ name: "search", size: 16 }),
  });
  const sector = AdminField({
    name: "market-sector",
    label: "Sector",
    type: "select",
    value: normalizedFilter(filters?.sector, sectorOptions),
    options: sectorOptions,
  });
  const type = AdminField({
    name: "market-type",
    label: "Asset type",
    type: "select",
    value: normalizedFilter(filters?.type, typeOptions),
    options: typeOptions,
  });
  const status = AdminField({
    name: "market-status",
    label: "Listing marker",
    type: "select",
    value: normalizedFilter(filters?.status, statusOptions),
    options: statusOptions,
  });
  const country = AdminField({
    name: "market-country",
    label: "Country",
    type: "select",
    value: normalizedFilter(filters?.country, countryOptions),
    options: countryOptions,
  });

  const controls = createElement("section", {
    className: "admin-market-route__controls",
    attrs: { "aria-label": "Market instrument filters" },
    children: [search.element, sector.element, type.element, status.element, country.element],
  });

  const table = AdminDataTable({
    caption: "Listed financial Market instruments",
    rowKey: publicRowKey,
    columns: [
      {
        key: "name",
        label: "Instrument",
        rowHeader: true,
        render: (_value, instrument) => instrumentCopy(instrument),
      },
      { key: "type", label: "Asset type", render: (value) => titleCase(value, "Type unavailable") },
      { key: "sector", label: "Sector", render: (value) => safeText(value, "Not available", 160) },
      { key: "countryCode", label: "Country", render: (value) => safeText(value, "Not available", 80) },
      { key: "currentPrice", label: "Current price", align: "end", render: priceCell },
      { key: "change", label: "Daily movement", align: "end", render: (_value, instrument) => movementCell(instrument) },
      { key: "status", label: "Listing marker", render: listingCell },
      {
        key: "detail",
        label: "Detail",
        align: "end",
        render: (_value, instrument) => marketButton({
          label: "View details",
          icon: "chevronRight",
          quiet: true,
          action: "detail",
          onClick(event) { onOpenDetail(instrument, event.currentTarget); },
        }),
      },
    ],
    emptyState: AdminEmptyState({
      title: "No instruments match",
      message: "Try changing the Market search or filters.",
      compact: true,
    }),
  });

  function selectedFilters() {
    return Object.freeze({
      query: search.getValue().trimStart().slice(0, 160),
      sector: sector.getValue(),
      type: type.getValue(),
      status: status.getValue(),
      country: country.getValue(),
    });
  }

  function applyFilters({ publish = true } = {}) {
    const selected = selectedFilters();
    const query = selected.query.trim().toLocaleLowerCase();
    const visible = model.instruments.filter((instrument) => {
      const searchable = [
        instrument.symbol,
        instrument.name,
        instrument.sector,
        instrument.type,
        instrument.countryCode,
      ]
        .map((value) => safeText(value, "", 240))
        .join(" ")
        .toLocaleLowerCase();
      return (!query || searchable.includes(query))
        && (selected.sector === "all" || filterKey(instrument.sector) === selected.sector)
        && (selected.type === "all" || filterKey(instrument.type || "unknown") === selected.type)
        && (selected.status === "all" || filterKey(instrument.status || "unknown") === selected.status)
        && (selected.country === "all" || filterKey(instrument.countryCode) === selected.country);
    });
    table.setRows(visible);
    if (publish) onFiltersChange(selected);
  }

  function updateFilters(nextFilters = {}) {
    search.setValue(safeText(nextFilters.query, "", 160));
    sector.setValue(normalizedFilter(nextFilters.sector, sectorOptions));
    type.setValue(normalizedFilter(nextFilters.type, typeOptions));
    status.setValue(normalizedFilter(nextFilters.status, statusOptions));
    country.setValue(normalizedFilter(nextFilters.country, countryOptions));
    applyFilters({ publish: false });
  }

  search.control.addEventListener("input", applyFilters);
  sector.control.addEventListener("change", applyFilters);
  type.control.addEventListener("change", applyFilters);
  status.control.addEventListener("change", applyFilters);
  country.control.addEventListener("change", applyFilters);
  applyFilters({ publish: false });

  const section = createElement("section", {
    className: "admin-market-route__catalog",
    attrs: { "aria-labelledby": "admin-market-instrument-directory" },
    children: [
      createElement("header", {
        className: "admin-market-route__section-head",
        children: [
          createElement("div", {
            children: [
              createElement("span", { text: "Authoritative directory" }),
              createElement("h2", { attrs: { id: "admin-market-instrument-directory" }, text: "Listed instruments" }),
            ],
          }),
          createElement("p", { text: `${displayNumber(model.instruments.length, { integer: true })} records` }),
        ],
      }),
      controls,
      model.isEmpty
        ? AdminEmptyState({
          title: "No financial instruments are listed",
          message: "The authoritative Market directory returned no instruments for the selected game.",
        })
        : table.element,
    ],
  });
  return Object.freeze({ element: section, updateFilters });
}
