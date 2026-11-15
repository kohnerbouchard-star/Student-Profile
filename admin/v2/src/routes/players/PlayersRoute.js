import { routeButton, detailContent, resolvedCatalog } from "./PlayerRoutePresentation.js";
import { AdminDialog, AdminDrawer, AdminErrorState, AdminPageFrame, AdminStaleState } from "../../components/index.js";
import { createElement } from "../../components/dom.js";
import { ADMIN_DATA_STATES } from "../../core/data-state.js";
import {
  CreatePlayerForm,
  PlayerCredentialForm,
  PlayerProfileForm,
} from "./PlayerForms.js";
import { PlayersSkeleton } from "./PlayersSkeleton.js";

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
