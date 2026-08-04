import assert from "node:assert/strict";
import test from "node:test";
import {
  compareBoundaryWithBaseline,
  extractClassroomDispatchSites,
} from "./lib/api-boundary-inventory.mjs";

test("dispatch discovery accepts trailing commas and ignores function declarations", () => {
  const findings = extractClassroomDispatchSites({
    "classroom/index.ts": `
      const route = readExampleRoutePath(
        url.pathname,
      );
      await dispatchClassroomMessagingRequest(request, dependencies);
      export async function dispatchClassroomMessagingRequest(
        request: Request,
      ) { return request; }
    `,
  });
  assert.deepEqual(findings.map(({ key, count }) => ({ key, count })), [
    { key: "dispatcher:dispatchClassroomMessagingRequest", count: 1 },
    { key: "parser:readExampleRoutePath", count: 1 },
  ]);
});

test("growth ratchet rejects unknown findings and count increases", () => {
  const ledger = fixtureLedger(1);
  const findings = [
    finding("marker|admin/a.js", 2),
    finding("marker|admin/new.js", 1),
  ];
  const violations = compareBoundaryWithBaseline(ledger, findings);
  assert.ok(violations.some((value) => value.includes("increased to 2")));
  assert.ok(violations.some((value) => value.includes("unknown compatibility")));
});

test("growth ratchet rejects allowance growth and scan-scope changes", () => {
  const base = fixtureLedger(1);
  const candidate = fixtureLedger(2);
  candidate.dependencyMatchers[0].scan = { roots: ["admin/subtree"] };
  const violations = compareBoundaryWithBaseline(candidate, [], base, []);
  assert.ok(violations.some((value) => value.includes("scan root removed")));
  assert.ok(violations.some((value) => value.includes("allowance increased")));
});

test("growth ratchet rejects weakened ownership and deleted route history", () => {
  const base = fixtureLedger(1);
  base.dependencies[0].retirementBlocking = true;
  base.routeFamilies = [{
    routeKey: "player.example",
    surface: "player-compatibility",
  }];
  const candidate = fixtureLedger(1);
  candidate.dependencies[0].retirementBlocking = false;
  const violations = compareBoundaryWithBaseline(candidate, [], base, []);
  assert.ok(violations.some((value) => value.includes("retirementBlocking was weakened")));
  assert.ok(violations.some((value) => value.includes("route history removed")));
});

test("growth ratchet permits compatibility reductions", () => {
  const base = fixtureLedger(2);
  const candidate = fixtureLedger(1);
  assert.deepEqual(
    compareBoundaryWithBaseline(candidate, [finding("marker|admin/a.js", 1)], base),
    [],
  );
});

test("growth ratchet requires a reduced count to update its declaration", () => {
  const base = fixtureLedger(2);
  const candidate = fixtureLedger(2);
  const violations = compareBoundaryWithBaseline(
    candidate,
    [finding("marker|admin/a.js", 1)],
    base,
  );
  assert.ok(violations.some((value) => value.includes("declared count must ratchet down")));
});

test("growth ratchet preserves Classroom dispatch discovery scope", () => {
  const base = fixtureLedger(0);
  base.classroomDispatch = { sourcePaths: ["classroom/messagingDispatch.ts"] };
  const candidate = structuredClone(base);
  candidate.classroomDispatch.sourcePaths = [];

  const violations = compareBoundaryWithBaseline(candidate, [], base);
  assert.ok(violations.some((value) => value.includes("dispatch source path removed")));
});

test("growth ratchet freezes historical route method and path identity", () => {
  const base = fixtureLedger(0);
  base.routeFamilies = [{
    routeKey: "player.example",
    surface: "player-compatibility",
    methods: ["GET"],
    publicPath: "/players/me/example",
  }];
  const candidate = structuredClone(base);
  candidate.routeFamilies[0].methods = ["POST"];
  candidate.routeFamilies[0].publicPath = "/players/me/new-example";

  const violations = compareBoundaryWithBaseline(candidate, [], base);
  assert.ok(violations.some((value) => value.includes("route identity changed")));
});

test("growth ratchet freezes parser source while its Classroom dispatch is active", () => {
  const dispatchKey = "classroom-dispatch|classroom/index.ts|parser:readExampleRoutePath";
  const base = fixtureLedger(1);
  base.routeSourceFingerprints = [{
    path: "domain/exampleRoutePaths.ts",
    sha256: "a".repeat(64),
    dispatchKeys: [dispatchKey],
  }];
  const candidate = structuredClone(base);
  candidate.routeSourceFingerprints[0].sha256 = "b".repeat(64);
  const violations = compareBoundaryWithBaseline(candidate, [{
    key: dispatchKey,
    matcherId: "classroom-dispatch",
    path: "classroom/index.ts",
    count: 1,
  }], base);
  assert.ok(violations.some((value) => value.includes("active route source changed")));
});

test("growth ratchet preserves active fingerprint dispatch ownership", () => {
  const dispatchKey = "classroom-dispatch|classroom/index.ts|parser:readExampleRoutePath";
  const base = fixtureLedger(0);
  base.routeSourceFingerprints = [{
    path: "domain/exampleRoutePaths.ts",
    sha256: "a".repeat(64),
    dispatchKeys: ["*", dispatchKey],
  }];
  const candidate = structuredClone(base);
  candidate.routeSourceFingerprints[0].dispatchKeys = [dispatchKey];

  const violations = compareBoundaryWithBaseline(candidate, [{
    key: dispatchKey,
    matcherId: "classroom-dispatch",
    path: "classroom/index.ts",
    count: 1,
  }], base);
  assert.ok(
    violations.some((value) => value.includes("active route source dispatch key removed")),
  );
});

function fixtureLedger(maxOccurrences) {
  return {
    dependencyMatchers: [{
      id: "marker",
      kind: "literal",
      pattern: "classroom-api",
      scan: { roots: ["admin"] },
    }],
    dependencies: [{
      key: "marker|admin/a.js",
      matcherId: "marker",
      maxOccurrences,
      retirementBlocking: false,
    }],
  };
}

function finding(key, count) {
  return { key, count, path: key.split("|")[1], matcherId: "marker" };
}
