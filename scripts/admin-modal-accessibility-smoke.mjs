import { writeFileSync } from "node:fs";
import {
  BASE_URL,
  createQualityHarness,
} from "./admin-quality-smoke-fixture.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const report = { parent: {}, nested: {}, blocked: {}, fallback: {} };
const harness = await createQualityHarness("modal-accessibility");
const { page, errors, dir } = harness;

page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.waitForFunction(
    () => Boolean(window.EconovariaAdminModalAccessibility),
    null,
    { timeout: 10_000 },
  );

  await page.evaluate(() => {
    const original = document.createElement("button");
    original.id = "modal-test-original-opener";
    original.type = "button";
    original.textContent = "Original opener";
    document.body.append(original);
    original.focus();

    const createSurface = (id, labels) => {
      const backdrop = document.createElement("div");
      backdrop.id = `${id}-backdrop`;
      backdrop.tabIndex = -1;
      Object.assign(backdrop.style, {
        position: "fixed",
        inset: "0",
        display: "grid",
        placeItems: "center",
      });
      const dialog = document.createElement("section");
      dialog.id = `${id}-dialog`;
      dialog.setAttribute("aria-label", id);
      Object.assign(dialog.style, {
        display: "block",
        width: "320px",
        minHeight: "120px",
        padding: "16px",
        background: "white",
      });
      for (const label of labels) {
        const button = document.createElement("button");
        button.id = `${id}-${label}`;
        button.type = "button";
        button.textContent = label;
        dialog.append(button);
      }
      backdrop.append(dialog);
      document.body.append(backdrop);
      return { backdrop, dialog };
    };

    window.__adminModalTest = { createSurface, original, blockedEvents: [] };
    const parent = createSurface("parent", ["first", "last"]);
    window.__adminModalTest.parent = parent;
    window.__adminModalTest.parentController =
      window.EconovariaAdminModalAccessibility.activate({
        ...parent,
        opener: original,
        initialFocus: document.querySelector("#parent-first"),
      });
  });

  await page.waitForFunction(() => document.activeElement?.id === "parent-first");
  report.parent.initialFocus = await page.evaluate(() => document.activeElement?.id || "");

  await page.locator("#parent-last").focus();
  await page.keyboard.press("Tab");
  report.parent.forwardWrap = await page.evaluate(() => document.activeElement?.id || "");
  assert(
    report.parent.forwardWrap === "parent-first",
    `Parent Tab did not wrap to first: ${report.parent.forwardWrap}.`,
  );

  await page.keyboard.press("Shift+Tab");
  report.parent.reverseWrap = await page.evaluate(() => document.activeElement?.id || "");
  assert(
    report.parent.reverseWrap === "parent-last",
    `Parent Shift+Tab did not wrap to last: ${report.parent.reverseWrap}.`,
  );

  await page.locator("#modal-test-original-opener").focus();
  await page.waitForFunction(() => document.activeElement?.id?.startsWith("parent-"));
  report.parent.focusInContainment = await page.evaluate(() => document.activeElement?.id || "");

  await page.evaluate(() => {
    document.querySelector("#parent-last")?.focus();
    const child = window.__adminModalTest.createSurface("child", ["first", "last"]);
    window.__adminModalTest.child = child;
    window.__adminModalTest.childController =
      window.EconovariaAdminModalAccessibility.activate({
        ...child,
        opener: document.querySelector("#parent-last"),
        initialFocus: document.querySelector("#child-first"),
      });
  });
  await page.waitForFunction(() => document.activeElement?.id === "child-first");
  report.nested.depthWhileOpen = await page.evaluate(() =>
    window.EconovariaAdminModalAccessibility.getStackDepth()
  );
  assert(
    report.nested.depthWhileOpen === 2,
    `Expected nested depth 2, received ${report.nested.depthWhileOpen}.`,
  );

  await page.keyboard.press("Escape");
  await page.waitForFunction(() =>
    !document.querySelector("#child-backdrop") &&
    window.EconovariaAdminModalAccessibility.getStackDepth() === 1
  );
  await page.waitForFunction(() => document.activeElement?.id === "parent-last");
  report.nested.restoredToParentOpener = await page.evaluate(() =>
    document.activeElement?.id || ""
  );

  await page.locator("#modal-test-original-opener").focus();
  await page.waitForFunction(() => document.activeElement?.id?.startsWith("parent-"));
  report.nested.parentTrapResumed = await page.evaluate(() => document.activeElement?.id || "");

  await page.keyboard.press("Escape");
  await page.waitForFunction(() =>
    !document.querySelector("#parent-backdrop") &&
    window.EconovariaAdminModalAccessibility.getStackDepth() === 0
  );
  await page.waitForFunction(() =>
    document.activeElement?.id === "modal-test-original-opener"
  );
  report.parent.restoredOriginalOpener = await page.evaluate(() =>
    document.activeElement?.id || ""
  );

  await page.evaluate(() => {
    const locked = window.__adminModalTest.createSurface("locked", ["acknowledge"]);
    locked.backdrop.addEventListener(
      "econovaria:admin-modal-dismiss-blocked",
      (event) => {
        window.__adminModalTest.blockedEvents.push(
          event.detail?.reason || "unknown",
        );
      },
    );
    window.__adminModalTest.locked = locked;
    window.__adminModalTest.lockedController =
      window.EconovariaAdminModalAccessibility.activate({
        ...locked,
        opener: window.__adminModalTest.original,
        dismissOnEscape: false,
        dismissOnBackdrop: false,
      });
  });
  await page.waitForFunction(() =>
    document.activeElement?.id === "locked-acknowledge"
  );
  await page.keyboard.press("Escape");
  report.blocked = await page.evaluate(() => ({
    connected: Boolean(document.querySelector("#locked-backdrop")),
    active: document.activeElement?.id || "",
    events: [...window.__adminModalTest.blockedEvents],
    depth: window.EconovariaAdminModalAccessibility.getStackDepth(),
  }));
  assert(report.blocked.connected, "Locked acknowledgement modal closed on Escape.");
  assert(
    report.blocked.active === "locked-acknowledge",
    `Locked modal lost focus: ${report.blocked.active}.`,
  );
  assert(
    report.blocked.events.includes("escape"),
    `Locked modal omitted blocked Escape evidence: ${JSON.stringify(report.blocked.events)}.`,
  );
  await page.evaluate(() =>
    window.__adminModalTest.lockedController.close("acknowledged")
  );
  await page.waitForFunction(() =>
    !document.querySelector("#locked-backdrop") &&
    window.EconovariaAdminModalAccessibility.getStackDepth() === 0
  );

  await page.evaluate(() => {
    const transient = document.createElement("button");
    transient.id = "transient-opener";
    transient.type = "button";
    transient.textContent = "Transient opener";
    document.body.append(transient);
    transient.focus();
    const fallback = window.__adminModalTest.createSurface("fallback", ["close"]);
    window.__adminModalTest.fallbackController =
      window.EconovariaAdminModalAccessibility.activate({
        ...fallback,
        opener: transient,
      });
    transient.remove();
  });
  await page.waitForFunction(() => document.activeElement?.id === "fallback-close");
  await page.evaluate(() =>
    window.__adminModalTest.fallbackController.close("close-button")
  );
  await page.waitForFunction(() =>
    !document.querySelector("#fallback-backdrop") &&
    window.EconovariaAdminModalAccessibility.getStackDepth() === 0
  );
  await page.waitForFunction(
    () => Boolean(
      document.activeElement?.getAttribute?.("data-admin-section") ||
      document.activeElement?.closest?.("#adminPreview")
    ),
    null,
    { timeout: 3000 },
  );
  report.fallback.active = await page.evaluate(() => ({
    id: document.activeElement?.id || "",
    section: document.activeElement?.getAttribute?.("data-admin-section") || "",
    inAdmin: Boolean(document.activeElement?.closest?.("#adminPreview")),
  }));
  assert(
    report.fallback.active.section || report.fallback.active.inAdmin,
    `Disconnected opener did not restore to Admin fallback: ${JSON.stringify(report.fallback.active)}.`,
  );

  assert(
    errors.length === 0,
    `Admin modal accessibility emitted browser errors: ${errors[0]}`,
  );
  report.errors = [...errors];
  writeFileSync(
    `${dir}/modal-accessibility.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(
    "Admin nested modal focus, Escape, blocked dismissal, and restoration smoke passed.",
  );
} catch (error) {
  report.failure = error.stack || error.message || String(error);
  report.errors = [...errors];
  await harness.capture("modal-accessibility-failure").catch(() => {});
  writeFileSync(
    `${dir}/modal-accessibility.json`,
    JSON.stringify(report, null, 2),
  );
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await harness.finish(report);
}
