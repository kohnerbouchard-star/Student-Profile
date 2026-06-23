-- Stock market schema foundation V1.
-- Adds global stock templates and game-session-scoped runtime market tables.
--
-- This migration intentionally adds schema only. It does not add routes, RPCs,
-- runner logic, frontend calls, trading execution, portfolio accounting, order
-- fills, ledger writes, seed data, or Cloudflare changes.

create table public.stock_templates (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  company_name text not null,
  sector_key text not null,
  country_code text not null,
  description text null,
  base_price numeric(18, 4) not null,
  beta numeric(10, 4) not null,
  liquidity numeric(10, 4) not null,
  long_run_volatility numeric(12, 6) not null,
  shares_outstanding numeric(20, 4) null,
  fundamentals jsonb not null default '{}'::jsonb,
  country_exposure jsonb not null default '{}'::jsonb,
  sector_exposure jsonb not null default '{}'::jsonb,
  commodity_exposure jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint stock_templates_ticker_not_blank check (length(btrim(ticker)) > 0),
  constraint stock_templates_company_name_not_blank check (length(btrim(company_name)) > 0),
  constraint stock_templates_sector_key_not_blank check (length(btrim(sector_key)) > 0),
  constraint stock_templates_country_code_check check (
    country_code in (
      'NORTHREACH',
      'YRETHIA',
      'THALORIS',
      'SOLVEND',
      'ELDORAN',
      'VALERION',
      'LUMENOR',
      'XALVORIA',
      'DRAVENLOK',
      'SYNDALIS'
    )
  ),
  constraint stock_templates_description_not_blank check (
    description is null
    or length(btrim(description)) > 0
  ),
  constraint stock_templates_base_price_positive check (base_price > 0),
  constraint stock_templates_beta_non_negative check (beta >= 0),
  constraint stock_templates_liquidity_non_negative check (liquidity >= 0),
  constraint stock_templates_long_run_volatility_positive check (long_run_volatility > 0),
  constraint stock_templates_shares_outstanding_positive check (
    shares_outstanding is null
    or shares_outstanding > 0
  ),
  constraint stock_templates_fundamentals_object check (jsonb_typeof(fundamentals) = 'object'),
  constraint stock_templates_country_exposure_object check (jsonb_typeof(country_exposure) = 'object'),
  constraint stock_templates_sector_exposure_object check (jsonb_typeof(sector_exposure) = 'object'),
  constraint stock_templates_commodity_exposure_object check (jsonb_typeof(commodity_exposure) = 'object')
);

create trigger set_stock_templates_updated_at
before update on public.stock_templates
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.stock_templates is
  'Global reference stock templates that can seed per-game stock assets. Templates are not runtime price state.';
comment on column public.stock_templates.ticker is
  'Reference ticker label. Runtime games copy this into game_session_stock_assets and isolate prices by game_session_id.';
comment on column public.stock_templates.country_code is
  'Official Eco Novaria country code from docs/worldbuilding/econovaria-country-lore-v1.md.';

create unique index stock_templates_ticker_lower_unique
on public.stock_templates (lower(ticker));

create index stock_templates_active_idx
on public.stock_templates (is_active);

create index stock_templates_country_sector_idx
on public.stock_templates (country_code, sector_key);

create table public.game_session_stock_assets (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  template_id uuid null references public.stock_templates (id) on delete set null,
  ticker text not null,
  company_name text not null,
  sector_key text not null,
  country_code text not null,
  description text null,
  current_price numeric(18, 4) not null,
  previous_close numeric(18, 4) not null,
  open_price numeric(18, 4) not null,
  day_high numeric(18, 4) not null,
  day_low numeric(18, 4) not null,
  market_cap numeric(20, 4) null,
  shares_outstanding numeric(20, 4) null,
  beta numeric(10, 4) not null,
  liquidity numeric(10, 4) not null,
  current_volatility numeric(12, 6) not null,
  long_run_volatility numeric(12, 6) not null,
  fair_value_anchor numeric(18, 4) null,
  recent_returns jsonb not null default '[]'::jsonb,
  chart_history jsonb not null default '[]'::jsonb,
  fundamentals jsonb not null default '{}'::jsonb,
  country_exposure jsonb not null default '{}'::jsonb,
  sector_exposure jsonb not null default '{}'::jsonb,
  commodity_exposure jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint game_session_stock_assets_game_session_id_id_unique unique (game_session_id, id),
  constraint game_session_stock_assets_ticker_unique unique (game_session_id, ticker),
  constraint game_session_stock_assets_ticker_not_blank check (length(btrim(ticker)) > 0),
  constraint game_session_stock_assets_company_name_not_blank check (length(btrim(company_name)) > 0),
  constraint game_session_stock_assets_sector_key_not_blank check (length(btrim(sector_key)) > 0),
  constraint game_session_stock_assets_country_code_check check (
    country_code in (
      'NORTHREACH',
      'YRETHIA',
      'THALORIS',
      'SOLVEND',
      'ELDORAN',
      'VALERION',
      'LUMENOR',
      'XALVORIA',
      'DRAVENLOK',
      'SYNDALIS'
    )
  ),
  constraint game_session_stock_assets_description_not_blank check (
    description is null
    or length(btrim(description)) > 0
  ),
  constraint game_session_stock_assets_prices_positive check (
    current_price > 0
    and previous_close > 0
    and open_price > 0
    and day_high > 0
    and day_low > 0
  ),
  constraint game_session_stock_assets_day_range_valid check (day_low <= day_high),
  constraint game_session_stock_assets_current_price_in_day_range check (
    current_price >= day_low
    and current_price <= day_high
  ),
  constraint game_session_stock_assets_market_cap_positive check (
    market_cap is null
    or market_cap > 0
  ),
  constraint game_session_stock_assets_shares_outstanding_positive check (
    shares_outstanding is null
    or shares_outstanding > 0
  ),
  constraint game_session_stock_assets_beta_non_negative check (beta >= 0),
  constraint game_session_stock_assets_liquidity_non_negative check (liquidity >= 0),
  constraint game_session_stock_assets_current_volatility_positive check (current_volatility > 0),
  constraint game_session_stock_assets_long_run_volatility_positive check (long_run_volatility > 0),
  constraint game_session_stock_assets_fair_value_anchor_positive check (
    fair_value_anchor is null
    or fair_value_anchor > 0
  ),
  constraint game_session_stock_assets_recent_returns_array check (jsonb_typeof(recent_returns) = 'array'),
  constraint game_session_stock_assets_chart_history_array check (jsonb_typeof(chart_history) = 'array'),
  constraint game_session_stock_assets_fundamentals_object check (jsonb_typeof(fundamentals) = 'object'),
  constraint game_session_stock_assets_country_exposure_object check (jsonb_typeof(country_exposure) = 'object'),
  constraint game_session_stock_assets_sector_exposure_object check (jsonb_typeof(sector_exposure) = 'object'),
  constraint game_session_stock_assets_commodity_exposure_object check (jsonb_typeof(commodity_exposure) = 'object')
);

create trigger set_game_session_stock_assets_updated_at
before update on public.game_session_stock_assets
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.game_session_stock_assets is
  'Authoritative runtime stock assets for one game session. Same ticker labels in different games are separate assets with separate prices.';
comment on column public.game_session_stock_assets.game_session_id is
  'Game isolation boundary. Runtime stock prices, volatility, and history never cross game sessions.';
comment on column public.game_session_stock_assets.template_id is
  'Optional global template copied to create this per-game runtime stock asset.';

create unique index game_session_stock_assets_ticker_lower_unique
on public.game_session_stock_assets (game_session_id, lower(ticker));

create index game_session_stock_assets_active_idx
on public.game_session_stock_assets (game_session_id, is_active);

create index game_session_stock_assets_country_sector_idx
on public.game_session_stock_assets (game_session_id, country_code, sector_key);

create index game_session_stock_assets_template_id_idx
on public.game_session_stock_assets (template_id);

create table public.stock_price_ticks (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  stock_asset_id uuid not null,
  tick_index integer not null,
  ticker text not null,
  price numeric(18, 4) not null,
  previous_price numeric(18, 4) not null,
  log_return numeric(18, 8) not null,
  change_pct numeric(12, 6) not null,
  volume bigint not null,
  current_volatility numeric(12, 6) not null,
  long_run_volatility numeric(12, 6) not null,
  explanation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint stock_price_ticks_asset_scope_fk
    foreign key (game_session_id, stock_asset_id)
    references public.game_session_stock_assets (game_session_id, id)
    on delete cascade,
  constraint stock_price_ticks_scope_unique unique (game_session_id, stock_asset_id, tick_index),
  constraint stock_price_ticks_tick_index_non_negative check (tick_index >= 0),
  constraint stock_price_ticks_ticker_not_blank check (length(btrim(ticker)) > 0),
  constraint stock_price_ticks_prices_positive check (
    price > 0
    and previous_price > 0
  ),
  constraint stock_price_ticks_volume_non_negative check (volume >= 0),
  constraint stock_price_ticks_current_volatility_positive check (current_volatility > 0),
  constraint stock_price_ticks_long_run_volatility_positive check (long_run_volatility > 0),
  constraint stock_price_ticks_explanation_object check (jsonb_typeof(explanation) = 'object')
);

comment on table public.stock_price_ticks is
  'Append-only authoritative price tick history for game-session-scoped stock assets.';
comment on column public.stock_price_ticks.stock_asset_id is
  'References the per-game stock asset; paired with game_session_id to prevent cross-game tick leakage.';
comment on column public.stock_price_ticks.explanation is
  'Movement explanation and component breakdown returned by the pure stock market engine.';

create index stock_price_ticks_game_tick_idx
on public.stock_price_ticks (game_session_id, tick_index);

create index stock_price_ticks_asset_tick_desc_idx
on public.stock_price_ticks (game_session_id, stock_asset_id, tick_index desc);

create index stock_price_ticks_ticker_tick_desc_idx
on public.stock_price_ticks (game_session_id, ticker, tick_index desc);

create table public.stock_market_events (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  shock_id text not null,
  scope text not null,
  target_key text null,
  magnitude numeric(12, 6) not null,
  decay numeric(10, 6) not null,
  confidence numeric(10, 6) not null,
  volatility_impact numeric(12, 6) null,
  volume_impact numeric(12, 6) null,
  headline text not null,
  explanation text not null,
  created_tick integer not null,
  expires_tick integer null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint stock_market_events_shock_unique unique (game_session_id, shock_id),
  constraint stock_market_events_scope_check check (scope in ('global', 'country', 'sector', 'ticker')),
  constraint stock_market_events_shock_id_not_blank check (length(btrim(shock_id)) > 0),
  constraint stock_market_events_target_key_not_blank check (
    target_key is null
    or length(btrim(target_key)) > 0
  ),
  constraint stock_market_events_headline_not_blank check (length(btrim(headline)) > 0),
  constraint stock_market_events_explanation_not_blank check (length(btrim(explanation)) > 0),
  constraint stock_market_events_created_tick_non_negative check (created_tick >= 0),
  constraint stock_market_events_expires_tick_valid check (
    expires_tick is null
    or expires_tick >= created_tick
  ),
  constraint stock_market_events_decay_range check (decay >= 0 and decay <= 1),
  constraint stock_market_events_confidence_range check (confidence >= 0 and confidence <= 1)
);

create trigger set_stock_market_events_updated_at
before update on public.stock_market_events
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.stock_market_events is
  'Game-session-scoped market events and shocks for a future runner to feed into the pure stock market engine.';
comment on column public.stock_market_events.shock_id is
  'Stable per-game shock identifier. Unique only inside one game session.';

create index stock_market_events_active_idx
on public.stock_market_events (game_session_id, is_active);

create index stock_market_events_scope_target_idx
on public.stock_market_events (game_session_id, scope, target_key);

create index stock_market_events_tick_window_idx
on public.stock_market_events (game_session_id, created_tick, expires_tick);

create table public.stock_market_regimes (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions (id) on delete cascade,
  regime text not null,
  starts_tick integer not null,
  ends_tick integer null,
  drift_bias numeric(12, 6) not null,
  volatility_multiplier numeric(12, 6) not null,
  news_sensitivity numeric(12, 6) not null,
  volume_multiplier numeric(12, 6) not null,
  beta_multiplier numeric(12, 6) null,
  sector_rotation jsonb not null default '{}'::jsonb,
  student_label text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint stock_market_regimes_regime_check check (
    regime in ('bull', 'bear', 'sideways', 'crisis', 'recovery', 'sector_rotation')
  ),
  constraint stock_market_regimes_starts_tick_non_negative check (starts_tick >= 0),
  constraint stock_market_regimes_ends_tick_valid check (
    ends_tick is null
    or ends_tick >= starts_tick
  ),
  constraint stock_market_regimes_volatility_multiplier_positive check (volatility_multiplier > 0),
  constraint stock_market_regimes_news_sensitivity_positive check (news_sensitivity > 0),
  constraint stock_market_regimes_volume_multiplier_positive check (volume_multiplier > 0),
  constraint stock_market_regimes_beta_multiplier_positive check (
    beta_multiplier is null
    or beta_multiplier > 0
  ),
  constraint stock_market_regimes_sector_rotation_object check (jsonb_typeof(sector_rotation) = 'object'),
  constraint stock_market_regimes_student_label_not_blank check (
    student_label is null
    or length(btrim(student_label)) > 0
  )
);

create trigger set_stock_market_regimes_updated_at
before update on public.stock_market_regimes
for each row
execute function public.set_current_timestamp_updated_at();

comment on table public.stock_market_regimes is
  'Game-session-scoped stock market regime schedule/state for a future runner to feed into the pure stock market engine.';
comment on column public.stock_market_regimes.sector_rotation is
  'Optional per-sector drift adjustments for sector-rotation regimes.';

create index stock_market_regimes_active_idx
on public.stock_market_regimes (game_session_id, is_active);

create index stock_market_regimes_tick_window_idx
on public.stock_market_regimes (game_session_id, starts_tick, ends_tick);

alter table public.stock_templates enable row level security;
alter table public.game_session_stock_assets enable row level security;
alter table public.stock_price_ticks enable row level security;
alter table public.stock_market_events enable row level security;
alter table public.stock_market_regimes enable row level security;

-- No authenticated direct policies are added for these V2 stock market tables.
-- Custom player sessions are not Supabase Auth identities, and stock runtime
-- writes must be owned by trusted service-role backend code in future runner,
-- route, and trading phases.
