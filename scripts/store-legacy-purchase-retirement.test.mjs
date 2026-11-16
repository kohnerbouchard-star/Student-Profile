import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const root='backend/src/domains/store/';
test('Old disconnected Store island stays retired',()=>{
 for(const p of ['api/playerStorePurchaseHttpHandler.ts','api/playerStorePurchaseRequestParser.ts','api/playerStoreCatalogHttpHandler.ts','infrastructure/supabaseStorePurchaseRepository.ts','infrastructure/storePurchaseRowMapping.ts','infrastructure/supabasePlayerStorePublicRepository.ts','infrastructure/supabasePlayerStoreOfferPublicRepository.ts'])assert.equal(existsSync(root+p),false,p);
});
test('Both runtime roots keep public Store ownership',()=>{
 for(const r of ['player-api','classroom-api']){
  const s=read(`backend/supabase/functions/${r}/dispatchPlayerEconomyRoutes.ts`);
  assert.match(s,/handlePlayerStorePublicRequest/);assert.doesNotMatch(s,/handlePlayerStoreQuoteRequest|handlePlayerStorePurchaseRequest|handlePlayerStorePurchaseHistoryRequest|handlePlayerStoreCatalogRequest/);
 }
});
test('Current funded offer and read authorities and shared history survive',()=>{
 const s=read(root+'api/playerStorePublicHttpHandler.ts');
 for(const name of ['SupabasePlayerStoreFundingPublicRepository','SupabasePlayerStoreOfferProductPublicRepository','SupabasePlayerStorePublicReadRepository'])assert.ok(s.includes(name));
 for(const p of ['contracts/storePurchaseContracts.ts','purchaseHistoryTypes.ts'])assert.ok(existsSync(root+p));
});
test('Staff Store catalog is not retired with old Player wrapper',()=>{
 for(const p of ['backend/supabase/functions/staff-api/index.ts','backend/supabase/functions/classroom-api/dispatchStaffRoutes.ts'])assert.match(read(p), /store\/api\/storeCatalogHttpHandler\.ts/);
 for(const p of ['api/storeCatalogHttpHandler.ts','api/storeCatalogRouteHandler.ts','infrastructure/supabaseStoreCatalogRepository.ts'])assert.ok(existsSync(root+p));
});
