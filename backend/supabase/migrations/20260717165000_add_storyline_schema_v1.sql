begin;

-- Storyline schema foundation V1.
-- Adds data contracts for future story events, impacts, policies, and flags.
-- Notification tables already belong to add_story_notification_tables_v1.
-- This migration intentionally does not add
-- runners, frontend behavior, realtime channels, story content, or cash writes.

create table public.storylines (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint storylines_key_not_blank check (length(btrim(key)) > 0),
  constraint storylines_title_not_blank check (length(btrim(title)) > 0)
);

comment on table public.storylines is
  'Reusable storyline/campaign definitions. This is configuration only; story execution happens in future backend runner work.';
comment on column public.storylines.key is
  'Stable data key for a storyline. It must not encode player-specific state.';

create unique index storylines_key_lower_unique
on public.storylines (lower(key));

create index storylines_active_idx
on public.storylines (is_active);

create table public.storyline_events (
  id uuid primary key default gen_random_uuid(),
  storyline_id uuid not null references public.storylines (id) on delete cascade,
  event_key text not null,
  title text not null,
  description text not null default '',
  act integer not null default 1,
  sequence integer not null default 1,
  trigger_type text not null,
  scheduled_offset_seconds integer null,
  scheduled_at timestamptz null,
  scheduled_market_tick integer null,
  trigger_condition jsonb not null default '{}'::jsonb,
  reveal_payload jsonb not null default '{}'::jsonb,
  public_news_payload jsonb not null default '{}'::jsonb,
  player_rules jsonb not null default '[]'::jsonb,
  policy_payloads jsonb not null default '[]'::jsonb,
  flag_payloads jsonb not null default '[]'::jsonb,
  contract_unlock_payloads jsonb not null default '[]'::jsonb,
  priority text not null default 'normal',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint storyline_events_storyline_event_key_unique unique (storyline_id, event_key),
  constraint storyline_events_event_key_not_blank check (length(btrim(event_key)) > 0),
  constraint storyline_events_title_not_blank check (length(btrim(title)) > 0),
  constraint storyline_events_act_positive check (act > 0),
  constraint storyline_events_sequence_positive check (sequence > 0),
  constraint storyline_events_trigger_type_check check (
    trigger_type in (
      'elapsed_time',
      'wall_clock_time',
      'market_tick',
      'condition',
      'manual'
    )
  ),
  constraint storyline_events_scheduled_offset_non_negative check (
    scheduled_offset_seconds is null
    or scheduled_offset_seconds >= 0
  ),
  constraint storyline_events_scheduled_market_tick_non_negative check (
    scheduled_market_tick is null
    or scheduled_market_tick >= 0
  ),
  constraint storyline_events_elapsed_time_schedule_check check (
    trigger_type <> 'elapsed_time'
    or scheduled_offset_seconds is not null
  ),
  constraint storyline_events_wall_clock_schedule_check check (
    trigger_type <> 'wall_clock_time'
    or scheduled_at is not null
  ),
  constraint storyline_events_market_tick_schedule_check check (
    trigger_type <> 'market_tick'
    or scheduled_market_tick is not null
  ),
  constraint storyline_events_condition_trigger_check check (
    trigger_type <> 'condition'
    or trigger_condition <> '{}'::jsonb
  ),
  constraint storyline_events_trigger_condition_object check (
    jsonb_typeof(trigger_condition) = 'object'
  ),
  constraint storyline_events_reveal_payload_object check (
    jsonb_typeof(reveal_payload) = 'object'
  ),
  constraint storyline_events_public_news_payload_object check (
    jsonb_typeof(public_news_payload) = 'object'
  ),
  constraint storyline_events_player_rules_array check (
    jsonb_typeof(player_rules) = 'array'
  ),
  constraint storyline_events_policy_payloads_array check (
    jsonb_typeof(policy_payloads) = 'array'
  ),
  constraint storyline_events_flag_payloads_array check (
    jsonb_typeof(flag_payloads) = 'array'
  ),
  constraint storyline_events_contract_unlock_payloads_array check (
    jsonb_typeof(contract_unlock_payloads) = 'array'
  ),
  constraint storyline_events_priority_check check (
    priority in ('low', 'normal', 'major', 'critical')
  )
);

comment on table public.storyline_events is
  'Configured events inside a storyline. Events are data-driven and must be resolved idempotently by future runner code.';
comment on column public.storyline_events.reveal_payload is
  'Cutscene/notification metadata. Delivery state belongs in notification_deliveries, not public realtime.';
comment on column public.storyline_events.public_news_payload is
  'Payload intended to map to the existing market news creation contract in a future runner slice.';
comment on column public.storyline_events.player_rules is
  'Condition/effect rules evaluated against backend player state at event resolution time.';

create index storyline_events_storyline_sequence_idx
on public.storyline_events (storyline_id, act, sequence);

create index storyline_events_active_trigger_idx
on public.storyline_events (is_active, trigger_type);

create table public.game_session_storylines (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  storyline_id uuid not null references public.storylines (id),
  status text not null default 'active',
  story_started_at timestamptz not null default now(),
  paused_at timestamptz null,
  accumulated_pause_seconds integer not null default 0,
  time_scale numeric(12, 6) not null default 1,
  created_at timestamptz not null default now(),

  constraint game_session_storylines_scope_unique unique (game_session_id, storyline_id),
  constraint game_session_storylines_status_check check (
    status in ('active', 'paused', 'completed', 'cancelled')
  ),
  constraint game_session_storylines_pause_seconds_non_negative check (
    accumulated_pause_seconds >= 0
  ),
  constraint game_session_storylines_time_scale_positive check (time_scale > 0)
);

comment on table public.game_session_storylines is
  'Activation state for a storyline in one game session. The game_session_id is the isolation boundary.';

create index game_session_storylines_status_idx
on public.game_session_storylines (game_session_id, status);

create table public.story_event_resolutions (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  storyline_event_id uuid not null references public.storyline_events (id),
  resolved_at timestamptz not null default now(),
  resolved_market_tick integer null,
  status text not null default 'resolved',
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint story_event_resolutions_scope_unique unique (game_session_id, storyline_event_id),
  constraint story_event_resolutions_market_tick_non_negative check (
    resolved_market_tick is null
    or resolved_market_tick >= 0
  ),
  constraint story_event_resolutions_status_check check (
    status in ('resolved', 'skipped', 'failed')
  ),
  constraint story_event_resolutions_result_payload_object check (
    jsonb_typeof(result_payload) = 'object'
  )
);

comment on table public.story_event_resolutions is
  'Idempotency guard for story event resolution. A story event must not apply twice in the same game session.';

create index story_event_resolutions_event_idx
on public.story_event_resolutions (storyline_event_id, status);

create table public.player_story_impacts (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  player_id uuid not null,
  storyline_event_id uuid not null references public.storyline_events (id),
  effect_type text not null,
  impact_label text not null,
  impact_reason text not null,
  amount numeric(18, 4) null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint player_story_impacts_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id)
    on delete cascade,
  constraint player_story_impacts_effect_type_not_blank check (length(btrim(effect_type)) > 0),
  constraint player_story_impacts_impact_label_not_blank check (length(btrim(impact_label)) > 0),
  constraint player_story_impacts_impact_reason_not_blank check (length(btrim(impact_reason)) > 0),
  constraint player_story_impacts_payload_object check (jsonb_typeof(payload) = 'object')
);

comment on table public.player_story_impacts is
  'Durable per-player explanations for story consequences. This table supports future "why did this happen to me" UI.';

create index player_story_impacts_player_created_idx
on public.player_story_impacts (game_session_id, player_id, created_at desc);

create index player_story_impacts_event_idx
on public.player_story_impacts (storyline_event_id);

create table public.game_session_policies (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  policy_key text not null,
  policy_type text not null,
  scope_type text not null,
  scope_key text null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz null,
  payload jsonb not null default '{}'::jsonb,
  source_story_event_id uuid null references public.storyline_events (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint game_session_policies_scope_unique unique (game_session_id, policy_key),
  constraint game_session_policies_policy_key_not_blank check (length(btrim(policy_key)) > 0),
  constraint game_session_policies_policy_type_check check (
    policy_type in (
      'immigration_lock',
      'tax_modifier',
      'store_price_modifier',
      'contract_reward_modifier',
      'resource_restriction',
      'market_status_policy'
    )
  ),
  constraint game_session_policies_scope_type_not_blank check (length(btrim(scope_type)) > 0),
  constraint game_session_policies_scope_key_not_blank check (
    scope_key is null
    or length(btrim(scope_key)) > 0
  ),
  constraint game_session_policies_expiration_valid check (
    expires_at is null
    or expires_at >= starts_at
  ),
  constraint game_session_policies_payload_object check (jsonb_typeof(payload) = 'object')
);

comment on table public.game_session_policies is
  'Temporary or durable game-session-scoped policies created by story events. Enforcement is deferred to future gameplay slices.';

create index game_session_policies_active_scope_idx
on public.game_session_policies (
  game_session_id,
  is_active,
  policy_type,
  scope_type,
  scope_key
);

create index game_session_policies_source_event_idx
on public.game_session_policies (source_story_event_id);

create table public.game_session_story_flags (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  flag_key text not null,
  value jsonb not null default 'true'::jsonb,
  source_story_event_id uuid null references public.storyline_events (id),
  created_at timestamptz not null default now(),

  constraint game_session_story_flags_scope_unique unique (game_session_id, flag_key),
  constraint game_session_story_flags_flag_key_not_blank check (length(btrim(flag_key)) > 0)
);

comment on table public.game_session_story_flags is
  'Durable game-session story flags for future event conditions. Flags are scoped to one game session.';

create index game_session_story_flags_source_event_idx
on public.game_session_story_flags (source_story_event_id);

alter table public.storylines enable row level security;
alter table public.storyline_events enable row level security;
alter table public.game_session_storylines enable row level security;
alter table public.story_event_resolutions enable row level security;
alter table public.player_story_impacts enable row level security;
alter table public.game_session_policies enable row level security;
alter table public.game_session_story_flags enable row level security;

-- No authenticated direct policies are added in this foundation slice.
-- Custom player sessions are not Supabase Auth identities, and story runtime
-- writes must be owned by trusted service-role backend code in future phases.

commit;
