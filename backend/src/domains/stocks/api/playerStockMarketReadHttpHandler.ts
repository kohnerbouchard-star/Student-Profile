import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  invalidPlayerSessionResponse,
  readPlayerSessionTokenFromRequest,
  resolveActivePlayerSession,
} from "../../players/api/playerSessionHttpHelpers.ts";
import {
  type StockMarketPlayerReadAction,
  StockMarketPlayerReadError,
  type StockMarketPlayerReadRepository,
  type StockMarketPlayerReadSuccessBody,
} from "../contracts/stockMarketPlayerReadContracts.ts";
import {
  SupabaseStockMarketPlayerReadRepository,
} from "../infrastructure/supabaseStockMarketPlayerReadRepository.ts";

const DEFAULT_PLAYER_STOCK_READ_LIMIT = 100;
const MAX_PLAYER_STOCK_READ_LIMIT = 500;

interface PlayerStockMarketReadHttpDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: () =>
    | { readonly ok: true; readonly value: SupabaseEnv }
    | { readonly ok: false; readonly missing: readonly string[] };
  readonly hashSessionToken?: (sessionToken: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    serviceClient: EdgeSupabaseClient,
    sessionTokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => StockMarketPlayerReadRepository;
}

interface ResolvedPlayerSession {
  readonly session: {
    readonly id: string;
    readonly game_session_id: string;
    readonly player_id: string;
  };
}

export async function handlePlayerStockMarketReadRequest(
  request: Request,
  action: StockMarketPlayerReadAction,
  dependencies: PlayerStockMarketReadHttpDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to read player stock data.",
      retryable: false,
    });
  }

  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player stock reads must not send the stock market runner secret.",
      retryable: false,
    });
  }

  try {
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const sessionToken = readPlayerSessionTokenFromRequest(request);

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
    }

    const url = new URL(request.url);
    const gameSessionId = readSingleRequiredQueryText(
      url.searchParams,
      "gameSessionId",
    );
    const playerSessionId = readSingleRequiredQueryText(
      url.searchParams,
      "playerSessionId",
    );
    const limit = readOptionalLimit(url.searchParams);
    const serviceClient = dependencies.createServiceClient(envResult.value);
    const sessionTokenHash = await (dependencies.hashSessionToken ?? sha256Hex)(
      sessionToken,
    );
    const sessionResult = await (dependencies.resolvePlayerSession ??
      resolveActivePlayerSession)(serviceClient, sessionTokenHash);

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    assertRequestedSessionMatchesResolvedSession(
      gameSessionId,
      playerSessionId,
      sessionResult,
    );

    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabaseStockMarketPlayerReadRepository(serviceClient as any);
    const result = await repository.read({
      action,
      gameSessionId,
      playerSessionId,
      limit,
    });

    return jsonResponse<StockMarketPlayerReadSuccessBody>(200, {
      ok: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof StockMarketPlayerReadError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }

    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "player_stock_read_failed",
      message: "Player stock data could not be loaded.",
      retryable: false,
    });
  }
}


function assertRequestedSessionMatchesResolvedSession(
  gameSessionId: string,
  playerSessionId: string,
  sessionResult: ResolvedPlayerSession,
): void {
  if (
    sessionResult.session.game_session_id !== gameSessionId ||
    sessionResult.session.id !== playerSessionId
  ) {
    throw new EdgeActivationError(
      "invalid_player_session_scope",
      "Requested player session does not match the authenticated player session.",
      401,
      false,
    );
  }
}

function readSingleRequiredQueryText(
  searchParams: URLSearchParams,
  fieldName: "gameSessionId" | "playerSessionId",
): string {
  const values = searchParams.getAll(fieldName);

  if (values.length !== 1) {
    throw invalidRequest(
      `Exactly one ${fieldName} query parameter is required.`,
    );
  }

  const value = values[0]?.trim() ?? "";

  if (!value) {
    throw invalidRequest(`${fieldName} is required.`);
  }

  return value;
}

function readOptionalLimit(searchParams: URLSearchParams): number {
  const values = searchParams.getAll("limit");

  if (values.length === 0) {
    return DEFAULT_PLAYER_STOCK_READ_LIMIT;
  }

  if (values.length > 1) {
    throw invalidRequest("At most one limit query parameter is allowed.");
  }

  const rawLimit = values[0]?.trim() ?? "";
  const limit = Number(rawLimit);

  if (!rawLimit || !Number.isInteger(limit) || limit < 1) {
    throw invalidRequest("limit must be a positive integer when provided.");
  }

  return Math.min(limit, MAX_PLAYER_STOCK_READ_LIMIT);
}

function invalidRequest(message: string): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_player_stock_read_request",
    message,
    400,
    false,
  );
}
