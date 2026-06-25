-- Extends stock_market_events so the existing shock table can also serve as
-- player-facing market news metadata. This does not create a duplicate
-- market_news table and does not directly set stock prices.

ALTER TABLE public.stock_market_events
ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'sector',
ADD COLUMN IF NOT EXISTS sentiment text NOT NULL DEFAULT 'neutral',
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'runner',
ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public',
ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.stock_market_events
DROP CONSTRAINT IF EXISTS stock_market_events_category_check;

ALTER TABLE public.stock_market_events
ADD CONSTRAINT stock_market_events_category_check CHECK (
  category IN (
    'geopolitical',
    'war_conflict',
    'natural_disaster',
    'supply_chain',
    'resource_shock',
    'policy',
    'macro',
    'sector',
    'country',
    'company',
    'technology',
    'infrastructure',
    'energy',
    'agriculture',
    'finance'
  )
);

ALTER TABLE public.stock_market_events
DROP CONSTRAINT IF EXISTS stock_market_events_sentiment_check;

ALTER TABLE public.stock_market_events
ADD CONSTRAINT stock_market_events_sentiment_check CHECK (
  sentiment IN ('positive', 'negative', 'neutral', 'mixed')
);

ALTER TABLE public.stock_market_events
DROP CONSTRAINT IF EXISTS stock_market_events_source_check;

ALTER TABLE public.stock_market_events
ADD CONSTRAINT stock_market_events_source_check CHECK (
  source IN ('runner', 'staff', 'admin', 'system')
);

ALTER TABLE public.stock_market_events
DROP CONSTRAINT IF EXISTS stock_market_events_visibility_check;

ALTER TABLE public.stock_market_events
ADD CONSTRAINT stock_market_events_visibility_check CHECK (
  visibility IN ('public', 'hidden')
);

ALTER TABLE public.stock_market_events
DROP CONSTRAINT IF EXISTS stock_market_events_metadata_object_check;

ALTER TABLE public.stock_market_events
ADD CONSTRAINT stock_market_events_metadata_object_check CHECK (
  jsonb_typeof(metadata) = 'object'
);

CREATE INDEX IF NOT EXISTS stock_market_events_public_active_idx
ON public.stock_market_events (game_session_id, visibility, is_active, created_tick DESC);

COMMENT ON COLUMN public.stock_market_events.category IS
  'Player-facing market news category such as geopolitical, war_conflict, natural_disaster, supply_chain, or resource_shock.';

COMMENT ON COLUMN public.stock_market_events.sentiment IS
  'Player-facing directional interpretation of the event. This is a hint, not a direct price command.';

COMMENT ON COLUMN public.stock_market_events.source IS
  'Origin of the market news event: runner, staff, admin, or system.';

COMMENT ON COLUMN public.stock_market_events.visibility IS
  'Controls whether the event appears as player-facing public market news. Hidden events may still support internal mechanics.';

COMMENT ON COLUMN public.stock_market_events.metadata IS
  'Optional structured context for news events, such as affected resources, countries, sectors, or supply-chain notes.';
