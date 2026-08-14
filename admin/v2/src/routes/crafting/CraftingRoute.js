import {
  AdminDataTable,
  AdminDialog,
  AdminEmptyState,
  AdminErrorState,
  AdminField,
  AdminIcon,
  AdminPageFrame,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import { fromAdminDateTimeLocalValue, toAdminDateTimeLocalValue } from "../../core/date-time.js";
import { CraftingSkeleton } from "./CraftingSkeleton.js";

function titleCase(value, fallback = "Not available") {
  const text = String(value || "").trim();
  return text
    ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

function displayNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-US") : "—";
}

function displayDecimal(value) {
  return Number.isFinite(Number(value))
    ? Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "—";
}

function displayDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "—"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function displaySeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3_600)}h`;
}

function metric(label, value, detail, tone = "") {
  return createElement("article", {
    className: "admin-crafting-route__metric",
    dataset: { tone },
    children: [
      createElement("span", { text: label }),
      createElement("output", { text: displayNumber(value) }),
      createElement("small", { text: detail }),
    ],
  });
}

function summary(model) {
  return createElement("section", {
    className: "admin-crafting-route__summary",
    attrs: { "aria-label": "Crafting summary" },
    children: [
      metric("Observed recipes", model.summary.observedRecipeCount, "From current Crafting job records", "cyan"),
      metric("Active jobs", model.summary.activeJobCount, "Authoritative in-progress records", "purple"),
      metric("Claimed jobs", model.summary.claimedJobCount, "Crafting output already claimed", "green"),
      metric("Supply constraints", model.summary.constrainedSupplyCount, "Constrained, scarce, or unavailable", "orange"),
      metric("Integrity flags", model.summary.invariantViolations, "Inventory/Crafting invariant count", model.summary.invariantViolations ? "red" : "green"),
    ],
  });
}

function routeButton({
  label,
  icon,
  quiet = false,
  tone = "",
  onClick,
  disabled = false,
  action = "",
}) {
  const button = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button", disabled },
    dataset: { tone, craftingAction: action },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  button.addEventListener("click", onClick);
  return button;
}

function boundaryPanel() {
  return createElement("section", {
    className: "admin-crafting-route__boundary",
    attrs: { "aria-labelledby": "admin-crafting-boundary-title" },
    children: [
      AdminIcon({ name: "inventory", size: 21 }),
      createElement("div", {
        children: [
          createElement("h2", {
            attrs: { id: "admin-crafting-boundary-title" },
            text: "Inventory remains authoritative",
          }),
          createElement("p", {
            text: "This route reads the existing Crafting oversight projection and issues only existing job-recovery and physical-supply commands. It does not create recipes, grant items, rewrite holdings, or create a parallel Business inventory.",
          }),
          createElement("ul", {
            children: [
              createElement("li", {
                text: "Store purchase → Inventory ownership remains the source of acquired-item ownership.",
              }),
              createElement("li", {
                text: "Crafting input reservation/consumption and output grants remain server-owned Inventory operations.",
              }),
              createElement("li", {
                text: "The current Admin oversight contract does not expose standalone recipe input/output lines or per-player holding identifiers, so this UI does not fabricate them.",
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function packPanel(model) {
  const values = [
    ["Pack", model.pack.packKey || "No active pack reported"],
    ["Version", model.pack.contentVersion || "—"],
    ["Status", titleCase(model.pack.status)],
    ["Activated", displayDate(model.pack.activatedAt)],
    ["Durability repair", model.pack.durabilityEnabled || model.pack.repairEnabled ? "Enabled" : "Not enabled by current contract"],
  ];
  return createElement("section", {
    className: "admin-crafting-route__pack",
    attrs: { "aria-label": "Crafting content pack" },
    children: values.map(([label, value]) => createElement("div", {
      children: [
        createElement("span", { text: label }),
        createElement("strong", { text: value }),
      ],
    })),
  });
}

function recipesPanel(model) {
  const table = AdminDataTable({
    caption: "Observed recipes in Crafting records",
    rowKey: (recipe) => recipe.rowKey,
    columns: [
      {
        key: "recipeName",
        label: "Recipe",
        rowHeader: true,
        render: (_value, recipe) => createElement("div", {
          className: "admin-crafting-route__primary-copy",
          children: [
            createElement("strong", { text: recipe.recipeName }),
            recipe.recipeKey ? createElement("code", { text: recipe.recipeKey }) : null,
          ],
        }),
      },
      { key: "jobCount", label: "Jobs", align: "end", render: displayNumber },
      { key: "claimedCount", label: "Claimed", align: "end", render: displayNumber },
      { key: "failedCount", label: "Failed", align: "end", render: displayNumber },
      { key: "latestStartedAt", label: "Latest activity", render: displayDate },
    ],
    emptyState: AdminEmptyState({
      title: "No recipes observed yet",
      message: "The current Admin contract exposes recipe identity through Crafting job records. No Crafting jobs means there are no recipe observations to show here.",
      compact: true,
    }),
  });
  table.setRows(model.recipes);

  return createElement("section", {
    className: "admin-crafting-route__panel",
    attrs: { "aria-labelledby": "admin-crafting-recipes-title" },
    children: [
      createElement("header", {
        className: "admin-crafting-route__section-head",
        children: [
          createElement("div", {
            children: [
              createElement("span", { text: "Recipe visibility" }),
              createElement("h2", { attrs: { id: "admin-crafting-recipes-title" }, text: "Observed recipes" }),
            ],
          }),
          createElement("p", { text: `${displayNumber(model.recipes.length)} observed` }),
        ],
      }),
      createElement("p", {
        className: "admin-crafting-route__contract-note",
        text: "These rows are derived from authoritative Crafting records. They are not a writable recipe catalog. Required inputs and output item lines are not exposed by the current Admin oversight DTO.",
      }),
      table.element,
    ],
  });
}

function statusBadge(value) {
  return createElement("span", {
    className: "admin-crafting-route__status",
    dataset: { status: value || "unknown" },
    text: titleCase(value),
  });
}

function jobTiming(job) {
  const content = [];
  if (job.startedAt) content.push(createElement("span", { text: `Started ${displayDate(job.startedAt)}` }));
  if (job.completesAt) content.push(createElement("small", { text: `Completes ${displayDate(job.completesAt)}` }));
  if (job.claimedAt) content.push(createElement("small", { text: `Claimed ${displayDate(job.claimedAt)}` }));
  if (job.failureCode) content.push(createElement("small", { text: `Failure: ${titleCase(job.failureCode)}` }));
  return createElement("div", {
    className: "admin-crafting-route__timing",
    children: content.length ? content : "—",
  });
}

function jobActions(job, onRecover) {
  const actions = createElement("div", { className: "admin-crafting-route__row-actions" });
  if (!job.jobKey || !["in_progress", "completed", "failed"].includes(job.status)) {
    actions.append(createElement("span", {
      className: "admin-crafting-route__action-note",
      text: job.status === "claimed" ? "Output claimed" : "No recovery action",
    }));
    return actions;
  }

  if (job.status === "failed") {
    actions.append(routeButton({
      label: "Requeue",
      icon: "refresh",
      quiet: true,
      action: "requeue",
      onClick(event) { onRecover(job, "requeue", event.currentTarget); },
    }));
  }
  actions.append(routeButton({
    label: "Release & fail",
    icon: "warning",
    quiet: true,
    tone: "danger",
    action: "release-and-fail",
    onClick(event) { onRecover(job, "release_and_fail", event.currentTarget); },
  }));
  return actions;
}

function jobsPanel({ model, filters, onFiltersChange, onRecover }) {
  const search = AdminField({
    name: "crafting-search",
    label: "Search Crafting records",
    type: "search",
    placeholder: "Recipe, player, country, status",
    autocomplete: "off",
    value: filters.query,
    prefix: AdminIcon({ name: "search", size: 16 }),
  });
  const status = AdminField({
    name: "crafting-status",
    label: "Job status",
    type: "select",
    value: filters.status,
    options: [
      { value: "all", label: "All statuses" },
      { value: "in_progress", label: "In progress" },
      { value: "completed", label: "Completed" },
      { value: "claimed", label: "Claimed" },
      { value: "cancelled", label: "Cancelled" },
      { value: "failed", label: "Failed" },
    ],
  });

  const table = AdminDataTable({
    caption: "Crafting job records",
    rowKey: (job) => job.rowKey,
    columns: [
      {
        key: "recipeName",
        label: "Recipe",
        rowHeader: true,
        render: (_value, job) => createElement("div", {
          className: "admin-crafting-route__primary-copy",
          children: [
            createElement("strong", { text: job.recipeName }),
            job.recipeKey ? createElement("code", { text: job.recipeKey }) : null,
          ],
        }),
      },
      {
        key: "playerLabel",
        label: "Player",
        render: (value) => createElement("span", { className: "admin-crafting-route__player", text: value }),
      },
      { key: "quantity", label: "Qty", align: "end", render: displayNumber },
      { key: "status", label: "State", render: statusBadge },
      {
        key: "qualityBand",
        label: "Crafting context",
        render: (_value, job) => createElement("div", {
          className: "admin-crafting-route__context",
          children: [
            createElement("span", { text: titleCase(job.qualityBand, "Quality not reported") }),
            createElement("small", {
              text: [job.difficulty ? titleCase(job.difficulty) : "", job.countryCode].filter(Boolean).join(" · ") || "—",
            }),
          ],
        }),
      },
      { key: "startedAt", label: "Timing", render: (_value, job) => jobTiming(job) },
      {
        key: "actions",
        label: "Recovery",
        align: "end",
        render: (_value, job) => jobActions(job, onRecover),
      },
    ],
    emptyState: AdminEmptyState({
      title: "No Crafting records match",
      message: "Try changing the search or status filter.",
      compact: true,
    }),
  });

  function applyFilters() {
    const query = search.getValue().trim().toLowerCase();
    const selectedStatus = status.getValue();
    const visible = model.jobs.filter((job) => {
      const searchable = [
        job.recipeName,
        job.recipeKey,
        job.playerLabel,
        job.countryCode,
        job.status,
        job.qualityBand,
      ].join(" ").toLowerCase();
      return (!query || searchable.includes(query))
        && (selectedStatus === "all" || job.status === selectedStatus);
    });
    table.setRows(visible);
    onFiltersChange({ query: search.getValue(), status: selectedStatus });
  }

  search.control.addEventListener("input", applyFilters);
  status.control.addEventListener("change", applyFilters);
  applyFilters();

  return createElement("section", {
    className: "admin-crafting-route__panel",
    attrs: { "aria-labelledby": "admin-crafting-jobs-title" },
    children: [
      createElement("header", {
        className: "admin-crafting-route__section-head",
        children: [
          createElement("div", {
            children: [
              createElement("span", { text: "Authoritative activity" }),
              createElement("h2", { attrs: { id: "admin-crafting-jobs-title" }, text: "Crafting records" }),
            ],
          }),
          createElement("p", { text: `${displayNumber(model.jobs.length)} records` }),
        ],
      }),
      createElement("div", {
        className: "admin-crafting-route__controls",
        attrs: { "aria-label": "Crafting record filters" },
        children: [search.element, status.element],
      }),
      table.element,
    ],
  });
}

function supplyAvailability(item) {
  const available = item.availableQuantity;
  const reserved = item.reservedQuantity;
  return createElement("div", {
    className: "admin-crafting-route__availability",
    children: [
      createElement("span", {
        text: available === null ? "Quantity not bounded" : `${displayNumber(available)} available`,
      }),
      createElement("small", {
        text: reserved === null ? "Reserved quantity not reported" : `${displayNumber(reserved)} reserved`,
      }),
    ],
  });
}

function supplyPanel(model, onAdjust) {
  const table = AdminDataTable({
    caption: "Crafting physical-economy supply state",
    rowKey: (item) => item.rowKey,
    columns: [
      {
        key: "itemKey",
        label: "Item",
        rowHeader: true,
        render: (value) => createElement("code", { text: value || "Unnamed item" }),
      },
      { key: "countryCode", label: "Scope", render: (value) => value || "Global" },
      { key: "scarcityBand", label: "Scarcity", render: statusBadge },
      { key: "availableQuantity", label: "Availability", render: (_value, item) => supplyAvailability(item) },
      {
        key: "eventMultiplier",
        label: "Multipliers",
        render: (_value, item) => createElement("div", {
          className: "admin-crafting-route__multipliers",
          children: [
            createElement("span", { text: `Event ×${displayDecimal(item.eventMultiplier)}` }),
            createElement("small", { text: `Route ×${displayDecimal(item.routeMultiplier)}` }),
          ],
        }),
      },
      {
        key: "expiresAt",
        label: "Source / expiry",
        render: (_value, item) => createElement("div", {
          className: "admin-crafting-route__timing",
          children: [
            createElement("span", { text: item.sourceEventKey || "No source event" }),
            createElement("small", { text: item.expiresAt ? displayDate(item.expiresAt) : "No expiry" }),
          ],
        }),
      },
      {
        key: "actions",
        label: "Action",
        align: "end",
        render: (_value, item) => routeButton({
          label: "Adjust",
          icon: "settings",
          quiet: true,
          action: "adjust-supply",
          disabled: !item.itemKey,
          onClick(event) { onAdjust(item, event.currentTarget); },
        }),
      },
    ],
    emptyState: AdminEmptyState({
      title: "No supply overrides",
      message: "No game-scoped physical-economy supply state is currently reported.",
      compact: true,
    }),
  });
  table.setRows(model.supply);

  return createElement("section", {
    className: "admin-crafting-route__panel",
    attrs: { "aria-labelledby": "admin-crafting-supply-title" },
    children: [
      createElement("header", {
        className: "admin-crafting-route__section-head",
        children: [
          createElement("div", {
            children: [
              createElement("span", { text: "Physical economy" }),
              createElement("h2", { attrs: { id: "admin-crafting-supply-title" }, text: "Crafting supply" }),
            ],
          }),
          createElement("p", { text: `${displayNumber(model.supply.length)} states` }),
        ],
      }),
      createElement("p", {
        className: "admin-crafting-route__contract-note",
        text: "Availability here is game/country supply state. It is not a substitute for a player's Inventory holdings or ingredient-reservation checks.",
      }),
      table.element,
    ],
  });
}

function effectsPanel(model) {
  const table = AdminDataTable({
    caption: "Enabled Crafting effect definitions",
    rowKey: (effect) => effect.rowKey,
    columns: [
      {
        key: "effectCode",
        label: "Effect",
        rowHeader: true,
        render: (_value, effect) => createElement("div", {
          className: "admin-crafting-route__primary-copy",
          children: [
            createElement("strong", { text: effect.summary || titleCase(effect.effectCode, "Effect") }),
            effect.effectCode ? createElement("code", { text: effect.effectCode }) : null,
          ],
        }),
      },
      { key: "kind", label: "Kind", render: (value) => titleCase(value) },
      { key: "scope", label: "Scope", render: (value) => titleCase(value) },
      {
        key: "durationSeconds",
        label: "Duration / cooldown",
        render: (_value, effect) => `${displaySeconds(effect.durationSeconds)} / ${displaySeconds(effect.cooldownSeconds)}`,
      },
      {
        key: "stackingRule",
        label: "Stacking",
        render: (_value, effect) => [
          titleCase(effect.stackingRule),
          effect.maxStacks !== null ? `max ${displayNumber(effect.maxStacks)}` : "",
        ].filter(Boolean).join(" · "),
      },
      { key: "enabled", label: "State", render: (value) => value ? "Enabled" : "Disabled" },
    ],
    emptyState: AdminEmptyState({
      title: "No Crafting effects reported",
      message: "The active physical-economy pack has no effect definitions in the current oversight response.",
      compact: true,
    }),
  });
  table.setRows(model.effects);

  return createElement("section", {
    className: "admin-crafting-route__panel",
    attrs: { "aria-labelledby": "admin-crafting-effects-title" },
    children: [
      createElement("header", {
        className: "admin-crafting-route__section-head",
        children: [
          createElement("div", {
            children: [
              createElement("span", { text: "Output behavior" }),
              createElement("h2", { attrs: { id: "admin-crafting-effects-title" }, text: "Crafting effects" }),
            ],
          }),
          createElement("p", { text: `${displayNumber(model.effects.length)} definitions` }),
        ],
      }),
      table.element,
    ],
  });
}

function integrityPanel(model) {
  const invariants = [
    ["Negative owned quantity", model.invariants.negativeOwned],
    ["Negative reserved quantity", model.invariants.negativeReserved],
    ["Reserved above owned", model.invariants.reservedAboveOwned],
    ["Reservation projection mismatch", model.invariants.reservationProjectionMismatch],
    ["Duplicate output grants", model.invariants.duplicateOutputGrants],
  ];
  return createElement("section", {
    className: "admin-crafting-route__integrity",
    attrs: { "aria-labelledby": "admin-crafting-integrity-title" },
    children: [
      createElement("header", {
        className: "admin-crafting-route__section-head",
        children: createElement("div", {
          children: [
            createElement("span", { text: "Inventory safeguards" }),
            createElement("h2", { attrs: { id: "admin-crafting-integrity-title" }, text: "Integrity invariants" }),
          ],
        }),
      }),
      createElement("div", {
        className: "admin-crafting-route__integrity-grid",
        children: invariants.map(([label, value]) => createElement("article", {
          dataset: { state: value === 0 ? "clear" : "attention" },
          children: [
            createElement("span", { text: label }),
            createElement("strong", { text: displayNumber(value) }),
          ],
        })),
      }),
      createElement("p", {
        className: "admin-crafting-route__contract-note",
        text: "These are read-only integrity counters from the authoritative Crafting/Inventory projection. This Admin V2 route does not repair holdings directly.",
      }),
    ],
  });
}

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

function numericInputValue(value, fallback = "") {
  return value === null || value === undefined ? fallback : value;
}

function recoveryDialog({ job, outcome, opener, onRecover, onDestroyed }) {
  const form = createElement("form", {
    className: "admin-crafting-form",
    attrs: { novalidate: true },
  });
  const reason = AdminField({
    name: "reason",
    label: "Recovery reason",
    type: "textarea",
    required: true,
    hint: "3–1000 characters. The server records this administrator recovery reason.",
    value: "",
  });
  const status = createElement("p", {
    className: "admin-crafting-form__status",
    attrs: { role: "alert" },
  });
  form.append(
    createElement("dl", {
      className: "admin-crafting-form__context",
      children: [
        createElement("div", {
          children: [
            createElement("dt", { text: "Recipe" }),
            createElement("dd", { text: job.recipeName }),
          ],
        }),
        createElement("div", {
          children: [
            createElement("dt", { text: "Player" }),
            createElement("dd", { text: job.playerLabel }),
          ],
        }),
        createElement("div", {
          children: [
            createElement("dt", { text: "Action" }),
            createElement("dd", { text: outcome === "requeue" ? "Requeue failed job" : "Release reservations and fail job" }),
          ],
        }),
      ],
    }),
    reason.element,
    status,
  );

  const cancel = routeButton({
    label: "Cancel",
    quiet: true,
    action: "cancel-recovery",
    onClick() { dialog.close("cancelled"); },
  });
  cancel.dataset.dialogAction = "cancel";
  const submit = routeButton({
    label: outcome === "requeue" ? "Requeue job" : "Release & fail",
    icon: outcome === "requeue" ? "refresh" : "warning",
    tone: outcome === "requeue" ? "" : "danger",
    action: "commit-recovery",
    onClick() { form.requestSubmit(); },
  });
  submit.dataset.dialogAction = "save";
  const footer = createElement("div", {
    className: "admin-crafting-form__actions",
    children: [cancel, submit],
  });

  const dialog = AdminDialog({
    title: outcome === "requeue" ? "Requeue Crafting job" : "Release and fail Crafting job",
    description: outcome === "requeue"
      ? "Requeue is committed only when the existing server-side reservation state is safe."
      : "The existing recovery contract releases active Crafting input reservations and fails the job only when server invariants permit it.",
    content: form,
    footer,
    className: "admin-crafting-dialog",
    initialFocus: () => reason.control,
    onClose() {
      queueMicrotask(() => {
        dialog.destroy();
        onDestroyed(dialog);
      });
    },
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const recoveryReason = reason.getValue().trim();
    reason.setError("");
    status.textContent = "";
    if (recoveryReason.length < 3 || recoveryReason.length > 1_000) {
      reason.setError("Enter a recovery reason from 3 through 1000 characters.");
      reason.focus();
      return;
    }
    dialog.setBusy(true);
    try {
      const result = await onRecover(job, { outcome, reason: recoveryReason });
      if (result?.ok === true) {
        dialog.close("committed");
      } else {
        status.textContent = result?.error?.userMessage || "The recovery operation could not be committed.";
      }
    } catch (_error) {
      status.textContent = "The recovery operation could not be committed.";
    } finally {
      if (dialog.isOpen()) dialog.setBusy(false);
    }
  });

  dialog.open(opener);
  return dialog;
}

function supplyDialog({ item = null, opener, onApplySupply, onDestroyed }) {
  const editing = Boolean(item?.itemKey);
  const form = createElement("form", {
    className: "admin-crafting-form",
    attrs: { novalidate: true },
  });
  const itemKey = AdminField({
    name: "itemKey",
    label: "Item key",
    required: true,
    hint: "Existing physical-economy item key; this does not create an item.",
    value: item?.itemKey || "",
    autocomplete: "off",
  });
  if (editing) itemKey.setReadOnly(true, "Item identity is immutable. Change the supply state below instead.");

  const countryCode = AdminField({
    name: "countryCode",
    label: "Country code",
    hint: "Optional three-letter scope. Leave blank for global supply.",
    value: item?.countryCode || "",
    autocomplete: "off",
  });
  const scarcityBand = AdminField({
    name: "scarcityBand",
    label: "Scarcity",
    type: "select",
    required: true,
    value: item?.scarcityBand || "available",
    options: [
      { value: "abundant", label: "Abundant" },
      { value: "available", label: "Available" },
      { value: "constrained", label: "Constrained" },
      { value: "scarce", label: "Scarce" },
      { value: "unavailable", label: "Unavailable" },
    ],
  });
  const availableQuantity = AdminField({
    name: "availableQuantity",
    label: "Available quantity",
    type: "number",
    hint: "Optional whole quantity. Leave blank when the supply quantity is not bounded.",
    value: numericInputValue(item?.availableQuantity),
  });
  availableQuantity.control.min = "0";
  availableQuantity.control.step = "1";

  const eventMultiplier = AdminField({
    name: "eventMultiplier",
    label: "Event multiplier",
    type: "number",
    required: true,
    value: numericInputValue(item?.eventMultiplier, 1),
  });
  eventMultiplier.control.min = "0.5";
  eventMultiplier.control.max = "4";
  eventMultiplier.control.step = "0.05";

  const routeMultiplier = AdminField({
    name: "routeMultiplier",
    label: "Route multiplier",
    type: "number",
    required: true,
    value: numericInputValue(item?.routeMultiplier, 1),
  });
  routeMultiplier.control.min = "0.5";
  routeMultiplier.control.max = "4";
  routeMultiplier.control.step = "0.05";

  const sourceEventKey = AdminField({
    name: "sourceEventKey",
    label: "Source event key",
    hint: "Optional existing event/reference key.",
    value: item?.sourceEventKey || "",
    autocomplete: "off",
  });
  const expiresAt = AdminField({
    name: "expiresAt",
    label: "Expires at",
    type: "datetime-local",
    hint: "Optional local expiration time. It is stored as an absolute timestamp.",
    value: toAdminDateTimeLocalValue(item?.expiresAt),
  });
  const status = createElement("p", {
    className: "admin-crafting-form__status",
    attrs: { role: "alert" },
  });

  const grid = createElement("div", {
    className: "admin-crafting-form__grid",
    children: [
      itemKey.element,
      countryCode.element,
      scarcityBand.element,
      availableQuantity.element,
      eventMultiplier.element,
      routeMultiplier.element,
      sourceEventKey.element,
      expiresAt.element,
    ],
  });
  form.append(grid, status);

  const cancel = routeButton({
    label: "Cancel",
    quiet: true,
    action: "cancel-supply",
    onClick() { dialog.close("cancelled"); },
  });
  cancel.dataset.dialogAction = "cancel";
  const submit = routeButton({
    label: "Apply supply state",
    icon: "settings",
    action: "commit-supply",
    onClick() { form.requestSubmit(); },
  });
  submit.dataset.dialogAction = "save";
  const footer = createElement("div", {
    className: "admin-crafting-form__actions",
    children: [cancel, submit],
  });

  const dialog = AdminDialog({
    title: editing ? `Adjust ${item.itemKey}` : "Apply Crafting supply state",
    description: "Uses the existing game-scoped physical-economy supply contract. It does not grant Inventory or alter recipe definitions.",
    content: form,
    footer,
    size: "large",
    className: "admin-crafting-dialog",
    initialFocus: () => editing ? scarcityBand.control : itemKey.control,
    onClose() {
      queueMicrotask(() => {
        dialog.destroy();
        onDestroyed(dialog);
      });
    },
  });

  function clearErrors() {
    [
      itemKey,
      countryCode,
      scarcityBand,
      availableQuantity,
      eventMultiplier,
      routeMultiplier,
      sourceEventKey,
      expiresAt,
    ].forEach((field) => field.setError(""));
    status.textContent = "";
  }

  function numberOrNull(value) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : Number.NaN;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();
    const key = itemKey.getValue().trim().toLowerCase();
    const country = countryCode.getValue().trim().toUpperCase();
    const available = numberOrNull(availableQuantity.getValue());
    const eventValue = numberOrNull(eventMultiplier.getValue());
    const routeValue = numberOrNull(routeMultiplier.getValue());
    const sourceEvent = sourceEventKey.getValue().trim();
    const expiryInput = expiresAt.getValue().trim();
    const expiry = expiryInput ? fromAdminDateTimeLocalValue(expiryInput) : "";
    let invalid = false;

    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key)) {
      itemKey.setError("Enter an existing item key using lowercase letters, numbers, underscores, or hyphens.");
      invalid = true;
    }
    if (country && !/^[A-Z]{3}$/.test(country)) {
      countryCode.setError("Use a three-letter country code or leave this field blank.");
      invalid = true;
    }
    if (available !== null && (!Number.isSafeInteger(available) || available < 0)) {
      availableQuantity.setError("Use a non-negative whole quantity or leave this field blank.");
      invalid = true;
    }
    if (!Number.isFinite(eventValue) || eventValue < 0.5 || eventValue > 4) {
      eventMultiplier.setError("Use an event multiplier from 0.5 through 4.");
      invalid = true;
    }
    if (!Number.isFinite(routeValue) || routeValue < 0.5 || routeValue > 4) {
      routeMultiplier.setError("Use a route multiplier from 0.5 through 4.");
      invalid = true;
    }
    if (sourceEvent && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(sourceEvent)) {
      sourceEventKey.setError("Use an existing safe event/reference key.");
      invalid = true;
    }
    if (expiryInput && !expiry) {
      expiresAt.setError("Enter a valid expiration date and time or leave this field blank.");
      invalid = true;
    }
    if (invalid) {
      form.querySelector("[aria-invalid='true']")?.focus();
      return;
    }

    const proposed = {
      countryCode: country || null,
      scarcityBand: scarcityBand.getValue(),
      availableQuantity: available,
      eventMultiplier: eventValue,
      routeMultiplier: routeValue,
      sourceEventKey: sourceEvent || null,
      expiresAt: expiry || null,
    };
    const before = item ? [
      `Scarcity: ${titleCase(item.scarcityBand)}`,
      `Available: ${item.availableQuantity === null ? "unbounded" : displayNumber(item.availableQuantity)}`,
      `Event multiplier: ${displayDecimal(item.eventMultiplier)}`,
      `Route multiplier: ${displayDecimal(item.routeMultiplier)}`,
      `Expires: ${item.expiresAt ? displayDate(item.expiresAt) : "no expiry"}`,
    ].join(" · ") : "No existing override";
    const after = [
      `Scarcity: ${titleCase(proposed.scarcityBand)}`,
      `Available: ${proposed.availableQuantity === null ? "unbounded" : displayNumber(proposed.availableQuantity)}`,
      `Event multiplier: ${displayDecimal(proposed.eventMultiplier)}`,
      `Route multiplier: ${displayDecimal(proposed.routeMultiplier)}`,
      `Expires: ${proposed.expiresAt ? displayDate(proposed.expiresAt) : "no expiry"}`,
    ].join(" · ");
    const review = AdminConfirmDialog({
      title: editing ? "Review supply change" : "Review supply override",
      message: `Apply this ${country || "global"} supply state for ${key}?`,
      detail: "This changes availability used by the physical economy. It does not change player-owned Inventory.",
      changes: [{ label: "Supply state", before, after }],
      confirmLabel: "Apply supply state",
      tone: "neutral",
      failureMessage: "The supply operation could not be committed.",
      async onConfirm() {
        const result = await onApplySupply(key, proposed);
        if (result?.ok !== true) throw new Error("CRAFTING_SUPPLY_FAILED");
        return true;
      },
    });
    const accepted = await review.open(submit);
    review.destroy();
    if (accepted) dialog.close("committed");
  });

  dialog.open(opener);
  return dialog;
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
