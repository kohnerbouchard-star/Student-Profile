import {
  resolvePlayerLedgerCurrencyAuthority,
} from "./playerLedgerCurrency.ts";
import {
  object,
  number,
  text,
  findPlayer,
  isoDate,
  audit,
} from "./playerOperationSupport.ts";



async function adjustPlayerLedger(service: any, input: any): Promise<any> {
  const body = object(input.body);
  let amount = number(body.amount ?? body.value, Number.NaN);
  const adjustmentType = text(body.adjustmentType || body.entryType)
    .toLowerCase();
  if (adjustmentType === "debit" && amount > 0) amount = -amount;
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
  const player = await findPlayer(service, input.gameSessionId, input.playerId);
  if (!player) {
    return {
      handled: true,
      status: 404,
      body: {
        code: "player_not_found",
        message: "Player was not found for this game.",
      },
    };
  }

  const currency = await resolvePlayerLedgerCurrencyAuthority(service, {
    gameSessionId: input.gameSessionId,
    playerId: input.playerId,
    body,
  });
  if (currency.ok === false) {
    return {
      handled: true,
      status: currency.status,
      body: currency.body,
    };
  }

  const rpc = await service.rpc("record_player_ledger_entry", {
    p_game_session_id: input.gameSessionId,
    p_player_id: input.playerId,
    p_account_type: text(body.accountType, "checking"),
    p_amount: amount,
    p_currency_code: currency.currencyCode,
    p_entry_type: amount > 0 ? "credit" : "debit",
    p_source_domain: "players",
    p_source_action: "staff_player_balance_adjustment",
    p_source_id: null,
    p_created_by_type: "staff_user",
    p_created_by_id: input.staffUserId,
    p_audit_metadata: {
      note: text(body.note || body.ledgerNote || body.reason) || null,
      effectiveDate: isoDate(body.effectiveDate) || null,
      currencyMode: currency.currencyMode,
      resolvedCurrencyCode: currency.currencyCode,
    },
  });
  if (rpc.error) throw rpc.error;
  return {
    handled: true,
    status: 200,
    body: {
      data: {
        adjusted: true,
        playerId: input.playerId,
        amount,
        currencyMode: currency.currencyMode,
        currencyCode: currency.currencyCode,
        ledger: Array.isArray(rpc.data) ? rpc.data[0] : rpc.data,
      },
    },
  };
}



async function createPlayerFlag(service: any, input: any): Promise<any> {
  const body = object(input.body);
  const reason = text(body.reason || body.adminNote || body.note);
  if (!reason) {
    return {
      handled: true,
      status: 400,
      body: {
        code: "player_flag_reason_required",
        message: "A flag reason is required.",
      },
    };
  }
  const player = await findPlayer(service, input.gameSessionId, input.playerId);
  if (!player) {
    return {
      handled: true,
      status: 404,
      body: {
        code: "player_not_found",
        message: "Player was not found for this game.",
      },
    };
  }
  const level = text(body.flagLevel || body.level, "warning").toLowerCase();
  const result = await service
    .from("player_admin_flags")
    .insert({
      game_session_id: input.gameSessionId,
      player_id: input.playerId,
      flagged_by_staff_user_id: input.staffUserId,
      level: ["info", "warning", "restriction", "critical"].includes(level)
        ? level
        : "warning",
      reason,
      restriction: text(body.restriction) || null,
      review_date: isoDate(body.reviewDate) || null,
      status: "open",
      metadata: {
        playerFollowup: text(body.playerFollowup) || null,
      },
    })
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;
  await audit(service, {
    gameSessionId: input.gameSessionId,
    staffUserId: input.staffUserId,
    action: "players.flag_created",
    targetType: "player",
    targetId: input.playerId,
    metadata: { flagId: result.data?.id, level: result.data?.level, reason },
  });
  return {
    handled: true,
    status: 201,
    body: { data: { flagged: true, flag: result.data } },
  };
}



async function savePlayerSettings(service: any, input: any): Promise<any> {
  const body = object(input.body);
  const player = await findPlayer(service, input.gameSessionId, input.playerId);
  if (!player) {
    return {
      handled: true,
      status: 404,
      body: {
        code: "player_not_found",
        message: "Player was not found for this game.",
      },
    };
  }
  const settings = object(body.settings || body.payload || body);
  for (const key of ["playerId", "gameSessionId", "id", "adminOperation"]) {
    delete settings[key];
  }
  const result = await service
    .from("player_admin_settings")
    .upsert({
      game_session_id: input.gameSessionId,
      player_id: input.playerId,
      settings,
      updated_by_staff_user_id: input.staffUserId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "game_session_id,player_id" })
    .select("*")
    .maybeSingle();
  if (result.error) throw result.error;
  await audit(service, {
    gameSessionId: input.gameSessionId,
    staffUserId: input.staffUserId,
    action: "players.settings_updated",
    targetType: "player",
    targetId: input.playerId,
    metadata: { keys: Object.keys(settings).sort() },
  });
  return {
    handled: true,
    status: 200,
    body: { data: { saved: true, settings: result.data } },
  };
}



export async function handlePlayerOperation(
  service: any,
  input: {
    gameSessionId: string;
    staffUserId: string;
    path: string;
    method: string;
    body: Record<string, any>;
  },
): Promise<any> {
  const playerMatch = input.path.match(
    /^\/games\/[^/]+\/players\/([^/]+)(\/.*)?$/,
  );
  if (!playerMatch) return { handled: false };
  const playerId = decodeURIComponent(playerMatch[1]);
  const suffix = playerMatch[2] || "";
  const scoped = { ...input, playerId };
  if (input.method === "POST" && suffix === "/ledger-adjustments") {
    return adjustPlayerLedger(service, scoped);
  }
  if (input.method === "POST" && suffix === "/flags") {
    return createPlayerFlag(service, scoped);
  }
  if (["PATCH", "PUT"].includes(input.method) && suffix === "/settings") {
    return savePlayerSettings(service, scoped);
  }
  return { handled: false };
}

export { resolvePlayerLedgerCurrencyAuthority } from "./playerLedgerCurrency.ts";

export { loadPlayerHistoryAudit } from "./playerHistoryAudit.ts";
