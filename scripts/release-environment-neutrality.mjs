import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);
const MAX_TEXT_BYTES = 5 * 1024 * 1024;
const SUPABASE_ORIGIN_PATTERN = /https:\/\/[a-z0-9-]+\.supabase\.co/gi;
const CLOUDFLARE_WORKER_PATTERN = /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/gi;
export const BROWSER_RUNTIME_ROOTS = [
  "index.html",
  "frontend",
  "admin",
  "player-terminal",
  "auth",
];

export class EnvironmentNeutralityError extends Error {
  constructor(findings) {
    super(`Immutable frontend build is environment-bound:\n- ${findings.join("\n- ")}`);
    this.name = "EnvironmentNeutralityError";
    this.findings = findings;
  }
}

async function listFiles(root) {
  const metadata = await stat(root);
  if (metadata.isFile()) return [root];
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function recordMatches({ source, relativePath, pattern, label, findings }) {
  for (const match of source.matchAll(pattern)) {
    findings.push(`${relativePath}:${lineNumber(source, match.index)} contains ${label} ${match[0]}`);
  }
}

export async function verifyEnvironmentNeutralFrontend({
  repoRoot,
  auditPath = "docs/operations/production-manifest-2026-07-17.json",
  roots = BROWSER_RUNTIME_ROOTS,
}) {
  const audit = JSON.parse(await readFile(path.join(repoRoot, auditPath), "utf8"));
  const knownProjectRef = audit?.supabase?.projectRef;
  const knownWorkerOrigin = audit?.externalRuntime?.cloudflareWorkerOrigin;
  const findings = [];

  for (const root of roots) {
    const absoluteRoot = path.join(repoRoot, root);
    for (const absolute of await listFiles(absoluteRoot)) {
      const extension = path.extname(absolute).toLowerCase();
      if (!TEXT_EXTENSIONS.has(extension)) continue;
      const metadata = await stat(absolute);
      if (metadata.size > MAX_TEXT_BYTES) continue;
      const source = await readFile(absolute, "utf8");
      const relativePath = path.relative(repoRoot, absolute).split(path.sep).join("/");
      recordMatches({
        source,
        relativePath,
        pattern: SUPABASE_ORIGIN_PATTERN,
        label: "an absolute Supabase origin",
        findings,
      });
      recordMatches({
        source,
        relativePath,
        pattern: CLOUDFLARE_WORKER_PATTERN,
        label: "an absolute Cloudflare Worker origin",
        findings,
      });
      if (typeof knownProjectRef === "string" && knownProjectRef.length > 0) {
        let index = source.indexOf(knownProjectRef);
        while (index >= 0) {
          findings.push(`${relativePath}:${lineNumber(source, index)} contains audited live project ref ${knownProjectRef}`);
          index = source.indexOf(knownProjectRef, index + knownProjectRef.length);
        }
      }
      if (typeof knownWorkerOrigin === "string" && knownWorkerOrigin.length > 0) {
        let index = source.indexOf(knownWorkerOrigin);
        while (index >= 0) {
          findings.push(`${relativePath}:${lineNumber(source, index)} contains audited live Worker origin ${knownWorkerOrigin}`);
          index = source.indexOf(knownWorkerOrigin, index + knownWorkerOrigin.length);
        }
      }
    }
  }

  const uniqueFindings = [...new Set(findings)].sort();
  if (uniqueFindings.length > 0) throw new EnvironmentNeutralityError(uniqueFindings);
  return {
    status: "environment-neutral",
    auditedProductionProjectRef: knownProjectRef ?? null,
    auditedWorkerOrigin: knownWorkerOrigin ?? null,
    scannedRoots: roots,
  };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--repo-root") options.repoRoot = argv[++index];
    else if (argument === "--audit") options.auditPath = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await verifyEnvironmentNeutralFrontend({
    repoRoot: path.resolve(options.repoRoot ?? "."),
    auditPath: options.auditPath,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
