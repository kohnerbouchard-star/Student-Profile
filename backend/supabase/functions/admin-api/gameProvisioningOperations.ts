const VALID_DIFFICULTIES = new Set(["easy", "moderate", "hard", "insane"]);
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const CANONICAL_PACK_ID = "econovaria.beta-seed-pack.v1";

interface GameProvisioningInput {
  readonly name: string;
  readonly difficultyPreset: string;
  readonly stockMarketWindow: Record<string, unknown>;
  readonly attendanceWindow: Record<string, unknown>;
  readonly businessMarketWindow: Record<string, unknown>;
  readonly newsSchedule: Record<string, unknown>;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function parseInput(value: unknown):
  | { readonly ok: true; readonly input: GameProvisioningInput }
  | { readonly ok: false; readonly code: string; readonly message: string } {
  if (!isRecord(value)) {
    return {
      ok: false,
      code: "invalid_game_request",
      message: "Game creation requires a JSON object.",
    };
  }

  const name = text(value.name ?? value.gameName);
  if (name.length < 1 || name.length > 120) {
    return {
      ok: false,
      code: "invalid_game_name",
      message: "Game name must contain between 1 and 120 characters.",
    };
  }

  const difficultyPreset = text(value.difficultyPreset ?? value.difficulty)
    .toLowerCase();
  if (!VALID_DIFFICULTIES.has(difficultyPreset)) {
    return {
      ok: false,
      code: "invalid_game_difficulty",
      message: "Difficulty must be easy, moderate, hard, or insane.",
    };
  }

  const stockMarketWindow = objectOrEmpty(value.stockMarketWindow);
  const timezone = stockMarketWindow.timezone ?? value.timezone;
  if (!validTimeZone(timezone)) {
    return {
      ok: false,
      code: "invalid_stock_market_timezone",
      message: "A valid IANA stock-market timezone is required.",
    };
  }

  return {
    ok: true,
    input: {
      name,
      difficultyPreset,
      stockMarketWindow: {
        ...stockMarketWindow,
        timezone: timezone.trim(),
      },
      attendanceWindow: objectOrEmpty(value.attendanceWindow),
      businessMarketWindow: objectOrEmpty(value.businessMarketWindow),
      newsSchedule: objectOrEmpty(value.newsSchedule),
    },
  };
}

function idempotencyKey(request: Request): string {
  return text(
    request.headers.get("x-idempotency-key") ||
      request.headers.get("x-request-id"),
  );
}

function normalizeRpcResult(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return isRecord(value[0]) ? value[0] : {};
  return isRecord(value) ? value : {};
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

  const parsed = parseInput(body);
  if (parsed.ok === false) {
    return {
      handled: true,
      status: 400,
      body: { code: parsed.code, message: parsed.message },
    };
  }

  const response = await service.rpc("create_provisioned_game_v1", {
    p_staff_user_id: operation.staffUserId,
    p_game_name: parsed.input.name,
    p_game_settings: {
      difficulty_preset: parsed.input.difficultyPreset,
      stock_market_window: parsed.input.stockMarketWindow,
      attendance_window: parsed.input.attendanceWindow,
      business_market_window: parsed.input.businessMarketWindow,
      news_schedule: parsed.input.newsSchedule,
    },
    p_idempotency_key: key,
    p_pack_id: CANONICAL_PACK_ID,
  });

  if (response.error) {
    return {
      handled: true,
      status: 503,
      body: {
        code: "game_provisioning_unavailable",
        message: "The multiplayer game could not be provisioned.",
        retryable: true,
      },
    };
  }

  const result = normalizeRpcResult(response.data);
  const outcome = text(result.outcome);
  if (outcome === "failed" || outcome === "failed_replay") {
    return {
      handled: true,
      status: 503,
      body: {
        code: "game_provisioning_failed",
        message: "The multiplayer game was not created because provisioning did not complete.",
        retryable: outcome === "failed",
        data: {
          provisioningStatus: "failed",
          transactionRolledBack: result.transactionRolledBack === true,
        },
      },
    };
  }

  const gameId = text(result.gameSessionId);
  const gameName = text(result.gameName) || parsed.input.name;
  const provisioningStatus = text(result.provisioningStatus) || "ready";
  const joinCode = text(result.joinCode);
  const replayed = outcome === "replayed";

  if (!gameId || provisioningStatus !== "ready") {
    return {
      handled: true,
      status: 503,
      body: {
        code: "game_provisioning_incomplete",
        message: "The multiplayer game did not reach a ready state.",
        retryable: false,
      },
    };
  }

  return {
    handled: true,
    status: replayed ? 200 : 201,
    body: {
      data: {
        game: {
          id: gameId,
          gameId,
          name: gameName,
          status: "active",
          lifecycleState: "active",
          provisioningStatus,
          packId: text(result.packId),
          packVersion: text(result.packVersion),
          joinCodeStatus: "active",
          joinCode,
          gameCode: joinCode,
        },
        joinCode,
        joinCodeStatus: "active",
        joinCodeReissueRequired: result.joinCodeReissueRequired === true,
        counts: isRecord(result.counts) ? result.counts : {},
        contentGates: isRecord(result.contentGates) ? result.contentGates : {},
        replayed,
      },
    },
  };
}
