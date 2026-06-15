-- Eco Novaria core tables V1.
-- Fresh Supabase schema foundation only: no seed data, no legacy import, no feature tables.

create extension if not exists "pgcrypto";

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.staff_users (
  id uuid primary key default gen_random_uuid(),
  supabase_auth_user_id uuid not null unique,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint staff_users_email_not_blank check (length(btrim(email)) > 0),
  constraint staff_users_display_name_not_blank check (length(btrim(display_name)) > 0)
);

create trigger set_staff_users_updated_at
before update on public.staff_users
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.staff_users is
  'Teacher users for V1. staff_users means teacher users only; there are no support, assistant, platform, or developer app roles in V1.';
comment on column public.staff_users.supabase_auth_user_id is
  'Supabase Auth user id for the teacher account.';

create table public.purchase_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  status text not null default 'active',
  max_redemptions integer not null default 1,
  redeemed_count integer not null default 0,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint purchase_codes_code_hash_not_blank check (length(btrim(code_hash)) > 0),
  constraint purchase_codes_status_check check (status in ('active', 'exhausted', 'expired', 'revoked')),
  constraint purchase_codes_max_redemptions_positive check (max_redemptions > 0),
  constraint purchase_codes_redeemed_count_valid check (
    redeemed_count >= 0
    and redeemed_count <= max_redemptions
  )
);

create trigger set_purchase_codes_updated_at
before update on public.purchase_codes
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.purchase_codes is
  'Source of truth for purchase-code redemption eligibility. Stores code hashes only; redemption is server-side only.';
comment on column public.purchase_codes.code_hash is
  'Hash of the purchase code. Plaintext purchase codes must not be stored.';

create index purchase_codes_status_idx
on public.purchase_codes (status);

create index purchase_codes_expires_at_idx
on public.purchase_codes (expires_at);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_staff_user_id uuid not null references public.staff_users (id),
  name text not null,
  status text not null default 'active',
  game_join_code_hash text null,
  game_join_code_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint game_sessions_name_not_blank check (length(btrim(name)) > 0),
  constraint game_sessions_status_check check (status in ('active', 'archived', 'disabled')),
  constraint game_sessions_join_code_status_check check (game_join_code_status in ('pending', 'active', 'revoked')),
  constraint game_sessions_active_join_code_has_hash check (
    game_join_code_status <> 'active'
    or game_join_code_hash is not null
  ),
  constraint game_sessions_join_code_hash_not_blank check (
    game_join_code_hash is null
    or length(btrim(game_join_code_hash)) > 0
  )
);

create trigger set_game_sessions_updated_at
before update on public.game_sessions
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.game_sessions is
  'Teacher-owned game/class session. game_sessions.id is the isolation boundary for all live simulation data.';
comment on column public.game_sessions.owner_staff_user_id is
  'Teacher owner for the game session. V1 does not use game_staff or support-teacher roles.';
comment on column public.game_sessions.game_join_code_hash is
  'Hash of the game join code. Plaintext join codes must not be stored.';

create index game_sessions_owner_staff_user_id_idx
on public.game_sessions (owner_staff_user_id);

create index game_sessions_status_idx
on public.game_sessions (status);

create unique index game_sessions_active_join_code_hash_idx
on public.game_sessions (game_join_code_hash)
where game_join_code_status = 'active'
  and game_join_code_hash is not null;

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  purchase_code_id uuid not null references public.purchase_codes (id),
  staff_user_id uuid not null references public.staff_users (id),
  game_session_id uuid not null unique references public.game_sessions (id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint entitlements_status_check check (status in ('active', 'expired', 'revoked'))
);

create trigger set_entitlements_updated_at
before update on public.entitlements
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.entitlements is
  'Source of truth linking a teacher, redeemed purchase code, and game session.';

create index entitlements_purchase_code_id_idx
on public.entitlements (purchase_code_id);

create index entitlements_staff_user_id_idx
on public.entitlements (staff_user_id);

create index entitlements_status_idx
on public.entitlements (status);

create table public.game_settings (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null unique references public.game_sessions (id),
  difficulty_preset text not null default 'standard',
  attendance_window jsonb not null default '{}'::jsonb,
  business_market_window jsonb not null default '{}'::jsonb,
  stock_market_window jsonb not null default '{}'::jsonb,
  news_schedule jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint game_settings_difficulty_preset_not_blank check (length(btrim(difficulty_preset)) > 0)
);

create trigger set_game_settings_updated_at
before update on public.game_settings
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.game_settings is
  'Per-game configuration for simulation windows and difficulty. One settings row belongs to one game session.';

create table public.players (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  display_name text not null,
  roster_label text null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint players_game_session_id_id_unique unique (game_session_id, id),
  constraint players_display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint players_roster_label_not_blank check (
    roster_label is null
    or length(btrim(roster_label)) > 0
  ),
  constraint players_status_check check (status in ('active', 'archived', 'removed'))
);

create trigger set_players_updated_at
before update on public.players
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.players is
  'Internal player identity inside one game session. players.id is database-generated and is never a typed student code.';
comment on column public.players.game_session_id is
  'Game isolation boundary for the player.';
comment on column public.players.display_name is
  'Display names are not primary keys and do not need to be unique.';

create index players_game_session_id_idx
on public.players (game_session_id);

create index players_game_session_status_idx
on public.players (game_session_id, status);

create table public.player_access_credentials (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  normalized_student_code_hash text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz null,

  constraint player_access_credentials_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint player_access_credentials_code_hash_not_blank check (length(btrim(normalized_student_code_hash)) > 0),
  constraint player_access_credentials_status_check check (status in ('active', 'revoked')),
  constraint player_access_credentials_active_not_revoked check (
    status <> 'active'
    or revoked_at is null
  )
);

create trigger set_player_access_credentials_updated_at
before update on public.player_access_credentials
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.player_access_credentials is
  'Credential state for student login. Stores normalized student code hashes only, scoped to a game session and player.';
comment on column public.player_access_credentials.normalized_student_code_hash is
  'Hash of the normalized student code. Plaintext student codes must not be stored.';

create unique index player_access_credentials_active_code_idx
on public.player_access_credentials (game_session_id, normalized_student_code_hash)
where status = 'active';

create unique index player_access_credentials_active_player_idx
on public.player_access_credentials (game_session_id, player_id)
where status = 'active';

create index player_access_credentials_code_lookup_idx
on public.player_access_credentials (game_session_id, normalized_student_code_hash);

create index player_access_credentials_player_idx
on public.player_access_credentials (game_session_id, player_id);

create table public.player_sessions (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  session_token_hash text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null,

  constraint player_sessions_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint player_sessions_token_hash_not_blank check (length(btrim(session_token_hash)) > 0),
  constraint player_sessions_status_check check (status in ('active', 'expired', 'revoked')),
  constraint player_sessions_active_not_revoked check (
    status <> 'active'
    or revoked_at is null
  )
);

create trigger set_player_sessions_updated_at
before update on public.player_sessions
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.player_sessions is
  'Session state for player access. Session tokens are stored as hashes and resolve to exactly one game session and one player.';
comment on column public.player_sessions.session_token_hash is
  'Hash of the player session token. Plaintext session tokens must not be stored.';

create index player_sessions_player_idx
on public.player_sessions (game_session_id, player_id);

create index player_sessions_status_expires_at_idx
on public.player_sessions (status, expires_at);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid null,
  account_type text not null,
  amount numeric(14, 2) not null,
  currency_code text not null default 'ECO',
  entry_type text not null,
  source_domain text not null,
  source_action text not null,
  source_id uuid null,
  created_at timestamptz not null default now(),
  created_by_type text not null,
  created_by_id uuid null,

  constraint ledger_entries_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint ledger_entries_account_type_not_blank check (length(btrim(account_type)) > 0),
  constraint ledger_entries_amount_not_zero check (amount <> 0),
  constraint ledger_entries_currency_code_check check (
    currency_code = upper(currency_code)
    and length(currency_code) between 3 and 16
  ),
  constraint ledger_entries_entry_type_check check (entry_type in ('credit', 'debit', 'adjustment')),
  constraint ledger_entries_source_domain_not_blank check (length(btrim(source_domain)) > 0),
  constraint ledger_entries_source_action_not_blank check (length(btrim(source_action)) > 0),
  constraint ledger_entries_created_by_type_check check (created_by_type in ('staff_user', 'player', 'system'))
);

comment on table public.ledger_entries is
  'Append-only source of truth for money movement. All balance changes must flow through server-side ledger writes.';
comment on column public.ledger_entries.game_session_id is
  'Required game isolation boundary for every ledger entry.';
comment on column public.ledger_entries.player_id is
  'Present when the ledger entry belongs to a student/player account.';

create index ledger_entries_game_created_at_idx
on public.ledger_entries (game_session_id, created_at desc);

create index ledger_entries_player_created_at_idx
on public.ledger_entries (game_session_id, player_id, created_at desc);

create index ledger_entries_source_idx
on public.ledger_entries (source_domain, source_action, source_id);

create table public.account_balances (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id),
  player_id uuid not null,
  account_type text not null default 'cash',
  balance numeric(14, 2) not null default 0,
  currency_code text not null default 'ECO',
  last_ledger_entry_id uuid null references public.ledger_entries (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint account_balances_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id),
  constraint account_balances_scope_unique unique (game_session_id, player_id, account_type, currency_code),
  constraint account_balances_account_type_not_blank check (length(btrim(account_type)) > 0),
  constraint account_balances_currency_code_check check (
    currency_code = upper(currency_code)
    and length(currency_code) between 3 and 16
  )
);

create trigger set_account_balances_updated_at
before update on public.account_balances
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.account_balances is
  'Database-backed projection/cache of current balances. ledger_entries remains the source of truth.';
comment on column public.account_balances.last_ledger_entry_id is
  'Most recent ledger entry applied to this projection, when known.';

create index account_balances_last_ledger_entry_id_idx
on public.account_balances (last_ledger_entry_id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid null references public.game_sessions (id),
  actor_type text not null,
  actor_id uuid null,
  action text not null,
  target_type text not null,
  target_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint audit_log_actor_type_check check (actor_type in ('staff_user', 'player', 'system')),
  constraint audit_log_action_not_blank check (length(btrim(action)) > 0),
  constraint audit_log_target_type_not_blank check (length(btrim(target_type)) > 0)
);

comment on table public.audit_log is
  'Append-only audit trail for sensitive actions. Include game_session_id for game-scoped actions.';
comment on column public.audit_log.game_session_id is
  'Nullable only for global licensing/system events; game-scoped events must set it.';

create index audit_log_game_created_at_idx
on public.audit_log (game_session_id, created_at desc);

create index audit_log_actor_idx
on public.audit_log (actor_type, actor_id);

create index audit_log_target_idx
on public.audit_log (target_type, target_id);
