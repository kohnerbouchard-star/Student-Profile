from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}")
    file.write_text(text.replace(old, new, 1))


app = "player-terminal/src/app.js"
replace_once(
    app,
    'import { renderProfilePage } from "./pages/profile-page.js";\n',
    'import { renderProfilePage } from "./pages/profile-page.js";\n'
    'import { renderWorldPage } from "./pages/world-page.js";\n'
    'import { getWorldRouteViewState } from "./features/world/world-route-view-state.js";\n',
)
replace_once(
    app,
    'const PAGE_RENDERERS = Object.freeze({\n',
    '''function fallbackWorldModel(data) {
  const countries = Array.isArray(data?.countries) ? data.countries : [];
  if (!countries.length) return null;
  return {
    runtimeAvailable: false,
    countries,
    campaign: null,
    arrival: { required: false },
    travel: { state: null, activeJourney: null },
    residency: null,
    world: null
  };
}

function renderWorldRoutePage(data) {
  const view = getWorldRouteViewState();
  const resourceReady = data?.resourceStatus?.worldRuntime?.state === "ready";
  const liveModel = resourceReady && data?.worldRuntime
    ? { ...data.worldRuntime, runtimeAvailable: true }
    : null;
  const model = view.model || liveModel || fallbackWorldModel(data);
  const unavailable = view.state === "unavailable" && !model;
  const loading = !model && (view.state === "loading" || data?.resourceStatus?.worldRuntime?.state === "loading");
  return renderWorldPage(model, {
    state: unavailable ? "unavailable" : loading ? "loading" : "ready",
    message: view.message,
    quote: view.quote,
    offline: globalThis.navigator?.onLine === false,
    stale: Boolean(view.updatedAt && Date.now() - view.updatedAt > 60_000),
    capabilities: data?.capabilities || { routes: {}, actions: {} }
  });
}

const PAGE_RENDERERS = Object.freeze({
''',
)
replace_once(
    app,
    '  progression: renderProgressionPage,\n  profile: (data, ui, config) => renderProfilePage(data, config)\n',
    '  progression: renderProgressionPage,\n  world: renderWorldRoutePage,\n  profile: (data, ui, config) => renderProfilePage(data, config)\n',
)
replace_once(
    app,
    '    getState: store.getState,\n    subscribe: store.subscribe,\n',
    '    getState: store.getState,\n    subscribe: store.subscribe,\n    requestRender: render,\n',
)

Path("player-terminal/src/features/world/world-route-view-state.js").write_text('''const DEFAULT_WORLD_ROUTE_VIEW = Object.freeze({
  model: null,
  quote: null,
  state: "idle",
  message: "",
  updatedAt: 0
});

let worldRouteView = DEFAULT_WORLD_ROUTE_VIEW;

export function getWorldRouteViewState() {
  return worldRouteView;
}

export function setWorldRouteViewState(next = {}) {
  worldRouteView = Object.freeze({
    ...worldRouteView,
    ...next,
    model: next.model === undefined ? worldRouteView.model : next.model,
    quote: next.quote === undefined ? worldRouteView.quote : next.quote,
    state: String(next.state || worldRouteView.state || "idle"),
    message: String(next.message ?? worldRouteView.message ?? ""),
    updatedAt: Number(next.updatedAt ?? worldRouteView.updatedAt ?? 0)
  });
  return worldRouteView;
}

export function resetWorldRouteViewState() {
  worldRouteView = DEFAULT_WORLD_ROUTE_VIEW;
}
''')

world_flow = "player-terminal/src/features/world/world-runtime-flow.js"
replace_once(
    world_flow,
    'import { renderWorldPage } from "../../pages/world-page.js";\n',
    'import { resetWorldRouteViewState, setWorldRouteViewState } from "./world-route-view-state.js";\n',
)
replace_once(
    world_flow,
    '''  function pageHost() {
    return mount.querySelector(".player-terminal-page-host");
  }

''',
    '',
)
replace_once(
    world_flow,
    '''  function render() {
    renderScheduled = false;
    const terminalState = terminal.getState();
    if (destroyed || !isWorldRoute(terminalState)) return;
    syncTerminalWorldModel(terminalState);
    const host = pageHost();
    if (!host) return;
    const offline = globalThis.navigator?.onLine === false;
    const stale = Boolean(updatedAt && Date.now() - updatedAt > STALE_AFTER_MS);
    host.innerHTML = renderWorldPage(model, {
      state: state === "loading" && !model ? "loading" : state === "unavailable" && !model ? "unavailable" : "ready",
      message,
      quote,
      offline,
      stale,
      capabilities: currentCapabilities(),
    });
  }
''',
    '''  function render() {
    renderScheduled = false;
    const terminalState = terminal.getState();
    if (destroyed || !isWorldRoute(terminalState)) return;
    syncTerminalWorldModel(terminalState);
    setWorldRouteViewState({
      model,
      quote,
      state: state === "loading" && !model ? "loading" : state === "unavailable" && !model ? "unavailable" : "ready",
      message,
      updatedAt,
    });
    terminal.requestRender?.();
  }
''',
)
replace_once(
    world_flow,
    '''      globalThis.removeEventListener("online", handleConnectivity);
      globalThis.removeEventListener("offline", handleConnectivity);
    },
''',
    '''      globalThis.removeEventListener("online", handleConnectivity);
      globalThis.removeEventListener("offline", handleConnectivity);
      resetWorldRouteViewState();
    },
''',
)

main = "player-terminal/src/main.js"
replace_once(main, 'import { renderWorldPage } from "./pages/world-page.js";\n', '')
main_text = Path(main).read_text()
start = main_text.index('function installWorldRouteRenderBridge')
end = main_text.index('const mount = document.getElementById("playerTerminal");')
Path(main).write_text(main_text[:start] + main_text[end:])
replace_once(
    main,
    'const worldRuntime = installWorldRuntimeFlow({ mount, terminal, config });\nconst worldRouteRenderBridge = installWorldRouteRenderBridge({ mount, terminal, worldRuntime });\n',
    'const worldRuntime = installWorldRuntimeFlow({ mount, terminal, config });\n',
)
replace_once(main, '  worldRouteRenderBridge.destroy();\n', '')

keyboard = "admin/keyboard-navigation.js"
replace_once(
    keyboard,
    '  const BACKWARD_KEYS = new Set(["ArrowUp", "ArrowLeft"]);\n',
    '''  const BACKWARD_KEYS = new Set(["ArrowUp", "ArrowLeft"]);
  const FOCUS_IDENTITY_ATTRIBUTES = Object.freeze([
    "data-admin-section",
    "data-admin-terminal-action",
    "data-modal-action",
    "data-admin-player-drawer-close",
    "id",
    "name",
  ]);
  let lastFocusIdentity = null;
  let focusRestoreScheduled = false;
''',
)
replace_once(
    keyboard,
    '''  function nativeInteractive(element) {
''',
    '''  function focusIdentity(element) {
    if (!(element instanceof HTMLElement)) return null;
    for (const attribute of FOCUS_IDENTITY_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value) return Object.freeze({ attribute, value });
    }
    return null;
  }

  function resolveFocusIdentity(identity) {
    if (!identity) return null;
    const selector = `[${identity.attribute}="${CSS.escape(identity.value)}"]`;
    return [...document.querySelectorAll(selector)].find(enabled) || null;
  }

  function rememberFocusIdentity(event) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const identity = focusIdentity(target);
    if (identity) lastFocusIdentity = identity;
  }

  function restoreFocusAfterMutation() {
    if (focusRestoreScheduled || !lastFocusIdentity) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && active.isConnected && visible(active)) return;
    focusRestoreScheduled = true;
    requestAnimationFrame(() => {
      focusRestoreScheduled = false;
      const current = document.activeElement;
      if (current instanceof HTMLElement && current !== document.body && current.isConnected && visible(current)) return;
      resolveFocusIdentity(lastFocusIdentity)?.focus({ preventScroll: true });
    });
  }

  function nativeInteractive(element) {
''',
)
replace_once(
    keyboard,
    '''  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("pointerdown", markPointerModality, true);
''',
    '''  const focusObserver = new MutationObserver(restoreFocusAfterMutation);
  focusObserver.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("focusin", rememberFocusIdentity, true);
  document.addEventListener("econovaria:admin-route-mounted", restoreFocusAfterMutation);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("pointerdown", markPointerModality, true);
''',
)

smoke = "scripts/admin-mounted-keyboard-navigation-smoke.mjs"
replace_once(
    smoke,
    'async function tabRoundTrip(page, startControl, section) {\n',
    '''async function waitForStableSequentialFocusSurface(page, section) {
  let previousCount = -1;
  let stableSamples = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const snapshot = await page.evaluate((excludedSelector) => {
      const busy = Boolean(document.querySelector('[aria-busy="true"], [data-admin-shape-skeleton-stage], .admin-shape-surface-overlay'));
      const selector = "a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])";
      const count = [...document.querySelectorAll(selector)].filter((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (("disabled" in node && node.disabled === true) || node.getAttribute("aria-disabled") === "true") return false;
        if (node.closest(excludedSelector)) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }).length;
      return { busy, count };
    }, EXCLUDED_SELECTOR);
    if (!snapshot.busy && snapshot.count === previousCount) stableSamples += 1;
    else stableSamples = 0;
    if (stableSamples >= 2) return;
    previousCount = snapshot.count;
    await page.waitForTimeout(100);
  }
  throw new Error(`${section} focus surface did not reach a stable ready state.`);
}

async function tabRoundTrip(page, startControl, section) {
  await waitForStableSequentialFocusSurface(page, section);
''',
)
