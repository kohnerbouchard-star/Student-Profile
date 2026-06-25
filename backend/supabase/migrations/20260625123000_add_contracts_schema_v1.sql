-- Contracts schema foundation V1.
-- Adds reusable templates, live game-session contracts, and per-player progress
-- state. This migration intentionally does not add handlers, repositories,
-- storyline runner wiring, reward issuance, or gameplay mutations.

create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  title text not null,
  description text not null,
  instructions text not null,
  category text not null,
  difficulty text not null,
  estimated_duration_minutes integer null,
  requirements_payload jsonb not null default '{}'::jsonb,
  reward_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint contract_templates_template_key_not_blank check (length(btrim(template_key)) > 0),
  constraint contract_templates_title_not_blank check (length(btrim(title)) > 0),
  constraint contract_templates_description_not_blank check (length(btrim(description)) > 0),
  constraint contract_templates_instructions_not_blank check (length(btrim(instructions)) > 0),
  constraint contract_templates_category_not_blank check (length(btrim(category)) > 0),
  constraint contract_templates_difficulty_not_blank check (length(btrim(difficulty)) > 0),
  constraint contract_templates_estimated_duration_non_negative check (
    estimated_duration_minutes is null
    or estimated_duration_minutes >= 0
  ),
  constraint contract_templates_requirements_payload_object check (
    jsonb_typeof(requirements_payload) = 'object'
  ),
  constraint contract_templates_reward_payload_object check (
    jsonb_typeof(reward_payload) = 'object'
  ),
  constraint contract_templates_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  )
);

create trigger set_contract_templates_updated_at
before update on public.contract_templates
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.contract_templates is
  'Reusable contract definitions for system presets, teacher-authored templates, and future story event templates.';
comment on column public.contract_templates.template_key is
  'Stable reusable contract key. Live game-session contracts copy template data before publication.';
comment on column public.contract_templates.requirements_payload is
  'Data-only requirement definition placeholder. Execution is deferred to future contract runtime work.';
comment on column public.contract_templates.reward_payload is
  'Data-only reward definition placeholder. Rewards are not issued by this foundation slice.';

create unique index contract_templates_template_key_lower_unique
on public.contract_templates (lower(template_key));

create table public.game_session_contracts (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  contract_template_id uuid null references public.contract_templates (id) on delete set null,
  contract_key text not null,
  source_type text not null,
  source_id uuid null,
  created_by_staff_id uuid null references public.staff_users (id) on delete set null,
  title text not null,
  description text not null,
  instructions text not null,
  category text not null default 'general',
  status text not null default 'draft',
  visibility text not null default 'public',
  targeting_payload jsonb not null default '{}'::jsonb,
  requirements_payload jsonb not null default '{}'::jsonb,
  reward_payload jsonb not null default '{}'::jsonb,
  completion_mode text not null default 'manual_review',
  published_at timestamptz null,
  deadline_at timestamptz null,
  expires_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint game_session_contracts_game_session_id_id_unique unique (game_session_id, id),
  constraint game_session_contracts_scope_key_unique unique (game_session_id, contract_key),
  constraint game_session_contracts_contract_key_not_blank check (length(btrim(contract_key)) > 0),
  constraint game_session_contracts_title_not_blank check (length(btrim(title)) > 0),
  constraint game_session_contracts_description_not_blank check (length(btrim(description)) > 0),
  constraint game_session_contracts_instructions_not_blank check (length(btrim(instructions)) > 0),
  constraint game_session_contracts_category_not_blank check (length(btrim(category)) > 0),
  constraint game_session_contracts_source_type_check check (
    source_type in ('teacher', 'system', 'story_event')
  ),
  constraint game_session_contracts_status_check check (
    status in (
      'draft',
      'scheduled',
      'active',
      'paused',
      'completed',
      'expired',
      'archived'
    )
  ),
  constraint game_session_contracts_visibility_check check (
    visibility in ('public', 'targeted', 'hidden')
  ),
  constraint game_session_contracts_targeting_payload_object check (
    jsonb_typeof(targeting_payload) = 'object'
  ),
  constraint game_session_contracts_requirements_payload_object check (
    jsonb_typeof(requirements_payload) = 'object'
  ),
  constraint game_session_contracts_reward_payload_object check (
    jsonb_typeof(reward_payload) = 'object'
  ),
  constraint game_session_contracts_completion_mode_check check (
    completion_mode in (
      'manual_review',
      'auto_check',
      'attendance_scan',
      'purchase_check',
      'stock_trade_check',
      'story_flag_check'
    )
  ),
  constraint game_session_contracts_metadata_object check (
    jsonb_typeof(metadata) = 'object'
  )
);

create trigger set_game_session_contracts_updated_at
before update on public.game_session_contracts
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.game_session_contracts is
  'Live contract postings scoped to one game session. Teacher, system, and story-event sources share this model.';
comment on column public.game_session_contracts.source_type is
  'Origin of the live contract: teacher, system, or story_event.';
comment on column public.game_session_contracts.targeting_payload is
  'Targeting placeholder for all players, countries, player ids, roster labels, and future story flag conditions.';
comment on column public.game_session_contracts.requirements_payload is
  'Data-only completion requirement placeholder. This table does not execute requirements.';
comment on column public.game_session_contracts.reward_payload is
  'Data-only reward placeholder. This table does not issue rewards or mutate player state.';

create index game_session_contracts_game_session_status_idx
on public.game_session_contracts (game_session_id, status);

create index game_session_contracts_game_session_source_type_idx
on public.game_session_contracts (game_session_id, source_type);

create table public.player_contract_progress (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  contract_id uuid not null references public.game_session_contracts (id) on delete cascade,
  player_id uuid not null,
  status text not null default 'available',
  evidence_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  submitted_at timestamptz null,
  completed_at timestamptz null,
  reward_issued_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint player_contract_progress_contract_scope_fk
    foreign key (game_session_id, contract_id)
    references public.game_session_contracts (game_session_id, id)
    on delete cascade,
  constraint player_contract_progress_player_scope_fk
    foreign key (game_session_id, player_id)
    references public.players (game_session_id, id)
    on delete cascade,
  constraint player_contract_progress_scope_unique unique (
    game_session_id,
    contract_id,
    player_id
  ),
  constraint player_contract_progress_status_check check (
    status in (
      'available',
      'in_progress',
      'submitted',
      'completed',
      'failed',
      'expired',
      'dismissed'
    )
  ),
  constraint player_contract_progress_evidence_payload_object check (
    jsonb_typeof(evidence_payload) = 'object'
  ),
  constraint player_contract_progress_result_payload_object check (
    jsonb_typeof(result_payload) = 'object'
  )
);

create trigger set_player_contract_progress_updated_at
before update on public.player_contract_progress
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.player_contract_progress is
  'Per-player state for one live game-session contract. Reward issuance remains a future backend action.';
comment on column public.player_contract_progress.evidence_payload is
  'Player-submitted or backend-collected evidence placeholder. It is not interpreted by this foundation slice.';
comment on column public.player_contract_progress.result_payload is
  'Review/check result placeholder. It does not mutate cash, inventory, ledger, stocks, or player state.';

create index player_contract_progress_player_status_idx
on public.player_contract_progress (game_session_id, player_id, status);

-- The player_contract_progress_scope_unique constraint provides the required
-- (game_session_id, contract_id, player_id) lookup index.

alter table public.contract_templates enable row level security;
alter table public.game_session_contracts enable row level security;
alter table public.player_contract_progress enable row level security;

-- No authenticated direct policies are added in this foundation slice.
-- Custom player sessions are not Supabase Auth identities, and contract writes
-- must be owned by trusted service-role backend code in future phases.
