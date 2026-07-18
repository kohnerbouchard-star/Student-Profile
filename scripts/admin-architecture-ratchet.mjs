import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const ADMIN_ROOT = path.resolve("admin");
const LIMITS = Object.freeze({
  fetchAssignments: 7,
  mutationObservers: 11,
});

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory);
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry);
    const details = await stat(absolutePath);
    if (details.isDirectory()) {
      files.push(...await listJavaScriptFiles(absolutePath));
    } else if (details.isFile() && entry.endsWith(".js")) {
      files.push(absolutePath);
    }
  }

  return files;
}

const files = await listJavaScriptFiles(ADMIN_ROOT);
let fetchAssignments = 0;
let mutationObservers = 0;

for (const file of files) {
  const source = await readFile(file, "utf8");
  fetchAssignments += source.match(/window\.fetch\s*=/g)?.length ?? 0;
  mutationObservers += source.match(/MutationObserver\s*\(/g)?.length ?? 0;
}

const measurements = { fetchAssignments, mutationObservers };
const violations = Object.entries(measurements)
  .filter(([name, value]) => value > LIMITS[name])
  .map(([name, value]) => `${name} increased to ${value}; allowed maximum is ${LIMITS[name]}`);

if (violations.length > 0) {
  throw new Error(`Admin architecture ratchet failed:\n- ${violations.join("\n- ")}`);
}

console.log(JSON.stringify({
  status: "pass",
  measurements,
  limits: LIMITS,
  note: "Interaction quality no longer owns a global fetch interceptor or broad DOM observer, and the session gate now uses an explicit mounted event. These limits remain maximums, not targets.",
}, null, 2));
