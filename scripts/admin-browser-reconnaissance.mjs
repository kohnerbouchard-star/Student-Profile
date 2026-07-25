#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = process.env.ECONOVARIA_BROWSER_OUTPUT_DIR || "/tmp/econovaria-browser";
const LICENSE_CODE = process.env.ECONOVARIA_BROWSER_LICENSE_CODE || "BROWSER-E2E-LICENSE-001";
const ADMIN_EMAIL = process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "browser.e2e@example.test";
const ADMIN_PASSWORD = process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD || "Browser-E2E-Access-2026!";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Browser E2E Economy";

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  adminEmail: ADMIN_EMAIL,
  gameName: GAME_NAME,
  createdThroughRenderedUi: false,
  adminConsoleRendered: false,
  requests: [],
  controls: [],
  consoleErrors: [],
  pageErrors: [],
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();

page.on("console", (message) => {
  if (message.type() === "error") evidence.consoleErrors.push(message.text());
});
page.on("pageerror", (error) => evidence.pageErrors.push(String(error?.message || error)));
page.on("response", async (response) => {
  const url = response.url();
  if (!url.includes("/functions/v1/") && !url.includes("/auth/v1/")) return;
  evidence.requests.push({
    method: response.request().method(),
    url: url.replace(BASE_URL, "[local-gateway]"),
    status: response.status(),
  });
});

let failure;
try {
  await page.goto(`${BASE_URL}/?mode=create`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("#createForm").waitFor({ state: "visible", timeout: 30_000 });

  const brokenImages = await page.locator("img").evaluateAll((images) => images
    .filter((image) => image.complete && image.naturalWidth === 0)
    .map((image) => image.getAttribute("src") || "[missing-src]"));
  if (brokenImages.length) throw new Error(`Login page has broken images: ${brokenImages.join(", ")}`);

  await page.locator("#licenseCode").fill(LICENSE_CODE);
  await page.locator("#createEmail").fill(ADMIN_EMAIL);
  await page.locator("#createDisplayName").fill("Browser E2E Teacher");
  await page.locator("#sessionName").fill(GAME_NAME);
  await page.locator("#gameTimeZone").selectOption("Asia/Seoul");
  await page.locator("#difficultyLevel").selectOption("moderate");
  await page.locator("#createAccessCode").fill(ADMIN_PASSWORD);
  await page.locator("#confirmAccessCode").fill(ADMIN_PASSWORD);

  const signupResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/classroom-api/staff/signup"),
    { timeout: 120_000 },
  );
  await page.getByRole("button", { name: "Create Game", exact: true }).click();
  const signupResponse = await signupResponsePromise;
  if (signupResponse.status() !== 201) {
    const body = await signupResponse.text().catch(() => "");
    throw new Error(`Rendered Create Game returned ${signupResponse.status()}: ${body.slice(0, 500)}`);
  }

  await page.waitForURL(/\/admin\/(?:index\.html)?(?:\?.*)?$/, { timeout: 120_000 });
  evidence.createdThroughRenderedUi = true;

  await page.waitForFunction(() => {
    const preview = document.getElementById("adminPreview");
    return Boolean(preview && !preview.hidden && preview.childElementCount > 0);
  }, undefined, { timeout: 120_000 });
  evidence.adminConsoleRendered = true;

  await page.waitForTimeout(1500);
  evidence.controls = await page.locator("button, [role='button'], [data-action]").evaluateAll((nodes) => nodes
    .filter((node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    })
    .map((node) => ({
      tag: node.tagName.toLowerCase(),
      id: node.id || null,
      text: String(node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180),
      action: node.getAttribute("data-action"),
      disabled: "disabled" in node ? Boolean(node.disabled) : node.getAttribute("aria-disabled") === "true",
      ariaLabel: node.getAttribute("aria-label"),
      title: node.getAttribute("title"),
    })));

  const failedRuntimeRequests = evidence.requests.filter((request) => request.status >= 500);
  if (failedRuntimeRequests.length) {
    throw new Error(`Browser observed server failures: ${JSON.stringify(failedRuntimeRequests)}`);
  }
  if (!evidence.controls.some((control) => /logout/i.test(`${control.text} ${control.ariaLabel || ""}`))) {
    throw new Error("Rendered Admin console does not expose a visible logout control.");
  }

  await page.screenshot({ path: `${OUTPUT_DIR}/admin-console.png`, fullPage: true });
} catch (error) {
  failure = error;
  evidence.failure = String(error?.stack || error);
  await page.screenshot({ path: `${OUTPUT_DIR}/browser-failure.png`, fullPage: true }).catch(() => {});
} finally {
  evidence.finalUrl = page.url();
  await writeFile(`${OUTPUT_DIR}/admin-browser-reconnaissance.json`, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await context.close();
  await browser.close();
}

if (failure) throw failure;

console.log(JSON.stringify({
  ok: true,
  createdThroughRenderedUi: evidence.createdThroughRenderedUi,
  adminConsoleRendered: evidence.adminConsoleRendered,
  controlCount: evidence.controls.length,
  runtimeRequestCount: evidence.requests.length,
}));
