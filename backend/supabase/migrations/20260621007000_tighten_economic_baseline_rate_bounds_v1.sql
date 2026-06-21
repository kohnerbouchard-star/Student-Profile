-- Tighten economic baseline rate bounds V1.
-- Deflation is economically valid, but large negative inflation is too severe for custom game setup.
-- Negative nominal policy rates exist in real-world monetary policy, but they are an advanced edge case, so custom baseline interest rates are non-negative for V1.

alter table public.game_country_economic_baseline_settings
  drop constraint if exists game_country_economic_baseline_settings_inflation_range;

alter table public.game_country_economic_baseline_settings
  add constraint game_country_economic_baseline_settings_inflation_range
  check (inflation_rate >= -0.0500 and inflation_rate <= 0.5000);

alter table public.game_country_economic_baseline_settings
  drop constraint if exists game_country_economic_baseline_settings_interest_range;

alter table public.game_country_economic_baseline_settings
  add constraint game_country_economic_baseline_settings_interest_range
  check (interest_rate >= 0 and interest_rate <= 0.5000);

comment on column public.game_country_economic_baseline_settings.inflation_rate is
  'Starting country inflation rate for initialized snapshots. Example: 0.075 means 7.5%. Bounded from -5% to 50%; negative values represent deflation.';
comment on column public.game_country_economic_baseline_settings.interest_rate is
  'Starting interest rate for initialized snapshots. Example: 0.05 means 5%. Bounded from 0% to 50% for V1 custom game setup.';
