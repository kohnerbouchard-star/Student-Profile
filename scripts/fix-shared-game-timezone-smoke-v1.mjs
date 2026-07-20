import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const relativePath = "scripts/shared-game-timezone-ui-smoke.mjs";
const source = await readFile(path.join(repoRoot, relativePath), "utf8");
const expected = 'assertIncludes(login, \'Intl.supportedValuesOf("timeZone")\');';

if (!source.includes(expected)) {
  throw new Error("Shared game-timezone smoke must validate the cutover login controller with stable quoting.");
}

console.log("Verified shared game-timezone smoke quoting.");
