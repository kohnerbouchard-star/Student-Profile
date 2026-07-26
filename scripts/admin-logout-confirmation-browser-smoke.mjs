import { writeFileSync } from "node:fs";
import {
  BASE_URL,
  createQualityHarness,
  GAME_ID,
} from "./admin-quality-smoke-fixture.mjs";

const GAME_CODE = "QUALITY1";
const GAME_NAME = "Quality Game";
const ADMIN_EMAIL = "admin@example.test";
const LOGOUT_SNAPSHOT_KEY = "econovaria.admin.logout-snapshot.v1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const harness = await createQualityHarness("logout-confirmation");
const { page, errors, dir } = harness;
const requests = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("request", (request) => requests.push(`${request.method()} ${request.url()}`));

await page.addInitScript(({ gameId, gameCode, snapshotKey }) => {
  sessionStorage.setItem(`econovaria.admin.game-code.v1:${gameId}`, gameCode);
  if (!window.__econovariaLogoutSnapshotInstalled) {
    window.__econovariaLogoutSnapshotInstalled = true;
    window.addEventListener("beforeunload", () => {
      try {
        localStorage.setItem(snapshotKey, JSON.stringify({
          session: sessionStorage.getItem("econovaria.admin.auth.v1"),
          selectedGame: sessionStorage.getItem("econovaria.admin.selected-game.v1"),
          csrf: sessionStorage.getItem("econovaria.admin.csrf.v1"),
        }));
      } catch (_) {}
    });
  }
}, { gameId: GAME_ID, gameCode: GAME_CODE, snapshotKey: LOGOUT_SNAPSHOT_KEY });

await page.route("**/functions/v1/web-session-api/logout", async (route) => {
  const request = route.request();
  assert(!request.headers().authorization, "Admin logout exposed a Staff bearer token.");
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store" },
    body: JSON.stringify({ ok: true }),
  });
});

async function clickRealAccountLogout() {
  const user = page.locator("[data-admin-terminal-user]").first();
  await user.waitFor({ state: "visible", timeout: 10_000 });
  await user.click();
  const menu = page.locator("[data-admin-terminal-user-menu]").first();
  await menu.waitFor({ state: "visible", timeout: 5_000 });
  const candidates = menu.locator("button, a, [role='button'], [data-admin-terminal-action]");
  const metadata = await candidates.evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const signals = [
      node.getAttribute("data-admin-terminal-action"),
      node.getAttribute("data-action"),
      node.getAttribute("data-econovaria-admin-logout"),
      node.id,
      node.getAttribute("aria-label"),
      node.getAttribute("title"),
      node.textContent,
    ].map((value) => String(value || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    return {
      outerHTML: node.outerHTML.slice(0, 1200),
      signals,
      visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
    };
  }));
  writeFileSync(`${dir}/real-account-menu-controls.json`, JSON.stringify(metadata, null, 2));
  const logoutIndex = metadata.findIndex((entry) => entry.visible && entry.signals.some((signal) =>
    /(?:^|[\s_-])(?:sign[\s_-]*out|log[\s_-]*out|logout)(?:$|[\s_-])/i.test(` ${signal} `)
  ));
  assert(logoutIndex >= 0, `No real account-menu logout control found: ${JSON.stringify(metadata)}`);
  const logoutControl = candidates.nth(logoutIndex);
  const selected = metadata[logoutIndex];
  await logoutControl.click();
  return selected;
}

const report = {};
try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshotKey) => localStorage.removeItem(snapshotKey), LOGOUT_SNAPSHOT_KEY);
  await page.locator("#adminPreview:not([hidden])").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("[data-admin-terminal-user]").first().waitFor({ state: "visible", timeout: 10_000 });

  const realControl = await clickRealAccountLogout();
  const modal = page.locator("[data-econovaria-admin-logout-confirmation]");
  await modal.waitFor({ state: "visible", timeout: 5_000 });
  const legacyVisible = await page.locator("[data-admin-terminal-modal-backdrop]").evaluateAll((nodes) => nodes.filter((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return !node.hidden && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }).length);
  assert(legacyVisible === 0, `Legacy logout modal remained visible alongside the owned confirmation: ${legacyVisible}`);

  const state = await modal.evaluate((surface) => {
    const dialog = surface.querySelector('[role="dialog"]');
    const title = surface.querySelector("h2").getBoundingClientRect();
    const description = surface.querySelector(".econovaria-admin-logout-confirmation__description").getBoundingClientRect();
    const context = surface.querySelector(".econovaria-admin-logout-confirmation__context").getBoundingClientRect();
    const actionsNode = surface.querySelector(".econovaria-admin-logout-confirmation__actions");
    const actions = actionsNode.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();
    const buttons = [...actionsNode.querySelectorAll("button")].map((button) => {
      const rect = button.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    return {
      account: surface.querySelector("[data-econovaria-logout-account]")?.textContent?.trim(),
      game: surface.querySelector("[data-econovaria-logout-game]")?.textContent?.trim(),
      code: surface.querySelector("[data-econovaria-logout-code]")?.textContent?.trim(),
      dialog: { width: dialogRect.width, height: dialogRect.height, top: dialogRect.top, bottom: dialogRect.bottom },
      viewport: { width: innerWidth, height: innerHeight },
      titleBottom: title.bottom,
      descriptionTop: description.top,
      descriptionBottom: description.bottom,
      contextTop: context.top,
      contextBottom: context.bottom,
      actionsTop: actions.top,
      actionsHeight: actions.height,
      actionsDisplay: getComputedStyle(actionsNode).display,
      actionsDirection: getComputedStyle(actionsNode).flexDirection,
      buttons,
      horizontalOverflow: dialog.scrollWidth > dialog.clientWidth + 1,
    };
  });
  assert(state.account === ADMIN_EMAIL, `Logout modal account drifted: ${state.account}`);
  assert(state.game === GAME_NAME, `Logout modal game drifted: ${state.game}`);
  assert(state.code === GAME_CODE, `Logout modal code drifted: ${state.code}`);
  assert(state.dialog.width <= 682 && state.dialog.width <= state.viewport.width - 30,
    `Logout modal is not width-bounded: ${JSON.stringify(state.dialog)}`);
  assert(state.dialog.height <= state.viewport.height - 30 && state.dialog.top >= 14 && state.dialog.bottom <= state.viewport.height - 14,
    `Logout modal exceeds the viewport: ${JSON.stringify(state.dialog)}`);
  assert(state.titleBottom <= state.descriptionTop + 1, "Logout title overlaps its description.");
  assert(state.descriptionBottom <= state.contextTop + 1, "Logout description overlaps context cards.");
  assert(state.contextBottom <= state.actionsTop + 1, "Logout context overlaps the action row.");
  assert(state.actionsDisplay === "flex" && state.actionsDirection === "row",
    `Logout actions are not a desktop row: ${state.actionsDisplay}/${state.actionsDirection}`);
  assert(state.actionsHeight <= 50, `Logout action row stretched vertically: ${state.actionsHeight}`);
  assert(state.buttons.length === 2 && state.buttons.every((rect) => rect.height >= 43 && rect.height <= 45),
    `Logout buttons are not fixed at 44px: ${JSON.stringify(state.buttons)}`);
  assert(Math.abs(state.buttons[0].y - state.buttons[1].y) <= 1, "Logout buttons are not aligned.");
  assert(!state.horizontalOverflow, "Logout modal overflows horizontally.");
  await harness.capture("logout-confirmation-real-account-control");

  await modal.locator("[data-econovaria-logout-cancel]").last().click();
  await modal.waitFor({ state: "detached", timeout: 5_000 });
  assert(await page.evaluate(() => Boolean(sessionStorage.getItem("econovaria.admin.auth.v1"))),
    "Cancel incorrectly cleared the Admin session.");

  await clickRealAccountLogout();
  await modal.waitFor({ state: "visible", timeout: 5_000 });
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get("mode") === "admin" && url.searchParams.get("reason") === "signed-out",
      { timeout: 10_000 }),
    modal.locator("[data-econovaria-logout-confirm]").click(),
  ]);
  const storage = await page.evaluate((snapshotKey) => {
    try {
      return JSON.parse(localStorage.getItem(snapshotKey) || "null");
    } catch (_) {
      return null;
    }
  }, LOGOUT_SNAPSHOT_KEY);
  assert(storage && storage.session === null && storage.selectedGame === null && storage.csrf === null,
    `Logout left local state before navigation: ${JSON.stringify(storage)}`);
  assert(requests.some((entry) => entry.includes("POST") && entry.includes("/web-session-api/logout")),
    `Server-mediated Admin logout was not attempted: ${JSON.stringify(requests)}`);
  assert(errors.length === 0, errors.join("\n"));
  Object.assign(report, {
    realControl,
    state,
    storage,
    serverMediatedLogoutObserved: true,
    errors: [...errors],
  });
  writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    realAccountLogoutControl: true,
    boundedLogoutModal: true,
    legacyModalSuppressed: true,
    cancelPreservesSession: true,
    confirmationClearsSession: true,
    confirmationRedirects: true,
    serverMediatedLogoutObserved: true,
  }, null, 2));
} catch (error) {
  report.failure = String(error?.stack || error?.message || error);
  report.errors = [...errors];
  await harness.capture("failure").catch(() => {});
  writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2));
  throw error;
} finally {
  await harness.finish(report);
}
