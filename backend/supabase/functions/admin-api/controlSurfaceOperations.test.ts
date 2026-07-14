import { handleAccountOperation } from "./accountOperations.ts";
import { handleAttendancePlayerOperation } from "./attendancePlayerOperations.ts";
import { handleUnsupportedOperation } from "./unsupportedOperations.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("rejects invalid manual attendance corrections before database access", async () => {
  const result = await handleAttendancePlayerOperation(null, {
    gameSessionId: "game-id",
    staffUserId: "staff-id",
    path: "/games/game-id/attendance/corrections",
    method: "POST",
    body: { status: "unknown" },
  });

  assert(
    result.handled === true,
    "attendance correction route should be handled",
  );
  assert(
    result.status === 400,
    "invalid attendance correction should return 400",
  );
  assert(
    result.body.code === "invalid_attendance_correction",
    "correction error code should be stable",
  );
});

Deno.test("rejects zero-value player ledger adjustments before database access", async () => {
  const result = await handleAttendancePlayerOperation(null, {
    gameSessionId: "game-id",
    staffUserId: "staff-id",
    path: "/games/game-id/players/player-id/ledger-adjustments",
    method: "POST",
    body: { amount: 0 },
  });

  assert(result.handled === true, "ledger route should be handled");
  assert(result.status === 400, "zero adjustment should return 400");
  assert(
    result.body.code === "ledger_amount_required",
    "ledger error code should be stable",
  );
});

Deno.test("leaves unknown attendance and player routes for the router fallback", async () => {
  const result = await handleAttendancePlayerOperation(null, {
    gameSessionId: "game-id",
    staffUserId: "staff-id",
    path: "/games/game-id/players/player-id/not-a-real-action",
    method: "POST",
    body: {},
  });
  assert(
    result.handled === false,
    "unknown player route must not be falsely handled",
  );
});

Deno.test("returns explicit disabled responses for unsupported visible controls", () => {
  const cases = [
    ["/account/security/2fa/enrollment", "GET", "admin_2fa_not_configured"],
    [
      "/notifications/preferences/email-alerts",
      "PATCH",
      "notifications_not_configured",
    ],
    [
      "/games/game-id/players/player-id/messages",
      "POST",
      "player_messaging_not_configured",
    ],
    [
      "/games/game-id/players/imports/csv",
      "POST",
      "roster_csv_import_not_configured",
    ],
    [
      "/games/game-id/market/events/event-id/pause",
      "POST",
      "marketplace_read_only",
    ],
    ["/games/game-id/store/pause", "POST", "store_pause_not_configured"],
  ] as const;

  for (const [path, method, code] of cases) {
    const result = handleUnsupportedOperation({ path, method });
    assert(
      result.handled === true,
      `${method} ${path} should be explicitly handled`,
    );
    assert(
      result.status === 409,
      `${method} ${path} should return a conflict/disabled response`,
    );
    assert(
      result.body.code === code,
      `${method} ${path} should return ${code}`,
    );
  }
});

Deno.test("returns useful documentation and diagnostics payloads", () => {
  const docs = handleUnsupportedOperation({
    path: "/docs/admin-console",
    method: "GET",
  });
  const diagnostics = handleUnsupportedOperation({
    path: "/diagnostics/admin-console",
    method: "GET",
  });
  assert(
    docs.handled === true && docs.status === 200,
    "documentation route should be available",
  );
  assert(
    diagnostics.handled === true && diagnostics.status === 200,
    "diagnostics route should be available",
  );
});

Deno.test("requires a display name before updating the administrator profile", async () => {
  const result = await handleAccountOperation(null, {
    path: "/account/profile",
    method: "PATCH",
    staff: { id: "staff-id" },
    games: [],
    body: { displayName: "" },
  });
  assert(result.handled === true, "profile update route should be handled");
  assert(result.status === 400, "empty display name should return 400");
  assert(
    result.body.code === "display_name_required",
    "profile error code should be stable",
  );
});

Deno.test("requires explicit confirmation before archiving a game", async () => {
  const result = await handleAccountOperation(null, {
    path: "/games/game-id/archive",
    method: "POST",
    staff: { id: "staff-id" },
    games: [{ id: "game-id", name: "Test Game", status: "active" }],
    body: {},
  });
  assert(result.handled === true, "game archive route should be handled");
  assert(result.status === 409, "unconfirmed archive should return 409");
  assert(
    result.body.code === "game_archive_confirmation_required",
    "archive confirmation code should be stable",
  );
});
