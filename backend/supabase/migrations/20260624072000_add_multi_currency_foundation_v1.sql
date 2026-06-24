-- Multi-currency foundation V1.
-- One currency per country. No universal ECO currency.

CREATE TABLE IF NOT EXISTS public.currencies (
  code text PRIMARY KEY,
  country_code text NOT NULL,
  name text NOT NULL,
  symbol text NOT NULL,
  decimal_places integer NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT currencies_code_format_check
    CHECK (code = upper(code) AND length(code) BETWEEN 3 AND 16),

  CONSTRAINT currencies_country_code_format_check
    CHECK (country_code = upper(country_code)),

  CONSTRAINT currencies_status_check
    CHECK (status IN ('active', 'disabled', 'archived'))
);

CREATE TABLE IF NOT EXISTS public.currency_exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id uuid NOT NULL REFERENCES public.game_sessions (id),
  from_currency_code text NOT NULL REFERENCES public.currencies (code),
  to_currency_code text NOT NULL REFERENCES public.currencies (code),
  rate numeric(18, 8) NOT NULL,
  source text NOT NULL DEFAULT 'system',
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT currency_exchange_rates_rate_positive
    CHECK (rate > 0),

  CONSTRAINT currency_exchange_rates_no_self_rate
    CHECK (from_currency_code <> to_currency_code)
);

CREATE INDEX IF NOT EXISTS currency_exchange_rates_session_pair_idx
ON public.currency_exchange_rates (
  game_session_id,
  from_currency_code,
  to_currency_code,
  effective_at DESC
);

INSERT INTO public.currencies (
  code,
  country_code,
  name,
  symbol,
  decimal_places,
  status
)
VALUES
  ('NRC', 'NORTHREACH', 'Northreach Credit', '₦R', 2, 'active'),
  ('YRC', 'YRETHIA', 'Yrethian Crown', 'Ɏ', 2, 'active'),
  ('THD', 'THALORIS', 'Thaloris Harbor Dinar', '₮', 2, 'active'),
  ('SLV', 'SOLVEND', 'Solvend Volt', 'ϟ', 2, 'active'),
  ('ELD', 'ELDORAN', 'Eldoran Ducat', 'Ð', 2, 'active'),
  ('VAL', 'VALERION', 'Valerion Aureus', 'VA', 2, 'active'),
  ('SYN', 'SYNDALIS', 'Syndalis Note', 'SN', 2, 'active'),
  ('MRV', 'MARAVELLE', 'Maravelle Peso', '₱M', 2, 'active'),
  ('KAI', 'KAIZORA', 'Kaizoran Yen', '¥K', 2, 'active'),
  ('ZAF', 'ZAFRAN', 'Zafran Rial', 'ZR', 2, 'active')
ON CONFLICT (code) DO UPDATE
SET
  country_code = excluded.country_code,
  name = excluded.name,
  symbol = excluded.symbol,
  decimal_places = excluded.decimal_places,
  status = excluded.status;

CREATE OR REPLACE FUNCTION public.convert_currency_amount(
  p_game_session_id uuid,
  p_amount numeric,
  p_from_currency_code text,
  p_to_currency_code text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from text := upper(btrim(p_from_currency_code));
  v_to text := upper(btrim(p_to_currency_code));
  v_direct_rate numeric;
  v_inverse_rate numeric;
BEGIN
  IF p_game_session_id IS NULL THEN
    RAISE EXCEPTION 'GAME_SESSION_REQUIRED' USING errcode = 'P0001';
  END IF;

  IF p_amount IS NULL THEN
    RAISE EXCEPTION 'AMOUNT_REQUIRED' USING errcode = 'P0001';
  END IF;

  IF length(v_from) = 0 OR length(v_to) = 0 THEN
    RAISE EXCEPTION 'CURRENCY_CODE_REQUIRED' USING errcode = 'P0001';
  END IF;

  IF v_from = v_to THEN
    RETURN round(p_amount, 2);
  END IF;

  SELECT cer.rate
  INTO v_direct_rate
  FROM public.currency_exchange_rates AS cer
  WHERE cer.game_session_id = p_game_session_id
    AND cer.from_currency_code = v_from
    AND cer.to_currency_code = v_to
    AND cer.effective_at <= now()
    AND (cer.expires_at IS NULL OR cer.expires_at > now())
  ORDER BY cer.effective_at DESC
  LIMIT 1;

  IF v_direct_rate IS NOT NULL THEN
    RETURN round(p_amount * v_direct_rate, 2);
  END IF;

  SELECT cer.rate
  INTO v_inverse_rate
  FROM public.currency_exchange_rates AS cer
  WHERE cer.game_session_id = p_game_session_id
    AND cer.from_currency_code = v_to
    AND cer.to_currency_code = v_from
    AND cer.effective_at <= now()
    AND (cer.expires_at IS NULL OR cer.expires_at > now())
  ORDER BY cer.effective_at DESC
  LIMIT 1;

  IF v_inverse_rate IS NOT NULL THEN
    RETURN round(p_amount / v_inverse_rate, 2);
  END IF;

  RAISE EXCEPTION 'EXCHANGE_RATE_NOT_FOUND' USING errcode = 'P0001';
END;
$$;
