// This is a deliberately lexical census, not a TypeScript parser. Keep existing
// comment/string candidates and recognize type arguments without attempting to
// parse nested TypeScript types. A match is not proof of a call or live access.
const COLLECTION_FROM_CANDIDATE = /\b(?:Array|Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|BigInt64Array|BigUint64Array|Float32Array|Float64Array)\.from\s*(?:\(|<)/gu;
const MEMBER_PERSISTENCE_CANDIDATE = /\.(?:from|rpc)\s*(?:\(|<)/u;

export function hasPersistenceCallCandidate(source) {
  const persistenceSource = source.replace(COLLECTION_FROM_CANDIDATE, "collectionFrom(");
  return MEMBER_PERSISTENCE_CANDIDATE.test(persistenceSource) || /createClient\s*\(/u.test(persistenceSource);
}
