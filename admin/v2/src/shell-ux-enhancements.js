import { AdminDrawer, AdminIcon } from "./components/index.js";
import { createElement } from "./components/dom.js";

const EMPTY_CODES = new Set(["", "-", "—", "undefined", "null"]);

function text(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeGameCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (EMPTY_CODES.has(code.toLowerCase())) return "";
  return /^[A-Z0-9-]{4,64}$/.test(code) ? code : "";
}

function sessionGame(session, selectedGameId) {
  const games = Array.isArray(session?.activeGameSessions) ? session.activeGameSessions : [];
  return games.find((game) => text(game?.id || game?.gameId) === selectedGameId) || null;
}

function currentGameContext(mount, session, selectedGameId) {
  const fallback = sessionGame(session, selectedGameId) || {};
  const navigation = mount.querySelector(".admin-navigation");
  const gameContext = navigation?.querySelector(".admin-navigation__game-context");
  const name = text(
    gameContext?.querySelector(".admin-navigation__game-copy strong")?.textContent
      || fallback.name,
    "Current game",
  );
  const code = normalizeGameCode(
    gameContext?.querySelector(".admin-navigation__game-meta code")?.textContent
      || fallback.gameCode
      || fallback.joinCode,
  );
  const status = text(
    gameContext?.querySelector(".admin-navigation__game-meta span")?.textContent
      || fallback.status,
    "Status unavailable",
  );
  return { name, code, status };
}

function playerJoinUrl(code) {
  if (!code) return "";
  try {
    const url = new URL("/play", window.location.origin);
    url.searchParams.set("gameCode", code);
    url.searchParams.set("mode", "student");
    return url.toString();
  } catch (_error) {
    return "";
  }
}

async function copyText(value) {
  const clipboard = globalThis.navigator?.clipboard;
  if (!value || typeof clipboard?.writeText !== "function") return false;
  try {
    await clipboard.writeText(value);
    return true;
  } catch (_error) {
    return false;
  }
}

function setMessage(element, message, tone = "") {
  element.textContent = message;
  if (tone) element.dataset.tone = tone;
  else delete element.dataset.tone;
}

function shareDrawerContent({ game, onRefresh }) {
  const root = createElement("div", { className: "admin-shell-share" });
  const codePanel = createElement("section", {
    className: "admin-shell-share__code-panel",
    attrs: { "aria-label": "Current game share code" },
    children: [
      createElement("small", { text: game.name }),
      createElement("strong", {
        className: "admin-shell-share__code",
        text: game.code || "Code unavailable",
      }),
      createElement("span", { className: "admin-u-muted", text: game.status }),
    ],
  });
  const message = createElement("p", {
    className: "admin-shell-share__message",
    attrs: { role: "status", "aria-live": "polite" },
    text: game.code
      ? "Share this code or the player link with students joining this game."
      : "The current game has not exposed a readable share code yet.",
  });
  const actions = createElement("div", { className: "admin-shell-share__actions" });
  const copyCode = createElement("button", {
    className: "admin-button",
    attrs: { type: "button", disabled: !game.code },
    text: "Copy code",
  });
  const playerUrl = playerJoinUrl(game.code);
  const copyLink = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button", disabled: !playerUrl },
    text: "Copy player link",
  });
  const nativeShare = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button", disabled: !game.code || typeof globalThis.navigator?.share !== "function" },
    text: "Share…",
  });

  copyCode.addEventListener("click", async () => {
    const copied = await copyText(game.code);
    setMessage(
      message,
      copied ? "Game code copied." : "The browser could not copy the game code.",
      copied ? "success" : "error",
    );
  });
  copyLink.addEventListener("click", async () => {
    const copied = await copyText(playerUrl);
    setMessage(
      message,
      copied ? "Player join link copied." : "The browser could not copy the player link.",
      copied ? "success" : "error",
    );
  });
  nativeShare.addEventListener("click", async () => {
    try {
      await globalThis.navigator.share({
        title: `Join ${game.name}`,
        text: `Game code: ${game.code}`,
        url: playerUrl || undefined,
      });
      setMessage(message, "Game access shared.", "success");
    } catch (error) {
      if (error?.name !== "AbortError") {
        setMessage(message, "The browser could not open the share sheet.", "error");
      }
    }
  });

  const refresh = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button" },
    text: "Refresh code",
  });
  refresh.addEventListener("click", () => onRefresh?.());

  actions.append(copyCode, copyLink);
  if (typeof globalThis.navigator?.share === "function") actions.append(nativeShare);
  actions.append(refresh);
  root.append(codePanel, actions, message);
  return root;
}

function findDrawer(title) {
  return [...document.querySelectorAll(".admin-drawer")].find((drawer) =>
    text(drawer.querySelector(".admin-dialog__title")?.textContent) === title,
  ) || null;
}

function closeDrawerElement(drawer) {
  drawer?.querySelector(".admin-dialog__close")?.click();
}

function enhanceAccountDrawer({ mount }) {
  const identityButton = mount.querySelector(".admin-topbar__identity");
  const accountDrawer = findDrawer("Administrator account");
  if (!identityButton || !accountDrawer) return () => {};

  identityButton.dataset.adminInteractive = "account";
  identityButton.title = "Open administrator account";
  const body = accountDrawer.querySelector(".admin-dialog__body");
  if (!body || body.querySelector(".admin-shell-account-actions")) return () => {};

  const actions = createElement("div", {
    className: "admin-shell-account-actions",
    attrs: { "aria-label": "Administrator account actions" },
  });
  const settings = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button" },
    text: "Settings",
  });
  const switchGame = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button" },
    text: "Switch game",
  });
  const signOut = createElement("button", {
    className: "admin-button admin-button--quiet",
    attrs: { type: "button", "data-tone": "danger" },
    text: "Sign out",
  });

  function openSettings() {
    closeDrawerElement(accountDrawer);
    window.location.hash = "settings";
  }
  function openGameSelector() {
    closeDrawerElement(accountDrawer);
    globalThis.setTimeout(() => mount.querySelector(".admin-navigation__game-context")?.click(), 0);
  }
  async function performSignOut() {
    if (!window.confirm("Sign out of the administrator console?")) return;
    signOut.disabled = true;
    try {
      await window.EconovariaAdminAuthSession?.signOut?.();
    } finally {
      const destination = new URL("../", window.location.href);
      destination.searchParams.set("mode", "admin");
      destination.searchParams.set("reason", "signed-out");
      window.location.replace(destination.href);
    }
  }

  settings.addEventListener("click", openSettings);
  switchGame.addEventListener("click", openGameSelector);
  signOut.addEventListener("click", performSignOut);
  actions.append(settings, switchGame, signOut);
  body.append(actions);

  return () => {
    settings.removeEventListener("click", openSettings);
    switchGame.removeEventListener("click", openGameSelector);
    signOut.removeEventListener("click", performSignOut);
    actions.remove();
  };
}

function enhanceNotificationButton(mount) {
  const button = mount.querySelector(".admin-topbar__notification");
  if (!button) return;
  button.dataset.adminInteractive = "notifications";
  button.title = "Open notifications";
  if (!button.querySelector(".admin-topbar__action-label")) {
    const label = createElement("span", { className: "admin-topbar__action-label", text: "Notifications" });
    const badge = button.querySelector(".admin-topbar__notification-count");
    if (badge) badge.before(label);
    else button.append(label);
  }
}

/**
 * Adds shell-level affordances that intentionally stay outside route ownership:
 * share access, account quick actions, and stronger navigation/action cues.
 */
export function attachAdminShellUx({ mount, session, selectedGameId } = {}) {
  if (!(mount instanceof HTMLElement)) return { destroy() {} };
  const topbarActions = mount.querySelector(".admin-topbar__actions");
  if (!topbarActions) return { destroy() {} };

  enhanceNotificationButton(mount);
  const cleanupAccount = enhanceAccountDrawer({ mount });
  const shareDrawer = AdminDrawer({
    title: "Share game access",
    description: "Copy the current game code or player join link.",
    content: null,
  });
  const shareButton = createElement("button", {
    className: "admin-button admin-button--quiet admin-topbar__share",
    dataset: { adminInteractive: "share-code" },
    attrs: { type: "button", "aria-label": "Share current game code" },
    children: [
      AdminIcon({ name: "game", size: 18 }),
      createElement("span", { className: "admin-topbar__share-label", text: "Share" }),
      createElement("code", { className: "admin-topbar__share-code" }),
    ],
  });

  function renderShareContent() {
    const game = currentGameContext(mount, session, selectedGameId);
    const code = shareButton.querySelector(".admin-topbar__share-code");
    if (code) code.textContent = game.code || "CODE";
    shareButton.setAttribute(
      "aria-label",
      game.code ? `Share current game code ${game.code}` : "Share current game code",
    );
    shareDrawer.setContent(shareDrawerContent({
      game,
      onRefresh() {
        renderShareContent();
      },
    }));
  }

  function openShareDrawer() {
    renderShareContent();
    shareDrawer.open(shareButton);
  }

  renderShareContent();
  shareButton.addEventListener("click", openShareDrawer);
  const notificationButton = topbarActions.querySelector(".admin-topbar__notification");
  topbarActions.insertBefore(shareButton, notificationButton || topbarActions.firstChild);

  return {
    destroy() {
      shareButton.removeEventListener("click", openShareDrawer);
      shareButton.remove();
      cleanupAccount();
      shareDrawer.destroy();
    },
  };
}
