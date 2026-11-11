#!/usr/bin/env node
// Synthetic browser-only harness qualification. No account, network or mutation fixture.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { chromium } from "playwright";
import { root, materializeBusinessSource, readinessHelpers } from "./lib/business-banking-readiness-fixture.mjs";

const source = await materializeBusinessSource();
const helpers = readinessHelpers(source);
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
assert.match(sourceSha, /^[0-9a-f]{40}$/);
if (process.env.RELEASE_COMMIT) assert.equal(sourceSha, process.env.RELEASE_COMMIT, "Browser proof must use the exact release head");
execFileSync("git", ["diff", "--exit-code", "HEAD", "--",
  "scripts/business-banking-player-business-browser-acceptance.core.mjs",
  "scripts/business-banking-player-business-browser-acceptance.mjs",
  "scripts/connected-player-bff-acceptance-loader.mjs",
  "scripts/lib/business-banking-readiness-fixture.mjs",
  "scripts/business-banking-readiness-browser.mjs"], { cwd: root, stdio: "pipe" });
const evidence = { sourceSha,
  materializedHelpersSha256: createHash("sha256").update(helpers).digest("hex"), cases: [] };
const output = process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR || "/tmp/econovaria-player-browser";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const context = vm.createContext({ setTimeout, clearTimeout, evidence, openRoute: async () => {} });
vm.runInContext(helpers, context);

async function reset({ ready = false, balance = 40, card = null, absent = false } = {}) {
  await page.setContent('<main aria-label="Synthetic Banking readiness fixture"></main>');
  await page.evaluate(({ ready, balance, card, absent }) => {
    globalThis.readinessPolls = 0;
    globalThis.readinessState = { routeLoading: { banking: !ready }, routeErrors: {}, data: {
      resourceStatus: { banking: { state: ready ? "ready" : "loading" } }, session: { currencyCode: "LUM" },
      banking: { balances: [{ accountType: "checking", currencyCode: absent ? "NRC" : "LUM", balance }] },
    } };
    globalThis.Econovaria = { playerTerminal: { getState: () => {
      globalThis.readinessPolls++; return globalThis.readinessState;
    } } };
    if (card !== null) document.querySelector("main").innerHTML = `<section data-player-banking-balance="checking:LUM"><h3>LUM ${card}</h3></section>`;
  }, { ready, balance, card, absent });
}

try {
  for (const initialCard of [null, "0"]) {
    await reset({ card: initialCard });
    let settled = false;
    const read = context.checkingBalance(page, "LUM", { optional: true }).finally(() => { settled = true; });
    await page.waitForFunction(() => globalThis.readinessPolls >= 2, null, { timeout: 5000 });
    assert.equal(settled, false, "Unread Banking must remain pending through actual browser polls");
    await page.evaluate(() => {
      globalThis.readinessState.routeLoading.banking = false;
      globalThis.readinessState.data.resourceStatus.banking.state = "ready";
    });
    const previousPolls = await page.evaluate(() => globalThis.readinessPolls);
    await page.waitForFunction((previous) => globalThis.readinessPolls >= previous + 2, previousPolls, { timeout: 5000 });
    assert.equal(settled, false, "Missing/bootstrap card must remain pending after data is ready");
    await page.evaluate(() => { document.querySelector("main").innerHTML = '<section data-player-banking-balance="checking:LUM"><h3>LUM 40</h3></section>'; });
    assert.equal(await read, 40);
    evidence.cases.push({ initialCardPresent: initialCard !== null, delayedReadPassed: true, balance: 40 });
  }
  for (const balance of [0, 40]) {
    await reset({ ready: true, balance, card: String(balance) });
    assert.equal(await context.checkingBalance(page, "LUM"), balance);
    evidence.cases.push({ authoritativeBalance: balance, passed: true });
  }
  await reset({ ready: true, absent: true });
  assert.equal(await context.checkingBalance(page, "LUM", { optional: true }), 0);
  await assert.rejects(context.checkingBalance(page, "LUM"), /did not become authoritative/);
  evidence.cases.push({ optionalAbsentPassed: true, requiredAbsentRejected: true });

  await reset({ card: "0" });
  const started = performance.now();
  await assert.rejects(context.checkingBalance(page, "LUM", { optional: true }), /did not become authoritative within 30 seconds/);
  const elapsedMs = Math.round(performance.now() - started);
  assert.ok(elapsedMs >= 29_000 && elapsedMs < 40_000, `Readiness deadline was not bounded: ${elapsedMs}ms`);
  evidence.cases.push({ neverReadyRejected: true, elapsedMs, timeoutMs: 30_000 });
  evidence.passed = true;
} finally {
  await browser.close();
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "business-banking-readiness-browser.json"), `${JSON.stringify(evidence, null, 2)}\n`);
}
console.log(JSON.stringify(evidence));
