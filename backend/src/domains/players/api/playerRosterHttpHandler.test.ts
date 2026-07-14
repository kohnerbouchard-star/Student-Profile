import {
  readCreatePlayerRequestBody,
} from "./playerRosterHttpHandler.ts";


declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("create-player parser accepts the canonical identity contract", async () => {
  const result = await readCreatePlayerRequestBody(jsonRequest({
    displayName: "Avery Stone",
    rosterLabel: "A-1",
    playerIdentifier: "RFID:04A1B2C3",
    accessCode: "AVERY-4826",
  }));

  assertEquals(result, {
    displayName: "Avery Stone",
    rosterLabel: "A-1",
    playerIdentifier: "RFID:04A1B2C3",
    accessCode: "AVERY-4826",
  });
});

Deno.test("create-player parser normalizes v606 RFID aliases", async () => {
  const result = await readCreatePlayerRequestBody(jsonRequest({
    player: {
      name: "Jordan Lee",
      label: "B-4",
      rfidCardId: "04-A1-B2-C3-D4",
      pin: "JORDAN-5937",
    },
  }));

  assertEquals(result, {
    displayName: "Jordan Lee",
    rosterLabel: "B-4",
    playerIdentifier: "04-A1-B2-C3-D4",
    accessCode: "JORDAN-5937",
  });
});

Deno.test("create-player parser preserves outer identity fields with nested player data", async () => {
  const result = await readCreatePlayerRequestBody(jsonRequest({
    rosterLabel: "C-7",
    playerId: "RFID:CARD-007",
    accessCode: "MORGAN-6174",
    data: {
      studentName: "Morgan Park",
    },
  }));

  assertEquals(result, {
    displayName: "Morgan Park",
    rosterLabel: "C-7",
    playerIdentifier: "RFID:CARD-007",
    accessCode: "MORGAN-6174",
  });
});

Deno.test("create-player parser rejects a missing display name", async () => {
  await assertRejectsCode(
    () => readCreatePlayerRequestBody(jsonRequest({
      rosterLabel: "D-2",
      playerIdentifier: "RFID:D-2",
      accessCode: "PLAYER-2468",
    })),
    "player_display_name_required",
  );
});

Deno.test("create-player parser rejects a missing Player ID", async () => {
  await assertRejectsCode(
    () => readCreatePlayerRequestBody(jsonRequest({
      displayName: "No Card Player",
      accessCode: "PLAYER-1357",
    })),
    "player_identifier_required",
  );
});

Deno.test("create-player parser rejects a missing Access Code", async () => {
  await assertRejectsCode(
    () => readCreatePlayerRequestBody(jsonRequest({
      displayName: "No Code Player",
      playerIdentifier: "RFID:NO-CODE",
    })),
    "player_access_code_required",
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
