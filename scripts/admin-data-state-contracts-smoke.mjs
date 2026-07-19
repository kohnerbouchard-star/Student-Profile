import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts/data-states";
const STATES = ["loading", "loaded", "refreshing", "stale", "empty", "failed"];

mkdirSync(ARTIFACT_DIR, { recursive: true });

function assert(value, message) {
  if (!value) throw new Error(message);
}

function source(path) {
  return readFileSync(resolve(ROOT, path), "utf8");
}

const controllerSource = source("admin/data-state-contracts.js");
const cssSource = source("admin/css/data-state-contracts.css");
const indexSource = source("admin/index.html");
const workflowSource = source(".github/workflows/admin-shell-smoke.yml");

for (const state of STATES) {
  assert(controllerSource.includes(`"${state}"`), `Admin data-state controller is missing ${state}.`);
}
assert(
  controllerSource.includes("econovaria:admin-request-lifecycle"),
  "Admin data-state controller is not bound to explicit request lifecycle events.",
);
assert(
  controllerSource.includes("econovaria:admin-data-state-changed"),
  "Admin data-state controller does not publish state changes.",
);
assert(
  controllerSource.includes("detail.pageRead !== true"),
  "Admin data-state controller does not restrict itself to page reads.",
);
assert(
  controllerSource.includes("data-admin-data-state-panel"),
  "Admin data-state controller is missing its status surface contract.",
);
assert(!controllerSource.includes("MutationObserver"), "Admin data-state controller introduces DOM observation.");
assert(!controllerSource.includes("window.fetch ="), "Admin data-state controller wraps global fetch.");
assert(!controllerSource.includes("style.cssText"), "Admin data-state controller introduces inline presentation.");
assert(
  cssSource.includes('[data-state="stale"]') && cssSource.includes('[data-state="failed"]'),
  "Admin data-state styling is missing persistent stale or failed states.",
);
assert(
  indexSource.includes('./css/data-state-contracts.css'),
  "Admin shell does not load the data-state stylesheet.",
);
assert(
  indexSource.includes('./data-state-contracts.js'),
  "Admin shell does not load the data-state controller.",
);
assert(
  workflowSource.includes("scripts/admin-data-state-contracts-smoke.mjs"),
  "Admin Shell workflow does not track the data-state smoke.",
);
assert(
  workflowSource.includes("Exercise Admin data-state contracts"),
  "Admin Shell workflow does not execute the data-state smoke.",
);

async function createFixture(browser, model = null) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await context.newPage();
  await page.setContent(`<!doctype html>
    <html><body>
      <div id="adminPreview">
        <main class="admin-terminal-shell-main">
          <section id="existing-data">Current player data remains visible.</section>
          <div class="admin-qol-page-skeleton" hidden></div>
        </main>
      </div>
    </body></html>`);
  await page.evaluate((initialModel) => {
    window.__adminDataStateRoute = "players";
    window.__adminDataStateRefreshCalls = [];
    window.__adminDataStateEvents = [];
    window.__adminDataStatePointerEvents = [];
    for (const type of ["pointerdown", "mousedown", "touchstart"]) {
      window.addEventListener(type, (event) => {
        window.__adminDataStatePointerEvents.push({ type, target: event.target?.tagName || "" });
      }, true);
    }
    window.EconovariaAdminShapeSkeletons = {
      activeRoute() {
        return window.__adminDataStateRoute;
      },
      beginRefresh(label) {
        window.__adminDataStateRefreshCalls.push({ type: "begin", label });
        return document.createElement("div");
      },
      endRefresh(label) {
        window.__adminDataStateRefreshCalls.push({ type: "end", label });
      },
    };
    window.Econovaria = {
      features: {
        adminOverviewTerminal: {
          currentModel: initialModel,
        },
      },
    };
    document.addEventListener("econovaria:admin-data-state-changed", (event) => {
      window.__adminDataStateEvents.push(event.detail);
    });
  }, model);
  await page.addScriptTag({ url: new URL("data-state-contracts.js", BASE_URL).href });
  await page.waitForFunction(() => Boolean(window.EconovariaAdminDataStates));
  return { context, page };
}

async function dispatchLifecycle(page, detail) {
  await page.evaluate((payload) => {
    document.dispatchEvent(new CustomEvent("econovaria:admin-request-lifecycle", {
      detail: payload,
    }));
  }, detail);
  await page.waitForTimeout(30);
}

async function stateSnapshot(page) {
  return page.evaluate(() => {
    const main = document.querySelector(".admin-terminal-shell-main");
    const panel = document.querySelector("[data-admin-data-state-panel]");
    const skeleton = main?.querySelector(":scope > .admin-qol-page-skeleton");
    return {
      state: main?.dataset.adminDataState || "",
      route: main?.dataset.adminDataRoute || "",
      busy: main?.getAttribute("aria-busy") || "",
      existingVisible: Boolean(document.getElementById("existing-data")?.checkVisibility?.() ?? true),
      skeletonHidden: Boolean(skeleton?.hidden),
      panelHidden: Boolean(panel?.hidden),
      panelState: panel?.dataset.state || "",
      panelRole: panel?.getAttribute("role") || "",
      panelTitle: panel?.querySelector("[data-admin-data-state-title]")?.textContent || "",
      panelDetail: panel?.querySelector("[data-admin-data-state-detail]")?.textContent || "",
      refreshCalls: window.__adminDataStateRefreshCalls || [],
      events: window.__adminDataStateEvents || [],
      pointerEvents: window.__adminDataStatePointerEvents || [],
      apiState: window.EconovariaAdminDataStates?.getState?.("players") || null,
    };
  });
}

const browser = await chromium.launch({ headless: true });
const report = {
  sourceContracts: "passed",
  lifecycle: {},
};

try {
  {
    const { context, page } = await createFixture(browser, null);
    try {
      let snapshot = await stateSnapshot(page);
      assert(snapshot.state === "loading", `Initial state was ${snapshot.state}, expected loading.`);
      assert(snapshot.busy === "true", "Initial loading state did not set aria-busy.");

      await dispatchLifecycle(page, {
        requestId: "initial-read",
        pageRead: true,
        phase: "started",
        route: "players",
      });
      await page.evaluate(() => {
        window.Econovaria.features.adminOverviewTerminal.currentModel = {
          players: [{ id: "player-public-1", displayName: "Existing Player" }],
        };
      });
      await dispatchLifecycle(page, {
        requestId: "initial-read",
        pageRead: true,
        phase: "committed",
        route: "players",
        empty: false,
      });
      snapshot = await stateSnapshot(page);
      assert(snapshot.state === "loaded", `Committed initial read produced ${snapshot.state}.`);
      assert(snapshot.busy === "", "Loaded state retained aria-busy.");
      assert(snapshot.panelHidden, "Loaded state left a persistent status panel visible.");
      report.lifecycle.loaded = snapshot;

      await dispatchLifecycle(page, {
        requestId: "refresh-read",
        pageRead: true,
        phase: "started",
        route: "players",
      });
      snapshot = await stateSnapshot(page);
      assert(snapshot.state === "refreshing", `Background read produced ${snapshot.state}.`);
      assert(snapshot.busy === "true", "Refreshing state did not set aria-busy.");
      assert(snapshot.existingVisible, "Refreshing removed valid rendered data.");
      assert(snapshot.skeletonHidden, "Refreshing exposed the page skeleton over valid data.");
      assert(snapshot.refreshCalls.some((entry) => entry.type === "begin"), "Refreshing did not use the subtle refresh indicator.");
      report.lifecycle.refreshing = snapshot;

      await dispatchLifecycle(page, {
        requestId: "refresh-read",
        pageRead: true,
        phase: "failed",
        route: "players",
        message: "Refresh service unavailable.",
      });
      snapshot = await stateSnapshot(page);
      assert(snapshot.state === "stale", `Failed refresh produced ${snapshot.state}.`);
      assert(snapshot.busy === "", "Stale state retained aria-busy.");
      assert(snapshot.existingVisible, "Stale state removed the last valid data.");
      assert(!snapshot.panelHidden && snapshot.panelState === "stale", "Stale state did not expose its persistent warning.");
      assert(snapshot.panelDetail.includes("Refresh service unavailable"), "Stale state did not preserve the authoritative error message.");
      report.lifecycle.stale = snapshot;

      await dispatchLifecycle(page, {
        requestId: "empty-refresh",
        pageRead: true,
        phase: "started",
        route: "players",
      });
      await page.evaluate(() => {
        window.Econovaria.features.adminOverviewTerminal.currentModel = { players: [] };
      });
      await dispatchLifecycle(page, {
        requestId: "empty-refresh",
        pageRead: true,
        phase: "committed",
        route: "players",
        empty: true,
      });
      snapshot = await stateSnapshot(page);
      assert(snapshot.state === "empty", `Explicit empty result produced ${snapshot.state}.`);
      assert(!snapshot.panelHidden && snapshot.panelState === "empty", "Empty state did not expose its explicit status.");
      assert(snapshot.panelTitle === "No data yet", "Empty state used the wrong title.");
      assert(snapshot.apiState?.settled === true, "Empty state was not retained as a settled response.");
      assert(snapshot.pointerEvents.length === 0, "Data-state lifecycle emitted pointer input.");
      assert(snapshot.events.some((entry) => entry.state === "loaded"), "Loaded state-change event was not emitted.");
      assert(snapshot.events.some((entry) => entry.state === "refreshing"), "Refreshing state-change event was not emitted.");
      assert(snapshot.events.some((entry) => entry.state === "stale"), "Stale state-change event was not emitted.");
      assert(snapshot.events.some((entry) => entry.state === "empty"), "Empty state-change event was not emitted.");
      report.lifecycle.empty = snapshot;
    } finally {
      await context.close();
    }
  }

  {
    const { context, page } = await createFixture(browser, null);
    try {
      await dispatchLifecycle(page, {
        requestId: "failed-initial-read",
        pageRead: true,
        phase: "started",
        route: "players",
      });
      await dispatchLifecycle(page, {
        requestId: "failed-initial-read",
        pageRead: true,
        phase: "failed",
        route: "players",
        message: "Initial request failed.",
      });
      const snapshot = await stateSnapshot(page);
      assert(snapshot.state === "failed", `First-load failure produced ${snapshot.state}.`);
      assert(snapshot.busy === "", "Failed state retained aria-busy.");
      assert(!snapshot.panelHidden && snapshot.panelState === "failed", "Failed state did not expose a persistent alert.");
      assert(snapshot.panelRole === "alert", "Failed state is not announced as an alert.");
      assert(snapshot.panelDetail.includes("Initial request failed"), "Failed state did not preserve the error message.");
      assert(snapshot.apiState?.settled === false, "Failed first load was incorrectly marked settled.");
      assert(snapshot.pointerEvents.length === 0, "Failed data-state lifecycle emitted pointer input.");
      report.lifecycle.failed = snapshot;
    } finally {
      await context.close();
    }
  }

  writeFileSync(`${ARTIFACT_DIR}/admin-data-state-contracts.json`, JSON.stringify(report, null, 2));
  console.log("Admin loading, loaded, refreshing, stale, empty, and failed data-state contracts passed.");
} catch (error) {
  report.failure = error.stack || error.message || String(error);
  writeFileSync(`${ARTIFACT_DIR}/admin-data-state-contracts.json`, JSON.stringify(report, null, 2));
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await browser.close();
}
