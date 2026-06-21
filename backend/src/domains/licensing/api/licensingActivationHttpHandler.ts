import {
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { extractBearerToken } from "../../../platform/supabase/edgeAuth.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readSupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import type { StaffUserRecord } from "../../../auth/types.ts";
import {
  handleLicensingActivationRoute,
} from "./activationRouteHandler.ts";
import {
  createSupabaseLicensingActivationRepository,
  createSupabaseLicensingRepository,
  type SupabaseLicensingActivationRepositoryClient,
  type SupabaseLicensingRepositoryClient,
} from "../infrastructure/licensingRepository.ts";

interface LicensingActivationEdgeDependencies {
  readonly createAuthClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
}

interface StaffUserUpsertClient {
  from(tableName: "staff_users"): {
    upsert(
      values: {
        readonly supabase_auth_user_id: string;
        readonly email: string;
        readonly display_name: string;
      },
      options: { readonly onConflict: string },
    ): {
      select(columns: string): {
        single(): Promise<{
          readonly data: StaffUserRecord | null;
          readonly error: { readonly message?: string } | null;
        }>;
      };
    };
  };
}

const STAFF_USER_COLUMNS = "id,supabase_auth_user_id,email,display_name";

export async function handleLicensingActivationRequest(
  request: Request,
  dependencies: LicensingActivationEdgeDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(405, {
      ok: false,
      error: {
        code: "method_not_allowed",
        message: "Use POST to activate licensing.",
        retryable: false,
      },
    });
  }

  try {
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return jsonResponse(500, {
        ok: false,
        error: {
          code: "missing_edge_runtime_config",
          message: "Classroom API runtime configuration is incomplete.",
          retryable: false,
        },
      });
    }

    const body = await readJsonRequestBody(request);
    const accessToken = extractBearerToken(request.headers.get("authorization"));

    if (!accessToken) {
      return jsonResponse(401, {
        ok: false,
        error: {
          code: "missing_staff_auth_user",
          message: "A verified Supabase Auth user is required to activate licensing.",
          retryable: false,
        },
      });
    }

    const authClient = dependencies.createAuthClient(envResult.value);
    const authUserResult = await authClient.auth.getUser(accessToken);
    const authUser = authUserResult.data.user;

    if (authUserResult.error || !authUser?.id) {
      return jsonResponse(401, {
        ok: false,
        error: {
          code: "missing_staff_auth_user",
          message: "A verified Supabase Auth user is required to activate licensing.",
          retryable: false,
        },
      });
    }

    const serviceClient = dependencies.createServiceClient(envResult.value);
    const licenseCheck = await validateActivePurchaseCode(
      serviceClient,
      readPurchaseCodeFromBody(body),
    );

    if (licenseCheck) {
      return licenseCheck;
    }

    const staff = await upsertStaffUser(serviceClient, {
      supabaseAuthUserId: authUser.id,
      email: authUser.email ?? "",
    });

    const result = await handleLicensingActivationRoute(
      {
        body,
        supabaseAuthUser: {
          id: authUser.id,
          email: authUser.email ?? null,
        },
        requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
        source: "classroom_api_edge_licensing_activation",
      },
      {
        staffRepository: {
          findStaffUserBySupabaseAuthUserId: async (supabaseAuthUserId) =>
            supabaseAuthUserId === staff.supabase_auth_user_id
              ? staff
              : null,
        },
        activationRepository: createSupabaseLicensingActivationRepository(
          serviceClient as unknown as SupabaseLicensingActivationRepositoryClient,
        ),
      },
    );

    return jsonResponse(result.status, result.body);
  } catch {
    return jsonResponse(500, {
      ok: false,
      error: {
        code: "licensing_activation_failed",
        message: "Purchase-code activation failed.",
        retryable: false,
      },
    });
  }
}

async function readJsonRequestBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("invalid_request_body");
  }
}

function readPurchaseCodeFromBody(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";

  const value = (body as { readonly purchaseCode?: unknown }).purchaseCode;

  return typeof value === "string" ? value.trim() : "";
}

async function validateActivePurchaseCode(
  serviceClient: EdgeSupabaseClient,
  purchaseCode: string,
): Promise<Response | null> {
  if (!purchaseCode) {
    return jsonResponse(400, {
      ok: false,
      error: {
        code: "purchase_code_required",
        message: "purchaseCode is required.",
        retryable: false,
      },
    });
  }

  const repository = createSupabaseLicensingRepository(
    serviceClient as unknown as SupabaseLicensingRepositoryClient,
  );
  const purchaseCodeRecord = await repository.findPurchaseCodeByHash(
    await sha256Hex(purchaseCode),
  );

  if (!purchaseCodeRecord || purchaseCodeRecord.status !== "active") {
    return jsonResponse(401, {
      ok: false,
      error: {
        code: "invalid_purchase_code",
        message: "License Code is invalid or inactive.",
        retryable: false,
      },
    });
  }

  if (purchaseCodeRecord.expires_at && Date.parse(purchaseCodeRecord.expires_at) <= Date.now()) {
    return jsonResponse(410, {
      ok: false,
      error: {
        code: "purchase_code_expired",
        message: "License Code has expired.",
        retryable: false,
      },
    });
  }

  if (purchaseCodeRecord.redeemed_count >= purchaseCodeRecord.max_redemptions) {
    return jsonResponse(409, {
      ok: false,
      error: {
        code: "purchase_code_exhausted",
        message: "License Code has already been fully redeemed.",
        retryable: false,
      },
    });
  }

  return null;
}

async function upsertStaffUser(
  serviceClient: EdgeSupabaseClient,
  input: {
    readonly supabaseAuthUserId: string;
    readonly email: string;
  },
): Promise<StaffUserRecord> {
  const email = input.email.trim().toLowerCase();

  if (!email) {
    throw new Error("missing_staff_email");
  }

  const client = serviceClient as unknown as StaffUserUpsertClient;
  const response = await client
    .from("staff_users")
    .upsert(
      {
        supabase_auth_user_id: input.supabaseAuthUserId,
        email,
        display_name: email,
      },
      { onConflict: "supabase_auth_user_id" },
    )
    .select(STAFF_USER_COLUMNS)
    .single();

  if (response.error || !response.data?.id) {
    throw new Error("staff_user_upsert_failed");
  }

  return response.data;
}
