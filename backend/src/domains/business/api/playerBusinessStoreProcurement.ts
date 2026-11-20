import {
  type BusinessStoreQuoteDto,
  type BusinessStoreReceiptDto,
  type PlayerBusinessRepository,
} from "../contracts/playerBusinessContracts.ts";
import {
  assertExactBodyFields,
  readFundingAllocations,
  readIdempotencyKey,
  readInteger,
  readOptionalTimestamp,
  readPublicKey,
  readStoreItemKey,
} from "./playerBusinessStoreProcurementRequest.ts";
import { readBusinessStoreWithdrawalIntent } from "./playerBusinessRequestValidation.ts";
import {
  toBusinessStoreQuote,
  toBusinessStoreReceipt,
} from "./playerBusinessStoreProcurementProjection.ts";

interface BusinessStoreScope {
  readonly gameSessionId: string;
  readonly playerId: string;
}

export async function createBusinessStoreQuote(
  repository: PlayerBusinessRepository,
  scope: BusinessStoreScope,
  body: Record<string, unknown>,
): Promise<BusinessStoreQuoteDto> {
  assertExactBodyFields(
    body,
    ["itemKey", "quantity", "allocations", "idempotencyKey"],
  );
  const result = await repository.execute("create_business_store_quote_v2", {
    p_game_session_id: scope.gameSessionId,
    p_player_id: scope.playerId,
    p_item_key: readStoreItemKey(body.itemKey),
    p_quantity: readInteger(body.quantity, "quantity", 1, 100_000),
    p_allocations: readFundingAllocations(body.allocations),
    p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
  });
  return toBusinessStoreQuote(result);
}

export async function purchaseBusinessStoreQuote(
  repository: PlayerBusinessRepository,
  scope: BusinessStoreScope,
  body: Record<string, unknown>,
): Promise<BusinessStoreReceiptDto> {
  assertExactBodyFields(
    body,
    ["quoteKey", "idempotencyKey"],
    ["clientSubmittedAt"],
  );
  const result = await repository.execute("purchase_business_store_quote_v2", {
    p_game_session_id: scope.gameSessionId,
    p_player_id: scope.playerId,
    p_quote_key: readPublicKey(body.quoteKey, "quoteKey", "bsq"),
    p_idempotency_key: readIdempotencyKey(body.idempotencyKey),
    p_client_submitted_at: readOptionalTimestamp(
      body.clientSubmittedAt,
      "clientSubmittedAt",
    ),
    p_request_metadata: {
      route: "players.me.business.store.purchases.v2",
    },
  });
  return toBusinessStoreReceipt(result);
}

export async function requestBusinessStoreWithdrawal(
  repository: PlayerBusinessRepository,
  scope: BusinessStoreScope,
  businessKey: string,
  body: Record<string, unknown>,
): Promise<void> {
  const intent = readBusinessStoreWithdrawalIntent(body);
  await repository.execute("request_business_store_offer_withdrawal_v2", {
    p_game_session_id: scope.gameSessionId,
    p_business_key: readPublicKey(businessKey, "businessKey", "biz"),
    p_offer_key: intent.offerKey,
    p_mode: intent.mode,
    p_quantity: intent.quantity,
    p_expected_offer_version: intent.expectedOfferVersion,
    p_idempotency_key: intent.idempotencyKey,
  });
}

export {
  projectBusinessFundingQuote,
  projectBusinessFundingReceipt,
} from "./playerBusinessStoreFundingProjection.ts";
export { readFundingAllocations } from "./playerBusinessStoreProcurementRequest.ts";
export {
  toBusinessStoreQuote,
  toBusinessStoreReceipt,
} from "./playerBusinessStoreProcurementProjection.ts";
