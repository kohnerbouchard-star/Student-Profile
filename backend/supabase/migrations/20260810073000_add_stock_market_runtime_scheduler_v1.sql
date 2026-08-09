begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.runtime_scheduler_tokens (
  scheduler_name text primary key,
  token_sha256 text not null check (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  rotated_at timestamptz null
);

alter table private.runtime_scheduler_tokens enable row level security;
alter table private.runtime_scheduler_tokens force row level security;
revoke all on table private.runtime_scheduler_tokens
  from public, anon, authenticated, service_role;
grant select on table private.runtime_scheduler_tokens to service_role;

create or replace function public.verify_runtime_scheduler_token_v1(
  p_scheduler_name text,
  p_token_sha256 text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select exists (
    select 1
    from private.runtime_scheduler_tokens as token
    where token.scheduler_name = p_scheduler_name
      and token.token_sha256 = lower(btrim(p_token_sha256))
  );
$$;

revoke all on function public.verify_runtime_scheduler_token_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.verify_runtime_scheduler_token_v1(text, text)
  to service_role;

create or replace function public.configure_stock_market_runtime_scheduler_v1(
  p_function_url text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, cron, net, extensions
as $$
declare
  v_scheduler_name constant text := 'econovaria-stock-runtime-scheduler-v1';
  v_function_url text := lower(btrim(coalesce(p_function_url, '')));
  v_token text;
  v_job_id bigint;
  v_command text;
begin
  if v_function_url !~ '^https://[a-z0-9]{20}[.]supabase[.]co/functions/v1/stock-market-orchestrator$' then
    raise exception using errcode = '22023', message = 'invalid stock runtime scheduler function URL';
  end if;

  select decrypted_secret
  into v_token
  from vault.decrypted_secrets
  where name = v_scheduler_name
  order by created_at desc
  limit 1;

  if v_token is null then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      v_token,
      v_scheduler_name,
      'Internal token for the 15-minute Econovaria stock runtime scheduler.'
    );
  end if;

  insert into private.runtime_scheduler_tokens (scheduler_name, token_sha256)
  values (
    v_scheduler_name,
    encode(extensions.digest(v_token, 'sha256'), 'hex')
  )
  on conflict (scheduler_name) do update
    set token_sha256 = excluded.token_sha256,
        rotated_at = case
          when private.runtime_scheduler_tokens.token_sha256 <> excluded.token_sha256
            then clock_timestamp()
          else private.runtime_scheduler_tokens.rotated_at
        end;

  for v_job_id in
    select jobid
    from cron.job
    where jobname = v_scheduler_name
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  v_command := format(
    $command$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-econovaria-scheduler-token', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'econovaria-stock-runtime-scheduler-v1'
            order by created_at desc
            limit 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
    $command$,
    v_function_url
  );

  return cron.schedule(v_scheduler_name, '*/15 * * * *', v_command);
end;
$$;

revoke all on function public.configure_stock_market_runtime_scheduler_v1(text)
  from public, anon, authenticated;
grant execute on function public.configure_stock_market_runtime_scheduler_v1(text)
  to service_role;

comment on function public.verify_runtime_scheduler_token_v1(text, text) is
  'Service-role-only verifier for a Vault-held runtime scheduler token hash.';
comment on function public.configure_stock_market_runtime_scheduler_v1(text) is
  'Configures the environment-specific 15-minute stock runtime cron without storing service credentials in cron or source.';

commit;
