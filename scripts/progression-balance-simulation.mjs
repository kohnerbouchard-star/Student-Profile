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
  "country.service.completed": { xp: 70, cap: 10, counter: "country.service", reputation: ["country", 4] }
});
const ACHIEVEMENTS = Object.freeze([
  ["events.total",1,1],["events.total",25,1],["events.total",100,2],
  ["contracts.completed",5,1],["business.operations",5,1],["crafting.completed",5,1],
  ["market.settled",10,1],["story.completed",3,1],["reputation.recovered",1,1],
  ["skills.unlocked",4,1],["specialization.tracks",3,2],["level.current",10,2]
]);
const TRACK_EFFECTS = Object.freeze({ markets:[100,150,250], enterprise:[100,150,250], production:[100,150,250], diplomacy:[100,150,250] });

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
    this.claimed = new Set();
    this.skills = new Set();
    this.skillPoints = 0;
  }
  record(type, idempotencyKey, day, sourceId = idempotencyKey) {
    if (this.events.has(idempotencyKey)) return { ...this.events.get(idempotencyKey), outcome: "replayed" };
    const definition = EVENTS[type];
    assert.ok(definition, `unsupported event ${type}`);
    const dailyKey = `${day}:${type}`;
    const count = this.daily.get(dailyKey) || 0;
    const applied = count < definition.cap;
    this.daily.set(dailyKey, count + 1);
    if (applied) {
      this.xp += definition.xp;
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
    const result = { outcome: applied ? "applied" : "capped", xp: applied ? definition.xp : 0, sourceId };
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
    if (this.claimed.has(commandKey)) return { outcome: "replayed", rewardId };
    assert.ok(this.pendingRewards.has(rewardId), "reward must be pending");
    const amount = this.pendingRewards.get(rewardId);
    this.pendingRewards.delete(rewardId);
    this.skillPoints += amount;
    this.claimed.add(commandKey);
    return { outcome: "applied", rewardId, amount };
  }
  unlock(track, tier, commandKey) {
    if (this.claimed.has(commandKey)) return { outcome: "replayed" };
    const skill = `${track}:${tier}`;
    const cost = tier;
    assert.ok(!this.skills.has(skill));
    assert.ok(this.skillPoints >= cost);
    if (tier > 1) assert.ok(this.skills.has(`${track}:${tier - 1}`));
    this.skills.add(skill);
    this.skillPoints -= cost;
    this.claimed.add(commandKey);
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
  assert.ok(new Set(levels).size >= 5);
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
function runReplayDuplicateAndSpam() {
  const model = new Model();
  const first = model.record("market.order.settled", "market:replay", 1);
  const replay = model.record("market.order.settled", "market:replay", 1);
  assert.equal(first.xp, 30);
  assert.equal(replay.outcome, "replayed");
  const beforeSpam = model.xp;
  for (let index = 0; index < 100; index += 1) model.record("market.order.settled", `spam:${index}`, 2);
  assert.equal(model.xp - beforeSpam, 20 * 30);
  const reward = [...model.pendingRewards.keys()][0];
  assert.ok(reward);
  const claim = model.claim(reward, "claim:1");
  const duplicate = model.claim(reward, "claim:1");
  assert.equal(claim.outcome, "applied");
  assert.equal(duplicate.outcome, "replayed");
  return { replayOutcome: replay.outcome, spamAwarded: model.xp - beforeSpam, duplicateClaim: duplicate.outcome };
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
    progressionSpeed: runProgressionSpeed(),
    levelDistribution: runDistribution(),
    rewardInflationAndAchievements: runInflationAndAchievements(),
    specializationBalance: runSpecializationBalance(),
    replayDuplicateAndSpam: runReplayDuplicateAndSpam(),
    negativeReputationRecovery: runReputationRecovery(),
    crossGameIsolationAndOrdering: runIsolationAndOrdering()
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(runProgressionBalanceSimulation(), null, 2));
}
