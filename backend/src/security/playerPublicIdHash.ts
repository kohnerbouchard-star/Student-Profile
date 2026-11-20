export const MAX_PENDING_PLAYER_PUBLIC_ID_HASHES = 2_048;

// Share only unfinished deterministic hash work. No response, identity scope,
// authorization result or completed digest is retained between operations.
export function createPlayerPublicIdHash(
  hash: (value: string) => Promise<string>,
): (value: string) => Promise<string> {
  const pendingHashes = new Map<string, Promise<string>>();

  return async (value) => {
    const existing = pendingHashes.get(value);
    if (existing) return existing;

    const pending = hash(value);
    if (pendingHashes.size >= MAX_PENDING_PLAYER_PUBLIC_ID_HASHES) return pending;

    pendingHashes.set(value, pending);
    try {
      return await pending;
    } finally {
      if (pendingHashes.get(value) === pending) pendingHashes.delete(value);
    }
  };
}
