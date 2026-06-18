import type { EdgeErrorBody } from "./edgeResponse.ts";

declare const Deno: {
  readonly env: {
    get(name: string): string | undefined;
  };
};

export interface SupabaseEnv {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly supabaseServiceRoleKey: string;
}

// The Edge function does not use generated Supabase DB types yet.
// Keep the service-role client untyped in this Deno shim and validate rows manually.
export type EdgeSupabaseClient = any;

export function readSupabaseEnv():
  | { readonly ok: true; readonly value: SupabaseEnv }
  | { readonly ok: false } {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      supabaseUrl,
      supabaseAnonKey,
      supabaseServiceRoleKey,
    },
  };
}

export async function readOwnedGameSession(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  staffUserId: string,
): Promise<
  | {
      readonly ok: true;
      readonly gameSession: {
        readonly id: string;
        readonly name: string;
        readonly status: string;
      };
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    }
> {
  const gameResponse = await serviceClient
    .from("game_sessions")
    .select("id,name,status,owner_staff_user_id")
    .eq("id", gameSessionId)
    .eq("owner_staff_user_id", staffUserId)
    .maybeSingle();

  if (gameResponse.error) {
    return {
      ok: false,
      status: 500,
      error: {
        code: "game_session_lookup_failed",
        message: "Game session lookup failed.",
        retryable: false,
      },
    };
  }

  const gameSession = gameResponse.data;

  if (!gameSession?.id) {
    return {
      ok: false,
      status: 404,
      error: {
        code: "game_session_not_found",
        message: "Game session was not found for this staff user.",
        retryable: false,
      },
    };
  }

  return {
    ok: true,
    gameSession: {
      id: gameSession.id,
      name: gameSession.name,
      status: gameSession.status,
    },
  };
}
