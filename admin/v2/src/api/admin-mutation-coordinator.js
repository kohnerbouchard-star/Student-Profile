// One coordinator per API client; Store and Player mutations share its key namespace.
export function createAdminMutationCoordinator({ requireIdempotencyKey, serializeJsonBody, conflict }) {
  const inFlightMutations = new Map();
  return function coordinateMutation({ method, path, body, idempotencyKey }, request) {
    const key = requireIdempotencyKey(idempotencyKey);
    const fingerprint = serializeJsonBody({ method, path, body });
    const existing = inFlightMutations.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) return conflict();
      return existing.promise;
    }
    const promise = request(key);
    const entry = { fingerprint, promise };
    inFlightMutations.set(key, entry);
    const clear = () => {
      if (inFlightMutations.get(key) === entry) inFlightMutations.delete(key);
    };
    promise.then(clear, clear);
    return promise;
  };
}
