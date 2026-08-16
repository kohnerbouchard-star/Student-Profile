export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260816090000_add_contract_story_flag_rewards_v1.sql",
  import.meta.url,
);
const CUSTOMS = new URL(
  "../../../../supabase/migrations/20260812103000_seed_meridian_customs_security_intrusion_v1.sql",
  import.meta.url,
);
const ATTACK = new URL(
  "../../../../supabase/migrations/20260812111000_seed_meridian_security_center_attack_v1.sql",
  import.meta.url,
);
const RESPONSE = new URL(
  "../../../../supabase/migrations/20260812114000_seed_meridian_emergency_response_v1.sql",
  import.meta.url,
);

Deno.test("Contract reward migration makes Story flags part of the atomic plan", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  for (const required of [
    "create or replace function public.apply_contract_rewards_atomic_v1",
    "create or replace function public.issue_contract_rewards_atomic_v1",
    "'checking', 'cash', 'items', 'storyFlagsToSet'",
    "INVALID_CONTRACT_STORY_FLAG_REWARDS",
    "INVALID_CONTRACT_STORY_FLAG_REWARD",
    "INVALID_CONTRACT_STORY_FLAG_KEY",
    "CONTRACT_REWARD_STORY_FLAG_DUPLICATE",
    "CONTRACT_REWARD_IDEMPOTENCY_CONFLICT",
    "insert into public.game_session_story_flags",
    "on conflict (game_session_id, flag_key) do update",
    "'rewardType', 'story_flag'",
    "'contracts.contract_reward_story_flag'",
    "from public.apply_contract_rewards_atomic_v1",
    "to service_role",
  ]) assertIncludes(sql, required);

  assertNotIncludes(
    sql,
    "grant execute on function public.apply_contract_rewards_atomic_v1(\n  uuid, uuid, uuid, uuid, text\n) to authenticated",
  );
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

Deno.test("Contract Story flags remain game-scoped and do not expose internal ids in reward results", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assertIncludes(sql, "game_session_id,\n        flag_key,\n        value");
  assertIncludes(sql, "p_game_session_id,\n        v_flag_key,\n        v_flag_value");
  assertIncludes(sql, "'flagKey', v_flag_key");
  assertIncludes(sql, "'value', v_flag_value");
  assertNotIncludes(sql, "'storyFlagId'");
  assertNotIncludes(sql, "delete from public.game_session_story_flags");
  assertNotIncludes(sql, "truncate");
});

Deno.test("existing Meridian contracts use the newly supported Story-flag reward shape", async () => {
  for (const source of [CUSTOMS, ATTACK, RESPONSE]) {
    const sql = await Deno.readTextFile(source);
    assertIncludes(sql, "storyFlagsToSet");
    assertIncludes(sql, "'flagKey'");
    assertIncludes(sql, "'value', true");
  }
});

function firstNonblank(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim().toLowerCase()).find(Boolean) ?? "";
}
function lastNonblank(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim().toLowerCase()).filter(Boolean).at(-1) ?? "";
}
function assertIncludes(value: string, expected: string): void {
  if (!value.includes(expected)) throw new Error(`Missing contract: ${expected}`);
}
function assertNotIncludes(value: string, unexpected: string): void {
  if (value.includes(unexpected)) throw new Error(`Unexpected contract: ${unexpected}`);
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
