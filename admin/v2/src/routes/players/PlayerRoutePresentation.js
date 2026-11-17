import { AdminDataTable, AdminEmptyState, AdminField, AdminIcon } from "../../components/index.js";
import { createElement } from "../../components/dom.js";





function titleCase(value, fallback = "Not available") {
  const text = String(value || "").trim();
  return text
    ? text.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
}

function formatDateTime(value) {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return "Not available";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}

function routeButton({ label, icon, quiet = false, onClick, disabled = false, action }) {
  const button = createElement("button", {
    className: `admin-button${quiet ? " admin-button--quiet" : ""}`,
    attrs: { type: "button", disabled },
    dataset: { playerAction: action },
    children: [icon ? AdminIcon({ name: icon, size: 17 }) : null, label],
  });
  button.addEventListener("click", onClick);
  return button;
}

function metric(label, value, detail) {
  return createElement("article", {
    className: "admin-players-route__metric",
    children: [
      createElement("span", { text: label }),
      createElement("output", { text: Number(value || 0).toLocaleString("en-US") }),
      createElement("small", { text: detail }),
    ],
  });
}

function summary(model) {
  return createElement("section", {
    className: "admin-players-route__summary",
    attrs: { "aria-label": "Players summary" },
    children: [
      metric("Players", model.summary.totalCount, "Current game roster"),
      metric("Active", model.summary.activeCount, "Authoritative account status"),
      metric("Online", model.summary.onlineCount, "Active Player sessions"),
      metric("Flagged", model.summary.flaggedCount, "Open administrative flags"),
    ],
  });
}

function statusBadge(player) {
  return createElement("span", {
    className: "admin-players-route__status",
    dataset: { status: player.status || "unknown" },
    text: titleCase(player.status),
  });
}

function presenceBadge(player) {
  return createElement("span", {
    className: "admin-players-route__presence",
    dataset: { presence: player.sessionStatus },
    text: titleCase(player.sessionStatus),
  });
}

function definition(label, value, detail = "") {
  return createElement("div", {
    className: "admin-players-route__definition",
    children: [
      createElement("dt", { text: label }),
      createElement("dd", { text: value || "Not available" }),
      detail ? createElement("small", { text: detail }) : null,
    ],
  });
}

function detailContent(player) {
  const profile = player.adminProfile || {};
  const administrativeName = profile.displayName && profile.displayName !== player.displayName
    ? profile.displayName
    : "No override";
  return createElement("div", {
    className: "admin-players-route__detail",
    children: [
      createElement("section", {
        className: "admin-players-route__detail-section",
        children: [
          createElement("div", {
            className: "admin-players-route__detail-heading",
            children: [
              createElement("h3", { text: "Roster identity" }),
              createElement("span", { className: "admin-field__state", text: "Read only here" }),
            ],
          }),
          createElement("p", { className: "admin-u-muted", text: "These are the player-facing roster values. Admin metadata below does not overwrite them." }),
          createElement("dl", {
            className: "admin-players-route__definitions",
            children: [
              definition("Player name", player.displayName, "Authoritative roster and Player Terminal display name."),
              definition("Roster label", player.rosterLabel),
              definition("Account status", titleCase(player.status), "Authoritative Player account status."),
              definition("Country", player.countryName),
              definition("Session", titleCase(player.sessionStatus)),
              definition("Last active", formatDateTime(player.lastActiveAt)),
              definition("Open flags", String(player.flagCount)),
            ],
          }),
        ],
      }),
      createElement("section", {
        className: "admin-players-route__detail-section",
        children: [
          createElement("h3", { text: "Admin metadata" }),
          createElement("dl", {
            className: "admin-players-route__definitions",
            children: [
              definition("Admin display name", administrativeName, "Administrative metadata only; it does not rename the Player Terminal account."),
              definition("Admin status label", profile.status || "No override"),
              definition("Admin country assignment", profile.countryAssignment || "No override"),
              definition("Admin note", profile.adminNote || "No note"),
            ],
          }),
        ],
      }),
      createElement("section", {
        className: "admin-players-route__credential-note",
        children: [
          AdminIcon({ name: "lock", size: 19 }),
          createElement("div", {
            children: [
              createElement("strong", { text: "Player ID and Access Code are protected" }),
              createElement("p", {
                text: "The roster does not expose the internal Player UUID, the current Player ID/RFID value, or the current Access Code. You can submit a replacement credential without revealing the existing one.",
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function resolvedCatalog({ model, filters, onFiltersChange, onView, onAdd }) {
  const normalizedStatus = filters.status === "all" || model.statuses.includes(filters.status)
    ? filters.status
    : "all";
  if (normalizedStatus !== filters.status) {
    onFiltersChange({ ...filters, status: normalizedStatus });
  }

  const search = AdminField({
    name: "search",
    label: "Search Players",
    type: "search",
    placeholder: "Name, roster label, country, or Admin profile",
    autocomplete: "off",
    value: filters.query,
    prefix: AdminIcon({ name: "search", size: 16 }),
  });
  const status = AdminField({
    name: "status",
    label: "Account status",
    type: "select",
    value: normalizedStatus,
    options: [
      { value: "all", label: "All account states" },
      ...model.statuses.map((value) => ({ value, label: titleCase(value) })),
    ],
  });
  const presence = AdminField({
    name: "presence",
    label: "Session presence",
    type: "select",
    value: filters.presence,
    options: [
      { value: "all", label: "All session states" },
      { value: "online", label: "Online" },
      { value: "recently_active", label: "Recently active" },
      { value: "offline", label: "Offline" },
    ],
  });
  const controls = createElement("section", {
    className: "admin-players-route__controls",
    attrs: { "aria-label": "Player filters" },
    children: [search.element, status.element, presence.element],
  });

  const table = AdminDataTable({
    caption: "Players in the current game",
    rowKey: (player) => player.rowKey,
    columns: [
      {
        key: "displayName",
        label: "Player",
        rowHeader: true,
        render: (_value, player) => createElement("div", {
          className: "admin-players-route__player-copy",
          children: [
            createElement("strong", { text: player.displayName }),
            player.adminProfile.displayName && player.adminProfile.displayName !== player.displayName
              ? createElement("small", { text: `Admin label: ${player.adminProfile.displayName}` })
              : null,
          ],
        }),
      },
      { key: "rosterLabel", label: "Roster", render: (value) => value || "—" },
      { key: "countryName", label: "Country" },
      { key: "sessionStatus", label: "Presence", render: (_value, player) => presenceBadge(player) },
      { key: "status", label: "Status", render: (_value, player) => statusBadge(player) },
      {
        key: "flagCount",
        label: "Flags",
        align: "end",
        render: (value) => Number(value || 0).toLocaleString("en-US"),
      },
      {
        key: "actions",
        label: "Actions",
        align: "end",
        render: (_value, player) => routeButton({
          label: "View",
          icon: "user",
          quiet: true,
          action: "view",
          onClick(event) { onView(player, event.currentTarget); },
        }),
      },
    ],
    emptyState: AdminEmptyState({
      title: "No Players match",
      message: "Try changing the search or filters.",
      compact: true,
    }),
  });

  function applyFilters() {
    const query = search.getValue().trim().toLowerCase();
    const selectedStatus = status.getValue();
    const selectedPresence = presence.getValue();
    const visiblePlayers = model.players.filter((player) => {
      const searchable = [
        player.displayName,
        player.rosterLabel,
        player.countryName,
        player.adminProfile.displayName,
        player.adminProfile.status,
        player.adminProfile.countryAssignment,
        player.adminProfile.adminNote,
      ].join(" ").toLowerCase();
      return (!query || searchable.includes(query))
        && (selectedStatus === "all" || player.status === selectedStatus)
        && (selectedPresence === "all" || player.sessionStatus === selectedPresence);
    });
    table.setRows(visiblePlayers);
    onFiltersChange({
      query: search.getValue(),
      status: selectedStatus,
      presence: selectedPresence,
    });
  }

  search.control.addEventListener("input", applyFilters);
  status.control.addEventListener("change", applyFilters);
  presence.control.addEventListener("change", applyFilters);
  applyFilters();

  const root = createElement("div", {
    className: "admin-players-route__resolved",
    children: [summary(model), controls],
  });
  if (model.isEmpty) {
    root.append(AdminEmptyState({
      title: "No Players yet",
      message: "Create the first Player for this game using the authoritative roster contract.",
      action: { label: "Add Player", onClick: onAdd },
    }));
  } else {
    root.append(createElement("section", {
      className: "admin-players-route__roster",
      attrs: { "aria-label": "Player roster" },
      children: table.element,
    }));
  }
  return root;
}

export {
  titleCase,
  formatDateTime,
  routeButton,
  metric,
  summary,
  statusBadge,
  presenceBadge,
  definition,
  detailContent,
  resolvedCatalog,
};
