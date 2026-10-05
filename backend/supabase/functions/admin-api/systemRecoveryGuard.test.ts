import { systemRecoveryAccessAllowed } from '../../../src/platform/supabase/edgeStaffSession.ts';
const staging = 'https://eecvbssdvarfcykcfrny.supabase.co';
const user = '00000000-0000-4000-8000-000000000001';
const session = '00000000-0000-4000-8000-000000000002';
const token = (sub=user,sid=session) => `header.${btoa(JSON.stringify({sub,session_id:sid}))}.signature`;
Deno.test('staging guard denies missing/revoked/restricted sessions and never forwards a recovery exception', async () => {
  for (const response of [{data:false,error:null},{data:null,error:{message:'unavailable'}}]) {
    const service = {rpc: async (_name: string, args: unknown) => {
      if (JSON.stringify(args)!==JSON.stringify({p_user:user,p_session:session,p_digest:null})) throw Error('wrong guard identity');
      return response;
    }};
    if(await systemRecoveryAccessAllowed(staging,service as any,user,token())) throw Error('restricted access allowed');
  }
  const service={rpc:async()=>{throw Error('must not query malformed identities');}};
  for(const value of ['bad',token('other'),token(user,'bad')]) {
    if(await systemRecoveryAccessAllowed(staging,service as any,user,value)) throw Error('invalid bearer accepted');
  }
});
Deno.test('staging guard accepts only explicit boolean success and preserves production behavior', async () => {
  const yes={rpc:async()=>({data:true,error:null})};
  if(!await systemRecoveryAccessAllowed(staging,yes as any,user,token())) throw Error('valid session denied');
  const noCalls={rpc:async()=>{throw Error('production queried recovery state');}};
  if(!await systemRecoveryAccessAllowed('https://cgiukdjwicykrmtkhudh.supabase.co',noCalls as any,user,token())) throw Error('production changed');
});

Deno.test('shared Staff resolver rejects restricted access before any Staff data query', async () => {
  const { resolveStaffSessionForRequest } = await import('../../../src/platform/supabase/edgeStaffSession.ts');
  let queried=false;
  const service={rpc:async()=>({data:false,error:null}),from:()=>{queried=true;throw Error('queried restricted data');}};
  const result=await resolveStaffSessionForRequest(new Request(`${staging}/functions/v1/staff-api`,{
    headers:{authorization:`Bearer ${token()}`,'x-econovaria-recovery-grant':'forged'},
  }),{supabaseUrl:staging,supabaseAnonKey:'synthetic',supabaseServiceRoleKey:'synthetic'}, {
    createAuthClient:()=>({auth:{getUser:async()=>({data:{user:{id:user}},error:null})}} as any),
    createServiceClient:()=>service as any,
  },{missingMessage:'missing'});
  if(result.ok !== false || result.error.code!=='staff_recovery_restricted' || queried) throw Error('shared route bypass');
});

Deno.test('independent Admin API rejects restriction before loading grants', async () => {
  const { guardAdminRequest }=await import('./adminSecurityGuard.ts');
  let queried=0;
  const service={
    rpc:async()=>({data:false,error:null}),
    from:()=>{queried++; return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{status:'active',role:'game_admin'},error:null})})})};},
  };
  const result=await guardAdminRequest(new Request(`${staging}/functions/v1/admin-api/games`,{
    headers:{'x-econovaria-recovery-grant':'forged'},
  }),{token:token(),user:{id:user},staff:{id:user},games:[],service:service as any},'/games');
  if(result.ok !== false || result.code!=='staff_recovery_restricted' || queried!==1) throw Error('Admin route bypass');
});
