import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(scriptDirectory, "admin-mounted-modal-focus-smoke.mjs");
const source = readFileSync(sourcePath, "utf8");

const requiredContracts = [
  'from "./admin-quality-smoke-fixture.mjs"',
  "createQualityHarness",
  "EconovariaAdminModalAccessibility",
  "forwardBoundaryReached",
  "reverseBoundaryReached",
  "pointerEvents.length === 0",
];
for (const contract of requiredContracts) {
  if (!source.includes(contract)) {
    throw new Error(
      `Mounted modal focus BFF reconciliation contract changed: ${contract}`,
    );
  }
}

const result = spawnSync(process.execPath, [sourcePath], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status || 1;
