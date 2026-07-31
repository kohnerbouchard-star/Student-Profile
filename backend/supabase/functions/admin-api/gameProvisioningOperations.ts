import {
  handleLicensingActivationRequest,
} from "../../../src/domains/licensing/application/licensingActivationRouteAdapter.ts";
import {
  createLicensingActivationRouteAdapterDependencies,
} from "../../../src/domains/licensing/infrastructure/licensingActivationFactory.ts";
import {
  createSupabaseLicensingActivationRepository,
  type SupabaseLicensingActivationRepositoryClient,
} from "../../../src/domains/licensing/infrastructure/licensingRepository.ts";

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;

interface GameProvisioningOperationInput {
  readonly request: Request;
  readonly path: string;
  readonly staffUserId: string;
}

interface OperationResult {
  readonly handled: boolean;
  readonly status?: number;
  readonly body?: Record<string, unknown>;
}

interface GameRow {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly status?: unknown;
  readonly game_join_code?: unknown;
  readonly game_join_code_status?: unknown;
  readonly created_at?: unknown;
  readonly updated_at?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function idempotencyKey(request: Request): string {
  return text(
    request.headers.get("x-idempotency-key") ||
      request.headers.get("x-request-id"),
  );
}

export async function handleGameProvisioningOperation(
  service: any,
  operation: GameProvisioningOperationInput,
): Promise<OperationResult> {
  if (operation.path !== "/games" || operation.request.method !== "POST") {
    return { handled: false };
  }

  const key = idempotencyKey(operation.request);
  if (!IDEMPOTENCY_PATTERN.test(key)) {
    return {
      handled: true,
      status: 400,
      body: {
        code: "invalid_idempotency_key",
        message: "Game creation requires an idempotency key between 8 and 128 characters.",
      },
    };
  }

  let body: unknown;
  try {
    body = await operation.request.clone().json();
  } catch {
    return {
      handled: true,
      status: 400,
      body: {
        code: "invalid_game_request",
        message: "Game creation requires a valid JSON body.",
      },
    };
  }

  const activationRepository = createSupabaseLicensingActivationRepository(
    service as SupabaseLicensingActivationRepositoryClient,
  );
  const activationResult = await handleLicensingActivationRequest(
    body,
    {
      staffUserId: operation.staffUserId,
      requestId: key,
      source: "admin_api_authenticated_game_selector_v1",
    },
    createLicensingActivationRouteAdapterDependencies({ activationRepository }),
  );

  if (!activationResult.body.ok) {
    return {
      handled: true,
      status: activationResult.httpStatus,
      body: activationResult.body as unknown as Record<string, unknown>,
    };
  }

  const gameId = activationResult.body.activation.gameSessionId;
  const completion = await service.rpc("complete_staff_onboarding_v1", {
    p_staff_user_id: operation.staffUserId,
    p_game_session_id: gameId,
  });
  if (completion.error || completion.data !== true) {
    return {
      handled: true,
      status: 503,
      body: {
        code: "staff_onboarding_completion_failed",
        message: "The game was created, but administrator activation did not finish. Retry with the same request.",
        retryable: true,
      },
    };
  }

  const gameResponse = await service
    .from("game_sessions")
    .select("id,name,status,game_join_code,game_join_code_status,created_at,updated_at")
    .eq("id", gameId)
    .eq("owner_staff_user_id", operation.staffUserId)
    .maybeSingle();
  const game = (gameResponse.data ?? {}) as GameRow;
  const requestBody = isRecord(body) ? body : {};
  const joinCode = text(game.game_join_code);

  return {
    handled: true,
    status: activationResult.httpStatus,
    body: {
      ok: true,
      activation: activationResult.body.activation,
      data: {
        game: {
          id: gameId,
          gameId,
          name: text(game.name) || text(requestBody.gameName) || "Game session",
          status: text(game.status) || "active",
          lifecycleState: text(game.status) || "active",
          provisioningStatus: "ready",
          joinCodeStatus: text(game.game_join_code_status) || "active",
          joinCode,
          gameCode: joinCode,
          createdAt: text(game.created_at) || null,
          updatedAt: text(game.updated_at) || null,
        },
        joinCode,
        joinCodeStatus: text(game.game_join_code_status) || "active",
        replayed: activationResult.httpStatus === 200,
      },
    },
  };
}
