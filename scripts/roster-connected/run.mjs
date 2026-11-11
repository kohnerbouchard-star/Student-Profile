#!/usr/bin/env node
import { markCheckpoint, sealCheckpoints, validateCheckpointSnapshot, serviceLogCheckpoint } from './checkpoints.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, realpath, lstat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { materializeProvisioning } from './provisioning.mjs';
import { prepare } from './prepare.mjs';
import { verifyRuntime } from './runtime-equivalence.mjs';
import { absent, check } from './evidence.mjs';
import { validateDatabaseUrl } from './auth-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporaryRoot = resolve(process.env.RUNNER_TEMP || tmpdir());
const stateFile = join(temporaryRoot, 'roster-connected-cleanup.json');
const provisioningReport = '/tmp/game-creation-provisioning-local-acceptance.json';
let provisioningReportOwned = false;
const evidenceDirectory = process.env.ECONOVARIA_ROSTER_EVIDENCE_DIR;
let activeChild, gateway, browser, interrupted = false, scratch, workspace, owned = false;
let gatewayLog = '', gatewayOverflow = false;
const report = {kind:'paired-source-integration',passed:false,stage:'prepare',hostedCapacityQualified:false,maximumRosterCapacityQualified:false};
function execute(command, args, {cwd = workspace || root, timeout = 300_000, input, env = process.env} = {}) {
  return new Promise((resolve, reject) => {
    let output = '', bytes = 0;
    const child = spawn(command,args,{cwd,env,stdio:['pipe','pipe','pipe']}); activeChild = child;
    const timer = setTimeout(() => {child.kill('SIGKILL');},timeout);
    const collect = chunk => {bytes += chunk.length; if(bytes > 32_000_000) child.kill('SIGKILL'); else output += chunk;};
    child.stdout.on('data',collect); child.stderr.on('data',collect);
    child.stdin.on('error',()=>{}); child.stdin.end(input);
    child.on('error',() => {clearTimeout(timer); reject(new Error('command-failed'));});
    child.on('close',code => {clearTimeout(timer); activeChild = undefined; code === 0 && bytes <= 32_000_000 ? resolve(output) : reject(new Error('command-failed'));});
  });
}
async function stopGateway() {
  const child = gateway;
  if (!child) return;
  if (child.exitCode === null && child.signalCode === null) await new Promise((resolve,reject) => {
    const kill = setTimeout(() => child.kill('SIGKILL'),5000);
    const fail = setTimeout(() => reject(new Error('gateway-stop-deadline')),10_000);
    child.once('close',() => {clearTimeout(kill);clearTimeout(fail);resolve();});
    child.kill('SIGTERM');
  });
  gateway = undefined;
}
async function cleanup() {
  let safe = true;
  if (browser) {try {await browser.close();} catch {safe = false;}}
  try {await stopGateway();} catch {safe = false;}
  if (owned && workspace) {
    try { await execute('npx',['--no-install','supabase','stop','--workdir','backend','--no-backup'],{timeout:120_000}); }
    catch {safe = false;}
  }
  if (workspace) {
    await rm(join(workspace,'backend/supabase/functions/.env'),{force:true}).catch(() => {safe = false;});
    await rm(join(workspace,'runtime-config.env.js'),{force:true}).catch(() => {safe = false;});
  }
  if (provisioningReportOwned) await rm(provisioningReport,{force:true}).catch(() => {safe = false;});
  if (safe && scratch) await rm(scratch,{recursive:true,force:true});
  if (safe) await rm(stateFile,{force:true});
  return safe;
}
// A final workflow step can finish cleanup after runner cancellation. No hosted URL,
// arbitrary path or existing stack is accepted by this recovery path.
if (process.argv.includes('--cleanup')) {
  try {
    const state = JSON.parse(await readFile(stateFile,'utf8'));
    scratch = await realpath(state.scratch);
    check(dirname(scratch) === await realpath(temporaryRoot) && /^econovaria-roster-[A-Za-z0-9]+$/.test(scratch.split('/').at(-1)), 'cleanup-scope');
    workspace = join(scratch,'runtime'); owned = state.owned === true; provisioningReportOwned = state.provisioningReportOwned === true;
    check((await readFile(join(workspace,'backend/supabase/config.toml'),'utf8')).startsWith('project_id = "econovaria"'), 'cleanup-project');
    process.exitCode = await cleanup() ? 0 : 1;
  } catch(error) { if(error.code !== 'ENOENT') process.exitCode = 1; }
} else {
  const signal = () => {interrupted = true; activeChild?.kill('SIGTERM'); gateway?.kill('SIGTERM'); void browser?.close().catch(()=>{});};
  process.on('SIGTERM',signal); process.on('SIGINT',signal);
  let manifest, sensitive = [];
  try {
    check(evidenceDirectory && resolve(evidenceDirectory) === join(temporaryRoot,'roster-safe-evidence'), 'evidence-directory');
    await verifyRuntime(root); // Before any container or runtime operation.
    // Never overwrite or destroy a pre-existing developer stack.
    const containers = await execute('docker',['ps','-a','--format','{{.Names}}'],{cwd:root});
    check(!containers.split(/\r?\n/).some(name => /^supabase_.*_econovaria$/.test(name)), 'disposable-stack-unoccupied');
    scratch = await mkdtemp(join(temporaryRoot,'econovaria-roster-')); workspace = join(scratch,'runtime');
    manifest = await prepare(root,workspace,scratch);
    await symlink(join(root,'node_modules'),join(workspace,'node_modules'),'dir');
    process.chdir(workspace);
    process.env.DATABASE_URL = validateDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
    process.env.ECONOVARIA_ROSTER_BASE_URL = 'http://127.0.0.1:4173';
    process.env.ECONOVARIA_GATEWAY_REQUEST_TIMEOUT_SECONDS = '30';
    process.env.PHYSICAL_ECONOMY_PACK = join(scratch,'physical-economy-runtime-pack.json');
    process.env.RELEASE_COMMIT = manifest.backend.sha;
    const keys = [
      ['ECONOVARIA_RATE_LIMIT_HMAC_SECRET',48], ['ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY',32],
      ['ECONOVARIA_MFA_HANDLE_KEY',48], ['ECONOVARIA_PLAYER_CREDENTIAL_PEPPER',48],
    ].map(([name,bytes]) => [name,randomBytes(bytes).toString('base64url')]);
    sensitive.push(...keys.map(([,value]) => value));
    await writeFile(join(workspace,'backend/supabase/functions/.env'),`${keys.map(([name,value]) => `${name}=${value}`).join('\n')}\nECONOVARIA_TRUSTED_CLIENT_IP_HEADER=x-real-ip\n`,{mode:0o600});
    const contract = JSON.parse(await readFile(join(workspace,'docs/operations/contracts/beta-seed-downstream-consumer-contract-v1.json'),'utf8'));
    report.stage = 'canonical-pack';
    await execute('node',['scripts/build-physical-economy-runtime-pack.mjs','--source-root','.', '--source-commit',contract.acceptedImplementationSourceSha,'--approved-source-commit',contract.acceptedImplementationSourceSha,'--output',process.env.PHYSICAL_ECONOMY_PACK]);
    report.stage = 'disposable-stack';
    owned = true;
    await writeFile(stateFile,JSON.stringify({scratch,owned}),{mode:0o600});
    await execute('npx',['--no-install','supabase','start','--workdir','backend','--exclude','studio,imgproxy,storage-api,logflare,vector,supavisor,realtime,postgres-meta,mailpit'],{timeout:900_000});
    await execute('npx',['--no-install','supabase','db','reset','--workdir','backend','--local'],{timeout:600_000});
    report.stage = 'canonical-provisioning';
    const priorProvisioningReport = await lstat(provisioningReport).catch(error => {if(error.code !== 'ENOENT') throw error;return null;});
    check(!priorProvisioningReport,'provisioning-report-unoccupied');
    provisioningReportOwned = true;
    await writeFile(stateFile,JSON.stringify({scratch,owned,provisioningReportOwned}),{mode:0o600});
    manifest.fixtureInstrumentation = await materializeProvisioning(workspace);
    await execute('node',[manifest.fixtureInstrumentation.adaptedPath],{timeout:600_000});
    await execute('node',['scripts/local-auth-readiness.mjs']);
    // Preserve the existing real rollback and three concurrency races in addition
    // to browser coverage. Their output remains private and is never uploaded.
    report.stage = 'retained-sql-and-races';
    await execute('psql',[process.env.DATABASE_URL,'-X','-v','ON_ERROR_STOP=1','-f','scripts/player-roster-import-database.sql']);
    await execute('node',['scripts/player-roster-import-concurrency.mjs']);
    report.retainedDatabaseGates = {rollback:true,sameKeyRace:true,distinctImportRace:true,singleCreateRace:true};
    report.stage = 'same-origin-gateway';
    async function startGateway(timeoutSeconds) {
      const probe = createServer();
      await new Promise((resolve,reject) => {probe.once('error',reject);probe.listen(4173,'127.0.0.1',resolve);});
      await new Promise(resolve => probe.close(resolve));
    gateway = spawn('python3',['scripts/econovaria-local-gateway.py','--local-supabase','--root',workspace,'--port','4173'],{cwd:workspace,env:{...process.env,ECONOVARIA_GATEWAY_REQUEST_TIMEOUT_SECONDS:String(timeoutSeconds)},stdio:['ignore','pipe','pipe']});
    gateway.on('error',()=>{gatewayOverflow = true;});
    const collectGateway = bytes => {if(gatewayLog.length + bytes.length < 4_000_000) gatewayLog += bytes; else gatewayOverflow = true;};
    gateway.stdout.on('data',collectGateway); gateway.stderr.on('data',collectGateway);
    let ready = false;
    for(let i=0;i<90 && !interrupted;i++) {
      const response = await fetch('http://127.0.0.1:4173/',{signal:AbortSignal.timeout(2000)}).catch(()=>null);
      if(response?.ok) {await response.body?.cancel();ready = true;break;}
      await new Promise(resolve => setTimeout(resolve,1000));
    }
    check(ready && gateway.exitCode === null,'gateway-ready');
    }
    await startGateway(180); // Canonical licensed provisioning is outside the timed import phase.
    const {runBrowser} = await import('./browser.mjs');
    const privacy = await runBrowser(report,async (values, phase) => {
      markCheckpoint(report, 'main', 'privacy-gateway-log-size'); check(!gatewayOverflow,'gateway-log-overflow'); markCheckpoint(report, 'main', 'privacy-gateway-logs'); absent(gatewayLog,values,'gateway-log-leak');
      markCheckpoint(report, 'main', 'privacy-server-enumerate'); const names = await execute('docker',['ps','--format','{{.Names}}']);
      const servers = names.trim().split(/\r?\n/).filter(name => /^supabase_(?:edge_runtime|auth|rest|kong)_econovaria$/.test(name));
      markCheckpoint(report, 'main', 'privacy-server-coverage'); check(servers.length === 4,'server-log-coverage');
      for(const name of servers) {
        markCheckpoint(report, 'main', 'privacy-service-read'); const output = await execute('docker',['logs',name],{timeout:30_000});
        markCheckpoint(report, 'main', serviceLogCheckpoint(phase, name)); absent(output,values,'server-log-leak');
      }
    },value => {browser = value;},async () => {
      await stopGateway();
      await startGateway(30);
      report.gatewayImportTimeoutSeconds = 30;
    });
    sensitive.push(...privacy.privateValues);
    report.runtime.edgeImage = (await execute('docker',['inspect','--format','{{.Config.Image}}','supabase_edge_runtime_econovaria'])).trim();
    report.runtime.postgres = (await execute('psql',[process.env.DATABASE_URL,'-X','-qAt','-c','show server_version;'])).trim();
    check(/^[a-z0-9./:_-]+$/i.test(report.runtime.edgeImage) && /^[0-9.]+(?: \([^)]*\))?$/.test(report.runtime.postgres),'runtime-version-format');
    report.runtime.npm = String(execFileSync('npm',['--version'],{stdio:['ignore','pipe','pipe']})).trim();
    report.runtime.supabase = JSON.parse(await readFile(join(root,'node_modules/supabase/package.json'),'utf8')).version;
    report.runtime.playwright = JSON.parse(await readFile(join(root,'node_modules/playwright/package.json'),'utf8')).version;
    report.stage = 'complete'; report.passed = !interrupted;
  } catch {
    // Intentionally do not print Error/stack/call logs. They can contain credentials.
    report.passed = false;
  } finally {
    report.cleanup = await cleanup();
    report.passed &&= report.cleanup && !interrupted;
    if (evidenceDirectory && resolve(evidenceDirectory) === join(temporaryRoot,'roster-safe-evidence')) {
      await mkdir(evidenceDirectory,{recursive:true,mode:0o700});
      report.checkpoints = validateCheckpointSnapshot(sealCheckpoints(report));
      const artifacts = [JSON.stringify(report,null,2),manifest ? JSON.stringify(manifest,null,2) : ''];
      absent(artifacts.join('\n'),sensitive,'artifact-secret-leak');
      await writeFile(join(evidenceDirectory,'result.json'),`${artifacts[0]}\n`,{mode:0o600});
      if(manifest) await writeFile(join(evidenceDirectory,'source-manifest.json'),`${artifacts[1]}\n`,{mode:0o600});
    }
    console.log(JSON.stringify({passed:report.passed,stage:report.stage,cleanup:report.cleanup}));
    process.exitCode = report.passed ? 0 : 1;
  }
}
