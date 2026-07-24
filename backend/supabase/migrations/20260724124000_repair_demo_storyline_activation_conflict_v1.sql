begin;

-- Repair the pre-existing demo Story initializer without rewriting its data or
-- changing its public return contract. The function returns a column named
-- game_session_id, so a positional ON CONFLICT target using the same name is
-- ambiguous inside PL/pgSQL. Bind the upsert to the schema-owned constraint.
do $repair$
declare
  v_signature regprocedure :=
    'public.initialize_demo_storyline_for_game(uuid,text)'::regprocedure;
  v_definition text;
  v_repaired_definition text;
begin
  select pg_get_functiondef(v_signature)
  into v_definition;

  if v_definition is null then
    raise exception 'DEMO_STORYLINE_INITIALIZER_MISSING' using errcode = 'P0001';
  end if;

  if v_definition ~* 'on\s+conflict\s+on\s+constraint\s+game_session_storylines_scope_unique' then
    return;
  end if;

  v_repaired_definition := regexp_replace(
    v_definition,
    'on\s+conflict\s*\(\s*game_session_id\s*,\s*storyline_id\s*\)',
    'on conflict on constraint game_session_storylines_scope_unique',
    'i'
  );

  if v_repaired_definition = v_definition then
    raise exception 'DEMO_STORYLINE_CONFLICT_TARGET_NOT_FOUND' using errcode = 'P0001';
  end if;

  execute v_repaired_definition;
end;
$repair$;

comment on function public.initialize_demo_storyline_for_game(uuid, text) is
  'Creates and activates the deterministic Econovaria demo storyline for one game. Activation replay is bound to the named game/storyline scope constraint to avoid PL/pgSQL variable ambiguity.';

commit;
