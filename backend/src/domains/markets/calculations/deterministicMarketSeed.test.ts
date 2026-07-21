import {
  createDeterministicMarketRandom,
  deterministicMarketNormal,
  deterministicMarketUnitInterval,
  hashMarketSeed,
} from "./deterministicMarketSeed.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("deterministic market random repeats for identical seed parts", () => {
  const first = createDeterministicMarketRandom("game-a", "issuer-a", "2026-Q1");
  const second = createDeterministicMarketRandom("game-a", "issuer-a", "2026-Q1");

  const firstValues = Array.from({ length: 20 }, () => first.next());
  const secondValues = Array.from({ length: 20 }, () => second.next());
  assertEquals(firstValues, secondValues);
});

Deno.test("deterministic market random changes with seed identity", () => {
  assertNotEquals(
    deterministicMarketUnitInterval("game-a", "issuer-a"),
    deterministicMarketUnitInterval("game-a", "issuer-b"),
  );
  assertNotEquals(hashMarketSeed("game-a"), hashMarketSeed("game-b"));
});

Deno.test("deterministic ranges and normal values remain bounded and finite", () => {
  const random = createDeterministicMarketRandom("bounded-seed");
  for (let index = 0; index < 100; index += 1) {
    const ranged = random.nextBetween(-5, 7);
    assert(ranged >= -5 && ranged <= 7);
    const integer = random.nextInteger(3, 9);
    assert(Number.isInteger(integer) && integer >= 3 && integer <= 9);
    assert(Number.isFinite(deterministicMarketNormal(random)));
  }
});

function assert(condition: boolean): void {
  if (!condition) throw new Error("Assertion failed.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

function assertNotEquals(actual: unknown, expected: unknown): void {
  if (actual === expected) {
    throw new Error(`Expected values to differ, both were ${String(actual)}.`);
  }
}
