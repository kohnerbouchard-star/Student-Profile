import { AdminErrorState, AdminIcon, AdminPageFrame, AdminStaleState } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { CraftingSkeleton } from "./CraftingSkeleton.js";
import { recoveryDialog, supplyDialog } from "./CraftingDialogs.js";
import { jobsPanel } from "./CraftingJobsPanel.js";
import { boundaryPanel, effectsPanel, integrityPanel, packPanel, recipesPanel, summary, supplyPanel } from "./CraftingOversightPanels.js";
import { routeButton } from "./CraftingViewHelpers.js";

function resolvedContent({ model, filters, onFiltersChange, onRecover, onAdjustSupply }) {
  return createElement("div", {
    className: "admin-crafting-route__resolved",
    children: [
      summary(model),
      boundaryPanel(),
      packPanel(model),
      recipesPanel(model),
      jobsPanel({ model, filters, onFiltersChange, onRecover }),
      supplyPanel(model, onAdjustSupply),
      effectsPanel(model),
      integrityPanel(model),
    ],
  });
}

/** Renders source-owned Admin UI V2 Crafting supervision. */
export function CraftingRoute({
  state,
  filters = { query: "", status: "all" },
  onFiltersChange = () => {},
  onRefresh = async () => {},
  onRecover = async () => ({ ok: false }),
  onApplySupply = async () => ({ ok: false }),
} = {}) {
  let destroyed = false;
  const dialogs = new Set();

  function forgetDialog(dialog) {
    dialogs.delete(dialog);
  }

  function openRecovery(job, outcome, opener) {
    if (destroyed) return;
    const dialog = recoveryDialog({
      job,
      outcome,
      opener,
      onRecover,
      onDestroyed: forgetDialog,
    });
    dialogs.add(dialog);
  }

  function openSupply(item, opener) {
    if (destroyed) return;
    const dialog = supplyDialog({
      item,
      opener,
      onApplySupply,
      onDestroyed: forgetDialog,
    });
    dialogs.add(dialog);
  }

  const refreshButton = routeButton({
    label: state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh",
    icon: "refresh",
    quiet: true,
    action: "refresh",
    disabled: state.status === ADMIN_DATA_STATES.REFRESHING,
    onClick: onRefresh,
  });
  const supplyButton = routeButton({
    label: "Supply state",
    icon: "settings",
    action: "supply",
    onClick(event) { openSupply(null, event.currentTarget); },
  });

  const route = createElement("div", {
    className: "admin-crafting-route",
    dataset: { adminV2State: state.status },
    attrs: {
      "aria-busy": [ADMIN_DATA_STATES.INITIAL_LOADING, ADMIN_DATA_STATES.REFRESHING].includes(state.status),
    },
  });

  if (state.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    route.append(CraftingSkeleton());
  } else if (state.status === ADMIN_DATA_STATES.FAILED) {
    route.append(AdminErrorState({
      title: "Crafting supervision could not be loaded",
      message: state.error?.userMessage,
      requestId: state.error?.requestId,
      retryAfterSeconds: state.error?.retryAfterSeconds,
      retry: state.error?.retryable ? { label: "Retry Crafting", onClick: onRefresh } : null,
    }));
  } else if (state.data) {
    const content = resolvedContent({
      model: state.data,
      filters,
      onFiltersChange,
      onRecover: openRecovery,
      onAdjustSupply: openSupply,
    });
    if (state.status === ADMIN_DATA_STATES.STALE) {
      route.append(AdminStaleState({
        message: state.error?.userMessage || "Showing the last successful Crafting oversight data while the service recovers.",
        retry: { label: "Retry", onClick: onRefresh },
        content,
      }));
    } else {
      if (state.status === ADMIN_DATA_STATES.REFRESHING) {
        route.append(createElement("div", {
          className: "admin-crafting-route__refresh-state",
          attrs: { role: "status" },
          children: [AdminIcon({ name: "refresh", size: 17 }), "Refreshing authoritative Crafting data…"],
        }));
      }
      route.append(content);
    }
  }

  const pageFrame = AdminPageFrame({
    eyebrow: "Physical economy",
    title: "Crafting Operations",
    description: "Review Crafting jobs, manage game supply overrides, inspect effects, and recover failed jobs. Recipe definitions and player-owned Inventory remain read-only here.",
    actions: [supplyButton, refreshButton],
    content: route,
  });

  return {
    ...pageFrame,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      [...dialogs].forEach((dialog) => dialog.destroy());
      dialogs.clear();
    },
  };
}
