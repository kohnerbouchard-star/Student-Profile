begin;
create or replace function public.record_game_data_purge_failure_v1(p_request_id uuid,p_stage text,p_error text)
returns boolean
language plpgsql security definer
set search_path=pg_catalog,private
as $$
begin
  update private.game_data_purge_requests
  set status=case when p_stage='db' then 'r2_deleted' else 'confirmed' end,
      last_error=left(coalesce(p_error,'unknown purge failure'),1000),updated_at=clock_timestamp()
  where id=p_request_id and status in ('r2_deleting','db_deleting');
  return found;
end;
$$;
commit;
