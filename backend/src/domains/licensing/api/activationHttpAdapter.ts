import type {
  SupabaseAuthUser,
} from "../../../auth/types";
import {
  handleLicensingActivationRoute,
  type LicensingActivationRouteDependencies,
} from "./activationRouteHandler";

export interface LicensingActivationHttpRequest {
  readonly method: string;
  readonly body: unknown;
  readonly supabaseAuthUser?: SupabaseAuthUser | null;
  readonly requestId?: string | null;
}

export interface LicensingActivationHttpResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

export async function handleLicensingActivationHttpRequest(
  request: LicensingActivationHttpRequest,
  dependencies: LicensingActivationRouteDependencies,
): Promise<LicensingActivationHttpResponse> {
  if (request.method.toUpperCase() !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: {
        code: "method_not_allowed",
        message: "Use POST to activate licensing.",
        retryable: false,
      },
    });
  }

  const result = await handleLicensingActivationRoute(
    {
      body: request.body,
      supabaseAuthUser: request.supabaseAuthUser,
      requestId: request.requestId,
      source: "licensing_activation_http_adapter",
    },
    dependencies,
  );

  return jsonResponse(result.status, result.body);
}

function jsonResponse(
  status: number,
  body: unknown,
): LicensingActivationHttpResponse {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body,
  };
}
