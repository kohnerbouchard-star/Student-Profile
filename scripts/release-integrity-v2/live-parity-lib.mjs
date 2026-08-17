import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) options[key] = true;
    else { options[key] = next; i += 1; }
  }
  return options;
}

export function required(options, key) {
  const value = options[key];
  if (!value || value === true) throw new Error(`--${key} is required`);
  return String(value);
}

export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function readJson(file) {
  return JSON.parse(await readFile(path.resolve(file), "utf8"));
}

export function routineKey(row) {
  return `${row.schema}.${row.name ?? row.routine}(${row.arguments ?? ""})`;
}

export function routineGrantKey(row) {
  return `${row.grantor}|${row.grantee}|${routineKey(row)}|${row.privilege}`;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function mapUnique(entries, keyer, label) {
  const result = new Map();
  for (const entry of entries || []) {
    const key = keyer(entry);
    if (!key) throw new Error(`${label} entry is missing a key`);
    if (result.has(key)) throw new Error(`Duplicate ${label} entry: ${key}`);
    result.set(key, entry);
  }
  return result;
}

const KEYERS = {
  schemas: (row) => row.name,
  relations: (row) => `${row.schema}.${row.name}`,
  columns: (row) => `${row.schema}.${row.table}.${row.name}`,
  constraints: (row) => `${row.schema}.${row.table}.${row.name}`,
  indexes: (row) => `${row.schema}.${row.table}.${row.name}`,
  routines: routineKey,
  triggers: (row) => `${row.schema}.${row.table}.${row.name}`,
  schemaOwners: (row) => row.schema,
  relationOwners: (row) => `${row.schema}.${row.relation}`,
  routineOwners: routineKey,
  roleAttributes: (row) => row.role,
  roleMemberships: (row) => `${row.role}|${row.member}|${row.grantor}`,
  rowSecurity: (row) => `${row.schema}.${row.relation}`,
  policies: (row) => `${row.schema}.${row.table}.${row.name}`,
  tableGrants: (row) => `${row.grantor}|${row.grantee}|${row.schema}.${row.table}|${row.privilege}`,
  routineGrants: routineGrantKey,
  defaultPrivileges: (row) => `${row.role}|${row.schema}|${row.objectType}`,
};

function compareRows(scope, name, leftRows, rightRows) {
  const keyer = KEYERS[name];
  const left = new Map((leftRows || []).map((row) => [keyer(row), row]));
  const right = new Map((rightRows || []).map((row) => [keyer(row), row]));
  const diffs = [];
  for (const key of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    if (!left.has(key)) diffs.push({ scope, category: name, key, kind: "production_only", production: right.get(key) });
    else if (!right.has(key)) diffs.push({ scope, category: name, key, kind: "staging_only", staging: left.get(key) });
    else if (stable(left.get(key)) !== stable(right.get(key))) {
      diffs.push({ scope, category: name, key, kind: "different", staging: left.get(key), production: right.get(key) });
    }
  }
  return diffs;
}

export function compareSchema(staging, production) {
  const diffs = [];
  for (const category of ["schemas","relations","columns","constraints","indexes","routines","triggers"]) {
    diffs.push(...compareRows("structural", category, staging.structural?.[category], production.structural?.[category]));
  }
  for (const category of ["schemaOwners","relationOwners","routineOwners","roleAttributes","roleMemberships","rowSecurity","policies","tableGrants","routineGrants","defaultPrivileges"]) {
    diffs.push(...compareRows("authorization", category, staging.authorization?.[category], production.authorization?.[category]));
  }
  return diffs;
}

export function rawRoutineDiffs(staging, production) {
  const left = new Map((staging.structural?.routines || []).map((row) => [routineKey(row), row]));
  const right = new Map((production.structural?.routines || []).map((row) => [routineKey(row), row]));
  const stagingOnly = [], productionOnly = [], definitionDrift = [];
  for (const key of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    if (!right.has(key)) stagingOnly.push({ signature:key, definitionSha256:left.get(key).definitionSha256 });
    else if (!left.has(key)) productionOnly.push({ signature:key, definitionSha256:right.get(key).definitionSha256 });
    else if (left.get(key).definitionSha256 !== right.get(key).definitionSha256) definitionDrift.push({
      signature:key, stagingSha256:left.get(key).definitionSha256, productionSha256:right.get(key).definitionSha256,
    });
  }
  return { stagingOnly, productionOnly, definitionDrift };
}

function normalizeLedger(value) {
  const rows = Array.isArray(value) ? value : value?.migrations;
  if (!Array.isArray(rows)) throw new Error("Ledger must be an array or {migrations:[]}");
  return rows.map((row) => ({ version:String(row.version), name:String(row.name || "") }))
    .sort((a,b) => a.version.localeCompare(b.version) || a.name.localeCompare(b.name));
}

export function compareLedger(stagingValue, productionValue, policy) {
  const staging = normalizeLedger(stagingValue), production = normalizeLedger(productionValue);
  const cutoff = String(policy.historicalLedgerCutoff || "");
  const sh = staging.filter((row) => row.version <= cutoff), ph = production.filter((row) => row.version <= cutoff);
  const sp = staging.filter((row) => row.version > cutoff), pp = production.filter((row) => row.version > cutoff);
  const stagingSha256 = sha256(stable(sh)), productionSha256 = sha256(stable(ph));
  const expected = policy.historicalLedgerBaselines || {};
  return {
    cutoff,
    historical:{
      status: expected.stagingSha256 === stagingSha256 && expected.productionSha256 === productionSha256 ? "PASS" : "BASELINE_REQUIRED",
      stagingCount:sh.length, productionCount:ph.length, stagingSha256, productionSha256,
      expectedStagingSha256:expected.stagingSha256 ?? null, expectedProductionSha256:expected.productionSha256 ?? null,
    },
    postCutoff:{ status:stable(sp) === stable(pp) ? "PASS" : "UNAPPROVED_DRIFT", staging:sp, production:pp },
  };
}
