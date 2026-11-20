import { readBalanceNumber } from "../../../platform/supabase/edgeParsing.ts";
import {
  type PlayerBankingPublicBalanceDto,
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
  rpc<T = unknown>(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): PromiseLike<QueryResponse<T>>;
}

interface BalanceRow {
  readonly [key: string]: unknown;
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
    const balancesResponse = await this.client.rpc<unknown>(
      "list_player_bank_accounts_v1",
      {
        p_game_session_id: input.gameSessionId,
        p_player_id: input.playerId,
      },
    );

    if (balancesResponse.error) {
      throw unavailable("Player Banking balances could not be loaded.");
    }

    const ledgerResponse = await this.client.rpc<LedgerRow[]>(
      "list_player_bank_activity_v1",
      {
        p_game_session_id: input.gameSessionId,
        p_player_id: input.playerId,
        p_limit: input.limit,
        p_offset: input.offset,
      },
    );

    if (ledgerResponse.error) {
      throw unavailable("Player Banking activity could not be loaded.");
    }

    const rows = ledgerResponse.data ?? [];
    return {
      balances: parsePlayerBankAccounts(balancesResponse.data),
      entries: rows.slice(0, input.limit).map((row) => ({
        accountType: publicAccountType(row.account_type),
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

export function parsePlayerBankAccounts(
  value: unknown,
): PlayerBankingPublicBalanceDto[] {
  const rows = accountRows(value);
  const accounts = rows.map((row) => {
    const accountKey = requiredText(
      first(row, "account_key", "accountKey", "public_key", "publicKey"),
      "account key",
    ).toLowerCase();
    if (!/^bac_[0-9a-f]{32}$/u.test(accountKey)) {
      throw unavailable(
        "Player Banking returned an invalid public account key.",
      );
    }
    const accountKind = publicAccountType(requiredText(
      first(
        row,
        "account_kind",
        "accountKind",
        "kind",
        "account_type",
        "accountType",
      ),
      "account kind",
    ));
    const currencyCode = requiredText(
      first(row, "currency_code", "currencyCode"),
      "currency code",
    ).toUpperCase();
    if (!/^[A-Z]{3}$/u.test(currencyCode)) {
      throw unavailable("Player Banking returned an invalid currency code.");
    }
    const postedAmount = money(
      first(
        row,
        "posted_amount",
        "postedAmount",
        "posted_balance",
        "postedBalance",
        "balance",
      ),
      "posted amount",
    );
    const heldValue = first(
      row,
      "held_amount",
      "heldAmount",
      "active_holds",
      "activeHolds",
    );
    const heldAmount = heldValue === undefined
      ? 0
      : money(heldValue, "held amount");
    const availableValue = first(
      row,
      "available_amount",
      "availableAmount",
      "available_balance",
      "availableBalance",
    );
    const availableAmount = availableValue === undefined
      ? roundMoney(postedAmount - heldAmount)
      : money(availableValue, "available amount");
    return {
      accountKey,
      accountKind,
      accountType: accountKind,
      balance: postedAmount,
      currencyCode,
      postedAmount,
      heldAmount,
      availableAmount,
    };
  });
  return accounts.sort((left, right) =>
    left.accountKind.localeCompare(right.accountKind) ||
    left.currencyCode.localeCompare(right.currencyCode) ||
    left.accountKey.localeCompare(right.accountKey)
  );
}

function publicAccountType(value: string): string {
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "checking") return "checking";
  return normalized;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000;
}

function accountRows(value: unknown): BalanceRow[] {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === "object"
    ? first(value as BalanceRow, "accounts", "balances", "items", "rows")
    : null;
  if (!Array.isArray(candidate)) {
    throw unavailable("Player Banking accounts returned an invalid result.");
  }
  if (
    candidate.some((row) =>
      !row || typeof row !== "object" || Array.isArray(row)
    )
  ) {
    throw unavailable("Player Banking accounts returned an invalid row.");
  }
  return candidate as BalanceRow[];
}

function first(
  row: BalanceRow,
  ...keys: readonly string[]
): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

function requiredText(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 160) {
    throw unavailable(`Player Banking ${label} is invalid.`);
  }
  return normalized;
}

function money(value: unknown, label: string): number {
  const amount = typeof value === "number" || typeof value === "string"
    ? Number(value)
    : Number.NaN;
  if (!Number.isFinite(amount) || Math.abs(amount) > 1_000_000_000_000_000) {
    throw unavailable(`Player Banking ${label} is invalid.`);
  }
  return amount;
}

function unavailable(message: string): PlayerBankingPublicError {
  return new PlayerBankingPublicError(
    "player_banking_read_failed",
    message,
    500,
    false,
  );
}
