import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface EdgeErrorBody {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
}

interface EdgeHealthBody {
  readonly ok: true;
  readonly service: "classroom-api";
  readonly status: "ready";
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

Deno.serve(async (request) => {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return jsonResponse(204, null);
  }

  if (url.pathname.endsWith("/health")) {
    return jsonResponse<EdgeHealthBody>(200, {
      ok: true,
      service: "classroom-api",
      status: "ready",
    });
  }

  if (url.pathname.endsWith("/licensing/activate")) {
    return handleLicensingActivationRequest(request);
  }

  return jsonError(404, {
    code: "route_not_found",
    message: "Classroom API route was not found.",
    retryable: false,
  });
});

async function handleLicensingActivationRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to activate licensing.",
      retryable: false,
    });
  }

  const envResult = readSupabaseEnv();

  if (!envResult.ok) {
    return jsonError(500, {
      code: "missing_edge_runtime_config",
      message: "Classroom API runtime configuration is incomplete.",
      retryable: false,
    });
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return jsonError(401, {
      code: "missing_staff_auth_user",
      message: "A verified Supabase Auth user is required to activate licensing.",
      retryable: false,
    });
  }

  const authClient = createClient(
    envResult.value.supabaseUrl,
    envResult.value.supabaseAnonKey,
    {
      global: {
        headers: {
          authorization: authHeader,
        },
      },
    },
  );

  const authUserResult = await authClient.auth.getUser();

  if (authUserResult.error || !authUserResult.data.user?.id) {
    return jsonError(401, {
      code: "missing_staff_auth_user",
      message: "A verified Supabase Auth user is required to activate licensing.",
      retryable: false,
    });
  }

  // Keep this client server-side only. Never expose the service-role key.
  createClient(
    envResult.value.supabaseUrl,
    envResult.value.supabaseServiceRoleKey,
  );

  // Runtime route is intentionally not calling activation yet.
  // Next checkpoint should solve Deno-compatible backend handler import/wiring.
  return jsonError(501, {
    code: "licensing_activation_edge_wiring_pending",
    message: "Licensing activation Edge wiring is not enabled yet.",
    retryable: false,
  });
}

interface SupabaseEnv {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly supabaseServiceRoleKey: string;
}

function readSupabaseEnv():
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

function jsonError(
  status: number,
  error: EdgeErrorBody["error"],
): Response {
  return jsonResponse<EdgeErrorBody>(status, {
    ok: false,
    error,
  });
}

function jsonResponse<TBody>(
  status: number,
  body: TBody,
): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}
