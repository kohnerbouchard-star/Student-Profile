import assert from "node:assert/strict";
import { spawn } from "node:child_process";

// Fixed disposable Docker target only. No hosted URL or credential is accepted.
const dockerArgs = ["exec", "-i", "supabase_db_econovaria", "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
function session(sql, onOutput = () => {}, control) {
  const child = spawn("docker", dockerArgs, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "", error = "";
  const completed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {child.kill(); reject(new Error("Disposable roster concurrency test timed out"));}, 45000);
    child.stdout.on("data", bytes => {output += bytes; onOutput(output);});
    child.stderr.on("data", bytes => {error += bytes;});
    child.on("error", failure => {clearTimeout(timer); reject(failure);});
    child.on("exit", code => {clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(`Disposable SQL failed: ${error}`));});
  });
  const input = `set statement_timeout='35s';\nset lock_timeout='30s';\nset request.jwt.claim.role='service_role';\n${sql}\n`;
  if (control) {child.stdin.write(input); control.finish = (statement = 'commit;') => child.stdin.end(`${statement}\n`);}
  else child.stdin.end(input);
  return completed;
}
const staff = "f3000000-0000-4000-8000-000000000001";
const game = "f4000000-0000-4000-8000-000000000001";
await session(`
begin;
insert into public.staff_users(id,supabase_auth_user_id,email,display_name,status,role)
values('${staff}','f3000000-0000-4000-8000-000000000002','roster-race@example.invalid','Synthetic concurrency owner','active','game_admin');
insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state,provisioning_status)
values('${game}','${staff}','Synthetic concurrent import','active','draft','pending');
insert into public.country_profiles(country_code,country_name,capital_name,currency_code,status)
values('ROSTER_RACE','Synthetic race country','Synthetic capital','ECO','active');
commit;
`);
const args = letter => {
  const credential = {playerIdentifier: `STU-${letter.repeat(24)}`, lookupDigest: letter.toLowerCase().repeat(64), credentialVersion: "pbkdf2-sha256-v2", salt: "a".repeat(22), verifier: "b".repeat(43), iterations: 600000};
  return `'${game}','${staff}','["Synthetic concurrent student"]','${JSON.stringify([credential])}','roster-concurrent-shared-key','synthetic-race'`;
};
async function overlap(firstSql, secondSql) {
let releaseStarted;
const started = new Promise(resolve => { releaseStarted = resolve; });
const firstControl = {};
const first = session(`begin;
${firstSql}
\\echo ROSTER_FIRST_TRANSACTION_HELD
`, output => {if (output.includes("ROSTER_FIRST_TRANSACTION_HELD")) releaseStarted();}, firstControl);
// Wait for a positive first-transaction signal, not an arbitrary startup delay.
await Promise.race([started, first.then(() => {throw new Error("First transaction exited without handshake");})]);
const second = session(`set application_name='roster-import-race-second'; ${secondSql}`);
// Verify the second real connection is waiting on the first claim lock.
try {
  let waiting = false;
  for (let attempt = 0; attempt < 50 && !waiting; attempt += 1) {
    const state = await session("select exists(select 1 from pg_stat_activity where application_name='roster-import-race-second' and wait_event='advisory');");
    waiting = state.trim() === "t";
    if (!waiting) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(waiting, true, "Second import must overlap and wait on the first idempotency claim");
  firstControl.finish();
} catch (error) {
  firstControl.finish("rollback;");
  await Promise.allSettled([first, second]);
  throw error;
}
return Promise.all([first, second]);
}
const [one, two] = await overlap(
  `select row_to_json(result) from public.admin_import_player_roster_v1(${args("A")}) result;`,
  `select row_to_json(result) from public.admin_import_player_roster_v1(${args("B")}) result;`,
);
const readResult = value => JSON.parse(value.split("\n").find(line => line.startsWith('{"response_status"')));
const created = readResult(one), replay = readResult(two);
assert.equal(created.was_replayed, false);
assert.equal(replay.was_replayed, true);
assert.deepEqual(replay.response_body, created.response_body);
assert.equal(created.response_body.students[0].playerIdentifier, `STU-${"A".repeat(24)}`);
assert.doesNotMatch(JSON.stringify(created.response_body), /accessCode|lookupDigest|verifier|salt|player_id/);
const state = JSON.parse((await session(`select json_build_object(
'players',(select count(*) from public.players where game_session_id='${game}'),
'credentials',(select count(*) from public.player_access_credentials where game_session_id='${game}' and status='active'),
'claims',(select count(*) from private.admin_mutation_requests where game_session_id='${game}'),
'audits',(select count(*) from public.audit_log where game_session_id='${game}' and action='players.roster_imported'));`)).trim());
assert.deepEqual(state, {players: 1, credentials: 1, claims: 1, audits: 1});
console.log(JSON.stringify({status: "passed", concurrentRequests: 2, createdBatches: 1, replayedBatches: 1}));

// Existing single-player creation must share lock order with roster imports.
const distinct = (letter, key) => `select row_to_json(result) from public.admin_import_player_roster_v1(${args(letter).replace("roster-concurrent-shared-key", key)}) result;`;
const single = `select row_to_json(result) from public.admin_create_player_v1(
  '${game}','${staff}','Synthetic single creation',null,'STU-${"D".repeat(24)}','STU-${"D".repeat(24)}',
  '${"d".repeat(64)}','pbkdf2-sha256-v2','${"a".repeat(22)}','${"b".repeat(43)}',600000,
  '{"operation":"synthetic-single-create"}','roster-single-concurrent-key','synthetic-single-request') result;`;
for (const [firstSql, secondSql] of [
  [distinct("C", "roster-distinct-first-key"), single],
  [distinct("E", "roster-distinct-second-key"), distinct("F", "roster-distinct-third-key")],
]) {
  const results = (await overlap(firstSql, secondSql)).map(readResult);
  assert.ok(results.every(result => result.response_status === 201 && result.was_replayed === false));
}
const counts = JSON.parse((await session(`select json_build_object(
'players',(select count(*) from public.players where game_session_id='${game}'),
'credentials',(select count(*) from public.player_access_credentials where game_session_id='${game}' and status='active'),
'claims',(select count(*) from private.admin_mutation_requests where game_session_id='${game}'),
'audits',(select count(*) from public.audit_log where game_session_id='${game}' and action in ('players.roster_imported','players.created')));`)).trim());
assert.deepEqual(counts, {players: 5, credentials: 5, claims: 5, audits: 5});
console.log(JSON.stringify({status:"passed", races:["same-key-replay","import-and-single-create","distinct-imports"]}));
