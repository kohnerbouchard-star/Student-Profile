declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const PLAYER_HANDLER = new URL(
  "../domains/attendance/api/playerAttendanceClockInHttpHandler.ts",
  import.meta.url,
);
const STAFF_HANDLER = new URL(
  "../domains/attendance/api/staffAttendanceScanHttpHandler.ts",
  import.meta.url,
);

Deno.test("player attendance authenticates before limiting and limits before mutation", async () => {
  const source = await Deno.readTextFile(PLAYER_HANDLER);
  assertOrdered(source, [
    "resolveActivePlayerSession(",
    "if (!sessionResolution.ok)",
    "dependencies.enforceRateLimit ?? enforceScopedRateLimit",
    'action: "player.attendance.clock-in"',
    'profile: "attendance"',
    '.from("game_settings")',
    '"record_player_attendance_clock_in"',
  ]);
  assertIncludes(source, "rateLimitUnavailableResponse()");
  assertIncludes(source, "rateLimitExceededResponse(rateLimitDecision)");
  assertIncludes(source, "identityUuid: sessionResolution.session.player_id");
  assertIncludes(source, "gameUuid: sessionResolution.session.game_session_id");
});

Deno.test("staff scanner verifies staff and game ownership before limiting and body parsing", async () => {
  const source = await Deno.readTextFile(STAFF_HANDLER);
  assertOrdered(source, [
    "dependencies.resolveStaffForRequest(",
    "if (!staffResult.ok)",
    "readOwnedGameSession(",
    "if (!ownershipResult.ok)",
    "dependencies.enforceRateLimit ?? enforceScopedRateLimit",
    'action: "staff.attendance.scan"',
    'profile: "scanner"',
    "readStaffAttendanceScanRequestBody(request)",
    '"record_player_attendance_clock_in"',
  ]);
  assertIncludes(source, "rateLimitUnavailableResponse()");
  assertIncludes(source, "rateLimitExceededResponse(rateLimitDecision)");
  assertIncludes(source, "identityUuid: staffResult.staff.id");
  assertIncludes(source, "gameUuid: gameSessionId");
});

function assertOrdered(source: string, fragments: readonly string[]): void {
  let previous = -1;
  for (const fragment of fragments) {
    const index = source.indexOf(fragment);
    if (index < 0) throw new Error(`Missing source fragment: ${fragment}`);
    if (index <= previous) throw new Error(`Source fragment is out of order: ${fragment}`);
    previous = index;
  }
}

function assertIncludes(source: string, fragment: string): void {
  if (!source.includes(fragment)) throw new Error(`Missing source fragment: ${fragment}`);
}
