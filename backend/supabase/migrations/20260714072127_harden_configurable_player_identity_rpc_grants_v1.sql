revoke all on function public.create_player_with_identity_and_credential(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public;
revoke all on function public.create_player_with_identity_and_credential(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from anon;
revoke all on function public.create_player_with_identity_and_credential(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from authenticated;
grant execute on function public.create_player_with_identity_and_credential(
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;

revoke all on function public.set_player_identity_and_access_code(
  uuid,
  uuid,
  text,
  text,
  text
) from public;
revoke all on function public.set_player_identity_and_access_code(
  uuid,
  uuid,
  text,
  text,
  text
) from anon;
revoke all on function public.set_player_identity_and_access_code(
  uuid,
  uuid,
  text,
  text,
  text
) from authenticated;
grant execute on function public.set_player_identity_and_access_code(
  uuid,
  uuid,
  text,
  text,
  text
) to service_role;
