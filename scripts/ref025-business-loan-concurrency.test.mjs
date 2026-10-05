import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';
import { spawn, execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { deadline, exchange, closeClient, intendedBlocker, checkedBackendCount } from './ref025-business-loan-concurrency.mjs';

// Exercise the same asynchronous process/marker boundary without requiring a database.
function processSession() {
  const child = spawn(process.execPath, ['-e', `process.stdin.on('data', data => {
    const text = data.toString(); const marker = text.match(/select '(r[0-9a-f]+:done)'/)[1];
    setTimeout(() => process.stdout.write(marker + '\\n'), Number(text.match(/^\\d+/)[0]));
  });`]);
  let output = '';
  child.stdout.on('data', data => { output += data; });
  return {
    child, errors: '', write: text => child.stdin.write(text), close: () => child.stdin.end(),
    waitFor(marker, ms) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { clearInterval(poll); reject(new Error('marker timeout')); }, ms);
        const poll = setInterval(() => { if (output.includes(marker)) { clearTimeout(timer); clearInterval(poll); resolve(); } }, 1);
      });
    }
  };
}
test('real subprocess cannot turn a 5ms/35ms overrun into success', async () => {
  const session = processSession();
  try { await assert.rejects(exchange(session, '35', deadline(5))); }
  finally { await closeClient(session, deadline(3000)); }
  assert(session.child.exitCode !== null || session.child.signalCode !== null);
  await assert.rejects(exchange(session, '0', deadline(50)), /CLOSED/);
});
test('successive commands share one deadline, and late markers fail', async () => {
  const session = processSession();
  try {
    await exchange(session, '0', deadline(3000)); // Allow process startup independently.
    const remaining = deadline(100);
    await exchange(session, '10', remaining);
    await assert.rejects(exchange(session, '150', remaining));
    await assert.rejects(exchange(session, '0', deadline(3000)), /CLOSED/);
  } finally { await closeClient(session, deadline(3000)); }
});
test('a marker that resolves after a blocked event loop is still rejected', async () => {
  const session = { errors: '', write() {}, waitFor() { return new Promise(resolve => {
    const end = performance.now() + 35; while (performance.now() < end) {} resolve();
  }); } };
  await assert.rejects(exchange(session, 'select 1', deadline(5)), /DEADLINE/);
});
test('exact waiter and blocker identities are required', () => {
  const waiter = { pid: 10, start: 'one' }, blocker = { pid: 20, start: 'two' };
  const row = { ...waiter, wait: 'Lock', blockers: [20], blockerStart: 'two' };
  intendedBlocker(row, waiter, blocker);
  for (const patch of [{ pid: 11 }, { start: null }, { blockerStart: null }, { blockers: [21] }, { blockers: [20, 21] }, { wait: null }]) {
    assert.throws(() => intendedBlocker({ ...row, ...patch }, waiter, blocker));
  }
});
test('workflow restores after failures and independently checks restoration', () => {
  const workflow = readFileSync(new URL('../.github/workflows/banking-fx-clearing-v1.yml', import.meta.url), 'utf8');
  const section = workflow.slice(workflow.indexOf('      - name: REF025 disposable race phase'), workflow.indexOf('      - name: Lint rebuilt database'));
  assert.equal((section.match(/if: always\(\)/g) || []).length, 2);
  assert(section.indexOf('--attest') < section.indexOf('supabase db reset'));
  assert(section.indexOf('supabase db reset') < section.indexOf('--verify'));
  assert(!section.includes('|| true') && !section.includes('continue-on-error'));
});

test('a client that does not exit is a cleanup failure', async () => {
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
  const session = { child, close() {} };
  await assert.rejects(closeClient(session, deadline(10)), /CLIENT_EXIT_TIMEOUT/);
  assert.equal(session.closed, true);
});

test('backend absence needs exactly one nonnegative safe integer row', () => {
  for (const value of ['0', '0\n', '12\r\n']) assert.equal(checkedBackendCount(value, deadline(1000)), Number(value));
  for (const value of ['', ' ', '\n', '0\n1\n', '0\n\n', '-1', 'NaN', 'Infinity', '1.5', '1e2', '9007199254740992', '0junk']) {
    assert.throws(() => checkedBackendCount(value, deadline(1000)), /BACKEND_COUNT/);
  }
});
test('a late successful count cannot prove backend absence', async () => {
  const remaining = deadline(5);
  const result = await new Promise(resolve => setTimeout(() => resolve({ stdout: '0\n' }), 35));
  assert.throws(() => checkedBackendCount(result.stdout, remaining), /DEADLINE/);
});
test('actual execFile timeout plus blocked loop cannot bypass cleanup deadline', async () => {
  const remaining = deadline(5);
  const result = promisify(execFile)('/bin/echo', ['0'], { timeout: remaining() });
  result.catch(() => {});
  const until = performance.now() + 40;
  while (performance.now() < until) {}
  await assert.rejects(async () => checkedBackendCount((await result).stdout, remaining),
    error => /REF025_DEADLINE/.test(error.message) || error.killed === true);
});
