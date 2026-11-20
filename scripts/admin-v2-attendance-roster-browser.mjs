import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startAdminV2FixtureServer } from "./admin-v2-browser-fixture-server.mjs";
import { attendanceModel } from "./fixtures/admin-attendance-route-harness.mjs";

// Real DOM/components, synthetic already-authorized data, no database writes.
const fixture = await startAdminV2FixtureServer();
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/__attendance-roster-test", (route) => route.fulfill({
      contentType: "text/html", body: `<!doctype html><html lang="en"><head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      ${["reset", "tokens", "base", "components", "utilities", "routes/attendance"].map((file) => `<link rel="stylesheet" href="/admin/v2/styles/${file}.css">`).join("")}
      </head><body data-admin-ui-version="2"></body></html>`,
    }));
    await page.goto(`${fixture.origin}/__attendance-roster-test`);
    await page.evaluate(async (model) => {
      document.body.replaceChildren();
      const { AttendanceRoute } = await import("/admin/v2/src/routes/attendance/AttendanceRoute.js");
      const mount = () => {
        window.route?.destroy();
        window.route = AttendanceRoute({ state: { status: "ready", data: model },
          scanner: { accepting: false, status: "idle", message: "Synthetic roster" } });
        document.body.replaceChildren(window.route.element);
      };
      window.mountAttendance = mount; mount();
    }, attendanceModel());
    const roster = page.getByRole("region", { name: "Attendance roster", exact: true });
    const search = page.getByLabel("Find a player", { exact: true });
    const status = page.getByLabel("Attendance status", { exact: true });
    const sort = roster.getByRole("button", { name: /^Sort by Player,/ });
    await sort.click(); await sort.click();
    assert.equal(await roster.locator("th").first().getAttribute("aria-sort"), "descending");
    const originalOrder = await roster.locator("tbody th").allTextContents();
    await search.fill("sample");
    assert.equal(await roster.locator("tbody tr").count(), 1);
    assert.match(await roster.innerText(), /Sample Student/);
    await status.selectOption("present");
    assert.match(await roster.innerText(), /No matching players/);
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    assert.equal(await search.inputValue(), "");
    assert.equal(await status.inputValue(), "all");
    assert.equal(await search.evaluate((element) => document.activeElement === element), true);
    assert.equal(await roster.locator("tbody tr").count(), 2);
    assert.equal(await roster.locator("th").first().getAttribute("aria-sort"), "descending");
    assert.deepEqual(await roster.locator("tbody th").allTextContents(), originalOrder);
    await search.fill("class a");
    assert.match(await roster.innerText(), /가상 학생/);
    assert.equal(await roster.locator("tbody tr").count(), 1);
    await search.press("Tab");
    assert.equal(await status.evaluate((element) => document.activeElement === element), true);
    await page.evaluate(() => window.mountAttendance());
    assert.equal(await search.inputValue(), "");
    assert.equal(await roster.locator("tbody tr").count(), 2);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Attendance roster browser: desktop/mobile search, combined status, empty, reset/focus, keyboard, remount PASS");
} finally {
  await browser?.close(); await fixture.close();
}
