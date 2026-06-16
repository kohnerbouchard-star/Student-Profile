import { SupabaseRepositoryError } from "../../../supabase/queryResult";
import { RedeemPurchaseCodeError } from "./redeemPurchaseCode";

export type LicensingActivationSafeErrorCode =
  | "invalid_redemption_input"
  | "purchase_code_not_found"
  | "purchase_code_exhausted"
  | "purchase_code_expired"
  | "purchase_code_revoked"
  | "purchase_code_not_active"
  | "purchase_code_redemption_conflict"
  | "licensing_activation_failed";

export interface LicensingActivationSafeError {
  readonly code: LicensingActivationSafeErrorCode;
  readonly message: string;
  readonly httpStatus: number;
  readonly retryable: boolean;
}

export function mapLicensingActivationError(
  error: unknown,
): LicensingActivationSafeError {
  if (error instanceof RedeemPurchaseCodeError) {
    return {
      code: error.code,
      message: error.message,
      httpStatus: 400,
      retryable: false,
    };
  }

  if (error instanceof SupabaseRepositoryError) {
    return mapSupabaseActivationError(error);
  }

  return unknownActivationError();
}

function mapSupabaseActivationError(
  error: SupabaseRepositoryError,
): LicensingActivationSafeError {
  const message = normalizeErrorMessage(error.queryError.message);

  switch (message) {
    case "STAFF_USER_REQUIRED":
    case "PURCHASE_CODE_HASH_REQUIRED":
    case "GAME_NAME_REQUIRED":
      return {
        code: "invalid_redemption_input",
        message: "Activation request is missing required information.",
        httpStatus: 400,
        retryable: false,
      };

    case "PURCHASE_CODE_NOT_FOUND":
      return {
        code: "purchase_code_not_found",
        message: "Purchase code was not found.",
        httpStatus: 404,
        retryable: false,
      };

    case "PURCHASE_CODE_EXHAUSTED":
      return {
        code: "purchase_code_exhausted",
        message: "Purchase code has already been fully redeemed.",
        httpStatus: 409,
        retryable: false,
      };

    case "PURCHASE_CODE_EXPIRED":
      return {
        code: "purchase_code_expired",
        message: "Purchase code has expired.",
        httpStatus: 410,
        retryable: false,
      };

    case "PURCHASE_CODE_REVOKED":
      return {
        code: "purchase_code_revoked",
        message: "Purchase code has been revoked.",
        httpStatus: 403,
        retryable: false,
      };

    case "PURCHASE_CODE_NOT_ACTIVE":
      return {
        code: "purchase_code_not_active",
        message: "Purchase code is not active.",
        httpStatus: 409,
        retryable: false,
      };

    case "PURCHASE_CODE_REDEMPTION_CONFLICT":
      return {
        code: "purchase_code_redemption_conflict",
        message: "Purchase code redemption conflicted with another activation attempt.",
        httpStatus: 409,
        retryable: true,
      };

    default:
      return unknownActivationError();
  }
}

function normalizeErrorMessage(message: string): string {
  return message.trim().toUpperCase();
}

function unknownActivationError(): LicensingActivationSafeError {
  return {
    code: "licensing_activation_failed",
    message: "Purchase-code activation failed.",
    httpStatus: 500,
    retryable: false,
  };
}
