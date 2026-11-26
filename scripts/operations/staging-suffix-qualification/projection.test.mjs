import test from 'node:test';
import {loadBatch} from './compiler.mjs';
import {withSyntheticPostgres} from './native-test-support.mjs';
import {projectionFixture,projectionAssertions} from './manufacturing-fixture.mjs';
test('actual immutable manufacturing projection preserves four decimals and canonical holding', {skip:!process.env.STAGING_SUFFIX_SYNTHETIC_PG_BIN&&'NOT_RUN: verified native PG17 required'},async()=>{
 const rows=await loadBatch(process.cwd());
 const body=rows[12].body;
 const start=body.indexOf('create or replace function economy_private.refresh_manufacturing_inventory_projection_v1(');
 const end=body.indexOf('$function$;',body.indexOf('as $function$',start)+14);
 if(start<0||end<0)throw Error('IMMUTABLE_MANUFACTURING_BOUNDARY_DRIFT');
 const definition=body.slice(start,end+11);
 await withSyntheticPostgres(async({sql})=>sql('postgres',projectionFixture+definition+projectionAssertions));
});
