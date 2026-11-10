import { AdminDataTable, AdminEmptyState, AdminField, AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { displayDate, displayNumber, routeButton, statusBadge, titleCase } from "./CraftingViewHelpers.js";

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

export function jobsPanel({ model, filters, onFiltersChange, onRecover }) {
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
