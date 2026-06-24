-- Repair store purchase foundation schema if migration history drift left tables missing.
-- This migration is intentionally idempotent and does not drop existing data.

-- Repair missing store catalog foundation first.
CREATE TABLE IF NOT EXISTS public.store_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id uuid NOT NULL REFERENCES public.game_sessions (id),
  item_key text NOT NULL,
  name text NOT NULL,
  description text NULL,
  category text NOT NULL DEFAULT 'general',
  price numeric(14, 2) NOT NULL DEFAULT 0,
  currency_code text NOT NULL DEFAULT 'ECO',
  stock_quantity integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  visibility text NOT NULL DEFAULT 'visible',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT store_items_game_item_key_unique UNIQUE (game_session_id, item_key),
  CONSTRAINT store_items_item_key_not_blank CHECK (length(btrim(item_key)) > 0),
  CONSTRAINT store_items_item_key_format_check CHECK (item_key ~ '^[a-z0-9_-]{1,64}$'),
  CONSTRAINT store_items_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT store_items_description_not_blank CHECK (
    description IS NULL
    OR length(btrim(description)) > 0
  ),
  CONSTRAINT store_items_category_not_blank CHECK (length(btrim(category)) > 0),
  CONSTRAINT store_items_price_non_negative CHECK (price >= 0),
  CONSTRAINT store_items_stock_quantity_non_negative CHECK (stock_quantity >= 0),
  CONSTRAINT store_items_currency_code_check CHECK (
    currency_code = upper(currency_code)
    AND length(currency_code) BETWEEN 3 AND 16
  ),
  CONSTRAINT store_items_status_check CHECK (status IN ('active', 'disabled', 'archived')),
  CONSTRAINT store_items_visibility_check CHECK (visibility IN ('visible', 'hidden'))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_store_items_updated_at'
      AND tgrelid = 'public.store_items'::regclass
  ) THEN
    CREATE TRIGGER set_store_items_updated_at
    BEFORE UPDATE ON public.store_items
    FOR EACH ROW
    EXECUTE FUNCTION public.set_current_timestamp_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS store_items_game_status_visibility_idx
ON public.store_items (game_session_id, status, visibility, sort_order, name);

CREATE INDEX IF NOT EXISTS store_items_game_category_idx
ON public.store_items (game_session_id, category);

CREATE INDEX IF NOT EXISTS store_items_game_updated_at_idx
ON public.store_items (game_session_id, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'store_items_game_session_id_id_unique'
  ) THEN
    ALTER TABLE public.store_items
    ADD CONSTRAINT store_items_game_session_id_id_unique UNIQUE (game_session_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.mutation_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id uuid NOT NULL REFERENCES public.game_sessions (id),
  player_id uuid NOT NULL,
  route_key text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'STARTED',
  result_type text NULL,
  result_id uuid NULL,
  response_body jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  expires_at timestamptz NOT NULL,

  CONSTRAINT mutation_idempotency_keys_player_scope_fk
    FOREIGN KEY (game_session_id, player_id)
    REFERENCES public.players (game_session_id, id),
  CONSTRAINT mutation_idempotency_keys_scope_unique UNIQUE (
    game_session_id,
    player_id,
    route_key,
    idempotency_key
  ),
  CONSTRAINT mutation_idempotency_keys_route_key_not_blank CHECK (length(btrim(route_key)) > 0),
  CONSTRAINT mutation_idempotency_keys_idempotency_key_not_blank CHECK (length(btrim(idempotency_key)) > 0),
  CONSTRAINT mutation_idempotency_keys_request_hash_not_blank CHECK (length(btrim(request_hash)) > 0),
  CONSTRAINT mutation_idempotency_keys_status_check CHECK (status IN ('STARTED', 'COMPLETED', 'FAILED')),
  CONSTRAINT mutation_idempotency_keys_completed_at_required CHECK (
    status <> 'COMPLETED'
    OR completed_at IS NOT NULL
  ),
  CONSTRAINT mutation_idempotency_keys_expires_after_created CHECK (expires_at > created_at),
  CONSTRAINT mutation_idempotency_keys_completed_after_created CHECK (
    completed_at IS NULL
    OR completed_at >= created_at
  ),
  CONSTRAINT mutation_idempotency_keys_result_id_requires_type CHECK (
    result_id IS NULL
    OR result_type IS NOT NULL
  ),
  CONSTRAINT mutation_idempotency_keys_result_type_not_blank CHECK (
    result_type IS NULL
    OR length(btrim(result_type)) > 0
  )
);

CREATE INDEX IF NOT EXISTS mutation_idempotency_keys_expires_at_idx
ON public.mutation_idempotency_keys (expires_at);

CREATE INDEX IF NOT EXISTS mutation_idempotency_keys_player_created_at_idx
ON public.mutation_idempotency_keys (game_session_id, player_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.store_purchase_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id uuid NOT NULL REFERENCES public.game_sessions (id),
  player_id uuid NOT NULL,
  store_item_id uuid NOT NULL,
  quantity integer NOT NULL,
  currency_code text NOT NULL DEFAULT 'ECO',
  base_unit_price numeric(14, 2) NOT NULL,
  inflation_multiplier numeric(10, 4) NOT NULL DEFAULT 1,
  location_multiplier numeric(10, 4) NOT NULL DEFAULT 1,
  scarcity_multiplier numeric(10, 4) NOT NULL DEFAULT 1,
  discount_amount numeric(14, 2) NOT NULL DEFAULT 0,
  final_unit_price numeric(14, 2) NOT NULL,
  final_total_price numeric(14, 2) NOT NULL,
  pricing_version text NOT NULL DEFAULT 'store-pricing-v1',
  status text NOT NULL DEFAULT 'CREATED',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  cancelled_at timestamptz NULL,

  CONSTRAINT store_purchase_quotes_player_scope_fk
    FOREIGN KEY (game_session_id, player_id)
    REFERENCES public.players (game_session_id, id),
  CONSTRAINT store_purchase_quotes_item_scope_fk
    FOREIGN KEY (game_session_id, store_item_id)
    REFERENCES public.store_items (game_session_id, id),
  CONSTRAINT store_purchase_quotes_quantity_positive CHECK (quantity > 0),
  CONSTRAINT store_purchase_quotes_currency_code_check CHECK (
    currency_code = upper(currency_code)
    AND length(currency_code) BETWEEN 3 AND 16
  ),
  CONSTRAINT store_purchase_quotes_prices_non_negative CHECK (
    base_unit_price >= 0
    AND discount_amount >= 0
    AND final_unit_price >= 0
    AND final_total_price >= 0
  ),
  CONSTRAINT store_purchase_quotes_multipliers_non_negative CHECK (
    inflation_multiplier >= 0
    AND location_multiplier >= 0
    AND scarcity_multiplier >= 0
  ),
  CONSTRAINT store_purchase_quotes_pricing_version_not_blank CHECK (length(btrim(pricing_version)) > 0),
  CONSTRAINT store_purchase_quotes_status_check CHECK (status IN ('CREATED', 'USED', 'EXPIRED', 'CANCELLED')),
  CONSTRAINT store_purchase_quotes_expires_after_created CHECK (expires_at > created_at),
  CONSTRAINT store_purchase_quotes_used_at_status_check CHECK (
    (status = 'USED' AND used_at IS NOT NULL)
    OR (status <> 'USED' AND used_at IS NULL)
  ),
  CONSTRAINT store_purchase_quotes_cancelled_at_status_check CHECK (
    (status = 'CANCELLED' AND cancelled_at IS NOT NULL)
    OR (status <> 'CANCELLED' AND cancelled_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS store_purchase_quotes_player_status_expires_idx
ON public.store_purchase_quotes (game_session_id, player_id, status, expires_at);

CREATE INDEX IF NOT EXISTS store_purchase_quotes_item_created_at_idx
ON public.store_purchase_quotes (game_session_id, store_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.store_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id uuid NOT NULL REFERENCES public.game_sessions (id),
  player_id uuid NOT NULL,
  store_item_id uuid NOT NULL,
  quote_id uuid NULL REFERENCES public.store_purchase_quotes (id),
  quantity integer NOT NULL,
  currency_code text NOT NULL DEFAULT 'ECO',
  final_unit_price numeric(14, 2) NOT NULL,
  final_total_price numeric(14, 2) NOT NULL,
  ledger_entry_id uuid NULL REFERENCES public.ledger_entries (id),
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'COMPLETED',
  client_submitted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT store_purchases_player_scope_fk
    FOREIGN KEY (game_session_id, player_id)
    REFERENCES public.players (game_session_id, id),
  CONSTRAINT store_purchases_item_scope_fk
    FOREIGN KEY (game_session_id, store_item_id)
    REFERENCES public.store_items (game_session_id, id),
  CONSTRAINT store_purchases_idempotency_unique UNIQUE (game_session_id, player_id, idempotency_key),
  CONSTRAINT store_purchases_quantity_positive CHECK (quantity > 0),
  CONSTRAINT store_purchases_currency_code_check CHECK (
    currency_code = upper(currency_code)
    AND length(currency_code) BETWEEN 3 AND 16
  ),
  CONSTRAINT store_purchases_prices_non_negative CHECK (
    final_unit_price >= 0
    AND final_total_price >= 0
  ),
  CONSTRAINT store_purchases_idempotency_key_not_blank CHECK (length(btrim(idempotency_key)) > 0),
  CONSTRAINT store_purchases_status_check CHECK (status IN ('COMPLETED', 'FAILED', 'REVERSED')),
  CONSTRAINT store_purchases_completed_requires_ledger CHECK (
    status <> 'COMPLETED'
    OR ledger_entry_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS store_purchases_player_created_at_idx
ON public.store_purchases (game_session_id, player_id, created_at DESC);

CREATE INDEX IF NOT EXISTS store_purchases_item_created_at_idx
ON public.store_purchases (game_session_id, store_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS store_purchases_quote_id_idx
ON public.store_purchases (quote_id);

CREATE TABLE IF NOT EXISTS public.inventory_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id uuid NOT NULL REFERENCES public.game_sessions (id),
  player_id uuid NOT NULL,
  store_item_id uuid NOT NULL,
  quantity_owned integer NOT NULL DEFAULT 0,
  quantity_reserved integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT inventory_holdings_player_scope_fk
    FOREIGN KEY (game_session_id, player_id)
    REFERENCES public.players (game_session_id, id),
  CONSTRAINT inventory_holdings_item_scope_fk
    FOREIGN KEY (game_session_id, store_item_id)
    REFERENCES public.store_items (game_session_id, id),
  CONSTRAINT inventory_holdings_scope_unique UNIQUE (game_session_id, player_id, store_item_id),
  CONSTRAINT inventory_holdings_quantities_non_negative CHECK (
    quantity_owned >= 0
    AND quantity_reserved >= 0
  ),
  CONSTRAINT inventory_holdings_reserved_not_greater_than_owned CHECK (quantity_reserved <= quantity_owned)
);

CREATE INDEX IF NOT EXISTS inventory_holdings_player_idx
ON public.inventory_holdings (game_session_id, player_id);

CREATE INDEX IF NOT EXISTS inventory_holdings_item_idx
ON public.inventory_holdings (game_session_id, store_item_id);

CREATE TABLE IF NOT EXISTS public.inventory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id uuid NOT NULL REFERENCES public.game_sessions (id),
  player_id uuid NOT NULL,
  store_item_id uuid NOT NULL,
  quantity_delta integer NOT NULL,
  event_type text NOT NULL,
  source_domain text NOT NULL,
  source_action text NOT NULL,
  source_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT inventory_events_player_scope_fk
    FOREIGN KEY (game_session_id, player_id)
    REFERENCES public.players (game_session_id, id),
  CONSTRAINT inventory_events_item_scope_fk
    FOREIGN KEY (game_session_id, store_item_id)
    REFERENCES public.store_items (game_session_id, id),
  CONSTRAINT inventory_events_quantity_delta_not_zero CHECK (quantity_delta <> 0),
  CONSTRAINT inventory_events_event_type_check CHECK (event_type IN ('PURCHASED', 'USED', 'RESERVED', 'RELEASED', 'ADJUSTED', 'REVERSED')),
  CONSTRAINT inventory_events_source_domain_not_blank CHECK (length(btrim(source_domain)) > 0),
  CONSTRAINT inventory_events_source_action_not_blank CHECK (length(btrim(source_action)) > 0)
);

CREATE INDEX IF NOT EXISTS inventory_events_player_created_at_idx
ON public.inventory_events (game_session_id, player_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_events_source_idx
ON public.inventory_events (source_domain, source_action, source_id);

CREATE INDEX IF NOT EXISTS inventory_events_item_created_at_idx
ON public.inventory_events (game_session_id, store_item_id, created_at DESC);

ALTER TABLE public.mutation_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_purchase_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.store_purchases IS
  'Source records for completed, failed, or reversed player store purchases.';
COMMENT ON TABLE public.inventory_events IS
  'Append-only inventory history for player item ownership changes.';
