// Source-only open operations. No active request ships with this path.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {appendFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {births,repo,branch,workflow,requestPath,hash,parseRequest,validateContext,validateHistory,
  tokenOf,verifyPacket,checkReview} from './policy.mjs';
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
  verifyPacket(req.action,readPacket);
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
function save(env, key,value) {
  assert(typeof value==='string' && /^[a-zA-Z0-9:-]+$/.test(value));
  appendFileSync(env.GITHUB_OUTPUT,key+'='+value+'\n');
}
function psql(input,env,timeout) {
  return execFileSync('/usr/bin/psql',['-X','-w','-qAt','-v','ON_ERROR_STOP=1','-f','-'],
    {env,input,encoding:'utf8',maxBuffer:16384,timeout,stdio:['pipe','pipe','pipe']}).trim();
}
async function verifyReview(ctx,credential) {
  const selected='environments/staging/deployment-branch-policies?per_page=100&page=1';
  const get=path=>bodyJson('https://api.github.com/repos/'+repo+'/'+path,{
    Authorization:'Bearer '+credential,Accept:'application/vnd.github+json',
    ...(path===selected?{'X-GitHub-Api-Version':'2026-03-10'}:{}),
  },262144);
  const b=encodeURIComponent(branch), {runId,req}=ctx;
  const prior=async ({runId:id})=>{
    const [priorRun,priorJobs]=await Promise.all([
      get('actions/runs/'+id),get('actions/runs/'+id+'/jobs?filter=latest&per_page=100'),
    ]);
    return {priorRun,priorJobs};
  };
  const [environment,liveBranch,rules,branchPolicies,reviews,business,auth,attach]=await Promise.all([
    get('environments/staging'),get('branches/'+b),get('rules/branches/'+b),get(selected),get('actions/runs/'+runId+'/approvals'),
    prior(births.business),prior(births.auth),req.attach?prior(req.attach):null,
  ]);
  checkReview({...ctx,workflowDigest:hash(readFileSync(root+workflow)),environment,liveBranch,rules,
    branchPolicies,reviews,priors:{business,auth,attach}});
}
async function main(env) {
  let stage='admission',sent=false;
  try {
    const mode=process.argv[2];
    assert(process.argv.length===3 && ['admit','review','apply'].includes(mode));
    assert((mode==='apply')===Boolean(env.STAGING_DATABASE_URL));
    assert((mode==='review')===Boolean(env.GH_TOKEN));
    const ctx=exactContext(env),token=tokenOf(ctx);
    if(mode==='admit') {
      save(env,'admitted',token);console.log('BUSINESS_OPEN_REQUEST_ADMITTED');return;
    }
    assert.equal(env.BUSINESS_ADMITTED,token);stage='native-owner-review';
    if(mode==='review') {
      await verifyReview(ctx,env.GH_TOKEN);parseRequest(ctx.raw);
      save(env,'reviewed',token);console.log('BUSINESS_OPEN_NATIVE_APPROVAL_MATCHED');return;
    }
    assert.equal(env.BUSINESS_REVIEWED,token);stage='staging-read-only-preflight';
    const observed=parsePreflight(psql(preflightSql(ctx.req),stageDbEnv(env.STAGING_DATABASE_URL,root,true),18000),ctx.req);
    parseRequest(ctx.raw);
    const sql=protectedSql(ctx.req,observed);
    const target=stageDbEnv(env.STAGING_DATABASE_URL,root,false);
    stage='protected-business-transaction';sent=true;
    const receipt=parseCommit(psql(sql,target,90000),ctx,observed);
    console.log(JSON.stringify(receipt));
  }catch{
    console.error(JSON.stringify({stage,status:sent?'VERIFY_DATABASE_OUTCOME_NO_RETRY':'REFUSED_BEFORE_WRITE'}));
    process.exitCode=1;
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url)) await main(process.env);
