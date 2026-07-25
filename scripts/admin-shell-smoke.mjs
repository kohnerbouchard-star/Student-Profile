import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const diagnosticsDirectory = "admin-browser-smoke-artifacts/source-contracts";
const checks = [
  ["Admin shell identity", "scripts/admin-shell-identity-v2-smoke.mjs"],
  ["Keyboard navigation source", "scripts/admin-keyboard-navigation-source-smoke.mjs"],
  ["Explicit mounted event", "scripts/admin-explicit-mounted-event-smoke.mjs"],
  ["Modal accessibility source", "scripts/admin-modal-accessibility-source-smoke.mjs"],
  ["Viewport scroll ownership", "scripts/admin-scroll-integrity-contract.test.mjs"],
];

mkdirSync(diagnosticsDirectory, { recursive: true });
const report = [];

for (const [label, path] of checks) {
  const result = spawnSync(process.execPath, [path], { encoding: "utf8" });
  const entry = {
    label,
    path,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
  report.push(entry);
  if (result.status !== 0) {
    writeFileSync(`${diagnosticsDirectory}/admin-shell-source-contracts.json`, JSON.stringify(report, null, 2));
    throw new Error(`${label} failed:\n${entry.stderr || entry.stdout || `exit ${result.status}`}`);
  }
}

writeFileSync(`${diagnosticsDirectory}/admin-shell-source-contracts.json`, JSON.stringify(report, null, 2));
console.log("Admin shell identity, keyboard navigation, explicit mount, modal accessibility, and viewport scroll ownership source contracts passed.");
