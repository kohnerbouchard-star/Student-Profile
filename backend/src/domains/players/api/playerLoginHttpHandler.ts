import {
  EdgeActivationError,
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  isRecord,
  parseRequiredText,
} from "../../../platform/supabase/edgeParsing.ts";
import { normalizeJoinCode } from "../../game-sessions/api/gameJoinCodeHttpHelpers.ts";
import { normalizeStudentCode } from "../domain/playerAccessCodes.ts";
import { normalizePlayerIdentifier } from "../domain/playerIdentifiers.ts";
import {
  isBrowserSafePlayerIdentifier,
  type PlayerLoginSuccessBody,
} from "../contracts/playerBrowserSessionContracts.ts";
import {
  buildAuthenticationThrottleBuckets,
  checkAuthenticationThrottle,
  recordAuthenticationFailure,
  recordAuthenticationSuccess,
  type AuthenticationThrottleBucket,
  type AuthenticationThrottleDecision,
} from "../../../security/authenticationThrottle.ts";
import {
  createPlayerCredentialMaterial,
  isLegacyPlayerCredential,
  type PlayerCredentialRecord,
  verifyPlayerCredential,
} from "../../../security/playerCredentialHashing.ts";

interface PlayerLoginDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly hashValue?: typeof sha256Hex;
  readonly generateSessionToken?: () => string;
  readonly now?: () => number;
  readonly buildThrottleBuckets?: typeof buildAuthenticationThrottleBuckets;
  readonly checkThrottle?: typeof checkAuthenticationThrottle;
  readonly recordFailure?: typeof recordAuthenticationFailure;
  readonly recordSuccess?: typeof recordAuthenticationSuccess;
  readonly verifyCredential?: typeof verifyPlayerCredential;
  readonly createCredentialMaterial?: typeof createPlayerCredentialMaterial;
}

interface PlayerLoginRequestBody {
  readonly gameJoinCode: string;
  readonly playerIdentifier: string;
  readonly accessCode: string;
}

interface PlayerCredentialRow extends PlayerCredentialRecord {
  readonly id: string;
  readonly player_id: string;
  readonly status: string;
}

export async function handlePlayerLoginRequest(
  request: Request,
  dependencies: PlayerLoginDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST for Player login.",
      retryable: false,
    });
  }

  try {
    const envResult = (dependencies.readEnvironment ?? readSupabaseEnv)();
    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Player API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const body = await readPlayerLoginRequestBody(request);
    const normalizedJoinCode = normalizeJoinCode(body.gameJoinCode);
    const normalizedAccessCode = normalizeStudentCode(body.accessCode);
    const playerIdentifierNormalized = normalizePlayerIdentifier(
      body.playerIdentifier,
    );
    const serviceClient = dependencies.createServiceClient(envResult.value);
    const throttleBuckets = await (
      dependencies.buildThrottleBuckets ?? buildAuthenticationThrottleBuckets
    )({
      request,
      realm: "player",
      accountIdentifier: `${normalizedJoinCode}|${playerIdentifierNormalized}`,
    });
    const throttleDecision = await (
      dependencies.checkThrottle ?? checkAuthenticationThrottle
    )(serviceClient, throttleBuckets);
    if (!throttleDecision.allowed) {
      return authenticationThrottledResponse(throttleDecision);
    }

    const hashValue = dependencies.hashValue ?? sha256Hex;
    const gameJoinCodeHash = await hashValue(normalizedJoinCode);

    const gameResponse = await serviceClient
      .from("game_sessions")
      .select("id,name,status,game_join_code_status")
      .eq("game_join_code_hash", gameJoinCodeHash)
      .eq("game_join_code_status", "active")
      .eq("status", "active")
      .maybeSingle();
    if (gameResponse.error) return playerLoginServiceFailure();

    const gameSession = gameResponse.data as {
      readonly id: string;
      readonly name: string;
      readonly status: string;
      readonly game_join_code_status: string;
    } | null;
    if (!gameSession?.id) {
      return failedPlayerLoginResponse(
        serviceClient,
        throttleBuckets,
        dependencies,
      );
    }

    const playerResponse = await serviceClient
      .from("players")
      .select("id,display_name,roster_label,player_identifier,status")
      .eq("game_session_id", gameSession.id)
      .eq("player_identifier_normalized", playerIdentifierNormalized)
      .eq("status", "active")
      .maybeSingle();
    if (playerResponse.error) return playerLoginServiceFailure();

    const player = playerResponse.data as {
      readonly id: string;
      readonly display_name: string;
      readonly roster_label: string | null;
      readonly player_identifier: string;
      readonly status: string;
    } | null;
    if (
      !player?.id ||
      !isBrowserSafePlayerIdentifier(player.player_identifier) ||
      player.status !== "active"
    ) {
      return failedPlayerLoginResponse(
        serviceClient,
        throttleBuckets,
        dependencies,
      );
    }

    const credentialResponse = await serviceClient
      .from("player_access_credentials")
      .select(
        "id,player_id,status,normalized_student_code_hash,credential_version,credential_salt,credential_verifier,credential_iterations",
      )
      .eq("game_session_id", gameSession.id)
      .eq("player_id", player.id)
      .eq("status", "active")
      .maybeSingle();
    if (credentialResponse.error) return playerLoginServiceFailure();

    const credential = credentialResponse.data as PlayerCredentialRow | null;
    if (!credential?.id || credential.player_id !== player.id) {
      return failedPlayerLoginResponse(
        serviceClient,
        throttleBuckets,
        dependencies,
      );
    }

    const credentialVerified = await verifyCredentialAndUpgradeIfNeeded(
      serviceClient,
      gameSession.id,
      player.id,
      normalizedAccessCode,
      credential,
      hashValue,
      dependencies,
    );
    if (!credentialVerified.ok) {
      if (credentialVerified.serviceFailure) return playerLoginServiceFailure();
      return failedPlayerLoginResponse(
        serviceClient,
        throttleBuckets,
        dependencies,
      );
    }

    const sessionResult = await createPlayerSession(
      serviceClient,
      gameSession.id,
      player.id,
      {
        generateSessionToken: dependencies.generateSessionToken,
        hashValue,
        now: dependencies.now,
      },
    );
    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    await (dependencies.recordSuccess ?? recordAuthenticationSuccess)(
      serviceClient,
      throttleBuckets,
    );

    return jsonResponse<PlayerLoginSuccessBody>(200, {
      ok: true,
      gameSession: {
        name: gameSession.name,
        status: gameSession.status,
      },
      player: {
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        playerIdentifier: player.player_identifier,
        status: player.status,
      },
      session: {
        token: sessionResult.sessionToken,
        status: "active",
        expiresAt: sessionResult.expiresAt,
      },
    }, privatePlayerResponseHeaders());
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    return playerLoginServiceFailure();
  }
}

export async function readPlayerLoginRequestBody(
  request: Request,
): Promise<PlayerLoginRequestBody> {
  let value: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4_096) {
      throw new EdgeActivationError(
        "request_body_too_large",
        "Player login requests are limited to 4096 bytes.",
        413,
      );
    }
    value = JSON.parse(raw);
  } catch (error) {
    if (error instanceof EdgeActivationError) throw error;
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  const allowedKeys = new Set([
    "gameJoinCode",
    "gameCode",
    "sessionCode",
    "playerIdentifier",
    "playerId",
    "rfidCardId",
    "rfidId",
    "cardId",
    "externalPlayerId",
    "accessCode",
    "studentCode",
    "playerAccessCode",
    "pin",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new EdgeActivationError(
      "unknown_request_field",
      "Request body contains an unsupported field.",
      400,
    );
  }

  const gameJoinCode = parseRequiredText(
    value.gameJoinCode ?? value.gameCode ?? value.sessionCode,
    "game_join_code_required",
    "gameJoinCode is required.",
  );
  const playerIdentifier = parseRequiredText(
    value.playerIdentifier ?? value.playerId ?? value.rfidCardId ??
      value.rfidId ?? value.cardId ?? value.externalPlayerId,
    "player_identifier_required",
    "playerIdentifier is required.",
  );
  const accessCode = parseRequiredText(
    value.accessCode ?? value.studentCode ?? value.playerAccessCode ?? value.pin,
    "player_access_code_required",
    "accessCode is required.",
  );

  if (
    gameJoinCode.length > 32 ||
    playerIdentifier.length > 128 ||
    accessCode.length > 128
  ) {
    throw new EdgeActivationError(
      "login_field_too_long",
      "One or more login fields exceed the allowed length.",
      400,
    );
  }

  return { gameJoinCode, playerIdentifier, accessCode };
}

async function verifyCredentialAndUpgradeIfNeeded(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  playerId: string,
  normalizedAccessCode: string,
  credential: PlayerCredentialRow,
  hashValue: typeof sha256Hex,
  dependencies: PlayerLoginDependencies,
): Promise<{ readonly ok: boolean; readonly serviceFailure: boolean }> {
  if (credential.credential_version === "pbkdf2-sha256-v2") {
    const verified = await (
      dependencies.verifyCredential ?? verifyPlayerCredential
    )(normalizedAccessCode, credential);
    return { ok: verified, serviceFailure: false };
  }

  if (!isLegacyPlayerCredential(credential)) {
    return { ok: false, serviceFailure: true };
  }

  const legacyHash = await hashValue(normalizedAccessCode);
  if (!constantTimeStringEqual(
    legacyHash,
    credential.normalized_student_code_hash,
  )) {
    return { ok: false, serviceFailure: false };
  }

  const createMaterial = dependencies.createCredentialMaterial ??
    createPlayerCredentialMaterial;
  const material = await createMaterial(normalizedAccessCode);
  const upgradeResponse = await serviceClient.rpc<boolean>(
    "upgrade_player_access_credential_v2",
    {
      p_credential_id: credential.id,
      p_game_session_id: gameSessionId,
      p_player_id: playerId,
      p_expected_legacy_hash: legacyHash,
      p_lookup_digest: material.lookupDigest,
      p_credential_version: material.credentialVersion,
      p_credential_salt: material.salt,
      p_credential_verifier: material.verifier,
      p_credential_iterations: material.iterations,
    },
  );
  if (upgradeResponse.error || upgradeResponse.data !== true) {
    return { ok: false, serviceFailure: true };
  }
  return { ok: true, serviceFailure: false };
}

async function failedPlayerLoginResponse(
  serviceClient: EdgeSupabaseClient,
  buckets: readonly AuthenticationThrottleBucket[],
  dependencies: PlayerLoginDependencies,
): Promise<Response> {
  const failure = await (
    dependencies.recordFailure ?? recordAuthenticationFailure
  )(serviceClient, buckets);
  return failure.retryAfterSeconds > 0
    ? authenticationThrottledResponse(failure)
    : invalidPlayerLoginResponse();
}

function authenticationThrottledResponse(
  decision: AuthenticationThrottleDecision,
): Response {
  return jsonResponse(429, {
    ok: false,
    error: {
      code: "authentication_temporarily_locked",
      message: "Too many failed sign-in attempts. Try again later.",
      retryable: true,
    },
  }, {
    "retry-after": String(Math.max(1, decision.retryAfterSeconds)),
    "x-ratelimit-reset": decision.lockedUntil || "",
    "vary": "Origin, X-Econovaria-Device-Id",
  });
}

function invalidPlayerLoginResponse(): Response {
  return jsonError(401, {
    code: "invalid_player_login",
    message: "Game Code, Player ID, or Access Code is invalid.",
    retryable: false,
  });
}

function playerLoginServiceFailure(): Response {
  return jsonError(500, {
    code: "player_login_failed",
    message: "Player login failed.",
    retryable: false,
  });
}

async function createPlayerSession(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  playerId: string,
  options: {
    readonly generateSessionToken?: () => string;
    readonly hashValue: typeof sha256Hex;
    readonly now?: () => number;
  },
): Promise<
  | {
    readonly ok: true;
    readonly sessionToken: string;
    readonly expiresAt: string;
  }
  | {
    readonly ok: false;
    readonly status: number;
    readonly error: EdgeErrorBody["error"];
  }
> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sessionToken = (options.generateSessionToken ?? generateSessionToken)();
    const sessionTokenHash = await options.hashValue(sessionToken);
    const requestedExpiresAt = new Date(
      (options.now ?? Date.now)() + 12 * 60 * 60 * 1000,
    ).toISOString();

    const sessionResponse = await serviceClient.rpc<readonly {
      readonly session_id: string;
      readonly expires_at: string;
    }[]>("create_player_session_v2", {
      p_game_session_id: gameSessionId,
      p_player_id: playerId,
      p_session_token_hash: sessionTokenHash,
      p_expires_at: requestedExpiresAt,
    });
    const row = Array.isArray(sessionResponse.data)
      ? sessionResponse.data[0]
      : sessionResponse.data;

    if (!sessionResponse.error && row?.expires_at) {
      return {
        ok: true,
        sessionToken,
        expiresAt: row.expires_at,
      };
    }

    const message = sessionResponse.error?.message?.toLowerCase() ?? "";
    if (!message.includes("duplicate") && !message.includes("unique")) {
      return {
        ok: false,
        status: 500,
        error: {
          code: "player_login_failed",
          message: "Player login failed.",
          retryable: false,
        },
      };
    }
  }

  return {
    ok: false,
    status: 409,
    error: {
      code: "player_session_generation_conflict",
      message: "A unique Player session could not be generated.",
      retryable: true,
    },
  };
}

function constantTimeStringEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.byteLength, rightBytes.byteLength);
  let difference = leftBytes.byteLength ^ rightBytes.byteLength;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function generateSessionToken(): string {
  return `ps_${generateCompactCode(32).toLowerCase()}`;
}

function generateCompactCode(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes]
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
}

function privatePlayerResponseHeaders(): HeadersInit {
  return {
    "cache-control": "private, no-store, max-age=0",
    "pragma": "no-cache",
    "vary": "authorization, x-player-session-token, x-econovaria-device-id",
  };
}
