import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".toml",
  ".ts",
  ".tsx",
  ".yml",
  ".yaml",
]);

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  ".git",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

export async function loadApiRouteOwnershipLedger(
  ledgerPath = "docs/architecture/api-route-ownership.json",
) {
  return JSON.parse(await readFile(ledgerPath, "utf8"));
}

export async function discoverApiBoundaryFindings(
  ledger,
  root = process.cwd(),
) {
  const findings = [];
  for (const matcher of ledger.dependencyMatchers ?? []) {
    const sources = await readMatcherSources(root, matcher);
    findings.push(...countMatcherFindings(matcher, sources));
  }

  const classroomSources = {};
  for (const relativePath of ledger.classroomDispatch?.sourcePaths ?? []) {
    classroomSources[normalizePath(relativePath)] = await readFile(
      path.join(root, relativePath),
      "utf8",
    );
  }
  findings.push(...extractClassroomDispatchSites(classroomSources).map((site) => ({
    key: `classroom-dispatch|${site.path}|${site.key}`,
    matcherId: "classroom-dispatch",
    path: site.path,
    count: site.count,
    detail: site.detail,
  })));

  return findings.sort(compareFindings);
}

export function countMatcherFindings(matcher, sources) {
  const findings = [];
  const expression = matcher.kind === "regex"
    ? new RegExp(matcher.pattern, matcher.flags || "gu")
    : null;

  for (const [sourcePath, source] of Object.entries(sources)) {
    let count = 0;
    if (matcher.kind === "literal") {
      count = countLiteral(source, matcher.pattern);
    } else if (matcher.kind === "regex") {
      count = [...source.matchAll(expression)].length;
    } else {
      throw new Error(`Unsupported API boundary matcher kind: ${matcher.kind}`);
    }
    if (count > 0) {
      const normalizedPath = normalizePath(sourcePath);
      findings.push({
        key: `${matcher.id}|${normalizedPath}`,
        matcherId: matcher.id,
        path: normalizedPath,
        count,
      });
    }
  }
  return findings.sort(compareFindings);
}

export function extractClassroomDispatchSites(sources) {
  const sites = new Map();
  const add = (pathName, key, detail) => {
    const identity = `${normalizePath(pathName)}|${key}`;
    const existing = sites.get(identity);
    sites.set(identity, {
      key,
      path: normalizePath(pathName),
      count: (existing?.count ?? 0) + 1,
      detail,
    });
  };

  for (const [sourcePath, source] of Object.entries(sources)) {
    for (const match of source.matchAll(
      /\b((?:read|parse)[A-Z][A-Za-z0-9]*(?:RoutePath|Route))\s*\(\s*(?:url\.pathname|pathname)\s*,?\s*\)/gu,
    )) {
      add(sourcePath, `parser:${match[1]}`, match[0]);
    }
    for (const match of source.matchAll(
      /(?:url\.)?pathname\.endsWith\(\s*"([^"]+)"\s*\)/gu,
    )) {
      add(sourcePath, `suffix:${match[1]}`, match[0]);
    }
    for (const match of source.matchAll(
      /\b(dispatchClassroomMessagingRequest)\s*\(\s*request\b/gu,
    )) {
      const prefix = source.slice(Math.max(0, (match.index ?? 0) - 32), match.index);
      if (/\bfunction\s*$/u.test(prefix)) continue;
      add(sourcePath, `dispatcher:${match[1]}`, match[0]);
    }
  }

  return [...sites.values()].sort((left, right) =>
    `${left.path}|${left.key}`.localeCompare(`${right.path}|${right.key}`)
  );
}

export function compareBoundaryWithBaseline(
  ledger,
  currentFindings,
  baseLedger = null,
  baseFindings = [],
) {
  const violations = [];
  const currentByKey = new Map(currentFindings.map((finding) => [finding.key, finding]));
  const allowanceByKey = new Map(
    (ledger.dependencies ?? []).map((entry) => [
      entry.key,
      resolveApiBoundaryDependency(ledger, entry),
    ]),
  );

  for (const finding of currentFindings) {
    const allowance = allowanceByKey.get(finding.key);
    if (!allowance) {
      violations.push(`unknown compatibility finding ${finding.key} (${finding.count})`);
      continue;
    }
    if (finding.count > allowance.maxOccurrences) {
      violations.push(
        `${finding.key} increased to ${finding.count}; maximum is ${allowance.maxOccurrences}`,
      );
    }
  }

  for (const allowance of allowanceByKey.values()) {
    const observed = currentByKey.get(allowance.key)?.count ?? 0;
    if (observed < allowance.maxOccurrences) {
      violations.push(
        `${allowance.key} decreased to ${observed}; declared count must ratchet down from ${allowance.maxOccurrences}`,
      );
    }
  }

  if (baseLedger) {
    const currentClassroomSources = new Set(
      ledger.classroomDispatch?.sourcePaths ?? [],
    );
    for (const baseSourcePath of baseLedger.classroomDispatch?.sourcePaths ?? []) {
      if (!currentClassroomSources.has(baseSourcePath)) {
        violations.push(`Classroom dispatch source path removed: ${baseSourcePath}`);
      }
    }

    const currentMatcherById = new Map(
      (ledger.dependencyMatchers ?? []).map((entry) => [entry.id, entry]),
    );
    const baseMatcherById = new Map(
      (baseLedger.dependencyMatchers ?? []).map((entry) => [entry.id, entry]),
    );
    for (const baseMatcher of baseMatcherById.values()) {
      if (!currentMatcherById.has(baseMatcher.id)) {
        violations.push(`matcher ${baseMatcher.id} was removed`);
      }
    }
    for (const matcher of ledger.dependencyMatchers ?? []) {
      const baseMatcher = baseMatcherById.get(matcher.id);
      if (!baseMatcher) {
        if (matcher.zeroTolerance !== true) {
          violations.push(`new matcher ${matcher.id} must begin zero-tolerance`);
        }
        continue;
      }
      violations.push(...compareScanScope(matcher.id, matcher.scan, baseMatcher.scan));
      if (
        matcher.kind !== baseMatcher.kind ||
        matcher.pattern !== baseMatcher.pattern ||
        (matcher.flags || "") !== (baseMatcher.flags || "")
      ) {
        violations.push(`matcher ${matcher.id} definition changed`);
      }
    }

    const baseAllowanceByKey = new Map(
      (baseLedger.dependencies ?? []).map((entry) => [
        entry.key,
        resolveApiBoundaryDependency(baseLedger, entry),
      ]),
    );
    for (const allowance of allowanceByKey.values()) {
      const baseAllowance = baseAllowanceByKey.get(allowance.key);
      if (!baseAllowance) {
        if (allowance.maxOccurrences > 0) {
          violations.push(`new compatibility allowance ${allowance.key}`);
        }
        continue;
      }
      if (allowance.maxOccurrences > baseAllowance.maxOccurrences) {
        violations.push(
          `${allowance.key} allowance increased from ${baseAllowance.maxOccurrences} to ${allowance.maxOccurrences}`,
        );
      }
      if (baseAllowance.retirementBlocking && !allowance.retirementBlocking) {
        violations.push(`${allowance.key} retirementBlocking was weakened`);
      }
      if (
        allowance.matcherId !== baseAllowance.matcherId ||
        allowance.path !== baseAllowance.path
      ) {
        violations.push(`${allowance.key} ownership identity changed`);
      }
    }

    const currentRoutes = new Map(
      (ledger.routeFamilies ?? []).map((route) => [route.routeKey, route]),
    );
    for (const baseRoute of baseLedger.routeFamilies ?? []) {
      const currentRoute = currentRoutes.get(baseRoute.routeKey);
      if (!currentRoute) {
        violations.push(`route history removed instead of retired: ${baseRoute.routeKey}`);
        continue;
      }
      if (
        currentRoute.surface !== baseRoute.surface ||
        currentRoute.publicPath !== baseRoute.publicPath ||
        normalizedMethods(currentRoute).join("|") !==
          normalizedMethods(baseRoute).join("|")
      ) {
        violations.push(`route identity changed: ${baseRoute.routeKey}`);
      }
    }
    const baseRouteKeys = new Set(
      (baseLedger.routeFamilies ?? []).map((route) => route.routeKey),
    );
    for (const route of ledger.routeFamilies ?? []) {
      if (
        !baseRouteKeys.has(route.routeKey) &&
        !new Set(["canonical", "retired"]).has(resolveRouteState(ledger, route))
      ) {
        violations.push(`new compatibility route ${route.routeKey}`);
      }
    }

    const activeDispatchKeys = new Set(
      currentFindings
        .filter((finding) => finding.matcherId === "classroom-dispatch")
        .map((finding) => finding.key),
    );
    const currentSources = new Map(
      (ledger.routeSourceFingerprints ?? []).map((entry) => [entry.path, entry]),
    );
    for (const baseSource of baseLedger.routeSourceFingerprints ?? []) {
      const currentSource = currentSources.get(baseSource.path);
      const sourceIsActive = (baseSource.dispatchKeys ?? []).some((key) =>
        key === "*" ? activeDispatchKeys.size > 0 : activeDispatchKeys.has(key)
      );
      if (!sourceIsActive) continue;
      if (!currentSource) {
        violations.push(`active route source fingerprint removed: ${baseSource.path}`);
      } else {
        if (currentSource.sha256 !== baseSource.sha256) {
          violations.push(`active route source changed: ${baseSource.path}`);
        }
        const currentDispatchKeys = new Set(currentSource.dispatchKeys ?? []);
        for (const dispatchKey of baseSource.dispatchKeys ?? []) {
          if (!currentDispatchKeys.has(dispatchKey)) {
            violations.push(
              `active route source dispatch key removed: ${baseSource.path} -> ${dispatchKey}`,
            );
          }
        }
      }
    }
    const baseSources = new Set(
      (baseLedger.routeSourceFingerprints ?? []).map((entry) => entry.path),
    );
    for (const currentSource of ledger.routeSourceFingerprints ?? []) {
      if (!baseSources.has(currentSource.path)) {
        const sourceIsActive = (currentSource.dispatchKeys ?? []).some((key) =>
          key === "*" ? activeDispatchKeys.size > 0 : activeDispatchKeys.has(key)
        );
        if (sourceIsActive) {
          violations.push(`new active route source fingerprint: ${currentSource.path}`);
        }
      }
    }
  } else if (baseFindings.length > 0) {
    const baseByKey = new Map(baseFindings.map((finding) => [finding.key, finding]));
    for (const allowance of allowanceByKey.values()) {
      const base = baseByKey.get(allowance.key);
      if (!base) violations.push(`initial allowance ${allowance.key} is absent from the base tree`);
      else if (allowance.maxOccurrences > base.count) {
        violations.push(
          `${allowance.key} initial allowance ${allowance.maxOccurrences} exceeds base count ${base.count}`,
        );
      }
    }
  }

  return violations;
}

export function resolveApiBoundaryDependency(ledger, dependency) {
  return {
    ...(ledger.dependencyDefaults?.[dependency.matcherId] ?? {}),
    ...dependency,
  };
}

function resolveRouteState(ledger, route) {
  return route.migrationState ??
    ledger.surfaceDefaults?.[route.surface]?.migrationState ??
    null;
}

function normalizedMethods(route) {
  return [...(route.methods ?? [])].sort();
}

function compareScanScope(matcherId, current = {}, base = {}) {
  const violations = [];
  const currentRoots = new Set(current.roots ?? []);
  for (const root of base.roots ?? []) {
    if (!currentRoots.has(root)) violations.push(`matcher ${matcherId} scan root removed: ${root}`);
  }
  const currentExtensions = new Set(current.extensions ?? []);
  for (const extension of base.extensions ?? []) {
    if (!currentExtensions.has(extension)) {
      violations.push(`matcher ${matcherId} scan extension removed: ${extension}`);
    }
  }
  const baseExcludes = new Set(base.excludes ?? []);
  for (const exclusion of current.excludes ?? []) {
    if (!baseExcludes.has(exclusion)) {
      violations.push(`matcher ${matcherId} scan exclusion added: ${exclusion}`);
    }
  }
  return violations;
}

async function readMatcherSources(root, matcher) {
  const sources = {};
  for (const target of matcher.scan?.roots ?? []) {
    for (const filePath of await listTextFiles(path.join(root, target), matcher.scan)) {
      const relativePath = normalizePath(path.relative(root, filePath));
      sources[relativePath] = await readFile(filePath, "utf8");
    }
  }
  return sources;
}

async function listTextFiles(target, scan = {}) {
  let details;
  try {
    details = await stat(target);
  } catch {
    return [];
  }
  if (details.isFile()) return includeFile(target, scan) ? [target] : [];

  const files = [];
  for (const entry of await readdir(target, { withFileTypes: true })) {
    if (entry.isDirectory() && DEFAULT_IGNORED_DIRECTORIES.has(entry.name)) continue;
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) files.push(...await listTextFiles(child, scan));
    else if (entry.isFile() && includeFile(child, scan)) files.push(child);
  }
  return files;
}

function includeFile(filePath, scan) {
  const normalized = normalizePath(filePath);
  const extensions = scan.extensions
    ? new Set(scan.extensions)
    : DEFAULT_TEXT_EXTENSIONS;
  if (!extensions.has(path.extname(filePath))) return false;
  return !(scan.excludes ?? []).some((pattern) =>
    new RegExp(pattern, "u").test(normalized)
  );
}

export function matchesApiBoundaryScanPath(filePath, scan = {}) {
  return includeFile(filePath, scan);
}

function countLiteral(source, literal) {
  if (!literal) return 0;
  let count = 0;
  let index = 0;
  while ((index = source.indexOf(literal, index)) >= 0) {
    count += 1;
    index += literal.length;
  }
  return count;
}

function compareFindings(left, right) {
  return left.key.localeCompare(right.key) || left.path.localeCompare(right.path);
}

function normalizePath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//u, "");
}
