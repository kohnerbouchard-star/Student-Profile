// Counts only. This projection never authorizes a restore, apply or release.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const IGNORED = new Set(['captured_at', 'generated_at', 'capturedAt', 'generatedAt']);
export const COUNT_CAP = 9999;
export const GROUPS = Object.freeze({
  'econovaria.phase15.catalog-supplement.v2': {
    catalog: ['schemas', 'extensions', 'views', 'routineSecurity', 'triggers', 'cron'],
  },
  'econovaria.release-integrity.raw-schema-evidence.v2': {
    structural: ['schemas', 'relations', 'columns', 'constraints', 'indexes', 'routines', 'triggers'],
    authorization: ['schemaGrants', 'schemaOwners', 'relationOwners', 'routineOwners',
      'roleAttributes', 'roleMemberships', 'rowSecurity', 'policies', 'tableGrants',
      'routineGrants', 'defaultPrivileges'],
  },
});
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const keys = value => Object.keys(value).filter(key => !IGNORED.has(key)).sort();
const sameKeys = (value, expected) => object(value) && JSON.stringify(keys(value)) === JSON.stringify([...expected].sort());

// Same positional differences as the exact comparator: array length is one
// difference; remaining extra elements are represented by that length difference.
function count(left, right) {
  if (Object.is(left, right)) return 0;
  if (Array.isArray(left) && Array.isArray(right)) {
    let total = Number(left.length !== right.length);
    for (let i = 0; i < Math.min(left.length, right.length) && total < COUNT_CAP; i++) total += count(left[i], right[i]);
    return Math.min(COUNT_CAP, total);
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    let total = 0;
    for (const key of [...new Set([...keys(left), ...keys(right)])].sort()) {
      total += !Object.hasOwn(left, key) || !Object.hasOwn(right, key) ? 1 : count(left[key], right[key]);
      if (total >= COUNT_CAP) return COUNT_CAP;
    }
    return total;
  }
  return 1;
}

export function exactDifferenceCounts(left, right) {
  try {
    const groups = GROUPS[left?.schemaVersion];
    if (!groups || left.schemaVersion !== right?.schemaVersion) throw new Error();
    const catalog = Object.hasOwn(groups, 'catalog');
    const expectedRoot = catalog ? ['schemaVersion', ...groups.catalog] : ['schemaVersion', ...Object.keys(groups)];
    for (const input of [left, right]) {
      if (!sameKeys(input, expectedRoot)) throw new Error();
      for (const [group, names] of Object.entries(groups)) {
        const source = catalog ? input : input[group];
        if (!catalog && !sameKeys(source, names)) throw new Error();
        if (!names.every(name => Array.isArray(source[name]) && source[name].every(object))) throw new Error();
      }
    }
    const categories = {};
    for (const [group, names] of Object.entries(groups)) {
      for (const name of names) categories[`${group}.${name}`] = count(catalog ? left[name] : left[group][name], catalog ? right[name] : right[group][name]);
    }
    return { status: 'available', countCap: COUNT_CAP, countsAtCapAreLowerBounds: true, categories };
  } catch {
    return { status: 'invalid', countCap: COUNT_CAP, countsAtCapAreLowerBounds: true, categories: null };
  }
}

function safeDiagnostic(comparison, schemaVersion) {
  const diagnostic = comparison?.boundedDiagnostics;
  const empty = { status: 'unavailable', countCap: COUNT_CAP, countsAtCapAreLowerBounds: true, categories: null };
  if (diagnostic == null) return empty;
  const invalid = { ...empty, status: 'invalid' };
  if (!sameKeys(diagnostic, ['status', 'countCap', 'countsAtCapAreLowerBounds', 'categories']) ||
      diagnostic.countCap !== COUNT_CAP || diagnostic.countsAtCapAreLowerBounds !== true) return invalid;
  if (diagnostic.status === 'invalid' && diagnostic.categories === null) return invalid;
  const expected = Object.entries(GROUPS[schemaVersion]).flatMap(([group, names]) => names.map(name => `${group}.${name}`));
  if (diagnostic.status !== 'available' || !sameKeys(diagnostic.categories, expected) ||
      !expected.every(key => Number.isSafeInteger(diagnostic.categories[key]) && diagnostic.categories[key] >= 0 && diagnostic.categories[key] <= COUNT_CAP)) return invalid;
  return { status: 'available', countCap: COUNT_CAP, countsAtCapAreLowerBounds: true,
    categories: Object.fromEntries(expected.map(key => [key, diagnostic.categories[key]])) };
}

function readComparison(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error();
    const result = JSON.parse(readFileSync(0, 'utf8'));
    if (!object(result)) throw new Error();
    result.exactComparisonDiagnostics = {
      applicationSchema: safeDiagnostic(readComparison(process.argv[2]), 'econovaria.release-integrity.raw-schema-evidence.v2'),
      runtimeCatalog: safeDiagnostic(readComparison(process.argv[3]), 'econovaria.phase15.catalog-supplement.v2'),
    };
    result.releaseCertificate = false;
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch {
    process.stderr.write('Bounded catalog projection failed validation.\n');
    process.exitCode = 1;
  }
}
