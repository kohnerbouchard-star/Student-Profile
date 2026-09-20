import assert from "node:assert/strict";
import test from "node:test";
import { assertImmutable, classify, digest } from "./phase15-audit.mjs";

const baseline = [{ version: "20260101000000", name: "one", sha256: "a" }];
test("a renamed historical migration remains unknown without effect proof", () => {
  const result = classify(baseline, [{ version: "20260102000000", name: "one" }]);
  assert.equal(result.counts.UNKNOWN, 1);
  assert.equal(result.counts.LIVE_ONLY, 1);
  assert.equal(result.counts.EQUIVALENT_RECONCILED, 0);
});
test("same-version name conflict blocks identity equivalence", () => {
  assert.equal(classify(baseline, [{ version: "20260101000000", name: "different" }]).counts.CONFLICT, 1);
});
test("missing migration is a pending candidate, never automatically equivalent", () => {
  const result = classify(baseline, []);
  assert.equal(result.counts.REPO_PENDING, 1);
  assert.match(result.rows[0].effectReview, /not permission/);
});
test("duplicate live versions fail closed", () => {
  assert.throws(() => classify(baseline, [baseline[0], baseline[0]]), /INVALID_LIVE/);
});
test("historical edits, renames and removals fail closed", () => {
  for (const rows of [[], [{ ...baseline[0], sha256: "changed" }], [{ ...baseline[0], name: "renamed" }]]) {
    assert.throws(() => assertImmutable(baseline, rows), /IMMUTABLE/);
  }
});
test("new migrations must sort after the frozen chain", () => {
  assert.throws(() => assertImmutable(baseline, [...baseline, { version: "20251201000000", name: "early", sha256: "b" }]), /NOT_FORWARD/);
  assert.doesNotThrow(() => assertImmutable(baseline, [...baseline, { version: "20260102000000", name: "later", sha256: "b" }]));
});
test("object-key order does not affect a canonical digest; array order does", () => {
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
  assert.notEqual(digest([1, 2]), digest([2, 1]));
});
