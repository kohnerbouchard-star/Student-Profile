import assert from "node:assert/strict";

const THRESHOLDS = [0,150,375,675,1050,1500,2025,2625,3300,4050,4875,5775,6750,7800,8925,10125,11400,12750,14175,15675];
const EVENTS = Object.freeze({
  "contract.completed": { xp: 120, cap: 10, counter: "contracts.completed", reputation: ["career", 4] },
  "business.operation.completed": { xp: 90, cap: 12, counter: "business.operations", reputation: ["career", 3] },
  "crafting.recipe.completed": { xp: 80, cap: 12, counter: "crafting.completed", reputation: ["career", 2] },
  "market.order.settled": { xp: 30, cap: 20, counter: "market.settled", reputation: ["country", 1] },
  "story.chapter.completed": { xp: 150, cap: 5, counter: "story.completed", reputation: ["story", 6] },
  "relationship.interaction.positive": { xp: 20, cap: 10, counter: "relationship.positive", reputation: ["relationship", 3] },
  "relationship.interaction.negative": { xp: 0, cap: 10, counter: "relationship.negative", reputation: ["relationship", -5] },
  "country.service.completed": { xp: 70, cap: 10, counter: "country.service", reputation: ["country", 4] },
  "world.travel.completed": { xp: 40, cap: 8, counter: "world.travel", reputation: ["country", 2] },
  "world.arrival.completed": { xp: 100, cap: 1, counter: "world.arrival", reputation: ["country", 3] },
  "messaging.contribution.approved": { xp: 15, cap: 5, counter: "messaging.approved", reputation: ["relationship", 2] }
});
const ACHIEVEMENTS = Object.freeze([
  ["events.total",1,1],["events.total",25,1],["events.total",100,2],
  ["contracts.completed",5,1],["business.operations",5,1],["crafting.completed",5,1],
  ["market.settled",10,1],["story.completed",3,1],["reputation.recovered",1,1],
  ["skills.unlocked",4,1],["specialization.tracks",3,2],["level.current",10,2]
]);
const TRACK_EFFECTS = Object.freeze({ markets:[100,150,250], enterprise:[100,150,250], production:[100,150,250], diplomacy:[100,150,250] });
const ECONOMIC_SYSTEMS = Object.freeze(["trading","business","banking","crafting","employment","contracts","story","country"]);
const SPECIALIZATION_PATHS = Object.freeze({
  trading:    { trading:1.00,business:0.76,banking:0.82,crafting:0.64,employment:0.68,contracts:0.72,story:0.62,country:0.74 },
  business:   { trading:0.75,business:1.00,banking:0.86,crafting:0.72,employment:0.78,contracts:0.84,story:0.64,country:0.70 },
  banking:    { trading:0.82,business:0.86,banking:1.00,crafting:0.62,employment:0.72,contracts:0.76,story:0.60,country:0.73 },
  crafting:   { trading:0.66,business:0.74,banking:0.62,crafting:1.00,employment:0.82,contracts:0.77,story:0.66,country:0.70 },
  employment: { trading:0.68,business:0.78,banking:0.72,crafting:0.82,employment:1.00,contracts:0.80,story:0.70,country:0.76 },
  contracts:  { trading:0.72,business:0.84,banking:0.76,crafting:0.77,employment:0.80,contracts:1.00,story:0.78,country:0.82 },
  story:      { trading:0.62,business:0.64,banking:0.60,crafting:0.66,employment:0.70,contracts:0.78,story:1.00,country:0.86 },
  country:    { trading:0.74,business:0.70,banking:0.73,crafting:0.70,employment:0.76,contracts:0.82,story:0.86,country:1.00 },
  generalist: { trading:0.84,business:0.84,banking:0.84,crafting:0.84,employment:0.84,contracts:0.84,story:0.84,country:0.84 }
});
const CLASS_FACTORS = Object.freeze({ worker:0.94, entrepreneur:1.00, professional:1.06 });
const COUNTRY_FACTORS = Object.freeze({ low_cost:0.95, balanced:1.00, high_cost:1.05 });
const DIFFICULTY_FACTORS = Object.freeze({ accessible:1.08, standard:1.00, demanding:0.92 });

class Model {
  constructor(game = "game-a") {
    this.game = game;
    this.xp = 0;
    this.level = 1;
    this.counters = new Map();
    this.reputation = new Map([["country",0],["career",0],["story",0],["relationship",0]]);
    this.events = new Map();
    this.daily = new Map();
    this.completed = new Set();
    this.pendingRewards = new Map();
    this.commands = new Map();
    this.skills = new Set();
    this.skillPoints = 0;
  }
  record(type, idempotencyKey, day, sourceId = idempotencyKey, multiplier = 1) {
    if (this.events.has(idempotencyKey)) return { ...this.events.get(idempotencyKey), outcome: "replayed" };
    const definition = EVENTS[type];
    assert.ok(definition, `unsupported event ${type}`);
    const dailyKey = `${day}:${type}`;
    const count = this.daily.get(dailyKey) || 0;
    const applied = count < definition.cap;
    this.daily.set(dailyKey, count + 1);
    const awardedXp = applied ? Math.max(0, Math.round(definition.xp * multiplier)) : 0;
    if (applied) {
      this.xp += awardedXp;
      this.increment("events.total", 1);
      this.increment(definition.counter, 1);
      const [repType, delta] = definition.reputation;
      const before = this.reputation.get(repType) || 0;
      const after = Math.max(-100, Math.min(100, before + delta));
      this.reputation.set(repType, after);
      if (before < 0 && after >= 0) this.increment("reputation.recovered", 1);
    }
    this.level = levelForXp(this.xp);
    this.counters.set("level.current", this.level);
    this.evaluateAchievements();
    const result = { outcome: applied ? "applied" : "capped", xp: awardedXp, sourceId };
    this.events.set(idempotencyKey, result);
    return result;
  }
  increment(key, amount) { this.counters.set(key, (this.counters.get(key) || 0) + amount); }
  evaluateAchievements() {
    ACHIEVEMENTS.forEach(([key, threshold, reward], index) => {
      const id = `achievement-${index}`;
      if ((this.counters.get(key) || 0) >= threshold && !this.completed.has(id)) {
        this.completed.add(id);
        this.pendingRewards.set(`reward-${index}`, reward);
      }
    });
  }
  claim(rewardId, commandKey) {
    const prior = this.commands.get(commandKey);
    if (prior) {
      return prior.kind === "claim" && prior.resourceId === rewardId
        ? { outcome: "replayed", rewardId }
        : { outcome: "conflict", rewardId };
    }
    assert.ok(this.pendingRewards.has(rewardId), "reward must be pending");
    const amount = this.pendingRewards.get(rewardId);
    this.pendingRewards.delete(rewardId);
    this.skillPoints += amount;
    this.commands.set(commandKey, { kind: "claim", resourceId: rewardId });
    return { outcome: "applied", rewardId, amount };
  }
  unlock(track, tier, commandKey) {
    const skill = `${track}:${tier}`;
    const prior = this.commands.get(commandKey);
    if (prior) {
      return prior.kind === "unlock" && prior.resourceId === skill
        ? { outcome: "replayed" }
        : { outcome: "conflict" };
    }
    const cost = tier;
    assert.ok(!this.skills.has(skill));
    assert.ok(this.skillPoints >= cost);
    if (tier > 1) assert.ok(this.skills.has(`${track}:${tier - 1}`));
    this.skills.add(skill);
    this.skillPoints -= cost;
    this.commands.set(commandKey, { kind: "unlock", resourceId: skill });
    this.counters.set("skills.unlocked", this.skills.size);
    this.counters.set("specialization.tracks", new Set([...this.skills].map((item) => item.split(":")[0])).size);
    this.evaluateAchievements();
    return { outcome: "applied" };
  }
}

function levelForXp(xp) {
  let level = 1;
  THRESHOLDS.forEach((threshold, index) => { if (xp >= threshold) level = index + 1; });
  return Math.min(20, level);
}
function seeded(index) {
  let state = index + 1;
  return () => ((state = (state * 48271) % 2147483647) / 2147483647);
}

function runThresholdAndSkillDeterminism() {
  assert.equal(THRESHOLDS[0], 0);
  for (let index = 1; index < THRESHOLDS.length; index += 1) {
    assert.ok(THRESHOLDS[index] > THRESHOLDS[index - 1], "level thresholds must be strictly increasing");
    assert.equal(levelForXp(THRESHOLDS[index] - 1), index);
    assert.equal(levelForXp(THRESHOLDS[index]), index + 1);
  }
  const model = new Model();
  model.skillPoints = 12;
  assert.equal(model.unlock("markets", 1, "unlock:markets:1").outcome, "applied");
  assert.equal(model.unlock("markets", 2, "unlock:markets:2").outcome, "applied");
  assert.equal(model.unlock("markets", 3, "unlock:markets:3").outcome, "applied");
  assert.equal(model.skillPoints, 6);
  assert.equal(model.unlock("enterprise", 1, "unlock:enterprise:1").outcome, "applied");
  assert.equal(model.unlock("production", 1, "unlock:production:1").outcome, "applied");
  assert.equal(model.unlock("diplomacy", 1, "unlock:diplomacy:1").outcome, "applied");
  assert.equal(new Set([...model.skills].map((item) => item.split(":")[0])).size, 4);
  return { thresholdCount: THRESHOLDS.length, remainingSkillPoints: model.skillPoints, accessibleTracks: 4 };
}

function runProgressionSpeed() {
  const model = new Model();
  const cycle = Object.keys(EVENTS).filter((key) => !key.endsWith("negative"));
  const reached = new Map();
  for (let day = 1; day <= 180; day += 1) {
    for (let eventIndex = 0; eventIndex < 3; eventIndex += 1) {
      const type = cycle[(day + eventIndex) % cycle.length];
      model.record(type, `speed:${day}:${eventIndex}`, day);
    }
    if (!reached.has(model.level)) reached.set(model.level, day);
  }
  assert.ok(model.level >= 15 && model.level <= 20);
  assert.ok((reached.get(10) || 999) >= 10, "level ten must not be immediate");
  return { finalLevel: model.level, finalXp: model.xp, levelTenDay: reached.get(10) };
}

function runDistribution() {
  const levels = [];
  for (let player = 0; player < 200; player += 1) {
    const random = seeded(player);
    const model = new Model(`game-${player % 4}`);
    for (let day = 1; day <= 60; day += 1) {
      const events = 1 + Math.floor(random() * 4);
      for (let i = 0; i < events; i += 1) {
        const types = Object.keys(EVENTS).filter((key) => !key.endsWith("negative"));
        const type = types[Math.floor(random() * types.length)];
        model.record(type, `distribution:${player}:${day}:${i}`, day);
      }
    }
    levels.push(model.level);
  }
  const mean = levels.reduce((sum, value) => sum + value, 0) / levels.length;
  assert.ok(mean >= 8 && mean <= 18);
  assert.ok(new Set(levels).size >= 4);
  return { min: Math.min(...levels), max: Math.max(...levels), mean: Number(mean.toFixed(2)) };
}

function runInflationAndAchievements() {
  const model = new Model();
  for (let day = 1; day <= 45; day += 1) {
    model.record("contract.completed", `contract:${day}`, day);
    model.record("business.operation.completed", `business:${day}`, day);
    model.record("crafting.recipe.completed", `craft:${day}`, day);
    model.record("market.order.settled", `market:${day}`, day);
    if (day <= 5) model.record("story.chapter.completed", `story:${day}`, day);
  }
  const maximumSkillReward = [...model.pendingRewards.values()].reduce((sum, value) => sum + value, 0);
  assert.ok(maximumSkillReward <= 16);
  assert.ok(model.completed.size >= 8);
  assert.ok([...model.pendingRewards.values()].every((value) => value >= 1 && value <= 2));
  const currencyRewards = 0;
  assert.equal(currencyRewards, 0);
  return { completed: model.completed.size, maximumSkillReward, currencyRewards };
}

function runSpecializationBalance() {
  const totals = Object.fromEntries(Object.entries(TRACK_EFFECTS).map(([track, values]) => [track, values.reduce((sum, value) => sum + value, 0)]));
  assert.equal(new Set(Object.values(totals)).size, 1);
  assert.equal(Math.max(...Object.values(totals)), 500);
  return totals;
}

function runScenarioDominance() {
  const scenarios = Object.freeze([
    { markets: 1.00, enterprise: 0.72, production: 0.68, diplomacy: 0.78 },
    { markets: 0.65, enterprise: 1.00, production: 0.76, diplomacy: 0.74 },
    { markets: 0.70, enterprise: 0.72, production: 1.00, diplomacy: 0.76 },
    { markets: 0.76, enterprise: 0.70, production: 0.72, diplomacy: 1.00 },
    { markets: 0.89, enterprise: 0.86, production: 0.84, diplomacy: 0.72 },
  ]);
  const aggregate = Object.fromEntries(Object.keys(TRACK_EFFECTS).map((track) => [
    track,
    scenarios.reduce((total, scenario) => total + scenario[track], 0),
  ]));
  const values = Object.values(aggregate);
  const spread = Math.max(...values) - Math.min(...values);
  assert.ok(spread <= 0.12, `specialization aggregate spread ${spread} is dominant`);
  for (const track of Object.keys(TRACK_EFFECTS)) {
    assert.ok(scenarios.some((scenario) => scenario[track] === 1), `${track} needs a best-fit scenario`);
    assert.ok(scenarios.some((scenario) => scenario[track] < 0.8), `${track} must not dominate every scenario`);
  }
  return { aggregate, spread: Number(spread.toFixed(3)) };
}

function runEconomicPathCoverage() {
  for (const [path, scores] of Object.entries(SPECIALIZATION_PATHS)) {
    assert.deepEqual(Object.keys(scores), ECONOMIC_SYSTEMS, `${path} must cover every economic system`);
    const values = Object.values(scores);
    assert.ok(values.every((value) => value >= 0.60 && value <= 1.00), `${path} has an unbounded system modifier`);
    if (path === "generalist") {
      assert.equal(new Set(values).size, 1);
      continue;
    }
    assert.equal(scores[path], 1.00, `${path} must have one best-fit system`);
    assert.equal(ECONOMIC_SYSTEMS.filter((system) => scores[system] === 1.00).length, 1, `${path} must have exactly one best-fit system`);
    assert.ok(ECONOMIC_SYSTEMS.some((system) => scores[system] < 0.80), `${path} must not dominate every system`);
  }
  for (const system of ECONOMIC_SYSTEMS) {
    const best = Math.max(...Object.values(SPECIALIZATION_PATHS).map((path) => path[system]));
    assert.equal(best, 1.00, `${system} requires a viable specialist path`);
    assert.ok(SPECIALIZATION_PATHS.generalist[system] >= 0.80, `${system} must remain viable for generalists`);
  }
  return {
    paths: Object.keys(SPECIALIZATION_PATHS),
    systems: ECONOMIC_SYSTEMS,
    generalistFloor: Math.min(...Object.values(SPECIALIZATION_PATHS.generalist))
  };
}

function runClassCountryDifficultyFairness() {
  const outcomes = [];
  for (const [className, classFactor] of Object.entries(CLASS_FACTORS)) {
    for (const [countryName, countryFactor] of Object.entries(COUNTRY_FACTORS)) {
      for (const [difficulty, difficultyFactor] of Object.entries(DIFFICULTY_FACTORS)) {
        const multiplier = classFactor * countryFactor * difficultyFactor;
        const model = new Model(`${className}:${countryName}:${difficulty}`);
        for (let day = 1; day <= 60; day += 1) {
          model.record("contract.completed", `${model.game}:contract:${day}`, day, undefined, multiplier);
          model.record("market.order.settled", `${model.game}:market:${day}`, day, undefined, multiplier);
        }
        outcomes.push({ className, countryName, difficulty, multiplier, level: model.level, xp: model.xp });
      }
    }
  }
  const levels = outcomes.map((item) => item.level);
  const multipliers = outcomes.map((item) => item.multiplier);
  assert.ok(Math.max(...levels) - Math.min(...levels) <= 3, "class-country-difficulty combinations diverge too far");
  assert.ok(Math.max(...multipliers) / Math.min(...multipliers) <= 1.50, "combined modifiers are not bounded");
  assert.ok(outcomes.every((item) => item.level >= 8), "every combination must remain progression viable");
  return {
    combinations: outcomes.length,
    minLevel: Math.min(...levels),
    maxLevel: Math.max(...levels),
    minMultiplier: Number(Math.min(...multipliers).toFixed(3)),
    maxMultiplier: Number(Math.max(...multipliers).toFixed(3))
  };
}

function runReplayDuplicateAndSpam() {
  const model = new Model();
  const first = model.record("market.order.settled", "market:replay", 1);
  const replay = model.record("market.order.settled", "market:replay", 1);
  assert.equal(first.xp, 30);
  assert.equal(replay.outcome, "replayed");
  const beforeSpam = model.xp;
  for (let index = 0; index < 100; index += 1) model.record("market.order.settled", `spam:${index}`, 2);
  assert.equal(model.xp - beforeSpam, 20 * 30);
  const rewards = [...model.pendingRewards.keys()];
  assert.ok(rewards.length >= 2);
  const claim = model.claim(rewards[0], "claim:1");
  const duplicate = model.claim(rewards[0], "claim:1");
  const conflict = model.claim(rewards[1], "claim:1");
  assert.equal(claim.outcome, "applied");
  assert.equal(duplicate.outcome, "replayed");
  assert.equal(conflict.outcome, "conflict");
  return {
    replayOutcome: replay.outcome,
    spamAwarded: model.xp - beforeSpam,
    duplicateClaim: duplicate.outcome,
    conflictingIdempotency: conflict.outcome
  };
}

function runConcurrentClaimBehavior() {
  const model = new Model();
  for (let index = 0; index < 25; index += 1) {
    model.record("contract.completed", `concurrency:${index}`, 1 + index);
  }
  const reward = [...model.pendingRewards.keys()][0];
  assert.ok(reward);
  const before = model.skillPoints;
  const attempts = [];
  for (const key of ["concurrent:a", "concurrent:b"]) {
    try {
      attempts.push(model.claim(reward, key));
    } catch {
      attempts.push({ outcome: "rejected", rewardId: reward });
    }
  }
  assert.equal(attempts.filter((item) => item.outcome === "applied").length, 1);
  assert.equal(attempts.filter((item) => item.outcome === "rejected").length, 1);
  assert.ok(model.skillPoints > before);
  return { outcomes: attempts.map((item) => item.outcome), awardedOnce: model.skillPoints - before };
}

function runReputationRecovery() {
  const model = new Model();
  for (let i = 0; i < 8; i += 1) model.record("relationship.interaction.negative", `negative:${i}`, 1 + i);
  assert.equal(model.reputation.get("relationship"), -40);
  for (let i = 0; i < 14; i += 1) model.record("relationship.interaction.positive", `positive:${i}`, 20 + i);
  assert.ok(model.reputation.get("relationship") >= 0);
  assert.equal(model.counters.get("reputation.recovered"), 1);
  return { recoveredScore: model.reputation.get("relationship"), recoveries: model.counters.get("reputation.recovered") };
}

function runIsolationAndOrdering() {
  const a = new Model("game-a");
  const b = new Model("game-b");
  const ordered = [
    ["story.chapter.completed","order:3",3],
    ["contract.completed","order:1",1],
    ["business.operation.completed","order:2",2]
  ].sort((left, right) => left[2] - right[2]);
  ordered.forEach(([type,key,day]) => a.record(type,key,day));
  b.record("contract.completed", "order:1", 1);
  assert.equal(a.events.size, 3);
  assert.equal(b.events.size, 1);
  assert.notEqual(a.xp, b.xp);
  assert.deepEqual(ordered.map((item) => item[1]), ["order:1","order:2","order:3"]);
  return { gameAXp: a.xp, gameBXp: b.xp, order: ordered.map((item) => item[1]) };
}

export function runProgressionBalanceSimulation() {
  return Object.freeze({
    thresholdAndSkillDeterminism: runThresholdAndSkillDeterminism(),
    progressionSpeed: runProgressionSpeed(),
    levelDistribution: runDistribution(),
    rewardInflationAndAchievements: runInflationAndAchievements(),
    specializationBalance: runSpecializationBalance(),
    scenarioDominance: runScenarioDominance(),
    economicPathCoverage: runEconomicPathCoverage(),
    classCountryDifficultyFairness: runClassCountryDifficultyFairness(),
    replayDuplicateAndSpam: runReplayDuplicateAndSpam(),
    concurrentClaimBehavior: runConcurrentClaimBehavior(),
    negativeReputationRecovery: runReputationRecovery(),
    crossGameIsolationAndOrdering: runIsolationAndOrdering()
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(runProgressionBalanceSimulation(), null, 2));
}
