import { jsonResponse } from "../../../src/platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  recoverySessionId,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import { createCanonicalTotpEnrollment } from "./mfaEnrollmentLifecycle.ts";

// The entrypoint supplies its existing signed handles and verification routines.
// Session authorization and grant binding run before this handler is invoked.
export interface RecoveryDependencies {
  rejectUnknownFields(
    body: Record<string, unknown>,
    allowed: Set<string>,
  ): void;
  privateHeaders(): HeadersInit;
  createFactorHandle(userId: string, factorId: string): Promise<string>;
  readFactorHandle(value: unknown, userId: string): Promise<string>;
  handleVerify(
    client: any,
    userId: string,
    body: Record<string, unknown>,
  ): Promise<Response>;
}

export class MfaRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "MfaRequestError";
  }
}

export async function handleSystemRecovery(
  userClient: any,
  service: Pick<EdgeSupabaseClient, "rpc">,
  userId: string,
  token: string,
  digest: string,
  operation: string,
  body: Record<string, unknown>,
  aal: string,
  dependencies: RecoveryDependencies,
): Promise<Response> {
  const {
    rejectUnknownFields,
    privateHeaders,
    createFactorHandle,
    readFactorHandle,
    handleVerify,
  } = dependencies;
  const allowed = operation === "enroll"
    ? ["grant", "slot"]
    : operation === "verify"
    ? ["grant", "slot", "factorHandle", "code"]
    : ["grant"];
  rejectUnknownFields(body, new Set(allowed));
  const args = {
    p_user: userId,
    p_session: recoverySessionId(token, userId),
    p_digest: digest,
  };
  const found = await service.rpc<any>("system_recovery_context_v1", args);
  const context = found.data;
  if (found.error || !context || context.phase !== "enrolling") {
    throw new MfaRequestError(
      "recovery_unavailable",
      "Recovery requires a fresh authorized attempt.",
      403,
      false,
    );
  }
  if (operation === "claim" || operation === "status") {
    return jsonResponse(200, {
      ok: true,
      primaryVerified: context.primaryVerified === true,
      backupVerified: context.backupVerified === true,
      setupInterrupted: Boolean(
        (context.primaryReserved && !context.primaryVerified) ||
          (context.backupReserved && !context.backupVerified),
      ),
    }, privateHeaders());
  }
  const slot = body.slot;
  if (slot !== "primary" && slot !== "backup") {
    throw new MfaRequestError(
      "invalid_recovery_request",
      "Choose the recovery authenticator slot.",
      400,
      false,
    );
  }
  if (slot === "backup" && (!context.primaryVerified || aal !== "aal2")) {
    throw new MfaRequestError(
      "staff_mfa_required",
      "Verify the primary authenticator first.",
      403,
      false,
    );
  }
  if (operation === "enroll") {
    if (context[slot]) {
      throw new MfaRequestError(
        "recovery_setup_interrupted",
        "This setup already started. Contact the system operator if its QR code is unavailable.",
        409,
        false,
      );
    }
    const reservation = await service.rpc("system_recovery_reserve_factor_v1", {
      ...args,
      p_slot: slot,
    });
    if (reservation.error) {
      throw new MfaRequestError(
        "recovery_setup_interrupted",
        "Recovery setup already started. Contact the system operator if interrupted.",
        409,
        false,
      );
    }
    const enrolled = await createCanonicalTotpEnrollment(
      userClient,
      `Econovaria recovery ${slot}`,
    );
    if (enrolled.ok === false) {
      throw new MfaRequestError(
        enrolled.code,
        enrolled.message,
        enrolled.status,
        enrolled.retryable,
      );
    }
    const saved = await service.rpc("system_recovery_record_factor_v1", {
      ...args,
      p_factor: enrolled.factorId,
      p_slot: slot,
    });
    if (saved.error) {
      await userClient.auth.mfa.unenroll({ factorId: enrolled.factorId });
      throw new MfaRequestError(
        "recovery_setup_failed",
        "Recovery setup could not be recorded.",
        503,
        false,
      );
    }
    return jsonResponse(201, {
      ok: true,
      factor: {
        handle: await createFactorHandle(userId, enrolled.factorId),
        qrCode: enrolled.qrCode,
        secret: enrolled.secret,
      },
    }, privateHeaders());
  }
  const factorId = await readFactorHandle(body.factorHandle, userId);
  if (!context[slot] || context[slot] !== factorId) {
    throw new MfaRequestError(
      "recovery_factor_denied",
      "This factor does not belong to this recovery attempt.",
      403,
      false,
    );
  }
  const verified = await handleVerify(userClient, userId, {
    factorHandle: body.factorHandle,
    code: body.code,
  });
  if (!verified.ok) return verified;
  const data = await verified.json();
  return jsonResponse(
    200,
    { ok: true, accessToken: data.session.accessToken },
    privateHeaders(),
  );
}
