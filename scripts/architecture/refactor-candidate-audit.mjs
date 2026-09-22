import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REGISTER = "docs/operations/evidence/refactor-execution-v1/REF-003/candidates.json";
const INVENTORY = "docs/architecture/inventories/econovaria-architecture-inventory-v2.json";
const POLICY = "ops/legacy-runtime/live-runtime-inventory.json";
const DISPOSITIONS = ["canonical", "confirmed_dead", "compatibility_required", "legacy_candidate", "historical_archive", "defensive_fallback", "generated_or_fixture", "unknown"];
const sort = (items) => [...items].sort();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const git = (cwd, args, input) => execFileSync("git", ["-C", cwd, ...args], { input, maxBuffer: 256 * 1024 * 1024 });
export const physicalLines = (source) => source.length === 0 ? 0 : source.split("\n").length - (source.endsWith("\n") ? 1 : 0);

export function fileKind(file, mode = "100644") {
  if (mode === "160000") return "submodule";
  if (mode === "120000") return "symlink";
  if (/^backend\/supabase\/migrations\//u.test(file)) return "migration_history";
  if (/(?:^|\/)(?:legacy|archive|archives)\//u.test(file)) return "historical_path";
  if (/(?:^|\/)(?:dist|build|coverage)\//u.test(file)) return "generated_output";
  if (/(?:^|\/)(?:fixtures|__fixtures__)\/|\.fixture\./u.test(file)) return "fixture";
  if (/(?:^|\/)(?:tests|__tests__|e2e)\/|\.(?:test|spec)\./u.test(file)) return "test";
  if (/\.(?:md|rst|txt)$/u.test(file)) return "documentation";
  if (/(?:^|\/)[^/]*\.config\.[cm]?[jt]s$/u.test(file)) return "configuration_or_data";
  if (/^(?:scripts|ops|backend\/scripts|player-terminal\/tools)\/.*\.(?:[cm]?js|ts|py|sh|zsh)$/u.test(file)) return "script";
  if (/^(?:admin|api|auth|frontend|player-terminal|backend\/(?:src|supabase\/functions))\/.*\.(?:[cm]?js|tsx?|jsx|html|css)$/u.test(file) || file === "index.html") return "application_source";
  if (/\.(?:json|toml|ya?ml|lock)$/u.test(file) || path.posix.basename(file).startsWith(".")) return "configuration_or_data";
  return "asset_or_other";
}

// Read immutable Git blobs, never working-tree symlinks, untracked files or secrets from the environment.
export function captureRevision(cwd, ref = "HEAD") {
  assert(!ref.startsWith("-") && !/[\r\n\0]/u.test(ref), "Invalid revision");
  const sha = git(cwd, ["rev-parse", "--verify", `${ref}^{commit}`]).toString().trim();
  const tree = git(cwd, ["rev-parse", `${sha}^{tree}`]).toString().trim();
  const files = new Map();
  for (const row of git(cwd, ["ls-tree", "-rz", "--full-tree", sha]).toString().split("\0").filter(Boolean)) {
    const [header, file] = [row.slice(0, row.indexOf("\t")), row.slice(row.indexOf("\t") + 1)];
    const [mode, type, oid] = header.split(" ");
    files.set(file, { path: file, mode, type, oid });
  }
  const ids = sort(new Set([...files.values()].filter((f) => f.type === "blob").map((f) => f.oid)));
  const blobs = new Map();
  for (let i = 0; i < ids.length; i += 64) {
    const batch = ids.slice(i, i + 64);
    const output = git(cwd, ["cat-file", "--batch"], batch.join("\n") + "\n");
    let offset = 0;
    for (const expected of batch) {
      const end = output.indexOf(10, offset);
      const [oid, type, sizeString] = output.subarray(offset, end).toString().split(" ");
      const size = Number(sizeString);
      assert(oid === expected && type === "blob" && Number.isSafeInteger(size), "Incomplete Git object response");
      const bytes = output.subarray(end + 1, end + 1 + size);
      assert.equal(bytes.length, size, "Truncated Git blob");
      let source = null;
      if (!bytes.includes(0)) {
        try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { /* binary */ }
      }
      blobs.set(oid, { bytes: size, source });
      offset = end + size + 2;
    }
    assert.equal(offset, output.length, "Unexpected Git object framing");
  }
  for (const entry of files.values()) Object.assign(entry, blobs.get(entry.oid) || { bytes: null, source: null });
  return { sha, tree, files };
}

export function classifyCandidate(entry, review = null) {
  if (review) {
    assert(DISPOSITIONS.includes(review.disposition), "Invalid disposition");
    assert(review.safeToDelete === false && review.disposition !== "confirmed_dead", "REF-003 cannot grant deletion approval");
    assert.equal(entry.oid, review.blobSha, `Stale review: ${entry.path}`);
    return review.disposition;
  }
  return ["test", "fixture", "generated_output"].includes(fileKind(entry.path, entry.mode)) ? "generated_or_fixture" : "unknown";
}

function structuralFlags(entry) {
  const source = entry.source || "";
  return [
    /\b(?:compatib\w*|fallback\w*|legacy\w*)\b/iu.test(source) && "compatibility_marker",
    /(?:window|globalThis)\.fetch\s*=/u.test(source) && "fetch_patch",
    /MutationObserver\s*\(/u.test(source) && "dom_observer",
    /\bimport\s*\(/u.test(source) && "dynamic_import",
    /Deno\.serve\s*\(/u.test(source) && "http_entrypoint",
    physicalLines(source) >= 500 && "physical_lines_at_least_500",
  ].filter(Boolean);
}

// Literal references are discovery evidence, not a complete call graph or a zero-consumer proof.
function referenceRows(files, review) {
  const basename = path.posix.basename(review.path);
  const ambiguous = [...files.keys()].filter((file) => path.posix.basename(file) === basename).length > 1;
  const pathTerm = ambiguous ? review.path.split("/").slice(-2).join("/") : basename;
  const terms = [...new Set([review.path, pathTerm, ...(review.symbols || [])])];
  const rows = [];
  for (const entry of files.values()) {
    if (entry.path === review.path || entry.source === null) continue;
    const hits = terms.filter((term) => entry.source.includes(term));
    if (!hits.length) continue;
    const lines = entry.source.split("\n");
    rows.push({ path: entry.path, kind: fileKind(entry.path, entry.mode), terms: hits,
      lines: lines.flatMap((line, i) => hits.some((term) => line.includes(term)) ? [i + 1] : []) });
  }
  return rows;
}

export function auditSnapshot(snapshot, register) {
  assert(register.schemaVersion === 1 && register.task === "REF-003", "Invalid register");
  const { files } = snapshot;
  const readJson = (file) => {
    assert(files.has(file) && files.get(file).source !== null, `Missing required input: ${file}`);
    return JSON.parse(files.get(file).source);
  };
  const inventory = readJson(INVENTORY);
  const policy = readJson(POLICY);
  const reviews = new Map();
  for (const review of register.reviews) {
    assert(!reviews.has(review.path) && files.has(review.path), `Duplicate/missing review: ${review.path}`);
    for (const field of ["owner", "reason", "confidence", "externalUsage", "removalConditions"]) assert(review[field], `Missing ${field}`);
    for (const evidence of review.sourceEvidence || []) assert(files.has(evidence), `Missing evidence: ${evidence}`);
    classifyCandidate(files.get(review.path), review);
    reviews.set(review.path, review);
  }
  const inventoryCandidates = new Set();
  function inventoryPaths(value) {
    if (typeof value === "string" && files.has(value)) inventoryCandidates.add(value);
    else if (Array.isArray(value)) value.forEach(inventoryPaths);
    else if (value && typeof value === "object") Object.values(value).forEach(inventoryPaths);
  }
  inventoryPaths(inventory.measuredDebt);
  inventoryPaths(inventory.entrypoints);
  const denominators = {};
  const candidates = [];
  for (const file of sort(files.keys())) {
    const entry = files.get(file);
    const kind = fileKind(file, entry.mode);
    const count = denominators[kind] ||= { files: 0, textFiles: 0, physicalLines: 0, bytes: 0, unmeasuredFiles: 0 };
    count.files += 1;
    count.bytes += entry.bytes || 0;
    if (entry.source !== null && entry.mode !== "120000") { count.textFiles += 1; count.physicalLines += physicalLines(entry.source); }
    else count.unmeasuredFiles += 1;
    const flags = ["application_source", "script", "test", "fixture", "generated_output", "historical_path"].includes(kind) ? structuralFlags(entry) : [];
    if (inventoryCandidates.has(file)) flags.push("existing_architecture_inventory");
    if (!flags.length && !reviews.has(file)) continue;
    const review = reviews.get(file);
    candidates.push({ path: file, gitBlobSha: entry.oid, kind,
      physicalLines: entry.source === null ? null : physicalLines(entry.source), flags,
      disposition: classifyCandidate(entry, review), safeToDelete: false,
      evidence: review ? "reviewed_source" : "unreviewed_static_candidate",
      owner: review?.owner || "UNRESOLVED",
      reason: review?.reason || "Static match only; semantic review is outstanding.",
      inboundRoots: review?.inboundRoots || "NOT_REVIEWED", externalUsage: "UNKNOWN",
      removalConditions: review?.removalConditions || ["Resolve source ownership, all caller classes and replacement evidence before separately authorized retirement"] });
  }
  const dispositions = Object.fromEntries(DISPOSITIONS.map((key) => [key, 0]));
  for (const row of candidates) dispositions[row.disposition] += 1;
  const reviewed = [...reviews.values()].map((review) => ({ ...review, literalReferences: referenceRows(files, review) }));
  const recordsHash = hash(JSON.stringify(candidates));
  return { schemaVersion: 1, task: "REF-003", sourceSha: snapshot.sha, sourceTreeSha: snapshot.tree,
    inventoryBlobSha: files.get(INVENTORY).oid, inventoryCountsAsRecorded: inventory.counts,
    inventoryRecomputedHere: false, trackedFiles: files.size, denominators,
    physicalLineConvention: "UTF-8/no-NUL Git blobs; empty=0; final newline is not an extra line; symlinks/submodules/binary excluded from line totals",
    candidateCount: candidates.length, dispositions, candidateRecordsSha256: recordsHash, candidates, reviewed,
    observationPolicy: policy.observationPolicy, deletionShortlist: [],
    limitations: ["Static classification is not executable-code coverage or a complete reachability proof.",
      "Literal references include tests, docs and string dispatch and are labeled separately; missing matches never prove absence of consumers.",
      "Application-source file counts are not counts of proven reachable production files.",
      "Historical provider snapshots are policy inputs, not fresh traffic evidence. No hosted/external use or SQL/job consumer absence is certified.",
      "Structural flags overlap; primary dispositions and file categories do not. No deletion is approved."] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const snapshot = captureRevision(process.cwd(), process.argv[2] || "HEAD");
    assert(snapshot.files.has(REGISTER), "Candidate register is absent at this revision");
    const report = auditSnapshot(snapshot, JSON.parse(snapshot.files.get(REGISTER).source));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) { console.error(`REF-003 audit failed: ${error.message}`); process.exitCode = 1; }
}
