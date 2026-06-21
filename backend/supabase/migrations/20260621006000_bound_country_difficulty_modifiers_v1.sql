-- Bound country difficulty modifier values V1.
-- Prevents custom Advanced Settings from saving extreme modifier values that would destabilize pricing, events, income, trade, or credit systems.

alter table public.game_difficulty_policy_settings
  add constraint game_difficulty_policy_settings_price_modifier_range
  check (price_modifier >= 0.5000 and price_modifier <= 2.0000);

alter table public.game_difficulty_policy_settings
  add constraint game_difficulty_policy_settings_event_volatility_modifier_range
  check (event_volatility_modifier >= 0.5000 and event_volatility_modifier <= 2.0000);

alter table public.game_difficulty_policy_settings
  add constraint game_difficulty_policy_settings_scarcity_modifier_range
  check (scarcity_modifier >= 0.5000 and scarcity_modifier <= 2.0000);

alter table public.game_difficulty_policy_settings
  add constraint game_difficulty_policy_settings_income_modifier_range
  check (income_modifier >= 0.5000 and income_modifier <= 2.0000);

alter table public.game_difficulty_policy_settings
  add constraint game_difficulty_policy_settings_trade_modifier_range
  check (trade_modifier >= 0.5000 and trade_modifier <= 2.0000);

alter table public.game_difficulty_policy_settings
  add constraint game_difficulty_policy_settings_credit_modifier_range
  check (credit_modifier >= 0.5000 and credit_modifier <= 2.0000);

alter table public.difficulty_policy_profiles
  add constraint difficulty_policy_profiles_price_modifier_range
  check (price_modifier >= 0.5000 and price_modifier <= 2.0000);

alter table public.difficulty_policy_profiles
  add constraint difficulty_policy_profiles_event_volatility_modifier_range
  check (event_volatility_modifier >= 0.5000 and event_volatility_modifier <= 2.0000);

alter table public.difficulty_policy_profiles
  add constraint difficulty_policy_profiles_scarcity_modifier_range
  check (scarcity_modifier >= 0.5000 and scarcity_modifier <= 2.0000);

alter table public.difficulty_policy_profiles
  add constraint difficulty_policy_profiles_income_modifier_range
  check (income_modifier >= 0.5000 and income_modifier <= 2.0000);

alter table public.difficulty_policy_profiles
  add constraint difficulty_policy_profiles_trade_modifier_range
  check (trade_modifier >= 0.5000 and trade_modifier <= 2.0000);

alter table public.difficulty_policy_profiles
  add constraint difficulty_policy_profiles_credit_modifier_range
  check (credit_modifier >= 0.5000 and credit_modifier <= 2.0000);

alter table public.country_economic_snapshots
  add constraint country_economic_snapshots_price_difficulty_modifier_range
  check (price_difficulty_modifier >= 0.5000 and price_difficulty_modifier <= 2.0000);

alter table public.country_economic_snapshots
  add constraint country_economic_snapshots_event_volatility_modifier_range
  check (event_volatility_modifier >= 0.5000 and event_volatility_modifier <= 2.0000);

alter table public.country_economic_snapshots
  add constraint country_economic_snapshots_scarcity_difficulty_modifier_range
  check (scarcity_difficulty_modifier >= 0.5000 and scarcity_difficulty_modifier <= 2.0000);

alter table public.country_economic_snapshots
  add constraint country_economic_snapshots_income_difficulty_modifier_range
  check (income_difficulty_modifier >= 0.5000 and income_difficulty_modifier <= 2.0000);

alter table public.country_economic_snapshots
  add constraint country_economic_snapshots_trade_difficulty_modifier_range
  check (trade_difficulty_modifier >= 0.5000 and trade_difficulty_modifier <= 2.0000);

alter table public.country_economic_snapshots
  add constraint country_economic_snapshots_credit_difficulty_modifier_range
  check (credit_difficulty_modifier >= 0.5000 and credit_difficulty_modifier <= 2.0000);

comment on table public.game_difficulty_policy_settings is
  'Backend-owned per-game Advanced Settings difficulty policy. Modifier values are bounded from 0.5000 to 2.0000 so custom games cannot destabilize pricing, events, income, trade, or credit systems.';
