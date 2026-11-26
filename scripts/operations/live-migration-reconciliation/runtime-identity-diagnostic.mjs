// Diagnostic only. The exact catalog comparison remains the parity gate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROFILE = new URL('./runtime-identity-profile.json', import.meta.url);
const VERSION = 'econovaria.phase15.catalog-supplement.v2';
const CAP = 9999;
const OTHER = ['extensions', 'views', 'routineSecurity', 'triggers'];
const CATEGORIES = ['schemas', ...OTHER, 'cron'];
const SCHEMA_KEYS = ['name', 'owner'];
const CRON_KEYS = ['name', 'schedule', 'active', 'database', 'username', 'commandSha256'];
const PROVIDERS = new Map([
  ['auth', 'P01'], ['cron', 'P02'], ['extensions', 'P03'], ['graphql', 'P04'],
  ['graphql_public', 'P05'], ['net', 'P06'], ['realtime', 'P07'], ['storage', 'P08'],
  ['vault', 'P09'],
]);
const UNVERIFIED_PROVIDERS = new Map([['_realtime', 'U01'], ['supabase_functions', 'U02']]);
const STATIC_JOBS = new Map([
  ['econovaria-expired-staff-signup-cleanup-v1', 'S01'],
  ['econovaria-daily-macro-progression-v1', 'S02'],
  ['econovaria-autonomous-timed-services-v1', 'S03'],
  ['econovaria-game-license-expiration-v1', 'S04'],
  ['econovaria-story-character-replies-v1', 'S05'],
  ['econovaria-story-character-replies-log-prune-v1', 'S06'],
]);
const HISTORICAL = 'docs/operations/evidence/phase15-live-parity/2026-09-20/';
const CLEAN_SCHEMA = 'docs/operations/evidence/live-migration-reconciliation-v1/clean-replay-schema.json';
const SOURCE_PATHS = [
  HISTORICAL + 'staging-schema-supplement.json',
  HISTORICAL + 'production-schema-supplement.json',
  CLEAN_SCHEMA,
  ...[
    '20260731133000_schedule_expired_staff_signup_cleanup_v1.sql',
    '20260810120000_add_daily_country_macro_runtime_v1.sql',
    '20260810123500_add_autonomous_timed_services_runtime_v1.sql',
    '20260818142000_scale_story_character_reply_worker_v1.sql',
    '20260920081400_phase15_reconcile_game_purge_operator_controls_v1.sql',
  ].map(file => 'backend/supabase/migrations/' + file),
];

const sha = value => createHash('sha256').update(value).digest('hex');
const sorted = values => [...values].sort();
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(sorted(Object.keys(value)).map(key => [key, canonical(value[key])]));
  return value;
}
const stable = value => JSON.stringify(canonical(value));
const equal = (left, right) => stable(left) === stable(right);
function exact(value, keys) {
  assert(object(value) && equal(sorted(Object.keys(value)), sorted(keys)));
}
function keyed(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const id = key(row);
    assert(!result.has(id));
    result.set(id, row);
  }
  return result;
}
function capped(counts) {
  return Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, Math.min(CAP, count)]));
}
export function unavailableRuntimeIdentity(status = 'unavailable') {
  return {
    status, classification: 'unresolved', diagnosticOnly: true,
    parityEstablished: false, applyAuthorized: false, releaseCertificate: false,
    boundToExactComparison: false, countCap: CAP, countsAtCapAreLowerBounds: true,
    profileSha256: null, identityLabels: null, counts: null,
  };
}

export function verifiedRuntimeIdentityProfile() {
  const bytes = readFileSync(PROFILE);
  const profile = JSON.parse(bytes);
  exact(profile, ['schemaVersion', 'evidenceBaseline', 'sources', 'providerSchemaRows',
    'providerNamesWithoutVerifiedOwner', 'staticSchedulerRows']);
  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.evidenceBaseline, 'b62f10ffda169fd6f884cc3a254c136fbd6b862d');
  assert.deepEqual(sorted(profile.sources.map(source => source.path)), sorted(SOURCE_PATHS));
  const sources = new Map();
  for (const source of profile.sources) {
    exact(source, ['path', 'sha256']);
    assert(/^[a-f0-9]{64}$/.test(source.sha256));
    const content = readFileSync(join(ROOT, source.path));
    assert.equal(sha(content), source.sha256);
    sources.set(source.path, content.toString('utf8'));
  }

  const historical = ['staging', 'production'].map(environment =>
    JSON.parse(sources.get(HISTORICAL + environment + '-schema-supplement.json')));
  assert.deepEqual(sorted(profile.providerSchemaRows.map(row => row.name)), sorted(PROVIDERS.keys()));
  for (const row of profile.providerSchemaRows) {
    exact(row, SCHEMA_KEYS);
    assert(historical.every(snapshot => snapshot.schemas.some(record => equal(record, row))));
  }
  assert.deepEqual(profile.providerNamesWithoutVerifiedOwner, [...UNVERIFIED_PROVIDERS.keys()]);
  const clean = JSON.parse(sources.get(CLEAN_SCHEMA));
  for (const name of UNVERIFIED_PROVIDERS.keys()) assert(clean.schemas.some(row => row.name === name));

  const extracted = [];
  const schedulerCommands = new Map();
  for (const [path, sql] of sources) {
    if (!path.endsWith('.sql')) continue;
    for (const [, name, schedule, dollar, quoted] of sql.matchAll(
      /(?:perform|return) cron\.schedule\(\s*'([^']+)',\s*'([^']+)',\s*(?:\$cron\$([\s\S]*?)\$cron\$|'([^']+)')\s*\)/g,
    )) {
      schedulerCommands.set(name, dollar ?? quoted);
      extracted.push({
        name, schedule, active: true, database: 'postgres', username: 'postgres',
        commandSha256: sha(dollar ?? quoted),
      });
    }
  }
  const expectedJobs = sorted(STATIC_JOBS.keys());
  assert.deepEqual(sorted(extracted.map(row => row.name)), expectedJobs);
  assert.deepEqual(sorted(profile.staticSchedulerRows.map(row => row.name)), expectedJobs);
  for (const row of profile.staticSchedulerRows) {
    exact(row, CRON_KEYS);
    assert(extracted.some(record => equal(record, row)));
    assert(historical.every(snapshot => snapshot.cron.some(record => equal(record, row))));
  }
  return { profile, sha256: sha(bytes), schedulerCommands };
}

function validate(input) {
  exact(input, ['schemaVersion', ...CATEGORIES]);
  assert.equal(input.schemaVersion, VERSION);
  for (const key of CATEGORIES) assert(Array.isArray(input[key]) && input[key].length <= 10000 && input[key].every(object));
  for (const row of input.schemas) {
    exact(row, SCHEMA_KEYS);
    assert(typeof row.name === 'string' && typeof row.owner === 'string');
  }
  for (const row of input.cron) {
    exact(row, CRON_KEYS);
    assert(['name', 'schedule', 'database', 'username'].every(key => typeof row[key] === 'string'));
    assert(typeof row.active === 'boolean' && /^[a-f0-9]{64}$/.test(row.commandSha256));
  }
}
const cronKey = row => stable([row.name, row.database, row.username]);

export function runtimeIdentityDiagnostic(canonicalSnapshot, restoredSnapshot) {
  if (canonicalSnapshot == null || restoredSnapshot == null) return unavailableRuntimeIdentity();
  try {
    validate(canonicalSnapshot);
    validate(restoredSnapshot);
    const { profile, sha256 } = verifiedRuntimeIdentityProfile();
    const labels = [];
    const add = (id, difference, confidence) => {
      if (id) labels.push({ id, difference, confidence });
    };
    const schemas = {
      canonicalOnlyVerifiedProvider: 0, restoredOnlyVerifiedProvider: 0,
      changedOwner: 0, unverifiedProviderIdentity: 0, unknownIdentity: 0,
    };
    const left = keyed(canonicalSnapshot.schemas, row => row.name);
    const right = keyed(restoredSnapshot.schemas, row => row.name);
    for (const name of sorted(new Set([...left.keys(), ...right.keys()]))) {
      const before = left.get(name);
      const after = right.get(name);
      const providerId = PROVIDERS.get(name);
      const id = providerId ?? UNVERIFIED_PROVIDERS.get(name);
      if (before && after) {
        if (!equal(before, after)) {
          schemas.changedOwner++;
          add(id, 'changed-owner', 'unresolved');
        }
        continue;
      }
      const side = before ? 'canonical-only' : 'restored-only';
      if (profile.providerSchemaRows.some(row => equal(row, before ?? after))) {
        schemas[before ? 'canonicalOnlyVerifiedProvider' : 'restoredOnlyVerifiedProvider']++;
        add(providerId, side, 'exact-provider-tuple');
      } else if (id) {
        schemas.unverifiedProviderIdentity++;
        add(id, side, 'owner-unverified');
      } else {
        schemas.unknownIdentity++;
      }
    }

    const cron = {
      canonicalOnlyVerifiedStatic: 0, restoredOnlyVerifiedStatic: 0,
      changedDefinitionOrState: 0, unknownCanonicalOnly: 0, unknownRestoredOnly: 0,
    };
    const expected = keyed(profile.staticSchedulerRows, cronKey);
    const canonicalJobs = keyed(canonicalSnapshot.cron, cronKey);
    const restoredJobs = keyed(restoredSnapshot.cron, cronKey);
    for (const key of sorted(new Set([...canonicalJobs.keys(), ...restoredJobs.keys()]))) {
      const before = canonicalJobs.get(key);
      const after = restoredJobs.get(key);
      const anchored = expected.get(key);
      const id = STATIC_JOBS.get(anchored?.name);
      if (before && after) {
        if (!equal(before, after)) {
          cron.changedDefinitionOrState++;
          add(id, 'changed-definition-or-state', 'unresolved');
        }
        continue;
      }
      const side = before ? 'canonical-only' : 'restored-only';
      if (anchored && equal(anchored, before ?? after)) {
        cron[before ? 'canonicalOnlyVerifiedStatic' : 'restoredOnlyVerifiedStatic']++;
        add(id, side, 'exact-static-tuple');
      } else {
        cron[before ? 'unknownCanonicalOnly' : 'unknownRestoredOnly']++;
        add(id, side, 'definition-or-state-unverified');
      }
    }

    const other = Object.fromEntries(OTHER.map(key => [
      key, Number(!equal(canonicalSnapshot[key].map(stable).sort(), restoredSnapshot[key].map(stable).sort())),
    ]));
    const unresolved = schemas.changedOwner + schemas.unverifiedProviderIdentity + schemas.unknownIdentity +
      cron.restoredOnlyVerifiedStatic + cron.changedDefinitionOrState + cron.unknownCanonicalOnly +
      cron.unknownRestoredOnly + Object.values(other).reduce((a, b) => a + b, 0);
    const found = [...Object.values(schemas), ...Object.values(cron), ...Object.values(other)].some(Boolean);
    labels.sort((a, b) => a.id.localeCompare(b.id));
    return {
      ...unavailableRuntimeIdentity('available'),
      classification: unresolved ? 'unresolved' : found ? 'known-identities-only' : 'identity-equal',
      profileSha256: sha256, identityLabels: labels,
      counts: { schemas: capped(schemas), cron: capped(cron), otherCategoryChanged: other },
    };
  } catch {
    return unavailableRuntimeIdentity('invalid');
  }
}

function load(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = process.argv.length === 4
    ? runtimeIdentityDiagnostic(load(process.argv[2]), load(process.argv[3]))
    : unavailableRuntimeIdentity('invalid');
  process.stdout.write(JSON.stringify(result) + '\n');
}
