import { createCampaignReadClient } from "./campaignReadClient.ts";
import {
  type CampaignRuntimeSupabaseClient,
  createSupabaseCampaignSchedulerRepository,
} from "../../../../src/domains/campaign/infrastructure/supabaseCampaignRuntimeRepository.ts";
import {
  type CampaignProgramSupabaseClient,
  createSupabaseCampaignProgramProvider,
} from "../../../../src/domains/campaign/infrastructure/supabaseCampaignProgramProvider.ts";
import {
  type CampaignEffectSupabaseClient,
  createSupabaseCampaignEffectPorts,
} from "../../../../src/domains/campaign/infrastructure/supabaseCampaignEffectPorts.ts";
import type { CampaignInstance } from "../../../../src/domains/campaign/contracts/campaignRuntimeContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

type Result = {
  data: unknown[] | null;
  error: { message: string } | null;
};
type Event = readonly unknown[];

class FakeRead implements PromiseLike<Result> {
  constructor(
    private readonly table: string,
    private readonly result: Result,
    private readonly events: Event[],
  ) {}

  retry(enabled: false): this {
    this.events.push(["retry", this.table, enabled]);
    return this;
  }
  eq(column: string, value: unknown): this {
    this.events.push(["eq", this.table, column, value]);
    return this;
  }
  lte(column: string, value: unknown): this {
    this.events.push(["lte", this.table, column, value]);
    return this;
  }
  order(column: string, options: unknown): this {
    this.events.push(["order", this.table, column, options]);
    return this;
  }
  limit(value: number): this {
    this.events.push(["limit", this.table, value]);
    return this;
  }
  in(column: string, values: readonly unknown[]): this {
    this.events.push(["in", this.table, column, values]);
    return this;
  }
  maybeSingle(): Promise<{ data: unknown; error: Result["error"] }> {
    this.events.push(["read", this.table]);
    return Promise.resolve({
      data: this.result.data?.[0] ?? null,
      error: this.result.error,
    });
  }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    this.events.push(["read", this.table]);
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function fakeClient(results: Readonly<Record<string, Result>>) {
  const events: Event[] = [];
  const raw = {
    from(table: string) {
      events.push(["from", table]);
      return {
        select(columns: string) {
          events.push(["select", table, columns]);
          return new FakeRead(
            table,
            results[table] ?? { data: [], error: null },
            events,
          );
        },
      };
    },
    rpc(name: string, args: Readonly<Record<string, unknown>>) {
      events.push(["rpc", name, args]);
      return Promise.resolve({ data: [], error: null });
    },
  };
  return { client: createCampaignReadClient(raw), events };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}

function assertReadRetriesDisabled(
  events: readonly Event[],
  tables: readonly string[],
): void {
  assertEquals(
    events.filter((event) => event[0] === "select").map((event) => event[1]),
    tables,
  );
  assertEquals(
    events.filter((event) => event[0] === "retry"),
    tables.map((table) => ["retry", table, false]),
  );
  assertEquals(
    events.filter((event) => event[0] === "read").map((event) => event[1]),
    tables,
  );
  for (const [index, event] of events.entries()) {
    if (event[0] === "select") {
      assertEquals(events[index + 1], ["retry", event[1], false]);
    }
  }
}

const instance = {
  gameId: "game-provider",
  definition: {
    packId: "pack-provider",
    packVersion: "v1",
    definitionId: "program-provider",
    definitionDigest: `sha256:${"a".repeat(64)}`,
  },
} as CampaignInstance;

Deno.test("Campaign scheduler and program reads disable retries before applying filters", async () => {
  const { client, events } = fakeClient({
    campaign_instances: { data: [], error: null },
    campaign_program_definitions: { data: [], error: null },
    campaign_outcome_evidence_snapshots: {
      data: [{
        evidence_revision: 2,
        recovery_readiness_basis_points: 1234,
        evidence_digest: `sha256:${"b".repeat(64)}`,
      }],
      error: null,
    },
  });
  const scheduler = createSupabaseCampaignSchedulerRepository(
    client as unknown as CampaignRuntimeSupabaseClient,
    { nextScheduledAt: () => null },
  );
  assertEquals(
    await scheduler.listDueCampaigns({
      dueAt: "2026-01-01T00:00:00.000Z",
      limit: 7,
    }),
    [],
  );
  const provider = createSupabaseCampaignProgramProvider(
    client as unknown as CampaignProgramSupabaseClient,
  );
  let missingProgram = false;
  try {
    await provider.readProgram(instance);
  } catch (error) {
    missingProgram =
      (error as { code?: string }).code === "campaign_program_not_found";
  }
  assertEquals(missingProgram, true);
  assertEquals(
    (await provider.readOutcomeEvidence(instance)).evidenceRevision,
    2,
  );
  assertReadRetriesDisabled(events, [
    "campaign_instances",
    "campaign_program_definitions",
    "campaign_outcome_evidence_snapshots",
  ]);
  assertEquals(
    events.find((event) =>
      event[0] === "eq" && event[1] === "campaign_outcome_evidence_snapshots"
    ),
    [
      "eq",
      "campaign_outcome_evidence_snapshots",
      "game_session_id",
      "game-provider",
    ],
  );
});

Deno.test("Campaign effect reads disable retries and preserve scoped RPC delivery", async () => {
  const { client, events } = fakeClient({
    world_runtime_instances: { data: [{ revision: 7 }], error: null },
    world_location_states: {
      data: [{ public_location_id: "loc-a" }],
      error: null,
    },
    campaign_instances: {
      data: [{ pack_id: "pack-effects", pack_version: "v1" }],
      error: null,
    },
    campaign_effect_definitions: {
      data: [{
        effect_kind: "set_store_scarcity",
        payload: {
          durationDays: 1,
          itemKeys: ["item-a"],
          scarcityBand: "low",
          eventMultiplier: 1,
        },
      }],
      error: null,
    },
  });
  const ports = createSupabaseCampaignEffectPorts(
    client as unknown as CampaignEffectSupabaseClient,
    "2026-01-01T00:00:00.000Z",
  );
  const base = {
    commandId: "cmd-a",
    gameId: "game-effects",
    campaignId: "campaign-effects",
    idempotencyKey: "idem-a",
  };
  await ports.setRouteState({
    ...base,
    effect: {
      kind: "set_route_state",
      routeDefinitionIds: ["route-a"],
      state: "open",
      reason: "recovery",
    },
  });
  await ports.setStoreScarcity({
    ...base,
    effect: {
      kind: "set_store_scarcity",
      targetLocationIds: ["loc-a"],
      scarcityDefinitionId: "scarcity-a",
    },
  });
  assertReadRetriesDisabled(events, [
    "world_runtime_instances",
    "world_location_states",
    "campaign_instances",
    "campaign_effect_definitions",
  ]);
  const calls = events.filter((event) => event[0] === "rpc");
  assertEquals(calls.map((event) => event[1]), [
    "apply_world_route_state_v1",
    "apply_campaign_store_scarcity_v1",
  ]);
  assertEquals(
    (calls[0][2] as Record<string, unknown>).p_game_session_id,
    "game-effects",
  );
  assertEquals(
    (calls[1][2] as Record<string, unknown>).p_game_session_id,
    "game-effects",
  );
});

Deno.test("Campaign read errors are returned after one read and prevent effect RPC", async () => {
  const { client, events } = fakeClient({
    world_runtime_instances: { data: null, error: { message: "unavailable" } },
  });
  const ports = createSupabaseCampaignEffectPorts(
    client as unknown as CampaignEffectSupabaseClient,
    "2026-01-01T00:00:00.000Z",
  );
  let errorCode: string | undefined;
  try {
    await ports.setRouteState({
      commandId: "cmd-b",
      gameId: "game-error",
      campaignId: "campaign-error",
      idempotencyKey: "idem-b",
      effect: {
        kind: "set_route_state",
        routeDefinitionIds: ["route-a"],
        state: "open",
        reason: "recovery",
      },
    });
  } catch (error) {
    errorCode = (error as { code?: string }).code;
  }
  assertEquals(errorCode, "campaign_world_runtime_read_failed");
  assertReadRetriesDisabled(events, ["world_runtime_instances"]);
  assertEquals(events.filter((event) => event[0] === "rpc"), []);
});

Deno.test("Campaign adapter forwards the exact RPC result and argument object", () => {
  const read = {
    retry(enabled: false) {
      assertEquals(enabled, false);
      return this;
    },
  };
  const args = { game: "game-a" };
  const result = { marker: "original result" };
  const raw = {
    from(table: string) {
      if (this !== raw) throw new Error("from receiver changed");
      assertEquals(table, "table-a");
      return {
        select: (columns: string) => {
          assertEquals(columns, "id");
          return read;
        },
      };
    },
    rpc(name: string, value: Readonly<Record<string, unknown>>) {
      if (this !== raw) throw new Error("RPC receiver changed");
      assertEquals(name, "rpc-a");
      if (value !== args) throw new Error("RPC arguments were copied");
      return result;
    },
  };
  const client = createCampaignReadClient(raw);
  if (client.from("table-a").select("id") !== read) {
    throw new Error("read builder was wrapped");
  }
  if (client.rpc("rpc-a", args) !== result) {
    throw new Error("RPC result was wrapped");
  }
});

Deno.test("Campaign adapter fails closed when retry control is absent or throws", () => {
  const failure = new Error("retry configuration failed");
  let reads = 0;
  const raw = {
    from(_table: string) {
      return {
        select: (_columns: string) => ({
          retry: (_enabled: false): never => {
            throw failure;
          },
          then: () => {
            reads++;
          },
        }),
      };
    },
    rpc: (_name: string, _args: Readonly<Record<string, unknown>>) => {
      throw new Error("unexpected RPC");
    },
  };
  try {
    createCampaignReadClient(raw).from("table-a").select("id");
    throw new Error("expected retry failure");
  } catch (error) {
    if (error !== failure) throw error;
  }
  const missing = {
    from: (_table: string) => ({
      select: (_columns: string) => ({
        then: () => {
          reads++;
        },
      }),
    }),
    rpc: raw.rpc,
  };
  let missingRejected = false;
  try {
    createCampaignReadClient(missing as unknown as typeof raw).from("table-a")
      .select("id");
  } catch (error) {
    missingRejected = error instanceof TypeError;
  }
  assertEquals(missingRejected, true);
  assertEquals(reads, 0);
});
