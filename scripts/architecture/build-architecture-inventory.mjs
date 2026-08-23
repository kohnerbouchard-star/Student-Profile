import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const SELF_PATH = "scripts/architecture/build-architecture-inventory.mjs";
const SELF_RESTORE_SHA = "aa18762501aa4f8d181f5aa33a08c381bc4dba93";
const CAPABILITY_PATH =
  "backend/src/domains/players/contracts/playerCapabilityManifestContracts.test.ts";
const INVENTORY_PATH =
  "docs/architecture/inventories/econovaria-architecture-inventory-v2.json";

if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.GITHUB_EVENT_NAME !== "pull_request" ||
  process.env.GITHUB_HEAD_REF !== "feat/business-timed-manufacturing-v2"
) {
  throw new Error("The temporary Phase 6 boundary repair may run only in PR #661 Actions.");
}

const capabilityFile = path.join(ROOT, CAPABILITY_PATH);
let capability = await readFile(capabilityFile, "utf8");
const deepImport =
  'import { readPlayerBusinessRoutePath } from "../../business/api/playerBusinessRoutePaths.ts";';
const publicImport =
  'import { readPlayerBusinessRoutePath } from "../../business/index.ts";';
if (capability.split(deepImport).length !== 2 || capability.includes(publicImport)) {
  throw new Error("Expected exactly one deep Business route-parser import.");
}
await writeFile(capabilityFile, capability.replace(deepImport, publicImport));

const originalSelf = execFileSync(
  "git",
  ["show", `${SELF_RESTORE_SHA}:${SELF_PATH}`],
  { cwd: ROOT, encoding: "utf8" },
);
const temporaryOriginal = "/tmp/econovaria-build-architecture-inventory.mjs";
await writeFile(temporaryOriginal, originalSelf);
await import(`${pathToFileURL(temporaryOriginal).href}?phase6=${Date.now()}`);
await writeFile(path.join(ROOT, SELF_PATH), originalSelf);

execFileSync("git", ["diff", "--check"], { cwd: ROOT, stdio: "inherit" });
execFileSync("git", ["config", "user.name", "github-actions[bot]"], { cwd: ROOT });
execFileSync(
  "git",
  ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"],
  { cwd: ROOT },
);
execFileSync(
  "git",
  ["add", CAPABILITY_PATH, INVENTORY_PATH, SELF_PATH],
  { cwd: ROOT },
);
execFileSync(
  "git",
  ["commit", "-m", "fix(architecture): use Business public parser boundary"],
  { cwd: ROOT, stdio: "inherit" },
);
execFileSync(
  "git",
  ["push", "origin", "HEAD:feat/business-timed-manufacturing-v2"],
  { cwd: ROOT, stdio: "inherit" },
);

console.log("Phase 6 public-boundary import repair committed.");
