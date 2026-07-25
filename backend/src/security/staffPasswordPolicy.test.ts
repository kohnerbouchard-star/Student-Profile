import assert from "node:assert/strict";
import test from "node:test";
import {
  STAFF_PASSWORD_MAX_LENGTH,
  STAFF_PASSWORD_MIN_LENGTH,
  validateStaffPassword,
} from "./staffPasswordPolicy.ts";

test("accepts a 15-character mixed password", () => {
  const result = validateStaffPassword("SecurePass123!x");
  assert.equal(result.ok, true);
});

test("rejects passwords shorter than 15 characters", () => {
  const result = validateStaffPassword("Short1!Password");
  assert.equal(result.ok, false);
  assert.equal(result.code, "password_too_short");
  assert.equal(STAFF_PASSWORD_MIN_LENGTH, 15);
});

test("requires uppercase, lowercase, number, and symbol", () => {
  assert.equal(validateStaffPassword("lowercase123!only").code, "password_missing_uppercase");
  assert.equal(validateStaffPassword("UPPERCASE123!ONLY").code, "password_missing_lowercase");
  assert.equal(validateStaffPassword("NoNumbers!Included").code, "password_missing_number");
  assert.equal(validateStaffPassword("NoSymbols123Included").code, "password_missing_symbol");
});

test("rejects control characters and excessive length", () => {
  assert.equal(
    validateStaffPassword("SecurePass123!\nxx").code,
    "password_contains_control_character",
  );
  assert.equal(
    validateStaffPassword(`Aa1!${"x".repeat(STAFF_PASSWORD_MAX_LENGTH)}`).code,
    "password_too_long",
  );
});
