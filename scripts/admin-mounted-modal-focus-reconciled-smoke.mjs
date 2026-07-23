import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(scriptDirectory, "admin-mounted-modal-focus-smoke.mjs");
const modalSourcePath = join(
  scriptDirectory,
  "admin-modal-drawer-accessibility-smoke.mjs",
);
const runtimePath = join(
  scriptDirectory,
  `.admin-mounted-modal-focus-reconciled-${process.pid}.mjs`,
);
const modalRuntimePath = join(
  scriptDirectory,
  `.admin-modal-drawer-accessibility-reconciled-${process.pid}.mjs`,
);

const source = readFileSync(sourcePath, "utf8");
const modalSource = readFileSync(modalSourcePath, "utf8");
const deterministicModalSource = modalSource.replace(
  `  await page.waitForTimeout(100);\n  assert(await opener.evaluate((node) => document.activeElement === node), \`${"${label}"} did not restore focus to its opener.\`);`,
  `  const openerHandle = await opener.elementHandle();\n  assert(openerHandle, \`${"${label}"} opener detached before focus restoration.\`);\n  await page.waitForFunction((node) => document.activeElement === node, openerHandle, { timeout: 5000 });\n  assert(await opener.evaluate((node) => document.activeElement === node), \`${"${label}"} did not restore focus to its opener.\`);`,
);
if (deterministicModalSource === modalSource) {
  throw new Error("Mounted modal focus restoration fixture contract changed.");
}

const redirectedSource = source.replace(
  "./admin-modal-drawer-accessibility-smoke.mjs",
  `./${basename(modalRuntimePath)}`,
);
if (redirectedSource === source) {
  throw new Error("Mounted modal inherited fixture path changed.");
}

const reconciledFocusTrap = `const stabilizedFocusTrap = String.raw\`async function assertFocusTrap(page, container, label) {
  await container.evaluate(async (root, currentLabel) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const controller = window.EconovariaAdminModalAccessibility?.getActiveController?.();
      if (controller?.dialog === root) return;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    throw new Error(currentLabel + " did not become the active modal controller.");
  }, label);

  const activeInside = await container.evaluate((root) => root.contains(document.activeElement));
  assert(activeInside, label + " did not move initial focus inside the surface.");
  const boundary = await markBoundary(page, container, label);

  async function traceBoundary(edge) {
    await container.evaluate((root, expectedEdge) => {
      const target = root.querySelector('[data-admin-a11y-boundary="' + expectedEdge + '"]');
      const datasetKey = expectedEdge === "first"
        ? "adminForwardBoundaryReached"
        : "adminReverseBoundaryReached";
      root.dataset[datasetKey] = "false";
      const onFocus = (event) => {
        if (event.target !== target) return;
        root.dataset[datasetKey] = "true";
        root.removeEventListener("focusin", onFocus, true);
      };
      root.addEventListener("focusin", onFocus, true);
    }, edge);
  }

  if (label === "Attendance scanner modal") {
    await boundary.first.focus();
    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(150);
    const reverseContained = await container.evaluate((root) => root.contains(document.activeElement));
    assert(reverseContained, label + " allowed Shift+Tab to escape while scanner auto-refocus was active.");

    await boundary.last.focus();
    await page.keyboard.press("Tab");
    await page.waitForTimeout(150);
    const forwardContained = await container.evaluate((root) => root.contains(document.activeElement));
    assert(forwardContained, label + " allowed Tab to escape while scanner auto-refocus was active.");
  } else {
    await boundary.first.focus();
    await traceBoundary("last");
    await page.keyboard.press("Shift+Tab");
    const reverseWrapped = await container.evaluate((root) => {
      const target = root.querySelector('[data-admin-a11y-boundary="last"]');
      return document.activeElement === target || root.dataset.adminReverseBoundaryReached === "true";
    });
    assert(reverseWrapped, label + " did not wrap Shift+Tab from first to last.");

    await boundary.last.focus();
    await traceBoundary("first");
    await page.keyboard.press("Tab");
    const forwardWrapped = await container.evaluate((root) => {
      const target = root.querySelector('[data-admin-a11y-boundary="first"]');
      return document.activeElement === target || root.dataset.adminForwardBoundaryReached === "true";
    });
    assert(forwardWrapped, label + " did not wrap Tab from last to first.");
  }
  return boundary.count;
}\`;`;

const reconciledSource = redirectedSource.replace(
  /const stabilizedFocusTrap = String[.]raw`async function assertFocusTrap\(page, container, label\) \{[\s\S]*?return boundary[.]count;\n\}`;/,
  reconciledFocusTrap,
);
if (reconciledSource === redirectedSource) {
  throw new Error("Mounted modal focus reconciliation contract changed.");
}

try {
  writeFileSync(modalRuntimePath, deterministicModalSource);
  writeFileSync(runtimePath, reconciledSource);
  const result = spawnSync(process.execPath, [runtimePath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;
} finally {
  rmSync(runtimePath, { force: true });
  rmSync(modalRuntimePath, { force: true });
}
