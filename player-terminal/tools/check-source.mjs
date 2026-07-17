import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const files = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(fullPath);
    if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) files.push(fullPath);
  }
}

await walk(path.join(root, "src"));
await walk(path.join(root, "tests"));
await walk(path.join(root, "tools"));

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exitCode = 1;
  }
}

if (!process.exitCode) console.log(`Syntax check passed for ${files.length} JavaScript modules.`);
