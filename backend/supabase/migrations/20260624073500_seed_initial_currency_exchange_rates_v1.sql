-- Initial simulation FX rates for the active smoke-test game session.
-- No ECO. Country currencies only.
-- Formula: amount_in_to_currency = amount_in_from_currency * rate.
-- Guarded so clean local resets do not fail when the smoke-test game session
-- has not been seeded.

WITH fx_seed_rates (
  from_currency_code,
  to_currency_code,
  rate
) AS (
  VALUES
    ('VAL', 'SYN', 1.12000000::numeric),
    ('SYN', 'VAL', 0.89285714::numeric),

    ('VAL', 'NRC', 0.94000000::numeric),
    ('NRC', 'VAL', 1.06382979::numeric),

    ('VAL', 'YRC', 1.03000000::numeric),
    ('YRC', 'VAL', 0.97087379::numeric),

    ('VAL', 'THD', 1.48000000::numeric),
    ('THD', 'VAL', 0.67567568::numeric),

    ('VAL', 'SLV', 0.78000000::numeric),
    ('SLV', 'VAL', 1.28205128::numeric),

    ('VAL', 'ELD', 1.01000000::numeric),
    ('ELD', 'VAL', 0.99009901::numeric),

    ('VAL', 'MRV', 1.36000000::numeric),
    ('MRV', 'VAL', 0.73529412::numeric),

    ('VAL', 'KAI', 1.24000000::numeric),
    ('KAI', 'VAL', 0.80645161::numeric),

    ('VAL', 'ZAF', 1.61000000::numeric),
    ('ZAF', 'VAL', 0.62111801::numeric)
)
INSERT INTO public.currency_exchange_rates (
  game_session_id,
  from_currency_code,
  to_currency_code,
  rate,
  source,
  effective_at
)
SELECT
  '50b44055-4958-441c-81b5-851d79214cd6'::uuid,
  fx_seed_rates.from_currency_code,
  fx_seed_rates.to_currency_code,
  fx_seed_rates.rate,
  'seed',
  now()
FROM fx_seed_rates
WHERE EXISTS (
  SELECT 1
  FROM public.game_sessions session
  WHERE session.id = '50b44055-4958-441c-81b5-851d79214cd6'::uuid
)
ON CONFLICT DO NOTHING;
