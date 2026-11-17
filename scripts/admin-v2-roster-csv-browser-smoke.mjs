import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { chromium } from "playwright";
import { ADMIN_V2_FIXTURE_GAME_ID, createAdminV2FixtureSession, startAdminV2FixtureServer } from "./admin-v2-browser-fixture-server.mjs";

const header = "student_name";
const valid = `${header}\nFILEMARKER Avery\n"Doe, Blair"`;
const runtimePath = new URL("../runtime-config.env.js", import.meta.url);
const previous = existsSync(runtimePath) ? readFileSync(runtimePath, "utf8") : null;
writeFileSync(runtimePath, `window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze({
  environment: "development", projectRef: "runtimefixture123456",
  supabaseUrl: "https://runtimefixture123456.supabase.co",
  supabasePublishableKey: "sb_${"publishable"}_runtime_fixture_1234567890"
});`);
let fixture;
let browser;
const checks = [];
try {
  fixture = await startAdminV2FixtureServer();
  browser = await chromium.launch({ headless: true });
  for (const width of [1280, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    await context.addCookies([{ name: "admin-v2-scenario", value: "ready", url: fixture.origin }]);
    await context.addInitScript((session) => {
      sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify(session));
      localStorage.setItem("econovaria.device.v1", "a0000000-0000-4000-8000-00000000000a");
    }, createAdminV2FixtureSession("ready"));
    await context.route(`**/proxy/games/${ADMIN_V2_FIXTURE_GAME_ID}/players`, (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ data: { players: [] }, error: null, meta: {} }),
    }));
    const page = await context.newPage();
    const requests = [];
    page.on("request", (request) => requests.push({ method: request.method(), value: `${request.url()} ${request.postData() || ""}` }));
    await page.goto(`${fixture.origin}/admin/v2.html?game=${ADMIN_V2_FIXTURE_GAME_ID}#players`);
    const opener = page.getByRole("button", { name: "Import roster CSV", exact: true });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Import roster CSV" });
    const input = dialog.getByLabel("Roster CSV file");
    const file = (text, name = "roster.csv") => ({ name, mimeType: "text/csv", buffer: Buffer.from(text) });
    await input.setInputFiles(file(valid));
    await dialog.getByText(/2 student rows passed local format checks/).waitFor();
    assert.equal(await dialog.locator("tbody tr").count(), 2);
    assert.match(await dialog.innerText(), /Preview stays on this device until you confirm/);
    assert.equal(await dialog.getByRole("button", { name: "Create students", exact: true }).isDisabled(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1));
    assert.ok(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth <= 1));
    await page.keyboard.press("Tab");
    assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await opener.evaluate((element) => element === document.activeElement), true);
    assert.doesNotMatch(await page.locator("body").innerText(), /FILEMARKER/);

    await opener.click();
    assert.equal(await dialog.locator("tbody tr").count(), 0);
    await input.setInputFiles(file("Name\nAvery"));
    await dialog.getByText(/1 student row passed/).waitFor();
    await dialog.getByLabel("CSV heading").selectOption("absent");
    await dialog.getByText(/2 student rows passed/).waitFor();
    assert.match(await dialog.locator("tbody").innerText(), /Name/);
    await dialog.getByLabel("CSV heading").selectOption("auto");
    await input.setInputFiles(file(`${header}\nAvery\nAvery`));
    await dialog.getByText(/Repeated names are kept as separate student rows/).waitFor();
    assert.equal(await dialog.locator("tbody tr").count(), 2);
    await input.setInputFiles(file(`${header},access_code\nAvery,PRIVATE-MARKER`));
    await dialog.getByText(/Use one column containing student names only/).waitFor();
    assert.doesNotMatch(await dialog.innerText(), /PRIVATE-MARKER/);
    await input.setInputFiles(file("a".repeat(128 * 1024 + 1)));
    await dialog.getByText("Use a CSV file no larger than 128 KiB.", { exact: true }).waitFor();
    await input.setInputFiles(file(`${header}\n<img src=x onerror=alert(1)>`));
    await dialog.getByText(/1 student row passed local format checks/).waitFor();
    assert.equal(await dialog.locator("img").count(), 0);
    assert.match(await dialog.locator("tbody").innerText(), /<img/);
    await input.setInputFiles(file(valid));
    await dialog.getByText(/2 student rows passed local format checks/).waitFor();

    // A later selection owns publication even when the earlier File read finishes last.
    await page.evaluate(() => {
      const original = File.prototype.text;
      File.prototype.text = function () {
        if (this.name === "slow.csv") return new Promise((resolve) => { window.finishSlowCsv = resolve; });
        if (this.name === "unreadable.csv") return Promise.reject(new Error("private source must not be shown"));
        return original.call(this);
      };
    });
    await input.setInputFiles(file(valid, "slow.csv"));
    await input.setInputFiles(file(`${header}\nNewer`));
    await dialog.getByText(/1 student row passed local format checks/).waitFor();
    await page.evaluate((source) => window.finishSlowCsv(source), valid);
    assert.match(await dialog.locator("tbody").innerText(), /Newer/);
    assert.doesNotMatch(await dialog.innerText(), /FILEMARKER/);
    await input.setInputFiles(file(valid, "unreadable.csv"));
    await dialog.getByText(/The file could not be read/).waitFor();
    assert.doesNotMatch(await dialog.innerText(), /private source/);
    await input.setInputFiles(file(valid, "slow.csv"));
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.evaluate((source) => window.finishSlowCsv(source), valid);
    await dialog.waitFor({ state: "detached" });
    await opener.click();
    assert.equal(await dialog.locator("tbody tr").count(), 0);
    await input.setInputFiles(file(valid));
    await dialog.getByText(/2 student rows passed local format checks/).waitFor();
    await page.evaluate(() => { location.hash = "overview"; });
    await dialog.waitFor({ state: "detached" });
    await page.goBack();
    await opener.click();
    assert.equal(await dialog.locator("tbody tr").count(), 0);
    await page.goForward();
    await dialog.waitFor({ state: "detached" });
    assert.doesNotMatch(await page.locator("body").innerText(), /FILEMARKER/);
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    assert.doesNotMatch(storage, /FILEMARKER|PRIVATE-MARKER/);
    assert.doesNotMatch(JSON.stringify(requests), /FILEMARKER|PRIVATE-MARKER/);
    assert.deepEqual(requests.filter((request) => !["GET", "HEAD"].includes(request.method)), []);
    checks.push(`local-preview-validation-dismissal-races-navigation-no-transmission-${width}`);
    await context.close();
  }
  console.log(JSON.stringify({ status: "passed", checks }, null, 2));
} finally {
  await browser?.close();
  await fixture?.close();
  if (previous === null) unlinkSync(runtimePath);
  else writeFileSync(runtimePath, previous);
}
