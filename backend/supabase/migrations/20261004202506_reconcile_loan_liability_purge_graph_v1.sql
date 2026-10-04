-- REF025c1: exact forward convergence; no purge permission or lifecycle change.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $converge$
declare
  target record; definition text; actual text; edges bigint;
  old_graph constant text := 'fe88cafd56ca4c21ab3c1d34385e21f4c3d8be201eae44ee7f5539a34a98f329';
  new_graph constant text := '0c932d6e620cec801b527e81f3e4d3e91bd8d70fd4fb45d6e1a72166ff0c7a82';
begin
  select fk_graph_sha256,edge_count into actual,edges from public.get_game_data_purge_fk_graph_digest_v1();
  if actual is distinct from new_graph or edges is distinct from 460 then
    raise exception 'REF025_UNEXPECTED_PURGE_GRAPH';
  end if;
  for target in select * from (values
    ('public.execute_game_data_purge_db_batch_v2(uuid,integer)', '2f0af0ea1ecbd28c0502209ccba1ef2dbdb95aca22871ca52f2e1d563450123d'),
    ('public.finalize_game_data_purge_v1(uuid)', '09e538800e081a43c083dffaf8754ce57d0c41923f41ced4002a0dd1b9f0a8fc')
  ) as expected(signature,sha256) loop
    definition := pg_get_functiondef(target.signature::regprocedure);
    if encode(sha256(convert_to(definition,'UTF8')),'hex') <> target.sha256
      or (length(definition)-length(replace(definition,old_graph,'')))/length(old_graph) <> 1
      or (length(definition)-length(replace(definition,'v_fk_count <> 456','')))/length('v_fk_count <> 456') <> 1 then
      raise exception 'REF025_UNEXPECTED_PURGE_DEFINITION:%',target.signature;
    end if;
    execute replace(replace(definition,old_graph,new_graph),'v_fk_count <> 456','v_fk_count <> 460');
  end loop;
end;
$converge$;
commit;
