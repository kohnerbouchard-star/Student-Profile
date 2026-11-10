import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { chromium } from "playwright";
import {
  ADMIN_V2_FIXTURE_CSRF, ADMIN_V2_FIXTURE_GAME_ID,
  createAdminV2FixtureSession, startAdminV2FixtureServer,
} from "./admin-v2-browser-fixture-server.mjs";

const game = ADMIN_V2_FIXTURE_GAME_ID;
const names = ["SYNTHETIC Avery", "SYNTHETIC Avery", "김하늘"];
const code = "C".repeat(31) + "1";
const students = names.map((displayName, i) => ({ row: i + 1, displayName,
  playerIdentifier: `STU-${String(i + 1).padStart(24, "A")}`, accessCode: i ? "D".repeat(31) + i : code }));
const rosterValues = students.flatMap(({ displayName, playerIdentifier, accessCode }) => [displayName, playerIdentifier, accessCode]);
const accessCodes = students.map(({ accessCode }) => accessCode);
function assertAbsent(text, values, label) {
  for (const [index, value] of values.entries()) {
    assert.equal(text.includes(value), false, `${label}: roster value ${index} must be absent`);
  }
}
const publicFixture = JSON.stringify({ csrf: ADMIN_V2_FIXTURE_CSRF, game, session: createAdminV2FixtureSession("ready") });
assertAbsent(publicFixture, rosterValues, "public fixture noncollision");
assert.equal(new Set(accessCodes).size, students.length, "distinct synthetic codes");
assert.equal(new Set(students.map(({ playerIdentifier }) => playerIdentifier)).size, students.length);
for (const value of rosterValues) {
  assert.throws(() => assertAbsent(`prefix ${value} suffix`, [value], "self-check"), { name: "AssertionError" });
}
const result = (replayed = false) => ({ data: { createdCount: names.length, replayed, credentialsAvailable: !replayed,
  students: students.map(({ accessCode, ...row }) => ({ ...row, ...(!replayed ? { accessCode } : {}) })) } });
const runtimePath = new URL("../runtime-config.env.js", import.meta.url);
const previous = existsSync(runtimePath) ? readFileSync(runtimePath, "utf8") : null;
writeFileSync(runtimePath, `window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze({
  environment:"development",projectRef:"runtimefixture123456",supabaseUrl:"https://runtimefixture123456.supabase.co",
  supabasePublishableKey:"sb_${"publishable"}_runtime_fixture_1234567890"
});`);
let fixture;
let browser;
const checks = [];
try {
  fixture = await startAdminV2FixtureServer();
  browser = await chromium.launch({ headless: true });
  for (const width of [1280, 390, 320]) {
    for (const scenario of ["fresh", "lost-response", "navigate-pending"]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      await context.addCookies([{ name: "admin-v2-scenario", value: "ready", url: fixture.origin }]);
      await context.addInitScript((session) => {
        sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify(session));
        localStorage.setItem("econovaria.device.v1", "a0000000-0000-4000-8000-00000000000a");
      }, createAdminV2FixtureSession("ready"));
      let reads = 0;
      let holdRead = false;
      let releaseRead;
      const delayedRead = new Promise((resolve) => { releaseRead = resolve; });
      const calls = [];
      let release;
      const pending = new Promise((resolve) => { release = resolve; });
      await context.route(`**/proxy/games/${game}/players`, async (route) => {
        reads++;
        if (holdRead) await delayedRead;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { players: [] } }) });
      });
      await context.route(`**/proxy/games/${game}/players/imports/csv`, async (route) => {
        const request = route.request();
        const headers = request.headers();
        assert.equal(request.method(), "POST");
        assert.equal(headers["x-econovaria-csrf-token"], ADMIN_V2_FIXTURE_CSRF);
        assert.equal(headers["x-econovaria-game-id"], game);
        assert.equal(headers.authorization || "", "");
        assert.match(headers["idempotency-key"], /^admin\.players\.roster\./);
        const body = JSON.parse(request.postData());
        assert.deepEqual(body, { studentNames: names });
        calls.push({ body, key: headers["idempotency-key"] });
        if (scenario === "lost-response" && calls.length === 1) return route.abort("failed");
        if (scenario === "navigate-pending") await pending;
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(result(scenario === "lost-response")) });
      });
      const page = await context.newPage();
      const logs = [];
      page.on("console", (message) => logs.push(message.text()));
      await page.goto(`${fixture.origin}/admin/v2.html?game=${game}#players`);
      const opener = page.getByRole("button", { name: "Import roster CSV", exact: true });
      await page.locator('.admin-players-route[data-admin-v2-state="empty"]').waitFor();
      holdRead = true;
      await page.locator(".admin-page-frame__actions").getByRole("button", { name: "Refresh", exact: true }).click();
      await page.locator('.admin-players-route[data-admin-v2-state="refreshing"]').waitFor();
      assert.equal(await opener.isDisabled(), true, "pending read must not allow a new import dialog");
      releaseRead();
      await page.locator('.admin-players-route[data-admin-v2-state="empty"]').waitFor();
      await opener.click();
      const dialog = page.getByRole("dialog", { name: "Import roster CSV" });
      await dialog.getByLabel("Roster CSV file").setInputFiles({ name: "roster.csv", mimeType: "text/csv", buffer: Buffer.from(names.join("\n")) });
      await dialog.getByText(/3 student rows passed local format checks/).waitFor();
      const submit = dialog.getByRole("button", { name: "Create students", exact: true });
      assert.equal(await submit.isDisabled(), true);
      assert.equal(calls.length, 0);
      const initialReads = reads;
      await dialog.getByRole("checkbox").check();
      await submit.click();
      if (scenario === "navigate-pending") {
        await dialog.getByText(/Creating students securely/).waitFor();
        assert.equal(await submit.isDisabled(), true);
        await page.keyboard.press("Escape");
        assert.equal(await dialog.isVisible(), true);
        await page.evaluate(() => { location.hash = "overview"; });
        await dialog.waitFor({ state: "detached" });
        const settled = page.waitForResponse((response) => response.url().endsWith("/players/imports/csv"));
        release();
        await settled;
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assertAbsent(await page.locator("body").innerText(), rosterValues, "dismissed DOM");
      } else {
        if (scenario === "lost-response") {
          await dialog.getByText(/The import result could not be confirmed/).waitFor();
          assert.equal(await dialog.getByLabel("Roster CSV file").isDisabled(), true);
          assert.equal(await dialog.getByLabel("CSV heading").isDisabled(), true);
          await dialog.getByRole("button", { name: "Retry same import" }).click();
          await dialog.getByText(/This import already created 3 students/).waitFor();
          assert.equal(calls.length, 2);
          assert.equal(calls[0].key, calls[1].key);
          assertAbsent(await dialog.innerText(), accessCodes, "replayed receipt");
        } else {
          await dialog.getByText(/3 students created/).waitFor();
          assert.equal(calls.length, 1);
          for (const accessCode of accessCodes) assert.ok((await dialog.innerText()).includes(accessCode));
        }
        for (const { displayName, playerIdentifier } of students) {
          assert.ok((await dialog.innerText()).includes(displayName));
          assert.ok((await dialog.innerText()).includes(playerIdentifier));
        }
        assert.equal(reads, initialReads, "refresh must not destroy one-time credentials");
        assert.equal(await dialog.locator("tbody tr").count(), names.length);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1));
        assert.ok(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth <= 1));
        await dialog.getByRole("button", { name: "Close", exact: true }).click();
        await dialog.waitFor({ state: "detached" });
        assertAbsent(await page.locator("body").innerText(), rosterValues, "dismissed DOM");
      }
      assertAbsent(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })), rosterValues, "browser storage");
      assertAbsent(logs.join("\n"), rosterValues, "browser logs");
      checks.push(`${scenario}-${width}`);
      await context.close();
    }
  }
  console.log(JSON.stringify({ status: "passed", checks }, null, 2));
} finally {
  await browser?.close();
  await fixture?.close();
  if (previous === null) unlinkSync(runtimePath);
  else writeFileSync(runtimePath, previous);
}
