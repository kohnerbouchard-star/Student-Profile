import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 4317;
const origin = "http://127.0.0.1:" + port;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", root], { stdio: ["ignore", "pipe", "pipe"] });

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 15000;
    const probe = () => {
      const request = http.get(origin + "/", (response) => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else if (Date.now() > deadline) reject(new Error("Static server returned " + response.statusCode));
        else setTimeout(probe, 150);
      });
      request.on("error", () => Date.now() > deadline ? reject(new Error("Static server did not start")) : setTimeout(probe, 150));
    };
    probe();
  });
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push("pageerror: " + error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push("console: " + message.text()); });
  await page.route("**/runtime-config.env.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: 'window.__ECONOVARIA_RUNTIME_CONFIG__=Object.freeze({environment:"staging",projectRef:"eecvbssdvarfcykcfrny",supabaseUrl:"https://eecvbssdvarfcykcfrny.supabase.co",apiProxyUrl:"http://127.0.0.1:4317",supabasePublishableKey:"sb_publishable_login_surface_test"});',
  }));
  await page.goto(origin + "/?login-smoke=20260724.4", { waitUntil: "networkidle" });
  await page.locator(".login-panel-frame").waitFor({ state: "visible" });

  const surface = await page.evaluate(async () => {
    const logo = document.querySelector("[data-econovaria-brand-image]");
    const panel = document.querySelector(".login-panel-frame");
    const playerForm = document.getElementById("playerForm");
    const rect = logo?.getBoundingClientRect();
    const panelStyle = panel ? getComputedStyle(panel) : null;
    const logoResponse = await fetch(logo?.getAttribute("src") || "");
    const icon = document.querySelector('link[rel="icon"]');
    const iconResponse = await fetch(icon?.getAttribute("href") || "");
    return {
      preload: document.documentElement.classList.contains("preload"),
      panelDisplay: panelStyle?.display,
      panelVisibility: panelStyle?.visibility,
      panelOpacity: panelStyle?.opacity,
      logoNaturalWidth: logo?.naturalWidth || 0,
      logoNaturalHeight: logo?.naturalHeight || 0,
      logoWidth: rect?.width || 0,
      logoHeight: rect?.height || 0,
      logoStatus: logoResponse.status,
      logoType: logoResponse.headers.get("content-type") || "",
      iconStatus: iconResponse.status,
      iconType: iconResponse.headers.get("content-type") || "",
      playerFormVisible: Boolean(playerForm && playerForm.getBoundingClientRect().width > 0),
      playerControlsEnabled: Array.from(playerForm?.querySelectorAll("input,button") || []).every((node) => !node.disabled),
    };
  });

  assert.equal(surface.preload, false);
  assert.notEqual(surface.panelDisplay, "none");
  assert.notEqual(surface.panelVisibility, "hidden");
  assert.ok(Number(surface.panelOpacity) > 0.9);
  assert.ok(surface.logoNaturalWidth >= 1000);
  assert.ok(surface.logoNaturalHeight >= 600);
  assert.ok(surface.logoWidth >= 240);
  assert.ok(surface.logoHeight >= 120);
  assert.equal(surface.logoStatus, 200);
  assert.match(surface.logoType, /image\/png/);
  assert.equal(surface.iconStatus, 200);
  assert.match(surface.iconType, /image\/png/);
  assert.equal(surface.playerFormVisible, true);
  assert.equal(surface.playerControlsEnabled, true);

  await page.locator('.mode-tab[data-mode="admin"]').click();
  assert.equal(await page.locator("#adminPane").evaluate((node) => node.classList.contains("active")), true);
  await page.locator('.mode-tab[data-mode="create"]').click();
  assert.equal(await page.locator("#createPane").evaluate((node) => node.classList.contains("active")), true);
  await page.locator('.mode-tab[data-mode="player"]').click();
  assert.equal(await page.locator("#playerPane").evaluate((node) => node.classList.contains("active")), true);

  assert.deepEqual(browserErrors, []);
  console.log("Login surface browser smoke passed", surface);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
