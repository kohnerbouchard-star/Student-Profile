import {
  calculateAttendanceRewardAmount,
  selectAttendanceIncomeModifier,
} from "./attendanceRewardPolicy.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("attendance reward applies difficulty income and country exchange modifiers", () => {
  assertEquals(calculateAttendanceRewardAmount(10, 0.75, 1.2), 9);
});

Deno.test("attendance reward rounds to currency precision", () => {
  assertEquals(calculateAttendanceRewardAmount(1.01, 1.1, 1.05), 1.17);
});

Deno.test("attendance reward clamps policy multipliers to bounded game settings", () => {
  assertEquals(calculateAttendanceRewardAmount(10, 9, 0.1), 10);
});

Deno.test("active game difficulty policy overrides the saved preset profile", () => {
  assertEquals(selectAttendanceIncomeModifier(0.82, 0.95), 0.82);
});

Deno.test("saved difficulty preset profile supplies the modifier when no active policy exists", () => {
  assertEquals(selectAttendanceIncomeModifier(null, "0.9500"), 0.95);
});

Deno.test("missing difficulty policy data falls back to a neutral modifier", () => {
  assertEquals(selectAttendanceIncomeModifier(undefined, undefined), 1);
});

Deno.test("difficulty policy fallback values remain inside supported bounds", () => {
  assertEquals(selectAttendanceIncomeModifier(null, 0.1), 0.5);
  assertEquals(selectAttendanceIncomeModifier(9, 0.95), 2);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
