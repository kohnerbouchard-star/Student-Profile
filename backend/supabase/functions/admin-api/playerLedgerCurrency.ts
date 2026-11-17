import {
  text,
} from "./playerOperationSupport.ts";


export type PlayerLedgerCurrencyMode = "player_country" | "global_eco";


export type PlayerLedgerCurrencyResolution =
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


export function currencyError(
  status: number,
  code: string,
  message: string,
): PlayerLedgerCurrencyResolution {
  return { ok: false, status, body: { code, message } };
}


export function requestedLedgerCurrencyMode(
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


export async function readPlayerCountryCurrency(
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
