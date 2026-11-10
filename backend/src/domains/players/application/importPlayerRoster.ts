import { AdminMutationError } from "../../../platform/supabase/adminMutation.ts";
import { createPlayerCredentialMaterial } from "../../../security/playerCredentialHashing.ts";
import type {
  PlayerRosterImportRepository,
  RosterImportCommand,
  RosterImportCredential,
} from "../contracts/playerRosterImport.ts";

export const MAX_ROSTER_IMPORT_STUDENTS = 200;
export function parseRosterImportNames(body: unknown): string[] {
  if (
    !body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).length !== 1 || !("studentNames" in body)
  ) throw invalidRoster();
  const names = (body as { studentNames: unknown }).studentNames;
  if (
    !Array.isArray(names) || !names.length ||
    names.length > MAX_ROSTER_IMPORT_STUDENTS
  ) throw invalidRoster();
  return names.map((name: unknown) => {
    if (
      typeof name !== "string" || /[\uD800-\uDFFF]/u.test(name) ||
      /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ufffd]/u.test(
        name,
      ) ||
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
        .test(name)
    ) throw invalidRoster();
    const normalized = name.trim().normalize("NFC");
    if (!normalized || normalized.length > 240) throw invalidRoster();
    return normalized;
  });
}
function invalidRoster(): AdminMutationError {
  return new AdminMutationError(
    "invalid_roster_import",
    "Provide only studentNames: 1 to 200 names, each 1 to 240 characters without control characters.",
    400,
  );
}
function randomToken(bytes: number): string {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(bytes)),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("").toUpperCase();
}
/** Auth, AAL2, permission, CSRF, rate limit and ownership precede this call. */
export async function importPlayerRoster(
  repository: PlayerRosterImportRepository,
  command: RosterImportCommand,
  dependencies: {
    createCredentialMaterial?: typeof createPlayerCredentialMaterial;
  } = {},
) {
  const studentNames = parseRosterImportNames({
    studentNames: command.studentNames,
  });
  const normalized = { ...command, studentNames };
  const replay = await repository.readReplay(normalized);
  if (replay) return { ...replay, credentialsAvailable: false };
  const credentials: RosterImportCredential[] = [];
  const accessCodes: string[] = [];
  // Bounded sequential KDF work avoids a 200-job crypto queue and memory spike.
  // Never reduce the credential runtime's 600,000-iteration security policy.
  for (const _name of studentNames) {
    const accessCode = randomToken(16);
    accessCodes.push(accessCode);
    credentials.push({
      playerIdentifier: `STU-${randomToken(12)}`,
      ...await (dependencies.createCredentialMaterial ??
        createPlayerCredentialMaterial)(accessCode),
    });
  }
  const result = await repository.create(normalized, credentials);
  // A competing request may have committed between readReplay and create.
  if (result.replayed) return { ...result, credentialsAvailable: false };
  if (
    result.createdCount !== studentNames.length ||
    result.students.some((student, index) =>
      student.row !== index + 1 ||
      student.displayName !== studentNames[index] ||
      student.playerIdentifier !== credentials[index]?.playerIdentifier
    )
  ) {
    throw new AdminMutationError(
      "roster_import_receipt_invalid",
      "Import receipt could not be verified. Retry with the same Idempotency-Key.",
      500,
    );
  }
  return {
    ...result,
    credentialsAvailable: true,
    students: result.students.map((student, index) => ({
      ...student,
      accessCode: accessCodes[index],
    })),
  };
}
