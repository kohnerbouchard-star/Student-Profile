import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAIN_CHECKPOINTS, CALLBACK_CHECKPOINTS, markCheckpoint, sealCheckpoints,
  validateCheckpointSnapshot,
} from './checkpoints.mjs';

// Synthetic values only. No host, database, browser, or network observations.
const CANARY = 'private_checkpoint_canary_do_not_disclose';
const MAIN = [
  'not-started',
  'late-snapshot', 'late-route-install', 'late-preview', 'late-submit',
  'late-await-commit', 'late-commit-confirm', 'late-escape', 'late-busy-visible',
  'late-navigation', 'late-dialog-detached', 'late-release', 'late-await-delivery',
  'late-render-settle', 'late-no-codes', 'late-unroute',
  'logout-navigation', 'logout-opener', 'logout-snapshot', 'logout-preview',
  'logout-submit', 'logout-response', 'logout-status', 'logout-receipt',
  'logout-render', 'logout-codes', 'logout-render-settle', 'logout-deadline',
  'logout-database-delta', 'admin-signout', 'admin-redirect', 'admin-no-codes',
  'admin-storage-cleared', 'admin-revoked-request', 'admin-revoked-status',
  'privacy-final-snapshot', 'privacy-persisted', 'privacy-browser-log-size',
  'privacy-browser-logs', 'privacy-browser-storage-read', 'privacy-browser-storage',
  'privacy-browser-cookies', 'privacy-browser-stores', 'privacy-server-entry',
  'privacy-gateway-log-size', 'privacy-gateway-logs', 'privacy-server-enumerate',
  'privacy-server-coverage', 'privacy-service-read', 'privacy-service-logs',
  'student-entry-code', 'student-entry-lifecycle', 'student-entry-representatives',
  'student-access-execution',
];
const CALLBACK = [
  'not-started', 'late-fetch', 'late-status', 'late-receipt', 'late-db-delta',
  'late-hold', 'late-fulfill',
];
const defaults = () => ({ main: 'not-started', callback: 'not-started' });

function rejects(operation, message = 'Invalid checkpoint') {
  assert.throws(operation, error => {
    assert.equal(Object.getPrototypeOf(error), Error.prototype);
    assert.equal(error.message, message);
    assert.deepEqual(Object.keys(error), []);
    assert.equal(JSON.stringify(error), '{}');
    assert.ok(!String(error).includes(CANARY));
    assert.ok(!error.stack.includes(CANARY));
    return true;
  });
}

function hostileValues() {
  let reads = 0;
  const touched = () => { reads++; throw new Error(CANARY); };
  const getters = Object.create(null, Object.fromEntries(
    ['toString', 'valueOf', 'toJSON', 'message', 'stack', 'main', 'callback']
      .map(key => [key, { enumerable: true, get: touched }]),
  ));
  Object.defineProperty(getters, Symbol.toPrimitive, { get: touched });
  const methods = { toString: touched, valueOf: touched, toJSON: touched, [Symbol.toPrimitive]: touched };
  const proxy = new Proxy({}, {
    get: touched, getPrototypeOf: touched, ownKeys: touched,
    getOwnPropertyDescriptor: touched, set: touched,
  });
  return {
    values: [getters, methods, proxy, new String('late-snapshot'), new Error(CANARY),
      Object.create({ toString: touched }), [CANARY], () => CANARY, Symbol(CANARY)],
    assertUntouched: () => assert.equal(reads, 0),
  };
}

test('allowlists are exact frozen distinct literals and every label is accepted', () => {
  assert.deepEqual(MAIN_CHECKPOINTS, MAIN);
  assert.deepEqual(CALLBACK_CHECKPOINTS, CALLBACK);
  for (const [channel, identifiers] of [['main', MAIN_CHECKPOINTS], ['callback', CALLBACK_CHECKPOINTS]]) {
    assert.equal(Object.isFrozen(identifiers), true);
    assert.equal(new Set(identifiers).size, identifiers.length);
    assert.throws(() => identifiers.push(CANARY), TypeError);
    assert.throws(() => { identifiers[0] = CANARY; }, TypeError);
    for (const identifier of identifiers) {
      const report = {};
      assert.equal(markCheckpoint(report, channel, identifier), undefined);
      const snapshot = sealCheckpoints(report);
      assert.deepEqual(snapshot, { ...defaults(), [channel]: identifier });
      assert.equal(validateCheckpointSnapshot(snapshot), snapshot);
    }
  }
});

test('sealing supplies independent defaults and one immutable plain snapshot per report', () => {
  const report = Object.freeze({});
  const snapshot = sealCheckpoints(report);
  assert.deepEqual(snapshot, defaults());
  assert.equal(Object.getPrototypeOf(snapshot), Object.prototype);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.deepEqual(Reflect.ownKeys(snapshot), ['main', 'callback']);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(snapshot))) {
    assert.equal(descriptor.enumerable, true);
    assert.equal(descriptor.writable, false);
    assert.equal(descriptor.configurable, false);
    assert.equal(Object.hasOwn(descriptor, 'get'), false);
  }
  assert.equal(sealCheckpoints(report), snapshot);
  assert.notEqual(sealCheckpoints({}), snapshot);
  assert.throws(() => { snapshot.main = 'late-snapshot'; }, TypeError);
  assert.throws(() => { snapshot.callback = 'late-fetch'; }, TypeError);
  assert.throws(() => { snapshot.private = CANARY; }, TypeError);
  assert.equal(JSON.stringify(snapshot), '{"main":"not-started","callback":"not-started"}');
});

test('main, callback, and separate reports never overwrite each other', () => {
  const first = {}, second = {};
  markCheckpoint(first, 'main', 'late-snapshot');
  markCheckpoint(first, 'callback', 'late-fetch');
  markCheckpoint(first, 'main', 'late-navigation');
  markCheckpoint(first, 'callback', 'late-status');
  markCheckpoint(second, 'main', 'logout-navigation');
  assert.deepEqual(sealCheckpoints(first), { main: 'late-navigation', callback: 'late-status' });
  assert.deepEqual(sealCheckpoints(second), { main: 'logout-navigation', callback: 'not-started' });
});

test('asynchronously ordered callbacks preserve the main operation checkpoint', async () => {
  const report = {};
  let release;
  const held = new Promise(resolve => { release = resolve; });
  markCheckpoint(report, 'main', 'late-submit');
  const callback = (async () => {
    markCheckpoint(report, 'callback', 'late-fetch');
    await held;
    markCheckpoint(report, 'callback', 'late-receipt');
  })();
  markCheckpoint(report, 'main', 'late-navigation');
  release();
  await callback;
  assert.deepEqual(sealCheckpoints(report), { main: 'late-navigation', callback: 'late-receipt' });
});

test('sealing before a callback resumes permanently fixes the serialized snapshot', async () => {
  const report = Object.freeze({ failed: true, pass: false });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const callback = (async () => {
    markCheckpoint(report, 'callback', 'late-hold');
    await held;
    markCheckpoint(report, 'callback', 'late-fulfill');
  })();
  markCheckpoint(report, 'main', 'late-await-delivery');
  const snapshot = sealCheckpoints(report), serialized = JSON.stringify(snapshot);
  release();
  await callback;
  for (const identifier of MAIN) markCheckpoint(report, 'main', identifier);
  for (const identifier of CALLBACK) markCheckpoint(report, 'callback', identifier);
  assert.equal(sealCheckpoints(report), snapshot);
  assert.equal(JSON.stringify(snapshot), serialized);
  assert.deepEqual(snapshot, { main: 'late-await-delivery', callback: 'late-hold' });
  assert.deepEqual(report, { failed: true, pass: false });
});

test('unknown, private, coerced, or cross-channel identifiers reject before and after sealing', () => {
  const hostile = hostileValues();
  const invalid = [undefined, null, true, false, 0, 1n, NaN, '', CANARY,
    'Student Test Name', 'STU-0123456789ABCDEF01234567', '0123456789ABCDEF0123456789ABCDEF',
    'https://private.example/response', '/private/raw/log', '__proto__', 'constructor',
    'late-snapshot\n', ' late-snapshot', 'late-snapshot-private', 'LATE-SNAPSHOT',
    'late-snapshot\u0000', 'privacy-browser-cookies-read', ...hostile.values];
  for (const sealed of [false, true]) {
    const report = {};
    if (sealed) sealCheckpoints(report);
    for (const identifier of invalid) {
      rejects(() => markCheckpoint(report, 'main', identifier));
      rejects(() => markCheckpoint(report, 'callback', identifier));
    }
    for (const identifier of MAIN.filter(value => value !== 'not-started')) {
      rejects(() => markCheckpoint(report, 'callback', identifier));
    }
    for (const identifier of CALLBACK.filter(value => value !== 'not-started')) {
      rejects(() => markCheckpoint(report, 'main', identifier));
    }
    assert.deepEqual(sealCheckpoints(report), defaults());
  }
  hostile.assertUntouched();
});

test('invalid channel and report arguments always produce only fixed errors', () => {
  const hostile = hostileValues();
  for (const report of [{}, Object.freeze({})]) {
    for (const sealed of [false, true]) {
      if (sealed) sealCheckpoints(report);
      for (const channel of [undefined, null, true, 0, 'MAIN', 'main\n', CANARY,
        '__proto__', 'constructor', new String('main'), ...hostile.values]) {
        rejects(() => markCheckpoint(report, channel, 'late-snapshot'));
      }
    }
    assert.deepEqual(sealCheckpoints(report), defaults());
  }
  for (const report of [undefined, null, false, 0, 1n, CANARY, Symbol(CANARY), () => {}]) {
    rejects(() => markCheckpoint(report, 'main', 'late-snapshot'));
    rejects(() => sealCheckpoints(report));
  }
  hostile.assertUntouched();
});

test('report properties, pass/failure fields, and accessors are never inspected or changed', () => {
  const hostile = hostileValues();
  const report = { failed: true, pass: false, passed: false, stage: 'late-response-and-logout' };
  const before = Object.getOwnPropertyDescriptors(report);
  markCheckpoint(report, 'main', 'late-busy-visible');
  markCheckpoint(report, 'callback', 'late-fetch');
  sealCheckpoints(report);
  assert.deepEqual(Object.getOwnPropertyDescriptors(report), before);
  for (const key of hostile.values.filter(value => typeof value === 'object' && value !== null)) {
    markCheckpoint(key, 'main', 'student-entry-code');
    assert.deepEqual(sealCheckpoints(key), { main: 'student-entry-code', callback: 'not-started' });
  }
  hostile.assertUntouched();
});

test('snapshot validation rejects every unknown shape or value without serializing it', () => {
  const hostile = hostileValues();
  const invalid = [undefined, null, false, 0, CANARY, [], () => defaults(),
    {}, { main: 'not-started' }, { callback: 'not-started' },
    { ...defaults(), private: CANARY }, { ...defaults(), [Symbol(CANARY)]: CANARY },
    { ...defaults(), toJSON: () => CANARY },
    Object.create(defaults()), Object.assign(Object.create(null), defaults()),
    Object.assign(Object.create({ toJSON: () => CANARY }), defaults()),
    Object.defineProperty(defaults(), 'private', { value: CANARY }),
    Object.defineProperty(defaults(), 'main', { enumerable: false }),
    Object.defineProperty(defaults(), 'callback', { enumerable: false }),
    ...hostile.values];
  for (const value of [undefined, null, false, 1, CANARY, 'late-snapshot\n', ...hostile.values]) {
    invalid.push({ ...defaults(), main: value }, { ...defaults(), callback: value });
  }
  for (const label of MAIN.filter(value => value !== 'not-started')) invalid.push({ ...defaults(), callback: label });
  for (const label of CALLBACK.filter(value => value !== 'not-started')) invalid.push({ ...defaults(), main: label });
  for (const candidate of invalid) rejects(() => validateCheckpointSnapshot(candidate), 'Invalid checkpoint snapshot');
  hostile.assertUntouched();
});

test('snapshot getters, serializers, custom prototypes, and proxy traps are never invoked', () => {
  let invoked = 0;
  const access = () => { invoked++; throw new Error(CANARY); };
  const candidates = ['main', 'callback', 'toJSON'].map(key =>
    Object.defineProperty(defaults(), key, { enumerable: true, get: access }));
  candidates.push(Object.assign(Object.create({ get toJSON() { return access(); } }), defaults()));
  candidates.push(new Proxy(defaults(), {
    get: access, ownKeys: access, getPrototypeOf: access, getOwnPropertyDescriptor: access,
  }));
  const revoked = Proxy.revocable(defaults(), {});
  revoked.revoke();
  candidates.push(revoked.proxy);
  for (const candidate of candidates) rejects(() => validateCheckpointSnapshot(candidate), 'Invalid checkpoint snapshot');
  assert.equal(invoked, 0);
  const accepted = { callback: 'late-fetch', main: 'late-navigation' };
  assert.equal(validateCheckpointSnapshot(accepted), accepted);
});
