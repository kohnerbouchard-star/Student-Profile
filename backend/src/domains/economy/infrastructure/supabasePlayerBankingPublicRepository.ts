import { readBalanceNumber } from "../../../platform/supabase/edgeParsing.ts";
import {
  PlayerBankingPublicError,
  type PlayerBankingPublicPage,
  type PlayerBankingPublicRepository,
} from "../contracts/playerBankingPublicContracts.ts";

interface QueryError {
  readonly message?: string;
}

interface QueryResponse<T> {
  readonly data: T | null;
  readonly error: QueryError | null;
}

interface PublicBankingClient {
  from(table: string): any;
}

interface BalanceRow {
  readonly account_type: string;
  readonly balance: number | string;
  readonly currency_code: string;
}

interface LedgerRow {
  readonly account_type: string;
  readonly amount: number | string;
  readonly currency_code: string;
  readonly entry_type: string;
  readonly source_domain: string;
  readonly source_action: string;
  readonly created_at: string;
}

export class SupabasePlayerBankingPublicRepository
  implements PlayerBankingPublicRepository {
  constructor(private readonly client: PublicBankingClient) {}

  async readPage(input: {
    readonly gameSessionId: string;
    readonly playerId: string;
    readonly limit: number;
    readonly offset: number;
  }): Promise<PlayerBankingPublicPage> {
    const balancesResponse = await this.client
      .from("account_balances")
      .select("account_type,balance,currency_code")
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .order("account_type", { ascending: true })
      .order("currency_code", { ascending: true }) as QueryResponse<BalanceRow[]>;

    if (balancesResponse.error) {
      throw unavailable("Player Banking balances could not be loaded.");
    }

    const ledgerResponse = await this.client
      .from("ledger_entries")
      .select(
        "account_type,amount,currency_code,entry_type,source_domain,source_action,created_at",
      )
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(input.offset, input.offset + input.limit) as QueryResponse<LedgerRow[]>;

    if (ledgerResponse.error) {
      throw unavailable("Player Banking activity could not be loaded.");
    }

    const rows = ledgerResponse.data ?? [];
    return {
      balances: (balancesResponse.data ?? []).map((row) => ({
        accountType: String(row.account_type),
        balance: readBalanceNumber(row.balance),
        currencyCode: String(row.currency_code),
      })),
      entries: rows.slice(0, input.limit).map((row) => ({
        accountType: String(row.account_type),
        amount: readBalanceNumber(row.amount),
        currencyCode: String(row.currency_code),
        entryType: String(row.entry_type),
        sourceDomain: String(row.source_domain),
        sourceAction: String(row.source_action),
        createdAt: String(row.created_at),
      })),
      hasMore: rows.length > input.limit,
    };
  }
}

function unavailable(message: string): PlayerBankingPublicError {
  return new PlayerBankingPublicError(
    "player_banking_read_failed",
    message,
    500,
    false,
  );
}
