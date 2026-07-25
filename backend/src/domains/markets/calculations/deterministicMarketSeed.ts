const UINT32_MAX_PLUS_ONE = 4_294_967_296;

export interface DeterministicMarketRandom {
  next(): number;
  nextBetween(minimum: number, maximum: number): number;
  nextInteger(minimumInclusive: number, maximumInclusive: number): number;
  pick<T>(values: readonly T[]): T;
}

export function createDeterministicMarketRandom(
  ...seedParts: readonly string[]
): DeterministicMarketRandom {
  const normalizedSeed = seedParts.map((part) => String(part)).join("\u001f");
  let state = hashSeed(normalizedSeed);

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_MAX_PLUS_ONE;
  };

  return {
    next,
    nextBetween(minimum: number, maximum: number): number {
      assertFiniteRange(minimum, maximum);
      return minimum + (maximum - minimum) * next();
    },
    nextInteger(minimumInclusive: number, maximumInclusive: number): number {
      assertFiniteRange(minimumInclusive, maximumInclusive);
      if (!Number.isInteger(minimumInclusive) || !Number.isInteger(maximumInclusive)) {
        throw new Error("Deterministic integer bounds must be integers.");
      }
      return minimumInclusive + Math.floor(
        next() * (maximumInclusive - minimumInclusive + 1),
      );
    },
    pick<T>(values: readonly T[]): T {
      if (values.length === 0) {
        throw new Error("Cannot choose from an empty deterministic collection.");
      }
      return values[Math.floor(next() * values.length)];
    },
  };
}

export function deterministicMarketUnitInterval(
  ...seedParts: readonly string[]
): number {
  return createDeterministicMarketRandom(...seedParts).next();
}

export function deterministicMarketNormal(
  random: DeterministicMarketRandom,
): number {
  const first = Math.max(random.next(), Number.EPSILON);
  const second = random.next();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

export function hashMarketSeed(...seedParts: readonly string[]): string {
  return hashSeed(seedParts.map((part) => String(part)).join("\u001f"))
    .toString(16)
    .padStart(8, "0");
}

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function assertFiniteRange(minimum: number, maximum: number): void {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    throw new Error("Deterministic range bounds must be finite.");
  }
  if (maximum < minimum) {
    throw new Error("Deterministic range maximum must not be below minimum.");
  }
}
