import { runSql, sqlLiteral } from './auth-fixture.mjs';
import { absent, check, equal } from './evidence.mjs';

export async function snapshot(gameName) {
  const name = sqlLiteral(gameName);
  return JSON.parse(await runSql(`with scope as (select id from public.game_sessions where name=${name}),
    p as (select p.* from public.players p join scope s on s.id=p.game_session_id),
    c as (select c.* from public.player_access_credentials c join scope s on s.id=c.game_session_id where c.status='active'),
    a as (select a.* from public.audit_log a join scope s on s.id=a.game_session_id where a.action='players.roster_imported'),
    r as (select r.* from private.admin_mutation_requests r join scope s on s.id=r.game_session_id where r.operation='players.roster_import')
    select jsonb_build_object(
      'games',(select count(*) from scope), 'players',(select count(*) from p),
      'countries',(select count(*) from public.player_country_assignments x join scope s on s.id=x.game_session_id where x.status='active'),
      'credentials',(select count(*) from c), 'validCredentials',(select count(*) from c where credential_version='pbkdf2-sha256-v2' and credential_iterations=600000),
      'receipts',(select count(*) from r), 'completed',(select count(*) from r where status='completed' and response_status=201),
      'audits',(select count(*) from a),
      'playerDigests',coalesce((select jsonb_object_agg(id::text,md5(to_jsonb(p)::text)) from p),'{}'::jsonb),
      'credentialDigests',coalesce((select jsonb_object_agg(id::text,md5(to_jsonb(c)::text)) from c),'{}'::jsonb),
      'receiptBodies',coalesce((select jsonb_agg(response_body order by created_at,id) from r),'[]'::jsonb),
      'auditBodies',coalesce((select jsonb_agg(to_jsonb(a) order by created_at,id) from a),'[]'::jsonb)
    )::text;`));
}
export function assertDelta(before, after, count) {
  check(before.games === 1 && after.games === 1, 'game-scope-count');
  for (const field of ['players','countries','credentials','validCredentials']) {
    check(after[field] - before[field] === count, `database-${field}-delta`);
  }
  for (const field of ['receipts','completed','audits']) check(after[field] - before[field] === 1, `database-${field}-delta`);
  for (const field of ['playerDigests','credentialDigests']) {
    for (const [id, hash] of Object.entries(before[field])) check(after[field][id] === hash, 'existing-student-unchanged');
  }
}
export function assertPersistedPrivacy(state, codes, names, identifiers) {
  const receipts = JSON.stringify(state.receiptBodies);
  absent(receipts, codes, 'persisted-receipt-code-leak');
  check(!/accessCode|lookupDigest|verifier|salt|[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/i.test(receipts), 'persisted-receipt-private-fields');
  absent(JSON.stringify(state.auditBodies), [...codes,...names,...identifiers], 'persisted-audit-roster-leak');
  equal(state.receiptBodies.map(body => body.createdCount), state.auditBodies.map(row => Number(row.metadata?.createdCount)), 'aggregate-audit-counts');
}
