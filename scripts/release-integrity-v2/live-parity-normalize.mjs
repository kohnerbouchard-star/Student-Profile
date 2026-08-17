import path from "node:path";
import { clone, mapUnique, readJson, routineGrantKey, routineKey, stable } from "./live-parity-lib.mjs";

function assertSha256(value, label) {
  if (!/^[0-9a-f]{64}$/u.test(String(value || ""))) throw new Error(`${label} must be a lowercase SHA-256 hex digest`);
}

export async function hydratePolicy(policy, policyPath) {
  const hydrated = clone(policy);
  const arrays = [
    "approvedStagingOnlyRoutines","approvedProductionOnlyRoutines",
    "approvedStagingOnlyRoutineGrants","approvedProductionOnlyRoutineGrants",
    "approvedRoutineDefinitionDrift",
  ];
  for (const key of arrays) hydrated[key] = [...(hydrated[key] || [])];
  const root = path.dirname(path.resolve(policyPath));
  for (const file of hydrated.approvalFiles || []) {
    const fragment = await readJson(path.resolve(root, file));
    for (const key of arrays) hydrated[key].push(...(fragment[key] || []));
  }
  return hydrated;
}

export function validatePolicy(policy) {
  if (policy.schemaVersion !== "econovaria.release-integrity-v2.policy.v1") throw new Error("Unsupported v2 policy schema");
  if (!/^\d{14}$/u.test(String(policy.historicalLedgerCutoff || ""))) throw new Error("historicalLedgerCutoff must be a 14-digit version");
  assertSha256(policy.historicalLedgerBaselines?.stagingSha256, "historicalLedgerBaselines.stagingSha256");
  assertSha256(policy.historicalLedgerBaselines?.productionSha256, "historicalLedgerBaselines.productionSha256");

  for (const field of ["approvedStagingOnlyRoutines","approvedProductionOnlyRoutines"]) {
    for (const [signature, entry] of mapUnique(policy[field], (e) => e.signature, field)) assertSha256(entry.sha256, `${field}.${signature}.sha256`);
  }
  for (const [signature, entry] of mapUnique(policy.approvedRoutineDefinitionDrift, (e) => e.signature, "approvedRoutineDefinitionDrift")) {
    assertSha256(entry.stagingSha256, `approvedRoutineDefinitionDrift.${signature}.stagingSha256`);
    assertSha256(entry.productionSha256, `approvedRoutineDefinitionDrift.${signature}.productionSha256`);
  }
  mapUnique(policy.approvedStagingOnlyRoutineGrants, routineGrantKey, "approvedStagingOnlyRoutineGrants");
  mapUnique(policy.approvedProductionOnlyRoutineGrants, routineGrantKey, "approvedProductionOnlyRoutineGrants");
}

function exactRoutineSet(structural, environment, policy) {
  const legacy = new Set(environment === "staging" ? policy.allowedStagingOnlyRoutines || [] : policy.allowedProductionOnlyRoutines || []);
  const field = environment === "staging" ? "approvedStagingOnlyRoutines" : "approvedProductionOnlyRoutines";
  const exact = mapUnique(policy[field], (e) => e.signature, field);
  for (const row of structural.routines || []) {
    const entry = exact.get(routineKey(row));
    if (entry?.sha256 === row.definitionSha256) legacy.add(routineKey(row));
  }
  return legacy;
}

export function normalizeEvidence(raw, environment, policy) {
  const evidence = clone(raw);
  const allowedTables = new Set(policy.allowedStagingOnlyTables || []);
  const structural = evidence.structural || {};
  const allowedRoutines = exactRoutineSet(structural, environment, policy);
  const drift = mapUnique(policy.approvedRoutineDefinitionDrift, (e) => e.signature, "approvedRoutineDefinitionDrift");
  const grantField = environment === "staging" ? "approvedStagingOnlyRoutineGrants" : "approvedProductionOnlyRoutineGrants";
  const grants = mapUnique(policy[grantField], routineGrantKey, grantField);

  structural.relations = (structural.relations || []).filter((r) => !allowedTables.has(`${r.schema}.${r.name}`));
  structural.columns = (structural.columns || []).filter((r) => !allowedTables.has(`${r.schema}.${r.table}`));
  structural.constraints = (structural.constraints || []).filter((r) => !allowedTables.has(`${r.schema}.${r.table}`));
  structural.indexes = (structural.indexes || []).filter((r) => !allowedTables.has(`${r.schema}.${r.table}`));
  structural.triggers = (structural.triggers || []).filter((r) => !allowedTables.has(`${r.schema}.${r.table}`));
  structural.routines = (structural.routines || []).filter((r) => !allowedRoutines.has(routineKey(r))).map((row) => {
    const approval = drift.get(routineKey(row));
    if (!approval) return row;
    const expected = environment === "staging" ? approval.stagingSha256 : approval.productionSha256;
    return row.definitionSha256 === expected ? { ...row, definitionSha256:`approved-drift:${routineKey(row)}` } : row;
  });

  const auth = evidence.authorization || {};
  auth.relationOwners = (auth.relationOwners || []).filter((r) => !allowedTables.has(`${r.schema}.${r.relation}`));
  auth.rowSecurity = (auth.rowSecurity || []).filter((r) => !allowedTables.has(`${r.schema}.${r.relation}`));
  auth.policies = (auth.policies || []).filter((r) => !allowedTables.has(`${r.schema}.${r.table}`));
  auth.tableGrants = (auth.tableGrants || []).filter((r) => !allowedTables.has(`${r.schema}.${r.table}`));
  auth.routineOwners = (auth.routineOwners || []).filter((r) => !allowedRoutines.has(routineKey(r)));
  auth.routineGrants = (auth.routineGrants || []).filter((row) => {
    if (allowedRoutines.has(routineKey(row))) return false;
    const approval = grants.get(routineGrantKey(row));
    return !approval || stable(approval) !== stable(row);
  });
  return evidence;
}
