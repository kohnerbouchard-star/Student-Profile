import { execFileSync } from "node:child_process";
import {
  compareBoundaryWithBaseline,
  discoverApiBoundaryFindings,
  loadApiRouteOwnershipLedger,
  matchesApiBoundaryScanPath,
} from "./lib/api-boundary-inventory.mjs";

export async function runApiBoundaryGrowthRatchet(options = {}) {
  const ledger = options.ledger ?? await loadApiRouteOwnershipLedger();
  const currentFindings = options.currentFindings ??
    await discoverApiBoundaryFindings(ledger);
  const baseRef = options.baseRef ?? process.env.API_BOUNDARY_BASE_REF ?? "";
  let baseLedger = options.baseLedger ?? null;
  let baseFindings = options.baseFindings ?? [];

  if (baseRef && !baseLedger && baseFindings.length === 0) {
    baseLedger = readBaseJson(baseRef, "docs/architecture/api-route-ownership.json");
    if (!baseLedger) {
      baseFindings = await discoverFindingsFromGit(baseRef, ledger);
    }
  }

  const violations = compareBoundaryWithBaseline(
    ledger,
    currentFindings,
    baseLedger,
    baseFindings,
  );
  if (violations.length > 0) {
    throw new Error(`API boundary growth ratchet failed:\n- ${violations.join("\n- ")}`);
  }
  return {
    findings: currentFindings.length,
    baseComparison: baseLedger ? "ledger" : baseFindings.length ? "tree" : "none",
  };
}

function readBaseJson(baseRef, relativePath) {
  try {
    return JSON.parse(execFileSync(
      "git",
      ["show", `${baseRef}:${relativePath}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ));
  } catch {
    return null;
  }
}

async function discoverFindingsFromGit(baseRef, ledger) {
  const baseFiles = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", baseRef],
    { encoding: "utf8" },
  ).split(/\r?\n/u).filter(Boolean);
  const dispatchPaths = new Set(ledger.classroomDispatch?.sourcePaths ?? []);
  const selectedFiles = baseFiles.filter((file) =>
    dispatchPaths.has(file) || (ledger.dependencyMatchers ?? []).some((matcher) =>
      isWithinAnyRoot(file, matcher.scan?.roots) &&
      matchesApiBoundaryScanPath(file, matcher.scan)
    )
  );
  const sources = readGitTextFiles(baseRef, selectedFiles);

  const temporaryLedger = structuredClone(ledger);
  const findings = [];
  const module = await import("./lib/api-boundary-inventory.mjs");
  for (const matcher of temporaryLedger.dependencyMatchers ?? []) {
    const scoped = {};
    for (const [file, source] of sources) {
      if (
        isWithinAnyRoot(file, matcher.scan?.roots) &&
        matchesApiBoundaryScanPath(file, matcher.scan)
      ) scoped[file] = source;
    }
    findings.push(...module.countMatcherFindings(matcher, scoped));
  }
  const classroomSources = {};
  for (const sourcePath of temporaryLedger.classroomDispatch?.sourcePaths ?? []) {
    if (sources.has(sourcePath)) classroomSources[sourcePath] = sources.get(sourcePath);
  }
  findings.push(...module.extractClassroomDispatchSites(classroomSources).map((site) => ({
    key: `classroom-dispatch|${site.path}|${site.key}`,
    matcherId: "classroom-dispatch",
    path: site.path,
    count: site.count,
  })));
  return findings;
}

function isWithinAnyRoot(file, roots = []) {
  return roots.some((root) => {
    const normalizedRoot = root.replaceAll("\\", "/").replace(/\/$/u, "");
    return file === normalizedRoot || file.startsWith(`${normalizedRoot}/`);
  });
}

function readGitTextFiles(baseRef, files) {
  const uniqueFiles = [...new Set(files)];
  if (uniqueFiles.length === 0) return new Map();
  const input = uniqueFiles.map((file) => `${baseRef}:${file}\n`).join("");
  const output = execFileSync(
    "git",
    ["cat-file", "--batch"],
    { input, maxBuffer: 100 * 1024 * 1024 },
  );
  const sources = new Map();
  let offset = 0;
  for (const file of uniqueFiles) {
    const headerEnd = output.indexOf(10, offset);
    if (headerEnd < 0) throw new Error(`Missing git object header for ${file}`);
    const header = output.subarray(offset, headerEnd).toString("utf8");
    offset = headerEnd + 1;
    if (header.endsWith(" missing")) continue;
    const size = Number(header.split(" ").at(-1));
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Invalid git object size for ${file}`);
    }
    sources.set(file, output.subarray(offset, offset + size).toString("utf8"));
    offset += size;
    if (output[offset] === 10) offset += 1;
  }
  return sources;
}

if (process.argv[1]?.endsWith("api-boundary-growth-ratchet.mjs")) {
  const result = await runApiBoundaryGrowthRatchet();
  console.log(JSON.stringify({ status: "pass", ...result }, null, 2));
}
