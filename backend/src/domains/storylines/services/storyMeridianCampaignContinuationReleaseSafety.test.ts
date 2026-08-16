export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATIONS = [
  "20260816090100_seed_meridian_competing_models_v1.sql",
  "20260816090200_seed_meridian_outbreak_of_war_v1.sql",
  "20260816090300_seed_meridian_fortune_during_war_v1.sql",
  "20260816090400_seed_meridian_question_of_belonging_v1.sql",
  "20260816090500_seed_meridian_reckoning_v1.sql",
] as const;

const CONTINUATION = new URL(
  "../../../../supabase/migrations/20260816090700_harden_meridian_arrival_clock_gate_v1.sql",
  import.meta.url,
);

Deno.test("new Meridian continuation definitions stay globally dormant", async () => {
  for (const filename of MIGRATIONS) {
    const url = new URL(`../../../../supabase/migrations/${filename}`, import.meta.url);
    const sql = compact(await Deno.readTextFile(url));
    assertNotIncludes(sql, "is_active=true");
    assertNotIncludes(sql, "'normal',true");
    assertNotIncludes(sql, "'low',true");
    assertNotIncludes(sql, "'major',true");
    assertNotIncludes(sql, "'critical',true");
    assertIncludes(sql, "is_active=false");
  }
});

Deno.test("arrival contact enables the complete continuation only for that game", async () => {
  const sql = compact(await Deno.readTextFile(CONTINUATION));

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

  for (const eventKey of [
    "meridian_competing_models",
    "meridian_competing_models_recommendation_followup",
    "meridian_emergency_response",
    "meridian_security_center_attack",
    "meridian_customs_security_intrusion",
    "meridian_outbreak_of_war",
    "meridian_fortune_during_war",
    "meridian_question_of_belonging",
    "meridian_reckoning",
    "meridian_local_friend_introductions",
    "meridian_local_friend_fracture_reactions",
    "meridian_local_friend_wartime_reactions",
    "meridian_local_friend_belonging_reactions",
  ]) assertIncludes(sql, `'${eventKey}'`);

  assertIncludes(sql, "game_session_story_event_overrides");
  assertIncludes(sql, "selectnew.game_session_id,event_row.id,true,new.id");
  assertIncludes(sql, "andnotevent_row.is_active");
  assertIncludes(sql, "->>'phase','')<>'arrival'");
  assertNotIncludes(sql, "selectdistinctactivation.game_session_id");
  assertNotIncludes(sql, "is_active=true");
  assertIncludes(sql, "setis_active=false");
});

Deno.test("continuation release does not backfill existing games into overdue events", async () => {
  const sql = (await Deno.readTextFile(CONTINUATION)).toLowerCase();
  assertIncludes(compact(sql), compact("pre-cutover campaigns are grandfathered and never rebased or backfilled"));
  assertNotIncludes(compact(sql), compact("select distinct activation.game_session_id"));
  assertNotIncludes(compact(sql), compact("insert into public.game_session_story_event_overrides") + compact("select distinct activation.game_session_id"));
});

function compact(value: string): string { return value.replace(/\s+/g, ""); }
function assertIncludes(value: string, expected: string): void {
  if (!value.includes(expected)) throw new Error(`Missing contract: ${expected}`);
}
function assertNotIncludes(value: string, unexpected: string): void {
  if (value.includes(unexpected)) throw new Error(`Unexpected contract: ${unexpected}`);
}
