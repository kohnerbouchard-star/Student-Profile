import {
  AdminDataTable,
  AdminDialog,
  AdminDrawer,
  AdminEmptyState,
  AdminErrorState,
  AdminField,
  AdminIcon,
  AdminPageFrame,
  AdminStaleState,
} from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import {
  CreatePlayerForm,
  PlayerCredentialForm,
  PlayerProfileForm,
} from "./PlayerForms.js";
import { PlayersSkeleton } from "./PlayersSkeleton.js";

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

/** Renders the source-owned Players route from the shared Admin v2 six-state contract. */
export function PlayersRoute({
  state,
  filters = { query: "", status: "all", presence: "all" },
  onFiltersChange = () => {},
  onRefresh = async () => {},
  onCreate = async () => ({ ok: false }),
  onEditProfile = async () => ({ ok: false }),
  onUpdateCredentials = async () => ({ ok: false }),
} = {}) {
  let destroyed = false;
  let detailDrawer = null;
  let activeDialog = null;

  function destroyDialog() {
    const current = activeDialog;
    activeDialog = null;
    current?.form?.destroy?.();
    current?.dialog?.destroy?.();
  }

  function destroyDetailDrawer() {
    const current = detailDrawer;
    detailDrawer = null;
    current?.destroy?.();
  }

  function openFormDialog({ title, description, opener, createForm, submit }) {
    destroyDialog();
    let dialog;
    let form;
    form = createForm({
      onCancel() { dialog.close("cancelled"); },
      async onSubmit(input) {
        dialog.setBusy(true);
        const result = await submit(input);
        if (result?.ok === true) {
          dialog.close("saved");
        } else {
          dialog.setBusy(false);
        }
        return result;
      },
    });
    dialog = AdminDialog({
      title,
      description,
      content: form.element,
      footer: form.footer,
      size: "large",
      className: "admin-players-dialog",
      initialFocus: () => form.fields[0]?.control,
      onClose() {
        queueMicrotask(() => {
          if (activeDialog?.dialog === dialog) destroyDialog();
        });
      },
    });
    activeDialog = { dialog, form };
    dialog.open(opener instanceof HTMLElement ? opener : document.activeElement);
  }

  function addPlayer(opener) {
    openFormDialog({
      title: "Add Player",
      description: "Create a Player using the current roster identity contract. Player ID/RFID and Access Code are required at creation.",
      opener,
      createForm: (options) => CreatePlayerForm(options),
      submit: onCreate,
    });
  }

  function editProfile(player, opener) {
    openFormDialog({
      title: "Edit admin metadata",
      description: "These staff-only labels and notes do not rename or reassign the player-facing roster identity shown above.",
      opener,
      createForm: (options) => PlayerProfileForm({ ...options, player }),
      submit: (input) => onEditProfile(player, input),
    });
  }

  function editCredentials(player, opener) {
    openFormDialog({
      title: "Update Player credentials",
      description: "Enter only the credential that should change. Existing Player IDs and Access Codes are not revealed by this screen.",
      opener,
      createForm: (options) => PlayerCredentialForm(options),
      submit: (input) => onUpdateCredentials(player, input),
    });
  }

  function viewPlayer(player, opener) {
    destroyDetailDrawer();
    const actions = createElement("div", {
      className: "admin-players-route__detail-actions",
    });
    const profileButton = routeButton({
      label: "Edit admin metadata",
      icon: "settings",
      quiet: true,
      action: "edit-profile",
      onClick(event) { editProfile(player, event.currentTarget); },
    });
    const credentialButton = routeButton({
      label: "Update credentials",
      icon: "lock",
      action: "credentials",
      onClick(event) { editCredentials(player, event.currentTarget); },
    });
    actions.append(profileButton, credentialButton);
    detailDrawer = AdminDrawer({
      title: player.displayName,
      description: "Current authoritative roster identity plus supported administrative metadata.",
      content: detailContent(player),
      footer: actions,
      size: "large",
      className: "admin-players-drawer",
      onClose() {
        queueMicrotask(() => {
          if (detailDrawer?.element?.dataset.open === "false") destroyDetailDrawer();
        });
      },
    });
    detailDrawer.open(opener);
  }

  const addButton = routeButton({
    label: "Add Player",
    icon: "plus",
    action: "add",
    onClick(event) { addPlayer(event.currentTarget); },
  });
  const refreshButton = routeButton({
    label: state.status === ADMIN_DATA_STATES.REFRESHING ? "Refreshing…" : "Refresh",
    icon: "refresh",
    quiet: true,
    action: "refresh",
    disabled: state.status === ADMIN_DATA_STATES.REFRESHING,
    onClick: onRefresh,
  });
  const actions = createElement("div", {
    className: "admin-players-route__page-actions",
    children: [refreshButton, addButton],
  });
  const route = createElement("div", {
    className: "admin-players-route",
    dataset: { adminV2State: state.status },
    attrs: {
      "aria-busy": [ADMIN_DATA_STATES.INITIAL_LOADING, ADMIN_DATA_STATES.REFRESHING].includes(state.status),
    },
  });

  let content;
  if (state.status === ADMIN_DATA_STATES.INITIAL_LOADING) {
    content = PlayersSkeleton();
  } else if (state.status === ADMIN_DATA_STATES.FAILED) {
    content = AdminErrorState({
      title: "Players could not be loaded",
      message: state.error?.userMessage || "The Player roster is temporarily unavailable.",
      requestId: state.error?.requestId,
      retryAfterSeconds: state.error?.retryAfterSeconds,
      retry: state.error?.retryable === false ? null : { label: "Try again", onClick: onRefresh },
    });
  } else {
    const resolved = resolvedCatalog({
      model: state.data,
      filters,
      onFiltersChange,
      onView: viewPlayer,
      onAdd: addPlayer,
    });
    if (state.status === ADMIN_DATA_STATES.STALE) {
      content = AdminStaleState({
        message: "Showing the last valid Player roster. Refresh to reconcile with the current game.",
        retry: { label: "Refresh", onClick: onRefresh },
        content: resolved,
      });
    } else {
      content = resolved;
      if (state.status === ADMIN_DATA_STATES.REFRESHING) {
        content.prepend(createElement("p", {
          className: "admin-players-route__refreshing",
          text: "Refreshing the authoritative Player roster…",
          attrs: { role: "status", "aria-live": "polite" },
        }));
      }
    }
  }

  const frame = AdminPageFrame({
    eyebrow: "Operations",
    title: "Players",
    description: "Manage the current game's roster, supported administrative profile settings, and protected Player credentials.",
    actions,
    content,
  });
  route.append(frame.element);
  route.addEventListener("admin-route-intent", (event) => {
    if (event.detail?.intent === "create" && state.status !== ADMIN_DATA_STATES.STALE) addPlayer(addButton);
  });

  return {
    element: route,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      destroyDialog();
      destroyDetailDrawer();
    },
  };
}
