import { normalizeRuntimeMutation } from "./runtimeMutationNormalization.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("normalizes nested player create payloads with identity credentials", () => {
  const result = normalizeRuntimeMutation(
    "50b44055-4958-441c-81b5-851d79214cd6",
    "/players",
    "POST",
    {
      action: "create-player",
      payload: {
        displayName: "Runtime Test Player",
        rosterLabel: "RUNTIME-001",
        playerIdentifier: "RFID:RUNTIME-001",
        accessCode: "RUNTIME-8246",
        startingLocation: "NORTHREACH",
      },
    },
  );

  assert(result?.ok === true, "Expected player mutation to normalize.");
  assert(
    result.mutation.classroomPath.endsWith("/players"),
    "Expected canonical player path.",
  );
  assert(
    result.mutation.body.displayName === "Runtime Test Player",
    "Expected displayName to be flattened.",
  );
  assert(
    result.mutation.body.rosterLabel === "RUNTIME-001",
    "Expected rosterLabel to be flattened.",
  );
  assert(
    result.mutation.body.playerIdentifier === "RFID:RUNTIME-001",
    "Expected RFID Player ID to reach the canonical create route.",
  );
  assert(
    result.mutation.body.accessCode === "RUNTIME-8246",
    "Expected Access Code to reach the canonical create route.",
  );
});

Deno.test("normalizes plural attendance scan route and legacy code fields", () => {
  const result = normalizeRuntimeMutation(
    "50b44055-4958-441c-81b5-851d79214cd6",
    "/attendance/scans",
    "POST",
    {
      action: "scan-attendance",
      payload: {
        scannedCode: "ABCD-1234",
        timezone: "Asia/Seoul",
      },
    },
  );

  assert(result?.ok === true, "Expected attendance mutation to normalize.");
  assert(
    result.mutation.classroomPath.endsWith("/attendance/scan"),
    "Expected singular classroom scan path.",
  );
  assert(
    result.mutation.body.playerId === "ABCD-1234",
    "Expected the scanned code to map to playerId.",
  );
  assert(
    result.mutation.body.deviceTimezone === "Asia/Seoul",
    "Expected timezone to map to deviceTimezone.",
  );
});

Deno.test("rejects create player without a display name", () => {
  const result = normalizeRuntimeMutation(
    "50b44055-4958-441c-81b5-851d79214cd6",
    "/players",
    "POST",
    { action: "create-player", payload: {} },
  );

  assert(result?.ok === false, "Expected missing player name to be rejected.");
  assert(result.status === 400, "Expected a 400 validation response.");
  assert(
    result.code === "player_display_name_required",
    "Expected a stable validation code.",
  );
});

Deno.test("rejects create player without an RFID Player ID", () => {
  const result = normalizeRuntimeMutation(
    "50b44055-4958-441c-81b5-851d79214cd6",
    "/players",
    "POST",
    {
      displayName: "Missing RFID Player",
      accessCode: "ACCESS-8246",
    },
  );

  assert(result?.ok === false, "Expected missing Player ID to be rejected.");
  assert(result.code === "player_identifier_required", "Expected the Player ID validation code.");
});

Deno.test("rejects create player without an Access Code", () => {
  const result = normalizeRuntimeMutation(
    "50b44055-4958-441c-81b5-851d79214cd6",
    "/players",
    "POST",
    {
      displayName: "Missing Access Code Player",
      playerIdentifier: "RFID:MISSING-CODE",
    },
  );

  assert(result?.ok === false, "Expected missing Access Code to be rejected.");
  assert(result.code === "player_access_code_required", "Expected the Access Code validation code.");
});

Deno.test("ignores unrelated mutations", () => {
  const result = normalizeRuntimeMutation(
    "50b44055-4958-441c-81b5-851d79214cd6",
    "/contracts",
    "POST",
    { title: "Unrelated" },
  );

  assert(result === null, "Expected unrelated writes to continue to existing routing.");
});
