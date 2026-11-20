#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let parsedDatabaseUrl;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
}

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const databasePort = parsedDatabaseUrl.port || "5432";
if (
  !["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol) ||
  !loopbackHosts.has(parsedDatabaseUrl.hostname) ||
  !/^\d{1,5}$/.test(databasePort) ||
  Number(databasePort) < 1 ||
  Number(databasePort) > 65535 ||
  parsedDatabaseUrl.pathname !== "/postgres" ||
  parsedDatabaseUrl.search !== "" ||
  parsedDatabaseUrl.hash !== ""
) {
  throw new Error(
    "Banking/FX database acceptance is restricted to a loopback PostgreSQL database named postgres.",
  );
}

const fixture = Object.freeze({
  staffId: randomUUID(),
  staffAuthId: randomUUID(),
  gameOneId: randomUUID(),
  gameTwoId: randomUUID(),
  playerOneId: randomUUID(),
  playerTwoId: randomUUID(),
});

const sqlPath = fileURLToPath(
  new URL("./banking-fx-database-acceptance.sql", import.meta.url),
);

function redact(value) {
  let result = String(value).replaceAll(
    databaseUrl,
    "postgresql://***@127.0.0.1:<local>/postgres",
  );
  if (parsedDatabaseUrl.password) {
    result = result.replaceAll(parsedDatabaseUrl.password, "***");
  }
  return result;
}

// Reconstruct only the exact pre-c1 table shape in a rollback transaction. All
// other schema remains the full replay; no historical migration is rewritten.
const migrationPath = new URL("../backend/supabase/migrations/20261004145731_add_loan_liability_contract_v1.sql", import.meta.url);
const migration = readFileSync(migrationPath, "utf8").replace(/^begin;\s*$/mu, "").replace(/^commit;\s*$/mu, "");
const acceptance = readFileSync(sqlPath, "utf8");
const setupStart = acceptance.indexOf("do $ref025$");
const setupEnd = acceptance.indexOf("  foreach tab in array array['loan_applications','player_loans'] loop");
if (setupStart < 0 || setupEnd <= setupStart) throw new Error("REF025 fixture boundaries missing");
const setup = acceptance.slice(setupStart, setupEnd) + "end; $ref025$;";
const upgrade = `begin;
alter table public.loan_applications drop column liability_kind, drop column initiating_operator_player_id,
  drop column borrower_business_id, drop column obligation_currency_code;
alter table public.player_loans drop column liability_kind, drop column initiating_operator_player_id, drop column borrower_business_id;
${setup}
create function pg_temp.ref025_catalog() returns jsonb language sql as $catalog$
  select jsonb_build_object(
    'columns',(select jsonb_agg(jsonb_build_array(attrelid,attname,atttypid,atttypmod,attnotnull,attnum)
      order by attrelid,attnum) from pg_attribute where attrelid in ('public.loan_applications'::regclass,
      'public.player_loans'::regclass) and attnum>0 and not attisdropped),
    'constraints',(select jsonb_agg(jsonb_build_array(conrelid,conname,pg_get_constraintdef(oid)) order by conrelid,conname)
      from pg_constraint where conrelid in ('public.loan_applications'::regclass,'public.player_loans'::regclass)),
    'indexes',(select jsonb_agg(indexdef order by tablename,indexname) from pg_indexes
      where schemaname='public' and tablename in ('loan_applications','player_loans')));
$catalog$;
create function pg_temp.ref025_rows() returns jsonb language plpgsql as $rows$
declare tab text; rows jsonb; result jsonb:='{}'; begin
  foreach tab in array array['loan_applications','player_loans','loan_payments','ledger_entries','account_balances'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)-array[%L,%L,%L,%L] order by id),%L::jsonb) from public.%I t',
      'liability_kind','initiating_operator_player_id','borrower_business_id','obligation_currency_code','[]',tab) into rows;
    result:=result||jsonb_build_object(tab,rows);
  end loop; return result;
end $rows$;
create temp table ref025_before on commit drop as select pg_temp.ref025_catalog() catalog,pg_temp.ref025_rows() rows;
do $failure$ begin
  begin
    execute $migration$${migration}$migration$;
    raise exception using errcode='Z0251',message='REF025 injected migration failure';
  exception when sqlstate 'Z0251' then null;
  end;
  if pg_temp.ref025_catalog() is distinct from (select catalog from ref025_before)
    or pg_temp.ref025_rows() is distinct from (select rows from ref025_before) then
    raise exception 'REF025 partial schema or data survived failed migration';
  end if;
end $failure$;
${migration}
do $preserved$ declare debt record; paid record; begin
  if pg_temp.ref025_rows() is distinct from (select rows from ref025_before) then
    raise exception 'REF025 populated upgrade changed legacy data';
  end if;
  if exists(select 1 from public.player_loans where liability_kind <> 'legacy_v1'
      or initiating_operator_player_id is not null or borrower_business_id is not null)
    or exists(select 1 from public.loan_applications where liability_kind <> 'legacy_v1'
      or initiating_operator_player_id is not null or borrower_business_id is not null or obligation_currency_code is not null) then
    raise exception 'REF025 populated upgrade changed legacy identity';
  end if;
  for debt in select * from public.player_loans where currency_code='QREFLOAN' loop
    select * into paid from public.repay_player_loan_v1(debt.game_session_id,debt.player_id,debt.public_key,10,'ref025-after-upgrade');
    if paid.principal_balance <> 80 or paid.replayed then raise exception 'REF025 upgraded repayment failed'; end if;
  end loop;
end $preserved$;
rollback;
do $cleanup$ begin
  if exists(select 1 from public.currencies where code='QREFLOAN') or
    (select count(*) from pg_constraint where conname in ('loan_applications_business_liability_disabled_v1',
      'player_loans_business_liability_disabled_v1') and convalidated) <> 2 then
    raise exception 'REF025 upgrade rollback failed';
  end if;
end $cleanup$;`;
const upgradeResult = spawnSync("psql", ["--no-psqlrc", databaseUrl, "--set=ON_ERROR_STOP=1"], {
  input: upgrade, encoding: "utf8", env: { ...process.env, PGAPPNAME: "ref025-disposable-upgrade-proof" }, maxBuffer: 16 * 1024 * 1024,
});
if (upgradeResult.error) throw upgradeResult.error;
if (upgradeResult.status !== 0) throw new Error(`REF025 populated upgrade failed: ${redact(upgradeResult.stdout + upgradeResult.stderr)}`);
console.log("REF025 populated personal/business upgrade, injected failure rollback and repayment passed (rolled back).");

const result = spawnSync(
  "psql",
  [
    "--no-psqlrc",
    databaseUrl,
    "--set=ON_ERROR_STOP=1",
    `--set=staff_id=${fixture.staffId}`,
    `--set=staff_auth_id=${fixture.staffAuthId}`,
    `--set=game_one_id=${fixture.gameOneId}`,
    `--set=game_two_id=${fixture.gameTwoId}`,
    `--set=player_one_id=${fixture.playerOneId}`,
    `--set=player_two_id=${fixture.playerTwoId}`,
    "--file",
    sqlPath,
  ],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      PGAPPNAME: "econovaria-banking-fx-database-acceptance",
    },
    maxBuffer: 16 * 1024 * 1024,
  },
);

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  const detail = redact(`${result.stdout ?? ""}\n${result.stderr ?? ""}`).trim();
  throw new Error(
    `Banking/FX database acceptance failed.${detail ? `\n${detail}` : ""}`,
  );
}

console.log("B2 Banking/FX database acceptance passed (all fixture writes rolled back).");
