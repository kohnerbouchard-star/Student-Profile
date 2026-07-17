import {
  readPlayerAttendanceWindowConfig,
  readStaffAttendanceScanRequestBody,
} from "./attendanceHttpHelpers.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("attendance window preserves legacy fixed rewards until local policy is saved", () => {
  assertEquals(readPlayerAttendanceWindowConfig({}), {
    timezone: "Asia/Seoul",
    lateCutoffMinutes: null,
    presentRewardAmount: 1,
    lateRewardAmount: 0,
    currencyCode: "ECO",
    currencyMode: "fixed",
    applyDifficultyIncomeModifier: false,
  });
});

Deno.test("attendance window preserves explicit reward values including zero", () => {
  assertEquals(readPlayerAttendanceWindowConfig({
    timezone: "America/Los_Angeles",
    lateCutoff: "09:15",
    presentRewardAmount: 0,
    lateRewardAmount: 0.5,
    currencyCode: "eco",
    currencyMode: "fixed",
    applyDifficultyIncomeModifier: false,
  }), {
    timezone: "America/Los_Angeles",
    lateCutoffMinutes: 555,
    presentRewardAmount: 0,
    lateRewardAmount: 0.5,
    currencyCode: "ECO",
    currencyMode: "fixed",
    applyDifficultyIncomeModifier: false,
  });
});

Deno.test("attendance window enables local currency and difficulty only when explicit", () => {
  assertEquals(readPlayerAttendanceWindowConfig({
    presentRewardAmount: 2.5,
    lateRewardAmount: 0.5,
    currencyCode: "eco",
    currencyMode: "player_country",
    applyDifficultyIncomeModifier: true,
  }), {
    timezone: "Asia/Seoul",
    lateCutoffMinutes: null,
    presentRewardAmount: 2.5,
    lateRewardAmount: 0.5,
    currencyCode: "ECO",
    currencyMode: "player_country",
    applyDifficultyIncomeModifier: true,
  });
});

Deno.test("attendance scan parser accepts the canonical contract", async () => {
  const result = await readStaffAttendanceScanRequestBody(jsonRequest({
    playerId: "STUDENT-1234",
    deviceTimezone: "Asia/Seoul",
  }));

  assertEquals(result, {
    playerId: "STUDENT-1234",
    deviceTimezone: "Asia/Seoul",
  });
});

Deno.test("attendance scan parser normalizes v606 scanner aliases", async () => {
  const result = await readStaffAttendanceScanRequestBody(jsonRequest({
    scan: {
      scannedCode: "STUDENT-5678",
      timezone: "Asia/Seoul",
    },
  }));

  assertEquals(result, {
    playerId: "STUDENT-5678",
    deviceTimezone: "Asia/Seoul",
  });
});

Deno.test("attendance scan parser accepts a direct scan value", async () => {
  const result = await readStaffAttendanceScanRequestBody(jsonRequest({
    scanValue: "STUDENT-9012",
    timeZone: "Asia/Seoul",
  }));

  assertEquals(result, {
    playerId: "STUDENT-9012",
    deviceTimezone: "Asia/Seoul",
  });
});

Deno.test("attendance scan parser rejects a missing code", async () => {
  await assertRejectsCode(
    () => readStaffAttendanceScanRequestBody(jsonRequest({
      deviceTimezone: "Asia/Seoul",
    })),
    "playerId",
  );
});

function jsonRequest(body: unknown): Request {
  return new Request("https://example.test/attendance/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function assertRejectsCode(
  run: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    assertEquals((error as { code?: unknown }).code, expectedCode);
    return;
  }
  throw new Error(`Expected ${expectedCode} error.`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}.`);
  }
}
