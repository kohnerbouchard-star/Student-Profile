import { createAdminErrorEnvelope } from "../core/error-envelope.js";

const PRIVATE_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ud800-\udfff\ufffd]/u;
const invalid = () => createAdminErrorEnvelope({ code: "INVALID_RESPONSE", retryable: true });

/** Whitelist the one-time browser DTO. Never propagate raw server error contents. */
export function normalizeRosterImportResult(payload, studentNames) {
  const data = payload?.data;
  if (!data || data.createdCount !== studentNames.length || typeof data.replayed !== "boolean"
    || data.credentialsAvailable !== !data.replayed || !Array.isArray(data.students)
    || data.students.length !== studentNames.length) throw invalid();
  const identifiers = new Set();
  const students = data.students.map((student, index) => {
    if (student?.row !== index + 1 || student.displayName !== studentNames[index]
      || typeof student.playerIdentifier !== "string"
      || !/^STU-[A-F0-9]{24}$/.test(student.playerIdentifier)
      || PRIVATE_UUID.test(student.playerIdentifier) || identifiers.has(student.playerIdentifier)) throw invalid();
    identifiers.add(student.playerIdentifier);
    const row = { row: student.row, displayName: student.displayName, playerIdentifier: student.playerIdentifier };
    if (data.credentialsAvailable) {
      if (typeof student.accessCode !== "string" || !/^[A-F0-9]{32}$/.test(student.accessCode)
        || PRIVATE_UUID.test(student.accessCode)) throw invalid();
      row.accessCode = student.accessCode;
    }
    return row;
  });
  return { createdCount: data.createdCount, replayed: data.replayed, credentialsAvailable: data.credentialsAvailable, students };
}

export function createRosterImportRequest({ mutate, collectionPath }) {
  return async function importPlayerRoster({ gameId, studentNames, idempotencyKey, signal } = {}) {
    if (!Array.isArray(studentNames) || !studentNames.length || studentNames.length > 200
      || studentNames.some((name) => typeof name !== "string" || !name.trim() || name.length > 240
        || name !== name.trim().normalize("NFC") || CONTROL.test(name) || PRIVATE_UUID.test(name))) {
      throw createAdminErrorEnvelope({ code: "VALIDATION_FAILED", retryable: false });
    }
    const names = [...studentNames];
    return mutate({
      method: "POST", path: `${collectionPath(gameId)}/imports/csv`,
      body: { studentNames: names }, idempotencyKey, signal, timeoutMs: 120_000,
      validate: (payload) => normalizeRosterImportResult(payload, names),
    });
  };
}
