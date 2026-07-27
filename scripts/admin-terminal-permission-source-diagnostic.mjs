import { mkdirSync, writeFileSync } from "node:fs";
import {
  BASE_URL,
  createQualityHarness,
} from "./admin-quality-smoke-fixture.mjs";

const OUT = process.env.ADMIN_SMOKE_ARTIFACT_DIR ||
  "admin-browser-smoke-artifacts/terminal-permission-source";
mkdirSync(OUT, { recursive: true });

const harness = await createQualityHarness("terminal-permission-source");
const { page, errors } = harness;
const report = {};

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.waitForTimeout(2500);

  const diagnostic = await page.evaluate(async () => {
    const response = await fetch(
      new URL("./dist/admin-overview-terminal.js", window.location.href),
      { cache: "no-store" },
    );
    const source = await response.text();
    const needles = [
      "You do not have permission to open this section.",
      "Permission required",
      "permissions.includes",
      "permissions?.includes",
      "hasAdminTerminalPermission",
      "canAdminTerminalAccess",
      "requiredPermission",
      "__sessionBootstrapPending",
      "loadAdminTerminalSessionBootstrap",
      "authState",
    ];
    const excerpts = {};
    for (const needle of needles) {
      const matches = [];
      let start = 0;
      while (matches.length < 12) {
        const index = source.indexOf(needle, start);
        if (index < 0) break;
        matches.push({
          index,
          excerpt: source.slice(Math.max(0, index - 5000), index + needle.length + 5000),
        });
        start = index + needle.length;
      }
      excerpts[needle] = matches;
    }

    const feature = window.Econovaria?.features?.adminOverviewTerminal || null;
    const promise = feature?.sessionBootstrapPromise;
    let promiseState = "absent";
    if (promise && typeof promise.then === "function") {
      promiseState = await Promise.race([
        promise.then(() => "fulfilled", () => "rejected"),
        new Promise((resolve) => setTimeout(() => resolve("pending"), 100)),
      ]);
    }

    return {
      sourceBytes: source.length,
      responseStatus: response.status,
      excerpts,
      authState: feature?.authState || null,
      sessionBootstrapPromiseState: promiseState,
      currentModel: {
        pending: feature?.currentModel?.__sessionBootstrapPending,
        permissions: Array.isArray(feature?.currentModel?.permissions)
          ? [...feature.currentModel.permissions]
          : [],
        staffPermissions: Array.isArray(feature?.currentModel?.staffSession?.permissions)
          ? [...feature.currentModel.staffSession.permissions]
          : [],
        keys: feature?.currentModel && typeof feature.currentModel === "object"
          ? Object.keys(feature.currentModel).sort()
          : [],
      },
      gate: document.querySelector(".admin-terminal-session-gate-v604")?.textContent
        ?.trim().replace(/\s+/g, " ") || "",
      navigation: [...document.querySelectorAll("[data-admin-section]")].map((node) => ({
        section: node.getAttribute("data-admin-section") || "",
        disabled: node.hasAttribute("disabled"),
        title: node.getAttribute("title") || "",
      })),
    };
  });

  Object.assign(report, diagnostic, { errors: [...errors] });
  writeFileSync(`${OUT}/terminal-permission-source.json`, JSON.stringify(report, null, 2));
  console.log("Admin terminal permission source diagnostic captured.");
} catch (error) {
  report.failure = error?.stack || error?.message || String(error);
  report.errors = [...errors];
  writeFileSync(`${OUT}/terminal-permission-source.json`, JSON.stringify(report, null, 2));
  console.error(report.failure);
} finally {
  await harness.finish(report);
}
