-- Business V2 Phase 2: Business-owned access to existing canonical physical-economy recipes.
-- This migration intentionally does not create Business recipe/BOM/input/output definitions.

begin;

create table if not exists public.business_recipe_access (
  id uuid primary key default gen_random_uuid(),
  public_key text not null unique default ('bra_' || replace(gen_random_uuid()::text, '-', ''))
    check (public_key ~ '^bra_[0-9a-f]{32}$'),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  business_id uuid not null references public.business_entities(id) on delete cascade,
  recipe_id uuid not null references public.physical_economy_recipe_definitions(id),
  source_type text not null check (source_type in ('formation','contract','staff','event','acquisition')),
  source_key text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (game_session_id, business_id, recipe_id)
);

create index if not exists business_recipe_access_business_idx
  on public.business_recipe_access(game_session_id, business_id)
  where revoked_at is null;

alter table public.business_recipe_access enable row level security;
alter table public.business_recipe_access force row level security;
revoke all on table public.business_recipe_access from public, anon, authenticated;
grant select, insert, update on table public.business_recipe_access to service_role;

create or replace function public.grant_business_recipe_access_v2(
  p_game_session_id uuid,
  p_business_key text,
  p_recipe_key text,
  p_source_type text,
  p_source_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (access_key text, business_key text, recipe_key text, granted_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.business_entities%rowtype;
  v_recipe public.physical_economy_recipe_definitions%rowtype;
  v_access public.business_recipe_access%rowtype;
begin
  if p_game_session_id is null then raise exception 'GAME_SESSION_REQUIRED'; end if;
  if coalesce(btrim(p_business_key), '') !~ '^biz_[0-9a-f]{32}$' then raise exception 'BUSINESS_KEY_INVALID'; end if;
  if coalesce(btrim(p_recipe_key), '') = '' then raise exception 'RECIPE_KEY_INVALID'; end if;
  if p_source_type not in ('formation','contract','staff','event','acquisition') then raise exception 'RECIPE_SOURCE_INVALID'; end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then raise exception 'METADATA_INVALID'; end if;

  select * into v_business
  from public.business_entities
  where game_session_id = p_game_session_id
    and public_key = lower(btrim(p_business_key))
    and status <> 'closed'
  limit 1;
  if not found then raise exception 'BUSINESS_NOT_FOUND'; end if;

  select * into v_recipe
  from public.physical_economy_recipe_definitions
  where recipe_key = btrim(p_recipe_key)
    and status = 'active'
  limit 1;
  if not found then raise exception 'RECIPE_NOT_FOUND'; end if;

  if not exists (
    select 1
    from public.game_session_recipe_availability availability
    where availability.game_session_id = p_game_session_id
      and availability.recipe_id = v_recipe.id
      and availability.enabled = true
  ) then
    raise exception 'RECIPE_NOT_AVAILABLE_IN_GAME';
  end if;

  insert into public.business_recipe_access(
    game_session_id, business_id, recipe_id, source_type, source_key, metadata, revoked_at
  ) values (
    p_game_session_id, v_business.id, v_recipe.id, p_source_type, nullif(btrim(p_source_key), ''), coalesce(p_metadata, '{}'::jsonb), null
  )
  on conflict (game_session_id, business_id, recipe_id)
  do update set
    source_type = excluded.source_type,
    source_key = excluded.source_key,
    metadata = excluded.metadata,
    granted_at = now(),
    revoked_at = null
  returning * into v_access;

  return query select v_access.public_key, v_business.public_key, v_recipe.recipe_key, v_access.granted_at;
end;
$$;

revoke all on function public.grant_business_recipe_access_v2(uuid,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.grant_business_recipe_access_v2(uuid,text,text,text,text,jsonb) to service_role;

commit;
