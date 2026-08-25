/// <reference lib="dom" />

import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  EdgeActivationError,
  jsonError,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  type PlayerRequestScope,
  resolvePlayerRequestScope,
} from "../../players/api/playerRequestScope.ts";
import { resolveActivePlayerSession } from "../../players/api/playerSessionHttpHelpers.ts";
import type { PlayerStoreOfferPublicRepository } from "../contracts/playerStoreOfferPublicContracts.ts";
import {
  PlayerStorePublicError,
  type PlayerStorePublicRepository,
} from "../contracts/playerStorePublicContracts.ts";
import { SupabasePlayerStoreOfferPublicRepository } from "../infrastructure/supabasePlayerStoreOfferPublicRepository.ts";
import { SupabasePlayerStorePublicRepository } from "../infrastructure/supabasePlayerStorePublicRepository.ts";
import {
  readPlayerStoreExpectedVersion,
  readPlayerStoreIdempotencyKey,
  readPlayerStoreItemKey,
  readPlayerStoreOfferKey,
  readPlayerStoreOfferQuoteKey,
  readPlayerStoreOptionalTimestamp,
  readPlayerStorePublicRequestBody,
  readPlayerStoreQuantity,
  readPlayerStoreQuoteKey,
  readPlayerStoreStrictOptionalTimestamp,
  readPlayerStoreStrictQuantity,
  validatePlayerStorePublicMethodAndBody,
  validatePlayerStorePublicRequestEnvelope,
} from "./playerStorePublicRequestValidation.ts";
import {
  playerStorePrivateJsonResponse,
  projectPlayerStorePublicOfferProduct,
  projectPlayerStorePublicOfferQuote,
  projectPlayerStorePublicOfferReceipt,
} from "./playerStorePublicResponseProjection.ts";
import type { PlayerStorePublicRoute } from "./playerStorePublicRoutePaths.ts";

export interface PlayerStorePublicHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (token: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    client: EdgeSupabaseClient,
    tokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly resolveScope?: (
    request: Request,
    client: EdgeSupabaseClient,
    body: Record<string, unknown>,
  ) => Promise<Pick<PlayerRequestScope, "gameId" | "playerUuid">>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerStorePublicRepository;
  readonly createOfferRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerStoreOfferPublicRepository;
  readonly now?: () => string;
}

export async function handlePlayerStorePublicRequest(
  request: Request,
  route: PlayerStorePublicRoute,
  dependencies: PlayerStorePublicHttpHandlerDependencies,
): Promise<Response> {
  try {
    validatePlayerStorePublicRequestEnvelope(request);
    const body = await readPlayerStorePublicRequestBody(request);
    validatePlayerStorePublicMethodAndBody(route, request.method, body);

    const environment = (dependencies.readEnvironment ?? readSupabaseEnv)();
    if (!environment.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const client = dependencies.createServiceClient(environment.value);
    const scope = await (dependencies.resolveScope ?? defaultResolveScope)(
      request,
      client,
      body,
    );
    const repository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerStorePublicRepository(client as never);
    const publicScope = {
      gameSessionId: scope.gameId,
      playerId: scope.playerUuid,
    };
    const createOfferRepository = () =>
      dependencies.createOfferRepository
        ? dependencies.createOfferRepository(client)
        : new SupabasePlayerStoreOfferPublicRepository(client as never);

    if (route.kind === "items") {
      const [items, products] = await Promise.all([
        repository.listItems(publicScope),
        createOfferRepository().listOfferProducts(publicScope),
      ]);
      return playerStorePrivateJsonResponse(200, {
        ok: true,
        items,
        products: products.map(projectPlayerStorePublicOfferProduct),
      });
    }

    if (route.kind === "quotes") {
      const quote = await repository.createQuote({
        ...publicScope,
        itemKey: readPlayerStoreItemKey(body.itemKey),
        quantity: readPlayerStoreQuantity(body.quantity),
        nowIso: (dependencies.now ?? (() => new Date().toISOString()))(),
      });
      return playerStorePrivateJsonResponse(200, { ok: true, quote });
    }

    if (route.kind === "purchases") {
      if (request.method === "GET") {
        const purchases = await repository.listPurchases({
          ...publicScope,
          limit: 25,
        });
        return playerStorePrivateJsonResponse(200, { ok: true, purchases });
      }

      const receipt = await repository.purchase({
        ...publicScope,
        quoteKey: readPlayerStoreQuoteKey(body.quoteKey),
        idempotencyKey: readPlayerStoreIdempotencyKey(body.idempotencyKey),
        clientSubmittedAt: readPlayerStoreOptionalTimestamp(
          body.clientSubmittedAt,
        ),
      });
      return playerStorePrivateJsonResponse(200, {
        ok: true,
        message: receipt.alreadyCompleted
          ? "Purchase was already completed."
          : "Purchase complete.",
        receipt,
        refreshRequired: true,
      });
    }

    const offerRepository = createOfferRepository();
    if (route.kind === "offerQuotes") {
      const quote = await offerRepository.createBusinessOfferQuote({
        ...publicScope,
        offerKey: readPlayerStoreOfferKey(body.offerKey),
        quantity: readPlayerStoreStrictQuantity(body.quantity),
        expectedVersion: readPlayerStoreExpectedVersion(body.expectedVersion),
        idempotencyKey: readPlayerStoreIdempotencyKey(body.idempotencyKey),
      });
      return playerStorePrivateJsonResponse(200, {
        ok: true,
        quote: projectPlayerStorePublicOfferQuote(quote),
      });
    }

    if (route.kind === "offerPurchases") {
      readPlayerStoreStrictOptionalTimestamp(body.clientSubmittedAt);
      const receipt = await offerRepository.purchaseBusinessOffer({
        ...publicScope,
        offerKey: readPlayerStoreOfferKey(body.offerKey),
        quoteKey: readPlayerStoreOfferQuoteKey(body.quoteKey),
        quantity: readPlayerStoreStrictQuantity(body.quantity),
        expectedVersion: readPlayerStoreExpectedVersion(body.expectedVersion),
        idempotencyKey: readPlayerStoreIdempotencyKey(body.idempotencyKey),
      });
      const publicReceipt = projectPlayerStorePublicOfferReceipt(receipt);
      return playerStorePrivateJsonResponse(200, {
        ok: true,
        message: publicReceipt.alreadyCompleted
          ? "Purchase was already completed."
          : "Purchase complete.",
        receipt: publicReceipt,
        refreshRequired: true,
      });
    }

    const receipt = await offerRepository.readBusinessOfferReceipt({
      ...publicScope,
      receiptKey: route.receiptKey,
    });
    return playerStorePrivateJsonResponse(200, {
      ok: true,
      receipt: projectPlayerStorePublicOfferReceipt(receipt),
    });
  } catch (error) {
    if (error instanceof PlayerStorePublicError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
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
      code: "player_store_request_failed",
      message: "Player Store request failed.",
      retryable: false,
    });
  }
}

function defaultResolveScope(
  request: Request,
  client: EdgeSupabaseClient,
  body: Record<string, unknown>,
): Promise<PlayerRequestScope> {
  return resolvePlayerRequestScope(
    request,
    {
      hashSessionToken: sha256Hex,
      resolvePlayerSession: (tokenHash) =>
        resolveActivePlayerSession(client, tokenHash),
    },
    { body },
  );
}
