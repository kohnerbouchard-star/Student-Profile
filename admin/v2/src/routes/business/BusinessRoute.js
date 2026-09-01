import {
  AdminDataTable,
  AdminDialog,
  AdminDrawer,
  AdminEmptyState,
  AdminErrorState,
  AdminField,
  AdminIcon,
  AdminPageFrame,
  AdminSkeleton,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";

function titleCase(value, fallback = "Not available") {
  const text = String(value || "").trim();
  return text ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
}

function number(value, options = {}) {
  return Number.isFinite(value) ? value.toLocaleString("en-US", options) : "—";
}

function amount(value, currencyCode) {
  if (!Number.isFinite(value)) return "—";
  const formatted = value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return currencyCode ? `${formatted} ${currencyCode}` : formatted;
}

function dateTime(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp))
    : "Not available";
}

function metric(label, value, detail) {
  return createElement("article", {
    className: "admin-business-route__metric",
    children: [
      createElement("span", { text: label }),
      createElement("output", { text: value }),
      createElement("small", { text: detail }),
    ],
  });
}

function summary(model) {
  return createElement("section", {
    className: "admin-business-route__summary",
    attrs: { "aria-label": "Business summary" },
    children: [
      metric("Businesses", number(model.summary.totalCount), "Current game"),
      metric("Active", number(model.summary.activeCount), "Operating normally"),
      metric("Needs attention", number(model.summary.attentionCount), "Distressed or restructuring"),
      metric("Avg. reputation", number(model.summary.averageReputation), "0–100 when available"),
    ],
  });
}

function button({ label, icon, quiet = false, onClick, disabled = false, action }) {
  const element = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button", disabled },
    dataset: { businessAction: action },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  element.addEventListener("click", onClick);
  return element;
}

function detailLine(label, value) {
  return createElement("div", {
    children: [
      createElement("dt", { text: label }),
      createElement("dd", { text: value }),
    ],
  });
}

function detailContent(business) {
  return createElement("div", {
    className: "admin-business-detail",
    children: [
      createElement("section", {
        className: "admin-business-detail__hero",
        children: [
          createElement("div", { children: [
            createElement("span", { text: business.businessKey }),
            createElement("h3", { text: business.legalName }),
            createElement("p", { text: `${titleCase(business.entityType)} · ${business.industryCode || "Industry unavailable"}` }),
          ] }),
          createElement("span", {
            className: "admin-business-route__status",
            dataset: { status: business.status || "unknown" },
            text: titleCase(business.status),
          }),
        ],
      }),
      createElement("dl", {
        className: "admin-business-detail__grid",
        children: [
          detailLine("Owner", business.owner.displayName),
          detailLine("Roster label", business.owner.rosterLabel || "Not available"),
          detailLine("Owner status", titleCase(business.owner.status)),
          detailLine("Country", business.countryCode || "Not available"),
          detailLine("Capitalization", amount(business.capitalization, business.currencyCode)),
          detailLine("Reputation", number(business.reputationScore)),
          detailLine("Capacity units", number(business.capacityUnits)),
          detailLine("Failure count", number(business.failureCount)),
          detailLine("Created", dateTime(business.createdAt)),
          detailLine("Updated", dateTime(business.updatedAt)),
          detailLine("Closed", business.closedAt ? dateTime(business.closedAt) : "Not closed"),
        ],
      }),
      createElement("aside", {
        className: "admin-business-detail__contract-note",
        children: [
          AdminIcon({ name: "info", size: 18 }),
          createElement("p", {
            text: "This view uses the current Business Admin contract only. Inventory, products, production runs, employees, and transactions are not reconstructed from database tables when no Business Admin read contract exposes them.",
          }),
        ],
      }),
    ],
  });
}

function complianceForm({ business, onSubmit, onCancel }) {
  const requirementKey = AdminField({
    name: "requirementKey",
    label: "Existing compliance requirement key",
    type: "text",
    placeholder: "operating-license",
    autocomplete: "off",
    minLength: 2,
    maxLength: 120,
    hint: "Use an existing requirement key. The current Business read model does not expose a requirement catalog, so this screen will not invent one.",
  });
  const requirementType = AdminField({
    name: "requirementType",
    label: "Requirement type",
    type: "select",
    value: "license",
    options: [
      { value: "license", label: "License" },
      { value: "tax", label: "Tax" },
      { value: "regulation", label: "Regulation" },
    ],
  });
  const status = AdminField({
    name: "status",
    label: "Compliance status",
    type: "select",
    value: "approved",
    options: [
      { value: "pending", label: "Pending" },
      { value: "approved", label: "Approved" },
      { value: "suspended", label: "Suspended" },
      { value: "expired", label: "Expired" },
      { value: "waived", label: "Waived" },
    ],
  });
  const feeAmount = AdminField({ name: "feeAmount", label: `Fee amount${business.currencyCode ? ` (${business.currencyCode})` : ""}`, type: "number", value: "0", min: 0, max: 10_000_000, step: 0.01, inputMode: "decimal" });
  const expiresAt = AdminField({ name: "expiresAt", label: "Expiration (optional)", type: "datetime-local" });
  const reason = AdminField({ name: "reason", label: "Reason", type: "textarea", placeholder: "Explain the administrative compliance decision." });
  const error = createElement("p", { className: "admin-business-compliance__error", attrs: { role: "alert" } });
  error.hidden = true;

  const form = createElement("form", {
    className: "admin-business-compliance",
    children: [requirementKey.element, requirementType.element, status.element, feeAmount.element, expiresAt.element, reason.element, error],
  });
  const cancel = button({ label: "Cancel", quiet: true, action: "cancel-compliance", onClick: onCancel });
  const save = button({ label: "Save compliance", icon: "success", action: "save-compliance", onClick() { form.requestSubmit(); } });
  const footer = createElement("div", { className: "admin-business-compliance__footer", children: [cancel, save] });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    const key = requirementKey.getValue().trim();
    const reasonText = reason.getValue().trim();
    const fee = Number(feeAmount.getValue());
    if (key.length < 2 || key.length > 120 || reasonText.length < 2 || reasonText.length > 1000 || !Number.isFinite(fee) || fee < 0 || fee > 10_000_000) {
      error.textContent = "Review the requirement key, reason, and fee amount.";
      error.hidden = false;
      return;
    }
    const expiration = expiresAt.getValue().trim();
    const input = {
      requirementKey: key,
      requirementType: requirementType.getValue(),
      status: status.getValue(),
      feeAmount: fee,
      expiresAt: expiration ? new Date(expiration).toISOString() : null,
      reason: reasonText,
    };
    save.disabled = true;
    cancel.disabled = true;
    const result = await onSubmit(input);
    if (result?.ok !== true) {
      save.disabled = false;
      cancel.disabled = false;
      error.textContent = result?.error?.userMessage || "Compliance could not be updated.";
      error.hidden = false;
    }
  });

  return { element: form, footer, initialFocus: requirementKey.control };
}

function catalog({ model, filters, onFiltersChange, onDetail, onCompliance }) {
  const search = AdminField({ name: "search", label: "Search businesses", type: "search", placeholder: "Business, owner, industry, country", autocomplete: "off", value: filters.query, prefix: AdminIcon({ name: "search", size: 16 }) });
  const status = AdminField({
    name: "status",
    label: "Status",
    type: "select",
    value: filters.status,
    options: [{ value: "all", label: "All statuses" }, ...model.statuses.map((value) => ({ value, label: titleCase(value) }))],
  });
  const country = AdminField({
    name: "country",
    label: "Country",
    type: "select",
    value: filters.country,
    options: [{ value: "all", label: "All countries" }, ...model.countries.map((value) => ({ value, label: value }))],
  });
  const controls = createElement("section", { className: "admin-business-route__controls", attrs: { "aria-label": "Business filters" }, children: [search.element, status.element, country.element] });

  const table = AdminDataTable({
    caption: "Player businesses",
    rowKey: (business) => business.rowKey,
    columns: [
      {
        key: "legalName",
        label: "Business",
        rowHeader: true,
        render: (_value, business) => createElement("div", {
          className: "admin-business-route__identity",
          children: [createElement("strong", { text: business.legalName }), createElement("small", { text: `${titleCase(business.entityType)} · ${business.businessKey}` })],
        }),
      },
      {
        key: "owner",
        label: "Owner",
        render: (owner) => createElement("div", { className: "admin-business-route__owner", children: [createElement("span", { text: owner.displayName }), owner.rosterLabel ? createElement("small", { text: owner.rosterLabel }) : null] }),
      },
      { key: "industryCode", label: "Industry", render: (value) => value || "—" },
      { key: "countryCode", label: "Country", render: (value) => value || "—" },
      {
        key: "status",
        label: "Status",
        render: (value) => createElement("span", { className: "admin-business-route__status", dataset: { status: value || "unknown" }, text: titleCase(value) }),
      },
      { key: "capitalization", label: "Capitalization", align: "end", render: (value, business) => amount(value, business.currencyCode) },
      { key: "reputationScore", label: "Reputation", align: "end", render: (value) => number(value) },
      {
        key: "actions",
        label: "Actions",
        align: "end",
        render: (_value, business) => createElement("div", {
          className: "admin-business-route__actions",
          children: [
            button({ label: "Details", icon: "overview", quiet: true, action: "details", onClick(event) { onDetail(business, event.currentTarget); } }),
            button({ label: "Compliance", icon: "settings", quiet: true, action: "compliance", onClick(event) { onCompliance(business, event.currentTarget); } }),
          ],
        }),
      },
    ],
    emptyState: AdminEmptyState({ title: "No businesses match", message: "Try changing the current search or filters.", compact: true }),
  });

  function applyFilters() {
    const query = search.getValue().trim().toLowerCase();
    const selectedStatus = status.getValue();
    const selectedCountry = country.getValue();
    const visible = model.businesses.filter((business) => {
      const searchable = [business.legalName, business.owner.displayName, business.owner.rosterLabel, business.industryCode, business.countryCode, business.businessKey].join(" ").toLowerCase();
      return (!query || searchable.includes(query))
        && (selectedStatus === "all" || business.status === selectedStatus)
        && (selectedCountry === "all" || business.countryCode === selectedCountry);
    });
    table.setRows(visible);
    onFiltersChange({ query: search.getValue(), status: selectedStatus, country: selectedCountry });
  }

  search.control.addEventListener("input", applyFilters);
  status.control.addEventListener("change", applyFilters);
  country.control.addEventListener("change", applyFilters);
  applyFilters();

  const root = createElement("div", { className: "admin-business-route__resolved", children: [summary(model), controls] });
  root.append(model.isEmpty
    ? AdminEmptyState({ title: "No businesses yet", message: "No player business entities exist in the current game." })
    : createElement("section", { className: "admin-business-route__catalog", attrs: { "aria-label": "Business directory" }, children: table.element }));
  return root;
}

export function BusinessRoute({
  state,
  filters = { query: "", status: "all", country: "all" },
  onFiltersChange = () => {},
  onRefresh = async () => {},
  onCompliance = async () => ({ ok: false }),
} = {}) {
  let detailDrawer = null;
  let complianceDialog = null;

  function openDetail(business, opener) {
    detailDrawer?.destroy();
    detailDrawer = AdminDrawer({
      title: business.legalName,
      description: "Authoritative Business entity details for the selected game.",
      size: "large",
      content: detailContent(business),
    });
    detailDrawer.open(opener);
  }

  function openCompliance(business, opener) {
    complianceDialog?.destroy();
    let dialog;
    const form = complianceForm({
      business,
      onCancel() { dialog.close("cancelled"); },
      async onSubmit(input) {
        dialog.setBusy(true);
        const result = await onCompliance(business, input);
        if (result?.ok === true) dialog.close("saved");
        else dialog.setBusy(false);
        return result;
      },
    });
    dialog = AdminDialog({
      title: "Update business compliance",
      description: `Record an existing compliance requirement for ${business.legalName}.`,
      content: form.element,
      footer: form.footer,
      initialFocus: form.initialFocus,
      size: "medium",
    });
    complianceDialog = dialog;
    dialog.open(opener);
  }

  const refreshButton = button({
    label: state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh",
    icon: "refresh",
    quiet: true,
    action: "refresh",
    disabled: state.status === ADMIN_DATA_STATES.REFRESHING,
    onClick: onRefresh,
  });
  const route = createElement("div", {
    className: "admin-business-route",
    dataset: { adminV2State: state.status },
    attrs: { "aria-busy": [ADMIN_DATA_STATES.INITIAL_LOADING, ADMIN_DATA_STATES.REFRESHING].includes(state.status) },
  });

  if (state.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    route.append(createElement("div", { className: "admin-business-route__loading", children: [AdminSkeleton({ label: "Loading Business summary", count: 4, shape: "card" }), AdminSkeleton({ label: "Loading businesses", count: 7, shape: "row" })] }));
  } else if (state.status === ADMIN_DATA_STATES.FAILED) {
    route.append(AdminErrorState({
      title: "Business could not be loaded",
      message: state.error?.userMessage,
      requestId: state.error?.requestId,
      retryAfterSeconds: state.error?.retryAfterSeconds,
      retry: state.error?.retryable ? { label: "Retry Business", onClick: onRefresh } : null,
    }));
  } else if (state.data) {
    const content = catalog({ model: state.data, filters, onFiltersChange, onDetail: openDetail, onCompliance: openCompliance });
    if (state.status === ADMIN_DATA_STATES.STALE) {
      route.append(AdminStaleState({ message: state.error?.userMessage || "Showing the last successful Business data while the service recovers.", retry: { label: "Retry", onClick: onRefresh }, content }));
    } else {
      if (state.status === ADMIN_DATA_STATES.REFRESHING) {
        route.append(createElement("div", { className: "admin-business-route__refresh-state", attrs: { role: "status" }, children: [AdminIcon({ name: "refresh", size: 17 }), "Refreshing authoritative Business data…"] }));
      }
      route.append(content);
    }
  }

  const page = AdminPageFrame({
    eyebrow: "Game administration",
    title: "Business Oversight",
    description: "Review player businesses and apply the compliance changes currently supported by this surface. Business identity and operating metrics are read-only here.",
    actions: [refreshButton],
    content: route,
  });

  return {
    ...page,
    destroy() {
      detailDrawer?.destroy();
      complianceDialog?.destroy();
      detailDrawer = null;
      complianceDialog = null;
    },
  };
}
