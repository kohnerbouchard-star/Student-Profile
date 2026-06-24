-- Initial simulation FX rates for the active smoke-test game session.
-- No ECO. Country currencies only.
-- Formula: amount_in_to_currency = amount_in_from_currency * rate.

INSERT INTO public.currency_exchange_rates (
  game_session_id,
  from_currency_code,
  to_currency_code,
  rate,
  source,
  effective_at
)
VALUES
  ('50b44055-4958-441c-81b5-851d79214cd6', 'VAL', 'SYN', 1.12000000, 'seed', now()),
  ('50b44055-4958-441c-81b5-851d79214cd6', 'SYN', 'VAL', 0.89285714, 'seed', now()),

  ('50b44055-4958-441c-81b5-851d79214cd6', 'VAL', 'NRC', 0.94000000, 'seed', now()),
  ('50b44055-4958-441c-81b5-851d79214cd6', 'NRC', 'VAL', 1.06382979, 'seed', now()),

  ('50b44055-4958-441c-81b5-851d79214cd6', 'VAL', 'YRC', 1.03000000, 'seed', now()),
  ('50b44055-4958-441c-81b5-851d79214cd6', 'YRC', 'VAL', 0.97087379, 'seed', now()),

  ('50b44055-4958-441c-81b5-851d79214cd6', 'VAL', 'THD', 1.48000000, 'seed', now()),
  ('50b44055-4958-441c-81b5-851d79214cd6', 'THD', 'VAL', 0.67567568, 'seed', now()),

  ('50b44055-4958-441c-81b5-851d79214cd6', 'VAL', 'SLV', 0.78000000, 'seed', now()),
  ('50b44055-4958-441c-81b5-851d79214cd6', 'SLV', 'VAL', 1.28205128, 'seed', now()),

  ('50b44055-4958-441c-81b5-851d79214cd6', 'VAL', 'ELD', 1.01000000, 'seed', now()),
  ('50b44055-4958-441c-81b5-851d79214cd6', 'ELD', 'VAL', 0.99009901, 'seed', now()),

  ('50b44055-4958-441c-81b5-851d79214cd6', 'VAL', 'MRV', 1.36000000, 'seed', now()),
  ('50b44055-4958-441c-81b5-851d79214cd6', 'MRV', 'VAL', 0.73529412, 'seed', now()),

  ('50b44055-4958-441c-81b5-851d79214cd6', 'VAL', 'KAI', 1.24000000, 'seed', now()),
  ('50b44055-4958-441c-81b5-851d79214cd6', 'KAI', 'VAL', 0.80645161, 'seed', now()),

  ('50b44055-4958-441c-81b5-851d79214cd6', 'VAL', 'ZAF', 1.61000000, 'seed', now()),
  ('50b44055-4958-441c-81b5-851d79214cd6', 'ZAF', 'VAL', 0.62111801, 'seed', now());
