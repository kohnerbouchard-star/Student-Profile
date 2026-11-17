import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditPlayerWritePolicies, POLICY_PATH } from "./player-write-policy-ratchet.mjs";
import { PLAYER_ENDPOINTS } from "../../player-terminal/src/api/endpoints.js";
import { IDEMPOTENT_WRITE_ENDPOINTS, WRITE_INVALIDATIONS } from "../../player-terminal/src/api/resource-plan.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const evidence = "docs/operations/evidence/example/review.md";
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "econ-write-ratchet-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.dirname(path.join(root, evidence)), { recursive: true }); writeFileSync(path.join(root, evidence), "review evidence\n");
  const endpoints = { read: { method: "GET", path: "/read" }, write: { method: "POST", path: "/write" } };
  const invalidations = { write: ["read"] };
  const idempotent = new Set(["write"]);
  const policy = { schemaVersion: 1, exceptions: [] };
  return { root, endpoints, invalidations, idempotent, policy, audit: () => auditPlayerWritePolicies({ root, endpoints, invalidations, idempotent, policy }) };
}
function exception(endpoint = "write", missing = ["idempotency", "invalidations"]) {
  return { endpoint, method: "POST", path: "/write", missing, owner: "Player", reason: "Known scoped debt", reviewEvidence: evidence, removalCondition: "Complete policy" };
}

test("actual endpoint baseline matches its exact documented exceptions", () => {
  const policy = JSON.parse(readFileSync(path.join(repo, POLICY_PATH), "utf8"));
  const result = auditPlayerWritePolicies({ root: repo, endpoints: PLAYER_ENDPOINTS, invalidations: WRITE_INVALIDATIONS, idempotent: IDEMPOTENT_WRITE_ENDPOINTS, policy });
  assert.deepEqual(result.failures, []);
});

test("a complete write policy passes and a newly added unregistered write fails", (t) => {
  const f = fixture(t); assert.deepEqual(f.audit().failures, []);
  f.endpoints.newWrite = { method: "POST", path: "/new" };
  assert.match(f.audit().failures.join("\n"), /newWrite lacks idempotency and invalidations/);
});

test("an existing missing-policy exception cannot hide growth or endpoint rename", (t) => {
  const f = fixture(t); delete f.invalidations.write; f.policy.exceptions = [exception("write", ["invalidations"])];
  assert.deepEqual(f.audit().failures, []);
  f.idempotent.delete("write"); assert.match(f.audit().failures.join("\n"), /does not match current missing policy/);
  f.idempotent.add("write");
  f.endpoints.write.path = "/different"; assert.match(f.audit().failures.join("\n"), /reviewed method and path/);
  f.endpoints.write.path = "/write"; f.endpoints.write.method = "PATCH"; assert.match(f.audit().failures.join("\n"), /reviewed method and path/);
  f.endpoints.write.method = "POST"; delete f.endpoints.write; f.endpoints.renamed = { method: "POST", path: "/write" };
  assert.match(f.audit().failures.join("\n"), /Stale Player write-policy exception: write/);
  assert.match(f.audit().failures.join("\n"), /renamed lacks idempotency and invalidations/);
});

test("legitimate improvements pass when the exact exception is narrowed or removed", (t) => {
  const f = fixture(t); delete f.invalidations.write; f.idempotent.delete("write"); f.policy.exceptions = [exception()];
  assert.deepEqual(f.audit().failures, []);
  f.idempotent.add("write"); assert.match(f.audit().failures.join("\n"), /remove or narrow/);
  f.policy.exceptions[0].missing = ["invalidations"]; assert.deepEqual(f.audit().failures, []);
  f.invalidations.write = ["read"]; assert.match(f.audit().failures.join("\n"), /remove or narrow/);
  f.policy.exceptions = []; assert.deepEqual(f.audit().failures, []);
});

test("orphan policies, invalid resources, duplicates and invalid methods fail closed", (t) => {
  const f = fixture(t); f.invalidations.write = ["read", "read"];
  assert.match(f.audit().failures.join("\n"), /Invalid or duplicate invalidation resources/);
  f.invalidations.write = ["missing"]; assert.match(f.audit().failures.join("\n"), /Invalid or duplicate invalidation resources/);
  f.invalidations.write = ["read"]; f.idempotent.add("unknown"); assert.match(f.audit().failures.join("\n"), /no write endpoint: unknown/);
  f.idempotent.delete("unknown"); f.endpoints.write.method = "POTS"; assert.match(f.audit().failures.join("\n"), /invalid method or path/);
});

test("exceptions require bounded kinds, exact names, owner, reason, evidence and removal condition", (t) => {
  const f = fixture(t); delete f.invalidations.write; f.idempotent.delete("write");
  for (const bad of [
    { ...exception(), endpoint: "*" }, { ...exception(), method: "GET" }, { ...exception(), path: "" }, { ...exception(), missing: ["all"] },
    { ...exception(), missing: ["idempotency", "idempotency"] }, { ...exception(), owner: "" },
    { ...exception(), reviewEvidence: "docs/operations/evidence/no-file.md" },
    { ...exception(), removalCondition: "" },
  ]) { f.policy.exceptions = [bad]; assert.throws(() => f.audit()); }
  f.policy.exceptions = [exception(), exception()]; assert.throws(() => f.audit(), /duplicate/);
});
