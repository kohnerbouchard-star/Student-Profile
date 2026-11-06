import assert from 'node:assert/strict';
import test from 'node:test';
import { bankingJob, isolate, localAdapter, requireIdentity } from './ref025-disposable-database.mjs';

function fixture(fault = '') {
  const events = []; let exists = false, marker = null, reads = 0;
  const parity = { schema: 'digest', properties: { acl: ['owner'], settings: ['setting'] }, gates: ['application', 'loan'] };
  const fail = phase => { events.push(phase); if (fault === phase) throw new Error(phase); };
  const io = {
    source() { events.push('source'); return { parity, drift: fault === 'drift' && reads++ > 0 }; },
    sourceSessions: () => fault === 'source-busy' ? 1 : 0,
    exists: () => fault === 'collision' || exists,
    create(name) { fail('create'); exists = true; return { name, oid: 42, marker: null }; },
    record() { fail('record'); }, mark(_, value) { fail('mark'); marker = value; },
    verify(r, value) { fail('verify'); assert.equal(r.oid, 42); assert.equal(marker, value); },
    configure() { fail('configure'); }, parity: () => fault === 'parity' ? {} : parity,
    query() { fail('query'); return 'bound'; }, sessions: () => fault === 'child-busy' ? 1 : 0,
    drop() { fail('drop'); exists = false; }, cleaned() { fail('cleaned'); }
  };
  return { io, events };
}
test('only the existing Banking database job selects qualification', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: 'banking-fx-clearing-v1', GITHUB_JOB: 'database-acceptance' };
  assert(bankingJob(env));
  for (const key of Object.keys(env)) assert(!bankingJob({ ...env, [key]: 'other' }));
  assert(!bankingJob({}));
});
test('identity drift is rejected without disclosing values', () => {
  for (const key of ['container', 'system', 'oid', 'marker', 'migration', 'gates', 'acl', 'settings']) {
    assert.throws(() => requireIdentity({ [key]: 'secret-one' }, { [key]: 'secret-two' }), error => !error.message.includes('secret') && /IDENTITY/.test(error.message));
  }
});
test('owned success and callback failure clean up and recheck source', async () => {
  for (const throws of [false, true]) {
    const { io, events } = fixture();
    const result = isolate(io, async child => { assert.equal(await child.query('select 1'), 'bound'); if (throws) throw new Error('callback'); return 'ok'; });
    if (throws) await assert.rejects(result, /callback/); else assert.equal(await result, 'ok');
    assert(events.includes('drop')); assert.equal(events.filter(x => x === 'source').length, 2);
  }
});
test('partial failures never delete an unknown or busy resource', async () => {
  for (const fault of ['source-busy', 'collision', 'create', 'record', 'mark', 'verify', 'configure', 'parity', 'child-busy', 'drop', 'drift']) {
    const { io, events } = fixture(fault);
    await assert.rejects(isolate(io, async () => {}));
    assert.equal(events.filter(x => x === 'source').length, 2);
    if (['source-busy', 'collision', 'create', 'verify', 'child-busy'].includes(fault)) assert(!events.includes('drop'));
    if (['record', 'mark', 'configure', 'parity'].includes(fault)) assert(events.includes('drop'));
  }
});
test('timeout/interruption close the child capability and retain source verification', async () => {
  for (const signal of [false, true]) {
    const { io, events } = fixture(); let child;
    await assert.rejects(isolate(io, value => { child = value; if (signal) process.emit('SIGTERM'); return new Promise(() => {}); }, 10), /TIMEOUT|INTERRUPTED/);
    assert.throws(() => child.query('select 1'), /CLOSED/);
    assert(events.includes('drop')); assert.equal(events.filter(x => x === 'source').length, 2);
  }
});
test('interruption before creation stops without creating or dropping', async () => {
  const { io, events } = fixture();
  io.exists = () => { process.emit('SIGTERM'); return false; };
  await assert.rejects(isolate(io, async () => {}), /INTERRUPTED/);
  assert(!events.includes('create')); assert(!events.includes('drop'));
  assert.equal(events.filter(x => x === 'source').length, 2);
});
test('actual disposable isolation and injected callback cleanup', { skip: process.env.REF025_ISOLATION_QUALIFY !== '1' }, async () => {
  const io = localAdapter();
  await isolate(io, child => assert.equal(child.query('select 1;'), '1'));
  await assert.rejects(isolate(io, async () => { throw new Error('REF025_INJECTED_CALLBACK'); }), /REF025_INJECTED_CALLBACK/);
  console.log(JSON.stringify({ ref025Isolation: 'PASS', clones: 2, sourceGatesUnchanged: true, childGatesRetained: true }));
});
