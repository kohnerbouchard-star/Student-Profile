\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

do $verify$
declare
  v_threads bigint;
  v_messages bigint;
  v_audits bigint;
begin
  select count(*) into v_threads
  from public.message_threads
  where creation_idempotency_key like 'messaging-acceptance:%';

  select count(*) into v_messages
  from public.messages
  where idempotency_key like 'messaging-acceptance:%';

  select count(*) into v_audits
  from public.message_moderation_audit
  where idempotency_key like 'messaging-acceptance:%';

  if v_threads <> 0 or v_messages <> 0 or v_audits <> 0 then
    raise exception 'MESSAGING_ACCEPTANCE_RESIDUE';
  end if;
end;
$verify$;

select jsonb_build_object(
  'schemaVersion', 1,
  'zeroResidue', true,
  'threads', 0,
  'messages', 0,
  'audits', 0
)::text;
