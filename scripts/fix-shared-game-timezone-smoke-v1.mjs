import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const relativePath = "scripts/shared-game-timezone-ui-smoke.mjs";
const absolutePath = path.join(repoRoot, relativePath);
const checkOnly = process.argv.includes("--check");
const broken = 'assertIncludes(auth, "Intl.supportedValuesOf("timeZone")");';
const corrected = 'assertIncludes(auth, \'Intl.supportedValuesOf("timeZone")\');';

const source = await readFile(absolutePath, "utf8");

if (source.includes(corrected)) {
  console.log("Verified shared game-timezone smoke quoting.");
} else if (!source.includes(broken)) {
  throw new Error("Shared game-timezone smoke quote anchor was not found.");
} else if (checkOnly) {
  console.error(`Shared game-timezone smoke quote drift: ${relativePath}`);
  process.exitCode = 1;
} else {
  await writeFile(absolutePath, source.replace(broken, corrected), "utf8");
  console.log("Applied shared game-timezone smoke quote correction.");
}
