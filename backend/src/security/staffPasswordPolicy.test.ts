import {
  STAFF_PASSWORD_MAX_LENGTH,
  STAFF_PASSWORD_MIN_LENGTH,
  validateStaffPassword,
} from "./staffPasswordPolicy.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("accepts a 15-character mixed password", () => {
  assertEquals(validateStaffPassword("SecurePass123!x").ok, true);
});

Deno.test("rejects passwords shorter than 15 characters", () => {
  const result = validateStaffPassword("Short1!Password");
  assertEquals(result.ok, false);
  assertEquals(result.code, "password_too_short");
  assertEquals(STAFF_PASSWORD_MIN_LENGTH, 15);
});

Deno.test("requires uppercase, lowercase, number, and symbol", () => {
  assertEquals(
    validateStaffPassword("lowercase123!only").code,
    "password_missing_uppercase",
  );
  assertEquals(
    validateStaffPassword("UPPERCASE123!ONLY").code,
    "password_missing_lowercase",
  );
  assertEquals(
    validateStaffPassword("NoNumbers!Included").code,
    "password_missing_number",
  );
  assertEquals(
    validateStaffPassword("NoSymbols123Included").code,
    "password_missing_symbol",
  );
});

Deno.test("rejects control characters and excessive length", () => {
  assertEquals(
    validateStaffPassword("SecurePass123!\nxx").code,
    "password_contains_control_character",
  );
  assertEquals(
    validateStaffPassword(`Aa1!${"x".repeat(STAFF_PASSWORD_MAX_LENGTH)}`).code,
    "password_too_long",
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
