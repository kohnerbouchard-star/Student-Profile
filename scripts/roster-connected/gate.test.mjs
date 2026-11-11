import { MAIN_CHECKPOINTS, CALLBACK_CHECKPOINTS } from './checkpoints.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { absent, equal, publicReceipt, underDeadline } from './evidence.mjs';
import { assertDelta, assertPersistedPrivacy } from './database.mjs';
import { prepare, verifyDependencyBaseline } from './prepare.mjs';
import { adaptProvisioning, materializeProvisioning } from './provisioning.mjs';
import { sha256 } from './evidence.mjs';

const root = fileURLToPath(new URL('../../',import.meta.url));
const read = path => readFile(new URL(path,import.meta.url),'utf8');
const pins = JSON.parse(await read('./sources.json'));
const names = ['Synthetic É','Synthetic É'];
const receipt = replayed => ({data:{createdCount:2,replayed,credentialsAvailable:!replayed,students:names.map((displayName,i) => ({row:i+1,displayName,playerIdentifier:`STU-${String(i).repeat(24)}`,...(!replayed ? {accessCode:String(i+2).repeat(32)} : {})}))}});

test('public DTO whitelist rejects every unknown private field and unordered/malformed receipt', () => {
  assert.equal(publicReceipt(receipt(false),names,false).students.length,2);
  assert.equal(publicReceipt(receipt(true),names,true).students.length,2);
  for(const field of ['id','player_id','salt','verifier','lookupDigest','credential_version','accessToken']) {
    const value = receipt(false); value.data.students[0][field] = 'synthetic-private-canary';
    assert.throws(() => publicReceipt(value,names,false),error => !error.message.includes('canary'));
  }
  const invalid = [
    value => {value.extra = true;}, value => {value.data.extra = true;},
    value => {value.data.students.reverse();}, value => {value.data.createdCount = 1;},
    value => {value.data.students[1].playerIdentifier = value.data.students[0].playerIdentifier;},
    value => {value.data.students[1].accessCode = value.data.students[0].accessCode;},
    value => {value.data.students[0].accessCode = 'bad';},value => {value.data.replayed = true;},
  ];
  for(const change of invalid) {const value = receipt(false);change(value);assert.throws(() => publicReceipt(value,names,false));}
  const replay = receipt(true); replay.data.students[0].accessCode = '2'.repeat(32);
  assert.throws(() => publicReceipt(replay,names,true));
});

test('absolute monotonic deadline does not inherit frontend 120-second timeout', () => {
  assert.equal(underDeadline(100,30100-1),29999);
  for(const end of [30100,30101,99,NaN]) assert.throws(() => underDeadline(100,end),/absolute-import-deadline/);
});

test('exact full-value scanning and comparisons never echo credentials', () => {
  const canary = '2'.repeat(32);
  assert.throws(() => absent(`prefix ${canary} suffix`,[canary],'artifact-secret-leak'),error => error.message === 'artifact-secret-leak');
  assert.throws(() => equal(canary,'different','safe-label'),error => error.message === 'safe-label');
  assert.doesNotThrow(() => absent(canary.slice(0,16),[canary],'no-partial-match'));
});

test('database invariants enforce all counts, credential policy, existing rows and aggregate audit', () => {
  const before = {games:1,players:1,countries:1,credentials:1,validCredentials:1,receipts:0,completed:0,audits:0,playerDigests:{old:'same'},credentialDigests:{old:'same'}};
  const after = {...before,players:3,countries:3,credentials:3,validCredentials:3,receipts:1,completed:1,audits:1};
  assert.doesNotThrow(() => assertDelta(before,after,2));
  for(const field of ['players','countries','credentials','validCredentials','receipts','completed','audits']) assert.throws(() => assertDelta(before,{...after,[field]:after[field]+1},2));
  assert.throws(() => assertDelta(before,{...after,playerDigests:{old:'changed'}},2));
  const state = {receiptBodies:[{createdCount:2,students:receipt(true).data.students}],auditBodies:[{metadata:{createdCount:2}}]};
  assert.doesNotThrow(() => assertPersistedPrivacy(state,['secret'],names,['identifier']));
  assert.throws(() => assertPersistedPrivacy({...state,auditBodies:[{metadata:{createdCount:2,name:names[0]}}]},[],names,[]));
});

test('source manifest pins only seven runtime files and creates the exact paired tree', async () => {
  const expected = ['admin/v2/src/api/admin-api-client.js','admin/v2/src/api/player-roster-import.js',...['PlayersController','PlayersRoute','RosterCsvReview','RosterImportController','roster-csv'].map(name => `admin/v2/src/routes/players/${name}.js`)];
  assert.deepEqual(pins.overlay,expected);
  const temporary = await mkdtemp(join(tmpdir(),'roster-manifest-test-'));
  try {
    const manifest = await prepare(root,join(temporary,'runtime'),temporary);
    assert.equal(manifest.kind,'paired-source-integration');
    assert.equal(manifest.runtimeEquivalence.mode,pins.mode);
    assert.equal(manifest.runtimeEquivalence.headSha,manifest.harnessSha);
    assert.equal(manifest.runtimeEquivalence.headTree,manifest.harnessTree);
    assert.equal(manifest.runtimeEquivalence.frontendNonOverlayInputsCovered,pins.mode === 'integrated-composite');
    assert.equal(manifest.runtimeEquivalence.projectionSha256,manifest.runtimeEquivalence.expectedProjectionSha256);
    assert.equal(manifest.files.length,7);
    for(const dependency of manifest.dependencies) assert.equal(dependency.sha256,sha256(execFileSync('git',['-C',root,'show',`${pins.backend.sha}:${dependency.path}`])));
    assert.deepEqual(manifest.dependencies.map(entry => entry.path),['package.json','package-lock.json']);
    for(const file of manifest.files) {
      const published = execFileSync('git',['-C',root,'show',`${pins.frontend.sha}:${file.path}`]);
      assert.deepEqual(await readFile(join(temporary,'runtime',file.path)),published);
    }
    assert.equal(manifest.hostedCapacityQualified,false);
    assert.equal(manifest.maximumRosterCapacityQualified,false);
    assert.match(manifest.compositeTree,/^[0-9a-f]{40}$/);
    const changed = execFileSync('git',['-C',root,'diff-tree','--no-commit-id','--name-only','-r',pins.backend.tree,manifest.compositeTree],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
    assert.deepEqual(changed.sort(),pins.mode === 'backend-owned' ? expected.sort() : []);
    // Exercise the real file-based canonical builder in the .git-free archive.
    const runtime = join(temporary,'runtime');
    const contract = JSON.parse(await readFile(join(runtime,'docs/operations/contracts/beta-seed-downstream-consumer-contract-v1.json'),'utf8'));
    const pack = JSON.parse(execFileSync(process.execPath,['scripts/build-physical-economy-runtime-pack.mjs','--source-root','.',
      '--source-commit',contract.acceptedImplementationSourceSha,'--approved-source-commit',contract.acceptedImplementationSourceSha,
      '--output',join(temporary,'pack.json')],{cwd:runtime,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
    assert.equal(pack.activationAuthorized,true); assert.equal(pack.productionAuthorized,false);
    const instrumentation = await materializeProvisioning(runtime);
    assert.equal(instrumentation.purpose,'canonical-fixture-SQL-stdin-only');
    assert.equal(instrumentation.sourceSha256,sha256(await readFile(join(runtime,instrumentation.sourcePath))));
    execFileSync(process.execPath,['--check',instrumentation.adaptedPath],{cwd:runtime,stdio:'pipe'});
  } finally {await rm(temporary,{recursive:true,force:true});}
});

test('workflow is bounded, read-only, exact-head and aggregate-artifact-only', async () => {
  const workflow = await read('../../.github/workflows/roster-connected-e2e.yml');
  assert.match(workflow,/runs-on: ubuntu-24\.04/);
  assert.match(workflow,/contents: read/);
  for(const line of workflow.split('\n').filter(line => /uses: actions\//.test(line))) assert.match(line,/@[a-f0-9]{40} # v/);
  assert.match(workflow,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/node --test scripts\/roster-connected\/\*\.test\.mjs/);
  assert.match(workflow,/run\.mjs --cleanup/);
  for(const line of workflow.split('\n').filter(line => line.includes('roster-safe-evidence/'))) assert.match(line,/\/(?:source-manifest|result)\.json$/);
  assert.doesNotMatch(workflow,/secrets\.|id-token:|pull_request_target|continue-on-error|deploy|admin-browser-e2e\.yml/);
});

test('orchestrator retains real SQL/races, fixed local gateway, strict cleanup and no raw output', async () => {
  const source = await read('./run.mjs');
  for(const needle of ['player-roster-import-database.sql','player-roster-import-concurrency.mjs','--no-backup','functions/.env','runtime-config.env.js','mode:0o600','disposable-stack-unoccupied','server-log-coverage','artifact-secret-leak','startGateway(30)','ECONOVARIA_GATEWAY_REQUEST_TIMEOUT_SECONDS']) assert.ok(source.includes(needle),needle);
  assert.match(source,/catch \{[\s\S]*report\.passed = false;/);
  assert.doesNotMatch(source,/console\.(?:error|warn)|stdio:\s*['"]inherit|writeFile\([^\n]*(?:gatewayLog|output|privateValues|sensitive)/);
});

test('browser faults occur only after real response and DB commit, never fake sessions', async () => {
  const source = await read('./browser.mjs');
  for(const needle of ['route.fetch({timeout:30_000,maxRetries:0,maxRedirects:0})','fault-committed-before-drop',"route.abort('failed')",'same-controller-key','lost-response-stable-key','preview-no-import','idempotency_key_conflict','staff_permission_denied','staff_mfa_required','csrf_validation_failed','logout-codes-visible-before','late-response-cannot-repopulate','browser-cookie-leak']) assert.ok(source.includes(needle),needle);
  assert.ok(source.indexOf('fault-committed-before-drop') < source.indexOf("route.abort('failed')"));
  assert.doesNotMatch(source,/route\.fulfill\(\{\s*(?:status|body)|storageState:|addCookies|recordHar|recordVideo|\.screenshot\(|tracing\.start|SERVICE_ROLE_KEY/);
  assert.match(source,/underDeadline\(started\)/);
  assert.match(source,/await context\.close\(\)/);
});


test('review regressions bind timing, every fresh DB delta, raw names and each page identity', async () => {
  const source = await read('./browser.mjs');
  const rendered = source.slice(source.indexOf('const readRendered'),source.indexOf('const close ='));
  assert.ok(rendered.indexOf('const elapsedMs = underDeadline(started)') > rendered.indexOf('ordered-rendered-receipt'));
  assert.ok(rendered.indexOf('const elapsedMs = underDeadline(started)') > rendered.indexOf('requestAnimationFrame'));
  assert.match(source,/rosterValues\.push\(\.\.\.inputNames\)/);
  assert.match(source,/assertDelta\(beforeLogout,await snapshot\(gameName\),2\)/);
  assert.match(source,/const headers = publicHeaders\.get\(targetPage\)/);
  assert.doesNotMatch(source,/requestHeaders = calls\[0\]/);
  const runner = await read('./run.mjs');
  assert.match(runner,/gateway-stop-deadline/);
  assert.match(runner,/provisioning-report-unoccupied/);
  assert.match(runner,/if \(provisioningReportOwned\) await rm\(provisioningReport/);
});


test('dependency baseline mismatch fails closed without recording foreign dependencies', () => {
  assert.doesNotThrow(() => verifyDependencyBaseline(Buffer.from('same'),Buffer.from('same')));
  assert.throws(() => verifyDependencyBaseline(Buffer.from('changed'),Buffer.from('same')),/dependency-baseline-mismatch/);
});

test('canonical provisioning adapter changes only exact SQL transport and rejects seam drift', async () => {
  const original = await read('../game-creation-provisioning-local-acceptance.mjs');
  const adapted = adaptProvisioning(original);
  const start = original.indexOf('async function runSql('), end = original.indexOf('\nasync function readJson',start);
  const newEnd = adapted.indexOf('\nasync function readJson',start);
  assert.equal(adapted.slice(0,start),original.slice(0,start));
  assert.equal(adapted.slice(newEnd),original.slice(end));
  const seam = adapted.slice(start,newEnd);
  assert.match(seam,/input: sql\.trim\(\) \+ "\\n"/);
  assert.doesNotMatch(seam,/writeFile|unlink|"-f"|stderr|console\./);
  assert.throws(() => adaptProvisioning(original.replace('maxBuffer: 20 * 1024 * 1024','maxBuffer: 21 * 1024 * 1024')),/provisioning-seam-hash/);
  assert.throws(() => adaptProvisioning(original + 'async function runSql('),/provisioning-seam-count/);
});


test('installation diagnostics run only on locked-tools failure without changing any prior workflow byte', async () => {
  const workflow = await read('../../.github/workflows/roster-connected-e2e.yml');
  const baseline = execFileSync('git',['-C',root,'show','978b178ac9f21aebf16bd4b3d1ecd2a13b01a966:.github/workflows/roster-connected-e2e.yml'],{encoding:'utf8'});
  const id = '        id: install_locked_tools\n';
  const step = `      - name: Summarize failed installation without changing it
        if: \${{ failure() && steps.install_locked_tools.outcome == 'failure' }}
        timeout-minutes: 2
        run: node scripts/roster-connected/install-diagnostics.mjs
`;
  assert.equal(workflow.split(id).length,2);assert.equal(workflow.split(step).length,2);
  assert.equal(workflow.replace(id,'').replace(step,''),baseline);
  assert.ok(workflow.indexOf(step)>workflow.indexOf('npx playwright install --with-deps chromium'));
  assert.ok(workflow.indexOf(step)<workflow.indexOf('Validate isolated gate contracts'));
  assert.ok(!step.includes('continue-on-error'));assert.ok(!step.includes('always()'));
});

test('diagnostic classification adds exactly two harness files and leaves the guard algorithm unchanged', async () => {
  const baseline = path => execFileSync('git',['-C',root,'show',`978b178ac9f21aebf16bd4b3d1ecd2a13b01a966:${path}`],{encoding:'utf8'});
  const policy = (await read('./runtime-inputs.mjs')).replace(",'checkpoints.mjs','checkpoints.test.mjs'",'');
  const addition = ",'install-diagnostics.mjs','install-diagnostics.test.mjs'";
  assert.equal(policy.split(addition).length,2);
  assert.equal(policy.replace(addition,''),baseline('scripts/roster-connected/runtime-inputs.mjs'));
  for(const name of ['runtime-equivalence.mjs','prepare.mjs','run.mjs','browser.mjs','student-access.mjs','database.mjs','evidence.mjs','auth-fixture.mjs','provisioning.mjs']) {
    assert.equal(withoutCheckpoints(await read(`./${name}`)),baseline(`scripts/roster-connected/${name}`));
  }
});


// Remove only these reviewed literal diagnostic statements, never application
// operations or assertions. Unknown/malformed instrumentation fails the test.
const SERVICE_LOG_LABELS = [
  'privacy-before-student-edge', 'privacy-before-student-auth',
  'privacy-before-student-rest', 'privacy-before-student-kong',
  'privacy-after-student-edge', 'privacy-after-student-auth',
  'privacy-after-student-rest', 'privacy-after-student-kong',
];
// Exact inverse of this diagnostic-only seam. Every original operation, corpus,
// assertion and command must still match the frozen public baseline byte-for-byte.
function withoutServicePhaseCheckpoints(source) {
  const replacements = [
    ["import { markCheckpoint, sealCheckpoints, validateCheckpointSnapshot, serviceLogCheckpoint } from './checkpoints.mjs';", "import { markCheckpoint, sealCheckpoints, validateCheckpointSnapshot } from './checkpoints.mjs';"],
    ['await runBrowser(report,async (values, phase) => {', 'await runBrowser(report,async values => {'],
    ["markCheckpoint(report, 'main', serviceLogCheckpoint(phase, name));", "markCheckpoint(report, 'main', 'privacy-service-logs');"],
    ['const privacy = async phase => {', 'const privacy = async () => {'],
    ['await checkServerLogs([...rosterValues,...privateValues], phase);', 'await checkServerLogs([...rosterValues,...privateValues]);'],
    ["await privacy('before-student-access');", 'await privacy();'],
    ["await privacy('after-student-access');", 'await privacy();'],
  ];
  for(const [replacement,original] of replacements) {
    assert.ok(source.split(replacement).length<=2);
    source=source.replace(replacement,original);
  }
  assert.doesNotMatch(source,/serviceLogCheckpoint|before-student-access|after-student-access|async phase/);
  return source;
}

function withoutCheckpoints(source) {
  source=withoutServicePhaseCheckpoints(source);
  const imports = ["import { markCheckpoint } from './checkpoints.mjs';\n",
    "import { markCheckpoint, sealCheckpoints, validateCheckpointSnapshot } from './checkpoints.mjs';\n"];
  for(const line of imports) {
    assert.ok(source.split(line).length <= 2);
    source=source.replace(line,'');
  }
  source=source.replace(/markCheckpoint\(report, '(main|callback)', '([a-z-]+)'\); /g,(_,channel,id)=>{
    assert.ok((channel==='main' ? MAIN_CHECKPOINTS : CALLBACK_CHECKPOINTS).includes(id));return '';
  });
  const seal='      report.checkpoints = validateCheckpointSnapshot(sealCheckpoints(report));\n';
  assert.ok(source.split(seal).length <= 2);source=source.replace(seal,'');
  assert.doesNotMatch(source,/markCheckpoint|sealCheckpoints|validateCheckpointSnapshot/);
  return source;
}

test('checkpoint inverse preserves all original flow bytes and exact runtime guard scope', async()=>{
  const baseline=path=>execFileSync('git',['-C',root,'show',`ecbc05c375fe8c52af911f4142f229e6ca5db255:${path}`],{encoding:'utf8'});
  for(const name of ['browser.mjs','student-access.mjs','run.mjs']) {
    assert.equal(withoutCheckpoints(await read(`./${name}`)),baseline(`scripts/roster-connected/${name}`));
  }
  const addition=",'checkpoints.mjs','checkpoints.test.mjs'";
  const policy=await read('./runtime-inputs.mjs');assert.equal(policy.split(addition).length,2);
  assert.equal(policy.replace(addition,''),baseline('scripts/roster-connected/runtime-inputs.mjs'));
  // sources.json is intentionally replaced by complete-mode fixtures. Its strict
  // schema, explicit relation, pin trees and runtime projection are verified by
  // prepare/verifyRuntime above; exact public pin bytes are checked separately
  // against the frozen publication candidate, never a synthetic fixture.
  for(const name of ['runtime-equivalence.mjs','prepare.mjs','database.mjs','evidence.mjs','auth-fixture.mjs','provisioning.mjs','mode-fixtures.mjs','install-diagnostics.mjs','install-diagnostics.test.mjs']) {
    assert.equal(await read(`./${name}`),baseline(`scripts/roster-connected/${name}`));
  }
  assert.equal(await read('../../.github/workflows/roster-connected-e2e.yml'),baseline('.github/workflows/roster-connected-e2e.yml'));
});

test('each literal checkpoint is bound to the intended source channel and serialized only once',async()=>{
  const files=await Promise.all(['browser.mjs','student-access.mjs','run.mjs'].map(name=>read(`./${name}`)));
  const found={main:[],callback:[]};
  for(const source of files.map(withoutServicePhaseCheckpoints)) for(const match of source.matchAll(/markCheckpoint\(report, '(main|callback)', '([a-z-]+)'\); /g)) found[match[1]].push(match[2]);
  assert.deepEqual(found.main.sort(),MAIN_CHECKPOINTS.filter(x=>x!=='not-started'&&!SERVICE_LOG_LABELS.includes(x)).slice().sort());
  assert.deepEqual(found.callback.sort(),CALLBACK_CHECKPOINTS.filter(x=>x!=='not-started').slice().sort());
  const browser=files[0], start=browser.indexOf("markCheckpoint(report, 'main', 'late-route-install')");
  const end=browser.indexOf("markCheckpoint(report, 'main', 'late-preview')",start);
  const callback=browser.slice(start,end);
  assert.equal((callback.match(/markCheckpoint\(report, 'main'/g)||[]).length,1);
  assert.equal((callback.match(/markCheckpoint\(report, 'callback'/g)||[]).length,6);
  assert.ok(!callback.slice(callback.indexOf('} catch')).includes('markCheckpoint'));
  const runner=files[2];assert.equal((runner.match(/report\.checkpoints = validateCheckpointSnapshot\(sealCheckpoints\(report\)\);/g)||[]).length,1);
  assert.ok(runner.indexOf('report.checkpoints = validateCheckpointSnapshot(sealCheckpoints(report))')>runner.indexOf('report.cleanup = await cleanup()'));
  assert.ok(runner.indexOf('report.checkpoints = validateCheckpointSnapshot(sealCheckpoints(report))')<runner.indexOf('const artifacts ='));
});


test('eight service/phase labels preserve the complete public browser/orchestrator sources by exact inverse',async()=>{
  for(const name of ['browser.mjs','run.mjs']) {
    const source=await read(`./${name}`);
    const baseline=execFileSync('git',['-C',root,'show',`5f69fbb36ab9de78293c8ab3d4384b441b096f57:scripts/roster-connected/${name}`],{encoding:'utf8'});
    assert.equal(withoutServicePhaseCheckpoints(source),baseline);
  }
  for(const name of ['student-access.mjs','evidence.mjs','runtime-inputs.mjs','runtime-equivalence.mjs']) {
    const baseline=execFileSync('git',['-C',root,'show',`5f69fbb36ab9de78293c8ab3d4384b441b096f57:scripts/roster-connected/${name}`],{encoding:'utf8'});
    assert.equal(await read(`./${name}`),baseline);
  }
});
test('service checkpoints bind both existing privacy passes and mark only after unchanged cumulative retrieval',async()=>{
  const browser=await read('./browser.mjs'),runner=await read('./run.mjs'),helper=await read('./checkpoints.mjs');
  assert.equal((browser.match(/await privacy\('before-student-access'\);/g)||[]).length,1);
  assert.equal((browser.match(/await privacy\('after-student-access'\);/g)||[]).length,1);
  assert.ok(browser.indexOf("await privacy('before-student-access')")<browser.indexOf('await verifyStudentAccess('));
  assert.ok(browser.indexOf("await privacy('after-student-access')")>browser.indexOf('await verifyStudentAccess('));
  assert.ok(browser.includes('await checkServerLogs([...rosterValues,...privateValues], phase);'));
  assert.ok(runner.includes("markCheckpoint(report, 'main', 'privacy-service-read'); const output = await execute('docker',['logs',name],{timeout:30_000});"));
  assert.ok(runner.includes("markCheckpoint(report, 'main', serviceLogCheckpoint(phase, name)); absent(output,values,'server-log-leak');"));
  assert.doesNotMatch(runner,/--since|--tail|--follow|LOG_LEVEL|ACCESS_LOG/);
  const mapping=helper.slice(helper.indexOf('const SERVICE_LOG_CHECKPOINTS'),helper.indexOf('export function serviceLogCheckpoint'));
  const labels=[...mapping.matchAll(/: '(privacy-[a-z-]+)'/g)].map(match=>match[1]);
  assert.deepEqual(labels,SERVICE_LOG_LABELS);assert.equal(new Set(labels).size,8);
  assert.ok(labels.every(label=>MAIN_CHECKPOINTS.includes(label)&&!CALLBACK_CHECKPOINTS.includes(label)));
});
