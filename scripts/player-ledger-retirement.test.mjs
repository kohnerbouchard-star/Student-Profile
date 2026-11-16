import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
const read = p => readFileSync(p, 'utf8');
test('Retired uncalled Player ledger adapter stays absent; canonical Banking keeps dispatch and session coverage', () => {
  assert.equal(existsSync('backend/src/domains/economy/api/playerLedgerHistoryHttpHandler.ts'), false);
  for (const root of ['player-api', 'classroom-api']) {
    const source = read(`backend/supabase/functions/${root}/dispatchPlayerEconomyRoutes.ts`);
    assert.match(source, /handlePlayerBankingPublicRequest/);
    assert.doesNotMatch(source, /handlePlayerLedgerHistoryRequest/);
  }
  const entry = read('backend/src/domains/economy/api/playerBankingPublicHttpHandler.test.ts');
  assert.match(entry, /import "\.\/playerBankingSessionBoundary\.test\.ts"/);
  assert.match(entry, /import "\.\/ledgerHistoryReadRepository\.test\.ts"/);
});
