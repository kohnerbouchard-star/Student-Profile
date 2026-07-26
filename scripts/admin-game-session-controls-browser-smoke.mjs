import { writeFileSync } from "node:fs";
import {
  BASE_URL,
  createQualityHarness,
  GAME_ID,
} from "./admin-quality-smoke-fixture.mjs";

const GAME_CODE = "QUALITY1";
const GAME_NAME = "Quality Game";
const ORIGIN = "http://127.0.0.1:4173";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function logoutCorsHeaders() {
  return {
    "access-control-allow-origin": ORIGIN,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "apikey,content-type,x-econovaria-device-id",
    "access-control-allow-methods": "POST,OPTIONS",
    "cache-control": "private, no-store",
  };
}

const harness = await createQualityHarness("game-session-controls");
const { page, errors, dir } = harness;
const requests = [];
const report = {};

page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("request", (request) => requests.push(`${request.method()} ${request.url()}`));

await page.addInitScript(({ gameId, gameCode }) => {
  sessionStorage.setItem(`econovaria.admin.game-code.v1:${gameId}`, gameCode);
}, { gameId: GAME_ID, gameCode: GAME_CODE });

await page.route("**/functions/v1/web-session-api/logout", async (route) => {
  const request = route.request();
  assert(!request.headers().authorization, "Admin logout exposed a Staff bearer token.");
  if (request.method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: logoutCorsHeaders(), body: "" });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: logoutCorsHeaders(),
    body: JSON.stringify({ ok: true }),
  });
});

try {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.locator("#adminPreview:not([hidden])").waitFor({ state: "visible", timeout: 15_000 });

  const card = page.locator("[data-econovaria-game-session-card]").first();
  await card.waitFor({ state: "visible", timeout: 10_000 });
  const cardState = await card.evaluate((node) => ({
    gameId: node.dataset.gameId,
    gameCode: node.dataset.gameCode,
    name: node.querySelector("[data-econovaria-selected-game-name]")?.textContent?.trim(),
    code: node.querySelector("[data-econovaria-selected-game-code]")?.textContent?.trim(),
    copy: node.querySelector("[data-econovaria-game-target-copy]")?.textContent?.trim(),
    width: node.getBoundingClientRect().width,
    parentWidth: node.parentElement?.getBoundingClientRect().width || 0,
  }));
  assert(cardState.gameId === GAME_ID, `Selected-game card targeted ${cardState.gameId}.`);
  assert(cardState.gameCode === GAME_CODE, `Selected-game card stored ${cardState.gameCode}.`);
  assert(cardState.name === GAME_NAME, `Selected-game card displayed ${cardState.name}.`);
  assert(cardState.code === GAME_CODE, `Selected-game card displayed code ${cardState.code}.`);
  assert(
    cardState.copy?.includes(`Players using ${GAME_CODE} join ${GAME_NAME}`),
    `Selected-game card did not explain the multiplayer target: ${cardState.copy}`,
  );
  assert(cardState.width <= cardState.parentWidth + 1, "Selected-game card overflowed its sidebar host.");

  const shareButton = card.locator("[data-econovaria-share-game]");
  assert(await shareButton.isEnabled(), "Share Game Code button is disabled.");
  await shareButton.click();

  const shareSurface = page.locator('[data-modal-id="share-game-access"]:visible').last();
  await shareSurface.waitFor({ state: "visible", timeout: 5_000 });
  const shareState = await shareSurface.evaluate((surface) => {
    const dialog = surface.querySelector('[role="dialog"]') || surface;
    const playerLink = dialog.querySelector(
      "input[id*='share-student-link'], input[id*='share-player-link'], [data-econovaria-player-link]",
    );
    const rect = dialog.getBoundingClientRect();
    return {
      context: dialog.querySelector("[data-econovaria-share-game-context]")?.textContent?.trim(),
      code: dialog.querySelector(".admin-terminal-share-modal-code strong")?.textContent?.trim(),
      playerLink: playerLink?.value || "",
      adminLinkVisible: [...dialog.querySelectorAll("input[id*='share-admin-link']")]
        .some((input) => {
          const field = input.closest("label, .admin-terminal-field, .admin-terminal-share-field");
          return field && !field.hidden && getComputedStyle(field).display !== "none";
        }),
      width: rect.width,
      viewportWidth: innerWidth,
      horizontalOverflow: dialog.scrollWidth > dialog.clientWidth + 1,
    };
  });
  assert(
    shareState.context?.includes(GAME_CODE) && shareState.context?.includes(GAME_NAME),
    `Share panel omitted the selected game context: ${shareState.context}`,
  );
  assert(shareState.code === GAME_CODE, `Share panel displayed ${shareState.code}.`);
  const playerShareUrl = new URL(shareState.playerLink);
  assert(
    playerShareUrl.pathname === "/play",
    `Player link did not target the canonical /play route: ${shareState.playerLink}`,
  );
  assert(
    playerShareUrl.searchParams.get("mode") === "student",
    `Player link did not use the canonical Player-share mode: ${shareState.playerLink}`,
  );
  assert(
    playerShareUrl.searchParams.get("gameCode") === GAME_CODE,
    `Player link did not include the selected code: ${shareState.playerLink}`,
  );
  assert(shareState.adminLinkVisible === false, "Player share panel still exposes the Admin link.");
  assert(
    shareState.width <= Math.min(622, shareState.viewportWidth - 30),
    `Share dialog width is not bounded: ${shareState.width}.`,
  );
  assert(shareState.horizontalOverflow === false, "Share dialog overflows horizontally.");

  await harness.capture("share-game-access");
  await page.keyboard.press("Escape");
  await shareSurface.waitFor({ state: "hidden", timeout: 5_000 }).catch(async () => {
    await shareSurface.waitFor({ state: "detached", timeout: 5_000 });
  });

  const logoutButton = card.locator("[data-econovaria-admin-logout]");
  await logoutButton.waitFor({ state: "visible", timeout: 5_000 });
  assert(await logoutButton.isEnabled(), "Admin logout button is disabled.");
  await logoutButton.click({ trial: true, timeout: 5_000 });
  const logoutBox = await logoutButton.boundingBox();
  const logoutHitTarget = await logoutButton.evaluate((button) => ({
    enabled: !button.disabled,
    pointerEvents: getComputedStyle(button).pointerEvents,
  }));
  assert(logoutHitTarget.pointerEvents !== "none", "Admin logout button ignores pointer input.");
  assert(
    logoutBox && logoutBox.width > 60 && logoutBox.height >= 36,
    `Admin logout hit target is too small: ${JSON.stringify(logoutBox)}.`,
  );

  await Promise.all([
    page.waitForURL((url) =>
      url.searchParams.get("mode") === "admin" &&
      url.searchParams.get("reason") === "signed-out",
    { timeout: 10_000 }),
    logoutButton.click(),
  ]);

  const storageState = await page.evaluate(() => ({
    session: sessionStorage.getItem("econovaria.admin.auth.v1"),
    selectedGame: sessionStorage.getItem("econovaria.admin.selected-game.v1"),
    csrf: sessionStorage.getItem("econovaria.admin.csrf.v1"),
  }));
  assert(storageState.session === null, "Admin logout left the session summary in storage.");
  assert(storageState.selectedGame === null, "Admin logout left the selected game in storage.");
  assert(storageState.csrf === null, "Admin logout left the CSRF token in storage.");
  assert(
    requests.some((entry) => entry.includes("POST") && entry.includes("/web-session-api/logout")),
    `Admin logout did not issue server-mediated revocation: ${JSON.stringify(requests)}`,
  );

  Object.assign(report, {
    cardState,
    shareState,
    logoutHitTarget: { ...logoutHitTarget, ...logoutBox, browserTrialPassed: true },
    storageState,
    serverMediatedLogoutObserved: true,
    errors: [...errors],
  });
  writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2));
  const expectedNavigationAbort = /POST .*\/functions\/v1\/web-session-api\/logout net::ERR_ABORTED/i;
  const remainingErrors = errors.filter((error) => !expectedNavigationAbort.test(error));
  assert(remainingErrors.length === 0, remainingErrors.join("\n"));

  console.log(JSON.stringify({
    selectedGameTarget: true,
    gameCode: GAME_CODE,
    shareButtonClickable: true,
    sharePanelBounded: true,
    playerLinkTargetsSelectedGame: true,
    adminLinkHidden: true,
    logoutButtonClickable: true,
    serverMediatedLogoutObserved: true,
    sessionCleared: true,
  }, null, 2));
} catch (error) {
  report.failure = String(error?.stack || error);
  report.errors = [...errors];
  report.requests = requests;
  await harness.capture("failure").catch(() => {});
  writeFileSync(`${dir}/failure.json`, JSON.stringify(report, null, 2));
  throw error;
} finally {
  await harness.finish(report);
}
