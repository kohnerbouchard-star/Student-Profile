import {
  AdminDataTable,
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
import { BusinessSupervisionView } from "./BusinessSupervisionView.js";

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
      metric("Active", number(model.summary.activeCount), "Recorded Business status"),
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
          detailLine("Country", business.countryCode || "Not available"),
          detailLine("Operational readiness", titleCase(business.operationalReadiness)),
          detailLine("Attention flags", business.attentionFlags.length ? business.attentionFlags.map((value) => titleCase(value)).join(", ") : "None"),
          detailLine("Capitalization", amount(business.capitalization, business.currencyCode)),
          detailLine("Reputation", number(business.reputationScore)),
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
            text: "Identity and attention indicators are not cached profit or valuation. Financial evidence is separated by currency and source; ownership is shown without private Player identifiers.",
          }),
        ],
      }),
      BusinessSupervisionView(business.supervision),
    ],
  });
}

function loadingDetail(business) {
  return createElement("div", {
    attrs: { role: "status", "aria-label": `Loading ${business.legalName}` },
    children: [AdminSkeleton({ label: "Loading authoritative Business detail", count: 6, shape: "row" })],
  });
}

function detailError(error, retry) {
  return AdminErrorState({
    title: "Business detail could not be loaded",
    message: error?.userMessage || "The authoritative Business detail is temporarily unavailable.",
    requestId: error?.requestId,
    retryAfterSeconds: error?.retryAfterSeconds,
    retry: error?.retryable ? { label: "Retry detail", onClick: retry } : null,
  });
}

function catalog({ model, filters, onFiltersChange, onDetail }) {
  const search = AdminField({ name: "search", label: "Search businesses", type: "search", placeholder: "Business, industry, country", autocomplete: "off", value: filters.query, prefix: AdminIcon({ name: "search", size: 16 }) });
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
      { key: "industryCode", label: "Industry", render: (value) => value || "—" },
      { key: "countryCode", label: "Country", render: (value) => value || "—" },
      { key: "operationalReadiness", label: "Readiness", render: (value) => titleCase(value) },
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
      const searchable = [business.legalName, business.industryCode, business.countryCode, business.businessKey].join(" ").toLowerCase();
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
  if (model.truncated) root.append(createElement("p", { attrs: { role: "status" }, text: "Showing the first 2,000 businesses. Summary counts and filters cover only these rows; additional businesses exist." }));
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
  onLoadDetail = async (business) => business,
} = {}) {
  let detailDrawer = null;
  let selectedBusiness = null;
  let detailSequence = 0;
  let destroyed = false;

  function setDetailContent(content) {
    if (!detailDrawer) return;
    const replacesFocus = detailDrawer.body.contains(document.activeElement);
    detailDrawer.setContent(content);
    // Removing the focused Retry button otherwise leaves focus on document.body.
    if (replacesFocus && detailDrawer.isOpen()) detailDrawer.panel.focus({ preventScroll: true });
  }

  async function loadDetailIntoDrawer(business) {
    const sequence = ++detailSequence;
    selectedBusiness = business;
    setDetailContent(loadingDetail(business));
    try {
      const detail = await onLoadDetail(business);
      if (destroyed || sequence !== detailSequence || selectedBusiness !== business || !detailDrawer?.isOpen()) return;
      setDetailContent(detailContent(detail));
    } catch (error) {
      if (destroyed || sequence !== detailSequence || selectedBusiness !== business || !detailDrawer?.isOpen()) return;
      setDetailContent(detailError(error, () => loadDetailIntoDrawer(business)));
    }
  }

  function openDetail(business, opener) {
    detailDrawer?.destroy();
    selectedBusiness = business;
    detailDrawer = AdminDrawer({
      title: business.legalName,
      description: "Read-only, game-scoped authoritative Business detail.",
      size: "large",
      protectUnsavedChanges: false,
      content: loadingDetail(business),
      onClose() {
        detailSequence += 1;
        selectedBusiness = null;
      },
    });
    detailDrawer.open(opener);
    void loadDetailIntoDrawer(business);
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
    const content = catalog({ model: state.data, filters, onFiltersChange, onDetail: openDetail });
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
    description: "Review authoritative Business identity and operational readiness. This supervision surface is read-only.",
    actions: [refreshButton],
    content: route,
  });

  return {
    ...page,
    destroy() {
      destroyed = true;
      detailSequence += 1;
      detailDrawer?.destroy();
      detailDrawer = null;
      selectedBusiness = null;
    },
  };
}
