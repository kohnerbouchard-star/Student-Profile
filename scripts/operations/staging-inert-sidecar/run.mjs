// Protected runner. Packaging this source never supplies an active request.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {appendFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {repo,branch,project,workflow,requestPath,hash,parseRequest,validateContext,validateHistory,
  tokenOf,verifyPacket,checkNativeReview,issueAuthProof,validateAuthProof} from './policy.mjs';
import {stageDbEnv,readPacket,preflightSql,protectedSql,parsePreflight,parseCommit} from './sql.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
function exactContext(env) {
  const git=(...args)=>{
    const raw=execFileSync('/usr/bin/git',args,{cwd:root,env:{PATH:'/usr/bin:/bin'},encoding:'utf8',
      timeout:5000,maxBuffer:65536,stdio:['ignore','pipe','pipe']});
    // Native request bytes, not an approximation of historic JSON.
    return args[0]==='show'&&args.length===2?raw:raw.trim();
  };
  const head=git('rev-parse','HEAD'),event=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  validateContext(env,event,head);
  const raw=readFileSync(root+requestPath),req=parseRequest(raw);
  validateHistory(req,git,head,event.before);
  verifyPacket(req.lane,req.action,readPacket);
  return {raw,req,head,runId:env.GITHUB_RUN_ID};
}

async function bodyJson(url, headers, limit, request=fetch) {
  const res=await request(url,{method:'GET',redirect:'error',cache:'no-store',headers,signal:AbortSignal.timeout(8000)});
  assert.equal(res.status,200);
  assert.match(res.headers.get('content-type')??'',/^application\/json(?:\s*;|$)/i);
  assert.equal(res.headers.get('link'),null);
  assert.equal(res.headers.get('content-range'),null);
  assert(res.body);
  let size=0;const chunks=[];
  for await (const data of res.body) {size+=data.length;assert(size<=limit);chunks.push(data);}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}
async function githubReview(ctx,credential) {
  const selected='environments/staging/deployment-branch-policies?per_page=100&page=1';
  const get=path=>bodyJson('https://api.github.com/repos/'+repo+'/'+path,{
    Authorization:'Bearer '+credential,Accept:'application/vnd.github+json',
    ...(path===selected?{'X-GitHub-Api-Version':'2026-03-10'}:{}),
  },262144);
  const ref=encodeURIComponent(branch), {runId,req}=ctx;
  const [environment,liveBranch,rules,branchPolicies,reviews,priorRun,priorJobs]=await Promise.all([
    get('environments/staging'),get('branches/'+ref),get('rules/branches/'+ref),get(selected),
    get('actions/runs/'+runId+'/approvals'),
    req.action==='undo'?get('actions/runs/'+req.install.runId):null,
    req.action==='undo'?get('actions/runs/'+req.install.runId+'/jobs?filter=latest&per_page=100'):null,
  ]);
  checkNativeReview({...ctx,workflowDigest:hash(readFileSync(root+workflow)),environment,liveBranch,rules,
    branchPolicies,reviews,priorRun,priorJobs});
}

export async function authRuntimeGet(credential,request=fetch) {
  // Metadata only. No password-reset requests, requests to /secrets or changed
  // deployment configuration. ezbr is a provider metadata field, not backup bytes.
  assert(typeof credential==='string' && credential.length>0 && credential.length<=4096 && /^[!-~]+$/.test(credential));
  const data=await bodyJson('https://api.supabase.com/v1/projects/'+project+'/functions/password-reset-api',
    {Authorization:'Bearer '+credential,Accept:'application/json'},32768,request);
  assert.equal(data.id,'3e471aa1-660d-4094-9e35-3ac65d4683cf');
  assert.equal(data.slug,'password-reset-api');
  assert.equal(data.version,20);assert.equal(data.status,'ACTIVE');assert.equal(data.verify_jwt,true);
  assert.equal(data.ezbr_sha256,'7969383482acf747a6d0f7a6c915a4b006bff3e743a46a64a828826cb0af36a0');
}
function save(env, key,value) {
  assert(typeof value==='string' && /^[a-zA-Z0-9:-]+$/.test(value));
  appendFileSync(env.GITHUB_OUTPUT,key+'='+value+'\n');
}
function psql(input,env,timeout) {
  return execFileSync('/usr/bin/psql',['-X','-w','-qAt','-v','ON_ERROR_STOP=1','-f','-'],
    {env,input,encoding:'utf8',maxBuffer:16384,timeout,stdio:['pipe','pipe','pipe']}).trim();
}
async function main(env) {
  let stage='admission', sent=false;
  try {
    const mode=process.argv[2];
    assert(process.argv.length===3 && ['admit','review','auth-proof','apply'].includes(mode));
    const ctx=exactContext(env),token=tokenOf(ctx);
    const {req}=ctx;
    assert((mode==='apply')===Boolean(env.STAGING_DATABASE_URL));
    assert((mode==='review')===Boolean(env.GH_TOKEN));
    assert((mode==='auth-proof')===Boolean(env.SUPABASE_ACCESS_TOKEN));
    if(mode==='admit') {
      save(env,'admitted',token); save(env,'lane',req.lane);
      console.log('SIDECAR_EXACT_REQUEST_ADMITTED');return;
    }
    assert.equal(env.SIDECAR_ADMITTED,token);stage='native-owner-review';
    if(mode==='review') {
      await githubReview(ctx,env.GH_TOKEN);save(env,'reviewed',token);console.log('SIDECAR_NATIVE_OWNER_APPROVAL_MATCHED');return;
    }
    assert.equal(env.SIDECAR_REVIEWED,token);stage='provider-preflight';
    if(mode==='auth-proof') {
      assert.equal(req.lane,'auth');
      await authRuntimeGet(env.SUPABASE_ACCESS_TOKEN);
      const fresh=Date.now();parseRequest(ctx.raw,fresh);
      save(env,'gate',issueAuthProof(token,fresh));console.log('SIDECAR_AUTH_V20_METADATA_MATCHED_READ_ONLY');return;
    }
    validateAuthProof(env.SIDECAR_AUTH_PROOF,token,req);
    stage='staging-read-only-preflight';
    const epoch=parsePreflight(psql(preflightSql(req),stageDbEnv(env.STAGING_DATABASE_URL,root,true),18000),req,ctx);
    // Do not run after a long wait even when the stage connection was valid.
    validateAuthProof(env.SIDECAR_AUTH_PROOF,token,req);
    parseRequest(ctx.raw);
    const sql=protectedSql(req,epoch);
    const target=stageDbEnv(env.STAGING_DATABASE_URL,root,false);
    stage='protected-staging-transaction';sent=true;
    const receipt=parseCommit(psql(sql,target,90000),ctx);
    console.log(JSON.stringify(receipt)); // no raw epoch, DSN, SQL, original outputs, or provider payload
  }catch{
    console.error(JSON.stringify({stage,status:sent?'VERIFY_DATABASE_OUTCOME_NO_RETRY':'REFUSED_BEFORE_WRITE'}));
    process.exitCode=1;
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url)) await main(process.env);
