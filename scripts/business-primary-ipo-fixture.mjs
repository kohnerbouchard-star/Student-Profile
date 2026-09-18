import assert from "node:assert/strict";
import { FIXTURE, seedFixtureSql, runSql, runJson, sqlLiteral as q, createQuote, settle } from "./business-phase10-atomic-settlement-database-support.mjs";
import { prepareContributedInventory } from "./business-financial-reporting-statement-acceptance.mjs";
export const service = (sql) => runJson(`begin; set local role service_role; select to_jsonb(r)::text from ${sql} r; commit;`);
export const jsonService = (sql) => runJson(`begin; set local role service_role; select ${sql}::text; commit;`);
export function createPrimaryIpoFixture() {
  const count = runJson(`select jsonb_build_object('count',count(*))::text from public.game_sessions
    where id in (${q(FIXTURE.games.one.id)},${q(FIXTURE.games.two.id)});`);
  assert.equal(count.count, 0, "fresh local replay required; immutable evidence is never deleted to reset fixtures");
  const prefix = seedFixtureSql.split("insert into public.business_entities (")[0];
  runSql(`begin; ${prefix}
    update public.game_sessions set status='active',lifecycle_state='active' where id in (${q(FIXTURE.games.one.id)},${q(FIXTURE.games.two.id)});
    insert into public.country_profiles(country_code,country_name,capital_name,currency_code,status)
      values('NORTHREACH','Northreach','Northreach Capital','NRC','active') on conflict(country_code) do nothing;
    update public.players set country_id=(select id from public.country_profiles where country_code='NORTHREACH')
      where game_session_id in (${q(FIXTURE.games.one.id)},${q(FIXTURE.games.two.id)});
    update public.player_country_assignments set country_profile_id=(select id from public.country_profiles where country_code='NORTHREACH')
      where game_session_id in (${q(FIXTURE.games.one.id)},${q(FIXTURE.games.two.id)});
    commit;`);
  const games = {};
  for (const [label, game] of Object.entries(FIXTURE.games)) {
    runSql(`do $fixture$ begin perform * from public.record_player_ledger_entry(
      ${q(game.id)},${q(game.ownerId)},'checking',10000,'NRC','credit','setup','initial_balance_seed',
      ${q(game.ownerId)},'system',null,jsonb_build_object('bankTransactionIdempotencyKey','phase14c-founder-${label}'));
      end; $fixture$;`);
    const formation = service(`public.propose_business_formation_v2(${q(game.id)},${q(game.ownerId)},
      'IPO Corporation ${label}','c_corporation','manufacturing',
      '[{"playerIdentifier":"SELF","ownershipBasisPoints":10000,"capitalContribution":"1000.00"}]'::jsonb,'phase14c-propose-${label}')`);
    service(`public.respond_business_formation_v2(${q(game.id)},${q(game.ownerId)},${q(formation.formation_key)},'approve','phase14c-approve-${label}')`);
    const activated = service(`public.activate_business_formation_v2(${q(game.id)},${q(game.ownerId)},${q(formation.formation_key)},'phase14c-activate-${label}')`);
    const business = runJson(`select jsonb_build_object('id',id,'key',public_key)::text from public.business_entities
      where game_session_id=${q(game.id)} and public_key=${q(activated.business_key)};`);
    games[label] = { ...game, businessId: business.id, businessKey: business.key };
  }
  let suffix = "insert into public.game_items (" + seedFixtureSql.split("insert into public.game_items (")[1];
  suffix = suffix.replaceAll("'ECO'", "'NRC'");
  for (const label of Object.keys(games)) {
    suffix = suffix.replaceAll(FIXTURE.games[label].businessId, games[label].businessId)
      .replaceAll(FIXTURE.games[label].businessKey, games[label].businessKey);
  }
  runSql(`begin; ${suffix} commit;`);
  prepareContributedInventory(games.one, "NRC");
  prepareContributedInventory(games.two, "NRC");
  return games;
}
export function closeIpoOperatingHistory(game) {
  const quote = createQuote(game, { idempotencyKey: `phase14c-real-store-${game.offerKey.slice(-4)}`, quantity: 2 });
  settle({ game, quoteKey: quote.quoteKey, quantity: 2, idempotencyKey: `phase14c-sale-${game.offerKey.slice(-4)}` });
  runSql(`do $fixture$ begin perform public.ensure_business_payroll_clock_v2(${q(game.id)},${q(game.businessId)}); end; $fixture$;
    update public.business_payroll_clocks set period_started_at=statement_timestamp()-make_interval(secs=>period_duration_seconds),
      next_due_at=statement_timestamp(),version=version+1 where game_session_id=${q(game.id)} and business_id=${q(game.businessId)};`);
  const claims = runJson(`begin; set local role service_role;
    select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb)::text from public.claim_due_business_operating_periods_v1(100) c; commit;`);
  const claim = claims.find((row) => row.business_key === game.businessKey);
  assert.ok(claim);
  service(`public.close_claimed_business_operating_period_v1(${q(claim.claim_key)},${q(claim.lease_token)},'phase14c-close-${game.offerKey.slice(-4)}')`);
  const report = jsonService(`public.read_owned_business_financial_statements_v1(${q(game.id)},${q(game.ownerId)})`);
  assert.equal(report.statements[0].status, "complete", "IPO history is a reconciled canonical statement after an actual Store sale");
  return report.statements[0];
}
