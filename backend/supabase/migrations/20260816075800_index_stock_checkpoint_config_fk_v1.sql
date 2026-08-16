create index if not exists stock_market_simulation_checkpoints_config_idx
  on private.stock_market_simulation_checkpoints (simulation_config_id);

comment on index private.stock_market_simulation_checkpoints_config_idx is
  'Covers the immutable simulation-config foreign key used by Stock Runtime V3 checkpoint validation and rollback selection.';
