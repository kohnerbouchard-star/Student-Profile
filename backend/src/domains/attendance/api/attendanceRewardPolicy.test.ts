import { calculateAttendanceRewardAmount } from "./attendanceRewardPolicy.ts";

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

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
