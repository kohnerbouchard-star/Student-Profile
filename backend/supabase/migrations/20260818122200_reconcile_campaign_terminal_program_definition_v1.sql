begin;

do $repair$
declare
  v_pack_id constant text := 'econovaria.beta-seed-pack.v1';
  v_pack_version constant text := '1.0.0-beta';
  v_definition_id constant text := 'campaign.beta.primary.v1';
  v_stale_digest constant text := 'sha256:924b26199e09db387040b64fe9e85da907d6f6e54713b852eb9625571f7bfc21';
  v_expected_digest constant text := 'sha256:ded8e2bb638c609553cbbd70b26ba6577109e570856edd503043e8d054877567';
  v_current_digest text;
  v_program jsonb;
  v_reconciled_program jsonb;
  v_expected_locations jsonb := '["loc_northreach_frostgate_v1","loc_yrethia_sableport_v1","loc_thaloris_dusk_harbor_v1","loc_solvend_aurora_spire_v1","loc_eldoran_crescent_bay_v1","loc_valerion_glassfall_v1","loc_lumenor_starfall_v1","loc_xalvoria_emberhall_v1","loc_dravenlok_ironhold_v1","loc_syndalis_blacklight_v1"]'::jsonb;
begin
  select definition_digest, program
  into v_current_digest, v_program
  from public.campaign_program_definitions
  where pack_id = v_pack_id
    and pack_version = v_pack_version
    and definition_id = v_definition_id
  for update;

  if not found then
    raise exception 'CAMPAIGN_PRIMARY_PROGRAM_MISSING' using errcode = 'P0001';
  end if;

  if v_current_digest = v_expected_digest then
    if public.campaign_program_digest_v1(v_program) <> v_expected_digest
       or v_program->>'definitionDigest' <> v_expected_digest
    then
      raise exception 'CAMPAIGN_PRIMARY_PROGRAM_EXPECTED_DIGEST_INVALID' using errcode = 'P0001';
    end if;
    return;
  end if;

  if v_current_digest <> v_stale_digest
     or public.campaign_program_digest_v1(v_program) <> v_stale_digest
     or v_program->>'definitionDigest' <> v_stale_digest
  then
    raise exception 'CAMPAIGN_PRIMARY_PROGRAM_UNEXPECTED_DRIFT' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.campaign_instances
    where pack_id = v_pack_id
      and pack_version = v_pack_version
      and definition_id = v_definition_id
      and definition_digest = v_stale_digest
  ) then
    raise exception 'CAMPAIGN_PRIMARY_PROGRAM_STALE_DIGEST_PINNED' using errcode = 'P0001';
  end if;

  v_reconciled_program := jsonb_set(
    v_program,
    '{terminalEvents,reconstruction,effects,3,targetLocationIds}',
    v_expected_locations,
    false
  );
  v_reconciled_program := jsonb_set(
    v_reconciled_program,
    '{terminalEvents,continuedConflict,effects,3,targetLocationIds}',
    v_expected_locations,
    false
  );
  v_reconciled_program := jsonb_set(
    v_reconciled_program,
    '{definitionDigest}',
    to_jsonb(v_expected_digest),
    true
  );

  if public.campaign_program_digest_v1(v_reconciled_program) <> v_expected_digest then
    raise exception 'CAMPAIGN_PRIMARY_PROGRAM_RECONCILIATION_DIGEST_MISMATCH' using errcode = 'P0001';
  end if;

  update public.campaign_program_definitions
  set definition_digest = v_expected_digest,
      program = v_reconciled_program
  where pack_id = v_pack_id
    and pack_version = v_pack_version
    and definition_id = v_definition_id;

  if not found then
    raise exception 'CAMPAIGN_PRIMARY_PROGRAM_RECONCILIATION_UPDATE_MISSING' using errcode = 'P0001';
  end if;
end;
$repair$;

comment on table public.campaign_program_definitions is
  'Immutable versioned Campaign programs. The 2026-08-18 reconciliation repairs only the known pre-runtime stale primary-program row when no Campaign instance is pinned to that stale digest, and fails closed on any other drift.';

commit;
