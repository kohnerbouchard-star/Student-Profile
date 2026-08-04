import assert from "node:assert/strict";
import test from "node:test";
import { validateApiRouteOwnershipLedger } from "./api-route-ownership-contract.mjs";

const authLedger = { boundaries: [{ id: "classroom-api-compatibility" }] };

test("route ownership validator rejects duplicate routes and unknown auth boundaries", () => {
  const ledger = fixtureLedger();
  ledger.routeFamilies.push({ ...ledger.routeFamilies[0], routeKey: "duplicate" });
  ledger.routeFamilies[0].authBoundaryId = "missing";
  const violations = validateApiRouteOwnershipLedger(ledger, authLedger);
  assert.ok(violations.some((value) => value.includes("duplicate method/path")));
  assert.ok(violations.some((value) => value.includes("unknown authBoundaryId")));
});

test("route ownership validator accepts a complete resolved route", () => {
  assert.deepEqual(validateApiRouteOwnershipLedger(fixtureLedger(), authLedger), []);
});

test("route ownership validator rejects empty security and verification fields", () => {
  const ledger = fixtureLedger();
  ledger.routeFamilies[0].authorization = {};
  ledger.routeFamilies[0].tests = [];
  const violations = validateApiRouteOwnershipLedger(ledger, authLedger);
  assert.ok(violations.some((value) => value.includes("empty authorization")));
  assert.ok(violations.some((value) => value.includes("empty tests")));
});

function fixtureLedger() {
  return {
    schemaVersion: "econovaria.api-route-ownership.v1",
    status: "inventory_seed",
    knownLimitations: ["fixture remains a non-normative inventory seed"],
    auditedSourceSha: "a".repeat(40),
    surfaceDefaults: {},
    dependencyMatchers: [{
      id: "marker",
      kind: "literal",
      pattern: "classroom-api",
      scan: { roots: ["admin"] },
    }],
    dependencyDefaults: {
      marker: {
        category: "classroom-http-call",
        justification: "fixture",
        removalWorkstream: "fixture",
        retirementBlocking: true,
        referenceClass: "current-runtime",
      },
    },
    dependencies: [{
      key: "marker|admin/example.js",
      matcherId: "marker",
      path: "admin/example.js",
      maxOccurrences: 1,
    }],
    routeFamilies: [{
      routeKey: "player.example",
      surface: "player-compatibility",
      methods: ["GET"],
      publicPath: "/players/me/example",
      current: { handler: { path: "domain/example.ts", symbol: "handleExample" } },
      domainOwner: "example",
      authBoundaryId: "classroom-api-compatibility",
      authorization: {
        principal: "opaque Player session",
        gameScope: "server-derived",
        ownership: "server-derived",
      },
      operation: "read",
      idempotency: { requirement: "none for read" },
      rateLimitKey: "example",
      compatibility: { service: "classroom-api", path: "/players/me/example" },
      canonicalTarget: { applicationApi: "player-api", handler: "handleExample" },
      migrationState: "compatibility",
      removalGates: ["example compatibility traffic reaches zero"],
      tests: ["domain/example.test.ts"],
      discoveryMatchers: ["fixture matcher"],
    }],
  };
}
