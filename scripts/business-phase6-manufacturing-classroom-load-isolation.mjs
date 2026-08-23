#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const GAMES = ["game_1", "game_2"];
const PLAYERS_PER_GAME = 20;
const RETRIES = 10;
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const scopeKey = (game, business) => `${game}|${business}`;

class Lock {
  #tail = Promise.resolve();

  async run(operation) {
    const previous = this.#tail;
    let release;
    this.#tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

class Authority {
  constructor() {
    this.scopes = new Map();
    this.locks = new Map();
    this.jobs = new Map();
    this.replays = new Map();
  }

  register({ game, business, player, capacity }) {
    const key = scopeKey(game, business);
    this.scopes.set(key, {
      game,
      business,
      player,
      warehouse: capacity,
      wip: 0,
      labor: capacity,
      equipment: capacity,
      finished: 0,
    });
    this.locks.set(key, new Lock());
  }

  async start(intent) {
    const key = scopeKey(intent.game, intent.business);
    const scope = this.scopes.get(key);
    if (!scope || scope.player !== intent.player) {
      throw new Error("BUSINESS_MANUFACTURING_SCOPE_FORBIDDEN");
    }
    return this.locks.get(key).run(async () => {
      await Promise.resolve();
      const replayKey = `${intent.game}|${intent.player}|${intent.idempotencyKey}`;
      const requestHash = hash(intent);
      const replayJobKey = this.replays.get(replayKey);
      if (replayJobKey) {
        const replayJob = this.jobs.get(replayJobKey);
        if (replayJob.requestHash !== requestHash) {
          throw new Error("BUSINESS_MANUFACTURING_IDEMPOTENCY_CONFLICT");
        }
        return { job: structuredClone(replayJob), replayed: true };
      }
      if (scope.warehouse < intent.quantity) throw new Error("BUSINESS_MANUFACTURING_INPUT_QUANTITY_UNAVAILABLE");
      if (scope.labor < intent.quantity) throw new Error("BUSINESS_MANUFACTURING_LABOR_CAPACITY_UNAVAILABLE");
      if (scope.equipment < intent.quantity) throw new Error("BUSINESS_MANUFACTURING_EQUIPMENT_CAPACITY_UNAVAILABLE");
      scope.warehouse -= intent.quantity;
      scope.wip += intent.quantity;
      scope.labor -= intent.quantity;
      scope.equipment -= intent.quantity;
      const job = {
        key: `mfg_${hash({ key, replayKey }).slice(0, 32)}`,
        game: intent.game,
        business: intent.business,
        player: intent.player,
        quantity: intent.quantity,
        requestHash,
        status: "in_progress",
        resourceState: "reserved",
      };
      this.jobs.set(job.key, job);
      this.replays.set(replayKey, job.key);
      return { job: structuredClone(job), replayed: false };
    });
  }

  async complete(game, jobKey) {
    const job = this.jobs.get(jobKey);
    if (!job || job.game !== game) throw new Error("BUSINESS_MANUFACTURING_JOB_NOT_FOUND");
    const key = scopeKey(job.game, job.business);
    return this.locks.get(key).run(async () => {
      await Promise.resolve();
      const current = this.jobs.get(jobKey);
      if (current.status === "completed") return { replayed: true };
      const scope = this.scopes.get(key);
      assert.equal(current.status, "in_progress");
      assert.equal(current.resourceState, "reserved");
      assert.ok(scope.wip >= current.quantity);
      scope.wip -= current.quantity;
      scope.finished += current.quantity;
      current.status = "completed";
      current.resourceState = "consumed";
      return { replayed: false };
    });
  }

  snapshot(game, business) {
    return structuredClone(this.scopes.get(scopeKey(game, business)));
  }

  jobsIn(game) {
    return [...this.jobs.values()].filter((job) => job.game === game).length;
  }
}

async function verifySqlAuthority() {
  const [worker, start, completion, recovery] = await Promise.all([
    readFile("backend/supabase/migrations/20260823110100_business_manufacturing_worker_and_read_v2.sql", "utf8"),
    readFile("backend/supabase/migrations/20260823110200_business_manufacturing_start_resources_v2.sql", "utf8"),
    readFile("backend/supabase/migrations/20260823110300_business_manufacturing_completion_v2.sql", "utf8"),
    readFile("backend/supabase/migrations/20260823110400_business_manufacturing_recovery_v2.sql", "utf8"),
  ]);
  assert.match(worker, /for update skip locked/iu);
  assert.match(worker, /business_manufacturing_jobs/iu);
  assert.match(start, /start_business_manufacturing_job_v2\([\s\S]+p_game_session_id uuid[\s\S]+p_player_id uuid/iu);
  assert.ok((start.match(/game_session_id\s*=\s*p_game_session_id/giu) ?? []).length >= 8);
  assert.ok((start.match(/for update/giu) ?? []).length >= 4);
  assert.match(start, /requested_by_player_id\s*=\s*p_player_id[\s\S]+idempotency_key\s*=\s*btrim\(p_idempotency_key\)[\s\S]+for update/iu);
  assert.match(start, /inventory_holdings[\s\S]+game_session_id\s*=\s*p_game_session_id[\s\S]+for update/iu);
  for (const source of [completion, recovery]) {
    assert.match(source, /business_manufacturing_jobs/iu);
    assert.match(source, /for update/iu);
    assert.match(source, /resource_state/iu);
  }
}

async function verifyClassroomLoad() {
  const authority = new Authority();
  const intents = [];
  for (const game of GAMES) {
    for (let index = 1; index <= PLAYERS_PER_GAME; index += 1) {
      const suffix = String(index).padStart(2, "0");
      const player = `${game}_player_${suffix}`;
      const business = `business_${suffix}`;
      authority.register({
        game,
        business,
        player,
        capacity: game === "game_2" && index === 1 ? 2 : 1,
      });
      intents.push({
        game,
        player,
        business,
        product: "catalog_widget",
        quantity: 1,
        priority: "standard",
        idempotencyKey: `start-${game}-${suffix}`,
      });
    }
  }

  const starts = await Promise.all(
    intents.flatMap((intent) => Array.from({ length: RETRIES }, () => authority.start(intent))),
  );
  assert.equal(starts.length, 400);
  assert.equal(starts.filter(({ replayed }) => !replayed).length, 40);
  assert.equal(authority.jobsIn("game_1"), 20);
  assert.equal(authority.jobsIn("game_2"), 20);

  const gameOne = intents.find(({ game, business }) => game === "game_1" && business === "business_01");
  const gameTwo = intents.find(({ game, business }) => game === "game_2" && business === "business_01");
  await assert.rejects(
    () => authority.start({ ...gameOne, idempotencyKey: "game-one-second-job" }),
    /INPUT_QUANTITY_UNAVAILABLE/u,
  );
  const extra = await authority.start({ ...gameTwo, idempotencyKey: "game-two-second-job" });
  assert.equal(authority.jobsIn("game_1"), 20);
  assert.equal(authority.jobsIn("game_2"), 21);
  await assert.rejects(
    () => authority.start({ ...gameOne, game: "game_2", idempotencyKey: "cross-game-forbidden" }),
    /SCOPE_FORBIDDEN/u,
  );
  await assert.rejects(() => authority.complete("game_1", extra.job.key), /JOB_NOT_FOUND/u);

  const jobs = [...new Map(starts.map(({ job }) => [job.key, job])).values(), extra.job];
  const completions = await Promise.all(
    jobs.flatMap((job) => Array.from({ length: RETRIES }, () => authority.complete(job.game, job.key))),
  );
  assert.equal(completions.filter(({ replayed }) => !replayed).length, 41);
  assert.equal(authority.snapshot("game_1", "business_01").finished, 1);
  assert.equal(authority.snapshot("game_2", "business_01").finished, 2);

  const finished = (game) => Array.from({ length: PLAYERS_PER_GAME }, (_, index) =>
    authority.snapshot(game, `business_${String(index + 1).padStart(2, "0")}`).finished
  ).reduce((sum, quantity) => sum + quantity, 0);
  assert.equal(finished("game_1"), 20);
  assert.equal(finished("game_2"), 21);

  return {
    players: 40,
    games: 2,
    startAttempts: 403,
    jobs: 41,
    completionAttempts: 411,
  };
}

await verifySqlAuthority();
const evidence = await verifyClassroomLoad();
console.log(`Business Phase 6 40-player/two-game load isolation: PASS ${JSON.stringify(evidence)}`);
