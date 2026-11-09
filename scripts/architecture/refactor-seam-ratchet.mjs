import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export const BASELINE_PATH = "docs/operations/evidence/refactor-execution-v1/REF-005/seam-baseline.json";
export const CANDIDATES_PATH = "docs/operations/evidence/refactor-execution-v1/REF-003/candidates.json";
export const SCAN_ROOTS = ["backend/src", "backend/supabase/functions", "api", "index.html", "frontend/src", "admin", "player-terminal/src", "auth"];
const extensions = /\.(?:[cm]?js|jsx|tsx?|html)$/u;
const classroomRoot = "backend/supabase/functions/classroom-api/";
const requireValue = (value, message) => { if (!value) throw new Error(message); };
export const blobSha = (source) => createHash("sha1").update(`blob ${Buffer.byteLength(source)}\0`).update(source).digest("hex");
export function sourceKind(file) {
  if (/(?:^|\/)(?:node_modules|dist|build|coverage|\.git)(?:\/|$)/u.test(file)) return "generated";
  if (/(?:^|\/)(?:tests?|__tests__|fixtures?|__fixtures__)(?:\/|$)|\.(?:test|spec)\.|(?:Test|Tests)\.[cm]?[jt]sx?$/u.test(file) || file.startsWith("backend/src/smoke/")) return "test_or_fixture";
  return "runtime";
}
export function readSources(root) {
  const sources = new Map();
  function walk(file) {
    if (sourceKind(file) === "generated") return;
    const absolute = path.join(root, file), info = fs.lstatSync(absolute);
    requireValue(!info.isSymbolicLink(), `Unreviewed source symlink: ${file}`);
    if (info.isDirectory()) for (const name of fs.readdirSync(absolute).sort()) walk(`${file}/${name}`);
    else if (extensions.test(file)) sources.set(file, fs.readFileSync(absolute, "utf8"));
  }
  for (const rootPath of SCAN_ROOTS) walk(rootPath);
  return new Map([...sources].sort(([a], [b]) => a.localeCompare(b)));
}
// Lexical contract, not a JS resolver: literal imports, named bridge calls/references,
// and explicit global transport writes. Comments are excluded; literals retain bytes.
function tokens(source) {
  return [...source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|[A-Za-z_$][\w$]*|===|!==|==|!=|=>|\?\?=|\|\|=|&&=|[^\s]/gu)]
    .map(([token]) => token).filter((token) => !token.startsWith("//") && !token.startsWith("/*"));
}
function callSpan(parts, start) {
  let depth = 0;
  for (let index = start + 1; index < parts.length; index += 1) {
    if (parts[index] === "(") depth += 1;
    if (parts[index] === ")" && --depth === 0) return parts.slice(start, index + 1).join(" ");
  }
  throw new Error(`Unbounded seam call: ${parts[start]}`);
}
export function measureSites(sources) {
  const found = new Map();
  for (const [file, source] of sources) {
    if (sourceKind(file) !== "runtime") continue;
    const parts = tokens(source);
    const add = (kind, signature) => {
      const key = JSON.stringify([file, kind, signature]);
      const record = found.get(key) ?? { file, kind, signature, maximum: 0, sourceBlobSha: blobSha(source) };
      record.maximum += 1; found.set(key, record);
    };
    for (let index = 0; index < parts.length; index += 1) {
      const token = parts[index], next = parts[index + 1], previous = parts[index - 1];
      if (["proxyClassroom", "fetchClassroom", "CLASSROOM_API_URL"].includes(token)) {
        add(next === "(" && previous !== "function" ? "classroom_call" : "classroom_reference",
          next === "(" && previous !== "function" ? callSpan(parts, index) : parts.slice(Math.max(0, index - 1), index + 3).join(" "));
      }
      if (/^["'`]/u.test(token) && /(?:classroom-api|CLASSROOM_API_URL)/u.test(token)) {
        const literal = token.slice(1, -1);
        const imported = previous === "from" || previous === "import" || (previous === "(" && ["import", "require"].includes(parts[index - 2]));
        if (imported) {
          const target = literal.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(file), literal)) : literal;
          if (!file.startsWith(classroomRoot)) add("classroom_import", target);
        } else add("classroom_literal", token);
      }
      if (!/^(?:index\.html|frontend\/|admin\/|player-terminal\/|auth\/)/u.test(file)) continue;
      if (["window", "globalThis", "self"].includes(token)) {
        const dotted = next === ".", property = dotted ? parts[index + 2] : next === "[" ? parts[index + 2]?.slice(1, -1) : "";
        const operatorIndex = index + (dotted ? 3 : 4);
        if (["fetch", "XMLHttpRequest"].includes(property) && ["=", "??=", "||=", "&&="].includes(parts[operatorIndex])) {
          add("browser_interception", parts.slice(index, operatorIndex + 2).join(" "));
        }
      }
      if (["Object", "Reflect"].includes(token) && next === "." && ["defineProperty", "defineProperties", "assign", "set"].includes(parts[index + 2]) && parts[index + 3] === "(") {
        const span = callSpan(parts, index + 2);
        const targetIsGlobal = ["window", "globalThis", "self"].includes(parts[index + 4]) && parts[index + 5] === ",";
        const property = parts[index + 6]?.replace(/^["']|["']$/gu, "");
        let transportKey = ["defineProperty", "set"].includes(parts[index + 2]) && ["fetch", "XMLHttpRequest"].includes(property);
        if (["assign", "defineProperties"].includes(parts[index + 2]) && parts[index + 6] === "{") {
          let depth = 0;
          for (let cursor = index + 6; cursor < parts.length; cursor += 1) {
            if (parts[cursor] === "{") depth += 1;
            if (parts[cursor] === "}" && --depth === 0) break;
            if (depth === 1 && ["{", ","].includes(parts[cursor - 1]) && ["fetch", "XMLHttpRequest"].includes(parts[cursor].replace(/^["']|["']$/gu, "")) && [":", ",", "}"].includes(parts[cursor + 1])) transportKey = true;
          }
        }
        if (targetIsGlobal && transportKey) add("browser_interception", `${token} . ${span}`);
      }
    }
  }
  return [...found.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, record]) => record);
}
function checkedText(root, reference) {
  requireValue(reference && typeof reference.path === "string" && /^[0-9a-f]{40}$/u.test(reference.blobSha), "Missing hash-bound evidence reference");
  const file = reference.path;
  requireValue(file.length > 0 && !path.posix.isAbsolute(file) && !file.includes("\\") && path.posix.normalize(file) === file && !file.startsWith("../"), `Unsafe evidence path: ${file}`);
  const absolute = path.join(root, file), resolved = fs.realpathSync(absolute);
  requireValue(resolved.startsWith(`${fs.realpathSync(root)}${path.sep}`), `Evidence escapes checkout: ${file}`);
  const text = fs.readFileSync(absolute, "utf8");
  requireValue(text.trim() && blobSha(text) === reference.blobSha, `Missing or stale evidence: ${file}`);
  return text;
}
const retainedFileExists = (root, file) => fs.existsSync(path.join(root, file)) && fs.lstatSync(path.join(root, file)).isFile();
export function verifyRemoval(root, target, record, sources) {
  requireValue(record && record.path === target.path && record.disposition === "replaced", `Missing removal record: ${target.path}`);
  requireValue(record.owner === target.owner && record.sourceBlobSha === target.sourceBlobSha && record.originalDisposition === target.disposition, `Removal ownership/disposition/source mismatch: ${target.path}`);
  requireValue(record.approved === undefined, "An approved boolean is not removal evidence");
  const replacement = record.canonicalReplacement;
  checkedText(root, replacement);
  const originalExtension = path.posix.extname(target.path);
  const sameKind = [".json", ".md"].includes(originalExtension) ? path.posix.extname(replacement.path) === originalExtension : extensions.test(replacement.path);
  requireValue(replacement.path !== target.path && sameKind && sourceKind(replacement.path) === "runtime", "Replacement must preserve source/configuration/documentation kind, not be a fixture or the removed path");
  const audit = JSON.parse(checkedText(root, record.callerEvidence));
  requireValue(audit.removedPath === target.path && audit.replacementPath === replacement.path && audit.owner === target.owner, "Caller evidence identity mismatch");
  for (const surface of ["staticImports", "dynamicImports", "htmlBuild", "sqlRpcTriggers", "scheduledJobs", "externalRuntime"]) {
    const evidence = audit.surfaces?.[surface];
    requireValue(evidence?.status === "VERIFIED_CLEAR" && evidence.reason?.trim(), `Unresolved removal surface: ${surface}`);
    checkedText(root, evidence.evidence);
  }
  const decision = JSON.parse(checkedText(root, record.ownerDecision));
  requireValue(decision.removedPath === target.path && decision.replacementPath === replacement.path && decision.owner === target.owner && decision.disposition === "replaced" && decision.decision === "approve-removal" && decision.approver?.trim() && Number.isFinite(Date.parse(decision.approvedAt)), "Missing explicit owner retirement decision");
  const parity = JSON.parse(checkedText(root, record.parityEvidence));
  requireValue(parity.status === "PASS" && /^[0-9a-f]{40}$/u.test(parity.sourceSha) && parity.command?.trim(), "Missing parity execution evidence");
  requireValue(sourceKind(parity.test?.path ?? "") === "test_or_fixture", "Parity must identify a real test");
  requireValue(checkedText(root, parity.test).includes(path.posix.basename(replacement.path)), "Parity test does not reference replacement");
  const result = JSON.parse(checkedText(root, parity.result));
  requireValue(result.status === "PASS" && result.exitCode === 0 && result.sourceSha === parity.sourceSha && result.command === parity.command && result.testBlobSha === parity.test.blobSha, "Parity result does not confirm the exact passing test/command/source");
  for (const [file, source] of sources) if (sourceKind(file) === "runtime") {
    for (const literal of tokens(source).filter((token) => /^["'`]/u.test(token)).map((token) => token.slice(1, -1))) {
      const resolved = literal.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(file), literal)) : literal.replace(/^\//u, "");
      requireValue(resolved !== target.path && !literal.includes(target.path), `Remaining caller ${file}: ${target.path}`);
    }
    for (const term of target.referenceTerms ?? []) if (source.includes(term) && file !== replacement.path) {
      const transfer = audit.transferredReferences?.find((entry) => entry.path === file && entry.term === term && entry.replacementPath === replacement.path);
      requireValue(transfer, `Unreconciled event/string caller ${file}: ${term}`);
      checkedText(root, transfer);
    }
  }
}
export function auditRefactorSeams(root) {
  const baseline = JSON.parse(fs.readFileSync(path.join(root, BASELINE_PATH), "utf8"));
  requireValue(baseline.schemaVersion === 1 && baseline.task === "REF-005" && /^[0-9a-f]{40}$/u.test(baseline.sourceSha), "Invalid REF-005 baseline identity");
  const sources = readSources(root), sites = measureSites(sources), failures = [];
  const key = ({ file, kind, signature }) => JSON.stringify([file, kind, signature]);
  const allowed = new Map();
  for (const record of baseline.sites) {
    requireValue(!allowed.has(key(record)) && Number.isSafeInteger(record.maximum) && record.maximum > 0 && /^[0-9a-f]{40}$/u.test(record.sourceBlobSha), "Invalid or duplicate seam baseline record");
    allowed.set(key(record), record.maximum);
  }
  for (const site of sites) if (site.maximum > (allowed.get(key(site)) ?? 0)) failures.push(`Unregistered seam: ${JSON.stringify(site)}`);
  const reviews = JSON.parse(fs.readFileSync(path.join(root, CANDIDATES_PATH), "utf8")).reviews;
  const targets = new Map(baseline.removalTargets.map((target) => [target.path, target]));
  requireValue(targets.size === baseline.removalTargets.length, "Duplicate removal target");
  for (const target of targets.values()) requireValue(typeof target.path === "string" && target.path.length > 0 && !target.path.includes("\\") && !path.posix.isAbsolute(target.path) && path.posix.normalize(target.path) === target.path && !target.path.startsWith("../") && /^[0-9a-f]{40}$/u.test(target.sourceBlobSha) && target.owner?.trim() && target.disposition?.trim(), "Invalid removal target identity");
  for (const review of reviews) if (!targets.has(review.path)) failures.push(`Unregistered removal target: ${JSON.stringify({ path: review.path, sourceBlobSha: review.blobSha, owner: review.owner, disposition: review.disposition, referenceTerms: review.referenceTerms ?? [] })}`);
  const removals = new Map((baseline.removalRecords ?? []).map((record) => [record.path, record]));
  requireValue(removals.size === (baseline.removalRecords ?? []).length, "Duplicate removal proof");
  for (const target of targets.values()) if (!retainedFileExists(root, target.path)) {
    try { verifyRemoval(root, target, removals.get(target.path), sources); } catch (error) { failures.push(error.message); }
  }
  for (const removedPath of removals.keys()) requireValue(targets.has(removedPath) && !retainedFileExists(root, removedPath), `Extraneous or premature removal proof: ${removedPath}`);
  const classifications = {};
  for (const file of sources.keys()) classifications[sourceKind(file)] = (classifications[sourceKind(file)] ?? 0) + 1;
  return { failures, classifications, registeredSites: baseline.sites.length, observedSites: sites.length, protectedRemovalTargets: targets.size };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "--census") console.log(JSON.stringify(measureSites(readSources(process.cwd())), null, 2));
  else { const result = auditRefactorSeams(process.cwd()); console.log(JSON.stringify(result, null, 2)); if (result.failures.length) process.exitCode = 1; }
}
