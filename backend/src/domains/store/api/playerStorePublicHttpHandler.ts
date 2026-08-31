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
import type { PlayerStoreFundingPublicRepository } from "../contracts/playerStoreFundingPublicContracts.ts";
import type { PlayerStoreOfferProductPublicRepository } from "../contracts/playerStoreOfferPublicContracts.ts";
import {
  PlayerStorePublicError,
  type PlayerStorePublicReadRepository,
} from "../contracts/playerStorePublicContracts.ts";
import { SupabasePlayerStoreFundingPublicRepository } from "../infrastructure/supabasePlayerStoreFundingPublicRepository.ts";
import { SupabasePlayerStoreOfferProductPublicRepository } from "../infrastructure/supabasePlayerStoreOfferProductPublicRepository.ts";
import { SupabasePlayerStorePublicReadRepository } from "../infrastructure/supabasePlayerStorePublicReadRepository.ts";
import {
  readPlayerStoreExpectedVersion,
  readPlayerStoreFundingAllocations,
  readPlayerStoreIdempotencyKey,
  readPlayerStoreOfferKey,
  readPlayerStoreOfferQuoteKey,
  readPlayerStorePublicRequestBody,
  readPlayerStoreQuantity,
  readPlayerStoreQuoteKey,
  readPlayerStoreStrictQuantity,
  validatePlayerStorePublicMethodAndBody,
  validatePlayerStorePublicRequestEnvelope,
} from "./playerStorePublicRequestValidation.ts";
import {
  playerStorePrivateJsonResponse,
  projectPlayerStoreBusinessFundingQuote,
  projectPlayerStoreBusinessFundingReceipt,
  projectPlayerStorePublicOfferProduct,
  projectPlayerStoreSeededFundingQuote,
  projectPlayerStoreSeededFundingReceipt,
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
  readonly createReadRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerStorePublicReadRepository;
  readonly createOfferProductRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerStoreOfferProductPublicRepository;
  readonly createFundingRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerStoreFundingPublicRepository;
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
    const readRepository = dependencies.createReadRepository
      ? dependencies.createReadRepository(client)
      : new SupabasePlayerStorePublicReadRepository(client as never);
    const offerProductRepository = dependencies.createOfferProductRepository
      ? dependencies.createOfferProductRepository(client)
      : new SupabasePlayerStoreOfferProductPublicRepository(client as never);
    const fundingRepository = dependencies.createFundingRepository
      ? dependencies.createFundingRepository(client)
      : new SupabasePlayerStoreFundingPublicRepository(client as never);
    const publicScope = {
      gameSessionId: scope.gameId,
      playerId: scope.playerUuid,
    };
    if (route.kind === "items") {
      const [items, products] = await Promise.all([
        readRepository.listItems(publicScope),
        offerProductRepository.listOfferProducts(publicScope),
      ]);
      return playerStorePrivateJsonResponse(200, {
        ok: true,
        items,
        products: products.map(projectPlayerStorePublicOfferProduct),
      });
    }

    if (route.kind === "quotes") {
      const quote = await fundingRepository.createSystemOfferQuote({
        ...publicScope,
        offerKey: readPlayerStoreOfferKey(body.offerKey),
        quantity: readPlayerStoreStrictQuantity(body.quantity),
        expectedVersion: readPlayerStoreExpectedVersion(body.expectedVersion),
        allocations: readPlayerStoreFundingAllocations(body.allocations),
        idempotencyKey: readPlayerStoreIdempotencyKey(body.idempotencyKey),
      });
      return playerStorePrivateJsonResponse(200, {
        ok: true,
        quote: projectPlayerStoreSeededFundingQuote(quote),
      });
    }

    if (route.kind === "purchases") {
      if (request.method === "GET") {
        const purchases = await readRepository.listPurchases({
          ...publicScope,
          limit: 25,
        });
        return playerStorePrivateJsonResponse(200, { ok: true, purchases });
      }

      const receipt = await fundingRepository.settleSystemOfferPurchase({
        ...publicScope,
        quoteKey: readPlayerStoreQuoteKey(body.quoteKey),
        idempotencyKey: readPlayerStoreIdempotencyKey(body.idempotencyKey),
      });
      const publicReceipt = projectPlayerStoreSeededFundingReceipt(receipt);
      return playerStorePrivateJsonResponse(200, {
        ok: true,
        message: publicReceipt.alreadyCompleted
          ? "Purchase was already completed."
          : "Purchase complete.",
        receipt: publicReceipt,
        refreshRequired: true,
      });
    }

    if (route.kind === "offerQuotes") {
      const quote = await fundingRepository.createBusinessOfferQuote({
        ...publicScope,
        offerKey: readPlayerStoreOfferKey(body.offerKey),
        quantity: readPlayerStoreStrictQuantity(body.quantity),
        expectedVersion: readPlayerStoreExpectedVersion(body.expectedVersion),
        allocations: readPlayerStoreFundingAllocations(body.allocations),
        idempotencyKey: readPlayerStoreIdempotencyKey(body.idempotencyKey),
      });
      return playerStorePrivateJsonResponse(200, {
        ok: true,
        quote: projectPlayerStoreBusinessFundingQuote(quote),
      });
    }

    if (route.kind === "offerPurchases") {
      const receipt = await fundingRepository.settleBusinessOfferPurchase({
        ...publicScope,
        quoteKey: readPlayerStoreOfferQuoteKey(body.quoteKey),
        idempotencyKey: readPlayerStoreIdempotencyKey(body.idempotencyKey),
      });
      const publicReceipt = projectPlayerStoreBusinessFundingReceipt(receipt);
      return playerStorePrivateJsonResponse(200, {
        ok: true,
        message: publicReceipt.alreadyCompleted
          ? "Purchase was already completed."
          : "Purchase complete.",
        receipt: publicReceipt,
        refreshRequired: true,
      });
    }

    const receipt = await fundingRepository.readBusinessOfferReceipt({
      ...publicScope,
      receiptKey: route.receiptKey,
    });
    return playerStorePrivateJsonResponse(200, {
      ok: true,
      receipt: projectPlayerStoreBusinessFundingReceipt(receipt),
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
