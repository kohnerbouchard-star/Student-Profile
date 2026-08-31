import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import type {
  BusinessTreasuryRepositoryV1,
  BusinessTreasuryScopeV1,
} from "../contracts/businessTreasuryContracts.ts";
import { mapBusinessTreasuryDatabaseError } from "./businessTreasuryDatabaseErrors.ts";
import {
  projectBusinessTreasuryAccountMutation,
  projectBusinessTreasuryOrderMutation,
  projectBusinessTreasuryQuoteMutation,
  projectBusinessTreasurySnapshot,
} from "./businessTreasuryProjection.ts";

export class SupabaseBusinessTreasuryRepository
  implements BusinessTreasuryRepositoryV1 {
  constructor(private readonly client: EdgeSupabaseClient) {}

  async readSnapshot(scope: BusinessTreasuryScopeV1) {
    return projectBusinessTreasurySnapshot(
      await this.rpc("get_business_treasury_overview_v1", scopeArgs(scope)),
    );
  }

  async openCheckingAccount(
    input: Parameters<BusinessTreasuryRepositoryV1["openCheckingAccount"]>[0],
  ) {
    return projectBusinessTreasuryAccountMutation(
      await this.rpc("ensure_business_banking_account_v1", {
        ...scopeArgs(input),
        p_currency_code: input.currencyCode,
        p_idempotency_key: input.idempotencyKey,
      }),
    );
  }

  async createQuote(
    input: Parameters<BusinessTreasuryRepositoryV1["createQuote"]>[0],
  ) {
    return projectBusinessTreasuryQuoteMutation(
      await this.rpc("create_business_fx_quote_v1", {
        ...scopeArgs(input),
        p_source_account_key: input.sourceAccountKey,
        p_target_currency_code: input.targetCurrencyCode,
        p_target_account_key: input.targetAccountKey,
        p_source_amount: input.sourceAmount,
        p_product: input.product,
        p_idempotency_key: input.idempotencyKey,
      }),
    );
  }

  async submitStandard(
    input: Parameters<BusinessTreasuryRepositoryV1["submitStandard"]>[0],
  ) {
    return projectBusinessTreasuryOrderMutation(
      await this.consumeQuote("submit_business_standard_fx_order_v1", input),
      "Business standard FX order",
    );
  }

  async executeInstant(
    input: Parameters<BusinessTreasuryRepositoryV1["executeInstant"]>[0],
  ) {
    return projectBusinessTreasuryOrderMutation(
      await this.consumeQuote("execute_business_instant_fx_v1", input),
      "Business instant FX order",
    );
  }

  async cancelStandard(
    input: Parameters<BusinessTreasuryRepositoryV1["cancelStandard"]>[0],
  ) {
    return projectBusinessTreasuryOrderMutation(
      await this.rpc("cancel_business_standard_fx_order_v1", {
        ...scopeArgs(input),
        p_order_key: input.orderKey,
        p_idempotency_key: input.idempotencyKey,
      }),
      "cancelled Business FX order",
    );
  }

  private consumeQuote(
    command:
      | "submit_business_standard_fx_order_v1"
      | "execute_business_instant_fx_v1",
    input: Parameters<BusinessTreasuryRepositoryV1["submitStandard"]>[0],
  ): Promise<unknown> {
    return this.rpc(command, {
      ...scopeArgs(input),
      p_quote_key: input.quoteKey,
      p_idempotency_key: input.idempotencyKey,
    });
  }

  private async rpc(
    command: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    const response = await this.client.rpc<unknown>(command, args);
    if (response.error) throw mapBusinessTreasuryDatabaseError(response.error);
    return response.data;
  }
}

function scopeArgs(
  scope: BusinessTreasuryScopeV1,
): Readonly<Record<string, string>> {
  return {
    p_game_session_id: scope.gameSessionId,
    p_player_id: scope.playerId,
  };
}

export { mapBusinessTreasuryDatabaseError } from "./businessTreasuryDatabaseErrors.ts";
export {
  projectBusinessTreasuryAccountMutation,
  projectBusinessTreasuryOrderMutation,
  projectBusinessTreasuryQuoteMutation,
  projectBusinessTreasurySnapshot,
} from "./businessTreasuryProjection.ts";
