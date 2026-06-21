import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { extractBearerToken } from "../../../platform/supabase/edgeAuth.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readSupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { resolveActivePlayerSession } from "../../players/api/playerSessionHttpHelpers.ts";
import type {
  StorePurchaseHistoryItemDto,
  StorePurchaseResponseDto,
  StoreQuoteResponseDto,
} from "../contracts/storePurchaseContracts.ts";
import {
  StorePurchasePersistenceError,
  SupabaseStorePurchaseRepository,
} from "../infrastructure/supabaseStorePurchaseRepository.ts";

interface PlayerStorePurchaseDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
}

interface StorePurchaseRpcRow {
  readonly purchase_id: string;
  readonly quote_id: string;
  readonly store_item_id: string;
  readonly quantity: number;
  readonly final_unit_price: number | string;
  readonly final_total_price: number | string;
  readonly currency_code: string;
  readonly ledger_entry_id: string;
  readonly inventory_holding_id: string;
  readonly inventory_quantity_owned: number;
  readonly completed_at: string;
}

interface StorePurchaseQuoteBody {
  readonly itemId: string;
  readonly quantity: number;
}

interface StorePurchaseBody {
  readonly quoteId: string;
  readonly idempotencyKey: string;
  readonly clientSubmittedAt: string | null;
}

interface PlayerStorePurchaseHistoryBody {
  readonly ok: true;
  readonly purchases: readonly StorePurchaseHistoryItemDto[];
}

export async function handlePlayerStoreQuoteRequest(
  request: Request,
  dependencies: PlayerStorePurchaseDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to create a store purchase quote.",
      retryable: false,
    });
  }

  try {
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return missingRuntimeConfigResponse();
    }

    const sessionResult = await resolvePlayerRequest(request, dependencies, envResult.value);

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    const body = await readStoreQuoteBody(request);
    const repository = new SupabaseStorePurchaseRepository(
      sessionResult.serviceClient as any,
    );
    const quote = await repository.createQuote({
      gameSessionId: sessionResult.gameSession.id,
      playerId: sessionResult.player.id,
      itemId: body.itemId,
      quantity: body.quantity,
      nowIso: new Date().toISOString(),
    });

    const itemResponse = await sessionResult.serviceClient
      .from("store_items")
      .select("id,name")
      .eq("game_session_id", sessionResult.gameSession.id)
      .eq("id", quote.storeItemId)
      .maybeSingle();

    if (itemResponse.error) {
      return jsonError(500, {
        code: "store_quote_failed",
        message: "Store purchase quote could not be created.",
        retryable: false,
      });
    }

    const item = itemResponse.data as { readonly id: string; readonly name: string } | null;

    return jsonResponse<StoreQuoteResponseDto & { readonly ok: true }>(200, {
      ok: true,
      quoteId: quote.id,
      itemId: quote.storeItemId,
      itemName: item?.name ?? "Unknown item",
      quantity: quote.quantity,
      baseUnitPrice: quote.pricing.baseUnitPrice,
      inflationMultiplier: quote.pricing.inflationMultiplier,
      locationMultiplier: quote.pricing.locationMultiplier,
      scarcityMultiplier: quote.pricing.scarcityMultiplier,
      discountAmount: quote.pricing.discountAmount,
      finalUnitPrice: quote.pricing.finalUnitPrice,
      finalTotalPrice: quote.pricing.finalTotalPrice,
      currencyCode: quote.pricing.currencyCode,
      expiresAt: quote.expiresAt,
      pricingVersion: quote.pricing.pricingVersion,
    });
  } catch (error) {
    if (error instanceof StorePurchasePersistenceError) {
      return mapStorePersistenceError(error);
    }

    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "store_quote_failed",
      message: "Store purchase quote could not be created.",
      retryable: false,
    });
  }
}

export async function handlePlayerStorePurchaseRequest(
  request: Request,
  dependencies: PlayerStorePurchaseDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to complete a store purchase.",
      retryable: false,
    });
  }

  try {
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return missingRuntimeConfigResponse();
    }

    const sessionResult = await resolvePlayerRequest(request, dependencies, envResult.value);

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    const body = await readStorePurchaseBody(request);
    const rpcResponse = await sessionResult.serviceClient.rpc<StorePurchaseRpcRow[]>(
      "purchase_quoted_store_item",
      {
        p_game_session_id: sessionResult.gameSession.id,
        p_player_id: sessionResult.player.id,
        p_quote_id: body.quoteId,
        p_idempotency_key: body.idempotencyKey,
        p_client_submitted_at: body.clientSubmittedAt,
        p_request_metadata: {
          route: "players.me.store.purchases",
          requestReceivedAt: new Date().toISOString(),
        },
      },
    );

    if (rpcResponse.error || !rpcResponse.data?.[0]) {
      return mapStorePurchaseRpcError(rpcResponse.error?.message ?? "STORE_PURCHASE_FAILED");
    }

    const purchase = rpcResponse.data[0];

    return jsonResponse<StorePurchaseResponseDto & { readonly ok: true }>(200, {
      ok: true,
      message: "Purchase complete.",
      purchaseId: purchase.purchase_id,
      quoteId: purchase.quote_id,
      finalTotalPrice: Number(purchase.final_total_price),
      currencyCode: purchase.currency_code,
      refreshRequired: true,
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "purchase_failed",
      message: "Store purchase could not be completed.",
      retryable: false,
    });
  }
}

export async function handlePlayerStorePurchaseHistoryRequest(
  request: Request,
  dependencies: PlayerStorePurchaseDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load store purchase history.",
      retryable: false,
    });
  }

  try {
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return missingRuntimeConfigResponse();
    }

    const sessionResult = await resolvePlayerRequest(request, dependencies, envResult.value);

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    const repository = new SupabaseStorePurchaseRepository(
      sessionResult.serviceClient as any,
    );
    const purchases = await repository.listPlayerPurchases({
      gameSessionId: sessionResult.gameSession.id,
      playerId: sessionResult.player.id,
      limit: 25,
    });

    return jsonResponse<PlayerStorePurchaseHistoryBody>(200, {
      ok: true,
      purchases,
    });
  } catch (error) {
    if (error instanceof StorePurchasePersistenceError) {
      return mapStorePersistenceError(error);
    }

    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "store_purchase_history_failed",
      message: "Store purchase history could not be loaded.",
      retryable: false,
    });
  }
}

async function resolvePlayerRequest(
  request: Request,
  dependencies: PlayerStorePurchaseDependencies,
  env: SupabaseEnv,
): Promise<
  | {
      readonly ok: true;
      readonly serviceClient: EdgeSupabaseClient;
      readonly gameSession: { readonly id: string };
      readonly player: { readonly id: string };
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly retryable: boolean;
      };
    }
> {
  const sessionToken = extractBearerToken(request.headers.get("authorization"));

  if (!sessionToken) {
    return {
      ok: false,
      status: 401,
      error: {
        code: "invalid_player_session",
        message: "Player session is invalid or expired.",
        retryable: false,
      },
    };
  }

  const serviceClient = dependencies.createServiceClient(env);
  const sessionTokenHash = await sha256Hex(sessionToken);
  const playerSession = await resolveActivePlayerSession(serviceClient, sessionTokenHash);

  if (!playerSession.ok) {
    return playerSession;
  }

  return {
    ok: true,
    serviceClient,
    gameSession: { id: playerSession.gameSession.id },
    player: { id: playerSession.player.id },
  };
}

async function readStoreQuoteBody(request: Request): Promise<StorePurchaseQuoteBody> {
  const body = await readJsonObject(request);
  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  const quantity = Number(body.quantity ?? 1);

  if (!itemId) {
    throw new EdgeActivationError(
      "invalid_request",
      "itemId is required.",
      400,
      false,
    );
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new EdgeActivationError(
      "invalid_request",
      "quantity must be a positive integer.",
      400,
      false,
    );
  }

  return { itemId, quantity };
}

async function readStorePurchaseBody(request: Request): Promise<StorePurchaseBody> {
  const body = await readJsonObject(request);
  const quoteId = typeof body.quoteId === "string" ? body.quoteId.trim() : "";
  const idempotencyKey = typeof body.idempotencyKey === "string"
    ? body.idempotencyKey.trim()
    : "";
  const clientSubmittedAt = typeof body.clientSubmittedAt === "string"
    ? body.clientSubmittedAt
    : null;

  if (!quoteId) {
    throw new EdgeActivationError(
      "invalid_request",
      "quoteId is required.",
      400,
      false,
    );
  }

  if (!idempotencyKey) {
    throw new EdgeActivationError(
      "invalid_request",
      "idempotencyKey is required.",
      400,
      false,
    );
  }

  return { quoteId, idempotencyKey, clientSubmittedAt };
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request",
      "Request body must be valid JSON.",
      400,
      false,
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new EdgeActivationError(
      "invalid_request",
      "Request body must be a JSON object.",
      400,
      false,
    );
  }

  return body as Record<string, unknown>;
}

function missingRuntimeConfigResponse(): Response {
  return jsonError(500, {
    code: "missing_edge_runtime_config",
    message: "Classroom API runtime configuration is incomplete.",
    retryable: false,
  });
}

function mapStorePersistenceError(error: StorePurchasePersistenceError): Response {
  if (error.code === "store_quote_item_not_found") {
    return jsonError(404, {
      code: "item_not_found",
      message: "Store item is not available.",
      retryable: false,
    });
  }

  return jsonError(500, {
    code: "store_purchase_failed",
    message: error.message,
    retryable: false,
  });
}

function mapStorePurchaseRpcError(message: string): Response {
  const code = message.toUpperCase();

  if (code.includes("QUOTE_NOT_FOUND")) {
    return jsonError(404, {
      code: "quote_not_found",
      message: "Store quote was not found.",
      retryable: false,
    });
  }

  if (code.includes("QUOTE_EXPIRED")) {
    return jsonError(409, {
      code: "quote_expired",
      message: "Store quote has expired.",
      retryable: false,
    });
  }

  if (code.includes("QUOTE_NOT_USABLE")) {
    return jsonError(409, {
      code: "quote_already_used",
      message: "Store quote is no longer usable.",
      retryable: false,
    });
  }

  if (code.includes("INSUFFICIENT_STOCK")) {
    return jsonError(409, {
      code: "insufficient_stock",
      message: "There is not enough stock for this purchase.",
      retryable: false,
    });
  }

  if (code.includes("INSUFFICIENT_BALANCE")) {
    return jsonError(409, {
      code: "insufficient_balance",
      message: "Balance is too low for this purchase.",
      retryable: false,
    });
  }

  if (code.includes("IDEMPOTENCY_CONFLICT")) {
    return jsonError(409, {
      code: "idempotency_conflict",
      message: "This idempotency key was already used for a different request.",
      retryable: false,
    });
  }

  return jsonError(500, {
    code: "purchase_failed",
    message: "Store purchase could not be completed.",
    retryable: false,
  });
}
