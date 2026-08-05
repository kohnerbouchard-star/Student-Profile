import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import {
  AdminMutationError,
  type AdminMutationIdentity,
  type AdminMutationRpcClient,
  executeAdminMutationRpc,
} from "../../../platform/supabase/adminMutation.ts";
import {
  createPlayerCredentialMaterial,
  type PlayerCredentialMaterial,
} from "../../../security/playerCredentialHashing.ts";
import { normalizeStudentCode } from "../domain/playerAccessCodes.ts";
import { normalizePlayerIdentifier } from "../domain/playerIdentifiers.ts";

export interface CreatePlayerRequestBody {
  readonly displayName: string;
  readonly rosterLabel: string | null;
  readonly playerIdentifier: string;
  readonly accessCode: string;
}

export interface CreatePlayerForAuthorizedStaffInput {
  readonly gameSessionId: string;
  readonly staffUserId: string;
  readonly body: CreatePlayerRequestBody;
  readonly identity: AdminMutationIdentity;
}

export interface CreatePlayerForAuthorizedStaffDependencies {
  readonly createCredentialMaterial?: typeof createPlayerCredentialMaterial;
}

export interface CreatedPlayerForStaff {
  readonly id: string;
  readonly displayName: string;
  readonly rosterLabel: string | null;
  readonly playerIdentifier: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreatePlayerForAuthorizedStaffResult {
  readonly status: number;
  readonly replayed: boolean;
  readonly player: CreatedPlayerForStaff;
  readonly accessCode: {
    readonly studentCode: string;
    readonly status: "active";
    readonly createdAt: string;
  };
}

interface CreatePlayerRpcRow {
  readonly player_id: string;
  readonly display_name: string;
  readonly roster_label: string | null;
  readonly player_identifier: string;
  readonly player_status: string;
  readonly player_created_at: string;
  readonly player_updated_at: string;
  readonly credential_created_at: string;
}

/**
 * Runs after the caller has authenticated the staff user and established game
 * ownership. This operation intentionally performs no HTTP authentication,
 * ownership lookup, CSRF check, or rate-limit evaluation of its own.
 */
export async function createPlayerForAuthorizedStaff(
  input: CreatePlayerForAuthorizedStaffInput,
  serviceClient: AdminMutationRpcClient,
  dependencies: CreatePlayerForAuthorizedStaffDependencies = {},
): Promise<CreatePlayerForAuthorizedStaffResult> {
  const displayName = input.body.displayName.trim();
  const rosterLabel = input.body.rosterLabel?.trim() || null;
  const playerIdentifier = input.body.playerIdentifier.trim();
  const playerIdentifierNormalized = normalizePlayerIdentifier(
    playerIdentifier,
  );
  const normalizedAccessCode = normalizeStudentCode(input.body.accessCode);
  const credential = await (
    dependencies.createCredentialMaterial ?? createPlayerCredentialMaterial
  )(normalizedAccessCode);
  const requestPayload = {
    operation: "create_player",
    displayName,
    rosterLabel,
    playerIdentifier,
    playerIdentifierNormalized,
    accessCodeLookupDigest: credential.lookupDigest,
    credentialVersion: credential.credentialVersion,
  };

  const mutation = await executeAdminMutationRpc(
    serviceClient,
    "admin_create_player_v1",
    {
      p_game_session_id: input.gameSessionId,
      p_staff_user_id: input.staffUserId,
      p_display_name: displayName,
      p_roster_label: rosterLabel,
      p_player_identifier: playerIdentifier,
      p_player_identifier_normalized: playerIdentifierNormalized,
      ...playerCredentialRpcArguments(credential),
      p_request_payload: requestPayload,
      p_idempotency_key: input.identity.idempotencyKey,
      p_request_id: input.identity.requestId,
    },
    {
      code: "player_create_failed",
      message: "Player could not be created.",
    },
  );

  const player = readCreatePlayerRpcRow(mutation.body.player);
  if (!player) {
    throw new AdminMutationError(
      "player_create_failed",
      "Player could not be created.",
      500,
    );
  }

  return {
    status: mutation.status,
    replayed: mutation.replayed,
    player: {
      id: player.player_id,
      displayName: player.display_name,
      rosterLabel: player.roster_label,
      playerIdentifier: player.player_identifier,
      status: player.player_status,
      createdAt: player.player_created_at,
      updatedAt: player.player_updated_at,
    },
    accessCode: {
      studentCode: normalizedAccessCode,
      status: "active",
      createdAt: player.credential_created_at,
    },
  };
}

function playerCredentialRpcArguments(credential: PlayerCredentialMaterial) {
  return {
    p_lookup_digest: credential.lookupDigest,
    p_credential_version: credential.credentialVersion,
    p_credential_salt: credential.salt,
    p_credential_verifier: credential.verifier,
    p_credential_iterations: credential.iterations,
  };
}

function readCreatePlayerRpcRow(value: unknown): CreatePlayerRpcRow | null {
  if (!isRecord(value)) return null;

  const rosterLabel = value.roster_label;
  if (
    typeof value.player_id !== "string" ||
    typeof value.display_name !== "string" ||
    (rosterLabel !== null && typeof rosterLabel !== "string") ||
    typeof value.player_identifier !== "string" ||
    typeof value.player_status !== "string" ||
    typeof value.player_created_at !== "string" ||
    typeof value.player_updated_at !== "string" ||
    typeof value.credential_created_at !== "string"
  ) {
    return null;
  }

  return {
    player_id: value.player_id,
    display_name: value.display_name,
    roster_label: rosterLabel as string | null,
    player_identifier: value.player_identifier,
    player_status: value.player_status,
    player_created_at: value.player_created_at,
    player_updated_at: value.player_updated_at,
    credential_created_at: value.credential_created_at,
  };
}
