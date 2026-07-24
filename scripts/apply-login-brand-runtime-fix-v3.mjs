import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const VERSION = "20260724.4";
const indexPath = "index.html";
let html = readFileSync(indexPath, "utf8");

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  assert.notEqual(first, -1, `Missing ${label}`);
  assert.equal(source.indexOf(search, first + search.length), -1, `Multiple ${label} matches`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

html = html.replace('<html lang="en" class="preload">', '<html lang="en">');
html = replaceOnce(
  html,
  '  <link rel="icon" type="image/png" sizes="32x32" href="assets/brand/favicon-32.png" />',
  `  <link rel="icon" type="image/png" sizes="32x32" href="./assets/brand/favicon-32.png?v=${VERSION}" />\n  <link rel="shortcut icon" type="image/png" href="./assets/brand/favicon-32.png?v=${VERSION}" />`,
  "root favicon declaration",
);

const fallbackCss = `
    .login-root .logo-mark.is-econovaria-logo {
      position: relative;
      display: grid;
      place-items: center;
      overflow: hidden;
    }

    .login-root .logo-mark-fallback {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: #8eeeff;
      font: 900 clamp(22px, 5vw, 38px)/1 ui-sans-serif, system-ui, sans-serif;
      letter-spacing: .08em;
      text-shadow: 0 0 16px rgba(0, 212, 255, .55), 0 0 22px rgba(255, 0, 238, .28);
    }

    .login-root .logo-mark.is-econovaria-logo img {
      position: relative;
      z-index: 1;
    }

    .login-root .logo-mark.has-brand-error img {
      display: none;
    }
`;
if (!html.includes(".login-root .logo-mark-fallback")) {
  html = replaceOnce(
    html,
    '    @media (prefers-reduced-motion: reduce) {',
    `${fallbackCss}\n    @media (prefers-reduced-motion: reduce) {`,
    "login reduced-motion marker",
  );
}

html = replaceOnce(
  html,
  '              <img src="assets/brand/econovaria-logo.webp" width="286" height="161" alt="Econovaria" />',
  `              <span class="logo-mark-fallback" aria-hidden="true">ECONOVARIA</span>\n              <img src="./assets/brand/econovaria-logo.png?v=${VERSION}" width="1200" height="675" alt="Econovaria" decoding="async" fetchpriority="high" data-econovaria-brand-image />`,
  "login logo image",
);

html = replaceOnce(
  html,
  `  <script>\n    window.setTimeout(function releasePreloadFallback() {\n      document.documentElement.classList.remove("preload");\n    }, 1800);\n  </script>`,
  `  <script>\n    (function installLoginSurfaceGuard() {\n      document.documentElement.classList.remove("preload");\n      const image = document.querySelector("[data-econovaria-brand-image]");\n      const mark = image?.closest(".logo-mark");\n      const fail = function () { mark?.classList.add("has-brand-error"); };\n      image?.addEventListener("load", function () { mark?.classList.remove("has-brand-error"); });\n      image?.addEventListener("error", fail, { once: true });\n      if (image?.complete && image.naturalWidth === 0) fail();\n    })();\n  </script>`,
  "login preload fallback",
);

writeFileSync(indexPath, html);

const logo = readFileSync("assets/brand/econovaria-logo.png");
assert.ok(logo.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
assert.equal(logo.readUInt32BE(16), 1200);
assert.equal(logo.readUInt32BE(20), 675);

writeFileSync("scripts/login-surface-browser-smoke.mjs", `import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 4317;
const origin = \\`http://127.0.0.1:\\${port}\\`;
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", root], { stdio: ["ignore", "pipe", "pipe"] });

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 15000;
    const probe = () => {
      const request = http.get(origin + "/", (response) => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else if (Date.now() > deadline) reject(new Error(\\`Static server returned \\${response.statusCode}\\`));
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
  await page.goto(origin + "/?login-smoke=${VERSION}", { waitUntil: "networkidle" });
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
  assert.match(surface.logoType, /image\\/png/);
  assert.equal(surface.iconStatus, 200);
  assert.match(surface.iconType, /image\\/png/);
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
`);

writeFileSync(".github/workflows/login-surface-smoke.yml", `name: Login Surface Smoke

on:
  pull_request:
    paths:
      - "index.html"
      - "assets/brand/**"
      - "frontend/src/core/**"
      - "frontend/src/styles/**"
      - "scripts/login-surface-browser-smoke.mjs"
      - ".github/workflows/login-surface-smoke.yml"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  browser-smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 12
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22.23.1
          cache: npm
      - run: npm ci --ignore-scripts
      - run: npx playwright install --with-deps chromium
      - run: node scripts/login-surface-browser-smoke.mjs
`);

console.log("Applied current-main login runtime repair and browser contract.");
