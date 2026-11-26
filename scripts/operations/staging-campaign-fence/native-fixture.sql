-- Minimal disposable table shapes for the actual immutable routine bodies.
create schema private;
create schema extensions;
create extension pgcrypto with schema extensions;
create table private.runtime_scheduler_tokens(scheduler_name text primary key,token_sha256 text not null,
  created_at timestamptz not null default clock_timestamp(), rotated_at timestamptz);
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key, statements text[] not null);
create table public.game_sessions(id uuid primary key, status text, lifecycle_state text, provisioning_status text, name text);
create table public.campaign_instances(
  id uuid primary key, public_id text, game_session_id uuid, status text, current_phase text,
  revision bigint, event_sequence bigint, outcome text, scheduled_at timestamptz, completed_at timestamptz, updated_at timestamptz, pack_id text
);
create table public.campaign_event_executions(
  id uuid primary key default gen_random_uuid(), public_id text default 'cev_synthetic',
  game_session_id uuid,campaign_instance_id uuid,event_key text,trigger_key text, execution_key text,
  from_phase text,to_phase text,sequence bigint,actor_type text,actor_staff_user_id uuid,reason text,occurred_at timestamptz
);
create table public.campaign_effect_commands(
  id uuid primary key default gen_random_uuid(), public_id text unique default 'cec_'||replace(gen_random_uuid()::text,'-',''),
  game_session_id uuid not null,campaign_instance_id uuid not null,event_execution_id uuid,
  idempotency_key text not null,effect_kind text not null,payload jsonb not null,status text not null,
  attempt_count integer not null,claimed_at timestamptz,last_error_code text,created_at timestamptz default now(),
  completed_at timestamptz
);
create table public.campaign_admin_audit(game_session_id uuid,campaign_instance_id uuid,actor_type text,
  actor_staff_user_id uuid,action text,from_status text,to_status text,from_phase text,to_phase text,reason text,occurred_at timestamptz);
create table public.campaign_effect_recovery_audit(id integer);
create table public.campaign_outcome_evidence_snapshots(id integer);
create table public.campaign_effect_application_receipts(game_session_id uuid,idempotency_key text,
  effect_kind text,request_digest text,applied_at timestamptz,primary key(game_session_id,idempotency_key));
create table public.players(id uuid primary key,game_session_id uuid,status text);
create table public.notifications(id uuid primary key default gen_random_uuid(),public_notification_id text default 'ntf_synthetic',
  game_session_id uuid,source_type text,source_id text,notification_type text,title text,summary text,priority text,
  display_mode text,payload jsonb,published_at timestamptz, unique(game_session_id,source_type,source_id,notification_type));
create table public.notification_deliveries(id uuid primary key default gen_random_uuid(),notification_id uuid,
  game_session_id uuid,player_id uuid,delivered_at timestamptz,unique(notification_id,player_id));
create table public.game_session_item_supply(game_session_id uuid,country_code text,item_key text,scarcity_band text,
  event_multiplier numeric, source_event_key text,effective_at timestamptz,expires_at timestamptz,version integer);
create table public.world_runtime_instances(game_session_id uuid primary key,revision bigint);
create table public.world_route_states(game_session_id uuid,public_route_id text,status text,reason text,
  cost_multiplier_basis_points integer,duration_multiplier_basis_points integer,revision bigint,updated_at timestamptz);
create table public.world_runtime_commands(game_session_id uuid,command_key text,command_kind text,
  applied_revision bigint,applied_at timestamptz,unique(game_session_id,command_key));
create table public.stock_market_events(game_session_id uuid,shock_id text,scope text,target_key text,magnitude numeric,
  decay numeric,confidence numeric,volatility_impact numeric,volume_impact numeric,headline text,explanation text,created_tick integer,
  expires_tick integer,is_active boolean,category text,sentiment text,source text,visibility text,metadata jsonb,unique(game_session_id,shock_id));
-- Unrelated deterministic market clock dependency. The actual market write,
-- idempotency and request validation remain the repository routine.
create function public.get_current_stock_market_tick_index_v2(uuid) returns integer language sql as 'select 7';
