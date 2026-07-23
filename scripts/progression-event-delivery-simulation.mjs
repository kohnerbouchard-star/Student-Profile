import assert from "node:assert/strict";

const EVENT_DEFINITIONS = Object.freeze({
  "business.operation.completed": Object.freeze({ sourceDomain: "business", xp: 90, reputationType: "career", reputationDelta: 3 }),
  "crafting.recipe.completed": Object.freeze({ sourceDomain: "crafting", xp: 80, reputationType: "career", reputationDelta: 2 }),
  "market.order.settled": Object.freeze({ sourceDomain: "market", xp: 30, reputationType: "country", reputationDelta: 1 }),
  "story.chapter.completed": Object.freeze({ sourceDomain: "story", xp: 150, reputationType: "story", reputationDelta: 6 }),
});

const COMPATIBILITY_FIXTURES = Object.freeze([
  Object.freeze({ sourceDomain: "business", eventType: "business.operation.completed", sourcePublicId: "business_operation_completion_fixture_001", occurredDay: 1 }),
  Object.freeze({ sourceDomain: "crafting", eventType: "crafting.recipe.completed", sourcePublicId: "crafting_recipe_completion_fixture_001", occurredDay: 2 }),
  Object.freeze({ sourceDomain: "market", eventType: "market.order.settled", sourcePublicId: "market_order_settlement_fixture_001", occurredDay: 3 }),
  Object.freeze({ sourceDomain: "story", eventType: "story.chapter.completed", sourcePublicId: "story_chapter_completion_fixture_001", occurredDay: 4 }),
]);

class DeliveryModel {
  constructor(gameId = "game-a", playerId = "player-a") {
    this.gameId = gameId;
    this.playerId = playerId;
    this.xp = 0;
    this.eventsTotal = 0;
    this.achievements = new Set();
    this.reputation = new Map([["country", 0], ["career", 0], ["story", 0], ["relationship", 0]]);
    this.byIdempotency = new Map();
    this.bySourceIdentity = new Map();
  }

  record({ sourceDomain, eventType, sourcePublicId, idempotencyKey, occurredDay }) {
    const definition = EVENT_DEFINITIONS[eventType];
    assert.ok(definition, `unsupported event type ${eventType}`);
    assert.equal(definition.sourceDomain, sourceDomain, `source mismatch for ${eventType}`);

    const priorIdempotency = this.byIdempotency.get(idempotencyKey);
    if (priorIdempotency) {
      return sameImmutableEvent(priorIdempotency, { sourceDomain, eventType, sourcePublicId, occurredDay })
        ? replay(priorIdempotency)
        : conflict("idempotency");
    }

    const sourceIdentity = `${this.gameId}:${this.playerId}:${sourceDomain}:${eventType}:${sourcePublicId}`;
    const priorSource = this.bySourceIdentity.get(sourceIdentity);
    if (priorSource) {
      if (priorSource.occurredDay !== occurredDay) return conflict("source");
      this.byIdempotency.set(idempotencyKey, priorSource);
      return replay(priorSource);
    }

    this.xp += definition.xp;
    this.eventsTotal += 1;
    const before = this.reputation.get(definition.reputationType) ?? 0;
    this.reputation.set(
      definition.reputationType,
      Math.max(-100, Math.min(100, before + definition.reputationDelta)),
    );
    if (this.eventsTotal >= 1) this.achievements.add("events.total:1");
    if (this.eventsTotal >= 25) this.achievements.add("events.total:25");

    const stored = Object.freeze({
      sourceDomain,
      eventType,
      sourcePublicId,
      occurredDay,
      xp: definition.xp,
    });
    this.byIdempotency.set(idempotencyKey, stored);
    this.bySourceIdentity.set(sourceIdentity, stored);
    return Object.freeze({ outcome: "applied", xp: definition.xp });
  }

  snapshot() {
    return Object.freeze({
      xp: this.xp,
      eventsTotal: this.eventsTotal,
      achievements: [...this.achievements].sort(),
      reputation: Object.fromEntries([...this.reputation.entries()].sort(([left], [right]) => left.localeCompare(right))),
      sourceEvents: this.bySourceIdentity.size,
    });
  }
}

function sameImmutableEvent(prior, candidate) {
  return prior.sourceDomain === candidate.sourceDomain &&
    prior.eventType === candidate.eventType &&
    prior.sourcePublicId === candidate.sourcePublicId &&
    prior.occurredDay === candidate.occurredDay;
}

function replay(prior) {
  return Object.freeze({ outcome: "replayed", xp: prior.xp });
}

function conflict(kind) {
  return Object.freeze({ outcome: "conflict", kind, xp: 0 });
}

function eventFromFixture(fixture, idempotencyKey) {
  return Object.freeze({ ...fixture, idempotencyKey });
}

function runCompatibilityFixtureValidation() {
  assert.deepEqual(
    COMPATIBILITY_FIXTURES.map(({ sourceDomain, eventType }) => [sourceDomain, eventType]),
    [
      ["business", "business.operation.completed"],
      ["crafting", "crafting.recipe.completed"],
      ["market", "market.order.settled"],
      ["story", "story.chapter.completed"],
    ],
  );
  for (const fixture of COMPATIBILITY_FIXTURES) {
    assert.equal(EVENT_DEFINITIONS[fixture.eventType].sourceDomain, fixture.sourceDomain);
  }
  return { fixtureCount: COMPATIBILITY_FIXTURES.length };
}

function runDuplicateDeliveryResistance() {
  const model = new DeliveryModel();
  const outcomes = [];
  for (const [index, fixture] of COMPATIBILITY_FIXTURES.entries()) {
    const first = model.record(eventFromFixture(fixture, `delivery:first:${index}`));
    const duplicate = model.record(eventFromFixture(fixture, `delivery:duplicate:${index}`));
    assert.equal(first.outcome, "applied");
    assert.equal(duplicate.outcome, "replayed");
    outcomes.push(duplicate.outcome);
  }
  assert.equal(model.eventsTotal, COMPATIBILITY_FIXTURES.length);
  assert.equal(model.bySourceIdentity.size, COMPATIBILITY_FIXTURES.length);
  return { outcomes, snapshot: model.snapshot() };
}

function runDelayedOutOfOrderEquivalence() {
  const chronological = new DeliveryModel("game-order", "player-order");
  const delayed = new DeliveryModel("game-order", "player-order");
  for (const [index, fixture] of COMPATIBILITY_FIXTURES.entries()) {
    chronological.record(eventFromFixture(fixture, `chronological:${index}`));
  }
  const deliveryOrder = [3, 0, 2, 1];
  for (const index of deliveryOrder) {
    delayed.record(eventFromFixture(COMPATIBILITY_FIXTURES[index], `delayed:${index}`));
  }
  assert.deepEqual(delayed.snapshot(), chronological.snapshot());

  const duplicateOutcomes = COMPATIBILITY_FIXTURES.map((fixture, index) =>
    delayed.record(eventFromFixture(fixture, `delayed:redelivery:${index}`)).outcome
  );
  assert.ok(duplicateOutcomes.every((outcome) => outcome === "replayed"));
  assert.deepEqual(delayed.snapshot(), chronological.snapshot());

  const mutated = delayed.record(eventFromFixture(
    { ...COMPATIBILITY_FIXTURES[0], occurredDay: 9 },
    "delayed:mutated-source",
  ));
  assert.deepEqual(mutated, { outcome: "conflict", kind: "source", xp: 0 });
  return { deliveryOrder, duplicateOutcomes, mutationOutcome: mutated.outcome, snapshot: delayed.snapshot() };
}

function runAchievementFarmingResistance() {
  const model = new DeliveryModel("game-farming", "player-farming");
  const fixture = COMPATIBILITY_FIXTURES[0];
  const outcomes = [];
  for (let index = 0; index < 100; index += 1) {
    outcomes.push(model.record(eventFromFixture(fixture, `farm:${index}`)).outcome);
  }
  assert.equal(outcomes.filter((outcome) => outcome === "applied").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome === "replayed").length, 99);
  assert.equal(model.eventsTotal, 1);
  assert.equal(model.xp, 90);
  assert.ok(model.achievements.has("events.total:1"));
  assert.ok(!model.achievements.has("events.total:25"));
  return { applied: 1, replayed: 99, snapshot: model.snapshot() };
}

function runIdempotencyMutationResistance() {
  const model = new DeliveryModel("game-conflict", "player-conflict");
  const first = eventFromFixture(COMPATIBILITY_FIXTURES[2], "same-idempotency-key");
  assert.equal(model.record(first).outcome, "applied");
  const conflictResult = model.record({
    ...eventFromFixture(COMPATIBILITY_FIXTURES[3], "same-idempotency-key"),
  });
  assert.deepEqual(conflictResult, { outcome: "conflict", kind: "idempotency", xp: 0 });
  assert.equal(model.eventsTotal, 1);
  return { conflictOutcome: conflictResult.outcome, snapshot: model.snapshot() };
}

export function runProgressionEventDeliverySimulation() {
  return Object.freeze({
    compatibilityFixtures: runCompatibilityFixtureValidation(),
    duplicateDeliveryResistance: runDuplicateDeliveryResistance(),
    delayedOutOfOrderEquivalence: runDelayedOutOfOrderEquivalence(),
    achievementFarmingResistance: runAchievementFarmingResistance(),
    idempotencyMutationResistance: runIdempotencyMutationResistance(),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(runProgressionEventDeliverySimulation(), null, 2));
}
