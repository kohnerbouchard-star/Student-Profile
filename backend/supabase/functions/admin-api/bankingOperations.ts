import {
  IdempotentStaffLedgerAdjustmentError,
  recordIdempotentStaffLedgerAdjustment,
} from "../../../src/domains/economy/services/idempotentStaffLedgerAdjustment.ts";
import { resolvePlayerLedgerCurrencyAuthority } from "./playerOperations.ts";

function text(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function currencyCode(value: unknown): string {
  const normalized = text(value).toUpperCase();
  return /^[A-Z0-9]{3,16}$/u.test(normalized) ? normalized : "";
}

function canonicalAccountType(value: unknown): "checking" | "savings" | "" {
  const normalized = text(value).toLowerCase();
  return normalized === "checking" || normalized === "savings"
    ? normalized
    : "";
}

async function findPlayer(
  service: any,
  gameSessionId: string,
  playerId: string,
): Promise<any> {
  const result = await service.from("players")
    .select("id,display_name,roster_label,status")
    .eq("game_session_id", gameSessionId)
    .eq("id", playerId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadBankingPlayers(service: any, gameSessionId: string) {
  const [playersResult, balancesResult, assignmentsResult, countriesResult] =
    await Promise.all([
      service.from("players")
        .select("id,display_name,roster_label,status,created_at")
        .eq("game_session_id", gameSessionId)
        .order("created_at", { ascending: true }),
      service.from("account_balances")
        .select("player_id,account_type,balance,currency_code,updated_at")
        .eq("game_session_id", gameSessionId),
      service.from("player_country_assignments")
        .select("player_id,country_profile_id,status,assigned_at")
        .eq("game_session_id", gameSessionId)
        .eq("status", "active")
        .order("assigned_at", { ascending: false }),
      service.from("country_profiles")
        .select("id,country_name,status")
        .eq("status", "active"),
    ]);

  const error = playersResult.error || balancesResult.error ||
    assignmentsResult.error || countriesResult.error;
  if (error) throw error;

  const balancesByPlayer = new Map<string, any[]>();
  for (const row of balancesResult.data || []) {
    const playerId = text(row.player_id);
    const accountType = canonicalAccountType(row.account_type);
    const code = currencyCode(row.currency_code);
    if (!playerId || !accountType || !code) continue;
    const rows = balancesByPlayer.get(playerId) || [];
    rows.push({
      accountType,
      balance: number(row.balance),
      currencyCode: code,
      updatedAt: text(row.updated_at) || null,
    });
    balancesByPlayer.set(playerId, rows);
  }

  const countryNameById = new Map<string, string>(
    (countriesResult.data || []).map((row: any) => [
      text(row.id),
      text(row.country_name),
    ]),
  );
  const countryNameByPlayer = new Map<string, string>();
  for (const row of assignmentsResult.data || []) {
    const playerId = text(row.player_id);
    if (!playerId || countryNameByPlayer.has(playerId)) continue;
    countryNameByPlayer.set(
      playerId,
      countryNameById.get(text(row.country_profile_id)) || "",
    );
  }

  return (playersResult.data || []).map((player: any) => ({
    id: text(player.id),
    displayName: text(player.display_name, "Unnamed player"),
    rosterLabel: text(player.roster_label),
    status: text(player.status, "unknown").toLowerCase(),
    countryName: countryNameByPlayer.get(text(player.id)) || "",
    balances: balancesByPlayer.get(text(player.id)) || [],
  }));
}

async function loadBankingHistory(
  service: any,
  gameSessionId: string,
  playerId: string,
): Promise<any | null> {
  const player = await findPlayer(service, gameSessionId, playerId);
  if (!player) return null;

  const result = await service.from("ledger_entries")
    .select(
      "account_type,amount,currency_code,entry_type,source_domain,source_action,created_at",
    )
    .eq("game_session_id", gameSessionId)
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(250);
  if (result.error) throw result.error;

  const ledgerEntries = (result.data || []).flatMap((row: any) => {
    const accountType = canonicalAccountType(row.account_type);
    const code = currencyCode(row.currency_code);
    if (!accountType || !code) return [];
    return [{
      accountType,
      amount: number(row.amount),
      currencyCode: code,
      entryType: text(row.entry_type).toLowerCase(),
      sourceDomain: text(row.source_domain).toLowerCase(),
      sourceAction: text(row.source_action).toLowerCase(),
      createdAt: text(row.created_at) || null,
    }];
  });

  return { ledgerEntries };
}

function adjustmentFailure(error: unknown) {
  if (error instanceof IdempotentStaffLedgerAdjustmentError) {
    return {
      handled: true,
      status: error.status,
      body: { code: error.code, message: error.message },
    };
  }
  throw error;
}

async function adjustBankingLedger(
  service: any,
  input: {
    readonly gameId: string;
    readonly staffUserId: string;
    readonly playerId: string;
    readonly body: Record<string, any>;
  },
) {
  const accountType = canonicalAccountType(input.body.accountType);
  const amount = number(input.body.amount, Number.NaN);
  const requestedCurrencyCode = currencyCode(input.body.currencyCode);
  const idempotencyKey = text(input.body.idempotencyKey);
  const reason = text(input.body.reason || input.body.note || input.body.ledgerNote);

  if (!accountType) {
    return {
      handled: true,
      status: 400,
      body: {
        code: "banking_account_type_invalid",
        message: "Banking adjustments require checking or savings.",
      },
    };
  }
  if (!Number.isFinite(amount) || amount === 0) {
    return {
      handled: true,
      status: 400,
      body: {
        code: "ledger_amount_required",
        message: "A non-zero ledger amount is required.",
      },
    };
  }
  if (!requestedCurrencyCode) {
    return {
      handled: true,
      status: 400,
      body: {
        code: "banking_currency_required",
        message: "Banking adjustments require an explicit currency code.",
      },
    };
  }
  if (!idempotencyKey) {
    return {
      handled: true,
      status: 400,
      body: {
        code: "ledger_idempotency_key_required",
        message: "An idempotency key is required for Banking adjustments.",
      },
    };
  }
  if (!reason || reason.length > 300) {
    return {
      handled: true,
      status: 400,
      body: {
        code: "banking_adjustment_reason_required",
        message: "A Banking adjustment reason is required.",
      },
    };
  }

  const player = await findPlayer(service, input.gameId, input.playerId);
  if (!player) {
    return {
      handled: true,
      status: 404,
      body: { code: "player_not_found", message: "Player was not found for this game." },
    };
  }
  if (text(player.status).toLowerCase() !== "active") {
    return {
      handled: true,
      status: 409,
      body: {
        code: "player_not_active",
        message: "Only active players can receive Banking adjustments.",
      },
    };
  }

  const currency = await resolvePlayerLedgerCurrencyAuthority(service, {
    gameSessionId: input.gameId,
    playerId: input.playerId,
    body: {
      currencyCode: requestedCurrencyCode,
      currencyMode: input.body.currencyMode,
    },
  });
  if (currency.ok === false) {
    return {
      handled: true,
      status: currency.status,
      body: currency.body,
    };
  }

  try {
    const ledger = await recordIdempotentStaffLedgerAdjustment(service, {
      gameSessionId: input.gameId,
      playerId: input.playerId,
      staffUserId: input.staffUserId,
      routeKey: "admin.banking.ledger_adjustment",
      idempotencyKey,
      accountType,
      amount: Math.round(amount * 100) / 100,
      currencyCode: currency.currencyCode,
      entryType: amount > 0 ? "credit" : "debit",
      sourceDomain: "banking",
      sourceAction: "staff_player_balance_adjustment",
      sourceId: null,
      auditMetadata: {
        note: reason,
        currencyMode: currency.currencyMode,
        resolvedCurrencyCode: currency.currencyCode,
      },
    });
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          adjusted: true,
          outcome: ledger.outcome,
          amount: Math.round(amount * 100) / 100,
          accountType,
          currencyMode: currency.currencyMode,
          currencyCode: currency.currencyCode,
          ledger: {
            outcome: ledger.outcome,
            accountType: ledger.accountType,
            balance: ledger.balance,
            currencyCode: ledger.currencyCode,
            createdAt: ledger.createdAt,
          },
        },
      },
    };
  } catch (error) {
    return adjustmentFailure(error);
  }
}

export async function handlePersonalBankingAdminOperation(
  service: any,
  input: {
    readonly request: Request;
    readonly gameId: string;
    readonly staffUserId: string;
    readonly suffix: string;
  },
): Promise<any> {
  const method = input.request.method.toUpperCase();

  if (method === "GET" && input.suffix === "/banking/players") {
    const players = await loadBankingPlayers(service, input.gameId);
    return {
      handled: true,
      status: 200,
      body: { data: { players, roster: players } },
    };
  }

  const historyMatch = input.suffix.match(
    /^\/banking\/players\/([^/]+)\/history-audit$/u,
  );
  if (method === "GET" && historyMatch) {
    const playerId = decodeURIComponent(historyMatch[1]);
    const history = await loadBankingHistory(service, input.gameId, playerId);
    return history
      ? { handled: true, status: 200, body: { data: history } }
      : {
        handled: true,
        status: 404,
        body: {
          code: "player_not_found",
          message: "Player was not found for this game.",
        },
      };
  }

  const adjustmentMatch = input.suffix.match(
    /^\/banking\/players\/([^/]+)\/ledger-adjustments$/u,
  );
  if (method === "POST" && adjustmentMatch) {
    const body = await input.request.clone().json().catch(() => ({}));
    return adjustBankingLedger(service, {
      gameId: input.gameId,
      staffUserId: input.staffUserId,
      playerId: decodeURIComponent(adjustmentMatch[1]),
      body: body && typeof body === "object" && !Array.isArray(body)
        ? body as Record<string, any>
        : {},
    });
  }

  return { handled: false };
}
