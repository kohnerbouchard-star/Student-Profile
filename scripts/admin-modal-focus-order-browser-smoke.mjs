import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const accessibilityWarnings = [];
  page.on("console", (message) => {
    if (/aria-hidden|retained focus|assistive technology/i.test(message.text())) {
      accessibilityWarnings.push(`${message.type()}: ${message.text()}`);
    }
  });

  await page.setContent(`<!doctype html>
    <html>
      <body>
        <main id="adminPreview">
          <button id="opener" type="button">Open modal</button>
        </main>
        <div id="modalRoot"></div>
      </body>
    </html>`);
  await page.addScriptTag({
    path: resolve("admin/modal-focus-order-guard.js"),
  });

  const opened = await page.evaluate(() => {
    const preview = document.getElementById("adminPreview");
    const opener = document.getElementById("opener");
    const root = document.getElementById("modalRoot");
    opener.focus();
    root.innerHTML = `
      <div class="admin-terminal-modal-backdrop" data-admin-terminal-modal-backdrop>
        <section class="admin-terminal-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <h2 id="modalTitle">Modal title</h2>
          <button id="modalClose" type="button">Close</button>
        </section>
      </div>`;

    preview.setAttribute("data-admin-terminal-was-inert", "false");
    preview.inert = true;
    preview.setAttribute("aria-hidden", "true");

    return {
      activeId: document.activeElement?.id || "",
      previewInert: preview.inert,
      previewAriaHidden: preview.getAttribute("aria-hidden"),
      guardInstalled: Boolean(window.EconovariaAdminModalFocusOrderGuard),
      inertPatched: window.EconovariaAdminModalFocusOrderGuard?.inertPatched === true,
    };
  });

  assert.equal(opened.guardInstalled, true);
  assert.equal(opened.inertPatched, true);
  assert.equal(opened.activeId, "modalClose");
  assert.equal(opened.previewInert, true);
  assert.equal(opened.previewAriaHidden, "true");
  assert.deepEqual(accessibilityWarnings, []);

  const closed = await page.evaluate(() => {
    const preview = document.getElementById("adminPreview");
    const opener = document.getElementById("opener");
    const root = document.getElementById("modalRoot");
    preview.inert = false;
    preview.removeAttribute("data-admin-terminal-was-inert");
    preview.removeAttribute("aria-hidden");
    root.replaceChildren();
    opener.focus({ preventScroll: true });
    return {
      activeId: document.activeElement?.id || "",
      previewInert: preview.inert,
      previewAriaHidden: preview.getAttribute("aria-hidden"),
    };
  });

  assert.equal(closed.activeId, "opener");
  assert.equal(closed.previewInert, false);
  assert.equal(closed.previewAriaHidden, null);
  assert.deepEqual(accessibilityWarnings, []);

  console.log("Admin modal focus-order browser smoke passed.");
} finally {
  await browser.close();
}
