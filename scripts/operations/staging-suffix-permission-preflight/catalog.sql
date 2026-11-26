begin transaction read only;
set local search_path = pg_catalog, pg_temp;
set local statement_timeout = '6s';
set local lock_timeout = '1s';

with login_role as (
  select oid, rolcanlogin, rolsuper from pg_roles where rolname=session_user
), default_setting as (
  select setting, source from pg_settings where name='default_transaction_read_only'
), ledger as (
  select oid, relowner from pg_class where oid=to_regclass('supabase_migrations.schema_migrations')
), altered as (
  select (to_regclass(name))::oid as oid
  from (values ('public.loan_applications'), ('public.player_loans'), ('public.business_inventory')) targets(name)
), replacements as (
  -- These names are CREATE OR REPLACE targets in the exact 15-file suffix.
  -- Test every existing overload conservatively.
  select p.proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join (values
    ('public','complete_campaign_effect_command_v1'),('public','fail_campaign_effect_command_v1'),
    ('public','complete_staff_password_reset_security_v2'),('public','review_player_loan_application_v1'),
    ('private','lock_business_player_loop_authority_v1'),('public','install_owned_business_equipment_v3'),
    ('public','create_owned_business_store_offer_draft_v1'),('public','stock_owned_business_store_offer_v1'),
    ('public','publish_owned_business_store_offer_v1'),('public','read_owned_business_player_loop_options_v1'),
    ('economy_private','refresh_manufacturing_inventory_projection_v1'),
    ('private','lock_business_manufacturing_start_authority_v1'),('public','claim_due_business_manufacturing_jobs_v2'),
    ('public','start_business_manufacturing_job_v2'),('economy_private','validate_business_manufacturing_resources_v2'),
    ('public','complete_business_manufacturing_job_v2'),('public','admin_import_player_roster_v1'),
    ('public','lookup_player_login_identity_v1')
  ) targets(schema_name,routine) on n.nspname=targets.schema_name and p.proname=targets.routine
), mandatory_rewrites as (
  select (to_regprocedure(signature))::oid as oid
  from (values ('public.execute_game_data_purge_db_batch_v2(uuid,integer)'),
    ('public.finalize_game_data_purge_v1(uuid)'), ('public.sync_game_item_catalog_v2(uuid,jsonb)'),
    ('public.validate_economic_asset_core_v2(uuid)')) targets(signature)
), hold_routines as (
  select (to_regprocedure(signature))::oid as oid from (values
    ('staging_campaign.attest_drain(uuid)'),('staging_campaign.seal_v2(uuid)'),
    ('staging_writer_admission.require_drained(uuid)'),('staging_writer_hold.require_apply_hold(uuid)'),
    ('staging_writer_hold.seal_recovery(uuid)')) targets(signature)
)
select json_build_object(
  'transactionReadOnly', current_setting('transaction_read_only')='on',
  'primary', not pg_is_in_recovery(),
  'postgresDatabase', current_database()='postgres',
  'postgresSessionLogin', session_user='postgres' and current_user=session_user,
  'sessionCanLogin', coalesce((select rolcanlogin from login_role),false),
  'sessionSuperuser', coalesce((select rolsuper from login_role),false),
  'defaultReadOnly', coalesce((select setting='on' from default_setting),true),
  'readOnlySourceDefault', coalesce((select source='default' from default_setting),false),
  'readOnlySourceServer', coalesce((select source in ('configuration file','command line','override','environment variable') from default_setting),false),
  'readOnlySourceDatabase', coalesce((select source='database' from default_setting),false),
  'readOnlySourceRole', coalesce((select source='user' from default_setting),false),
  'readOnlySourceDatabaseRole', coalesce((select source='database user' from default_setting),false),
  'readOnlySourceClient', coalesce((select source in ('client','session','interactive','test') from default_setting),false),
  'readOnlySourceOther', coalesce((select source not in ('default','configuration file','command line','override',
    'environment variable','database','user','database user','client','session','interactive','test') from default_setting),true),
  'canCreateRecoverySchema', has_database_privilege(current_database(),'CREATE'),
  'canCreateTemporaryProbe', has_database_privilege(current_database(),'TEMPORARY'),
  'canCreateInBatchSchemas', (select bool_and(coalesce(has_schema_privilege(to_regnamespace(name),'USAGE'),false)
      and coalesce(has_schema_privilege(to_regnamespace(name),'CREATE'),false))
      from (values ('public'),('private'),('economy_private')) targets(name)),
  'ownsExistingRecoverySchema', not exists(select 1 from pg_namespace
      where nspname='recovery_private' and not pg_has_role(nspowner,'USAGE')),
  'ownsAlteredTables', (select bool_and(coalesce(pg_has_role(c.relowner,'USAGE'),false))
      from altered a left join pg_class c on c.oid=a.oid),
  'ownsExistingReplacementRoutines', not exists(select 1 from replacements where not pg_has_role(proowner,'USAGE')),
  'ownsRequiredRewriteTargets', (select bool_and(coalesce(pg_has_role(p.proowner,'USAGE'),false))
      from mandatory_rewrites r left join pg_proc p on p.oid=r.oid),
  'canReadPreconditionTables', (select bool_and(coalesce(has_table_privilege(to_regclass(name),'SELECT'),false))
      from (values ('public.player_sessions'),('staging_campaign.fence')) targets(name)),
  'canLockCampaignFenceRow', coalesce(has_table_privilege(to_regclass('staging_campaign.fence'),'UPDATE'),false),
  'canUseLedgerSchema', coalesce(has_schema_privilege(to_regnamespace('supabase_migrations'),'USAGE'),false),
  'canReadLedger', coalesce((select has_table_privilege(oid,'SELECT') from ledger),false),
  'canInsertLedger', coalesce((select has_table_privilege(oid,'INSERT') from ledger),false),
  'canExclusivelyLockLedger', coalesce((select has_table_privilege(oid,'UPDATE')
      or has_table_privilege(oid,'DELETE') or has_table_privilege(oid,'TRUNCATE')
      or case when current_setting('server_version_num')::integer >= 170000
        then has_table_privilege(oid,'MAINTAIN') else false end from ledger),false),
  'hasDrainObserverPrivilege', pg_has_role('pg_read_all_stats','USAGE'),
  'canExecuteInstalledHoldRoutines', (select bool_and(coalesce(has_function_privilege(p.oid,'EXECUTE'),false)
    and coalesce(has_schema_privilege(p.pronamespace,'USAGE'),false)) from hold_routines r
    left join pg_proc p on p.oid=r.oid)
);

rollback;
