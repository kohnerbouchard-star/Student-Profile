import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(scriptDirectory, "admin-mounted-modal-focus-smoke.mjs");
const runtimePath = join(
  scriptDirectory,
  `.admin-mounted-modal-focus-reconciled-${process.pid}.mjs`,
);

const source = readFileSync(sourcePath, "utf8");
const staticBoundaryContract = String.raw`  await boundary.first.focus();
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
  assert(forwardWrapped, label + " did not wrap Tab from last to first.");`;

const reconciledBoundaryContract = String.raw`  if (label === "Attendance scanner modal") {
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
  }`;

const reconciledSource = source.replace(
  staticBoundaryContract,
  reconciledBoundaryContract,
);
if (reconciledSource === source) {
  throw new Error("Mounted modal focus reconciliation contract changed.");
}

try {
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
}
