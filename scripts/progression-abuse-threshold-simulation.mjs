import assert from "node:assert/strict";

const THRESHOLDS = Object.freeze([0,150,375,675,1050,1500,2025,2625,3300,4050,4875,5775,6750,7800,8925,10125,11400,12750,14175,15675]);
const EVENTS = Object.freeze({
  "business.operation.completed": Object.freeze({ sourceDomain: "business", xp: 90, dailyCap: 12, reputationType: "career", reputationDelta: 3 }),
  "crafting.recipe.completed": Object.freeze({ sourceDomain: "crafting", xp: 80, dailyCap: 12, reputationType: "career", reputationDelta: 2 }),
  "market.order.settled": Object.freeze({ sourceDomain: "market", xp: 30, dailyCap: 20, reputationType: "country", reputationDelta: 1 }),
  "story.chapter.completed": Object.freeze({ sourceDomain: "story", xp: 150, dailyCap: 5, reputationType: "story", reputationDelta: 6 }),
  "relationship.interaction.positive": Object.freeze({ sourceDomain: "relationship", xp: 20, dailyCap: 10, reputationType: "relationship", reputationDelta: 3 }),
});
const LIMITS = Object.freeze({
  levelTenEarliestDay: 10,
  levelTwentyEarliestDay: 30,
  maxSkillRewardPoints: 16,
  maxTrackShare: 0.36,
  maxTrackHhi: 0.30,
  maxSpecializationAggregateSpread: 0.12,
  maxDailyPositiveReputation: 30,
  maxCoordinatedLoopXpPerDay: 2640,
  latePlayerMinimumCatchUpRatio: 0.70,
  latePlayerMaximumCatchUpRatio: 1.10,
  catchUpMultiplierCeiling: 1.15,
});
const SPECIALIZATION = Object.freeze({
  business: Object.freeze({ business: 1.00, crafting: 0.74, market: 0.78 }),
  crafting: Object.freeze({ business: 0.74, crafting: 1.00, market: 0.72 }),
  market: Object.freeze({ business: 0.78, crafting: 0.72, market: 1.00 }),
  generalist: Object.freeze({ business: 0.84, crafting: 0.84, market: 0.84 }),
});

class Model {
  constructor({ gameId = "game-a", playerId = "player-a", status = "active" } = {}) {
    this.gameId = gameId;
    this.playerId = playerId;
    this.status = status;
    this.xp = 0;
    this.level = 1;
    this.reputation = new Map([["country",0],["career",0],["story",0],["relationship",0]]);
    this.daily = new Map();
    this.byIdempotency = new Map();
    this.bySource = new Map();
    this.eventsTotal = 0;
    this.achievementCounters = new Map();
    this.completedAchievements = new Set();
    this.pendingSkillRewards = 0;
  }

  setStatus(status) { this.status = status; }

  record({ sourceDomain, eventType, sourcePublicId, idempotencyKey, day, multiplier = 1 }) {
    const definition = EVENTS[eventType];
    assert.ok(definition, `unsupported event ${eventType}`);
    assert.equal(definition.sourceDomain, sourceDomain, `source mismatch ${sourceDomain}/${eventType}`);
    const immutable = { sourceDomain, eventType, sourcePublicId, day };
    const priorKey = this.byIdempotency.get(idempotencyKey);
    if (priorKey) return sameEvent(priorKey, immutable) ? replay(priorKey) : conflict("idempotency");
    const sourceKey = `${this.gameId}:${this.playerId}:${sourceDomain}:${eventType}:${sourcePublicId}`;
    const priorSource = this.bySource.get(sourceKey);
    if (priorSource) {
      if (!sameEvent(priorSource, immutable)) return conflict("source");
      this.byIdempotency.set(idempotencyKey, priorSource);
      return replay(priorSource);
    }
    if (this.status === "paused") return Object.freeze({ outcome: "paused", xp: 0 });
    if (this.status === "ended") return Object.freeze({ outcome: "ended", xp: 0 });
    assert.equal(this.status, "active");

    const dailyKey = `${day}:${eventType}`;
    const dailyCount = this.daily.get(dailyKey) ?? 0;
    const applied = dailyCount < definition.dailyCap;
    this.daily.set(dailyKey, dailyCount + 1);
    const awardedXp = applied ? Math.round(definition.xp * multiplier) : 0;
    const stored = Object.freeze({ ...immutable, xp: awardedXp, outcome: applied ? "applied" : "capped" });
    this.bySource.set(sourceKey, stored);
    this.byIdempotency.set(idempotencyKey, stored);
    if (!applied) return Object.freeze({ outcome: "capped", xp: 0 });

    this.xp += awardedXp;
    this.level = levelForXp(this.xp);
    this.eventsTotal += 1;
    const before = this.reputation.get(definition.reputationType) ?? 0;
    this.reputation.set(definition.reputationType, clamp(before + definition.reputationDelta, -100, 100));
    this.incrementAchievement("events.total", 1);
    this.incrementAchievement(eventType, 1);
    this.evaluateAchievements();
    return Object.freeze({ outcome: "applied", xp: awardedXp });
  }

  incrementAchievement(key, amount) {
    this.achievementCounters.set(key, (this.achievementCounters.get(key) ?? 0) + amount);
  }

  evaluateAchievements() {
    for (const [id, key, threshold, points] of [
      ["first", "events.total", 1, 1],
      ["consistent", "events.total", 25, 1],
      ["long", "events.total", 100, 2],
      ["business", "business.operation.completed", 5, 1],
      ["crafting", "crafting.recipe.completed", 5, 1],
      ["market", "market.order.settled", 10, 1],
      ["story", "story.chapter.completed", 3, 1],
    ]) {
      if ((this.achievementCounters.get(key) ?? 0) >= threshold && !this.completedAchievements.has(id)) {
        this.completedAchievements.add(id);
        this.pendingSkillRewards += points;
      }
    }
  }
}

function runProgressionSpeedThresholds() {
  const model = new Model();
  const levelDays = new Map([[1, 0]]);
  const cycle = Object.keys(EVENTS);
  for (let day = 1; day <= 180; day += 1) {
    for (let index = 0; index < 3; index += 1) {
      const eventType = cycle[(day + index) % cycle.length];
      model.record({ sourceDomain: EVENTS[eventType].sourceDomain, eventType, sourcePublicId: `speed:${day}:${index}`, idempotencyKey: `speed:${day}:${index}`, day });
    }
    if (!levelDays.has(model.level)) levelDays.set(model.level, day);
  }
  assert.ok((levelDays.get(10) ?? Infinity) >= LIMITS.levelTenEarliestDay);
  assert.ok((levelDays.get(20) ?? Infinity) >= LIMITS.levelTwentyEarliestDay);
  assert.ok(model.level >= 15 && model.level <= 20);
  return { finalLevel: model.level, finalXp: model.xp, levelTenDay: levelDays.get(10), levelTwentyDay: levelDays.get(20) ?? null };
}

function runRewardInflationThresholds() {
  const model = new Model();
  for (let day = 1; day <= 45; day += 1) {
    for (const eventType of Object.keys(EVENTS)) {
      model.record({ sourceDomain: EVENTS[eventType].sourceDomain, eventType, sourcePublicId: `inflation:${eventType}:${day}`, idempotencyKey: `inflation:${eventType}:${day}`, day });
    }
  }
  assert.ok(model.pendingSkillRewards <= LIMITS.maxSkillRewardPoints);
  assert.equal(model.pendingSkillRewards, 8);
  return { completedAchievements: model.completedAchievements.size, pendingSkillRewards: model.pendingSkillRewards, currencyRewards: 0 };
}

function runSkillConcentrationThresholds() {
  const counts = new Map([["business",0],["crafting",0],["market",0],["generalist",0]]);
  for (let player = 0; player < 400; player += 1) {
    const bucket = player % 10;
    const track = bucket < 3 ? "business" : bucket < 6 ? "crafting" : bucket < 9 ? "market" : "generalist";
    counts.set(track, counts.get(track) + 1);
  }
  const shares = Object.fromEntries([...counts].map(([key, value]) => [key, value / 400]));
  const hhi = Object.values(shares).reduce((sum, share) => sum + share * share, 0);
  assert.ok(Math.max(...Object.values(shares)) <= LIMITS.maxTrackShare);
  assert.ok(hhi <= LIMITS.maxTrackHhi);
  return { shares, hhi: Number(hhi.toFixed(3)) };
}

function runDominantPathThresholds() {
  const scenarios = [
    { business: 1.00, crafting: 0.74, market: 0.78, generalist: 0.84 },
    { business: 0.74, crafting: 1.00, market: 0.72, generalist: 0.84 },
    { business: 0.78, crafting: 0.72, market: 1.00, generalist: 0.84 },
    { business: 0.88, crafting: 0.86, market: 0.82, generalist: 0.84 },
  ];
  const aggregate = Object.fromEntries(Object.keys(SPECIALIZATION).map((track) => [track, scenarios.reduce((sum, scenario) => sum + scenario[track], 0)]));
  const specialistValues = [aggregate.business, aggregate.crafting, aggregate.market];
  const spread = Math.max(...specialistValues) - Math.min(...specialistValues);
  assert.ok(spread <= LIMITS.maxSpecializationAggregateSpread);
  for (const track of ["business", "crafting", "market"]) assert.ok(scenarios.some((scenario) => scenario[track] === 1));
  return { aggregate, spread: Number(spread.toFixed(3)) };
}

function runAchievementAndReplayAbuseThresholds() {
  const model = new Model();
  const base = { sourceDomain: "business", eventType: "business.operation.completed", sourcePublicId: "operation-001", day: 1 };
  const outcomes = [];
  for (let index = 0; index < 1000; index += 1) outcomes.push(model.record({ ...base, idempotencyKey: `farm:${index}` }).outcome);
  assert.equal(outcomes.filter((value) => value === "applied").length, 1);
  assert.equal(outcomes.filter((value) => value === "replayed").length, 999);
  assert.equal(model.eventsTotal, 1);
  assert.equal(model.pendingSkillRewards, 1);
  return { applied: 1, replayed: 999, xp: model.xp, achievements: model.completedAchievements.size };
}

function runReputationFarmingThresholds() {
  const model = new Model();
  const before = model.reputation.get("relationship");
  for (let index = 0; index < 100; index += 1) {
    model.record({ sourceDomain: "relationship", eventType: "relationship.interaction.positive", sourcePublicId: `rep:${index}`, idempotencyKey: `rep:${index}`, day: 1 });
  }
  const afterDayOne = model.reputation.get("relationship");
  assert.ok(afterDayOne - before <= LIMITS.maxDailyPositiveReputation);
  for (let day = 2; day <= 20; day += 1) {
    for (let index = 0; index < 10; index += 1) {
      model.record({ sourceDomain: "relationship", eventType: "relationship.interaction.positive", sourcePublicId: `rep:${day}:${index}`, idempotencyKey: `rep:${day}:${index}`, day });
    }
  }
  assert.equal(model.reputation.get("relationship"), 100);
  return { dayOneDelta: afterDayOne - before, finalScore: model.reputation.get("relationship") };
}

function runCoordinatedRewardLoopThresholds() {
  const model = new Model();
  const types = ["business.operation.completed", "crafting.recipe.completed", "market.order.settled"];
  const dailyXp = [];
  for (let day = 1; day <= 14; day += 1) {
    const before = model.xp;
    for (const eventType of types) {
      for (let index = 0; index < 100; index += 1) {
        model.record({ sourceDomain: EVENTS[eventType].sourceDomain, eventType, sourcePublicId: `loop:${day}:${eventType}:${index}`, idempotencyKey: `loop:${day}:${eventType}:${index}`, day });
      }
    }
    dailyXp.push(model.xp - before);
  }
  assert.ok(dailyXp.every((value) => value <= LIMITS.maxCoordinatedLoopXpPerDay));
  assert.ok(model.pendingSkillRewards <= LIMITS.maxSkillRewardPoints);
  return { maxDailyXp: Math.max(...dailyXp), finalLevel: model.level, skillRewards: model.pendingSkillRewards };
}

function runSpecializationBalanceThresholds() {
  const systems = ["business", "crafting", "market"];
  const winners = {};
  for (const system of systems) {
    const ranked = Object.entries(SPECIALIZATION).sort((left, right) => right[1][system] - left[1][system]);
    winners[system] = ranked[0][0];
    assert.equal(winners[system], system);
    assert.ok(SPECIALIZATION.generalist[system] >= 0.80);
  }
  const totals = Object.fromEntries(Object.entries(SPECIALIZATION).map(([track, scores]) => [track, systems.reduce((sum, system) => sum + scores[system], 0)]));
  const specialistTotals = [totals.business, totals.crafting, totals.market];
  assert.ok(Math.max(...specialistTotals) - Math.min(...specialistTotals) <= LIMITS.maxSpecializationAggregateSpread);
  return { winners, totals };
}

function runLatePlayerCatchUpThresholds() {
  const incumbent = new Model({ playerId: "incumbent" });
  const late = new Model({ playerId: "late" });
  const multiplier = 1.12;
  assert.ok(multiplier <= LIMITS.catchUpMultiplierCeiling);
  for (let day = 1; day <= 90; day += 1) {
    for (let index = 0; index < 2; index += 1) {
      const eventType = index === 0 ? "business.operation.completed" : "market.order.settled";
      incumbent.record({ sourceDomain: EVENTS[eventType].sourceDomain, eventType, sourcePublicId: `inc:${day}:${index}`, idempotencyKey: `inc:${day}:${index}`, day });
    }
    if (day >= 31) {
      for (let index = 0; index < 2; index += 1) {
        const eventType = index === 0 ? "business.operation.completed" : "crafting.recipe.completed";
        late.record({ sourceDomain: EVENTS[eventType].sourceDomain, eventType, sourcePublicId: `late:${day}:${index}`, idempotencyKey: `late:${day}:${index}`, day, multiplier });
      }
    }
  }
  const ratio = late.xp / incumbent.xp;
  assert.ok(ratio >= LIMITS.latePlayerMinimumCatchUpRatio);
  assert.ok(ratio <= LIMITS.latePlayerMaximumCatchUpRatio);
  return { incumbentXp: incumbent.xp, lateXp: late.xp, ratio: Number(ratio.toFixed(3)), multiplier };
}

function runLifecycleAndCommittedRetryThresholds() {
  const model = new Model();
  const committed = { sourceDomain: "market", eventType: "market.order.settled", sourcePublicId: "settlement-001", day: 1 };
  assert.equal(model.record({ ...committed, idempotencyKey: "commit:first" }).outcome, "applied");
  const xp = model.xp;
  model.setStatus("paused");
  assert.equal(model.record({ ...committed, idempotencyKey: "commit:retry-paused" }).outcome, "replayed");
  assert.equal(model.record({ ...committed, sourcePublicId: "settlement-002", idempotencyKey: "paused:new" }).outcome, "paused");
  assert.equal(model.xp, xp);
  model.setStatus("ended");
  assert.equal(model.record({ ...committed, idempotencyKey: "commit:retry-ended" }).outcome, "replayed");
  assert.equal(model.record({ ...committed, sourcePublicId: "settlement-003", idempotencyKey: "ended:new" }).outcome, "ended");
  assert.equal(model.xp, xp);
  return { committedXp: xp, pausedNew: "paused", endedNew: "ended", retryOutcome: "replayed" };
}

function levelForXp(xp) {
  let level = 1;
  for (let index = 0; index < THRESHOLDS.length; index += 1) if (xp >= THRESHOLDS[index]) level = index + 1;
  return Math.min(20, level);
}
function sameEvent(left, right) {
  return left.sourceDomain === right.sourceDomain && left.eventType === right.eventType && left.sourcePublicId === right.sourcePublicId && left.day === right.day;
}
function replay(prior) { return Object.freeze({ outcome: "replayed", xp: prior.xp }); }
function conflict(kind) { return Object.freeze({ outcome: "conflict", kind, xp: 0 }); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export function runProgressionAbuseThresholdSimulation() {
  return Object.freeze({
    thresholds: LIMITS,
    progressionSpeed: runProgressionSpeedThresholds(),
    rewardInflation: runRewardInflationThresholds(),
    skillConcentration: runSkillConcentrationThresholds(),
    dominantPathEmergence: runDominantPathThresholds(),
    achievementAndReplayAbuse: runAchievementAndReplayAbuseThresholds(),
    reputationFarming: runReputationFarmingThresholds(),
    coordinatedRewardLoops: runCoordinatedRewardLoopThresholds(),
    specializationBalance: runSpecializationBalanceThresholds(),
    latePlayerCatchUp: runLatePlayerCatchUpThresholds(),
    lifecycleAndCommittedRetries: runLifecycleAndCommittedRetryThresholds(),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(runProgressionAbuseThresholdSimulation(), null, 2));
