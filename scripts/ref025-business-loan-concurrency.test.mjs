import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';
import { spawn, execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { deadline, exchange, closeClient, intendedBlocker, checkedBackendCount, applicationEffects, decodeRow, authorityEffects, eligibilityEffects, incomeAssessment, incomeApplicationEffects } from './ref025-business-loan-concurrency.mjs';

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
  const section = workflow.slice(workflow.indexOf('      - name: REF025 disposable race phase'), workflow.indexOf('      - name: REF025 separate income phase'));
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

test('submission effect oracle rejects extra money, debt, audit, profile or application effects', () => {
  const before = { applications: [], profiles: [], audits: [], loans: [], ledger: [{ id: 'ledger', amount: 240 }], balances: [{ id: 'balance', balance: 260 }] };
  const app = { id: 'application', borrower_business_id: 'business', business_id: 'business', initiating_operator_player_id: 'operator', player_id: 'operator',
    idempotency_key: 'request-key', obligation_currency_code: 'ECO', liability_kind: 'business_v1', status: 'pending_review', amount: 60 };
  const after = { ...structuredClone(before), applications: [app], profiles: [{ player_id: 'operator' }],
    audits: [{ id: 'audit', action: 'business.loan.application.submit', target_id: app.id, actor_id: 'operator', metadata: { assessment: { qualifying_income: 240 } } }] };
  applicationEffects(before, after, 'operator', 'request-key', 'business');
  for (const corrupt of [
    s => s.ledger[0].amount++, s => s.balances[0].balance++, s => s.loans.push({ id: 'new-debt' }),
    s => s.applications.push({ ...app, id: 'duplicate' }), s => s.applications[0].initiating_operator_player_id = 'successor',
    s => s.applications[0].borrower_business_id = 'foreign-business', s => s.applications[0].obligation_currency_code = 'NRC', s => s.applications[0].idempotency_key = 'other-key',
    s => s.audits.push({ ...s.audits[0], id: 'duplicate' }), s => s.audits[0].metadata.assessment.qualifying_income = 0,
    s => s.profiles.push({ player_id: 'successor' })
  ]) {
    const changed = structuredClone(after); corrupt(changed);
    assert.throws(() => applicationEffects(before, changed, 'operator', 'request-key', 'business'));
  }
});
test('fixture removes only the application gate and uses real settlement helpers', () => {
  const sql = readFileSync(new URL('./ref025-business-loan-concurrency.sql', import.meta.url), 'utf8');
  assert.equal(sql.split('-- REF025 session helpers').length, 2);
  assert.deepEqual(sql.match(/alter table[^;]+;/gi), ['alter table public.loan_applications drop constraint loan_applications_business_liability_disabled_v1;']);
  assert(sql.includes('public.settle_business_store_offer_v2('));
  assert(sql.includes('public.settle_business_store_offer_funding_v1('));
  assert(!/disable trigger|session_replication_role|security definer/i.test(sql));
});
test('JSON framing preserves multiline composite aggregates and rejects missing or extra rows', () => {
  const payload = '[{"game":1},\n {"game":2,"text":"escaped\\nline"}]', marker = 'rnonce:';
  assert.throws(() => JSON.parse(payload.split('\n')[0]), /Unexpected end/);
  assert.deepEqual(decodeRow(`previous\n${marker}${payload}${marker}\nrdone:done\n`, marker), JSON.parse(payload));
  assert.equal(decodeRow(`${marker}0${marker}\r\n`, marker), 0);
  for (const output of ['', `${marker}${payload}`, `prefix${marker}0${marker}\n`, `${marker}0${marker}`, `${marker}0${marker}\n${marker}1${marker}\n`]) {
    assert.throws(() => decodeRow(output, marker), /JSON_FRAMING/);
  }
});
test('bounded authority retains all predecessor verification checks and protected locks', () => {
  const read = n => JSON.parse(readFileSync(new URL(`../docs/operations/contracts/player-cross-cutting/pr-${n}.json`, import.meta.url)));
  const prior = read(865), current = read(866);
  assert.deepEqual(current.requiredChecks, prior.requiredChecks);
  assert.deepEqual(current.criticalJobChecks, prior.criticalJobChecks);
  for (const p of ['scripts/verify-player-cross-cutting-authority.mjs', 'scripts/player-cross-cutting-authority.test.mjs']) assert(current.allowedPaths.includes(p));
  assert(current.requiredFiles.includes('scripts/player-cross-cutting-authority.test.mjs'));
});
test('authority transition preserves borrower/proposal and rejects incorrect or rolled-back mandates', () => {
  const fixture = { g: 'game', b: 'business', buyer: 'successor', proposal_id: 'proposal' };
  const before = { business: { owner_player_id: 'original', currency_code: 'ECO' }, proposal: { id: 'proposal', status: 'open' }, mandates: [] };
  const after = { ...structuredClone(before), mandates: [{ game_session_id: 'game', business_id: 'business', player_id: 'successor', source_proposal_id: 'proposal' }] };
  authorityEffects(before, after, fixture, true);
  authorityEffects(before, structuredClone(before), fixture, false);
  assert.throws(() => authorityEffects(before, after, fixture, false));
  assert.throws(() => authorityEffects(after, after, fixture, true), /OWNER_FALLBACK/);
  for (const corrupt of [
    s => s.business.owner_player_id = 'successor', s => s.business.currency_code = 'NRC',
    s => s.proposal.status = 'closed', s => s.mandates.push({ ...s.mandates[0] }),
    ...['game_session_id', 'business_id', 'player_id', 'source_proposal_id'].map(field => s => s.mandates[0][field] = 'wrong')
  ]) {
    const changed = structuredClone(after); corrupt(changed);
    assert.throws(() => authorityEffects(before, changed, fixture, true));
  }
});
test('Child3 retains predecessor required checks and exact authority-only paths', () => {
  const read = n => JSON.parse(readFileSync(new URL(`../docs/operations/contracts/player-cross-cutting/pr-${n}.json`, import.meta.url)));
  const prior = read(866), current = read(867);
  assert.deepEqual(current.requiredChecks, prior.requiredChecks);
  assert.deepEqual(current.criticalJobChecks, prior.criticalJobChecks);
  assert.deepEqual(current.allowedPaths, prior.allowedPaths.map(p => p.replace('pr-866.json', 'pr-867.json')));
  assert.deepEqual(current.requiredFiles, prior.requiredFiles);
  for (const flag of ['productionDeploymentAllowed', 'productionMutationAllowed', 'secretValuesAllowed']) assert.equal(current[flag], false);
});
test('eligibility oracle permits only the selected status and exact transaction timestamp', () => {
  const before = {
    business: { id: 'borrower', currency_code: 'ECO' },
    product: { id: 'product', status: 'active', updated_at: '2026-10-06T00:00:00+00:00', annual_rate: 0 },
    party: { id: 'party', status: 'active', updated_at: '2026-10-06T00:00:00+00:00', business_id: 'borrower' },
    account: { id: 'account', status: 'active', updated_at: '2026-10-06T00:00:00+00:00', currency_code: 'ECO' }
  };
  const time = '2026-10-06T01:00:00+00:00';
  for (const [target, status] of [['product', 'paused'], ['party', 'disabled'], ['account', 'restricted']]) {
    const after = structuredClone(before);
    Object.assign(after[target], { status, updated_at: time });
    eligibilityEffects(before, after, target, status, time);
    assert.throws(() => eligibilityEffects(before, before, target, status, time));
    for (const corrupt of [
      s => s[target].status = 'active', s => s[target].id = 'other',
      s => s[target].updated_at = before[target].updated_at,
      s => s.business.currency_code = 'NRC', s => s.product.annual_rate = 10,
      s => s.party.business_id = 'other', s => s.account.currency_code = 'NRC',
      s => s.extra = 'unexpected'
    ]) {
      const changed = structuredClone(after); corrupt(changed);
      assert.throws(() => eligibilityEffects(before, changed, target, status, time));
    }
    assert.throws(() => eligibilityEffects(before, after, target, status, 'not-a-time'));
  }
  assert.throws(() => eligibilityEffects(before, before, 'business', 'closed', time));
});
test('Child4 retains predecessor required checks and exact eligibility-only paths', () => {
  const read = n => JSON.parse(readFileSync(new URL(`../docs/operations/contracts/player-cross-cutting/pr-${n}.json`, import.meta.url)));
  const prior = read(867), current = read(869);
  assert.deepEqual(current.requiredChecks, prior.requiredChecks);
  assert.deepEqual(current.criticalJobChecks, prior.criticalJobChecks);
  assert.deepEqual(current.allowedPaths, prior.allowedPaths.map(p => p.replace('pr-867.json', 'pr-869.json')));
  assert.deepEqual(current.requiredFiles, prior.requiredFiles);
  for (const flag of ['productionDeploymentAllowed', 'productionMutationAllowed', 'secretValuesAllowed']) assert.equal(current[flag], false);
});
test('both actual workflow failure chains restore independently and gate the next phase', () => {
  const workflow = readFileSync(new URL('../.github/workflows/banking-fx-clearing-v1.yml', import.meta.url), 'utf8');
  const step = name => workflow.split(`      - name: ${name}\n`)[1].split('      - name: ')[0];
  const condition = name => step(name).match(/^        if: (.+)$/mu)[1];
  const admission = condition('REF025 separate income phase');
  const contexts = (phase, income, verified, healthy) => ({ always: () => true, success: () => healthy,
    steps: { ref025_phase: { outcome: phase }, ref025_verified: { outcome: verified }, ref025_income: { outcome: income } } });
  const run = (expression, context) => vm.runInNewContext(expression, context);
  for (const phase of ['success', 'failure', 'skipped', ''])
  for (const income of ['success', 'failure', 'skipped', '']) {
    for (const reset of ['success', 'failure']) for (const verified of ['success', 'failure', 'skipped', '']) {
      const healthy = phase === 'success' && reset === 'success' && verified === 'success';
      assert.equal(run(admission, contexts(phase, income, verified, healthy)), healthy);
      assert.equal(run(admission, contexts(phase, income, verified, true)), verified === 'success');
      assert.equal(run(admission, contexts(phase, income, verified, false)), false); // Any earlier job failure blocks admission.
      for (const [name, owner] of [
        ['Restore REF025 disposable database from zero', 'ref025_phase'],
        ['Verify REF025 restored gates and migration ledger', 'ref025_phase'],
        ['Restore REF025 income database from zero', 'ref025_income'],
        ['Verify REF025 income restored gates and migration ledger', 'ref025_income']
      ]) {
        const expected = !['skipped', ''].includes(owner === 'ref025_phase' ? phase : income);
        assert.equal(run(condition(name), contexts(phase, income, verified, healthy)), expected);
        assert.equal(run(condition(name), contexts(phase, income, verified, false)), expected);
        const wrong = owner === 'ref025_phase' ? 'ref025_income' : 'ref025_phase';
        if (['skipped', ''].includes(phase) !== ['skipped', ''].includes(income)) {
          assert.notEqual(run(condition(name).replaceAll(owner, wrong), contexts(phase, income, verified, false)), expected);
        }
      }
    }
  }
  for (const [restore, verify] of [
    ['Restore REF025 disposable database from zero', 'Verify REF025 restored gates and migration ledger'],
    ['Restore REF025 income database from zero', 'Verify REF025 income restored gates and migration ledger']
  ]) {
    assert.match(step(restore), /set -euo pipefail/u);
    assert.match(step(restore), /--attest/u);
    assert(step(restore).indexOf('--attest') < step(restore).indexOf('supabase db reset --workdir backend --local'));
    assert.match(step(verify), /run: node scripts\/ref025-business-loan-concurrency\.mjs --verify/u);
    assert.doesNotMatch(step(restore) + step(verify), /continue-on-error|\|\| true/u);
  }
  assert.match(step('Verify REF025 restored gates and migration ledger'), /id: ref025_verified/u);
  assert.match(step('REF025 separate income phase'), /id: ref025_income/u);
  assert.match(step('REF025 separate income phase'), /run: node scripts\/ref025-business-loan-concurrency\.mjs --income-phase/u);
  for (const name of ['REF025 disposable race phase', 'REF025 separate income phase']) assert.doesNotMatch(step(name), /continue-on-error|\|\| true/u);
});
test('Child5a preserves predecessor checks and adds only the registered workflow path', () => {
  const read = n => JSON.parse(readFileSync(new URL(`../docs/operations/contracts/player-cross-cutting/pr-${n}.json`, import.meta.url)));
  const prior = read(869), current = read(870);
  assert.deepEqual(current.requiredChecks, prior.requiredChecks);
  assert.deepEqual(current.criticalJobChecks, prior.criticalJobChecks);
  assert.deepEqual(current.allowedPaths, ['.github/workflows/banking-fx-clearing-v1.yml', ...prior.allowedPaths.map(p => p.replace('pr-869.json', 'pr-870.json'))]);
  assert.deepEqual(current.requiredFiles, prior.requiredFiles);
  for (const flag of ['productionDeploymentAllowed', 'productionMutationAllowed', 'secretValuesAllowed']) assert.equal(current[flag], false);
});

test('income assessment oracle rejects missing, duplicate, cross-currency or changed affordability', () => {
  for (const income of [240, 360, 480]) {
    const row = { obligation_currency_code: 'ECO', assessed_at: '2026-10-07T00:00:00Z', qualifying_income: income,
      income_per_payment: income / 6, projected_payment: 20, affordability_ratio: Math.round(120 / income * 1e6) / 1e6,
      maximum_payment_to_income: 0.45, minimum_credit_score: 600, affordable: income >= 360 };
    incomeAssessment(row, income);
    for (const patch of [{ qualifying_income: income + 120 }, { obligation_currency_code: 'USD' },
      { assessed_at: null }, { affordable: !row.affordable }, { maximum_payment_to_income: 1 }, { minimum_credit_score: 0 }]) {
      assert.throws(() => incomeAssessment({ ...row, ...patch }, income));
    }
  }
});
test('income application oracle rejects extra settlement effects, lost rows and changed borrower assessment', () => {
  const profile = { id: 'profile', player_id: 'owner', score: 660, default_count: 0, created_at: '2026-10-06T00:00:00Z', calculated_at: '2026-10-06T00:00:00Z', updated_at: '2026-10-06T00:00:00Z' };
  const before = { economic: { applications: [], audits: [], profiles: [profile], loans: [], ledger: [], balances: [] }, receipts: [{ id: 'sale' }] };
  const f = { owner_id: 'owner', b: 'business', business_key: 'biz_key' };
  const app = { id: 'app', amount: 120, credit_score: 660, created_at: '2026-10-07T00:00:00Z', liability_kind: 'business_v1', status: 'pending_review', player_id: 'owner',
    initiating_operator_player_id: 'owner', borrower_business_id: 'business', business_id: 'business',
    idempotency_key: 'key', obligation_currency_code: 'ECO', projected_payment: 20, affordability_ratio: 0.333333, repayment_source: 'business:biz_key' };
  const assessment = { obligation_currency_code: 'ECO', assessed_at: '2026-10-07T00:00:00Z', qualifying_income: 360,
    income_per_payment: 60, projected_payment: 20, affordability_ratio: 0.333333, maximum_payment_to_income: 0.45, minimum_credit_score: 600, affordable: true };
  const after = structuredClone(before); after.economic.applications.push(app);
  Object.assign(after.economic.profiles[0], { calculated_at: app.created_at, updated_at: app.created_at });
  after.economic.audits.push({ id: 'audit', action: 'business.loan.application.submit', actor_id: 'owner', target_id: 'app', metadata: { assessment } });
  incomeApplicationEffects(before, after, f, 'key');
  const fresh = structuredClone(after); fresh.economic.applications[0].affordability_ratio = 0.25;
  Object.assign(fresh.economic.audits[0].metadata.assessment, { qualifying_income: 480, income_per_payment: 80, affordability_ratio: 0.25 });
  incomeApplicationEffects(before, fresh, f, 'key', 480);
  assert.throws(() => incomeApplicationEffects(before, after, f, 'key', 480));
  for (const [field, value] of Object.entries({ id: 'other', score: 850, default_count: 1, created_at: app.created_at, calculated_at: profile.calculated_at, updated_at: profile.updated_at, unexpected: true })) {
    const bad = structuredClone(after); bad.economic.profiles[0][field] = value; assert.throws(() => incomeApplicationEffects(before, bad, f, 'key'));
  }
  for (const corrupt of [x => x.receipts.pop(), x => x.economic.ledger.push({ id: 'extra' }),
    x => x.economic.applications[0].initiating_operator_player_id = 'successor', x => x.economic.applications[0].amount = 60,
    x => x.economic.applications[0].repayment_source = 'checking', x => x.economic.profiles.push({ player_id: 'other' }),
    x => x.economic.audits[0].metadata.assessment.qualifying_income = 480, x => x.economic.audits.push({ id: 'extra' })]) {
    const bad = structuredClone(after); corrupt(bad); assert.throws(() => incomeApplicationEffects(before, bad, f, 'key'));
  }
});
test('Child5b preserves required checks and excludes workflow/shared helper from editable scope', () => {
  const read = n => JSON.parse(readFileSync(new URL(`../docs/operations/contracts/player-cross-cutting/pr-${n}.json`, import.meta.url)));
  const prior = read(870), current = read(872);
  for (const field of ['requiredChecks', 'criticalJobChecks', 'requiredFiles']) assert.deepEqual(current[field], prior[field]);
  assert.deepEqual([...current.allowedPaths].sort(), prior.allowedPaths.filter(p => !p.startsWith('.github/')).map(p => p.replace('pr-870.json', 'pr-872.json')).sort());
  assert.deepEqual(current.readOnlyPaths, ['scripts/verify-player-cross-cutting-authority.mjs', 'scripts/player-cross-cutting-authority.test.mjs']);
  assert.equal(current.nonblankChangedLineLimit, 385); assert.equal(Object.keys(current.editablePathLineLimits).length, 5);
  for (const flag of ['productionDeploymentAllowed', 'productionMutationAllowed', 'secretValuesAllowed']) assert.equal(current[flag], false);
});
