import type { StaffUserRecord, UUID } from "../auth/types";
import type { AuditRepository } from "../supabase/auditRepository";
import type {
  AuditLogInsert,
  JsonObject,
  JsonValue,
  StaffUserInsert,
} from "../supabase/tableTypes";

export interface StaffBootstrapInput {
  readonly supabaseAuthUserId: UUID;
  readonly email: string;
  readonly displayName?: string | null;
  readonly audit?: StaffBootstrapAuditInput;
}

export interface StaffBootstrapAuditInput {
  readonly actorId?: UUID | null;
  readonly systemActorId?: string | null;
  readonly source?: string | null;
  readonly reason?: string | null;
  readonly requestId?: string | null;
  readonly metadata?: JsonObject;
}

export interface StaffBootstrapRepository {
  findStaffUserBySupabaseAuthUserId(
    supabaseAuthUserId: UUID,
  ): Promise<StaffUserRecord | null>;
  createStaffUser(input: StaffUserInsert): Promise<StaffUserRecord>;
}

export interface StaffBootstrapDependencies {
  readonly staffRepository: StaffBootstrapRepository;
  readonly auditRepository: Pick<AuditRepository, "writeAuditLogEntry">;
}

export type StaffBootstrapStatus = "created" | "already_exists";

export interface StaffBootstrapResult {
  readonly status: StaffBootstrapStatus;
  readonly staffUser: StaffUserRecord;
  readonly auditLogged: boolean;
}

export class StaffBootstrapValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffBootstrapValidationError";
  }
}

export async function bootstrapStaffUser(
  input: StaffBootstrapInput,
  dependencies: StaffBootstrapDependencies,
): Promise<StaffBootstrapResult> {
  const normalizedInput = normalizeStaffBootstrapInput(input);
  const existingStaffUser =
    await dependencies.staffRepository.findStaffUserBySupabaseAuthUserId(
      normalizedInput.supabase_auth_user_id,
    );

  if (existingStaffUser) {
    return {
      status: "already_exists",
      staffUser: existingStaffUser,
      auditLogged: false,
    };
  }

  let createdStaffUser: StaffUserRecord;

  try {
    createdStaffUser = await dependencies.staffRepository.createStaffUser(
      normalizedInput,
    );
  } catch (error) {
    const staffUserAfterCreateRace =
      await dependencies.staffRepository.findStaffUserBySupabaseAuthUserId(
        normalizedInput.supabase_auth_user_id,
      );

    if (staffUserAfterCreateRace) {
      return {
        status: "already_exists",
        staffUser: staffUserAfterCreateRace,
        auditLogged: false,
      };
    }

    throw error;
  }

  await dependencies.auditRepository.writeAuditLogEntry(
    buildStaffBootstrapAuditEntry(input, createdStaffUser),
  );

  return {
    status: "created",
    staffUser: createdStaffUser,
    auditLogged: true,
  };
}

export function normalizeStaffBootstrapInput(
  input: StaffBootstrapInput,
): StaffUserInsert {
  const supabaseAuthUserId = normalizeRequiredUuid(
    input.supabaseAuthUserId,
    "supabaseAuthUserId",
  );
  const email = normalizeEmail(input.email);
  const displayName = normalizeDisplayName(input.displayName, email);

  return {
    supabase_auth_user_id: supabaseAuthUserId,
    email,
    display_name: displayName,
  };
}

export function buildStaffBootstrapAuditEntry(
  input: StaffBootstrapInput,
  staffUser: StaffUserRecord,
): AuditLogInsert {
  const audit = input.audit;

  return {
    game_session_id: null,
    actor_type: "system",
    actor_id: audit?.actorId != null
      ? normalizeRequiredUuid(audit.actorId, "audit.actorId")
      : null,
    action: "staff_user.bootstrap.created",
    target_type: "staff_user",
    target_id: staffUser.id,
    metadata: compactJsonObject({
      ...(audit?.metadata ?? {}),
      supabase_auth_user_id: staffUser.supabase_auth_user_id,
      email: staffUser.email,
      display_name: staffUser.display_name,
      system_actor_id: normalizeOptionalString(audit?.systemActorId),
      source: normalizeOptionalString(audit?.source),
      reason: normalizeOptionalString(audit?.reason),
      request_id: normalizeOptionalString(audit?.requestId),
    }),
  };
}

function normalizeRequiredUuid(
  value: string | null | undefined,
  fieldName: string,
): UUID {
  const normalizedValue = value?.trim().toLowerCase() ?? "";

  if (!normalizedValue) {
    throw new StaffBootstrapValidationError(`${fieldName} is required.`);
  }

  if (!isUuid(normalizedValue)) {
    throw new StaffBootstrapValidationError(`${fieldName} must be a UUID.`);
  }

  return normalizedValue;
}

function normalizeEmail(value: string | null | undefined): string {
  const normalizedEmail = value?.trim().toLowerCase() ?? "";

  if (!normalizedEmail) {
    throw new StaffBootstrapValidationError("email is required.");
  }

  const emailParts = normalizedEmail.split("@");

  if (normalizedEmail.includes(" ") || emailParts.length !== 2) {
    throw new StaffBootstrapValidationError("email must be a valid address.");
  }

  if (!emailParts[0] || !emailParts[1]) {
    throw new StaffBootstrapValidationError("email must be a valid address.");
  }

  return normalizedEmail;
}

function normalizeDisplayName(
  value: string | null | undefined,
  normalizedEmail: string,
): string {
  const explicitDisplayName = value?.trim();

  if (explicitDisplayName) {
    return explicitDisplayName;
  }

  return normalizedEmail.split("@")[0]?.trim() || "Teacher";
}

function normalizeOptionalString(
  value: string | null | undefined,
): string | undefined {
  const normalizedValue = value?.trim();
  return normalizedValue || undefined;
}

function compactJsonObject(value: Record<string, JsonValue | undefined>): JsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as JsonObject;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
}
