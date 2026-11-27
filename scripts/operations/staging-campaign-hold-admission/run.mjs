// Exact owner-reviewed staging-only Campaign hold transport.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateDatabaseUrlProjectRef } from '../../release-integrity/database-binding.mjs';
import { renderOperationSql, stageRef } from './packet.mjs';
import { functionId, operationPath, owner, repo, repoId, ref, sha, validateAppend, validateOperation, verifyReview } from './authority.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));

function exactContext(env) {
  assert.equal(env.GITHUB_ACTIONS,'true');
  assert.equal(env.GITHUB_WORKFLOW,'Staging Campaign Exclusive Hold');
  assert.equal(env.GITHUB_EVENT_NAME,'push');
  assert.equal(env.GITHUB_REPOSITORY,repo);
  assert.equal(env.GITHUB_REPOSITORY_ID,String(repoId));
  assert.equal(env.GITHUB_ACTOR_ID,String(owner));
  assert.equal(env.GITHUB_REF,ref);
  assert.equal(env.GITHUB_RUN_ATTEMPT,'1');
  assert.match(env.GITHUB_RUN_ID || '',/^[1-9][0-9]*$/);
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
  assert.equal(event.repository.id,repoId);
  assert.equal(event.repository.full_name,repo);
  assert.equal(event.repository.private,false);
  assert.equal(event.repository.owner.id,owner);
  assert.equal(event.sender.id,owner);
  assert.equal(event.sender.type,'User');
  assert.equal(event.ref,ref);
  for (const flag of ['created','deleted','forced']) assert.equal(event[flag],false);
  const git = (...args) => execFileSync('/usr/bin/git',args,{cwd:root,env:{PATH:'/usr/bin:/bin'},
    encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']}).trim();
  const head = git('rev-parse','HEAD');
  assert.match(head,/^[a-f0-9]{40}$/);
  assert.equal(head,env.GITHUB_SHA);
  assert.equal(head,event.after);
  assert.equal(head,event.head_commit.id);
  assert.equal(git('status','--porcelain','--untracked-files=all'),'');
  const bytes = readFileSync(root + operationPath);
  assert(bytes.length <= 8192);
  const op = JSON.parse(bytes);
  validateOperation(op);
  validateAppend(op,event,git,head);
  return {op, bytes, head, env, root};
}

function databaseEnv(raw) {
  assert(typeof raw === 'string' && raw.length <= 8192 && !/[\x00-\x20\x7f\\#]/.test(raw));
  assert.match(raw,/^postgres(?:ql)?:\/\//);
  const url = new URL(raw);
  assert(!raw.includes('?') || raw.endsWith('?sslmode=verify-full') && url.search === '?sslmode=verify-full');
  assert.equal(url.pathname,'/postgres');
  assert(url.port === '' || url.port === '5432');
  const binding = validateDatabaseUrlProjectRef({databaseUrl:raw,expectedProjectRef:stageRef});
  const user = decodeURIComponent(url.username), password = decodeURIComponent(url.password);
  assert(password && !/[\x00-\x1f\x7f]/.test(password));
  if (binding.connectionType === 'direct') {
    assert.equal(url.hostname,'db.' + stageRef + '.supabase.co');
    assert.equal(user,'postgres');
  } else {
    assert.match(url.hostname,/^aws-[01]-ap-northeast-2\.pooler\.supabase\.com$/);
    assert.equal(user,'postgres.' + stageRef);
  }
  const ca = root + 'scripts/operations/live-migration-reconciliation/supabase-prod-ca-2021.crt';
  assert.equal(sha(readFileSync(ca)),'700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7');
  return {PATH:process.env.PATH,PGHOST:url.hostname,PGPORT:'5432',PGDATABASE:'postgres',PGUSER:user,
    PGPASSWORD:password,PGSSLROOTCERT:ca,PGSSLMODE:'verify-full',PGGSSENCMODE:'disable',PGCONNECT_TIMEOUT:'10',
    PGPASSFILE:'/dev/null',PGSERVICEFILE:'/dev/null',PGAPPNAME:'econovaria-staging-campaign-hold'};
}

async function verifyProvider(env, op) {
  const token = env.SUPABASE_ACCESS_TOKEN;
  assert(typeof token === 'string' && token.length > 0 && token.length <= 4096 && /^[!-~]+$/.test(token));
  assert(!env.GH_TOKEN && !env.STAGING_DATABASE_URL);
  const api = 'https://api.supabase.com/v1/projects/' + stageRef;
  const read = async suffix => {
    const res = await fetch(api + suffix,{
      method:'GET', redirect:'error', cache:'no-store', signal:AbortSignal.timeout(8000),
      headers:{Authorization:'Bearer ' + token, Accept:'application/json'},
    });
    assert.equal(res.status,200);
    assert.match(res.headers.get('content-type') || '',/^application\/json(?:\s*;|$)/i);
    for (const name of ['link','content-range','x-next-page']) assert.equal(res.headers.get(name),null);
    assert(res.body);
    let size = 0;
    const chunks = [];
    for await (const chunk of res.body) {
      size += chunk.length;
      assert(size <= 262144);
      chunks.push(chunk);
    }
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  };
  const metadata = await read('/functions/campaign-orchestrator');
  assert.equal(metadata.id,functionId);
  assert.equal(metadata.slug,op.runtime.slug);
  assert.equal(metadata.version,op.runtime.version);
  assert.equal(metadata.status,'ACTIVE');
  assert.equal(metadata.ezbr_sha256,op.runtime.sourceSha256);
  assert.equal(metadata.verify_jwt,op.runtime.verifyJwt);
  assert.equal(metadata.import_map,op.runtime.importMap);
  assert.equal(String(metadata.entrypoint_path).replace(/^file:\/\//,'').replace(
    /^\/home\/runner\/work\/Student-Profile\/Student-Profile\//,''),
  'backend/supabase/functions/campaign-orchestrator/index.ts');
  assert(metadata.import_map_path == null);

  // The documented response can contain values. Only names are inspected.
  // Neither payload is printed, written to disk or forwarded to another step.
  const secrets = await read('/secrets');
  assert(Array.isArray(secrets));
  const names = new Set();
  for (const item of secrets) {
    assert(item && typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 256);
    assert(!names.has(item.name));
    names.add(item.name);
  }
  assert(!names.has('ECONOVARIA_STAGING_CAMPAIGN_FENCE'));
}

function providerGate(approval, checkedAt) {
  return checkedAt + ':' + sha(['supabase-management-get-v1',stageRef,approval,checkedAt].join('\n'));
}

function verifyProviderGate(token,approval,op) {
  assert.match(token || '',/^[0-9]{13}:[a-f0-9]{64}$/);
  const checkedAt = token.split(':',1)[0];
  const time = Number(checkedAt);
  const now = Date.now();
  assert(time >= Date.parse(op.maintenance.startsAt) && time < Date.parse(op.maintenance.endsAt));
  assert(time <= now && now - time <= 90000);
  assert.equal(token,providerGate(approval,checkedAt));
}

async function main() {
  let stage = 'operation-admission', sent = false;
  try {
    const mode = process.argv[2];
    assert(['admit','verify-review','verify-provider','execute'].includes(mode));
    const context = exactContext(process.env);
    const {op,bytes,head} = context;
    const approval = [process.env.GITHUB_RUN_ID,head,sha(bytes)].join(':');
    if (mode !== 'verify-provider') assert(!process.env.SUPABASE_ACCESS_TOKEN);
    if (mode === 'admit') {
      assert(!process.env.GH_TOKEN && !process.env.STAGING_DATABASE_URL);
      appendFileSync(process.env.GITHUB_OUTPUT,'admitted=' + approval + '\n');
      console.log('CAMPAIGN_OPERATION_PLAN_ADMITTED');
      return;
    }
    stage = 'owner-review';
    assert.equal(process.env.CAMPAIGN_ADMITTED,approval);
    if (mode === 'verify-review') {
      await verifyReview(context);
      appendFileSync(process.env.GITHUB_OUTPUT,'reviewed=' + approval + '\n');
      console.log('CAMPAIGN_OPERATION_OWNER_APPROVED');
      return;
    }
    assert.equal(process.env.CAMPAIGN_REVIEWED,approval);
    assert(!process.env.GH_TOKEN);
    stage = 'provider-verification';
    if (mode === 'verify-provider') {
      await verifyProvider(process.env,op);
      const checkedAt = Date.now();
      validateOperation(op,checkedAt);
      appendFileSync(process.env.GITHUB_OUTPUT,'gate=' + providerGate(approval,checkedAt) + '\n');
      console.log('CAMPAIGN_PROVIDER_CHECK_PASSED');
      return;
    }
    verifyProviderGate(process.env.CAMPAIGN_PROVIDER_GATE,approval,op);
    stage = 'staging-target-binding';
    const env = databaseEnv(process.env.STAGING_DATABASE_URL);
    const {sql,success} = renderOperationSql(op);
    stage = 'postgres-transaction';
    sent = true;
    const output = execFileSync('psql',['-X','-w','-qAt','-v','ON_ERROR_STOP=1','-f','-'],
      {env,input:sql,encoding:'utf8',timeout:160000,maxBuffer:16384,stdio:['pipe','pipe','pipe']});
    assert.equal(output.trim().split('\n').at(-1),success);
    console.log(JSON.stringify({status:success, operation:op.type, ledgerUnchanged:true}));
  } catch {
    console.error(JSON.stringify({stage,status:sent?'VERIFY_DATABASE_OUTCOME_NO_RETRY':'REFUSED_BEFORE_SQL'}));
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
