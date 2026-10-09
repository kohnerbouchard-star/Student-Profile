begin;

-- Attempt generations increase on every claim and survive operator recovery.
create function public.complete_campaign_effect_command_v2(
  p_command_public_id text, p_completed_at timestamptz, p_expected_attempt_count integer
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  if p_command_public_id is null or p_command_public_id !~ '^cec_[0-9a-f]{32}$'
    or p_completed_at is null or p_expected_attempt_count is null
    or p_expected_attempt_count not between 1 and 25 then
    raise exception 'CAMPAIGN_COMMAND_COMPLETION_INVALID' using errcode = 'P0001';
  end if;
  update public.campaign_effect_commands
  set status = 'completed', completed_at = p_completed_at, last_error_code = null
  where public_id = p_command_public_id and attempt_count = p_expected_attempt_count
    and status = 'processing';
  if found then return true; end if;
  -- A repeated acknowledgement is read-only, preserving the first completion time.
  return exists (
    select 1 from public.campaign_effect_commands
    where public_id = p_command_public_id and attempt_count = p_expected_attempt_count
      and status = 'completed'
  );
end;
$function$;

create function public.fail_campaign_effect_command_v2(
  p_command_public_id text, p_error_code text, p_expected_attempt_count integer
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  if p_command_public_id is null or p_command_public_id !~ '^cec_[0-9a-f]{32}$'
    or p_error_code is null or p_error_code !~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    or p_expected_attempt_count is null or p_expected_attempt_count not between 1 and 25 then
    raise exception 'CAMPAIGN_COMMAND_FAILURE_INVALID' using errcode = 'P0001';
  end if;
  update public.campaign_effect_commands
  set status = 'failed', last_error_code = p_error_code, claimed_at = null
  where public_id = p_command_public_id and attempt_count = p_expected_attempt_count
    and status = 'processing';
  return found;
end;
$function$;

-- Old workers cannot acknowledge without ownership. Retain names/signatures.
create or replace function public.complete_campaign_effect_command_v1(
  p_command_public_id text, p_completed_at timestamptz
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  raise exception 'CAMPAIGN_CLAIM_OWNERSHIP_REQUIRED' using errcode = 'P0001';
end;
$function$;

create or replace function public.fail_campaign_effect_command_v1(
  p_command_public_id text, p_error_code text
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $function$
begin
  raise exception 'CAMPAIGN_CLAIM_OWNERSHIP_REQUIRED' using errcode = 'P0001';
end;
$function$;

revoke all on function public.complete_campaign_effect_command_v2(text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.fail_campaign_effect_command_v2(text, text, integer) from public, anon, authenticated;
grant execute on function public.complete_campaign_effect_command_v2(text, timestamptz, integer) to service_role;
grant execute on function public.fail_campaign_effect_command_v2(text, text, integer) to service_role;

commit;
