import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "..");
const EVIDENCE_DIRECTORY = path.resolve(
  process.env.ADMIN_V2_MESSAGES_EVIDENCE_DIR
    || path.join(REPOSITORY_ROOT, "docs", "operations", "evidence", "admin-ui-v2-messages"),
);
const PRIVATE_UUID = "40000000-0000-4000-8000-000000000004";
const PUBLIC_THREAD_ID = `thr_${"a".repeat(32)}`;
const PUBLIC_MESSAGE_ID = `msg_${"b".repeat(32)}`;
const VIEWPORTS = Object.freeze([
  Object.freeze({ width: 1440, height: 900 }),
  Object.freeze({ width: 768, height: 1024 }),
  Object.freeze({ width: 390, height: 844 }),
  Object.freeze({ width: 320, height: 568 }),
]);

mkdirSync(EVIDENCE_DIRECTORY, { recursive: true });

const MIME_BY_EXTENSION = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
});

function fixtureHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="/admin/v2/styles/reset.css" />
  <link rel="stylesheet" href="/admin/v2/styles/tokens.css" />
  <link rel="stylesheet" href="/admin/v2/styles/base.css" />
  <link rel="stylesheet" href="/admin/v2/styles/components.css" />
  <link rel="stylesheet" href="/admin/v2/styles/utilities.css" />
  <link rel="stylesheet" href="/admin/v2/styles/routes/messages.css" />
  <title>Messages V2 browser fixture</title>
</head>
<body>
  <main id="fixtureRoot"></main>
  <script type="module">
    import { createMessagesController } from "/admin/v2/src/routes/messages/MessagesController.js";

    const PRIVATE_UUID = ${JSON.stringify(PRIVATE_UUID)};
    const PUBLIC_THREAD_ID = ${JSON.stringify(PUBLIC_THREAD_ID)};
    const PUBLIC_MESSAGE_ID = ${JSON.stringify(PUBLIC_MESSAGE_ID)};
    const scenario = new URL(location.href).searchParams.get("scenario") || "ready";
    let failReads = false;

    function message(index, overrides = {}) {
      return {
        id: index === 0 ? PUBLIC_MESSAGE_ID : \
          \`msg_\${index.toString(16).padStart(32, "0")}\`,
        senderType: index % 2 ? "player" : "admin",
        senderName: index % 2 ? "김민준" : "Administrator",
        body: index === 0
          ? \
            \`긴 한국어 메시지 — 시장 상황과 계약 조건을 검토합니다. \${"경제 토론 ".repeat(25)} \${PRIVATE_UUID}\`
          : \
            \`메시지 \${index} — high-volume thread review content.\`,
        hidden: index === 1,
        hiddenReason: index === 1 ? "교실 안전 검토" : "",
        createdAt: "2026-08-07T07:15:00.000Z",
        ...overrides,
      };
    }

    function payload() {
      const threads = scenario === "empty" ? [] : [{
        id: PUBLIC_THREAD_ID,
        type: "player",
        title: \
          \`국제 시장 토론 — 긴 한국어 제목과 비공개 식별자 \${PRIVATE_UUID}\`,
        contractKey: "contract-public-context",
        allowPlayerReplies: true,
        status: "disabled",
        moderationReason: "교실 운영 검토",
        retentionUntil: "2026-08-31T23:59:59.999Z",
        expired: false,
        createdAt: "2026-08-07T07:00:00.000Z",
        updatedAt: "2026-08-07T08:00:00.000Z",
        participants: [
          { reference: "PLAYER-001", displayName: \
            \`박서연 \${PRIVATE_UUID}\`, rosterLabel: "Y10 경제학", lastReadAt: "2026-08-07T08:05:00.000Z" },
          { reference: "PLAYER-002", displayName: "Jordan Lee", rosterLabel: "Y10 경제학", lastReadAt: null },
        ],
        messages: Array.from({ length: 100 }, (_, index) => message(index)),
        ownerUuid: PRIVATE_UUID,
        rawToken: "never-render-this-token",
      }];
      return {
        data: {
          threads,
          pagination: { limit: 25, offset: 0, returned: threads.length, hasMore: false },
        },
      };
    }

    const api = {
      async readMessages() {
        if (failReads) throw Object.assign(new Error("private backend trace service_role"), { status: 503 });
        return payload();
      },
      cancelMessagesRequest() { return false; },
      async moderateThread() { return { data: { outcome: "applied" } }; },
      async moderateMessage() { return { data: { outcome: "applied" } }; },
      async deleteExpiredThread() { return { data: { outcome: "applied" } }; },
    };
    const controller = createMessagesController({
      api,
      selectedGameId: "10000000-0000-4000-8000-000000000001",
      hasPermission: () => scenario !== "denied",
      cryptoObject: { randomUUID: () => "20000000-0000-4000-8000-000000000002" },
    });

    if (scenario === "stale") {
      await controller.load();
      failReads = true;
      await controller.load();
    } else {
      await controller.load();
    }

    const root = document.querySelector("#fixtureRoot");
    if (scenario === "denied") {
      const state = controller.getState();
      root.textContent = state.requestVersion === 0 && state.hasResolved === false
        ? "Permission denied before protected Messages read."
        : "Permission boundary failed.";
      root.dataset.permissionDenied = "true";
    } else {
      const view = controller.render();
      root.append(view.element);
    }
    window.__messagesFixtureReady = true;
  </script>
</body>
</html>`;
}

function safeFilePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const candidate = path.resolve(REPOSITORY_ROOT, `.${decoded}`);
  return candidate === REPOSITORY_ROOT || candidate.startsWith(`${REPOSITORY_ROOT}${path.sep}`)
    ? candidate
    : null;
}

async function startServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname === "/fixture.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(fixtureHtml());
      return;
    }
    const filePath = safeFilePath(url.pathname);
    if (!filePath) {
      response.writeHead(403).end();
      return;
    }
    try {
      const bytes = readFileSync(filePath);
      response.writeHead(200, {
        "content-type": MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(bytes);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function waitForFixture(page) {
  await page.waitForFunction(() => window.__messagesFixtureReady === true);
}

async function assertNoHorizontalOverflow(page, label) {
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(width.document <= width.client + 1, `${label}: document overflow ${width.document}/${width.client}`);
  assert.ok(width.body <= width.client + 1, `${label}: body overflow ${width.body}/${width.client}`);
}

async function verifyReadyViewport(browser, server, viewport) {
  const context = await browser.newContext({ viewport, colorScheme: "dark", reducedMotion: "reduce" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${server.origin}/fixture.html?scenario=ready`, { waitUntil: "networkidle" });
  await waitForFixture(page);

  await page.getByRole("heading", { level: 1, name: "Messages Moderation" }).waitFor();
  const bodyText = await page.locator("body").textContent() || "";
  assert.match(bodyText, /국제 시장 토론/);
  assert.match(bodyText, /박서연/);
  assert.match(bodyText, /Disabled/);
  assert.match(bodyText, /100 messages/);
  assert.equal(bodyText.includes(PRIVATE_UUID), false, `${viewport.width}px rendered private UUID`);
  assert.equal(bodyText.includes(PUBLIC_THREAD_ID), false, `${viewport.width}px rendered public thread action key`);
  assert.equal(bodyText.includes(PUBLIC_MESSAGE_ID), false, `${viewport.width}px rendered public message action key`);
  assert.equal(bodyText.includes("never-render-this-token"), false, `${viewport.width}px rendered raw token`);
  assert.doesNotMatch(bodyText, /private backend trace|service_role/i);
  await assertNoHorizontalOverflow(page, `${viewport.width}x${viewport.height}`);

  const conversation = page.locator(".admin-messages-route__messages");
  await conversation.locator("summary").click();
  assert.equal(await page.locator(".admin-messages-route__message").count(), 100);
  await assertNoHorizontalOverflow(page, `${viewport.width}x${viewport.height} expanded`);

  await page.screenshot({
    path: path.join(EVIDENCE_DIRECTORY, `messages-ready-${viewport.width}x${viewport.height}.png`),
    fullPage: true,
  });
  assert.deepEqual(pageErrors, [], `${viewport.width}px emitted page errors`);
  await context.close();
}

async function verifyState(browser, server, scenario, expectedText) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto(`${server.origin}/fixture.html?scenario=${scenario}`, { waitUntil: "networkidle" });
  await waitForFixture(page);
  const bodyText = await page.locator("body").textContent() || "";
  assert.match(bodyText, expectedText);
  assert.equal(bodyText.includes(PRIVATE_UUID), false);
  assert.doesNotMatch(bodyText, /private backend trace|service_role/i);
  await assertNoHorizontalOverflow(page, scenario);
  await context.close();
}

const server = await startServer();
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of VIEWPORTS) {
    await verifyReadyViewport(browser, server, viewport);
  }
  await verifyState(browser, server, "empty", /No messages yet/);
  await verifyState(browser, server, "stale", /Showing the last successful messaging snapshot|temporarily unavailable/i);
  await verifyState(browser, server, "denied", /Permission denied before protected Messages read/);
  console.log("Admin UI V2 Messages browser smoke passed.");
} finally {
  await browser.close();
  await server.close();
}
