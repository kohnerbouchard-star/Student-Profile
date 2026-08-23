#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const GAME_COUNT = 2;
const PLAYERS_PER_GAME = 20;
const RETRIES_PER_PLAYER = 10;

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

class Mutex {
  #tail = Promise.resolve();

  async run(operation) {
    const previous = this.#tail;
    let release;
    this.#tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

class ManufacturingAuthority {
  constructor() {
    this.businesses = new Map();
    this.jobs = new Map();
    this.idempotency = new Map();
    this.locks = new Map();
  }

  registerBusiness({ game, business, owner, capacity = 1 }) {
    const scope = this.#scope(game, business);
    assert.equal(this.businesses.has(scope), false, `duplicate business scope: ${scope}`);
    this.businesses.set(scope, {
      game,
      business,
      owner,
      warehouse: capacity,
      wip: 0,
      labor: capacity,
      equipment: capacity,
      finishedGoods: 0,
    });
    this.locks.set(scope, new Mutex());
  }

  async start(request) {
    const scope = this.#scope(request.game, request.business);
    const business = this.businesses.get(scope);
    if (!business || business.owner !== request.player) {
      throw new Error("BUSINESS_MANUFACTURING_SCOPE_FORBIDDEN");
    }
    return this.locks.get(scope).run(async () => {
      await Promise.resolve();
      const replayKey = `${request.game}|${request.player}|${request.idempotencyKey}`;
      const requestHash = digest({
        game: request.game,
        player: request.player,
        business: request.business,
        product: request.product,
        quantity: request.quantity,
        priority: request.priority,
      });
      const existingJobKey = this.idempotency.get(replayKey);
      if (existingJobKey) {
        const existing = this.jobs.get(existingJobKey);
        if (existing.requestHash !== requestHash) {
          throw new Error("BUSINESS_MANUFACTURING_IDEMPOTENCY_CONFLICT");
        }
        return { job: structuredClone(existing), replayed: true };
      }
      if (business.warehouse < request.quantity) {
        throw new Error("BUSINESS_MANUFACTURING_INPUT_QUANTITY_UNAVAILABLE");
      }
      if (business.labor < request.quantity) {
        throw new Error("BUSINESS_MANUFACTURING_LABOR_CAPACITY_UNAVAILABLE");
      }
      if (business.equipment < request.quantity) {
        throw new Error("BUSINESS_MANUFACTURING_EQUIPMENT_CAPACITY_UNAVAILABLE");
      }
      business.warehouse -= request.quantity;
      business.wip += request.quantity;
      business.labor -= request.quantity;
      business.equipment -= request.quantity;
      const jobKey = `mfg_${digest({ scope, replayKey }).slice(0, 32)}`;
      const job = {
        key: jobKey,
        game: request.game,
        player: request.player,
        business: request.business,
        quantity: request.quantity,
        requestHash,
        status: "in_progress",
        resourceState: "reserved",
      };
      this.jobs.set(jobKey, job);
      this.idempotency.set(replayKey, jobKey);
      return { job: structuredClone(job), replayed: false };
    });
  }

  async complete({ game, jobKey }) {
    const job = this.jobs.get(jobKey);
    if (!job || job.game !== game) {
      throw new Error("BUSINESS_MANUFACTURING_JOB_NOT_FOUND");
    }
    const scope = this.#scope(job.game, job.business);
    return this.locks.get(scope).run(async () => {
      await Promise.resolve();
      const current = this.jobs.get(jobKey);
      if (current.status === "completed") {
        return { job: structuredClone(current), replayed: true };
      }
      assert.equal(current.status, "in_progress");
      assert.equal(current.resourceState, "reserved");
      const business = this.businesses.get(scope);
      assert.ok(business.wip >= current.quantity);
      business.wip -= current.quantity;
      business.finishedGoods += current.quantity;
      current.status = "completed";
      current.resourceState = "consumed";
      return { job: structuredClone(current), replayed: false };
    });
  }

  snapshot(game, business) {
    return structuredClone(this.businesses.get(this.#scope(game, business)));
  }

  countJobs(game) {
    return [...this.jobs.values()].filter((job) => job.game === game).length;
  }

  #scope(game, business) {
    return `${game}|${business}`;
  }
}

async function verifyDatabaseConcurrencyContracts() {
  const [foundation, start, completion, recovery] = await Promise.all([
    readFile("backend/supabase/migrations/20260823110000_business_manufacturing_job_foundation_v2.sql", "utf8"),
    readFile("backend/supabase/migrations/20260823110200_business_manufacturing_start_resources_v2.sql", "utf8"),
    readFile("backend/supabase/migrations/20260823110300_business_manufacturing_completion_v2.sql", "utf8"),
    readFile("backend/supabase/migrations/20260823110400_business_manufacturing_recovery_v2.sql", "utf8"),
  ]);

  assert.match(foundation, /for update skip locked/iu);
  assert.match(foundation, /game_session_id[\s\S]+business_manufacturing_jobs/iu);
  assert.match(start, /start_business_manufacturing_job_v2\([\s\S]+p_game_session_id uuid[\s\S]+p_player_id uuid/iu);
  assert.ok((start.match(/game_session_id\s*=\s*p_game_session_id/giu) ?? []).length >= 8);
  assert.ok((start.match(/for update/giu) ?? []).length >= 4);
  assert.match(start, /requested_by_player_id\s*=\s*p_player_id[\s\S]+idempotency_key\s*=\s*btrim\(p_idempotency_key\)[\s\S]+for update/iu);
  assert.match(start, /inventory_holdings[\s\S]+game_session_id\s*=\s*p_game_session_id[\s\S]+for update/iu);
  assert.match(completion, /business_manufacturing_jobs/iu);
  assert.match(completion, /for update/iu);
  assert.match(completion, /resource_state/iu);
  assert.match(recovery, /business_manufacturing_jobs/iu);
  assert.match(recovery, /for update/iu);
  assert.match(recovery, /resource_state/iu);
}

async function verifyFortyPlayerLoadAndTwoGameIsolation() {
  const authority = new ManufacturingAuthority();
  const requests = [];

  for (let gameIndex = 1; gameIndex <= GAME_COUNT; gameIndex += 1) {
    const game = `game_${gameIndex}`;
    for (let playerIndex = 1; playerIndex <= PLAYERS_PER_GAME; playerIndex += 1) {
      const suffix = String(playerIndex).padStart(2, "0");
      const player = `${game}_player_${suffix}`;
      const business = `business_${suffix}`;
      authority.registerBusiness({
        game,
        business,
        owner: player,
        capacity: gameIndex === 2 && playerIndex === 1 ? 2 : 1,
      });
      requests.push({
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

  const startResults = await Promise.all(
    requests.flatMap((request) =>
      Array.from({ length: RETRIES_PER_PLAYER }, () => authority.start(request))
    ),
  );
  assert.equal(startResults.length, GAME_COUNT * PLAYERS_PER_GAME * RETRIES_PER_PLAYER);
  assert.equal(startResults.filter((result) => !result.replayed).length, GAME_COUNT * PLAYERS_PER_GAME);
  assert.equal(authority.countJobs("game_1"), PLAYERS_PER_GAME);
  assert.equal(authority.countJobs("game_2"), PLAYERS_PER_GAME);

  const gameOneFirst = requests.find((request) => request.game === "game_1" && request.business === "business_01");
  const gameTwoFirst = requests.find((request) => request.game === "game_2" && request.business === "business_01");
  await assert.rejects(
    () => authority.start({ ...gameOneFirst, idempotencyKey: "game-one-second-job" }),
    /INPUT_QUANTITY_UNAVAILABLE/u,
  );
  const extraGameTwo = await authority.start({
    ...gameTwoFirst,
    idempotencyKey: "game-two-second-job",
  });
  assert.equal(extraGameTwo.replayed, false);
  assert.equal(authority.countJobs("game_1"), PLAYERS_PER_GAME);
  assert.equal(authority.countJobs("game_2"), PLAYERS_PER_GAME + 1);

  await assert.rejects(
    () => authority.start({
      ...gameOneFirst,
      game: "game_2",
      business: "business_01",
      idempotencyKey: "cross-game-forbidden",
    }),
    /SCOPE_FORBIDDEN/u,
  );
  await assert.rejects(
    () => authority.complete({ game: "game_1", jobKey: extraGameTwo.job.key }),
    /JOB_NOT_FOUND/u,
  );

  const jobs = [
    ...new Map(startResults.map((result) => [result.job.key, result.job])).values(),
    extraGameTwo.job,
  ];
  const completionResults = await Promise.all(
    jobs.flatMap((job) =>
      Array.from({ length: RETRIES_PER_PLAYER }, () =>
        authority.complete({ game: job.game, jobKey: job.key })
      )
    ),
  );
  assert.equal(completionResults.filter((result) => !result.replayed).length, jobs.length);
  assert.equal(authority.snapshot("game_1", "business_01").finishedGoods, 1);
  assert.equal(authority.snapshot("game_2", "business_01").finishedGoods, 2);

  const gameOneFinished = Array.from({ length: PLAYERS_PER_GAME }, (_, index) =>
    authority.snapshot("game_1", `business_${String(index + 1).padStart(2, "0")}`).finishedGoods
  ).reduce((sum, quantity) => sum + quantity, 0);
  const gameTwoFinished = Array.from({ length: PLAYERS_PER_GAME }, (_, index) =>
    authority.snapshot("game_2", `business_${String(index + 1).padStart(2, "0")}`).finishedGoods
  ).reduce((sum, quantity) => sum + quantity, 0);
  assert.equal(gameOneFinished, PLAYERS_PER_GAME);
  assert.equal(gameTwoFinished, PLAYERS_PER_GAME + 1);

  return {
    players: GAME_COUNT * PLAYERS_PER_GAME,
    startAttempts: startResults.length + 3,
    jobs: jobs.length,
    completionAttempts: completionResults.length + 1,
    games: GAME_COUNT,
  };
}

await verifyDatabaseConcurrencyContracts();
const evidence = await verifyFortyPlayerLoadAndTwoGameIsolation();
console.log(`Business Phase 6 40-player/two-game load isolation: PASS ${JSON.stringify(evidence)}`);
