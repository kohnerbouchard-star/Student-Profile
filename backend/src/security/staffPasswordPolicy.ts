export const STAFF_PASSWORD_MIN_LENGTH = 15;
export const STAFF_PASSWORD_MAX_LENGTH = 128;

export type StaffPasswordPolicyFailureCode =
  | "password_too_short"
  | "password_too_long"
  | "password_missing_uppercase"
  | "password_missing_lowercase"
  | "password_missing_number"
  | "password_missing_symbol"
  | "password_contains_control_character";

export type StaffPasswordPolicyResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly code: StaffPasswordPolicyFailureCode;
      readonly message: string;
    };

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const UPPERCASE_PATTERN = /[A-Z]/u;
const LOWERCASE_PATTERN = /[a-z]/u;
const NUMBER_PATTERN = /[0-9]/u;
const SYMBOL_PATTERN = /[^A-Za-z0-9\s]/u;

export function validateStaffPassword(password: string): StaffPasswordPolicyResult {
  if (password.length < STAFF_PASSWORD_MIN_LENGTH) {
    return failure(
      "password_too_short",
      `Password must be at least ${STAFF_PASSWORD_MIN_LENGTH} characters.`,
    );
  }
  if (password.length > STAFF_PASSWORD_MAX_LENGTH) {
    return failure(
      "password_too_long",
      `Password must be no more than ${STAFF_PASSWORD_MAX_LENGTH} characters.`,
    );
  }
  if (CONTROL_CHARACTER_PATTERN.test(password)) {
    return failure(
      "password_contains_control_character",
      "Password cannot contain control characters.",
    );
  }
  if (!UPPERCASE_PATTERN.test(password)) {
    return failure(
      "password_missing_uppercase",
      "Password must contain at least one uppercase letter.",
    );
  }
  if (!LOWERCASE_PATTERN.test(password)) {
    return failure(
      "password_missing_lowercase",
      "Password must contain at least one lowercase letter.",
    );
  }
  if (!NUMBER_PATTERN.test(password)) {
    return failure(
      "password_missing_number",
      "Password must contain at least one number.",
    );
  }
  if (!SYMBOL_PATTERN.test(password)) {
    return failure(
      "password_missing_symbol",
      "Password must contain at least one symbol.",
    );
  }
  return { ok: true };
}

function failure(
  code: StaffPasswordPolicyFailureCode,
  message: string,
): StaffPasswordPolicyResult {
  return { ok: false, code, message };
}
