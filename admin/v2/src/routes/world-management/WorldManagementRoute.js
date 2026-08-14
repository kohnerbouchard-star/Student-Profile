import {
  AdminConfirmDialog,
  AdminDataTable,
  AdminEmptyState,
  AdminErrorState,
  AdminIcon,
  AdminPageFrame,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { WORLD_ARRIVAL_CLASS_IDS } from "./WorldManagementApi.js";
import { WorldManagementSkeleton } from "./WorldManagementSkeleton.js";

function titleCase(value, fallback = "Not available") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function displayNumber(value) {
  return Number.isFinite(Number(value))
    ? Number(value).toLocaleString("en-US")
    : "—";
}

function displayMinor(value) {
  return Number.isFinite(Number(value))
    ? Number(value).toLocaleString("en-US")
    : "—";
}

function displayBasisPoints(value) {
  return Number.isFinite(Number(value))
    ? `${(Number(value) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`
    : "—";
}

function displayTime(value) {
  const milliseconds = Date.parse(String(value || ""));
  if (!Number.isFinite(milliseconds)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(milliseconds));
}

function actionButton({
  label,
  icon = null,
  quiet = false,
  danger = false,
  disabled = false,
  disabledReason = "",
  onClick,
  action,
}) {
  const button = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: {
      type: "button",
      disabled,
      title: disabled ? (disabledReason || "This action is currently unavailable.") : null,
      "aria-label": disabled && disabledReason ? `${label}. ${disabledReason}` : label,
    },
    dataset: {
      tone: danger ? "danger" : null,
      worldAction: action || "",
    },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  button.addEventListener("click", onClick);
  return button;
}

function statusPill(value) {
  const normalized = String(value || "unknown").trim().toLowerCase();
  return createElement("span", {
    className: "admin-world-route__status",
    dataset: { status: normalized },
    text: titleCase(normalized),
  });
}

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

function summary(model) {
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

function factGrid(entries) {
  return createElement("dl", {
    className: "admin-world-route__facts",
    children: entries.map(([label, value]) => createElement("div", {
      children: [
        createElement("dt", { text: label }),
        createElement("dd", { text: value || "—" }),
      ],
    })),
  });
}

function sectionCard({ id = "", eyebrow, title, description = "", actions = [], children = [] }) {
  return createElement("section", {
    className: "admin-world-route__section",
    attrs: id ? { id } : {},
    children: [
      createElement("header", {
        className: "admin-world-route__section-header",
        children: [
          createElement("div", {
            className: "admin-world-route__section-copy",
            children: [
              createElement("small", { text: eyebrow }),
              createElement("h2", { text: title }),
              description ? createElement("p", { text: description }) : null,
            ],
          }),
          actions.length
            ? createElement("div", {
              className: "admin-world-route__section-actions",
              children: actions,
            })
            : null,
        ],
      }),
      ...children,
    ],
  });
}

function failedPanelNotice(model) {
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

function worldConfiguration(model) {
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

function countrySection(model) {
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

function currencySection(model) {
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

function campaignSection(model, { mutationsDisabled, onReviewedAction }) {
  const campaign = model.campaign.current;
  const actions = [];
  if (campaign) {
    if (campaign.status === "active") {
      actions.push(actionButton({
        label: "Pause",
        quiet: true,
        disabled: mutationsDisabled || !campaign.campaignId,
        action: "campaign-pause",
        onClick(event) {
          onReviewedAction({
            opener: event.currentTarget,
            title: "Pause World campaign",
            message: `Pause the campaign in ${titleCase(campaign.currentPhase)}?`,
            detail: "This changes the authoritative campaign lifecycle and is revision-checked by the Admin API.",
            action: () => onReviewedAction.handlers.onCampaignAction("pause"),
          });
        },
      }));
    }
    if (campaign.status === "paused") {
      actions.push(actionButton({
        label: "Resume",
        quiet: true,
        disabled: mutationsDisabled || !campaign.campaignId,
        action: "campaign-resume",
        onClick(event) {
          onReviewedAction({
            opener: event.currentTarget,
            title: "Resume World campaign",
            message: `Resume the campaign from ${titleCase(campaign.currentPhase)}?`,
            detail: "The authoritative scheduler can continue only if the campaign revision still matches.",
            action: () => onReviewedAction.handlers.onCampaignAction("resume"),
          });
        },
      }));
    }
    if (campaign.status !== "emergency_disabled") {
      actions.push(actionButton({
        label: "Emergency disable",
        danger: true,
        disabled: mutationsDisabled || !campaign.campaignId,
        action: "campaign-emergency-disable",
        onClick(event) {
          onReviewedAction({
            opener: event.currentTarget,
            title: "Emergency disable campaign",
            message: "Emergency disable the authoritative World campaign?",
            detail: "This is a high-impact lifecycle control. It does not create News or Events and requires the current campaign revision.",
            action: () => onReviewedAction.handlers.onCampaignAction("emergency_disable"),
          });
        },
      }));
    }
  }

  const historyTable = AdminDataTable({
    caption: "World campaign history",
    rows: model.campaign.history,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "eventKey",
        label: "Event",
        rowHeader: true,
        render: (value, row) => titleCase(value || row.toPhase, "World transition"),
      },
      {
        key: "fromPhase",
        label: "Transition",
        render: (_value, row) => `${titleCase(row.fromPhase)} → ${titleCase(row.toPhase)}`,
      },
      { key: "sequence", label: "Sequence", align: "end", render: displayNumber },
      {
        key: "reason",
        label: "Reason",
        render: (value) => value || "No reason recorded",
      },
      {
        key: "occurredAt",
        label: "Occurred",
        render: (value, row) => displayTime(value || row.createdAt),
      },
    ],
    emptyState: AdminEmptyState({
      title: "No campaign history",
      message: "No committed World campaign transitions were returned.",
      compact: true,
    }),
  });

  return sectionCard({
    id: "world-campaign",
    eyebrow: "Simulation lifecycle",
    title: campaign
      ? `${titleCase(campaign.currentPhase)} · ${titleCase(campaign.status)}`
      : "No campaign initialized",
    description: "Only existing pause, resume, and emergency-disable controls are exposed. Manual event/news generation is intentionally excluded.",
    actions,
    children: [
      factGrid([
        ["Campaign revision", campaign ? displayNumber(campaign.revision) : "—"],
        ["Scheduled", campaign ? displayTime(campaign.scheduledAt) : "—"],
        ["Scheduler due", displayNumber(model.campaign.scheduler.due)],
        ["Active campaigns", displayNumber(model.campaign.scheduler.active)],
        ["Paused campaigns", displayNumber(model.campaign.scheduler.paused)],
        ["Emergency disabled", displayNumber(model.campaign.scheduler.emergencyDisabled)],
      ]),
      createElement("div", {
        className: "admin-world-route__table admin-world-route__table--history",
        children: historyTable.element,
      }),
    ],
  });
}

function effectsSection(model, { mutationsDisabled, onReviewedAction }) {
  const table = AdminDataTable({
    caption: "Durable World effects",
    rows: model.effects,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "effectKind",
        label: "Effect",
        rowHeader: true,
        render: (value) => titleCase(value),
      },
      { key: "status", label: "State", render: statusPill },
      { key: "attemptCount", label: "Attempts", align: "end", render: displayNumber },
      {
        key: "lastErrorCode",
        label: "Last error",
        render: (value) => value ? titleCase(value) : "—",
      },
      {
        key: "actions",
        label: "Actions",
        align: "end",
        render: (_value, effect) => {
          if (effect.status !== "failed") return "No action required";
          return actionButton({
            label: "Recover",
            quiet: true,
            disabled: mutationsDisabled || !effect.effectId,
            action: "effect-recover",
            onClick(event) {
              onReviewedAction({
                opener: event.currentTarget,
                title: "Recover failed World effect",
                message: `Retry the failed ${titleCase(effect.effectKind)} effect?`,
                detail: "Recovery uses the existing bounded, idempotent World effect-recovery contract.",
                action: () => onReviewedAction.handlers.onRecoverEffect(effect),
              });
            },
          });
        },
      },
    ],
    emptyState: AdminEmptyState({
      title: "No World effects",
      message: "No durable effect commands were returned for the selected game.",
      compact: true,
    }),
  });

  return sectionCard({
    id: "world-effects",
    eyebrow: "Simulation effects",
    title: `${displayNumber(model.effects.length)} effect commands`,
    description: `${displayNumber(model.summary.failedEffectCount)} failed effects require review. Effect payloads and News content are not displayed here.`,
    children: [createElement("div", {
      className: "admin-world-route__table admin-world-route__table--effects",
      children: table.element,
    })],
  });
}

function arrivalsSection(model, { mutationsDisabled, onReviewedAction }) {
  const table = AdminDataTable({
    caption: "Arrival Class assignments",
    rows: model.arrivals,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "countryId",
        label: "Country",
        rowHeader: true,
        render: (value) => titleCase(value),
      },
      {
        key: "classId",
        label: "Arrival Class",
        render: (value, assignment) => {
          const select = createElement("select", {
            className: "admin-world-route__select",
            attrs: {
              "aria-label": `Arrival Class for ${titleCase(assignment.countryId)}`,
              disabled: mutationsDisabled || !assignment.assignmentId,
            },
          });
          WORLD_ARRIVAL_CLASS_IDS.forEach((classId) => {
            const option = createElement("option", {
              attrs: { value: classId },
              text: titleCase(classId),
            });
            option.selected = classId === assignment.classId;
            select.append(option);
          });
          return select;
        },
      },
      { key: "source", label: "Source", render: (value) => titleCase(value) },
      { key: "revision", label: "Revision", align: "end", render: displayNumber },
      {
        key: "actions",
        label: "Actions",
        align: "end",
        render: (_value, assignment, rowIndex) => actionButton({
          label: "Correct",
          quiet: true,
          disabled: mutationsDisabled || !assignment.assignmentId,
          action: "arrival-correct",
          onClick(event) {
            const row = event.currentTarget.closest("tr");
            const select = row?.querySelector("select");
            const nextClass = String(select?.value || "").trim();
            if (!nextClass || nextClass === assignment.classId) return;
            onReviewedAction({
              opener: event.currentTarget,
              title: "Correct Arrival Class",
              message: `Change ${titleCase(assignment.countryId)} assignment from ${titleCase(assignment.classId)} to ${titleCase(nextClass)}?`,
              detail: `This revision-checked correction applies only to the authoritative assignment represented by row ${rowIndex + 1}.`,
              action: () => onReviewedAction.handlers.onCorrectArrival(assignment, nextClass),
            });
          },
        }),
      },
    ],
    emptyState: AdminEmptyState({
      title: "No Arrival Class assignments",
      message: "No initialized Arrival Class assignments were returned.",
      compact: true,
    }),
  });

  return sectionCard({
    eyebrow: "Arrival configuration",
    title: `${displayNumber(model.arrivals.length)} assignments`,
    description: "Corrections use only the eight Arrival Classes already accepted by the World Admin contract.",
    children: [createElement("div", {
      className: "admin-world-route__table admin-world-route__table--arrivals",
      children: table.element,
    })],
  });
}

function geographySection(model, { mutationsDisabled, onReviewedAction }) {
  const locationNames = new Map(
    model.geography.locations.map((location) => [location.locationId, location.displayName]),
  );
  const locationsTable = AdminDataTable({
    caption: "World locations",
    rows: model.geography.locations,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "displayName",
        label: "Location",
        rowHeader: true,
      },
      { key: "countryId", label: "Country", render: (value) => titleCase(value) },
      { key: "locationKind", label: "Type", render: (value) => titleCase(value) },
      { key: "availability", label: "Availability", render: statusPill },
      { key: "revision", label: "Revision", align: "end", render: displayNumber },
    ],
    emptyState: AdminEmptyState({
      title: "No locations initialized",
      message: "The selected game has no authoritative World locations.",
      compact: true,
    }),
  });

  const routesTable = AdminDataTable({
    caption: "World routes",
    rows: model.geography.routes,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "fromLocationId",
        label: "Route",
        rowHeader: true,
        render: (_value, route) => {
          const from = locationNames.get(route.fromLocationId) || titleCase(route.fromLocationId);
          const to = locationNames.get(route.toLocationId) || titleCase(route.toLocationId);
          return `${from} → ${to}`;
        },
      },
      { key: "mode", label: "Mode", render: (value) => titleCase(value) },
      { key: "status", label: "State", render: statusPill },
      { key: "baseCostMinor", label: "Base cost", align: "end", render: displayMinor },
      {
        key: "baseDurationMinutes",
        label: "Base duration",
        align: "end",
        render: (value) => Number.isFinite(Number(value)) ? `${displayNumber(value)} min` : "—",
      },
      {
        key: "costMultiplierBasisPoints",
        label: "Cost factor",
        align: "end",
        render: displayBasisPoints,
      },
      {
        key: "actions",
        label: "Actions",
        align: "end",
        render: (_value, route) => {
          const reopening = route.status === "closed";
          return actionButton({
            label: reopening ? "Reopen" : "Close",
            quiet: true,
            danger: !reopening,
            disabled: mutationsDisabled || !model.runtime || !route.routeId,
            disabledReason: mutationsDisabled
              ? "Refresh World state before changing routes so the operation uses the latest revision."
              : !model.runtime
                ? "World runtime metadata is unavailable."
                : !route.routeId ? "This route has no actionable reference." : "",
            action: reopening ? "route-reopen" : "route-close",
            onClick(event) {
              const from = locationNames.get(route.fromLocationId) || titleCase(route.fromLocationId);
              const to = locationNames.get(route.toLocationId) || titleCase(route.toLocationId);
              onReviewedAction({
                opener: event.currentTarget,
                title: reopening ? "Reopen World route" : "Close World route",
                message: `${reopening ? "Reopen" : "Close"} ${from} → ${to}?`,
                detail: reopening
                  ? "The existing contract restores the route to open with recovery reason and neutral multipliers."
                  : "The existing contract closes the route with war reason and neutral multipliers.",
                action: () => onReviewedAction.handlers.onToggleRoute(route),
              });
            },
          });
        },
      },
    ],
    emptyState: AdminEmptyState({
      title: "No routes initialized",
      message: "The selected game has no authoritative World routes.",
      compact: true,
    }),
  });

  return sectionCard({
    id: "world-geography",
    eyebrow: "Geography & movement",
    title: `${displayNumber(model.geography.locations.length)} locations · ${displayNumber(model.geography.routes.length)} routes`,
    description: "Route close/reopen is the only geography mutation currently exposed because it already exists in the World Admin contract.",
    children: [
      createElement("div", {
        className: "admin-world-route__table admin-world-route__table--locations",
        children: locationsTable.element,
      }),
      createElement("div", {
        className: "admin-world-route__table admin-world-route__table--routes",
        children: routesTable.element,
      }),
    ],
  });
}

function travelSection(model) {
  const locationNames = new Map(
    model.geography.locations.map((location) => [location.locationId, location.displayName]),
  );
  const table = AdminDataTable({
    caption: "World travel journeys",
    rows: model.travel.journeys,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "fromLocationId",
        label: "Journey",
        rowHeader: true,
        render: (_value, journey) => {
          const from = locationNames.get(journey.fromLocationId) || titleCase(journey.fromLocationId);
          const to = locationNames.get(journey.toLocationId) || titleCase(journey.toLocationId);
          return `${from} → ${to}`;
        },
      },
      { key: "status", label: "State", render: statusPill },
      { key: "currencyCode", label: "Currency", render: (value) => value || "—" },
      {
        key: "totalCostMinor",
        label: "Cost",
        align: "end",
        render: (value, journey) => {
          const cost = displayMinor(value);
          return journey.currencyCode && cost !== "—"
            ? `${cost} · ${journey.currencyCode}`
            : cost;
        },
      },
      {
        key: "totalDurationMinutes",
        label: "Duration",
        align: "end",
        render: (value) => Number.isFinite(Number(value)) ? `${displayNumber(value)} min` : "—",
      },
      {
        key: "arrivalAt",
        label: "Arrival",
        render: displayTime,
      },
    ],
    emptyState: AdminEmptyState({
      title: "No travel journeys",
      message: "No authoritative player journeys were returned for World supervision.",
      compact: true,
    }),
  });

  return sectionCard({
    id: "world-travel",
    eyebrow: "Travel oversight",
    title: `${displayNumber(model.travel.states.length)} travel states · ${displayNumber(model.travel.journeys.length)} journeys`,
    description: "Review aggregate travel state. Player identity details remain protected on this operational view.",
    children: [createElement("div", {
      className: "admin-world-route__table admin-world-route__table--travel",
      children: table.element,
    })],
  });
}

function residencySection(model) {
  const table = AdminDataTable({
    caption: "World residency states",
    rows: model.residency,
    rowKey: (row) => row.rowKey,
    columns: [
      {
        key: "currentCountryId",
        label: "Current country",
        rowHeader: true,
        render: (value) => titleCase(value),
      },
      { key: "currencyCode", label: "Currency", render: (value) => value || "—" },
      {
        key: "pendingCountryId",
        label: "Pending move",
        render: (value) => value ? titleCase(value) : "None",
      },
      {
        key: "eligibleCountryIds",
        label: "Eligible countries",
        render: (value) => Array.isArray(value) && value.length
          ? value.map((item) => titleCase(item)).join(", ")
          : "—",
      },
      { key: "revision", label: "Revision", align: "end", render: displayNumber },
      { key: "updatedAt", label: "Updated", render: displayTime },
    ],
    emptyState: AdminEmptyState({
      title: "No residency records",
      message: "No authoritative residency state was returned.",
      compact: true,
    }),
  });

  return sectionCard({
    eyebrow: "Residency oversight",
    title: `${displayNumber(model.residency.length)} residency records`,
    description: "Current, pending, and eligible country state is read-only here. Residency changes are not supported by this management surface.",
    children: [createElement("div", {
      className: "admin-world-route__table admin-world-route__table--residency",
      children: table.element,
    })],
  });
}

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
