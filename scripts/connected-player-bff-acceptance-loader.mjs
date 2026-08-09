#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function replaceRequired(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count < 1) {
    throw new Error(`${label} expected at least one canonical source match.`);
  }
  return source.replaceAll(before, after);
}

function replaceExactlyOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label} expected one canonical source match, found ${count}.`);
  }
  return source.replace(before, after);
}

function preserveBffReplayHeaders(source) {
  return source.replace(
    /const allowed = new Set\(\[([\s\S]*?)\]\);/gu,
    (match, body) => {
      if (!body.includes("x-player-session") || body.includes("x-econovaria-csrf-token")) {
        return match;
      }
      if (!body.includes('"x-request-id"')) {
        throw new Error("Connected Player replay allowlist has no request-ID anchor.");
      }
      return match.replace(
        '"x-request-id"',
        '"x-econovaria-csrf-token", "x-econovaria-device-id", "x-request-id"',
      );
    },
  );
}

function adaptMarketAuthenticatedReads(source) {
  if (!source.includes("async function readAuthoritativeReplayState(original, ticker)")) {
    return source;
  }

  const oldBlock = `async function readAuthoritativeReplayState(original, ticker) {
  const headers = replayReadHeaders(original);
  const [portfolio, banking] = await Promise.all([
    request("/functions/v1/classroom-api/players/me/stocks/portfolio", { headers }),
    request("/functions/v1/classroom-api/players/me/ledger?limit=50", { headers }),
  ]);

  if (portfolio.status !== 200 || portfolio.payload?.ok !== true || !Array.isArray(portfolio.payload?.holdings)) {
    throw new Error(\`Portfolio replay verification returned \${portfolio.status}: \${redact(JSON.stringify(portfolio.payload))}\`);
  }
  if (banking.status !== 200 || banking.payload?.ok !== true || !Array.isArray(banking.payload?.currentBalances)) {
    throw new Error(\`Banking replay verification returned \${banking.status}: \${redact(JSON.stringify(banking.payload))}\`);
  }
  assertPublicReplayPayload(portfolio.payload, "Portfolio");
  assertPublicReplayPayload(banking.payload, "Banking");

  const holding = portfolio.payload.holdings.find(
    (item) => String(item?.ticker || "").toUpperCase() === ticker.toUpperCase(),
  );
  const checking = banking.payload.currentBalances.find((item) =>
    String(item?.accountType || "").toLowerCase() === "checking"
  );
  const holdingQuantity = Number(holding?.quantity ?? 0);
  const cashBalance = Number(checking?.balance);
  if (!Number.isFinite(holdingQuantity) || !Number.isFinite(cashBalance)) {
    throw new Error(\`Replay verification returned invalid authoritative state: \${redact(JSON.stringify({ holding, checking }))}\`);
  }
  return { holdingQuantity, cashBalance };
}`;

  const newBlock = `async function authenticatedRequest(page, path, { method = "GET", headers = {}, body } = {}) {
  return page.evaluate(async ({ path, method, headers, body }) => {
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      credentials: "include",
    });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }, { path, method, headers, body });
}

async function readAuthoritativeReplayState(page, original, ticker) {
  const headers = replayReadHeaders(original);
  const [portfolio, banking] = await Promise.all([
    authenticatedRequest(page, "/functions/v1/player-web-session-api/proxy/players/me/stocks/portfolio", { headers }),
    authenticatedRequest(page, "/functions/v1/player-web-session-api/proxy/players/me/ledger?limit=50", { headers }),
  ]);

  if (portfolio.status !== 200 || portfolio.payload?.ok !== true || !Array.isArray(portfolio.payload?.holdings)) {
    throw new Error(\`Portfolio replay verification returned \${portfolio.status}: \${redact(JSON.stringify(portfolio.payload))}\`);
  }
  if (banking.status !== 200 || banking.payload?.ok !== true || !Array.isArray(banking.payload?.currentBalances)) {
    throw new Error(\`Banking replay verification returned \${banking.status}: \${redact(JSON.stringify(banking.payload))}\`);
  }
  assertPublicReplayPayload(portfolio.payload, "Portfolio");
  assertPublicReplayPayload(banking.payload, "Banking");

  const holding = portfolio.payload.holdings.find(
    (item) => String(item?.ticker || "").toUpperCase() === ticker.toUpperCase(),
  );
  const checking = banking.payload.currentBalances.find((item) =>
    String(item?.accountType || "").toLowerCase() === "checking"
  );
  const holdingQuantity = Number(holding?.quantity ?? 0);
  const cashBalance = Number(checking?.balance);
  if (!Number.isFinite(holdingQuantity) || !Number.isFinite(cashBalance)) {
    throw new Error(\`Replay verification returned invalid authoritative state: \${redact(JSON.stringify({ holding, checking }))}\`);
  }
  return { holdingQuantity, cashBalance };
}`;

  source = replaceExactlyOnce(source, "Market authenticated replay reads", oldBlock, newBlock);
  source = replaceExactlyOnce(
    source,
    "Market replay-state call",
    "readAuthoritativeReplayState(order.original, evidence.ticker)",
    "readAuthoritativeReplayState(page, order.original, evidence.ticker)",
  );
  source = replaceExactlyOnce(
    source,
    "Market stale-price authenticated request",
    "const stale = await request(orderPath, {",
    "const stale = await authenticatedRequest(page, orderPath, {",
  );
  source = replaceExactlyOnce(
    source,
    "Market forbidden-scope authenticated request",
    "const forbidden = await request(orderPath, {",
    "const forbidden = await authenticatedRequest(page, orderPath, {",
  );
  return source;
}

function adaptMarketExpectedNegativeConsoleErrors(source) {
  if (!source.includes("const stale = await authenticatedRequest(page, orderPath, {")) {
    return source;
  }

  source = replaceExactlyOnce(
    source,
    "Market negative-console capture start",
    "  const stale = await authenticatedRequest(page, orderPath, {",
    "  const expectedNegativeConsoleStart = evidence.consoleErrors.length;\n  const stale = await authenticatedRequest(page, orderPath, {",
  );

  const marker = `  evidence.forbiddenScopeRejected = true;

  const unauthorized = await request(orderPath, {`;
  const replacement = `  evidence.forbiddenScopeRejected = true;

  await page.waitForTimeout(50);
  const expectedNegativeConsoleErrors = evidence.consoleErrors.splice(
    expectedNegativeConsoleStart,
  );
  const expectedNegativeStatuses = expectedNegativeConsoleErrors.map((message) => {
    const match = message.match(
      /Failed to load resource:.*status of (400|409)(?:\\s|\\(|$)/i,
    );
    return match ? Number(match[1]) : null;
  });
  if (
    expectedNegativeConsoleErrors.length !== 2 ||
    expectedNegativeStatuses.filter((status) => status === 400).length !== 1 ||
    expectedNegativeStatuses.filter((status) => status === 409).length !== 1 ||
    expectedNegativeStatuses.some((status) => status === null)
  ) {
    throw new Error(
      \`Market negative probes emitted unexpected console errors: \${JSON.stringify(expectedNegativeConsoleErrors)}\`,
    );
  }

  const unauthorized = await request(orderPath, {`;

  return replaceExactlyOnce(
    source,
    "Market expected negative-console verification",
    marker,
    replacement,
  );
}

function adaptBusinessFundedBalanceWait(source) {
  if (!source.includes("The Player Banking page did not render the ${currencyCode} checking balance.")) {
    return source;
  }

  const oldBlock = `async function checkingBalance(page, currencyCode, { optional = false } = {}) {
  await openRoute(page, "banking", ".player-terminal-banking-page");
  const card = page.locator(\`[data-player-banking-balance="checking:\${currencyCode}"]\`).first();
  if (!(await card.count())) {
    if (optional) return 0;
    throw new Error(\`The Player Banking page did not render the \${currencyCode} checking balance.\`);
  }
  await card.waitFor({ state: "visible", timeout: 30_000 });
  const text = String(await card.locator("h3").innerText()).replace(/,/g, "");
  const amount = Number(text.match(/-?[0-9]+(?:\\.[0-9]{1,2})?/)?.[0]);
  if (!Number.isFinite(amount)) throw new Error(\`Could not parse the \${currencyCode} checking balance from \${redact(text)}.\`);
  return amount;
}`;

  const newBlock = `async function checkingBalance(page, currencyCode, { optional = false } = {}) {
  await openRoute(page, "banking", ".player-terminal-banking-page");
  const card = page.locator(\`[data-player-banking-balance="checking:\${currencyCode}"]\`).first();
  if (optional && !(await card.count())) return 0;
  try {
    await card.waitFor({ state: "visible", timeout: 30_000 });
  } catch (_) {
    if (optional) return 0;
    throw new Error(\`The Player Banking page did not render the \${currencyCode} checking balance.\`);
  }
  const text = String(await card.locator("h3").innerText()).replace(/,/g, "");
  const amount = Number(text.match(/-?[0-9]+(?:\\.[0-9]{1,2})?/)?.[0]);
  if (!Number.isFinite(amount)) throw new Error(\`Could not parse the \${currencyCode} checking balance from \${redact(text)}.\`);
  return amount;
}`;

  return replaceExactlyOnce(
    source,
    "Business funded Banking render wait",
    oldBlock,
    newBlock,
  );
}

function adaptCommerceUsableInventoryFixture(source) {
  const oldBlock = `  const button = session.page.locator("[data-player-purchase]:not([disabled])").first();
  await button.waitFor({ state: "visible", timeout: 30_000 });
  const itemKey = String(await button.getAttribute("data-player-purchase"));`;
  if (!source.includes(oldBlock)) return source;

  const newBlock = `  const usableItemByCurrency = Object.freeze({
    NRC: "sensor-calibration-pack",
    YRC: "logistics-rerouting-kit",
    THD: "portable-energy-cell",
    SLV: "precision-calibration-pack",
    ELD: "encrypted-data-charge",
    VAL: "emergency-filter-cartridge",
    LUM: "translation-data-pack",
    XAL: "machine-tooling-replacement-pack",
    DRV: "emergency-repair-kit",
    SYN: "firmware-patch",
  });
  const itemKey = usableItemByCurrency[currencyCode];
  if (!itemKey) throw new Error(\`No effect-enabled Store fixture is mapped for \${currencyCode}.\`);
  const button = session.page.locator(\`[data-player-purchase="\${itemKey}"]:not([disabled])\`).first();
  await button.waitFor({ state: "visible", timeout: 30_000 });`;

  return replaceExactlyOnce(
    source,
    "Commerce effect-enabled Store fixture",
    oldBlock,
    newBlock,
  );
}

export async function runConnectedPlayerBffAcceptance(entryUrl) {
  const entryPath = fileURLToPath(entryUrl);
  const corePath = entryPath.replace(/\.mjs$/u, ".core.mjs");
  if (corePath === entryPath) throw new Error("Connected Player acceptance entrypoint must use .mjs.");

  let source = await readFile(corePath, "utf8");
  source = replaceRequired(
    source,
    "Player BFF login",
    "/functions/v1/classroom-api/players/login",
    "/functions/v1/player-web-session-api/login",
  );
  source = source.replaceAll(
    '    if (!url.includes("/functions/v1/classroom-api/")) return;',
    '    if (!url.includes("/functions/v1/classroom-api/") && !url.includes("/functions/v1/player-web-session-api/")) return;',
  );
  source = preserveBffReplayHeaders(source);
  source = source.replaceAll(
    'cache: "no-store" });',
    'cache: "no-store", credentials: "include" });',
  );
  source = source.replaceAll(
    'cache: "no-store",\n    });',
    'cache: "no-store",\n      credentials: "include",\n    });',
  );
  source = adaptMarketAuthenticatedReads(source);
  source = adaptMarketExpectedNegativeConsoleErrors(source);
  source = adaptBusinessFundedBalanceWait(source);
  source = adaptCommerceUsableInventoryFixture(source);

  if (source.includes("/functions/v1/classroom-api/players/login")) {
    throw new Error("Connected Player BFF loader retained the retired login route.");
  }

  const materializedDirectory = await mkdtemp(
    join(dirname(entryPath), `.${basename(entryPath, ".mjs")}-materialized-`),
  );
  const materializedPath = join(materializedDirectory, basename(entryPath));
  try {
    await writeFile(materializedPath, source, "utf8");
    await import(pathToFileURL(materializedPath).href);
  } finally {
    await rm(materializedDirectory, { recursive: true, force: true });
  }
}
