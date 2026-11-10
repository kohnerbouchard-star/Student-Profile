import type {
  PlayerRosterImportRepository,
  RosterImportStaffContext,
} from "../contracts/playerRosterImport.ts";
import {
  AdminMutationError,
  adminMutationErrorBody,
  readAdminMutationIdentity,
} from "../../../platform/supabase/adminMutation.ts";
import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import {
  importPlayerRoster,
  parseRosterImportNames,
} from "../application/importPlayerRoster.ts";

/** Called only by the secured, owned-game Admin dispatcher. */
export async function handlePlayerRosterImport(
  repository: PlayerRosterImportRepository,
  input: {
    request: Request;
    suffix: string;
    applicationContext: RosterImportStaffContext;
  },
) {
  if (
    input.request.method !== "POST" || input.suffix !== "/players/imports/csv"
  ) return { handled: false as const };
  try {
    const context = input.applicationContext;
    if (
      context.role !== "game_admin" || context.actor.kind !== "staff" ||
      !context.actor.staffUserId || !context.gameSessionId ||
      context.assuranceLevel !== "aal2" ||
      !context.permissions.includes("players.manage")
    ) {
      throw new AdminMutationError(
        "staff_permission_denied",
        "Roster import requires an authorized AAL2 Admin game context.",
        403,
      );
    }
    if (
      !/^application\/json(?:;|$)/i.test(
        input.request.headers.get("content-type") ?? "",
      )
    ) {
      throw new AdminMutationError(
        "invalid_roster_import",
        "Roster import accepts JSON studentNames only, not file uploads.",
        400,
      );
    }
    const reader = input.request.body?.getReader();
    if (!reader) {
      throw new AdminMutationError(
        "invalid_roster_import",
        "Student names are required.",
        400,
      );
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 256_000) {
        await reader.cancel();
        throw new AdminMutationError(
          "roster_import_too_large",
          "Roster import request is too large.",
          413,
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let body: unknown;
    try {
      body = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      throw new AdminMutationError(
        "invalid_roster_import",
        "Roster import requires valid JSON.",
        400,
      );
    }
    const studentNames = parseRosterImportNames(body);
    const identity = readAdminMutationIdentity(input.request, body);
    const result = await importPlayerRoster(
      repository,
      {
        gameSessionId: input.applicationContext.gameSessionId,
        staffUserId: input.applicationContext.actor.staffUserId,
        studentNames,
        identity,
      },
    );
    const { status, ...data } = result;
    return { handled: true as const, status, body: { data } };
  } catch (error) {
    if (error instanceof AdminMutationError) {
      return {
        handled: true as const,
        status: error.status,
        body: adminMutationErrorBody(error),
      };
    }
    if (error instanceof EdgeActivationError) {
      return {
        handled: true as const,
        status: error.status,
        body: {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
          },
        },
      };
    }
    // Never log database arguments or credential-bearing exception objects.
    return {
      handled: true as const,
      status: 500,
      body: {
        ok: false,
        error: {
          code: "roster_import_failed",
          message:
            "Import could not be confirmed. Retry with the same Idempotency-Key.",
          retryable: true,
        },
      },
    };
  }
}
