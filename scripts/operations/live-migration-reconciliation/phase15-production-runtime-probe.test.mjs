import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evidenceHasSensitiveMaterial,
  moneyToCents,
  sanitize,
  validateBindings,
} from "./phase15-production-runtime-probe.mjs";

const SOURCE = "a".repeat(40);
const PRODUCTION = "cgiukdjwicykrmtkhudh";

test("production bindings reject staging, noncanonical origins, and unbound databases", () => {
  assert.equal(validateBindings({
    databaseUrl: `postgresql://postgres.${PRODUCTION}:secret@aws-0.pooler.supabase.com:6543/postgres`,
    origin: "https://www.econovaria.com",
    projectRef: PRODUCTION,
    sourceCommit: SOURCE,
  }), true);
  assert.throws(() => validateBindings({
    databaseUrl: "postgresql://postgres.eecvbssdvarfcykcfrny:secret@aws-0.pooler.supabase.com:6543/postgres",
    origin: "https://www.econovaria.com",
    projectRef: PRODUCTION,
    sourceCommit: SOURCE,
  }), /not bound|denied/u);
  assert.throws(() => validateBindings({
    databaseUrl: `postgresql://postgres.${PRODUCTION}:secret@aws-0.pooler.supabase.com:6543/postgres`,
    origin: "https://econovaria.com",
    projectRef: PRODUCTION,
    sourceCommit: SOURCE,
  }), /origin/u);
});

test("money comparison preserves exact cents", () => {
  assert.equal(moneyToCents("123.45"), 12345n);
  assert.equal(moneyToCents("0.1"), 10n);
  assert.equal(moneyToCents("-2.00"), -200n);
  assert.throws(() => moneyToCents("0.001"), /Invalid exact money/u);
});

test("sanitization removes credentials, cookies, database URLs, join codes, and UUIDs", () => {
  const unsafe = [
    "PHASE15-PROBE-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "ECO-AMBER-BEACON-123",
    "__Host-econovaria_player_session=v1.abcdefghijklmnop.abcdefghijklmnopqrstuvwx",
    "postgresql://user:secret@db.example/postgres",
    "00000000-0000-4000-8000-000000000001",
    "PHASE15-RUNTIME-PROBE",
  ].join(" ");
  const safe = sanitize(unsafe);
  assert.equal(evidenceHasSensitiveMaterial(safe), false);
});

test("runtime probe is canonical-API based and contains no direct economic data edits", async () => {
  const source = await readFile(new URL("./phase15-production-runtime-probe.mjs", import.meta.url), "utf8");
  for (const marker of [
    '"/api/player-session/login"',
    '"/api/player-session/status"',
    '"/api/player-session/logout"',
    '"/api/player/players/me/banking/savings/transfers"',
    '"/api/player/players/me/arrival-class"',
    "exactReplayRecognized",
    "balancesRestored",
    "transition_game_lifecycle_atomic_v1",
    "data_purge_protected = true",
  ]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.doesNotMatch(source, /update\s+public\.(?:account_balances|ledger_entries|inventory_holdings|stock_holdings)/iu);
  assert.doesNotMatch(source, /delete\s+from\s+public\.game_sessions/iu);
});

test("fixture contract denies real-user access, lingering access, and direct economic mutation", async () => {
  const contract = JSON.parse(await readFile(
    new URL("../../../docs/operations/contracts/phase15-production-runtime-fixture-v1.json", import.meta.url),
    "utf8",
  ));
  assert.equal(contract.projectRef, PRODUCTION);
  assert.equal(contract.fixture.maximumPlayers, 1);
  assert.equal(contract.fixture.realUserDataPermitted, false);
  assert.equal(contract.fixture.credentialPersistencePermitted, false);
  assert.equal(contract.fixture.joinableOutsideProbePermitted, false);
  assert.equal(contract.fixture.activeOutsideProbePermitted, false);
  assert.equal(contract.directEconomicMutationPermitted, false);
  assert.deepEqual(contract.containment, {
    revokeAllFixtureSessions: true,
    revokeAllFixtureCredentials: true,
    clearFixtureJoinCode: true,
    pauseFixture: true,
    retainOnlySyntheticFixtureHistory: true,
  });
});
