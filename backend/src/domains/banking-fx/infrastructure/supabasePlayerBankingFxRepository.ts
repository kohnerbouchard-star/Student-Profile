import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import {
  type CancelPlayerBankingFxOrderInput,
  type ConsumePlayerBankingFxQuoteInput,
  type CreatePlayerBankingFxQuoteInput,
  type PlayerBankingFxMutationResult,
  type PlayerBankingFxOrderDto,
  type PlayerBankingFxRepository,
  type PlayerBankingFxScope,
} from "../contracts/playerBankingFxContracts.ts";
import { mapPlayerBankingFxDatabaseError } from "./playerBankingFxDatabaseErrors.ts";
import {
  projectPlayerBankingFxHistoryPage,
  projectPlayerBankingFxOrderMutation,
  projectPlayerBankingFxOrdersPage,
  projectPlayerBankingFxOverview,
  projectPlayerBankingFxQuoteMutation,
} from "./playerBankingFxPublicProjection.ts";

export class SupabasePlayerBankingFxRepository
  implements PlayerBankingFxRepository {
  constructor(private readonly client: EdgeSupabaseClient) {}

  async readOverview(
    scope: PlayerBankingFxScope,
  ) {
    const [overviewValue, accountsValue] = await Promise.all([
      this.rpc("get_player_banking_fx_overview_v1", scopeArgs(scope)),
      this.rpc("list_player_bank_accounts_v1", scopeArgs(scope)),
    ]);
    return projectPlayerBankingFxOverview(overviewValue, accountsValue);
  }

  async listHistory(
    input: Parameters<PlayerBankingFxRepository["listHistory"]>[0],
  ) {
    const value = await this.rpc("list_player_fx_rate_history_v1", {
      ...scopeArgs(input),
      p_source_currency_code: input.sourceCurrencyCode,
      p_target_currency_code: input.targetCurrencyCode,
      p_range: input.range,
      p_limit: input.limit + 1,
      p_before_at: input.beforeAt,
      p_before_key: input.beforeKey,
    });
    return projectPlayerBankingFxHistoryPage(value, input.limit);
  }

  async listOrders(
    input: Parameters<PlayerBankingFxRepository["listOrders"]>[0],
  ) {
    const value = await this.rpc("list_player_fx_orders_v1", {
      ...scopeArgs(input),
      p_status: input.status,
      p_limit: input.limit + 1,
      p_before_at: input.beforeAt,
      p_before_key: input.beforeKey,
    });
    return projectPlayerBankingFxOrdersPage(value, input.limit);
  }

  async createQuote(input: CreatePlayerBankingFxQuoteInput) {
    const value = await this.rpc("create_player_fx_quote_v1", {
      ...scopeArgs(input),
      p_source_account_key: input.sourceAccountKey,
      p_target_currency_code: input.targetCurrencyCode,
      p_source_amount: input.sourceAmount,
      p_product: input.product,
      p_idempotency_key: input.idempotencyKey,
    });
    return projectPlayerBankingFxQuoteMutation(value);
  }

  async submitStandard(
    input: ConsumePlayerBankingFxQuoteInput,
  ): Promise<PlayerBankingFxMutationResult<PlayerBankingFxOrderDto>> {
    return this.consumeQuote(
      "submit_player_standard_fx_order_v1",
      input,
      "standard FX order",
    );
  }

  async executeInstant(
    input: ConsumePlayerBankingFxQuoteInput,
  ): Promise<PlayerBankingFxMutationResult<PlayerBankingFxOrderDto>> {
    return this.consumeQuote(
      "execute_player_instant_fx_v1",
      input,
      "instant FX order",
    );
  }

  async cancelStandard(input: CancelPlayerBankingFxOrderInput) {
    const value = await this.rpc("cancel_player_standard_fx_order_v1", {
      ...scopeArgs(input),
      p_order_key: input.orderKey,
      p_idempotency_key: input.idempotencyKey,
    });
    return projectPlayerBankingFxOrderMutation(value, "cancelled FX order");
  }

  private async consumeQuote(
    command:
      | "submit_player_standard_fx_order_v1"
      | "execute_player_instant_fx_v1",
    input: ConsumePlayerBankingFxQuoteInput,
    label: string,
  ): Promise<PlayerBankingFxMutationResult<PlayerBankingFxOrderDto>> {
    const value = await this.rpc(command, {
      ...scopeArgs(input),
      p_quote_key: input.quoteKey,
      p_idempotency_key: input.idempotencyKey,
    });
    return projectPlayerBankingFxOrderMutation(value, label);
  }

  private async rpc(
    command: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    const response = await this.client.rpc<unknown>(command, args);
    if (response.error) {
      throw mapPlayerBankingFxDatabaseError(response.error);
    }
    return response.data;
  }
}

function scopeArgs(
  scope: PlayerBankingFxScope,
): Readonly<Record<string, string>> {
  return {
    p_game_session_id: scope.gameSessionId,
    p_player_id: scope.playerId,
  };
}
