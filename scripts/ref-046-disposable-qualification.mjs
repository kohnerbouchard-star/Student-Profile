import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, cpSync, realpathSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';

const hash = value => createHash('sha256').update(value).digest('hex');
export function ownedDelta(before, current, project) {
  for (const row of before) assert.deepEqual(current.find(x => x.key === row.key), row, 'FOREIGN_RESOURCE_CHANGED');
  const added = current.filter(row => !before.some(x => x.key === row.key));
  for (const row of added) assert(row.name.endsWith(`_${project}`) && (row.kind === 'container' ? row.labels?.['com.supabase.cli.project'] === project : !row.labels?.['com.supabase.cli.project'] || row.labels['com.supabase.cli.project'] === project), 'UNOWNED_RESOURCE');
  return added;
}
export function replayOwnership(previous, current, project, started) {
  const database = `supabase_db_${project}`;
  for (const old of previous) {
    const next = current.find(row => row.key === old.key);
    if (!next) { assert.equal(old.kind, 'container'); assert.equal(old.name, database); continue; }
    if (JSON.stringify(old) === JSON.stringify(next)) continue;
    assert.equal(old.kind, 'volume'); assert.equal(old.name, database);
    assert.deepEqual(next, { ...old, created: next.created });
    assert(Date.parse(next.created) >= Math.floor(started / 1000) * 1000, 'UNACKNOWLEDGED_REPLACEMENT');
  }
  for (const row of current.filter(x => !previous.some(old => old.key === x.key))) { assert.equal(row.kind, 'container'); assert.equal(row.name, database); assert(Date.parse(row.created) >= Math.floor(started / 1000) * 1000); }
  return current;
}
export function absent(owned, current, project) {
  assert(!current.some(row => owned.some(x => x.key === row.key) || row.name.endsWith(`_${project}`)), 'OWNED_RESOURCE_REMAINS');
}
export function acceptance(receipt, assertions) {
  assert.equal(receipt.status, 'teardown_verified'); assert.equal(receipt.interrupted, false);
  assert(!receipt.error && !receipt.cleanupError); assert(Number.isFinite(Date.parse(receipt.teardownVerifiedAt)));
  assert.equal(assertions.status, 'assertions_passed'); assert.equal(assertions.sourceSha, receipt.sourceSha);
  assert.equal(assertions.stackId, receipt.project); assert.equal(assertions.checks.foreignFixturesUnchanged, true);
  assert(assertions.checks.foreignSentinelCount > 0); assert.equal(receipt.lintUnchanged, true);
  for (const kind of ['container', 'volume', 'network']) {
    assert(receipt.owned.some(row => row.kind === kind), `MISSING_${kind}_OWNERSHIP`);
    assert.equal(receipt.remaining[kind], 0);
  }
}
async function main() {
  const mode = process.argv[2], phase = process.argv[3];
  assert(['run', 'cleanup', 'finalize'].includes(mode)); assert.equal(phase, 'events');
  const env = process.env, root = realpathSync('.'), out = '/tmp/ref018';
  assert.equal(env.GITHUB_ACTIONS, 'true'); assert.equal(env.GITHUB_JOB, 'campaign-qualification');
  assert.equal(root, realpathSync(env.GITHUB_WORKSPACE)); assert.match(env.GITHUB_RUN_ID, /^\d+$/); assert.match(env.GITHUB_RUN_ATTEMPT, /^\d+$/);
  assert(!env.DOCKER_HOST && !env.DOCKER_CONTEXT && !env.DOCKER_TLS_VERIFY, 'DOCKER_OVERRIDE');
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH)), sourceSha = event.pull_request?.head.sha || env.GITHUB_SHA;
  assert.match(sourceSha, /^[a-f0-9]{40}$/); assert.equal(env.RELEASE_COMMIT, sourceSha);
  const work = join(realpathSync(env.RUNNER_TEMP), `ref046-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}-${phase}`);
  const journal = join(out, `ref046-${phase}-ownership.json`), provisional = join(out, 'ref046-events.json');
  const childEnv = { PATH: env.PATH, HOME: env.HOME, CI: 'true', DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' };
  const cli = resolve('node_modules/.bin/supabase'); let active, interrupted = false, receipt, cancellationTimer;
  const save = () => writeFileSync(journal, JSON.stringify(receipt, null, 2) + '\n');
  const signal = () => { interrupted = true; if (active?.pid) { const pid = active.pid; process.kill(-pid, 'SIGTERM');
    cancellationTimer = setTimeout(() => { if (active?.pid === pid) process.kill(-pid, 'SIGKILL'); }, 10000); } };
  process.on('SIGTERM', signal); process.on('SIGINT', signal);
  async function run(command, args, log, cleanup = false) {
    if (!cleanup) assert(!interrupted, 'INTERRUPTED');
    if (log) console.log(`REF046 stage: ${log}`);
    return await new Promise((done, reject) => {
      const child = spawn(command, args, { env: childEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }); active = child;
      let stdout = '', stderr = ''; const timer = setTimeout(() => process.kill(-child.pid, 'SIGKILL'), 300000);
      child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
      child.on('error', error => { clearTimeout(timer); clearTimeout(cancellationTimer); active = undefined; reject(error); });
      child.on('close', code => { clearTimeout(timer); clearTimeout(cancellationTimer); active = undefined;
        if (log) writeFileSync(join(out, log), stdout + stderr);
        if (log === 'ref046-events.log') { const line = stdout.split('\n').find(x => x.startsWith('{"task":"REF-046a"')); if (line) console.log(line); }
        if (code !== 0 || (!cleanup && interrupted)) reject(new Error(`PROCESS_FAILED:${command.split('/').at(-1)}:${code}`)); else done(stdout.trim());
      });
    });
  }
  async function inventory() {
    const rows = [];
    for (const kind of ['container', 'volume', 'network']) {
      const ids = (await run('docker', [kind, 'ls', ...(kind === 'container' ? ['-a'] : []), '-q'], undefined, true)).split(/\s+/).filter(Boolean);
      for (const id of ids) {
        const format = `{ "name": {{json .Name}}, "labels": {{json ${kind === 'container' ? '.Config.Labels' : '.Labels'}}}, "created": {{json ${kind === 'volume' ? '.CreatedAt' : '.Created'}}}${kind === 'volume' ? '' : ', "id": {{json .Id}}'} }`;
        const row = JSON.parse(await run('docker', [kind, 'inspect', id, '--format', format], undefined, true));
        row.name = row.name.replace(/^\//, ''); rows.push({ kind, ...row, key: `${kind}:${row.id || row.name}` });
      }
    }
    return rows.sort((a, b) => a.key.localeCompare(b.key));
  }
  async function cleanup() {
    assert.equal(hash(readFileSync(join(work, 'supabase/config.toml'))), receipt.configHash, 'CONFIG_CHANGED');
    const current = await inventory(), found = ownedDelta(receipt.before, current, receipt.project);
    for (const row of receipt.owned) if (current.some(x => x.key === row.key)) assert.deepEqual(current.find(x => x.key === row.key), row, 'OWNERSHIP_CHANGED');
    receipt.owned = [...new Map([...receipt.owned, ...found].map(x => [x.key, x])).values()]; save();
    if (found.length) await run(cli, ['stop', '--workdir', work, '--no-backup'], 'ref046-stop.log', true);
    const after = await inventory(); absent([...(receipt.replayBefore || []), ...receipt.owned], after, receipt.project); ownedDelta(receipt.before, after, receipt.project);
    receipt.remaining = Object.fromEntries(['container', 'volume', 'network'].map(kind => [kind, after.filter(x => x.kind === kind && [...(receipt.replayBefore || []), ...receipt.owned].some(r => r.key === x.key)).length]));
    receipt.teardownVerifiedAt = new Date().toISOString(); save();
  }
  mkdirSync(out, { recursive: true });
  assert.equal(await run('git', ['rev-parse', 'HEAD'], undefined, true), sourceSha);
  const context = JSON.parse(await run('docker', ['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}'], undefined, true));
  assert.equal(context, 'unix:///var/run/docker.sock', 'REMOTE_DOCKER');
  if (mode !== 'run') {
    assert(existsSync(journal), 'MISSING_OWNERSHIP'); receipt = JSON.parse(readFileSync(journal));
    assert.equal(receipt.sourceSha, sourceSha); assert.equal(receipt.work, work); assert.equal(receipt.runAttempt, env.GITHUB_RUN_ATTEMPT);
    assert(new RegExp(`^ref046-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}-${phase}-[a-f0-9]{8}$`).test(receipt.project));
    if (mode === 'cleanup') {
      try { await cleanup(); } catch (error) { receipt.status = 'failed'; receipt.cleanupError = String(error); throw error; }
      finally { receipt.interrupted ||= interrupted; if (interrupted) receipt.status = 'failed'; save(); }
      assert(!interrupted, 'INTERRUPTED'); return;
    }
    const assertions = JSON.parse(readFileSync(provisional)); acceptance(receipt, assertions); assert(!interrupted);
    const current = await inventory(); absent([...(receipt.replayBefore || []), ...receipt.owned], current, receipt.project); ownedDelta(receipt.before, current, receipt.project);
    assert(!interrupted, 'INTERRUPTED');
    writeFileSync(join(out, 'ref046-acceptance.json'), JSON.stringify({ status: 'passed', sourceSha, phase, receipt, assertions,
      requiresSuccessfulWorkflowConclusion: true }, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'passed', sourceSha, project: receipt.project, owned: receipt.owned, remaining: receipt.remaining, checks: assertions.checks })); return;
  }
  assert(!existsSync(journal) && !existsSync(work), 'PREEXISTING_OWNERSHIP');
  const project = `ref046-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}-${phase}-${randomUUID().slice(0, 8)}`;
  const before = await inventory(); assert(!before.some(x => x.name.endsWith(`_${project}`)));
  cpSync('backend/supabase', join(work, 'supabase'), { recursive: true, filter: p => !/(^|\/)\.(temp|branches)(\/|$)/.test(p) });
  const config = join(work, 'supabase/config.toml'); writeFileSync(config, readFileSync(config, 'utf8').replace(/^project_id = "econovaria"$/m, `project_id = "${project}"`));
  assert(readFileSync(config, 'utf8').includes(`project_id = "${project}"`));
  receipt = { sourceSha, phase, project, work, runAttempt: env.GITHUB_RUN_ATTEMPT, status: 'provisional', interrupted: false, before, owned: [], configHash: hash(readFileSync(config)) }; save();
  childEnv.REF046_DISPOSABLE_DATABASE = '1'; childEnv.REF046_STACK_ID = project; childEnv.RELEASE_COMMIT = sourceSha;
  try {
    await run(cli, ['start', '--workdir', work, '--exclude', 'studio,imgproxy,storage-api,logflare,vector,supavisor,realtime,postgres-meta,mailpit,edge-runtime'], 'ref046-start.log');
    receipt.owned = ownedDelta(before, await inventory(), project); save();
    const replayStarted = Date.now(); receipt.replayBefore = receipt.owned; save();
    await run(cli, ['db', 'reset', '--workdir', work, '--local'], 'ref046-replay.log');
    receipt.owned = replayOwnership(receipt.replayBefore, ownedDelta(before, await inventory(), project), project, replayStarted); save();
    const lintArgs = ['db', 'lint', '--workdir', work, '--local', '--level', 'warning', '--output', 'json'];
    const lintBefore = JSON.parse(await run(cli, lintArgs, 'ref046-lint-before.log'));
    await run('deno', ['run', '--config', 'backend/supabase/functions/deno.json', '--lock=backend/supabase/functions/deno.lock', '--frozen',
      '--allow-env=DATABASE_URL,REF046_DISPOSABLE_DATABASE,REF046_STACK_ID,RELEASE_COMMIT,PATH', '--allow-read', '--allow-run=psql', '--allow-write=/tmp/ref018', '--deny-net', 'scripts/ref-046-campaign-acceptance.ts', '--phase=events'], 'ref046-events.log');
    const lintAfter = JSON.parse(await run(cli, lintArgs, 'ref046-lint-after.log'));
    const normalize = rows => rows.flatMap(row => row.issues.map(issue => JSON.stringify({ function: row.function, issue }))).sort();
    assert.deepEqual(normalize(lintAfter), normalize(lintBefore), 'LINT_CHANGED'); receipt.lintUnchanged = true;
  } catch (error) { receipt.error = String(error); }
  finally {
    try { await cleanup(); } catch (error) { receipt.cleanupError = String(error); }
    receipt.interrupted = interrupted; receipt.status = !receipt.error && !receipt.cleanupError && !interrupted && receipt.teardownVerifiedAt ? 'teardown_verified' : 'failed'; save();
    process.removeListener('SIGTERM', signal); process.removeListener('SIGINT', signal);
  }
  assert.equal(receipt.status, 'teardown_verified', JSON.stringify({ error: receipt.error, cleanupError: receipt.cleanupError, interrupted }));
}
if (process.argv[2] === '--self-test') {
  const { test } = await import('node:test'), project = 'ref046-1-1-events-12345678';
  const owned = ['container', 'volume', 'network'].map(kind => ({ kind, key: kind, name: `test_${project}`, labels: { 'com.supabase.cli.project': project } }));
  const receipt = { status: 'teardown_verified', interrupted: false, sourceSha: 'a'.repeat(40), project, lintUnchanged: true,
    teardownVerifiedAt: new Date().toISOString(), owned, remaining: { container: 0, volume: 0, network: 0 } };
  const assertions = { status: 'assertions_passed', sourceSha: receipt.sourceSha, stackId: project, checks: { foreignFixturesUnchanged: true, foreignSentinelCount: 1 } };
  await test('ownership rejects changed foreign rows and unrelated additions', () => {
    assert.throws(() => ownedDelta([{ key: 'foreign' }], [], project));
    assert.throws(() => ownedDelta([], [{ key: 'foreign', name: 'foreign' }], project));
    assert.deepEqual(ownedDelta([], owned, project), owned);
  });
  await test('only acknowledged reset database generations may replace ownership', () => {
    const old = { ...owned[1], name: `supabase_db_${project}`, created: '2026-10-08T00:00:00Z' }, next = { ...old, created: '2026-10-08T00:00:01Z' };
    assert.deepEqual(replayOwnership([old], [next], project, Date.parse(next.created)), [next]);
    assert.throws(() => replayOwnership([old], [next], project, Date.parse(next.created) + 2000));
    assert.throws(() => replayOwnership([old], [{ ...next, labels: {} }], project, 0));
  });
  await test('every retained resource type prevents teardown certification', () => {
    for (const row of owned) assert.throws(() => absent(owned, [row], project));
    absent(owned, [], project);
  });
  await test('missing, failed, interrupted or incomplete receipts cannot pass', () => {
    for (const patch of [{ status: 'failed' }, { interrupted: true }, { cleanupError: 'inspection failed' }, { lintUnchanged: false }, { owned: [] }, { remaining: {} }, { teardownVerifiedAt: undefined }]) assert.throws(() => acceptance({ ...receipt, ...patch }, assertions));
    assert.throws(() => acceptance(receipt, { ...assertions, sourceSha: 'b'.repeat(40) }));
    assert.throws(() => acceptance(receipt, { ...assertions, checks: {} })); acceptance(receipt, assertions);
  });
} else if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) await main();
