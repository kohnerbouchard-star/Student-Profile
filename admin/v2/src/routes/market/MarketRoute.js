import {
  AdminDrawer,
  AdminErrorState,
  AdminIcon,
  AdminPageFrame,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { MarketInstrumentDetail } from "./MarketInstrumentDetail.js";
import { MarketSkeleton } from "./MarketSkeleton.js";
import { marketButton, publicRowKey, safeText } from "./MarketViewHelpers.js";
import { instrumentDirectory } from "./MarketInstrumentDirectory.js";
import { marketEventsPanel, recentTradesPanel, sessionContractNotice, summary } from "./MarketActivityPanels.js";

function resolvedMarket(model, options) {
  const directory = instrumentDirectory({ model, ...options });
  return Object.freeze({
    element: createElement("div", {
      className: "admin-market-route__resolved",
      children: [
        summary(model),
        sessionContractNotice(),
        directory.element,
        createElement("div", {
          className: "admin-market-route__activity-grid",
          children: [recentTradesPanel(model, options.onRefresh), marketEventsPanel(model, options.onRefresh)],
        }),
      ],
    }),
    updateFilters: directory.updateFilters,
  });
}

/** Composes the read-only financial Market route from the six-state contract. */
export function MarketRoute({
  state,
  filters = { query: "", sector: "all", type: "all", status: "all", country: "all" },
  detailState = {},
  selectedRowKey = "",
  onFiltersChange = () => {},
  onSelect = null,
  onRefresh = async () => {},
  loadDetail = null,
} = {}) {
  let destroyed = false;
  let directory = null;
  let drawer = null;
  let currentInstrument = null;
  let currentRowKey = "";
  let currentDetailState = detailState;
  let activeSelectedRowKey = safeText(selectedRowKey, "", 24);
  const requestDetail = typeof loadDetail === "function" ? loadDetail : onSelect;

  function detailFor(rowKey) {
    if (currentDetailState?.data?.rowKey === rowKey || activeSelectedRowKey === rowKey) {
      return currentDetailState;
    }
    return { status: ADMIN_DATA_STATES.INITIAL_LOADING, data: null, error: null };
  }

  function renderDrawerContent() {
    if (!drawer || !currentInstrument) return;
    drawer.setTitle(`${safeText(currentInstrument.symbol, "Instrument", 24)} instrument detail`);
    drawer.setDescription("Authoritative profile, price history, and supported financial signals.");
    drawer.setContent(MarketInstrumentDetail({
      instrument: currentInstrument,
      detailState: detailFor(currentRowKey),
      onRetry: typeof requestDetail === "function" ? () => requestDetail(currentRowKey) : null,
    }));
  }

  function ensureDrawer() {
    if (drawer) return drawer;
    drawer = AdminDrawer({
      title: "Instrument detail",
      description: "Authoritative Market instrument detail.",
      content: createElement("div"),
      size: "large",
      closeLabel: "Close instrument detail",
      onClose() {
        if (drawer) drawer.panel.dataset.open = "false";
      },
    });
    drawer.element.dataset.marketDrawer = "instrument-detail";
    drawer.panel.dataset.open = "false";
    return drawer;
  }

  function openDetail(instrument, opener) {
    if (destroyed) return;
    const rowKey = publicRowKey(instrument, 0);
    currentInstrument = instrument;
    currentRowKey = rowKey;
    activeSelectedRowKey = rowKey;
    currentDetailState = { status: ADMIN_DATA_STATES.INITIAL_LOADING, data: null, error: null };
    const activeDrawer = ensureDrawer();
    renderDrawerContent();
    activeDrawer.panel.dataset.open = "true";
    activeDrawer.open(opener);
    if (typeof requestDetail === "function") {
      try {
        void Promise.resolve(requestDetail(rowKey, opener)).catch(() => {});
      } catch (_error) {
        // Controller-owned error normalization publishes the safe failure state.
      }
    }
  }

  const refreshButton = marketButton({
    label: state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh",
    icon: "refresh",
    quiet: true,
    action: "refresh",
    disabled: state.status === ADMIN_DATA_STATES.REFRESHING,
    onClick: onRefresh,
  });
  const route = createElement("div", {
    className: "admin-market-route",
    dataset: { adminV2State: state.status },
    attrs: {
      "aria-busy": [ADMIN_DATA_STATES.INITIAL_LOADING, ADMIN_DATA_STATES.REFRESHING].includes(state.status),
    },
  });

  if (state.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    route.append(MarketSkeleton());
  } else if (state.status === ADMIN_DATA_STATES.FAILED) {
    route.append(AdminErrorState({
      title: "Market Monitor could not be loaded",
      message: safeText(
        state.error?.userMessage,
        "Authoritative Market data is temporarily unavailable.",
        360,
      ),
      retryAfterSeconds: Number.isSafeInteger(state.error?.retryAfterSeconds)
        ? state.error.retryAfterSeconds
        : null,
      retry: state.error?.retryable ? { label: "Retry Market", onClick: onRefresh } : null,
    }));
  } else if (state.data) {
    directory = resolvedMarket(state.data, {
      filters,
      onFiltersChange,
      onOpenDetail: openDetail,
      onRefresh,
    });
    if (state.status === ADMIN_DATA_STATES.STALE) {
      route.append(AdminStaleState({
        message: safeText(
          state.error?.userMessage,
          "Showing the last authoritative Market data while the service recovers.",
          360,
        ),
        retry: { label: "Retry", onClick: onRefresh },
        content: directory.element,
      }));
    } else {
      if (state.status === ADMIN_DATA_STATES.REFRESHING) {
        route.append(createElement("div", {
          className: "admin-market-route__refresh-state",
          attrs: { role: "status" },
          children: [AdminIcon({ name: "refresh", size: 17 }), "Refreshing authoritative Market data…"],
        }));
      }
      route.append(directory.element);
    }
  }

  const pageFrame = AdminPageFrame({
    eyebrow: "Game administration",
    title: "Market Monitor",
    description: "Monitor listed instruments, price movement, aggregate activity, and market events. This route is read-only until a supported market-control mutation exists.",
    actions: refreshButton,
    content: route,
  });

  return {
    ...pageFrame,
    updateFilters(nextFilters) {
      directory?.updateFilters(nextFilters);
    },
    updateDetail(nextDetailState, nextSelectedRowKey = "") {
      if (destroyed) return;
      currentDetailState = nextDetailState || {};
      const nextRowKey = safeText(nextSelectedRowKey, "", 24);
      if (nextRowKey) activeSelectedRowKey = nextRowKey;
      if (!drawer?.isOpen() || (nextRowKey && nextRowKey !== currentRowKey)) return;
      const nextProfile = nextDetailState?.data?.profile;
      if (nextProfile?.rowKey === currentRowKey) currentInstrument = nextProfile;
      renderDrawerContent();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      drawer?.destroy();
      drawer = null;
      currentInstrument = null;
      currentRowKey = "";
    },
  };
}
