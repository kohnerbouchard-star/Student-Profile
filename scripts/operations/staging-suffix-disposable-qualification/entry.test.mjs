import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  STAGING_OWNER_ID, STAGING_OWNER_LOGIN, STAGING_REPOSITORY, STAGING_REPOSITORY_ID,
} from '../staging-recovery-evidence/owner-approval.mjs';
import { PROJECT, bindConnection } from '../staging-suffix-apply/control.mjs';
import { renderGuardedBatch, stagedPredicates } from '../staging-suffix-apply/manual.mjs';
import { loadBatch } from '../staging-suffix-qualification/compiler.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const git = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
const source = execFileSync(git, ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const owner = { id: STAGING_OWNER_ID, login: STAGING_OWNER_LOGIN, type: 'User' };

function invokeOffline(target, mode) {
  const fixture = mkdtempSync(join(tmpdir(), 'econovaria-offline-apply-entry-'));
  try {
    const event = join(fixture, 'event.json');
    const unexpected = join(fixture, 'unexpected');
    const output = join(fixture, 'output');
    writeFileSync(event, JSON.stringify({
      ref: 'refs/heads/main',
      repository: { owner, full_name: STAGING_REPOSITORY, id: STAGING_REPOSITORY_ID },
      sender: owner,
      inputs: {
        source_sha: source, staging_project_ref: target, recovery_receipt_sha256: 'sha256:' + '0'.repeat(64),
        verify_authorized: 'true', apply_authorized: 'true',
      },
    }), { mode: 0o600 });
    for (const command of ['gh', 'psql']) {
      writeFileSync(join(fixture, command), '#!/bin/sh\nprintf "%s\\n" unexpected > "$QUAL_UNEXPECTED"\nexit 80\n',
        { mode: 0o700 });
    }
    writeFileSync(join(fixture, 'git'), '#!/bin/sh\nexec "$QUAL_GIT" "$@"\n', { mode: 0o700 });
    const result = spawnSync(process.execPath, ['scripts/operations/staging-suffix-apply/manual.mjs', mode], {
      cwd: root, encoding: 'utf8', timeout: 15_000, env: {
        PATH: fixture, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
        QUAL_GIT: git, QUAL_UNEXPECTED: unexpected,
        GITHUB_REPOSITORY: STAGING_REPOSITORY, GITHUB_REPOSITORY_ID: String(STAGING_REPOSITORY_ID),
        GITHUB_ACTOR_ID: String(STAGING_OWNER_ID), GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: source, GITHUB_RUN_ID: '1',
        GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output,
      },
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(existsSync(unexpected), false, 'Offline fixture attempted an external command');
    assert.equal(existsSync(output), false, 'Offline fixture unexpectedly authorized apply');
    return result.stderr.trim();
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test('real verify and apply entry reject wrong target before evidence acquisition or SQL', () => {
  for (const target of ['cgiukdjwicykrmtkhudh', 'a'.repeat(20)]) {
    for (const mode of ['verify', 'apply']) {
      assert.equal(invokeOffline(target, mode), 'STAGING_PROTECTED_OPERATION_REJECTED');
    }
  }
});

test('correct-target offline envelope still cannot enter SQL or issue authority', () => {
  assert.equal(invokeOffline(PROJECT, 'apply'), 'STAGING_SUFFIX_QUALIFICATION_NOT_RUN');
});

test('transport rejects a different project or database using synthetic connection text', () => {
  assert.throws(() => bindConnection('postgresql://postgres:local-fixture@db.cgiukdjwicykrmtkhudh.supabase.co/postgres'));
  assert.throws(() => bindConnection('postgresql://postgres:local-fixture@db.' + PROJECT + '.supabase.co/wrong_database'));
});

test('the exact atomic renderer carries every reviewed identity and postcondition in order', async () => {
  const rows = await loadBatch(root);
  const checks = stagedPredicates(rows);
  const sql = renderGuardedBatch(rows, {
    baselineSha256: '0'.repeat(64), campaignEpoch: '00000000-0000-4000-8000-000000000001',
    writerEpoch: '00000000-0000-4000-8000-000000000002', admissionEpoch: '00000000-0000-4000-8000-000000000003',
  });
  assert.equal(rows.length, 15);
  assert.deepEqual([...sql.matchAll(/^\\echo QUALIFICATION_MIGRATION_(\d{14})$/gm)].map(match => match[1]),
    rows.map(row => row.version));
  assert.equal((sql.match(/^begin isolation level serializable;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^commit;$/gm) ?? []).length, 1);
  assert(sql.endsWith('\ncommit;\n'));
  for (const row of rows) {
    const tag = '$suffix_' + row.version + '$';
    assert(sql.includes(row.body + '\n' + checks[row.version].sql + '\n'));
    assert.equal(sql.split(tag + row.source + tag).length, 2, 'Exact ledger statement drift');
  }
  assert.equal(sql.split('$suffix_20261007221252$]);\n').length, 2);
});
