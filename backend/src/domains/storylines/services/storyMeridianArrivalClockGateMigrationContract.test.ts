export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260816090700_harden_meridian_arrival_clock_gate_v1.sql",
  import.meta.url,
);

Deno.test("Meridian arrival clock cutover grandfathers existing campaigns before dormancy", async () => {
  const sql = compact(await Deno.readTextFile(MIGRATION));
  for (const expected of [
    "lock table public.game_session_storylines in share row exclusive mode",
    "lock table public.player_story_impacts in share row exclusive mode",
    "meridian_arrival_clock_mode_v1",
    "to_jsonb('grandfathered'::text)",
    "meridian_customs_security_intrusion",
    "meridian_security_center_attack",
    "meridian_emergency_response",
    "true, null, now(), now()",
    "set is_active = false",
  ]) assertIncludes(sql, compact(expected));

  for (const triggerName of [
    "zzz_activate_meridian_customs_security_intrusion_from_full_game_v1",
    "zzzz_activate_meridian_security_center_attack_from_full_game_v1",
    "zzzzz_activate_meridian_emergency_response_from_full_game_v1",
  ]) assertIncludes(sql, compact(`drop trigger if exists ${triggerName}`));
});

Deno.test("first arrival anchors new campaign time and only then enables elapsed-time events", async () => {
  const sql = compact(await Deno.readTextFile(MIGRATION));
  for (const expected of [
    "enable_meridian_campaign_continuation_after_arrival_v1",
    "coalesce(new.payload -> 'payload' ->> 'phase', '') <> 'arrival'",
    "for update of activation",
    "prior.id <> new.id",
    "story_started_at = v_anchor_at",
    "accumulated_pause_seconds = 0",
    "to_jsonb('arrival_anchored'::text)",
    "source_player_story_impact_id = excluded.source_player_story_impact_id",
  ]) assertIncludes(sql, compact(expected));

  for (const initializer of [
    "initialize_meridian_customs_security_intrusion_v1",
    "initialize_meridian_security_center_attack_v1",
    "initialize_meridian_emergency_response_v1",
    "initialize_meridian_competing_models_v1",
    "initialize_meridian_outbreak_of_war_v1",
    "initialize_meridian_fortune_during_war_v1",
    "initialize_meridian_question_of_belonging_v1",
    "initialize_meridian_reckoning_v1",
    "initialize_meridian_local_friend_relationships_v1",
  ]) assertIncludes(sql, initializer);

  for (const key of CONTINUATION_EVENT_KEYS) assertIncludes(sql, `'${key}'`);
});

Deno.test("grandfathered late arrivals cannot unlock retroactive sponsor or continuation events", async () => {
  const sql = compact((await Deno.readTextFile(MIGRATION)).toLowerCase());
  assertEquals(countOccurrences(sql, "to_jsonb('grandfathered'::text)"), 3);
  assertIncludes(sql, "createorreplacefunctionpublic.enable_relationship_followups_after_arrival_contact_v1()");
  assertIncludes(sql, "createorreplacefunctionpublic.enable_meridian_campaign_continuation_after_arrival_v1()");
  assertIncludes(sql, "returnnew;");
  assertNotIncludes(sql, "selectdistinctactivation.game_session_id");
  assertNotIncludes(sql, "updatestoryline_eventssetis_active=true");
});

Deno.test("arrival clock trigger functions are not browser executable", async () => {
  const sql = compact((await Deno.readTextFile(MIGRATION)).toLowerCase());
  for (const expected of [
    "security definer set search_path = public, pg_temp",
    "revoke all on function public.enable_relationship_followups_after_arrival_contact_v1() from public, anon, authenticated",
    "revoke all on function public.enable_meridian_campaign_continuation_after_arrival_v1() from public, anon, authenticated",
  ]) assertIncludes(sql, compact(expected));
});

const CONTINUATION_EVENT_KEYS = [
  "meridian_competing_models",
  "meridian_competing_models_recommendation_followup",
  "meridian_customs_security_intrusion",
  "meridian_security_center_attack",
  "meridian_emergency_response",
  "meridian_outbreak_of_war",
  "meridian_fortune_during_war",
  "meridian_question_of_belonging",
  "meridian_reckoning",
  "meridian_local_friend_introductions",
  "meridian_local_friend_fracture_reactions",
  "meridian_local_friend_wartime_reactions",
  "meridian_local_friend_belonging_reactions",
] as const;

function compact(value: string): string { return value.replace(/\s+/g, ""); }
function countOccurrences(value: string, needle: string): number { return value.split(needle).length - 1; }
function assertIncludes(value: string, expected: string): void { if (!value.includes(expected)) throw new Error(`Missing contract: ${expected}`); }
function assertNotIncludes(value: string, unexpected: string): void { if (value.includes(unexpected)) throw new Error(`Unexpected contract: ${unexpected}`); }
function assertEquals(actual: unknown, expected: unknown): void { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`); }
