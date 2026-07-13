import {
  readCreatePlayerRequestBody,
} from "./playerRosterHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("create-player parser accepts the canonical contract", async () => {
  const result = await readCreatePlayerRequestBody(jsonRequest({
    displayName: "Avery Stone",
    rosterLabel: "A-1",
  }));

  assertEquals(result, {
    displayName: "Avery Stone",
    rosterLabel: "A-1",
  });
});

Deno.test("create-player parser normalizes v606 aliases", async () => {
  const result = await readCreatePlayerRequestBody(jsonRequest({
    player: {
      name: "Jordan Lee",
      label: "B-4",
    },
  }));

  assertEquals(result, {
    displayName: "Jordan Lee",
    rosterLabel: "B-4",
  });
});

Deno.test("create-player parser preserves an outer roster label with nested player data", async () => {
  const result = await readCreatePlayerRequestBody(jsonRequest({
    rosterLabel: "C-7",
    data: {
      studentName: "Morgan Park",
    },
  }));

  assertEquals(result, {
    displayName: "Morgan Park",
    rosterLabel: "C-7",
  });
});

Deno.test("create-player parser rejects a missing display name", async () => {
  await assertRejectsCode(
    () => readCreatePlayerRequestBody(jsonRequest({ rosterLabel: "D-2" })),
    "player_display_name_required",
  );
});

function jsonRequest(body: unknown): Request {
  return new Request("https://example.test/players", {
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
