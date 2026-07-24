const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
const GAME_CODE_CACHE_PREFIX = "econovaria.admin.game-code.v1:";
const CANONICAL_PACK_ID = "econovaria.beta-seed-pack.v1";
const MAX_MOUNT_FRAMES = 180;
let activeModal = null;
let mountFrame = 0;

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function ensureStylesheet() {
  const href = new URL("./css/game-creation-controls.css", import.meta.url).href;
  if ([...document.styleSheets].some((sheet) => sheet.href === href)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.econovariaGameCreationStyles = "true";
  document.head.append(link);
}

function defaultTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul";
  } catch {
    return "Asia/Seoul";
  }
}

function runtimeConfig() {
  return window.EconovariaRuntimeConfig || {};
}

function endpoint() {
  const configured = text(runtimeConfig().adminApiUrl);
  return configured
    ? `${configured.replace(/\/$/, "")}/games`
    : "/api/admin/games";
}

async function usableSession() {
  const manager = window.EconovariaAdminAuthSession;
  const session = await manager?.getUsableSession?.({ minimumValidityMs: 60000 });
  if (!session?.accessToken) throw new Error("Administrator session is unavailable.");
  return session;
}

function idempotencyKey() {
  return `game.create.${crypto.randomUUID()}`;
}

async function createGame(input) {
  const session = await usableSession();
  const config = runtimeConfig();
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Idempotency-Key": idempotencyKey(),
  };
  if (config.supabasePublishableKey) headers.apikey = config.supabasePublishableKey;
  headers.Authorization = `Bearer ${session.accessToken}`;

  const response = await fetch(endpoint(), {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: input.name,
      difficultyPreset: input.difficultyPreset,
      stockMarketWindow: { timezone: input.timezone },
      packId: CANONICAL_PACK_ID,
    }),
    credentials: endpoint().startsWith("/") ? "same-origin" : "omit",
    cache: "no-store",
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = text(payload?.message) ||
      "The multiplayer game could not be created. No partial game was activated.";
    const error = new Error(message);
    error.status = response.status;
    error.code = text(payload?.code);
    throw error;
  }

  const data = payload?.data || {};
  const game = data.game || {};
  const gameId = text(game.id || game.gameId);
  if (!gameId || text(game.provisioningStatus) !== "ready") {
    throw new Error("The multiplayer game did not reach a ready state.");
  }
  return {
    game,
    gameId,
    joinCode: text(data.joinCode || game.joinCode || game.gameCode),
    joinCodeReissueRequired: data.joinCodeReissueRequired === true,
    counts: data.counts || {},
    contentGates: data.contentGates || {},
  };
}

function updateRuntimeModel(game) {
  const feature = window.Econovaria?.features?.adminOverviewTerminal;
  const model = feature?.currentModel;
  if (!model || typeof model !== "object") return;

  const games = Array.isArray(model.games) ? model.games : [];
  const nextGames = games.filter((entry) => text(entry?.id || entry?.gameId) !== text(game.id));
  nextGames.unshift(game);
  model.games = nextGames;
  model.activeGame = game;
  model.selectedGame = game;
  model.gameName = game.name;
  model.selectedGameName = game.name;
}

function selectCreatedGame(result) {
  sessionStorage.setItem(SELECTED_GAME_KEY, result.gameId);
  if (result.joinCode) {
    sessionStorage.setItem(
      `${GAME_CODE_CACHE_PREFIX}${result.gameId}`,
      result.joinCode,
    );
  }
  updateRuntimeModel(result.game);
  window.dispatchEvent(new CustomEvent("econovaria:admin-game-created", {
    detail: Object.freeze({
      gameId: result.gameId,
      gameName: text(result.game.name),
      provisioningStatus: "ready",
      joinCodeAvailable: Boolean(result.joinCode),
    }),
  }));
  window.dispatchEvent(new CustomEvent("econovaria:admin-session-refreshed", {
    detail: { reason: "game-created" },
  }));
  window.EconovariaAdminGameSessionControls?.reconcile?.();
}

function focusableElements(root) {
  return [...root.querySelectorAll(
    "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
  )].filter((node) => {
    if (!(node instanceof HTMLElement)) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  });
}

function closeModal({ restoreFocus = true } = {}) {
  if (!activeModal) return;
  const opener = activeModal.opener;
  activeModal.backdrop.remove();
  activeModal = null;
  if (restoreFocus && opener instanceof HTMLElement && opener.isConnected) {
    opener.focus({ preventScroll: true });
  }
}

function statusMessage(form, message, state = "info") {
  const status = form.querySelector("[data-econovaria-game-create-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function renderSuccess(form, result) {
  const fields = form.querySelector("[data-econovaria-game-create-fields]");
  const actions = form.querySelector("[data-econovaria-game-create-actions]");
  if (fields) fields.hidden = true;
  if (actions) actions.hidden = true;

  const success = document.createElement("section");
  success.className = "econovaria-game-create-success";
  success.dataset.econovariaGameCreateSuccess = "true";
  success.innerHTML = `
    <span class="econovaria-game-create-success__eyebrow">Game ready</span>
    <h3></h3>
    <p>Players who use this Game Code will join this multiplayer game instance.</p>
    <div class="econovaria-game-create-success__code">
      <small>One-time Game Code</small>
      <strong></strong>
    </div>
    <dl>
      <div><dt>Market assets</dt><dd></dd></div>
      <div><dt>Contracts</dt><dd></dd></div>
      <div><dt>Store items</dt><dd></dd></div>
      <div><dt>World locations</dt><dd></dd></div>
    </dl>
    <footer>
      <button type="button" data-econovaria-created-game-share>Share game</button>
      <button type="button" data-econovaria-created-game-close>Continue to Admin</button>
    </footer>
  `;
  success.querySelector("h3").textContent = text(result.game.name) || "New game";
  success.querySelector("strong").textContent = result.joinCode ||
    (result.joinCodeReissueRequired ? "Create a replacement code in Share" : "Code unavailable");
  const values = [
    result.counts.marketAssets ?? 240,
    result.counts.contracts ?? 30,
    result.counts.storeItems ?? 50,
    result.counts.worldLocations ?? 50,
  ];
  success.querySelectorAll("dd").forEach((node, index) => {
    node.textContent = String(values[index]);
  });
  form.append(success);
  statusMessage(form, "Provisioning completed. The new game is active and selected.", "success");

  success.querySelector("[data-econovaria-created-game-share]")?.addEventListener("click", () => {
    closeModal({ restoreFocus: false });
    window.EconovariaAdminGameSessionControls?.reconcile?.();
    requestAnimationFrame(() => {
      document.querySelector("[data-econovaria-share-game]")?.click();
    });
  });
  success.querySelector("[data-econovaria-created-game-close]")?.addEventListener("click", () => {
    closeModal({ restoreFocus: false });
    document.querySelector("[data-econovaria-selected-game-name]")?.focus?.({ preventScroll: true });
  });
  success.querySelector("[data-econovaria-created-game-share]")?.focus({ preventScroll: true });
}

function createModal(opener) {
  closeModal({ restoreFocus: false });
  const backdrop = document.createElement("div");
  backdrop.className = "econovaria-game-create-backdrop";
  backdrop.dataset.modalId = "create-multiplayer-game";
  backdrop.dataset.adminTerminalModalBackdrop = "true";
  backdrop.innerHTML = `
    <section class="econovaria-game-create-dialog" role="dialog" aria-modal="true"
      aria-labelledby="econovariaCreateGameTitle" aria-describedby="econovariaCreateGameDescription">
      <header>
        <div>
          <small>Multiplayer game setup</small>
          <h2 id="econovariaCreateGameTitle">Create a new game</h2>
        </div>
        <button type="button" data-econovaria-game-create-close aria-label="Close game creation">×</button>
      </header>
      <p id="econovariaCreateGameDescription">
        Econovaria will create an isolated game, load its approved shared content, verify it, and then issue the Game Code players use to join.
      </p>
      <form novalidate>
        <div data-econovaria-game-create-fields>
          <label>
            <span>Game name</span>
            <input name="gameName" maxlength="120" required autocomplete="off"
              placeholder="Example: Period 4 Economy" />
          </label>
          <label>
            <span>Difficulty</span>
            <select name="difficultyPreset" required>
              <option value="easy">Easy</option>
              <option value="moderate" selected>Moderate</option>
              <option value="hard">Hard</option>
              <option value="insane">Insane</option>
            </select>
          </label>
          <label>
            <span>Market timezone</span>
            <input name="timezone" required autocomplete="off" />
            <small>Use an IANA timezone, such as Asia/Seoul or America/New_York.</small>
          </label>
          <aside>
            <strong>Loaded automatically</strong>
            <ul>
              <li>240 market assets across ten countries</li>
              <li>30 Contracts and 50 Store items</li>
              <li>50 World locations and 13 travel routes</li>
              <li>Marketplace, Messaging, country, and Arrival Class configuration</li>
            </ul>
            <p>Crafting and Story remain unavailable until their content approvals are complete.</p>
          </aside>
        </div>
        <p role="status" aria-live="polite" data-econovaria-game-create-status></p>
        <footer data-econovaria-game-create-actions>
          <button type="button" data-econovaria-game-create-cancel>Cancel</button>
          <button type="submit" data-econovaria-game-create-submit>Create and provision game</button>
        </footer>
      </form>
    </section>
  `;
  const form = backdrop.querySelector("form");
  const timezone = form.elements.namedItem("timezone");
  if (timezone instanceof HTMLInputElement) timezone.value = defaultTimeZone();

  const close = () => closeModal();
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop || event.target.closest("[data-econovaria-game-create-close], [data-econovaria-game-create-cancel]")) {
      close();
    }
  });
  backdrop.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = focusableElements(backdrop);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector("[data-econovaria-game-create-submit]");
    const values = new FormData(form);
    const name = text(values.get("gameName"));
    const difficultyPreset = text(values.get("difficultyPreset"));
    const timezoneValue = text(values.get("timezone"));
    if (!name) {
      statusMessage(form, "Enter a game name.", "error");
      form.elements.namedItem("gameName")?.focus();
      return;
    }
    if (!timezoneValue || !timezoneValue.includes("/")) {
      statusMessage(form, "Enter a valid IANA market timezone.", "error");
      form.elements.namedItem("timezone")?.focus();
      return;
    }

    submit.disabled = true;
    form.setAttribute("aria-busy", "true");
    statusMessage(form, "Creating the game and loading shared content…", "pending");
    try {
      const result = await createGame({ name, difficultyPreset, timezone: timezoneValue });
      selectCreatedGame(result);
      renderSuccess(form, result);
    } catch (error) {
      statusMessage(
        form,
        text(error?.message) || "The game could not be provisioned. No partial game was activated.",
        "error",
      );
      submit.disabled = false;
    } finally {
      form.removeAttribute("aria-busy");
    }
  });

  document.body.append(backdrop);
  activeModal = { backdrop, opener };
  form.elements.namedItem("gameName")?.focus({ preventScroll: true });
}

function mountButton() {
  const card = document.querySelector("[data-econovaria-game-session-card]");
  if (!(card instanceof HTMLElement)) return false;
  if (card.querySelector("[data-econovaria-create-game]")) return true;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "econovaria-admin-create-game-button";
  button.dataset.econovariaCreateGame = "true";
  button.dataset.adminTerminalAction = "create-multiplayer-game";
  button.textContent = "New game";
  button.setAttribute("aria-label", "Create and provision a new multiplayer game");
  const logout = card.querySelector("[data-econovaria-admin-logout]");
  card.insertBefore(button, logout || null);
  return true;
}

function scheduleMount() {
  if (mountFrame) cancelAnimationFrame(mountFrame);
  let frames = 0;
  const step = () => {
    frames += 1;
    if (mountButton() || frames >= MAX_MOUNT_FRAMES) {
      mountFrame = 0;
      return;
    }
    mountFrame = requestAnimationFrame(step);
  };
  mountFrame = requestAnimationFrame(step);
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-econovaria-create-game]");
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  createModal(button);
}, true);

window.addEventListener("econovaria:admin-session-refreshed", scheduleMount);
window.addEventListener("econovaria:admin-game-created", scheduleMount);
ensureStylesheet();
scheduleMount();

window.EconovariaAdminGameCreation = Object.freeze({
  createGame,
  createModal,
  mountButton,
});
