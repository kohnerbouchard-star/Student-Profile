import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { passwordResetFixture as fixture, runPasswordResetCandidateChecks } from "./password-reset-transition-regression.mjs";
const uid = "00000000-0000-4000-8000-000000000001";

// No URL or caller-selected database: this test owns a network-isolated server.
const image = "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";
const container = `econovaria-password-transition-${process.pid}`;
const migration = (name) => readFileSync(new URL(`../backend/supabase/migrations/${name}`, import.meta.url), "utf8");
const sql = (text) => execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: text, encoding: "utf8" });

test("real migrated Staff password transition: baseline failure and forward correction", async (t) => {
  console.log(`Focused database image: ${image}`);
  execFileSync("docker", ["run", "--detach", "--rm", "--name", container, "--network", "none", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", image], { stdio: "pipe" });
  try {
    execFileSync("docker", ["exec", container, "sh", "-c", "for i in $(seq 1 30); do read process_name </proc/1/comm; [ \"$process_name\" = postgres ] && pg_isready -U postgres >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1"], { stdio: "pipe" });
    sql(`create role anon; create role authenticated; create role service_role;
      grant usage on schema public to anon,authenticated,service_role;
      create schema auth;
      create table auth.users(id uuid primary key, raw_app_meta_data jsonb default '{}');
      create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz default now(),not_after timestamptz);
      create table auth.mfa_factors(id uuid primary key,user_id uuid,factor_type text,status text,created_at timestamptz default now());`);
    // Entire unchanged repository migrations, never a replacement transition stub.
    for (const name of ["20260615161835_create_core_tables_v1.sql", "20260726091000_add_staff_security_state_v2.sql", "20260726095000_add_staff_permission_grants_v2.sql", "20260726096000_add_staff_password_reset_security_transition_v2.sql", "20260731130000_add_verified_staff_onboarding_v1.sql", "20261005212732_system_account_recovery_v1.sql"]) sql(migration(name));
    await t.test("baseline actually raises 42804 and rolls back its update", () => {
      const result = sql(`begin; ${fixture}
        select pg_temp.check((select data_type='integer' from information_schema.columns where table_schema='public' and table_name='staff_users' and column_name='permission_version'),'real integer column');
        do $$ declare detail text; begin
          begin perform public.complete_staff_password_reset_security_v2('${uid}');
            raise exception 'baseline unexpectedly succeeded';
          exception when sqlstate '42804' then
            get stacked diagnostics detail=PG_EXCEPTION_DETAIL;
            if detail not like '%integer%bigint%column 3%' then raise exception 'unexpected 42804 detail: %',detail; end if;
            raise notice 'BASELINE_SQLSTATE_42804: %',detail;
          end;
        end $$;
        select pg_temp.check((select security_version=41 and permission_version=(select permission_version from expected_staff) from public.staff_users where id='${uid}'),'baseline atomic rollback');
        select 'BASELINE_SQLSTATE_42804'; rollback;`);
      assert.match(result, /BASELINE_SQLSTATE_42804/);
    });
    const before = JSON.parse(sql("select json_build_object('result',pg_get_function_result(oid),'securityDefiner',prosecdef,'settings',proconfig,'acl',proacl::text)::text from pg_proc where oid='public.complete_staff_password_reset_security_v2(uuid)'::regprocedure;"));
    sql(migration("20261103082647_cast_staff_password_reset_permission_version_v2.sql"));
    const after = JSON.parse(sql("select json_build_object('result',pg_get_function_result(oid),'securityDefiner',prosecdef,'settings',proconfig,'acl',proacl::text)::text from pg_proc where oid='public.complete_staff_password_reset_security_v2(uuid)'::regprocedure;"));
    await t.test("signature, SECURITY DEFINER, search_path and ACL are preserved", () => assert.deepEqual(after, before));
    await runPasswordResetCandidateChecks(t, sql);
  } finally {
    execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" });
  }
});
