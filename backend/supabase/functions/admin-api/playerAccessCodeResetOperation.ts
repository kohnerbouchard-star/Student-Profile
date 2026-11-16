import { handleResetPlayerAccessCodeRequest } from "../../../src/domains/players/api/playerAccessCodeResetHttpHandler.ts";
import { resolveStaffForRequest } from "../_shared/econovariaAuth.ts";
import { corsHeaders } from "./cors.ts";
import type { AdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";

export async function handleAdminPlayerAccessCodeResetOperation(
  request: Request,
  input: {
    readonly applicationContext: AdminRequestApplicationContext;
    readonly gameSessionId: string;
    readonly suffix: string;
  },
): Promise<Response | null> {
  const match = input.suffix.match(/^\/players\/([^/]+)\/access-code\/reset$/);
  if (!match || request.method !== "POST") return null;

  const context = input.applicationContext;
  if (
    !context || context.role !== "game_admin" ||
    context.actor?.kind !== "staff" || !context.actor.staffUserId ||
    context.gameSessionId !== input.gameSessionId ||
    context.requiredPermission !== "players.manage" ||
    !Array.isArray(context.permissions) ||
    !context.permissions.includes("players.manage")
  ) {
    return new Response(JSON.stringify({
      code: "staff_permission_denied",
      message: "Player credential reset requires the authorized Admin game context.",
    }), {
      status: 403,
      headers: {
        ...corsHeaders(request),
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const response = await handleResetPlayerAccessCodeRequest(
    request,
    input.gameSessionId,
    decodeURIComponent(match[1]),
    { resolveStaffForRequest },
  );
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": response.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store",
    },
  });
}
