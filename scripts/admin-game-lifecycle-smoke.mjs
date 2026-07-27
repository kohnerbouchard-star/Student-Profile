import { mkdirSync, writeFileSync } from "node:fs";
import {
  BASE_URL,
  createQualityHarness,
  GAME_ID,
} from "./admin-quality-smoke-fixture.mjs";

const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR ||
  "admin-browser-smoke-artifacts/game-lifecycle";
const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
mkdirSync(ARTIFACT_DIR, { recursive: true });

const evidence = [];

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000, fullFlow: true },
    { name: "compact", width: 1024, height: 768, fullFlow: false },
    { name: "narrow", width: 768, height: 900, fullFlow: false },
  ]) {
    evidence.push(await exerciseViewport(viewport));
  }
  writeFileSync(`${ARTIFACT_DIR}/game-lifecycle-summary.json`, JSON.stringify(evidence, null, 2));
  console.log("Admin game lifecycle controls passed desktop, compact, and narrow verification through the HttpOnly BFF.");
} catch (error) {
  writeFileSync(`${ARTIFACT_DIR}/game-lifecycle-summary.json`, JSON.stringify({
    evidence,
    failure: error?.stack || error?.message || String(error),
  }, null, 2));
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
}

async function exerciseViewport(viewport) {
  const harness = await createQualityHarness(`game-lifecycle-${viewport.name}`);
  const { page, errors, state: harnessState } = harness;
  const mutationRequests = [];
  const pointerEvents = [];
  let lifecycle = lifecycleState("draft", 1, 0);
  const result = { viewport };

  harnessState.delayReads = false;
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.addInitScript(() => {
    window.__gameLifecyclePointerEvents = [];
    for (const type of ["pointerdown", "mousedown", "touchstart"]) {
      window.addEventListener(type, (event) => {
        window.__gameLifecyclePointerEvents.push({
          type: event.type,
          target: event.target?.tagName || "",
        });
      }, true);
    }
  });

  await page.route("**/functions/v1/web-session-api/proxy/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const marker = "/functions/v1/web-session-api/proxy";
    const path = url.pathname.startsWith(marker)
      ? url.pathname.slice(marker.length) || "/"
      : url.pathname;
    const lifecycleRead = path === `/games/${GAME_ID}/lifecycle` && request.method() === "GET";
    const actionMatch = path.match(new RegExp(`^/games/${GAME_ID}/lifecycle/(start|pause|resume|end|archive)$`));
    const revoke = path === `/games/${GAME_ID}/sessions/revoke`;

    if (!lifecycleRead && !actionMatch && !revoke) {
      await route.fallback();
      return;
    }

    const headers = request.headers();
    assert(headers.authorization === undefined, `${viewport.name}: lifecycle request exposed Staff Authorization.`);
    assert(headers["x-econovaria-game-id"] === GAME_ID,
      `${viewport.name}: lifecycle request omitted exact game scope.`);

    if (lifecycleRead) {
      await json(route, 200, { data: { lifecycle } });
      return;
    }

    assert(request.method() === "POST", `${viewport.name}: lifecycle mutation used ${request.method()}.`);
    assert(CSRF_PATTERN.test(String(headers["x-econovaria-csrf-token"] || "")),
      `${viewport.name}: lifecycle mutation omitted cookie-bound CSRF.`);
    const body = request.postDataJSON();
    const action = revoke ? "revoke_sessions" : actionMatch[1];
    mutationRequests.push({ action, body, headers, path });
    lifecycle = transition(lifecycle, action);
    await json(route, 200, {
      data: {
        action,
        outcome: "applied",
        previousState: null,
        lifecycle,
      },
    });
  });

  try {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
    await page.waitForSelector("[data-admin-terminal-user]", { timeout: 15_000 });
    await page.waitForTimeout(1000);

    await keyboardActivate(page.locator("[data-admin-terminal-user]").first());
    const gamesAction = page.locator('[data-admin-terminal-action="open-admin-games"]').first();
    await gamesAction.waitFor({ state: "visible", timeout: 5000 });
    await keyboardActivate(gamesAction);
    const root = page.locator("[data-admin-game-lifecycle]").first();
    await root.waitFor({ state: "visible", timeout: 12_000 });
    await page.waitForFunction(() =>
      document.querySelector("[data-admin-game-lifecycle]")?.getAttribute("aria-busy") !== "true"
    );

    assert(await root.locator(".admin-game-lifecycle__status", { hasText: "Not started" }).isVisible(),
      `${viewport.name}: lifecycle did not load draft state.`);
    assert(await root.getByRole("button", { name: "Start game" }).isVisible(),
      `${viewport.name}: start control missing.`);
    await assertLayout(page, root, viewport.name);

    if (viewport.fullFlow) {
      await activateAction(page, root, "Start game");
      await confirmModal(page, "Start game");
      await root.locator(".admin-game-lifecycle__status", { hasText: "Active" }).waitFor({ state: "visible" });

      await activateAction(page, root, "Pause mutations");
      await confirmModal(page, "Pause mutations");
      await root.locator(".admin-game-lifecycle__status", { hasText: "Paused" }).waitFor({ state: "visible" });

      await activateAction(page, root, "Resume game");
      await confirmModal(page, "Resume game");
      await root.locator(".admin-game-lifecycle__status", { hasText: "Active" }).waitFor({ state: "visible" });

      await activateAction(page, root, "Revoke Player sessions");
      await confirmModal(page, "Revoke Player sessions", "REVOKE");
      await root.getByText(/Player session\(s\) revoked/).waitFor({ state: "visible" });

      await activateAction(page, root, "End game");
      await confirmModal(page, "End game", "END");
      await root.locator(".admin-game-lifecycle__status", { hasText: "Ended" }).waitFor({ state: "visible" });

      await activateAction(page, root, "Archive game");
      await confirmModal(page, "Archive game", "ARCHIVE");
      await root.locator(".admin-game-lifecycle__status", { hasText: "Archived" }).waitFor({ state: "visible" });

      assert(mutationRequests.map((item) => item.action).join(",") ===
        "start,pause,resume,revoke_sessions,end,archive",
      "Lifecycle mutation order was incorrect.");
      for (const item of mutationRequests) {
        assert(Object.keys(item.body).sort().join(",") === "expectedVersion,idempotencyKey",
          `${item.action}: unexpected request fields.`);
        assert(!JSON.stringify(item.body).includes(GAME_ID),
          `${item.action}: browser duplicated game scope in the body.`);
        assert(/^admin[.]lifecycle[.]/.test(item.body.idempotencyKey),
          `${item.action}: safe idempotency key missing.`);
        assert(item.headers["x-idempotency-key"] === item.body.idempotencyKey,
          `${item.action}: header/body idempotency mismatch.`);
      }
    }

    const browserEvidence = await page.evaluate(() => ({
      pointerEvents: window.__gameLifecyclePointerEvents || [],
      width: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
      modalCount: [...document.querySelectorAll("[data-admin-terminal-modal-backdrop]")].filter((element) => {
        const rect = element.getBoundingClientRect();
        return !element.hidden && rect.width > 0 && rect.height > 0;
      }).length,
      runtimeStyles: document.querySelectorAll("style[id]").length,
    }));
    pointerEvents.push(...browserEvidence.pointerEvents);
    assert(errors.length === 0, errors[0] || `${viewport.name}: browser error.`);
    assert(pointerEvents.length === 0, `${viewport.name}: keyboard flow emitted pointer events.`);
    assert(browserEvidence.width <= browserEvidence.viewport + 2,
      `${viewport.name}: lifecycle controls overflow horizontally.`);
    assert(browserEvidence.modalCount === 0, `${viewport.name}: modal remained open.`);
    assert(browserEvidence.runtimeStyles === 0, `${viewport.name}: runtime style tag introduced.`);

    await harness.capture(viewport.name);
    Object.assign(result, {
      mutationRequests,
      browserEvidence,
      finalLifecycle: lifecycle,
      errors: [...errors],
    });
    return result;
  } catch (error) {
    result.failure = error?.stack || error?.message || String(error);
    result.errors = [...errors];
    await harness.capture(`${viewport.name}-failure`).catch(() => {});
    throw error;
  } finally {
    await harness.finish(result);
  }
}

async function keyboardActivate(locator) {
  await locator.waitFor({ state: "visible", timeout: 5000 });
  await locator.focus();
  await locator.press("Enter");
}

async function activateAction(page, root, name) {
  const button = root.getByRole("button", { name, exact: true });
  await keyboardActivate(button);
  await page.locator("[data-admin-terminal-modal-backdrop]").waitFor({ state: "visible" });
}

async function confirmModal(page, name, phrase = "") {
  const modal = page.locator("[data-admin-terminal-modal-backdrop]").last();
  if (phrase) {
    const input = modal.locator("input").first();
    await input.fill(phrase);
  }
  const confirm = modal.getByRole("button", { name, exact: true }).last();
  await confirm.focus();
  await page.keyboard.press("Enter");
  await modal.waitFor({ state: "detached", timeout: 8000 });
  await page.waitForTimeout(2500);
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-admin-game-lifecycle]");
    return root && root.getAttribute("aria-busy") !== "true";
  }, { timeout: 8000 });
}

async function assertLayout(page, root, name) {
  const geometry = await root.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll("button")].map((button) => {
      const box = button.getBoundingClientRect();
      return { width: box.width, height: box.height, left: box.left, right: box.right };
    });
    return { rect: { left: rect.left, right: rect.right, width: rect.width }, buttons };
  });
  assert(geometry.rect.width > 240, `${name}: lifecycle panel collapsed.`);
  assert(geometry.buttons.every((button) => button.height >= 38),
    `${name}: lifecycle button target is too small.`);
  assert(geometry.buttons.every((button) =>
    button.left >= geometry.rect.left - 1 && button.right <= geometry.rect.right + 1
  ), `${name}: lifecycle button escaped the panel.`);
  assert((await page.locator("[data-admin-game-lifecycle]").count()) === 1,
    `${name}: duplicate lifecycle panels mounted.`);
}

function transition(current, action) {
  const version = current.version + 1;
  if (action === "pause") return lifecycleState("paused", version, current.activePlayerSessions);
  if (action === "resume") return lifecycleState("active", version, current.activePlayerSessions);
  if (action === "revoke_sessions") {
    return {
      ...lifecycleState(current.state, version, 0),
      sessionsRevoked: current.activePlayerSessions,
    };
  }
  if (action === "end") {
    return {
      ...lifecycleState("ended", version, 0),
      sessionsRevoked: current.activePlayerSessions,
      joinCodeStatus: "revoked",
    };
  }
  if (action === "archive") {
    return { ...lifecycleState("archived", version, 0), joinCodeStatus: "revoked" };
  }
  if (action === "start") return lifecycleState("active", version, 3);
  throw new Error(`Unsupported action: ${action}`);
}

function lifecycleState(stateName, version, activePlayerSessions) {
  const operationalStatus = stateName === "active"
    ? "active"
    : ["draft", "paused"].includes(stateName)
      ? "disabled"
      : "archived";
  const allowedActions = {
    draft: ["start", "revoke_sessions"],
    active: ["pause", "end", "revoke_sessions"],
    paused: ["resume", "end", "revoke_sessions"],
    ended: ["archive", "revoke_sessions"],
    archived: ["revoke_sessions"],
  }[stateName];
  return {
    state: stateName,
    operationalStatus,
    version,
    joinCodeStatus: ["ended", "archived"].includes(stateName) ? "revoked" : "active",
    activePlayerSessions,
    sessionsRevoked: 0,
    allowedActions,
    startedAt: "2026-07-19T06:00:00.000Z",
    pausedAt: stateName === "paused" ? new Date().toISOString() : null,
    resumedAt: null,
    endedAt: stateName === "ended" ? new Date().toISOString() : null,
    archivedAt: stateName === "archived" ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  };
}

async function json(route, status, body) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "http://127.0.0.1:4173",
      "access-control-allow-credentials": "true",
      "cache-control": "private, no-store",
    },
    body: JSON.stringify(body),
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
