import { createAdminErrorEnvelope } from "../../core/error-envelope.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Keys and hashes survive dialog dismissal in memory; names and codes do not. */
export function createRosterImportController({ api, gameId, hasPermission, cryptoObject = globalThis.crypto }) {
  const attempts = new Map();
  let destroyed = false;
  let active = false;

  async function submit(studentNames) {
    if (destroyed || !hasPermission("players.manage")) return { ok: false, denied: true };
    if (active) return { ok: false, busy: true };
    active = true;
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(studentNames));
      const digest = await cryptoObject.subtle.digest("SHA-256", bytes);
      bytes.fill(0);
      if (destroyed) return { ok: false, denied: true };
      const fingerprint = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
      let key = attempts.get(fingerprint);
      if (!key) {
        const uuid = cryptoObject.randomUUID();
        if (!UUID.test(uuid)) throw createAdminErrorEnvelope({ code: "INVALID_REQUEST", retryable: false });
        key = `admin.players.roster.${uuid}`;
        attempts.set(fingerprint, key);
      }
      const result = await api.importPlayerRoster({ gameId, studentNames, idempotencyKey: key });
      // Destruction never publishes late credentials. The request may still have committed.
      return destroyed ? { ok: false, denied: true } : { ok: true, result };
    } catch {
      // Retain the key for every failure, including malformed success or response loss.
      return { ok: false, uncertain: true };
    } finally {
      active = false;
    }
  }

  return { submit, destroy() { destroyed = true; attempts.clear(); } };
}
