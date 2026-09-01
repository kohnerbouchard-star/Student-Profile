import { guardGameScopedMutation } from "./gameLifecycleOperations.ts";
import {
  handleRetiredBusinessSettlement,
  preDispatchRetiredBusinessSettlement,
} from "./businessSettlementRetirementDispatch.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_ID = "00000000-0000-4000-8000-000000000002";
const BUSINESS_KEY = `biz_${"d".repeat(32)}`;
const SUFFIX = `/businesses/${BUSINESS_KEY}/settle`;
const PATH = `/games/${GAME_ID}${SUFFIX}`;
const RETIRED_RESPONSE = {
  handled: true,
  status: 410,
  body: {
    code: "business_cycle_settlement_retired",
    message:
      "Administrator-authored Business cycle settlement has been retired. Store receipts and guarded server-owned periods are authoritative.",
  },
};

Deno.test("retired Business settlement pre-dispatch is body-blind and stable across lifecycle states", () => {
  for (const status of ["active", "disabled", "archived"] as const) {
    const request = new Request(`https://example.test${PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not valid json",
    });
    let ownershipChecks = 0;
    const result = preDispatchRetiredBusinessSettlement({
      request,
      path: PATH,
      resolveOwnedGame(gameId) {
        ownershipChecks += 1;
        assertEquals(gameId, GAME_ID);
        return { id: gameId, status };
      },
    });

    assertEquals(result, RETIRED_RESPONSE);
    assertEquals(ownershipChecks, 1);
    assertEquals(request.bodyUsed, false);

    const laterMutationGuard = guardGameScopedMutation({
      method: request.method,
      operationalStatus: status,
      suffix: SUFFIX,
    });
    assertEquals(
      laterMutationGuard.handled,
      status === "active" ? false : true,
    );
  }
});

Deno.test("retired Business settlement pre-dispatch preserves owned-game denial", () => {
  const request = new Request(`https://example.test${PATH}`, {
    method: "POST",
    body: "{not valid json",
  });
  const result = preDispatchRetiredBusinessSettlement({
    request,
    path: PATH,
    resolveOwnedGame(gameId) {
      assertEquals(gameId, GAME_ID);
      return null;
    },
  });

  assertEquals(result, {
    handled: true,
    status: 404,
    body: {
      code: "game_not_found",
      message: "That game is not available to this administrator.",
    },
  });
  assertEquals(request.bodyUsed, false);

  const otherGame = preDispatchRetiredBusinessSettlement({
    request: new Request(
      `https://example.test/games/${OTHER_GAME_ID}${SUFFIX}`,
      { method: "POST" },
    ),
    path: `/games/${OTHER_GAME_ID}${SUFFIX}`,
    resolveOwnedGame: () => null,
  });
  assertEquals(otherGame.status, 404);
});

Deno.test("retirement pre-dispatch leaves unrelated Admin routes untouched", () => {
  const request = new Request(
    `https://example.test/games/${GAME_ID}/businesses`,
    { method: "POST", body: "{not valid json" },
  );
  let ownershipChecks = 0;
  const result = preDispatchRetiredBusinessSettlement({
    request,
    path: `/games/${GAME_ID}/businesses`,
    resolveOwnedGame() {
      ownershipChecks += 1;
      return { id: GAME_ID, status: "active" };
    },
  });

  assertEquals(result, { handled: false });
  assertEquals(ownershipChecks, 0);
  assertEquals(request.bodyUsed, false);
  assert(
    handleRetiredBusinessSettlement(request, "/businesses").handled ===
      false,
    "unrelated Business operations must continue through normal dispatch",
  );
});
