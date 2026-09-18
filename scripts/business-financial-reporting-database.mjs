import assert from "node:assert/strict";
import {
  FIXTURE, resetFixture, runSql, runJson, expectSqlError,
  sqlLiteral as q, snapshot, createQuote, settle,
} from "./business-phase10-atomic-settlement-database-support.mjs";

// The shared support refuses non-local databases and existing fixtures.
resetFixture();
const { one, two } = FIXTURE.games;
runSql(`update public.game_sessions set lifecycle_state='active', status='active'
  where id in ('${one.id}','${two.id}');`);
runSql(`insert into public.business_ownership_positions(
  game_session_id,business_id,player_id,ownership_kind,units,voting_units
) values
  ('${one.id}','${one.businessId}','${one.ownerId}','membership_interest',100,100),
  ('${two.id}','${two.businessId}','${two.ownerId}','membership_interest',100,100);`);
const call = (game = one, player = game.ownerId) =>
  `public.read_owned_business_financial_reports_v1(${q(game.id)}::uuid,${q(player)}::uuid)`;
const read = (game = one) => runJson(
  `begin read only; set local role service_role; select ${call(game)}::text; commit;`,
);
const clockCount = () => runSql(`select count(*) from public.business_payroll_clocks
  where game_session_id in ('${one.id}','${two.id}');`).output;
const originalClocks = clockCount();
const original = [snapshot(one.id), snapshot(two.id)];
assert.deepEqual(read().periods, []);
assert.equal(read().truncated, false);
assert.deepEqual([snapshot(one.id), snapshot(two.id)], original);
assert.equal(clockCount(), originalClocks, "a report must never initialize payroll clocks");

for (const role of ["anon", "authenticated"]) {
  expectSqlError(`begin; set local role ${role}; select ${call()}; rollback;`, /permission denied/i);
}
for (const player of [two.ownerId, one.buyerTwoId]) {
  expectSqlError(`begin read only; set local role service_role; select ${call(one, player)}; rollback;`, /BUSINESS_NOT_FOUND/);
}
expectSqlError(`begin; update public.business_ownership_positions
  set status='exited', ended_at=clock_timestamp()
  where game_session_id='${one.id}' and business_id='${one.businessId}' and player_id='${one.ownerId}';
  set local role service_role; select ${call()}; rollback;`, /BUSINESS_NOT_FOUND/);
expectSqlError(`begin; insert into public.business_entities(
  game_session_id,owner_player_id,legal_name,entity_type,industry_code,country_code,currency_code,
  status,capitalization,valuation,tax_classification,formation_state,ownership_model_version
) select game_session_id,owner_player_id,'Ambiguous reporting fixture',entity_type,industry_code,
  country_code,currency_code,status,capitalization,valuation,tax_classification,formation_state,1
  from public.business_entities where id='${one.businessId}';
  set local role service_role; select ${call()}; rollback;`, /BUSINESS_OWNERSHIP_AMBIGUOUS/);
expectSqlError(`begin; set local role service_role;
  select economy_private.read_business_financial_reports_v1('${one.id}','${one.businessId}'); rollback;`, /permission denied/i);
expectSqlError(`begin; set local role service_role;
  select economy_private.project_business_closed_period_v1(null::public.business_operating_period_close_receipts); rollback;`, /permission denied/i);
expectSqlError(`select economy_private.read_business_financial_reports_v1('${two.id}','${one.businessId}');`, /BUSINESS_NOT_FOUND/);

// Real committed Store purchase: two units at 7.50 with 2.50 unit cost.
const quote = createQuote(one, { idempotencyKey: "phase14-report-store-quote", quantity: 2 });
const purchase = { game: one, quoteKey: quote.quoteKey, quantity: 2, idempotencyKey: "phase14-report-store-settle" };
settle(purchase);
settle(purchase);
assert.deepEqual(read().periods, [], "open-period activity is not a closed report");
runSql(`begin; set local role service_role;
  select public.ensure_business_payroll_clock_v2('${one.id}','${one.businessId}');
  select public.ensure_business_payroll_clock_v2('${two.id}','${two.businessId}'); commit;`);

function closePeriod(game, suffix) {
  // Only the disposable fixture advances time; the report has no close command.
  runSql(`update public.business_payroll_clocks
    set period_started_at = statement_timestamp() - make_interval(secs => period_duration_seconds),
        next_due_at = statement_timestamp(), version = version + 1
    where game_session_id='${game.id}' and business_id='${game.businessId}';`);
  const claims = runJson(`begin; set local role service_role;
    select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)::text
    from public.claim_due_business_operating_periods_v1(100) c; commit;`);
  const claim = claims.find((row) => row.business_key === game.businessKey);
  assert.ok(claim, "server-owned due period must yield a claim");
  const close = `public.close_claimed_business_operating_period_v1(
    ${q(claim.claim_key)}, ${q(claim.lease_token)}::uuid, ${q(`phase14-close-${suffix}`)})`;
  const result = () => runJson(`begin; set local role service_role;
    select to_jsonb(r)::text from ${close} r; commit;`);
  const first = result();
  const replay = result();
  assert.equal(replay.close_receipt_key, first.close_receipt_key);
  assert.equal(replay.replayed, true);
  return first;
}
const firstClose = closePeriod(one, "sales");
const first = read();
assert.equal(first.schemaVersion, 1);
assert.equal(first.businessKey, one.businessKey);
assert.equal(first.readOnly, true);
assert.equal(first.coverage, "partial");
assert.equal(first.reportKind, "closed_period_operating_evidence");
assert.deepEqual(first.unavailableStatements, ["income_statement", "balance_sheet", "cash_flow_statement"]);
assert.equal(first.periods.length, 1);
const period = first.periods[0];
assert.equal(period.closeReceiptKey, firstClose.close_receipt_key);
assert.equal(period.storeReceiptCount, 1, "settlement replay cannot duplicate sales");
assert.equal(period.periodNumber, "1");
assert.equal(period.reportingCurrencyCode, "ECO");
assert.deepEqual(period.salesByCurrency, [{
  currencyCode: "ECO", storeReceiptCount: 1,
  grossReceipts: "15.000000000000000000",
  costOfGoodsSold: "5.000000000000000000",
  grossProfit: "10.000000000000000000",
}]);
assert.equal(period.payroll.grossWagesDue, "0.000000000000000000");
assert.equal(period.taxByCurrency[0].taxAssessed, "1.200000000000000000");
assert.equal(period.taxByCurrency[0].taxPaid, "1.200000000000000000");
assert.deepEqual(read(two).periods, []);
assert.doesNotMatch(JSON.stringify(first), /request_hash|idempotency_key|lease_token|metadata|netIncome|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

const before = [snapshot(one.id), snapshot(two.id), clockCount()];
assert.deepEqual(read(), first);
assert.deepEqual([snapshot(one.id), snapshot(two.id), clockCount()], before);
expectSqlError(`update public.business_operating_period_close_receipts
  set gross_wages_due=1 where public_key=${q(firstClose.close_receipt_key)};`, /BUSINESS_OPERATING_PERIOD_EVIDENCE_IMMUTABLE/);
closePeriod(one, "zero-sales");
const second = read();
assert.equal(second.periods[0].storeReceiptCount, 0);
assert.deepEqual(second.periods[0].salesByCurrency, []);
assert.deepEqual(second.periods[1], period, "later closes cannot rewrite earlier evidence");
closePeriod(two, "other-game");
assert.equal(read(two).periods.length, 1);
assert.equal(read().periods.length, 2);

// Pure projection precision/privacy test, without inserting fabricated evidence.
const exact = "9007199254740993.123456789123456789";
const projection = runJson(`select economy_private.project_business_closed_period_v1(
  jsonb_populate_record(null::public.business_operating_period_close_receipts, '{
    "period_number":9007199254740993,
    "gross_wages_due":${exact},"gross_wages_paid":${exact},"gross_wages_unpaid":0,
    "reporting_currency_code":"ECO","metadata":{"private":"POISON"},
    "id":"${one.ownerId}","request_hash":"POISON",
    "gross_receipts_by_currency":[
      {"currencyCode":"NRC","storeReceiptCount":1,"grossReceipts":2,"costOfGoodsSold":10},
      {"currencyCode":"ECO","storeReceiptCount":1,"grossReceipts":${exact},"costOfGoodsSold":1,"private":"POISON"}
    ],
    "tax_by_currency":[{"currencyCode":"ECO","taxRate":0.08,"taxAssessed":${exact},"taxPaid":0,"taxUnpaid":${exact},"status":"unpaid","private":"POISON"}]
  }'::jsonb)
)::text;`);
assert.equal(projection.periodNumber, "9007199254740993");
assert.equal(projection.payroll.grossWagesDue, exact);
assert.equal(projection.salesByCurrency[0].grossReceipts, exact);
assert.equal(projection.salesByCurrency[0].grossProfit, "9007199254740992.123456789123456789");
assert.equal(projection.salesByCurrency[1].grossProfit, "-8");
assert.equal(projection.taxByCurrency[0].taxUnpaid, exact);
assert.doesNotMatch(JSON.stringify(projection), /POISON|private|request_hash|metadata/);

// Exercise the bounded window using real server close commands, including replay.
for (let index = 3; index <= 51; index += 1) closePeriod(one, `window-${index}`);
const bounded = read();
assert.equal(bounded.periods.length, 50);
assert.equal(bounded.periodLimit, 50);
assert.equal(bounded.truncated, true);
assert.equal(bounded.periods[0].periodNumber, "51");
assert.equal(bounded.periods.at(-1).periodNumber, "2");
assert.equal(new Set(bounded.periods.map((row) => row.closeReceiptKey)).size, 50);
assert.equal(read(two).periods.length, 1);
expectSqlError(`begin; update public.business_entities set status='closed',closed_at=now()
  where id='${one.businessId}'; set local role service_role; select ${call()}; rollback;`, /BUSINESS_NOT_FOUND/);
console.log("Phase 14A1: closed Store evidence, replay, empty/zero-sale periods, read-only scope/grants, decimal precision, privacy and bounded history pass.");
