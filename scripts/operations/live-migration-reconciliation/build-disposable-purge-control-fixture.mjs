import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const seedFile = '20260918093319_business_financial_market_purge_registry_v1.sql';
export const seedSha256 = '512e68067b38b3cc8258a42d4d2985712b0d600641c82c9e1a9aa477a3014ed5';
export function buildDisposablePurgeControlFixture(source) {
  assert.equal(createHash('sha256').update(source).digest('hex'), seedSha256, 'Canonical seed source drift');
  const registry = source.match(/insert into private\.game_data_purge_table_registry \([\s\S]*?(?=\ntruncate table private\.game_data_purge_delete_order_v1;)/)?.[0];
  const order = source.match(/insert into private\.game_data_purge_delete_order_v1 \([\s\S]*?(?=\n\s*commit;)/)?.[0];
  assert(registry && order, 'Canonical seed boundaries missing');
  return `-- Repository-derived control fixtures for a schema-only DISPOSABLE restore.
-- No application rows, hosted registry rows, control/arming rows or history repair.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $disposable$ begin
 if (inet_server_addr() is not null and not (inet_server_addr() in ('127.0.0.1'::inet,'::1'::inet) and current_database() ~ '^ref032_disposable_[a-z0-9_]+$')) or current_setting('ref032.disposable_fixture',true) is distinct from 'repository-only-v1' then raise exception 'DISPOSABLE_FIXTURE_LOCAL_ONLY'; end if;
 if exists(select 1 from private.game_data_purge_table_registry) or exists(select 1 from private.game_data_purge_delete_order_v1) then raise exception 'DISPOSABLE_FIXTURE_TARGET_NOT_EMPTY'; end if;
end $disposable$;
${registry}
${order}
do $verify$ declare r record; g record; o record; begin
 select * into r from public.get_game_data_purge_registry_digest_v1();
 select * into g from public.get_game_data_purge_fk_graph_digest_v1();
 select * into o from public.get_game_data_purge_delete_order_digest_v1();
 if r.table_count is distinct from 207::bigint or r.registry_sha256 is distinct from '7bcda40cfba058b0a712782671ba91cb3c50b29adb1bbe105dfbf84998907ac3' then raise exception 'DISPOSABLE_REGISTRY_BASELINE_MISMATCH'; end if;
 if g.edge_count is distinct from 456::bigint or g.fk_graph_sha256 is distinct from 'fe88cafd56ca4c21ab3c1d34385e21f4c3d8be201eae44ee7f5539a34a98f329' then raise exception 'DISPOSABLE_GRAPH_BASELINE_MISMATCH'; end if;
 if o.table_count is distinct from 206::bigint or o.order_sha256 is distinct from '19c4c6bf8e005c53c6dddfadcf63d5c5e955307a63d93b0343f48d73c4504897' then raise exception 'DISPOSABLE_ORDER_BASELINE_MISMATCH'; end if;
end $verify$;
commit;
`;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = await readFile(new URL(`../../../backend/supabase/migrations/${seedFile}`,import.meta.url),'utf8');
  process.stdout.write(buildDisposablePurgeControlFixture(source));
}
