import { readPlayerContractPublicListRoutePath } from './playerContractPublicListRoutePaths.ts';
import { readPlayerContractAcceptanceRoutePath } from './playerContractAcceptanceRoutePaths.ts';
import { readPlayerContractPublicSubmitRoutePath } from './playerContractPublicSubmitRoutePaths.ts';
declare const Deno: { test(name:string,run:()=>void|Promise<void>):void; readTextFile(path:URL):Promise<string> };
Deno.test('Both runtime roots omit retired null Contract routing and preserve public handlers',async()=>{
 for(const root of ['player-api','classroom-api']){
  const s=await Deno.readTextFile(new URL(`../../../../supabase/functions/${root}/dispatchPlayerEconomyRoutes.ts`,import.meta.url));
  for(const old of ['readPlayerContractRoutePath','handlePlayerContractRequest'])if(s.includes(old))throw new Error(`Retired ${old} reintroduced`);
  for(const current of ['handlePlayerContractAcceptanceRequest','handlePlayerContractPublicListRequest','handlePlayerContractPublicSubmitRequest'])if(!s.includes(current))throw new Error(`Missing ${current}`);
 }
});
Deno.test('Canonical public Contract route parsers remain authoritative',()=>{
 if(!readPlayerContractPublicListRoutePath('/players/me/contracts'))throw new Error('Missing list');
 const key='con_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
 if(readPlayerContractAcceptanceRoutePath(`/players/me/contracts/${key}/accept`)?.kind !== 'accept')throw new Error('Missing accept');
 if(readPlayerContractPublicSubmitRoutePath(`/players/me/contracts/${key}/submit`)?.kind !== 'submit')throw new Error('Missing submit');
});
