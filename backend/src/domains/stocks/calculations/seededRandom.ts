const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const UINT32_RANGE = 4294967296;

export function createSeededRandom(seed: string): () => number {
  let state = hashSeed(seed);

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

export function createSeededRandomFromParts(
  parts: readonly string[],
): () => number {
  return createSeededRandom(parts.join("\u001f"));
}

export function seededNormalLike(parts: readonly string[]): number {
  const random = createSeededRandomFromParts([...parts, "normal"]);
  const u1 = clampNumber(random(), Number.EPSILON, 1 - Number.EPSILON);
  const u2 = clampNumber(random(), Number.EPSILON, 1 - Number.EPSILON);

  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Cannot clamp a non-finite number.");
  }

  return Math.min(Math.max(value, min), max);
}

export function roundNumber(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) {
    throw new Error("Cannot round a non-finite number.");
  }

  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function hashSeed(seed: string): number {
  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
}
