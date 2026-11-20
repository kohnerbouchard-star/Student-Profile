begin;

create table if not exists public.campaign_program_definitions (
  pack_id text not null,
  pack_version text not null,
  definition_id text not null,
  definition_digest text not null,
  program jsonb not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key (pack_id, pack_version, definition_id),
  constraint campaign_program_definitions_pack_id_valid check (pack_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  constraint campaign_program_definitions_pack_version_valid check (length(btrim(pack_version)) between 1 and 64),
  constraint campaign_program_definitions_definition_id_valid check (definition_id ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'),
  constraint campaign_program_definitions_digest_valid check (definition_digest ~ '^sha256:[0-9a-f]{64}$'),
  constraint campaign_program_definitions_program_object check (jsonb_typeof(program) = 'object'),
  constraint campaign_program_definitions_status_valid check (status in ('active','retired'))
);

create unique index if not exists campaign_program_one_active_per_pack_version
  on public.campaign_program_definitions(pack_id, pack_version)
  where status = 'active';

create table if not exists public.campaign_effect_definitions (
  pack_id text not null,
  pack_version text not null,
  definition_id text not null,
  effect_kind text not null,
  payload jsonb not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key (pack_id, pack_version, definition_id),
  constraint campaign_effect_definitions_kind_valid check (effect_kind in ('publish_news','publish_cutscene','create_contract','notify_players','apply_market_shock','set_store_scarcity','set_route_state','apply_player_impact')),
  constraint campaign_effect_definitions_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint campaign_effect_definitions_status_valid check (status in ('active','retired'))
);

create table if not exists public.campaign_outcome_evidence_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  evidence_revision bigint not null,
  recovery_readiness_basis_points integer not null,
  evidence_digest text not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint campaign_outcome_evidence_revision_positive check (evidence_revision > 0),
  constraint campaign_outcome_evidence_score_valid check (recovery_readiness_basis_points between 0 and 10000),
  constraint campaign_outcome_evidence_digest_valid check (evidence_digest ~ '^sha256:[0-9a-f]{64}$'),
  constraint campaign_outcome_evidence_game_revision_unique unique (game_session_id, evidence_revision)
);

create index if not exists campaign_outcome_evidence_latest_idx
  on public.campaign_outcome_evidence_snapshots(game_session_id, evidence_revision desc);

create table if not exists public.campaign_effect_application_receipts (
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  idempotency_key text not null,
  effect_kind text not null,
  request_digest text not null,
  applied_at timestamptz not null,
  primary key (game_session_id, idempotency_key),
  constraint campaign_effect_application_receipts_key_valid check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  constraint campaign_effect_application_receipts_digest_valid check (request_digest ~ '^[0-9a-f]{64}$')
);

alter table public.campaign_program_definitions enable row level security;
alter table public.campaign_program_definitions force row level security;
alter table public.campaign_effect_definitions enable row level security;
alter table public.campaign_effect_definitions force row level security;
alter table public.campaign_outcome_evidence_snapshots enable row level security;
alter table public.campaign_outcome_evidence_snapshots force row level security;
alter table public.campaign_effect_application_receipts enable row level security;
alter table public.campaign_effect_application_receipts force row level security;

revoke all on table public.campaign_program_definitions from public, anon, authenticated;
revoke all on table public.campaign_effect_definitions from public, anon, authenticated;
revoke all on table public.campaign_outcome_evidence_snapshots from public, anon, authenticated;
revoke all on table public.campaign_effect_application_receipts from public, anon, authenticated;
grant select on table public.campaign_program_definitions to service_role;
grant select on table public.campaign_effect_definitions to service_role;
grant select, insert on table public.campaign_outcome_evidence_snapshots to service_role;
grant select, insert on table public.campaign_effect_application_receipts to service_role;

insert into public.campaign_program_definitions (pack_id, pack_version, definition_id, definition_digest, program, status) values (
'econovaria.beta-seed-pack.v1','1.0.0-beta','campaign.beta.primary.v1','sha256:8054bb11bc46a7b8c555c2f4e1522e20257697065f9d1ae39eb6290a3b66350a',
'{"programId":"campaign.beta.primary.v1","packId":"econovaria.beta-seed-pack.v1","packVersion":"1.0.0-beta","recoveryThresholdBasisPoints":6000,"eventsByPhase":{"arrival":{"eventKey":"campaign.arrival.v1","phase":"arrival","nextPhase":"opportunity","completeCampaign":false,"prerequisites":[],"effects":[{"kind":"publish_news","newsDefinitionId":"news.campaign.arrival.v1","audience":"all_players"},{"kind":"notify_players","notificationDefinitionId":"notification.campaign.arrival.v1","audience":"all_players"}]},"opportunity":{"eventKey":"campaign.opportunity.v1","phase":"opportunity","nextPhase":"rivalry","completeCampaign":false,"prerequisites":["campaign.arrival.v1"],"effects":[{"kind":"publish_news","newsDefinitionId":"news.campaign.opportunity.v1","audience":"all_players"},{"kind":"notify_players","notificationDefinitionId":"notification.campaign.opportunity.v1","audience":"all_players"}]},"rivalry":{"eventKey":"campaign.rivalry.v1","phase":"rivalry","nextPhase":"shortage","completeCampaign":false,"prerequisites":["campaign.arrival.v1","campaign.opportunity.v1"],"effects":[{"kind":"publish_news","newsDefinitionId":"news.campaign.rivalry.v1","audience":"all_players"},{"kind":"notify_players","notificationDefinitionId":"notification.campaign.rivalry.v1","audience":"all_players"},{"kind":"apply_market_shock","marketShockDefinitionId":"market-shock.campaign.rivalry.v1","magnitudeBasisPoints":-150}]},"shortage":{"eventKey":"campaign.shortage.v1","phase":"shortage","nextPhase":"meridian_disruption","completeCampaign":false,"prerequisites":["campaign.arrival.v1","campaign.opportunity.v1","campaign.rivalry.v1"],"effects":[{"kind":"publish_news","newsDefinitionId":"news.campaign.shortage.v1","audience":"all_players"},{"kind":"notify_players","notificationDefinitionId":"notification.campaign.shortage.v1","audience":"all_players"},{"kind":"apply_market_shock","marketShockDefinitionId":"market-shock.campaign.shortage.v1","magnitudeBasisPoints":-300},{"kind":"set_store_scarcity","scarcityDefinitionId":"scarcity.campaign.shortage.v1","targetLocationIds":["loc_northreach_frostgate_v1","loc_yrethia_sableport_v1","loc_thaloris_dusk_harbor_v1","loc_solvend_aurora_spire_v1","loc_eldoran_crescent_bay_v1","loc_valerion_glassfall_v1","loc_lumenor_starfall_v1","loc_xalvoria_emberhall_v1","loc_dravenlok_ironhold_v1","loc_syndalis_blacklight_v1"]},{"kind":"set_route_state","routeDefinitionIds":["rte_meridian_northreach_yrethia_v1","rte_meridian_yrethia_eldoran_v1"],"state":"restricted","reason":"shortage"}]},"meridian_disruption":{"eventKey":"campaign.meridian-disruption.v1","phase":"meridian_disruption","nextPhase":"open_conflict","completeCampaign":false,"prerequisites":["campaign.arrival.v1","campaign.opportunity.v1","campaign.rivalry.v1","campaign.shortage.v1"],"effects":[{"kind":"publish_news","newsDefinitionId":"news.campaign.meridian-disruption.v1","audience":"all_players"},{"kind":"notify_players","notificationDefinitionId":"notification.campaign.meridian-disruption.v1","audience":"all_players"},{"kind":"apply_market_shock","marketShockDefinitionId":"market-shock.campaign.meridian-disruption.v1","magnitudeBasisPoints":-500},{"kind":"set_store_scarcity","scarcityDefinitionId":"scarcity.campaign.meridian-disruption.v1","targetLocationIds":["loc_northreach_frostgate_v1","loc_yrethia_sableport_v1","loc_thaloris_dusk_harbor_v1","loc_solvend_aurora_spire_v1","loc_eldoran_crescent_bay_v1","loc_valerion_glassfall_v1","loc_lumenor_starfall_v1","loc_xalvoria_emberhall_v1","loc_dravenlok_ironhold_v1","loc_syndalis_blacklight_v1"]},{"kind":"set_route_state","routeDefinitionIds":["rte_meridian_syndalis_lumenor_v1","rte_meridian_xalvoria_syndalis_v1"],"state":"closed","reason":"meridian_disruption"}]},"open_conflict":{"eventKey":"campaign.open-conflict.v1","phase":"open_conflict","nextPhase":"adaptation","completeCampaign":false,"prerequisites":["campaign.arrival.v1","campaign.opportunity.v1","campaign.rivalry.v1","campaign.shortage.v1","campaign.meridian-disruption.v1"],"effects":[{"kind":"publish_news","newsDefinitionId":"news.campaign.open-conflict.v1","audience":"all_players"},{"kind":"notify_players","notificationDefinitionId":"notification.campaign.open-conflict.v1","audience":"all_players"},{"kind":"apply_market_shock","marketShockDefinitionId":"market-shock.campaign.open-conflict.v1","magnitudeBasisPoints":-800},{"kind":"set_store_scarcity","scarcityDefinitionId":"scarcity.campaign.open-conflict.v1","targetLocationIds":["loc_northreach_frostgate_v1","loc_yrethia_sableport_v1","loc_thaloris_dusk_harbor_v1","loc_solvend_aurora_spire_v1","loc_eldoran_crescent_bay_v1","loc_valerion_glassfall_v1","loc_lumenor_starfall_v1","loc_xalvoria_emberhall_v1","loc_dravenlok_ironhold_v1","loc_syndalis_blacklight_v1"]},{"kind":"set_route_state","routeDefinitionIds":["rte_meridian_dravenlok_syndalis_v1","rte_meridian_lumenor_xalvoria_v1","rte_meridian_thaloris_eldoran_v1"],"state":"closed","reason":"war"}]},"adaptation":{"eventKey":"campaign.adaptation.v1","phase":"adaptation","nextPhase":null,"completeCampaign":false,"prerequisites":["campaign.arrival.v1","campaign.opportunity.v1","campaign.rivalry.v1","campaign.shortage.v1","campaign.meridian-disruption.v1","campaign.open-conflict.v1"],"effects":[{"kind":"publish_news","newsDefinitionId":"news.campaign.adaptation.v1","audience":"all_players"},{"kind":"notify_players","notificationDefinitionId":"notification.campaign.adaptation.v1","audience":"all_players"}]}},"terminalEvents":{"reconstruction":{"eventKey":"campaign.reconstruction.v1","phase":"adaptation","nextPhase":"reconstruction","completeCampaign":true,"prerequisites":["campaign.arrival.v1","campaign.opportunity.v1","campaign.rivalry.v1","campaign.shortage.v1","campaign.meridian-disruption.v1","campaign.open-conflict.v1"],"effects":[{"kind":"publish_news","newsDefinitionId":"news.campaign.reconstruction.v1","audience":"all_players"},{"kind":"notify_players","notificationDefinitionId":"notification.campaign.reconstruction.v1","audience":"all_players"},{"kind":"apply_market_shock","marketShockDefinitionId":"market-shock.campaign.reconstruction.v1","magnitudeBasisPoints":450},{"kind":"set_store_scarcity","scarcityDefinitionId":"scarcity.campaign.reconstruction.v1","targetLocationIds":["loc_northreach_frostgate_v1","loc_yrethia_sableport_v1","loc_thaloris_dusk_harbor_v1","loc_solvend_aurora_spire_v1","loc_eldoran_crescent_bay_v1","loc_valerion_glassfall_v1","loc_lumenor_starfall_v1","loc_xalvoria_emberhall_v1","loc_dravenlok_ironhold_v1","loc_syndalis_blacklight_v1"]},{"kind":"set_route_state","routeDefinitionIds":["rte_meridian_dravenlok_syndalis_v1","rte_meridian_eldoran_valerion_v1","rte_meridian_lumenor_xalvoria_v1","rte_meridian_northreach_solvend_v1","rte_meridian_northreach_yrethia_v1","rte_meridian_solvend_eldoran_v1","rte_meridian_syndalis_lumenor_v1","rte_meridian_thaloris_eldoran_v1","rte_meridian_valerion_lumenor_v1","rte_meridian_xalvoria_dravenlok_v1","rte_meridian_xalvoria_syndalis_v1","rte_meridian_yrethia_eldoran_v1","rte_meridian_yrethia_thaloris_v1"],"state":"open","reason":"recovery"}]},"continuedConflict":{"eventKey":"campaign.continued-conflict.v1","phase":"adaptation","nextPhase":"continued_conflict","completeCampaign":true,"prerequisites":["campaign.arrival.v1","campaign.opportunity.v1","campaign.rivalry.v1","campaign.shortage.v1","campaign.meridian-disruption.v1","campaign.open-conflict.v1"],"effects":[{"kind":"publish_news","newsDefinitionId":"news.campaign.continued-conflict.v1","audience":"all_players"},{"kind":"notify_players","notificationDefinitionId":"notification.campaign.continued-conflict.v1","audience":"all_players"},{"kind":"apply_market_shock","marketShockDefinitionId":"market-shock.campaign.continued-conflict.v1","magnitudeBasisPoints":-600},{"kind":"set_store_scarcity","scarcityDefinitionId":"scarcity.campaign.continued-conflict.v1","targetLocationIds":["loc_northreach_frostgate_v1","loc_yrethia_sableport_v1","loc_thaloris_dusk_harbor_v1","loc_solvend_aurora_spire_v1","loc_eldoran_crescent_bay_v1","loc_valerion_glassfall_v1","loc_lumenor_starfall_v1","loc_xalvoria_emberhall_v1","loc_dravenlok_ironhold_v1","loc_syndalis_blacklight_v1"]}]}},"definitionDigest":"sha256:8054bb11bc46a7b8c555c2f4e1522e20257697065f9d1ae39eb6290a3b66350a"}'::jsonb,'active')
on conflict (pack_id, pack_version, definition_id) do nothing;

insert into public.campaign_effect_definitions (pack_id, pack_version, definition_id, effect_kind, payload, status) values
('econovaria.beta-seed-pack.v1','1.0.0-beta','news.campaign.arrival.v1','publish_news','{"headline":"First Arrivals Enter the Meridian Economy","explanation":"New arrivals are entering local labor, housing, banking, and trade systems across all ten countries. Markets remain orderly, but household liquidity and entry-level services are seeing fresh demand.","category":"macro","scope":"global","targetKey":null,"sentiment":"neutral","impactStrength":"low","durationTicks":4,"magnitudeBasisPoints":0}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','news.campaign.opportunity.v1','publish_news','{"headline":"Cross-Border Opportunity Expands","explanation":"New commercial links, contracting opportunities, and skilled-work placements are expanding across the Meridian network. Firms are competing for early access to talent and logistics capacity.","category":"macro","scope":"global","targetKey":null,"sentiment":"positive","impactStrength":"medium","durationTicks":6,"magnitudeBasisPoints":0}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','news.campaign.rivalry.v1','publish_news','{"headline":"Regional Rivalries Begin to Pressure Trade","explanation":"Political and commercial rivalry is increasing across several corridors. Investors are repricing risk as governments review strategic supply chains and cross-border dependencies.","category":"geopolitical","scope":"global","targetKey":null,"sentiment":"negative","impactStrength":"medium","durationTicks":6,"magnitudeBasisPoints":0}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','news.campaign.shortage.v1','publish_news','{"headline":"Supply Shortages Spread Across Key Corridors","explanation":"Energy, industrial inputs, filtration materials, and transport capacity are tightening. Freight delays and inventory constraints are beginning to affect household and business decisions.","category":"supply_chain","scope":"global","targetKey":null,"sentiment":"negative","impactStrength":"high","durationTicks":8,"magnitudeBasisPoints":0}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','news.campaign.meridian-disruption.v1','publish_news','{"headline":"Meridian Network Suffers Major Disruption","explanation":"Critical Meridian transport links are being interrupted by escalating political restrictions and infrastructure failures. Businesses face longer routes, higher costs, and uncertain delivery windows.","category":"infrastructure","scope":"global","targetKey":null,"sentiment":"negative","impactStrength":"high","durationTicks":8,"magnitudeBasisPoints":0}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','news.campaign.open-conflict.v1','publish_news','{"headline":"Open Conflict Breaks Out Across the Meridian System","explanation":"Armed conflict has begun to disrupt trade, mobility, finance, and essential supply chains. Governments are imposing emergency controls while households and firms adapt to rapidly changing conditions.","category":"war_conflict","scope":"global","targetKey":null,"sentiment":"negative","impactStrength":"high","durationTicks":8,"magnitudeBasisPoints":0}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','news.campaign.adaptation.v1','publish_news','{"headline":"Economies Enter the Adaptation Phase","explanation":"Households, firms, and public institutions are restructuring around disrupted trade, scarce resources, and new alliances. The quality of those adaptations will determine the long-run outcome.","category":"macro","scope":"global","targetKey":null,"sentiment":"mixed","impactStrength":"medium","durationTicks":6,"magnitudeBasisPoints":0}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','news.campaign.reconstruction.v1','publish_news','{"headline":"Reconstruction Coalition Secures a Recovery Path","explanation":"Coordinated recovery measures have stabilized critical routes and restored confidence across much of the Meridian economy. Reconstruction investment and trade normalization are beginning.","category":"macro","scope":"global","targetKey":null,"sentiment":"positive","impactStrength":"high","durationTicks":8,"magnitudeBasisPoints":0}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','news.campaign.continued-conflict.v1','publish_news','{"headline":"Recovery Fails to End the Wider Conflict","explanation":"The Meridian system remains fragmented as recovery efforts fail to reach the required threshold. Persistent security risks, shortages, and trade restrictions continue to weigh on the economy.","category":"war_conflict","scope":"global","targetKey":null,"sentiment":"negative","impactStrength":"high","durationTicks":8,"magnitudeBasisPoints":0}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','notification.campaign.arrival.v1','notify_players','{"title":"Arrival Phase","summary":"The world campaign has begun. Establish your finances, complete arrival objectives, and learn your country before larger shocks emerge.","priority":"normal","displayMode":"feed","notificationType":"campaign_update"}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','notification.campaign.opportunity.v1','notify_players','{"title":"Opportunity Phase","summary":"Trade and business opportunities are expanding. Build skills, liquidity, relationships, and productive capacity while conditions are favorable.","priority":"normal","displayMode":"feed","notificationType":"campaign_update"}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','notification.campaign.rivalry.v1','notify_players','{"title":"Rivalry Phase","summary":"Regional competition is increasing. Review exposure to countries, sectors, suppliers, and routes before risk accelerates.","priority":"major","displayMode":"feed","notificationType":"campaign_update"}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','notification.campaign.shortage.v1','notify_players','{"title":"Shortage Phase","summary":"Key supplies and transport capacity are tightening. Inventory, cash reserves, sourcing, and route choices now matter more.","priority":"major","displayMode":"feed","notificationType":"campaign_update"}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','notification.campaign.meridian-disruption.v1','notify_players','{"title":"Meridian Disruption","summary":"Major transport links are failing or closing. Reassess travel, business inputs, contracts, and market exposure.","priority":"critical","displayMode":"feed","notificationType":"campaign_update"}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','notification.campaign.open-conflict.v1','notify_players','{"title":"Open Conflict","summary":"War is now affecting the world economy. Protect liquidity, essential supplies, mobility, and long-term relationships.","priority":"critical","displayMode":"feed","notificationType":"campaign_update"}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','notification.campaign.adaptation.v1','notify_players','{"title":"Adaptation Phase","summary":"The immediate shock has passed into a longer adaptation period. Your accumulated choices now shape the recovery outlook.","priority":"major","displayMode":"feed","notificationType":"campaign_update"}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','notification.campaign.reconstruction.v1','notify_players','{"title":"Reconstruction","summary":"The campaign has entered reconstruction. Routes and economic activity are beginning to normalize.","priority":"major","displayMode":"feed","notificationType":"campaign_update"}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','notification.campaign.continued-conflict.v1','notify_players','{"title":"Continued Conflict","summary":"The campaign has ended without sufficient recovery. Conflict and economic fragmentation remain entrenched.","priority":"critical","displayMode":"feed","notificationType":"campaign_update"}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','market-shock.campaign.rivalry.v1','apply_market_shock','{"headline":"Risk Premiums Rise on Regional Rivalry","explanation":"Investors reduce exposure to vulnerable cross-border supply chains as political rivalry intensifies.","category":"geopolitical","scope":"global","targetKey":null,"sentiment":"negative","durationTicks":6}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','market-shock.campaign.shortage.v1','apply_market_shock','{"headline":"Shortage Shock Hits Industrial Markets","explanation":"Scarce inputs and delayed freight push production costs higher and weaken risk appetite.","category":"supply_chain","scope":"global","targetKey":null,"sentiment":"negative","durationTicks":8}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','market-shock.campaign.meridian-disruption.v1','apply_market_shock','{"headline":"Meridian Disruption Triggers Broad Repricing","explanation":"Transport failures force a rapid repricing of firms dependent on Meridian logistics.","category":"infrastructure","scope":"global","targetKey":null,"sentiment":"negative","durationTicks":10}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','market-shock.campaign.open-conflict.v1','apply_market_shock','{"headline":"War Shock Drives Extreme Market Volatility","explanation":"Open conflict causes a broad risk-off move across exposed countries and sectors.","category":"war_conflict","scope":"global","targetKey":null,"sentiment":"negative","durationTicks":12}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','market-shock.campaign.reconstruction.v1','apply_market_shock','{"headline":"Reconstruction Rally Lifts Risk Assets","explanation":"Route restoration and reconstruction spending improve the outlook for trade and productive investment.","category":"macro","scope":"global","targetKey":null,"sentiment":"positive","durationTicks":10}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','market-shock.campaign.continued-conflict.v1','apply_market_shock','{"headline":"Persistent Conflict Extends Risk-Off Conditions","explanation":"Failure to stabilize the Meridian system prolongs pressure on trade-sensitive assets.","category":"war_conflict","scope":"global","targetKey":null,"sentiment":"negative","durationTicks":10}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','scarcity.campaign.shortage.v1','set_store_scarcity','{"itemKeys":["energy-cell","filtration-membrane","hydraulic-fluid","machine-steel-billet","deepwater-lubricant"],"scarcityBand":"scarce","eventMultiplier":1.35,"durationDays":56}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','scarcity.campaign.meridian-disruption.v1','set_store_scarcity','{"itemKeys":["energy-cell","filtration-membrane","hydraulic-fluid","machine-steel-billet","deepwater-lubricant","industrial-bearing-stock"],"scarcityBand":"scarce","eventMultiplier":1.65,"durationDays":70}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','scarcity.campaign.open-conflict.v1','set_store_scarcity','{"itemKeys":["energy-cell","filtration-membrane","hydraulic-fluid","machine-steel-billet","deepwater-lubricant","industrial-bearing-stock","emergency-filter-cartridge"],"scarcityBand":"unavailable","eventMultiplier":2.2,"durationDays":84}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','scarcity.campaign.reconstruction.v1','set_store_scarcity','{"itemKeys":["energy-cell","filtration-membrane","hydraulic-fluid","machine-steel-billet","deepwater-lubricant","industrial-bearing-stock","emergency-filter-cartridge"],"scarcityBand":"available","eventMultiplier":0.9,"durationDays":42}'::jsonb,'active'),
('econovaria.beta-seed-pack.v1','1.0.0-beta','scarcity.campaign.continued-conflict.v1','set_store_scarcity','{"itemKeys":["energy-cell","filtration-membrane","hydraulic-fluid","machine-steel-billet","deepwater-lubricant","industrial-bearing-stock","emergency-filter-cartridge"],"scarcityBand":"scarce","eventMultiplier":1.8,"durationDays":84}'::jsonb,'active')
on conflict (pack_id, pack_version, definition_id) do nothing;

create unique index if not exists campaign_instances_one_live_per_game on public.campaign_instances(game_session_id) where status <> 'completed';

create or replace function public.initialize_default_campaign_for_game_v1(p_game_session_id uuid,p_scheduled_at timestamptz default clock_timestamp()) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare v_game public.game_sessions%rowtype; v_program public.campaign_program_definitions%rowtype; v_initialized record;
begin
 if p_game_session_id is null or p_scheduled_at is null then raise exception 'CAMPAIGN_DEFAULT_INITIALIZATION_INVALID' using errcode='P0001'; end if;
 select * into v_game from public.game_sessions where id=p_game_session_id;
 if not found or v_game.status<>'active' or v_game.provisioning_status<>'ready' or nullif(btrim(coalesce(v_game.provisioning_pack_id,'')),'') is null or nullif(btrim(coalesce(v_game.provisioning_pack_version,'')),'') is null then raise exception 'CAMPAIGN_DEFAULT_GAME_NOT_READY' using errcode='P0001'; end if;
 select * into v_program from public.campaign_program_definitions where pack_id=v_game.provisioning_pack_id and pack_version=v_game.provisioning_pack_version and status='active' order by created_at desc limit 1;
 if not found then raise exception 'CAMPAIGN_DEFAULT_PROGRAM_MISSING' using errcode='P0001'; end if;
 select * into v_initialized from public.initialize_campaign_instance_v1(p_game_session_id,v_program.pack_id,v_program.pack_version,v_program.definition_id,v_program.definition_digest,p_scheduled_at,clock_timestamp());
 return jsonb_build_object('outcome',v_initialized.initialization_outcome,'campaignId',v_initialized.campaign_id,'status',v_initialized.status,'phase',v_initialized.current_phase,'revision',v_initialized.revision,'definitionId',v_program.definition_id,'definitionDigest',v_program.definition_digest);
end;$function$;
revoke all on function public.initialize_default_campaign_for_game_v1(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.initialize_default_campaign_for_game_v1(uuid,timestamptz) to service_role;

create or replace function public.ensure_ready_game_campaign_v1() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
begin perform public.initialize_default_campaign_for_game_v1(new.id,coalesce(new.started_at,clock_timestamp())); return new; end;$function$;
drop trigger if exists ensure_ready_game_campaign on public.game_sessions;
create trigger ensure_ready_game_campaign after insert or update of status,provisioning_status,provisioning_pack_id,provisioning_pack_version on public.game_sessions for each row when (new.status='active' and new.provisioning_status='ready') execute function public.ensure_ready_game_campaign_v1();

create or replace function public.record_campaign_outcome_evidence_v1(p_game_session_id uuid,p_recovery_readiness_basis_points integer,p_evidence_digest text,p_observed_at timestamptz default clock_timestamp()) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare v_revision bigint;
begin
 if p_game_session_id is null or p_recovery_readiness_basis_points not between 0 and 10000 or p_evidence_digest !~ '^sha256:[0-9a-f]{64}$' or p_observed_at is null then raise exception 'CAMPAIGN_OUTCOME_EVIDENCE_INVALID' using errcode='P0001'; end if;
 if not exists(select 1 from public.game_sessions where id=p_game_session_id and status='active' and provisioning_status='ready') then raise exception 'CAMPAIGN_OUTCOME_EVIDENCE_GAME_INVALID' using errcode='P0001'; end if;
 select coalesce(max(evidence_revision),0)+1 into v_revision from public.campaign_outcome_evidence_snapshots where game_session_id=p_game_session_id;
 insert into public.campaign_outcome_evidence_snapshots(game_session_id,evidence_revision,recovery_readiness_basis_points,evidence_digest,observed_at) values(p_game_session_id,v_revision,p_recovery_readiness_basis_points,p_evidence_digest,p_observed_at);
 return jsonb_build_object('gameSessionId',p_game_session_id,'evidenceRevision',v_revision,'recoveryReadinessBasisPoints',p_recovery_readiness_basis_points,'evidenceDigest',p_evidence_digest,'observedAt',p_observed_at);
end;$function$;
revoke all on function public.record_campaign_outcome_evidence_v1(uuid,integer,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_campaign_outcome_evidence_v1(uuid,integer,text,timestamptz) to service_role;

create or replace function public.publish_campaign_market_event_v1(p_game_session_id uuid,p_idempotency_key text,p_headline text,p_explanation text,p_category text,p_scope text,p_target_key text,p_sentiment text,p_magnitude_basis_points integer,p_duration_ticks integer,p_published_at timestamptz default clock_timestamp()) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare v_existing public.stock_market_events%rowtype; v_tick integer; v_magnitude numeric; v_inserted public.stock_market_events%rowtype;
begin
 if p_game_session_id is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' or length(btrim(coalesce(p_headline,''))) not between 1 and 300 or length(btrim(coalesce(p_explanation,''))) not between 1 and 4000 or p_category not in ('geopolitical','war_conflict','natural_disaster','supply_chain','resource_shock','policy','macro','sector','country','company','technology','infrastructure','energy','agriculture','finance') or p_scope not in ('global','country','sector','ticker') or p_sentiment not in ('positive','negative','neutral','mixed') or p_magnitude_basis_points not between -10000 and 10000 or p_duration_ticks not between 1 and 52 or p_published_at is null then raise exception 'CAMPAIGN_MARKET_EVENT_INVALID' using errcode='P0001'; end if;
 if p_scope='global' and nullif(btrim(coalesce(p_target_key,'')),'') is not null then raise exception 'CAMPAIGN_MARKET_EVENT_TARGET_INVALID' using errcode='P0001'; end if;
 if p_scope<>'global' and nullif(btrim(coalesce(p_target_key,'')),'') is null then raise exception 'CAMPAIGN_MARKET_EVENT_TARGET_INVALID' using errcode='P0001'; end if;
 select * into v_existing from public.stock_market_events where game_session_id=p_game_session_id and shock_id=p_idempotency_key;
 if found then return jsonb_build_object('outcome','replayed','shockId',v_existing.shock_id,'createdTick',v_existing.created_tick); end if;
 if not exists(select 1 from public.game_sessions where id=p_game_session_id and status='active' and lifecycle_state='active' and provisioning_status='ready') then raise exception 'CAMPAIGN_MARKET_EVENT_GAME_INVALID' using errcode='P0001'; end if;
 v_tick:=public.get_current_stock_market_tick_index_v2(p_game_session_id)+1; v_magnitude:=p_magnitude_basis_points::numeric/10000;
 insert into public.stock_market_events(game_session_id,shock_id,scope,target_key,magnitude,decay,confidence,volatility_impact,volume_impact,headline,explanation,created_tick,expires_tick,is_active,category,sentiment,source,visibility,metadata) values(p_game_session_id,p_idempotency_key,p_scope,nullif(btrim(coalesce(p_target_key,'')),''),v_magnitude,case when p_duration_ticks<=3 then 0.35 when p_duration_ticks<=6 then 0.22 else 0.14 end,0.90,least(abs(v_magnitude)*0.50,0.08),least(abs(v_magnitude)*4.00,0.75),btrim(p_headline),btrim(p_explanation),v_tick,v_tick+p_duration_ticks,true,p_category,p_sentiment,'system','public',jsonb_build_object('sourceType','campaign','campaignEffectKey',p_idempotency_key,'publishedAt',p_published_at)) returning * into v_inserted;
 return jsonb_build_object('outcome','applied','shockId',v_inserted.shock_id,'createdTick',v_inserted.created_tick,'magnitude',v_inserted.magnitude);
end;$function$;
revoke all on function public.publish_campaign_market_event_v1(uuid,text,text,text,text,text,text,text,integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.publish_campaign_market_event_v1(uuid,text,text,text,text,text,text,text,integer,integer,timestamptz) to service_role;

create or replace function public.publish_campaign_notification_v1(p_game_session_id uuid,p_idempotency_key text,p_title text,p_summary text,p_priority text,p_display_mode text,p_notification_type text,p_published_at timestamptz default clock_timestamp()) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare v_notification public.notifications%rowtype; v_inserted integer:=0; v_existing integer:=0;
begin
 if p_game_session_id is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' or length(btrim(coalesce(p_title,''))) not between 1 and 300 or length(btrim(coalesce(p_summary,''))) not between 1 and 4000 or length(btrim(coalesce(p_priority,''))) not between 1 and 32 or length(btrim(coalesce(p_display_mode,''))) not between 1 and 64 or length(btrim(coalesce(p_notification_type,''))) not between 1 and 64 or p_published_at is null then raise exception 'CAMPAIGN_NOTIFICATION_INVALID' using errcode='P0001'; end if;
 select * into v_notification from public.notifications where game_session_id=p_game_session_id and source_type='campaign' and source_id=p_idempotency_key and notification_type=p_notification_type;
 if not found then insert into public.notifications(game_session_id,source_type,source_id,notification_type,title,summary,priority,display_mode,payload,published_at) values(p_game_session_id,'campaign',p_idempotency_key,p_notification_type,btrim(p_title),btrim(p_summary),btrim(p_priority),btrim(p_display_mode),jsonb_build_object('campaignEffectKey',p_idempotency_key),p_published_at) returning * into v_notification; end if;
 with inserted as (insert into public.notification_deliveries(notification_id,game_session_id,player_id,delivered_at) select v_notification.id,p_game_session_id,player_row.id,p_published_at from public.players as player_row where player_row.game_session_id=p_game_session_id and player_row.status='active' on conflict(notification_id,player_id) do nothing returning id) select count(*)::integer into v_inserted from inserted;
 select count(*)::integer into v_existing from public.notification_deliveries where notification_id=v_notification.id and game_session_id=p_game_session_id;
 return jsonb_build_object('outcome',case when v_inserted=0 then 'replayed' else 'applied' end,'notificationId',v_notification.public_notification_id,'insertedDeliveries',v_inserted,'totalDeliveries',v_existing);
end;$function$;
revoke all on function public.publish_campaign_notification_v1(uuid,text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.publish_campaign_notification_v1(uuid,text,text,text,text,text,text,timestamptz) to service_role;

create or replace function public.apply_campaign_store_scarcity_v1(p_game_session_id uuid,p_idempotency_key text,p_definition_id text,p_item_keys text[],p_scarcity_band text,p_event_multiplier numeric,p_expires_at timestamptz,p_applied_at timestamptz default clock_timestamp()) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions,pg_temp as $function$
declare v_request jsonb; v_digest text; v_receipt public.campaign_effect_application_receipts%rowtype; v_affected integer;
begin
 if p_game_session_id is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' or p_definition_id !~ '^[a-z0-9][a-z0-9._:-]{0,127}$' or coalesce(array_length(p_item_keys,1),0) not between 1 and 100 or p_scarcity_band not in ('abundant','available','constrained','scarce','unavailable') or p_event_multiplier not between 0.5 and 4 or p_applied_at is null then raise exception 'CAMPAIGN_SCARCITY_INVALID' using errcode='P0001'; end if;
 v_request:=jsonb_build_object('definitionId',p_definition_id,'itemKeys',to_jsonb(p_item_keys),'scarcityBand',p_scarcity_band,'eventMultiplier',p_event_multiplier,'expiresAt',p_expires_at); v_digest:=encode(extensions.digest(v_request::text,'sha256'),'hex');
 select * into v_receipt from public.campaign_effect_application_receipts where game_session_id=p_game_session_id and idempotency_key=p_idempotency_key for update;
 if found then if v_receipt.request_digest<>v_digest or v_receipt.effect_kind<>'set_store_scarcity' then raise exception 'CAMPAIGN_SCARCITY_IDEMPOTENCY_CONFLICT' using errcode='P0001'; end if; return jsonb_build_object('outcome','replayed','affectedItems',0); end if;
 if not exists(select 1 from public.game_sessions where id=p_game_session_id and status='active' and lifecycle_state='active' and provisioning_status='ready') then raise exception 'CAMPAIGN_SCARCITY_GAME_INVALID' using errcode='P0001'; end if;
 update public.game_session_item_supply as supply_row set scarcity_band=p_scarcity_band,event_multiplier=p_event_multiplier,source_event_key=p_definition_id,effective_at=p_applied_at,expires_at=p_expires_at,version=supply_row.version+1 where supply_row.game_session_id=p_game_session_id and supply_row.country_code='*' and supply_row.item_key=any(p_item_keys); get diagnostics v_affected=row_count;
 if v_affected<>cardinality(p_item_keys) then raise exception 'CAMPAIGN_SCARCITY_ITEM_MISSING' using errcode='P0001'; end if;
 insert into public.campaign_effect_application_receipts(game_session_id,idempotency_key,effect_kind,request_digest,applied_at) values(p_game_session_id,p_idempotency_key,'set_store_scarcity',v_digest,p_applied_at);
 return jsonb_build_object('outcome','applied','affectedItems',v_affected);
end;$function$;
revoke all on function public.apply_campaign_store_scarcity_v1(uuid,text,text,text[],text,numeric,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_campaign_store_scarcity_v1(uuid,text,text,text[],text,numeric,timestamptz,timestamptz) to service_role;

create or replace function public.verify_provisioned_game_v1(p_game_session_id uuid,p_staff_user_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_game public.game_sessions%rowtype; v_market_assets integer; v_contracts integer; v_store_items integer; v_world_locations integer; v_world_routes integer; v_world_countries integer; v_arrival_class_grants integer; v_messaging_policies integer; v_marketplace_policies integer; v_campaigns integer;
begin
 if p_game_session_id is null or p_staff_user_id is null then raise exception 'GAME_PROVISIONING_VERIFICATION_REQUEST_INVALID' using errcode='P0001'; end if;
 select * into v_game from public.game_sessions where id=p_game_session_id and owner_staff_user_id=p_staff_user_id;
 if not found or v_game.status<>'active' or v_game.provisioning_status<>'ready' or v_game.provisioning_pack_id<>'econovaria.beta-seed-pack.v1' or v_game.provisioned_at is null then raise exception 'GAME_PROVISIONING_VERIFICATION_FAILED' using errcode='P0001'; end if;
 select count(*)::integer into v_market_assets from public.game_session_stock_assets where game_session_id=p_game_session_id and is_active;
 select count(*)::integer into v_contracts from public.game_session_contracts where game_session_id=p_game_session_id and status='active' and visibility='public';
 select count(*)::integer into v_store_items from public.store_items where game_session_id=p_game_session_id and status='active' and visibility='visible';
 select count(*)::integer into v_world_locations from public.world_location_states where game_session_id=p_game_session_id;
 select count(*)::integer into v_world_routes from public.world_route_states where game_session_id=p_game_session_id;
 select count(*)::integer into v_world_countries from public.world_country_runtime where game_session_id=p_game_session_id;
 select count(*)::integer into v_arrival_class_grants from public.arrival_class_grant_runtime where game_session_id=p_game_session_id;
 select count(*)::integer into v_messaging_policies from public.message_game_policies where game_session_id=p_game_session_id;
 select count(*)::integer into v_marketplace_policies from public.marketplace_policies where game_session_id=p_game_session_id;
 select count(*)::integer into v_campaigns from public.campaign_instances as campaign_row where campaign_row.game_session_id=p_game_session_id and campaign_row.pack_id=v_game.provisioning_pack_id and campaign_row.pack_version=v_game.provisioning_pack_version and campaign_row.status in ('active','paused','emergency_disabled','completed') and exists(select 1 from public.campaign_program_definitions as program_row where program_row.pack_id=campaign_row.pack_id and program_row.pack_version=campaign_row.pack_version and program_row.definition_id=campaign_row.definition_id and program_row.definition_digest=campaign_row.definition_digest and program_row.status='active');
 if v_market_assets<>240 or v_contracts<30 or v_store_items<50 or v_world_locations<>50 or v_world_routes<>13 or v_world_countries<>10 or v_arrival_class_grants<>8 or v_messaging_policies<>1 or v_marketplace_policies<>1 or v_campaigns<>1 or not exists(select 1 from public.seed_content_releases where game_session_id=p_game_session_id and pack_id='econovaria.beta-seed-pack.v1' and status='applied_active') or not exists(select 1 from public.world_runtime_instances where game_session_id=p_game_session_id) or not exists(select 1 from public.game_feature_activation_evidence where game_session_id=p_game_session_id and story_status='active' and arrival_grant_status='active' and progression_status='active') then raise exception 'GAME_PROVISIONING_VERIFICATION_FAILED' using errcode='P0001'; end if;
 return jsonb_build_object('ready',true,'gameSessionId',v_game.id,'provisioningStatus',v_game.provisioning_status,'packId',v_game.provisioning_pack_id,'packVersion',v_game.provisioning_pack_version,'counts',jsonb_build_object('marketAssets',v_market_assets,'contracts',v_contracts,'storeItems',v_store_items,'worldLocations',v_world_locations,'worldRoutes',v_world_routes,'worldCountries',v_world_countries,'arrivalClassGrants',v_arrival_class_grants,'messagingPolicies',v_messaging_policies,'marketplacePolicies',v_marketplace_policies,'campaignInstances',v_campaigns));
end;$function$;
revoke all on function public.verify_provisioned_game_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.verify_provisioned_game_v1(uuid,uuid) to service_role;

commit;
