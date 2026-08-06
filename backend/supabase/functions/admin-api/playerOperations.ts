function text(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isoDate(value: unknown): string {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== normalized
    ? ""
    : normalized;
}

async function audit(
  service: any,
  input: {
    gameSessionId: string;
    staffUserId: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, any>;
  },
): Promise<void> {
  const result = await service.from("audit_log").insert({
    game_session_id: input.gameSessionId,
    actor_type: "staff_user",
    actor_id: input.staffUserId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId || null,
    metadata: input.metadata || {},
  });
  if (result.error) throw result.error;
}

async function findPlayer(
  service: any,
  gameSessionId: string,
  playerId: string,
): Promise<any> {
  const result = await service
    .from("players")
    .select("id,display_name,roster_label,status")
    .eq("game_session_id", gameSessionId)
    .eq("id", playerId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

type PlayerLedgerCurrencyMode = "player_country" | "global_eco";

type PlayerLedgerCurrencyResolution =
  | {
      readonly ok: true;
      readonly currencyMode: PlayerLedgerCurrencyMode;
      readonly currencyCode: string;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly body: {
        readonly code: string;
        readonly message: string;
      };
    };

function currencyError(
  status: number,
  code: string,
  message: string,
): PlayerLedgerCurrencyResolution {
  return { ok: false, status, body: { code, message } };
}

function requestedLedgerCurrencyMode(
  body: Record<string, any>,
): PlayerLedgerCurrencyMode | "invalid" {
  const value = text(body.currencyMode).toLowerCase();
  if (!value) {
    return text(body.currencyCode || body.currency).toUpperCase() === "ECO"
      ? "global_eco"
      : "player_country";
  }
  if (["player_country", "local", "player_local"].includes(value)) {
    return "player_country";
  }
  if (["global_eco", "eco", "global"].includes(value)) {
    return "global_eco";
  }
  return "invalid";
}

async function readPlayerCountryCurrency(
  service: any,
  gameSessionId: string,
  playerId: string,
): Promise<string> {
  const assignmentResult = await service
    .from("player_country_assignments")
    .select("country_profile_id")
    .eq("game_session_id", gameSessionId)
    .eq("player_id", playerId)
    .eq("status", "active")
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (assignmentResult.error) throw assignmentResult.error;

  const countryProfileId = text(assignmentResult.data?.country_profile_id);
  if (!countryProfileId) return "";

  const countryResult = await service
    .from("country_profiles")
    .select("currency_code,status")
    .eq("id", countryProfileId)
    .eq("status", "active")
    .maybeSingle();
  if (countryResult.error) throw countryResult.error;

  const currencyCode = text(countryResult.data?.currency_code).toUpperCase();
  return /^[A-Z]{3,16}$/.test(currencyCode) ? currencyCode : "";
}

export async function resolvePlayerLedgerCurrencyAuthority(
  service: any,
  input: {
    readonly gameSessionId: string;
    readonly playerId: string;
    readonly body: Record<string, any>;
  },
): Promise<PlayerLedgerCurrencyResolution> {
  const currencyMode = requestedLedgerCurrencyMode(input.body);
  if (currencyMode === "invalid") {
    return currencyError(
      400,
      "ledger_currency_mode_invalid",
      "currencyMode must be player_country or global_eco.",
    );
  }

  const requestedCurrencyCode = text(
    input.body.currencyCode || input.body.currency,
  ).toUpperCase();

  if (currencyMode === "global_eco") {
    if (requestedCurrencyCode && requestedCurrencyCode !== "ECO") {
      return currencyError(
        400,
        "ledger_currency_mismatch",
        "The requested currency does not match the selected currency mode.",
      );
    }
    return { ok: true, currencyMode, currencyCode: "ECO" };
  }

  const currencyCode = await readPlayerCountryCurrency(
    service,
    input.gameSessionId,
    input.playerId,
  );
  if (!currencyCode) {
    return currencyError(
      409,
      "player_country_currency_unavailable",
      "The player's active country currency is unavailable.",
    );
  }
  if (requestedCurrencyCode && requestedCurrencyCode !== currencyCode) {
    return currencyError(
      400,
      "ledger_currency_mismatch",
      "The requested currency does not match the player's active country.",
    );
  }
  return { ok: true, currencyMode, currencyCode };
}

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
    p_account_type: text(body.accountType, "cash"),
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

export async function loadPlayerHistoryAudit(
  service: any,
  gameSessionId: string,
  playerId: string,
): Promise<any> {
  const player = await findPlayer(service, gameSessionId, playerId);
  if (!player) return null;
  const [
    auditResult,
    ledgerResult,
    attendanceResult,
    contractsResult,
    sessionsResult,
    flagsResult,
    settingsResult,
  ] = await Promise.all([
    service.from("audit_log").select("*").eq("game_session_id", gameSessionId)
      .eq("target_id", playerId).order("created_at", { ascending: false })
      .limit(250),
    service.from("ledger_entries").select("*").eq(
      "game_session_id",
      gameSessionId,
    ).eq("player_id", playerId).order("created_at", { ascending: false }).limit(
      250,
    ),
    service.from("player_attendance_records").select("*").eq(
      "game_session_id",
      gameSessionId,
    ).eq("player_id", playerId).order("attendance_date", { ascending: false })
      .limit(250),
    service.from("player_contract_progress").select("*").eq(
      "game_session_id",
      gameSessionId,
    ).eq("player_id", playerId).order("updated_at", { ascending: false }).limit(
      250,
    ),
    service.from("player_sessions").select(
      "id,status,created_at,updated_at,expires_at,revoked_at",
    ).eq("game_session_id", gameSessionId).eq("player_id", playerId).order(
      "created_at",
      { ascending: false },
    ).limit(100),
    service.from("player_admin_flags").select("*").eq(
      "game_session_id",
      gameSessionId,
    ).eq("player_id", playerId).order("created_at", { ascending: false }).limit(
      100,
    ),
    service.from("player_admin_settings").select("*").eq(
      "game_session_id",
      gameSessionId,
    ).eq("player_id", playerId).maybeSingle(),
  ]);
  const error = auditResult.error || ledgerResult.error ||
    attendanceResult.error || contractsResult.error || sessionsResult.error ||
    flagsResult.error || settingsResult.error;
  if (error) throw error;

  const timeline = [
    ...(auditResult.data || []).map((row: any) => ({
      type: "audit",
      at: row.created_at,
      data: row,
    })),
    ...(ledgerResult.data || []).map((row: any) => ({
      type: "ledger",
      at: row.created_at,
      data: row,
    })),
    ...(attendanceResult.data || []).map((row: any) => ({
      type: "attendance",
      at: row.corrected_at || row.clocked_in_at || row.created_at,
      data: row,
    })),
    ...(contractsResult.data || []).map((row: any) => ({
      type: "contract",
      at: row.updated_at || row.created_at,
      data: row,
    })),
    ...(sessionsResult.data || []).map((row: any) => ({
      type: "session",
      at: row.updated_at || row.created_at,
      data: row,
    })),
    ...(flagsResult.data || []).map((row: any) => ({
      type: "flag",
      at: row.created_at,
      data: row,
    })),
  ].sort((a, b) => Date.parse(b.at || "") - Date.parse(a.at || ""));

  return {
    player,
    timeline,
    auditLogs: auditResult.data || [],
    ledgerEntries: ledgerResult.data || [],
    attendance: attendanceResult.data || [],
    contractProgress: contractsResult.data || [],
    sessions: sessionsResult.data || [],
    flags: flagsResult.data || [],
    settings: settingsResult.data?.settings || {},
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
