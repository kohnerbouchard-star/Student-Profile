import {
  AdminMutationError,
  adminMutationErrorBody,
  type AdminMutationRpcClient,
  readAdminMutationIdentity,
} from "../../../src/platform/supabase/adminMutation.ts";
import type { EdgeSupabaseClient } from "../../../src/platform/supabase/edgeStaffSession.ts";
import { EdgeActivationError } from "../../../src/platform/supabase/edgeResponse.ts";
import { readBalanceNumber } from "../../../src/platform/supabase/edgeParsing.ts";
import { parseCreatePlayerRequestBody } from "../../../src/domains/players/api/playerRosterRequest.ts";
import { createPlayerForAuthorizedStaff } from "../../../src/domains/players/application/createPlayerForAuthorizedStaff.ts";
import { parseStaffAttendanceScanRequestBody } from "../../../src/domains/attendance/api/attendanceHttpHelpers.ts";
import {
  recordAttendanceScanForAuthorizedStaff,
  recordManualAttendanceForAuthorizedStaff,
} from "../../../src/domains/attendance/application/recordAttendanceForAuthorizedStaff.ts";
import { mutateAdminStoreItem } from "../../../src/domains/store/application/adminStoreItemMutation.ts";
import { StoreCatalogValidationError } from "../../../src/domains/store/domain/storeCatalogRules.ts";
import { mutateAdminContract } from "../../../src/domains/contracts/application/adminContractMutation.ts";
import { ContractContractError } from "../../../src/domains/contracts/contracts/contractContractErrors.ts";
import { updateGameSettings } from "../../../src/domains/game-sessions/application/updateGameSettings.ts";
import { rotateGameJoinCode } from "../../../src/domains/game-sessions/application/rotateGameJoinCode.ts";
import {
  normalizeContractCreate,
  normalizeStoreMutation,
} from "./mutationAdapters.ts";
import { handleCompatibilityOperation } from "./compatibilityOperations.ts";

export interface LocalAdminGameMutationContext {
  readonly request: Request;
  readonly gameSessionId: string;
  readonly staffUserId: string;
  readonly suffix: string;
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
}

export type LocalAdminGameMutationResult =
  | { readonly handled: false }
  | {
    readonly handled: true;
    readonly status: number;
    readonly body: Record<string, unknown>;
  };

/**
 * Runs only after admin-api has completed its one authentication, AAL2, CSRF,
 * permission, rate-limit, and game-ownership decision. The application
 * handlers below deliberately do not repeat those HTTP-boundary checks.
 */
export async function handleLocalAdminGameMutation(
  serviceClient: AdminMutationRpcClient & EdgeSupabaseClient,
  input: LocalAdminGameMutationContext,
): Promise<LocalAdminGameMutationResult> {
  if (!isAffectedMutation(input.request.method, input.suffix)) {
    return { handled: false };
  }

  try {
    const rawBody = await readJsonObjectBody(input.request, input.suffix);
    const identity = readAdminMutationIdentity(input.request, rawBody);
    const compatibility = await handleCompatibilityOperation(
      serviceClient,
      {
        gameSessionId: input.gameSessionId,
        staffUserId: input.staffUserId,
        path: `/games/${
          encodeURIComponent(input.gameSessionId)
        }${input.suffix}`,
        method: input.request.method,
        body: rawBody,
        identity,
      },
    );
    if (compatibility.handled) {
      return handled(compatibility.status, compatibility.body);
    }
    const common = {
      gameSessionId: input.gameSessionId,
      staffUserId: input.staffUserId,
    };

    if (input.suffix === "/players" && input.request.method === "POST") {
      const result = await createPlayerForAuthorizedStaff({
        ...common,
        body: parseCreatePlayerRequestBody(rawBody),
        identity,
      }, serviceClient);
      return handled(result.status, {
        ok: true,
        player: result.player,
        accessCode: result.accessCode,
      });
    }

    if (
      ["/attendance/scans", "/attendance/scan"].includes(input.suffix) &&
      input.request.method === "POST"
    ) {
      const result = await recordAttendanceScanForAuthorizedStaff({
        ...common,
        body: parseStaffAttendanceScanRequestBody(rawBody),
        identity,
      }, serviceClient);
      return handled(result.status, {
        ok: true,
        gameSession: input.gameSession,
        player: result.player,
        attendance: {
          id: result.attendance.attendance_id,
          status: result.attendance.attendance_status,
          attendanceDate: result.attendance.attendance_date,
          clockedInAt: result.attendance.clocked_in_at,
          wasCreated: result.attendance.was_created,
          timezone: result.attendance.timezone,
        },
        reward: {
          amount: readBalanceNumber(result.attendance.reward_amount),
          currencyCode: result.attendance.currency_code,
          ledgerEntryId: result.attendance.ledger_entry_id,
          configuredBaseAmount: result.reward.configuredBaseAmount,
          baseCurrencyCode: result.reward.baseCurrencyCode,
          currencyMode: result.reward.currencyMode,
          countryCode: result.reward.countryCode,
          incomeModifier: result.reward.incomeModifier,
          exchangeRateIndex: result.reward.exchangeRateIndex,
        },
      });
    }

    if (
      input.suffix === "/attendance/corrections" &&
      input.request.method === "POST"
    ) {
      const result = await recordManualAttendanceForAuthorizedStaff({
        ...common,
        body: rawBody,
        identity,
      }, serviceClient);
      return handled(result.status, {
        data: {
          corrected: true,
          attendance: result.attendance,
          replayed: result.replayed,
        },
      });
    }

    if (
      input.suffix === "/store/items" && input.request.method === "POST"
    ) {
      const normalized = await normalizeStoreMutation(
        input.request.clone(),
        input.request.method,
      );
      const result = await mutateAdminStoreItem(serviceClient, {
        ...common,
        operation: "create",
        body: normalized.body,
        identity,
      });
      return handled(result.status, { ok: true, item: result.item });
    }

    const storeStatusMatch = input.suffix.match(
      /^\/store\/items\/([^/]+)\/status$/,
    );
    if (
      storeStatusMatch &&
      ["POST", "PATCH", "PUT"].includes(input.request.method)
    ) {
      const normalized = await normalizeStoreMutation(
        input.request.clone(),
        input.request.method,
      );
      const result = await mutateAdminStoreItem(serviceClient, {
        ...common,
        operation: "update",
        itemId: decodeURIComponent(storeStatusMatch[1]),
        body: normalized.body,
        identity,
      });
      return handled(result.status, { ok: true, item: result.item });
    }

    const storeItemMatch = input.suffix.match(/^\/store\/items\/([^/]+)$/);
    if (
      storeItemMatch &&
      ["PUT", "PATCH", "DELETE"].includes(input.request.method)
    ) {
      const normalized = await normalizeStoreMutation(
        input.request.clone(),
        input.request.method,
      );
      const result = await mutateAdminStoreItem(serviceClient, {
        ...common,
        operation: input.request.method === "DELETE" ? "archive" : "update",
        itemId: decodeURIComponent(storeItemMatch[1]),
        body: normalized.body,
        identity,
      });
      return handled(result.status, { ok: true, item: result.item });
    }

    if (input.suffix === "/contracts" && input.request.method === "POST") {
      const body = await normalizeContractCreate(
        input.request.clone(),
        identity.idempotencyKey,
      );
      const result = await mutateAdminContract(serviceClient, {
        ...common,
        operation: "create",
        body,
        identity,
      });
      return handled(result.status, { ok: true, contract: result.contract });
    }

    const updateContractMatch = input.suffix.match(/^\/contracts\/([^/]+)$/);
    if (updateContractMatch && input.request.method === "PATCH") {
      const body = await normalizeContractCreate(
        input.request.clone(),
        identity.idempotencyKey,
      );
      const result = await mutateAdminContract(serviceClient, {
        ...common,
        operation: "update",
        contractId: decodeURIComponent(updateContractMatch[1]),
        body,
        identity,
      });
      return handled(result.status, { ok: true, contract: result.contract });
    }

    const publishMatch = input.suffix.match(/^\/contracts\/([^/]+)\/publish$/);
    if (publishMatch && input.request.method === "POST") {
      const result = await mutateAdminContract(serviceClient, {
        ...common,
        operation: "publish",
        contractId: decodeURIComponent(publishMatch[1]),
        body: rawBody,
        identity,
      });
      return handled(result.status, { ok: true, contract: result.contract });
    }

    if (
      isSettingsMutation(input.request.method, input.suffix)
    ) {
      const result = await updateGameSettings(serviceClient, {
        ...common,
        requestBody: settingsRequestBody(input.suffix, rawBody),
        mutation: identity,
      });
      return handled(result.status, {
        ok: true,
        gameSession: input.gameSession,
        settings: result.settings,
        difficultyPolicy: result.difficultyPolicy,
        replayed: result.replayed,
      });
    }

    if (
      input.suffix === "/join-code/reset" && input.request.method === "POST"
    ) {
      const result = await rotateGameJoinCode(serviceClient, {
        ...common,
        requestBody: rawBody,
        mutation: identity,
      });
      return handled(result.status, {
        ok: true,
        gameSession: input.gameSession,
        joinCode: result.joinCode,
        replayed: result.replayed,
      });
    }

    return { handled: false };
  } catch (error) {
    if (error instanceof AdminMutationError) {
      return handled(error.status, adminMutationErrorBody(error));
    }
    if (error instanceof EdgeActivationError) {
      return handled(error.status, {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      });
    }
    if (error instanceof StoreCatalogValidationError) {
      return handled(400, {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          retryable: false,
        },
      });
    }
    if (error instanceof ContractContractError) {
      return handled(400, {
        ok: false,
        error: {
          code: "invalid_contract_request",
          message: error.message,
          retryable: false,
        },
      });
    }
    throw error;
  }
}

function isAffectedMutation(method: string, suffix: string): boolean {
  if (
    method === "POST" && [
      "/players",
      "/attendance/scans",
      "/attendance/scan",
      "/attendance/corrections",
      "/store/items",
      "/contracts",
      "/join-code/reset",
    ].includes(suffix)
  ) return true;
  if (/^\/contracts\/[^/]+\/publish$/.test(suffix)) {
    return method === "POST";
  }
  if (/^\/contracts\/[^/]+$/.test(suffix)) {
    return method === "PATCH";
  }
  if (/^\/contracts\/[^/]+\/(?:archive|duplicate)$/.test(suffix)) {
    return method === "POST";
  }
  if (/^\/players\/[^/]+\/archive$/.test(suffix)) {
    return method === "POST";
  }
  if (/^\/players\/[^/]+$/.test(suffix)) {
    return method === "DELETE";
  }
  if (/^\/store\/items\/[^/]+\/(?:restock|rebalance-price)$/.test(suffix)) {
    return method === "POST";
  }
  if (/^\/store\/items\/[^/]+\/status$/.test(suffix)) {
    return ["POST", "PATCH", "PUT"].includes(method);
  }
  if (/^\/store\/items\/[^/]+$/.test(suffix)) {
    return ["PATCH", "PUT", "DELETE"].includes(method);
  }
  return isSettingsMutation(method, suffix);
}

function isSettingsMutation(method: string, suffix: string): boolean {
  if (!["POST", "PUT", "PATCH"].includes(method)) return false;
  return suffix === "/settings" || /^\/settings\/[^/]+$/.test(suffix) ||
    (method === "POST" && /^\/settings\/[^/]+\/reset$/.test(suffix));
}

function settingsRequestBody(
  suffix: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const groupMatch = suffix.match(/^\/settings\/([^/]+)$/);
  if (!groupMatch) return body;
  const group = decodeURIComponent(groupMatch[1]).toLowerCase();
  if (["difficulty", "difficulty-policy"].includes(group)) return body;

  const fieldByGroup: Record<string, string> = {
    attendance: "attendanceWindow",
    "attendance-window": "attendanceWindow",
    business: "businessMarketWindow",
    "business-market": "businessMarketWindow",
    "business-market-window": "businessMarketWindow",
    stock: "stockMarketWindow",
    "stock-market": "stockMarketWindow",
    "stock-market-window": "stockMarketWindow",
    news: "newsSchedule",
    "news-schedule": "newsSchedule",
  };
  const field = fieldByGroup[group];
  if (!field) return body;
  const nested = record(body.value) ?? record(body.settings) ??
    record(body.payload) ?? body;
  return { [field]: nested };
}

async function readJsonObjectBody(
  request: Request,
  suffix: string,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.clone().formData();
    } catch {
      throw new AdminMutationError(
        "invalid_request_body",
        "Multipart request metadata is invalid.",
        400,
      );
    }

    let hasFile = false;
    form.forEach((value) => {
      if (typeof value !== "string" && value.size > 0) hasFile = true;
    });
    if (hasFile) {
      throw new AdminMutationError(
        suffix.startsWith("/store/items")
          ? "store_item_image_upload_not_configured"
          : "multipart_upload_not_supported",
        suffix.startsWith("/store/items")
          ? "Store item images require an approved storage and media policy before upload can be enabled."
          : "This administrator operation does not accept file uploads.",
        409,
      );
    }

    const metadata = form.get("metadata");
    if (typeof metadata === "string") {
      try {
        const parsed = record(JSON.parse(metadata));
        if (parsed) return parsed;
      } catch {
        // Converted into one stable client error below.
      }
    }
    throw new AdminMutationError(
      "invalid_request_body",
      "Multipart request metadata must be a JSON object.",
      400,
    );
  }

  const text = await request.clone().text();
  if (!text.trim()) return {};
  try {
    const value: unknown = JSON.parse(text);
    const parsed = record(value);
    if (parsed) return parsed;
  } catch {
    // Converted into one stable client error below.
  }
  throw new AdminMutationError(
    "invalid_request_body",
    "Request body must be a JSON object.",
    400,
  );
}

function handled(
  status: number,
  body: Record<string, unknown>,
): LocalAdminGameMutationResult {
  return { handled: true, status, body };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
