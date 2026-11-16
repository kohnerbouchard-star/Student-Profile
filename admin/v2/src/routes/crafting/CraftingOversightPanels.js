import { AdminDataTable, AdminEmptyState, AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { displayDate, displayDecimal, displayNumber, displaySeconds, routeButton, statusBadge, titleCase } from "./CraftingViewHelpers.js";

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

export function summary(model) {
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

export function boundaryPanel() {
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

export function packPanel(model) {
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

export function recipesPanel(model) {
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

export function supplyPanel(model, onAdjust) {
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

export function effectsPanel(model) {
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

export function integrityPanel(model) {
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
