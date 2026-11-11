import assert from "node:assert/strict";
import { createSupabaseCampaignEffectWorkerRepository } from "../../../src/domains/campaign/infrastructure/supabaseCampaignRuntimeRepository.ts";
import {
  runCampaignEffectWorker,
  type CampaignEffectPorts,
  type ClaimedCampaignEffectCommand,
} from "../../../src/domains/campaign/services/campaignEffectWorker.ts";

const NOW = "2026-11-09T00:00:00.000Z";
const assertEquals: typeof assert.deepEqual = assert.deepEqual;
const assertRejectsCode = (run: () => Promise<unknown>, code: string) => assert.rejects(run, { code });
const id = (character: string) => `cec_${character.repeat(32)}`;
function commands(): readonly ClaimedCampaignEffectCommand[] {
  return ["a", "b"].map(character => ({
    commandId: id(character), gameId: "game-1", campaignId: `cmp_${character.repeat(32)}`,
    idempotencyKey: `effect-news-${character}`, effectKind: "publish_news",
    payload: { newsDefinitionId: "news.arrival.v1", audience: "all_players" }, attemptCount: 1,
  }));
}

Deno.test("acknowledgements forward claim generation, preserve booleans, and reject malformed scalars", async () => {
  for (const data of [true, false, null, "true", [true], {}]) {
    const calls: { name: string; args: Readonly<Record<string, unknown>> }[] = [];
    const repo = createSupabaseCampaignEffectWorkerRepository({
      rpc: async (name: string, args: Readonly<Record<string, unknown>>) => {
        calls.push({ name, args });
        return { data, error: null };
      },
    } as unknown as Parameters<typeof createSupabaseCampaignEffectWorkerRepository>[0]);
    const complete = () => repo.complete({ commandId: id("a"), attemptCount: 7, completedAt: NOW });
    const fail = () => repo.fail({ commandId: id("a"), attemptCount: 7, errorCode: "effect_failed" });
    if (typeof data === "boolean") {
      assertEquals(await complete(), data);
      assertEquals(await fail(), data);
    } else {
      await assertRejectsCode(complete, "campaign_event_invalid");
      await assertRejectsCode(fail, "campaign_event_invalid");
    }
    assertEquals(calls, [
      { name: "complete_campaign_effect_command_v2", args: {
        p_command_public_id: id("a"), p_expected_attempt_count: 7, p_completed_at: NOW,
      } },
      { name: "fail_campaign_effect_command_v2", args: {
        p_command_public_id: id("a"), p_expected_attempt_count: 7, p_error_code: "effect_failed",
      } },
    ]);
  }
});

Deno.test("stale completion is not counted or failed again and does not stop later commands", async () => {
  const claimed = commands().slice(0, 2).map((command, index) => ({ ...command, attemptCount: index + 2 }));
  const acknowledgements: unknown[] = [];
  const noop = async () => {};
  const ports: CampaignEffectPorts = {
    publishNews: noop, publishCutscene: noop, createContract: noop, notifyPlayers: noop,
    applyMarketShock: noop, setStoreScarcity: noop, setRouteState: noop, applyPlayerImpact: noop,
  };
  const result = await runCampaignEffectWorker({ claimedAt: NOW, ports, repository: {
    claim: async () => claimed,
    complete: async (input) => { acknowledgements.push(input); return input.commandId === claimed[1].commandId; },
    fail: async () => { throw new Error("lost completion must not fail another generation"); },
  } });
  assertEquals(result, {
    claimedCount: 2, completedCount: 1, failedCount: 1,
    failures: [{ commandId: claimed[0].commandId, errorCode: "campaign_effect_lease_lost" }],
  });
  assertEquals(acknowledgements, claimed.map(command => ({
    commandId: command.commandId, attemptCount: command.attemptCount, completedAt: NOW,
  })));
});

Deno.test("failed effects report lease loss only when their generation cannot be failed", async () => {
  for (const acknowledged of [true, false]) {
    const claimed = { ...commands()[0], attemptCount: 7 };
    const failures: unknown[] = [];
    const unexpected = async () => { throw new Error("unexpected effect"); };
    const ports: CampaignEffectPorts = {
      publishNews: async () => { throw Object.assign(new Error("destination unavailable"), { code: "destination_unavailable" }); },
      publishCutscene: unexpected, createContract: unexpected, notifyPlayers: unexpected,
      applyMarketShock: unexpected, setStoreScarcity: unexpected, setRouteState: unexpected, applyPlayerImpact: unexpected,
    };
    const result = await runCampaignEffectWorker({ claimedAt: NOW, ports, repository: {
      claim: async () => [claimed], complete: async () => { throw new Error("must not complete failed effect"); },
      fail: async (input) => { failures.push(input); return acknowledged; },
    } });
    assertEquals(result, {
      claimedCount: 1, completedCount: 0, failedCount: 1,
      failures: [{ commandId: claimed.commandId, errorCode: acknowledged ? "destination_unavailable" : "campaign_effect_lease_lost" }],
    });
    assertEquals(failures, [{ commandId: claimed.commandId, attemptCount: 7, errorCode: "destination_unavailable" }]);
  }
});
