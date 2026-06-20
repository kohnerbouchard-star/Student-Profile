import {
  resolveStaffIdentity,
  type StaffAccessRepository,
} from "../../../auth/staffAccess.ts";
import type {
  AccessBoundaryError,
  SupabaseAuthUser,
} from "../../../auth/types.ts";
import type {
  LicensingActivationErrorResponse,
  LicensingActivationResponse,
} from "../contracts/activationContract.ts";
import {
  handleStaffLicensingActivation,
} from "../infrastructure/licensingActivationHandler.ts";
import type {
  LicensingActivationRepository,
} from "../infrastructure/licensingRepository.ts";
import type {
  WebCryptoRuntime,
} from "../infrastructure/webCryptoSha256Digest.ts";

export interface LicensingActivationRouteRequest {
  readonly supabaseAuthUser?: SupabaseAuthUser | null;
  readonly body: unknown;
  readonly requestId?: string | null;
  readonly source?: string | null;
}

export interface LicensingActivationRouteDependencies {
  readonly staffRepository: Pick<
    StaffAccessRepository,
    "findStaffUserBySupabaseAuthUserId"
  >;
  readonly activationRepository: LicensingActivationRepository;
  readonly runtime?: WebCryptoRuntime;
}

export interface LicensingActivationRouteResult {
  readonly ok: boolean;
  readonly status: number;
  readonly body: LicensingActivationResponse;
}

export async function handleLicensingActivationRoute(
  request: LicensingActivationRouteRequest,
  dependencies: LicensingActivationRouteDependencies,
): Promise<LicensingActivationRouteResult> {
  if (!request.supabaseAuthUser?.id) {
    return errorResult(401, {
      code: "missing_staff_auth_user",
      message: "A verified Supabase Auth user is required to activate licensing.",
      retryable: false,
    });
  }

  const staffIdentityResult = await resolveStaffIdentity(
    request.supabaseAuthUser,
    dependencies.staffRepository,
  );

  if (!staffIdentityResult.ok) {
    return accessErrorResult(staffIdentityResult.error);
  }

  const result = await handleStaffLicensingActivation(
    {
      body: request.body,
      staffIdentity: staffIdentityResult.value,
      metadata: {
        requestId: request.requestId,
        source: request.source ?? "licensing_activation_route",
      },
    },
    {
      activationRepository: dependencies.activationRepository,
      runtime: dependencies.runtime,
    },
  );

  return {
    ok: result.body.ok,
    status: result.httpStatus,
    body: result.body,
  };
}

function accessErrorResult(
  error: AccessBoundaryError,
): LicensingActivationRouteResult {
  return errorResult(error.status, {
    code: error.code,
    message: error.message,
    retryable: false,
  });
}

function errorResult(
  status: number,
  error: LicensingActivationErrorResponse["error"],
): LicensingActivationRouteResult {
  return {
    ok: false,
    status,
    body: {
      ok: false,
      error,
    },
  };
}
