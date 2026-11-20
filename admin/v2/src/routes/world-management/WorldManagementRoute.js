import {
  AdminConfirmDialog,
  AdminEmptyState,
  AdminErrorState,
  AdminIcon,
  AdminPageFrame,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { WorldManagementSkeleton } from "./WorldManagementSkeleton.js";
import { actionButton } from "./WorldViewHelpers.js";
import { countrySection, currencySection, failedPanelNotice, summary, worldConfiguration } from "./WorldOverviewPanels.js";
import { arrivalsSection, campaignSection, effectsSection } from "./WorldCampaignPanels.js";
import { geographySection, residencySection, travelSection } from "./WorldGeographyPanels.js";

function resolvedContent(model, handlers, mutationsDisabled) {
  let pendingAction = null;
  const confirm = AdminConfirmDialog({
    title: "Confirm World operation",
    message: "Apply this authoritative World change?",
    detail: "The operation is revision checked and audited.",
    confirmLabel: "Apply change",
    failureMessage: "The World operation could not be applied. Refresh authoritative state and try again.",
    async onConfirm() {
      const result = await pendingAction?.();
      if (result?.ok !== true) throw new Error("WORLD_MUTATION_FAILED");
      pendingAction = null;
      return true;
    },
  });

  function onReviewedAction({ opener, title, message, detail, action }) {
    pendingAction = action;
    confirm.setTitle(title);
    confirm.setMessage(message);
    confirm.setDetail(detail);
    void confirm.open(opener).then(() => {
      pendingAction = null;
    });
  }
  onReviewedAction.handlers = handlers;

  const root = createElement("div", {
    className: "admin-world-route__resolved",
    children: [
      summary(model),
      failedPanelNotice(model),
      createElement("nav", {
        className: "admin-world-route__local-nav",
        attrs: { "aria-label": "World Management sections" },
        children: [
          ["Configuration", "world-configuration"],
          ["Campaign", "world-campaign"],
          ["Effects", "world-effects"],
          ["Geography", "world-geography"],
          ["Travel & residency", "world-travel"],
        ].map(([label, id]) => createElement("a", { attrs: { href: `#${id}` }, text: label })),
      }),
      worldConfiguration(model),
      countrySection(model),
      currencySection(model),
      campaignSection(model, { mutationsDisabled, onReviewedAction }),
      effectsSection(model, { mutationsDisabled, onReviewedAction }),
      arrivalsSection(model, { mutationsDisabled, onReviewedAction }),
      geographySection(model, { mutationsDisabled, onReviewedAction }),
      travelSection(model),
      residencySection(model),
    ],
  });

  return {
    element: root,
    destroy() {
      pendingAction = null;
      confirm.destroy();
    },
  };
}

/** Renders source-owned World Management from the shared Admin V2 data-state contract. */
export function WorldManagementRoute({
  state,
  onRefresh = async () => {},
  onCampaignAction = async () => ({ ok: false }),
  onRecoverEffect = async () => ({ ok: false }),
  onCorrectArrival = async () => ({ ok: false }),
  onToggleRoute = async () => ({ ok: false }),
} = {}) {
  let destroyed = false;
  let resolved = null;
  const mutationsDisabled = state.status !== ADMIN_DATA_STATES.READY;

  const refreshButton = actionButton({
    label: state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh",
    icon: "refresh",
    quiet: true,
    disabled: state.status === ADMIN_DATA_STATES.REFRESHING,
    action: "refresh",
    onClick: onRefresh,
  });

  const route = createElement("div", {
    className: "admin-world-route",
    dataset: { adminV2State: state.status },
    attrs: {
      "aria-busy": [ADMIN_DATA_STATES.INITIAL_LOADING, ADMIN_DATA_STATES.REFRESHING]
        .includes(state.status),
    },
  });

  if (state.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    route.append(WorldManagementSkeleton());
  } else if (state.status === ADMIN_DATA_STATES.FAILED) {
    route.append(AdminErrorState({
      title: "World Management could not be loaded",
      message: state.error?.userMessage,
      requestId: state.error?.requestId,
      retryAfterSeconds: state.error?.retryAfterSeconds,
      retry: state.error?.retryable
        ? { label: "Retry World Management", onClick: onRefresh }
        : null,
    }));
  } else if (state.data) {
    if (state.status === ADMIN_DATA_STATES.EMPTY) {
      route.append(AdminEmptyState({
        title: "World runtime is not initialized",
        message: "The selected game returned no campaign, geography, travel, residency, or effect state from the authoritative World contracts.",
        action: { label: "Refresh", onClick: onRefresh },
      }));
    } else {
      resolved = resolvedContent(state.data, {
        onCampaignAction,
        onRecoverEffect,
        onCorrectArrival,
        onToggleRoute,
      }, mutationsDisabled);
      if (state.status === ADMIN_DATA_STATES.STALE) {
        route.append(AdminStaleState({
          message: state.error?.userMessage
            || "Showing the last successful World state. Mutations are disabled until a fresh revision is loaded.",
          retry: { label: "Refresh authoritative World", onClick: onRefresh },
          content: resolved.element,
        }));
      } else {
        if (state.status === ADMIN_DATA_STATES.REFRESHING) {
          route.append(createElement("div", {
            className: "admin-world-route__refresh-state",
            attrs: { role: "status" },
            children: [
              AdminIcon({ name: "refresh", size: 17 }),
              "Refreshing authoritative World state; mutations are temporarily disabled.",
            ],
          }));
        }
        route.append(resolved.element);
      }
    }
  }

  const pageFrame = AdminPageFrame({
    eyebrow: "Game administration",
    title: "World Management",
    description: "Manage campaign lifecycle and route availability, review geography/effects, and monitor read-only travel, residency, country, and currency state. News & Events remains a separate monitor.",
    actions: [refreshButton],
    content: route,
  });

  return {
    ...pageFrame,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resolved?.destroy?.();
      resolved = null;
    },
  };
}
