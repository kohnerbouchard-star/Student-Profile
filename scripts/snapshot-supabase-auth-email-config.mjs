import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { managedAuthEmailKeys } from "./build-supabase-auth-email-config.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(
  repoRoot,
  "backend/supabase/auth-email-template-manifest.json",
);

function parseArguments(argv) {
  const options = { actual: "", output: "", environment: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--actual") options.actual = String(argv[++index] || "");
    else if (arg === "--output") options.output = String(argv[++index] || "");
    else if (arg === "--environment") options.environment = String(argv[++index] || "");
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.actual || !options.output || !options.environment) {
    throw new Error("Use --environment <name> --actual <Auth config JSON> --output <snapshot JSON>.");
  }
  return options;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const [actual, manifest] = await Promise.all([
    fs.readFile(options.actual, "utf8").then(JSON.parse),
    fs.readFile(manifestPath, "utf8").then(JSON.parse),
  ]);
  const managed = {};
  for (const key of managedAuthEmailKeys(manifest)) {
    if (key in actual) managed[key] = actual[key];
  }
  const digest = crypto.createHash("sha256").update(stableJson(managed)).digest("hex");
  const snapshot = {
    schemaVersion: 1,
    manifestId: manifest.manifestId,
    environment: options.environment,
    managedFieldCount: Object.keys(managed).length,
    digest,
    managed,
  };
  await fs.mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
  await fs.writeFile(options.output, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
