import { normalizeMfaQrCode } from "./mfaQrCode.ts";

export interface MfaFactor {
  readonly id: string;
  readonly friendly_name?: string;
  readonly factor_type?: string;
  readonly status?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
}

export interface TotpEnrollmentSuccess {
  readonly ok: true;
  readonly factorId: string;
  readonly qrCode: string;
  readonly secret: string;
  readonly uri: string;
}

export interface TotpEnrollmentFailure {
  readonly ok: false;
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export type TotpEnrollmentResult = TotpEnrollmentSuccess | TotpEnrollmentFailure;

export function readMfaFactors(value: unknown): MfaFactor[] {
  const record = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const all = [
    ...(Array.isArray(record.totp) ? record.totp : []),
    ...(Array.isArray(record.phone) ? record.phone : []),
  ];
  return all.filter((factor): factor is MfaFactor =>
    Boolean(
      factor &&
        typeof factor === "object" &&
        String((factor as Record<string, unknown>).id || ""),
    )
  );
}

export function readVerifiedTotpFactors(value: unknown): MfaFactor[] {
  return readMfaFactors(value).filter((factor) =>
    factor.status === "verified" &&
    (factor.factor_type === "totp" || factor.factor_type === undefined)
  );
}

export async function createCanonicalTotpEnrollment(
  client: any,
  friendlyName: string,
): Promise<TotpEnrollmentResult> {
  const { data: factorData, error: factorError } = await client.auth.mfa.listFactors();
  if (factorError) {
    return failure(
      503,
      "mfa_factor_state_unavailable",
      "Authenticator enrollment state is temporarily unavailable.",
      true,
    );
  }

  const matching = readMfaFactors(factorData).filter((factor) =>
    (factor.factor_type === "totp" || factor.factor_type === undefined) &&
    String(factor.friendly_name || "") === friendlyName
  );

  if (matching.some((factor) => factor.status === "verified")) {
    return failure(
      409,
      "mfa_factor_name_conflict",
      "An authenticator with this name is already enrolled.",
      false,
    );
  }

  for (const factor of matching) {
    if (factor.status !== "unverified") continue;
    const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
    if (error) {
      return failure(
        503,
        "mfa_stale_factor_cleanup_failed",
        "An abandoned authenticator setup could not be cleared safely.",
        true,
      );
    }
  }

  const { data, error } = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
  });
  const factorId = String(data?.id || "");
  const qrCode = normalizeMfaQrCode(data?.totp?.qr_code);
  const secret = normalizeTotpSecret(data?.totp?.secret);
  const uri = normalizeTotpUri(data?.totp?.uri);

  if (error || !factorId || !qrCode || !secret || !uri) {
    if (factorId) {
      await client.auth.mfa.unenroll({ factorId }).catch?.(() => null);
    }
    return failure(
      502,
      "invalid_mfa_enrollment_payload",
      "Authenticator enrollment did not return a valid setup contract.",
      true,
    );
  }

  return { ok: true, factorId, qrCode, secret, uri };
}

function normalizeTotpSecret(value: unknown): string {
  const secret = String(value || "").replace(/\s+/gu, "").toUpperCase();
  return /^[A-Z2-7]{16,128}$/u.test(secret) ? secret : "";
}

function normalizeTotpUri(value: unknown): string {
  const uri = String(value || "").trim();
  if (uri.length === 0 || uri.length > 2_048) return "";
  try {
    const parsed = new URL(uri);
    return parsed.protocol === "otpauth:" &&
        parsed.hostname.toLowerCase() === "totp" &&
        /^[A-Z2-7]{16,128}$/u.test(String(parsed.searchParams.get("secret") || "").toUpperCase())
      ? uri
      : "";
  } catch {
    return "";
  }
}

function failure(
  status: number,
  code: string,
  message: string,
  retryable: boolean,
): TotpEnrollmentFailure {
  return { ok: false, status, code, message, retryable };
}
