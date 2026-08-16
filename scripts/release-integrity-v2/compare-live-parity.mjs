#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = next;
      i += 1;
    }
  }
  return options;
}

function required(options, key) {
  const value = options[key];
  if (!value || value === true) throw new Error(`--${key} is required`);
  return String(value);
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(file) {
  return JSON.parse(await readFile(path.resolve(file), "utf8"));
}

function routineKey(row) {
  return `${row.schema}.${row.name ?? row.routine}(${row.arguments ?? ""})`;
}

function tableKey(row) {
  return `${row.schema}.${row.table ?? row.relation ?? row.name}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function routineApprovalMap(policy) {
  return new Map((policy.approvedRoutineDefinitionDrift || []).map((entry) => [entry.signature, entry]));
}

function normalizeEvidence(raw, environment, policy) {
  const evidence = clone(raw);
  const allowedTables = new Set(policy.allowedStagingOnlyTables || []);
  const allowedRoutines = new Set(
    environment === "staging"
      ? policy.allowedStagingOnlyRoutines || []
      : policy.allowedProductionOnlyRoutines || [],
  );
  const approvals = routineApprovalMap(policy);

  const structural = evidence.structural || {};
  structural.relations = (structural.relations || []).filter((row) => !allowedTables.has(`${row.schema}.${row.name}`));
  structural.columns = (structural.columns || []).filter((row) => !allowedTables.has(`${row.schema}.${row.table}`));
  structural.constraints = (structural.constraints || []).filter((row) => !allowedTables.has(`${row.schema}.${row.table}`));
  structural.indexes = (structural.indexes || []).filter((row) => !allowedTables.has(`${row.schema}.${row.table}`));
  structural.triggers = (structural.triggers || []).filter((row) => !allowedTables.has(`${row.schema}.${row.table}`));
  structural.routines = (structural.routines || [])
    .filter((row) => !allowedRoutines.has(routineKey(row)))
    .map((row) => {
      const signature = routineKey(row);
      const approval = approvals.get(signature);
      if (!approval) return row;
      const expected = environment === "staging" ? approval.stagingSha256 : approval.productionSha256;
      if (row.definitionSha256 !== expected) return row;
      return { ...row, definitionSha256: `approved-drift:${signature}` };
    });

  const authorization = evidence.authorization || {};
  authorization.relationOwners = (authorization.relationOwners || []).filter((row) => !allowedTables.has(`${row.schema}.${row.relation}`));
  authorization.rowSecurity = (authorization.rowSecurity || []).filter((row) => !allowedTables.has(`${row.schema}.${row.relation}`));
  authorization.policies = (authorization.policies || []).filter((row) => !allowedTables.has(`${row.schema}.${row.table}`));
  authorization.tableGrants = (authorization.tableGrants || []).filter((row) => !allowedTables.has(`${row.schema}.${row.table}`));
  authorization.routineOwners = (authorization.routineOwners || []).filter((row) => !allowedRoutines.has(routineKey(row)));
  authorization.routineGrants = (authorization.routineGrants || []).filter((row) => !allowedRoutines.has(routineKey(row)));

  return evidence;
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
  routineGrants: (row) => `${row.grantor}|${row.grantee}|${routineKey(row)}|${row.privilege}`,
  defaultPrivileges: (row) => `${row.role}|${row.schema}|${row.objectType}`,
};

function compareRows(scope, name, leftRows, rightRows) {
  const keyer = KEYERS[name];
  if (!keyer) throw new Error(`No keyer for ${scope}.${name}`);
  const left = new Map((leftRows || []).map((row) => [keyer(row), row]));
  const right = new Map((rightRows || []).map((row) => [keyer(row), row]));
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort();
  const diffs = [];
  for (const key of keys) {
    if (!left.has(key)) {
      diffs.push({ scope, category: name, key, kind: "production_only", production: right.get(key) });
      continue;
    }
    if (!right.has(key)) {
      diffs.push({ scope, category: name, key, kind: "staging_only", staging: left.get(key) });
      continue;
    }
    if (stable(left.get(key)) !== stable(right.get(key))) {
      diffs.push({ scope, category: name, key, kind: "different", staging: left.get(key), production: right.get(key) });
    }
  }
  return diffs;
}

function compareSchema(staging, production) {
  const diffs = [];
  for (const category of ["schemas", "relations", "columns", "constraints", "indexes", "routines", "triggers"]) {
    diffs.push(...compareRows("structural", category, staging.structural?.[category], production.structural?.[category]));
  }
  for (const category of [
    "schemaOwners",
    "relationOwners",
    "routineOwners",
    "roleAttributes",
    "roleMemberships",
    "rowSecurity",
    "policies",
    "tableGrants",
    "routineGrants",
    "defaultPrivileges",
  ]) {
    diffs.push(...compareRows("authorization", category, staging.authorization?.[category], production.authorization?.[category]));
  }
  return diffs;
}

function rawRoutineDiffs(staging, production) {
  const left = new Map((staging.structural?.routines || []).map((row) => [routineKey(row), row]));
  const right = new Map((production.structural?.routines || []).map((row) => [routineKey(row), row]));
  const stagingOnly = [];
  const productionOnly = [];
  const definitionDrift = [];
  for (const key of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    if (!right.has(key)) {
      stagingOnly.push({ signature: key, definitionSha256: left.get(key).definitionSha256 });
    } else if (!left.has(key)) {
      productionOnly.push({ signature: key, definitionSha256: right.get(key).definitionSha256 });
    } else if (left.get(key).definitionSha256 !== right.get(key).definitionSha256) {
      definitionDrift.push({
        signature: key,
        stagingSha256: left.get(key).definitionSha256,
        productionSha256: right.get(key).definitionSha256,
      });
    }
  }
  return { stagingOnly, productionOnly, definitionDrift };
}

function normalizeLedger(value) {
  const rows = Array.isArray(value) ? value : value?.migrations;
  if (!Array.isArray(rows)) throw new Error("Ledger must be an array or {migrations:[]}");
  return rows.map((row) => ({ version: String(row.version), name: String(row.name || "") }))
    .sort((a, b) => a.version.localeCompare(b.version) || a.name.localeCompare(b.name));
}

function compareLedger(stagingValue, productionValue, policy) {
  const staging = normalizeLedger(stagingValue);
  const production = normalizeLedger(productionValue);
  const cutoff = String(policy.historicalLedgerCutoff || "");
  if (!/^\d{14}$/.test(cutoff)) throw new Error("historicalLedgerCutoff must be a 14-digit version");
  const stagingHistorical = staging.filter((row) => row.version <= cutoff);
  const productionHistorical = production.filter((row) => row.version <= cutoff);
  const stagingPost = staging.filter((row) => row.version > cutoff);
  const productionPost = production.filter((row) => row.version > cutoff);
  const stagingSha256 = sha256(stable(stagingHistorical));
  const productionSha256 = sha256(stable(productionHistorical));
  const expected = policy.historicalLedgerBaselines || {};
  const historicalStatus = expected.stagingSha256 && expected.productionSha256
    && expected.stagingSha256 === stagingSha256
    && expected.productionSha256 === productionSha256
    ? "PASS"
    : "BASELINE_REQUIRED";
  const postCutoffStatus = stable(stagingPost) === stable(productionPost) ? "PASS" : "UNAPPROVED_DRIFT";
  return {
    cutoff,
    historical: {
      status: historicalStatus,
      stagingCount: stagingHistorical.length,
      productionCount: productionHistorical.length,
      stagingSha256,
      productionSha256,
      expectedStagingSha256: expected.stagingSha256 ?? null,
      expectedProductionSha256: expected.productionSha256 ?? null,
    },
    postCutoff: {
      status: postCutoffStatus,
      staging: stagingPost,
      production: productionPost,
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const mode = String(options.mode || "report");
  if (!new Set(["report", "enforce"]).has(mode)) throw new Error("--mode must be report or enforce");
  const [policy, stagingRaw, productionRaw, stagingLedger, productionLedger] = await Promise.all([
    readJson(required(options, "policy")),
    readJson(required(options, "stagingSchema")),
    readJson(required(options, "productionSchema")),
    readJson(required(options, "stagingLedger")),
    readJson(required(options, "productionLedger")),
  ]);
  if (policy.schemaVersion !== "econovaria.release-integrity-v2.policy.v1") {
    throw new Error("Unsupported v2 policy schema");
  }

  const ledger = compareLedger(stagingLedger, productionLedger, policy);
  const rawRoutines = rawRoutineDiffs(stagingRaw, productionRaw);
  const staging = normalizeEvidence(stagingRaw, "staging", policy);
  const production = normalizeEvidence(productionRaw, "production", policy);
  const differences = compareSchema(staging, production);
  const result = {
    schemaVersion: "econovaria.release-integrity-v2.live-parity.v1",
    policyId: policy.policyId,
    mode,
    ledger,
    approvedStagingOnlyTables: policy.allowedStagingOnlyTables || [],
    rawRoutineDifferences: rawRoutines,
    unapprovedDifferenceCount: differences.length,
    differences: differences.slice(0, 500),
  };
  const pass = ledger.historical.status === "PASS"
    && ledger.postCutoff.status === "PASS"
    && differences.length === 0;
  result.status = pass ? "PASS" : mode === "report" ? "REPORT" : "BLOCKED";

  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output) await writeFile(path.resolve(String(options.output)), serialized, "utf8");
  process.stdout.write(serialized);
  if (mode === "enforce" && !pass) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
