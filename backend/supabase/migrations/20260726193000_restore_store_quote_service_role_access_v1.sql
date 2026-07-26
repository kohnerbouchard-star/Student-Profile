begin;

-- Store quote rows remain server-owned. Browser roles must never read or create
-- quote records directly; the authenticated Player Edge route derives scope
-- from the HttpOnly Player session and uses the service-owned client.
revoke all on table public.store_purchase_quotes
  from public, anon, authenticated;

-- Quote creation requires only an insert followed by a scoped read of the
-- generated public quote key. Quote consumption and mutation remain inside the
-- existing SECURITY DEFINER purchase RPC, so update/delete are not granted.
grant select, insert on table public.store_purchase_quotes to service_role;

-- Quote pricing converts the catalog currency into the Player's assigned
-- country currency. The conversion function remains unavailable to browser
-- roles and is executable only by the server-owned service client.
revoke execute on function public.convert_currency_amount(uuid, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.convert_currency_amount(uuid, numeric, text, text)
  to service_role;

do $$
begin
  if not has_table_privilege(
    'service_role',
    'public.store_purchase_quotes',
    'select,insert'
  ) then
    raise exception 'service_role privilege contract failed for store_purchase_quotes';
  end if;

  if has_table_privilege('anon', 'public.store_purchase_quotes', 'select')
     or has_table_privilege('anon', 'public.store_purchase_quotes', 'insert')
     or has_table_privilege('anon', 'public.store_purchase_quotes', 'update')
     or has_table_privilege('anon', 'public.store_purchase_quotes', 'delete') then
    raise exception 'anon must not access store_purchase_quotes directly';
  end if;

  if has_table_privilege('authenticated', 'public.store_purchase_quotes', 'select')
     or has_table_privilege('authenticated', 'public.store_purchase_quotes', 'insert')
     or has_table_privilege('authenticated', 'public.store_purchase_quotes', 'update')
     or has_table_privilege('authenticated', 'public.store_purchase_quotes', 'delete') then
    raise exception 'authenticated must not access store_purchase_quotes directly';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.convert_currency_amount(uuid,numeric,text,text)',
    'execute'
  ) then
    raise exception 'service_role execute contract failed for convert_currency_amount';
  end if;

  if has_function_privilege(
    'anon',
    'public.convert_currency_amount(uuid,numeric,text,text)',
    'execute'
  ) then
    raise exception 'anon must not execute convert_currency_amount directly';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.convert_currency_amount(uuid,numeric,text,text)',
    'execute'
  ) then
    raise exception 'authenticated must not execute convert_currency_amount directly';
  end if;
end;
$$;

comment on table public.store_purchase_quotes is
  'Short-lived Player Store quotes. Browser roles have no direct privileges; authenticated Player Edge routes use the service-owned client after deriving game and Player scope from the Player session.';

comment on function public.convert_currency_amount(uuid, numeric, text, text) is
  'Server-owned currency conversion used by scoped economic operations. Browser roles cannot execute this function directly.';

notify pgrst, 'reload schema';

commit;
