import { strict as assert } from "node:assert";
import test from "node:test";

import {
  SupabasePlayerRosterReadRepository,
  type PlayerRosterReadClient,
} from "./supabasePlayerRosterReadRepository.ts";
import { PlayerRosterReadPersistenceError } from "../contracts/playerRosterReadRepository.ts";

type Row = Record<string, unknown>;
interface PlannedResponse {
  readonly table: string;
  readonly data?: readonly Row[];
  readonly error?: unknown;
}

class FakeFilter implements PromiseLike<{ data: readonly Row[] | null; error: unknown | null }> {
  readonly calls: Array<readonly [string, ...unknown[]]> = [];
  constructor(private readonly response: PlannedResponse) {}
  eq(column: string, value: unknown) { this.calls.push(["eq", column, value]); return this; }
  in(column: string, values: readonly unknown[]) { this.calls.push(["in", column, [...values]]); return this; }
  order(column: string, options?: { readonly ascending?: boolean }) { this.calls.push(["order", column, options]); return this; }
  then<TResult1 = { data: readonly Row[] | null; error: unknown | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: readonly Row[] | null; error: unknown | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.response.data ?? [], error: this.response.error ?? null }).then(onfulfilled, onrejected);
  }
}

function fakeClient(plan: PlannedResponse[]) {
  const filters: Array<{ table: string; select: string; filter: FakeFilter }> = [];
  const client: PlayerRosterReadClient = {
    from(table: string) {
      const response = plan.shift();
      assert.ok(response, "unexpected query");
      assert.equal(response.table, table);
      return {
        select(columns: string) {
          const filter = new FakeFilter(response);
          filters.push({ table, select: columns, filter });
          return filter;
        },
      };
    },
  };
  return { client, filters, remaining: plan };
}

const player = (id: string, displayName = "Same Name"): Row => ({
  id,
  display_name: displayName,
  roster_label: null,
  player_identifier: `P-${id}`,
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
});

test("readRoster preserves game scope, projection, ordering and active-code projection", async () => {
  const f = fakeClient([
    { table: "players", data: [player("p1"), player("p2")] },
    { table: "player_access_credentials", data: [
      { player_id: "p2", access_code_hash: "must-not-leak" },
      { player_id: 42 },
    ] },
  ]);
  const result = await new SupabasePlayerRosterReadRepository(f.client).readRoster("game-1");

  assert.deepEqual(result.map(({ id, displayName, hasActiveAccessCode }) => ({ id, displayName, hasActiveAccessCode })), [
    { id: "p1", displayName: "Same Name", hasActiveAccessCode: false },
    { id: "p2", displayName: "Same Name", hasActiveAccessCode: true },
  ]);
  assert.equal("accessCodeHash" in result[1], false);
  assert.equal(f.filters[0].select, "id,display_name,roster_label,player_identifier,status,created_at,updated_at");
  assert.deepEqual(f.filters[0].filter.calls, [
    ["eq", "game_session_id", "game-1"],
    ["order", "created_at", { ascending: true }],
  ]);
  assert.equal(f.filters[1].select, "player_id");
  assert.deepEqual(f.filters[1].filter.calls, [
    ["eq", "game_session_id", "game-1"],
    ["eq", "status", "active"],
    ["in", "player_id", ["p1", "p2"]],
  ]);
  assert.equal(f.remaining.length, 0);
});

test("readRoster returns empty roster without credential query", async () => {
  const f = fakeClient([{ table: "players", data: [] }]);
  assert.deepEqual(await new SupabasePlayerRosterReadRepository(f.client).readRoster("game-empty"), []);
  assert.equal(f.filters.length, 1);
  assert.equal(f.remaining.length, 0);
});

test("readRoster maps either persistence failure to the bounded repository error", async () => {
  const first = fakeClient([{ table: "players", error: { message: "no" } }]);
  await assert.rejects(
    () => new SupabasePlayerRosterReadRepository(first.client).readRoster("game-1"),
    PlayerRosterReadPersistenceError,
  );

  const second = fakeClient([
    { table: "players", data: [player("p1")] },
    { table: "player_access_credentials", error: { message: "no" } },
  ]);
  await assert.rejects(
    () => new SupabasePlayerRosterReadRepository(second.client).readRoster("game-1"),
    PlayerRosterReadPersistenceError,
  );
});

test("readRoster rejects malformed selected roster rows instead of broadening scope", async () => {
  const f = fakeClient([{ table: "players", data: [{ ...player("p1"), id: null }] }]);
  await assert.rejects(
    () => new SupabasePlayerRosterReadRepository(f.client).readRoster("game-1"),
    PlayerRosterReadPersistenceError,
  );
});
