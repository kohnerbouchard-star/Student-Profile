import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRehearsalFailure } from './sanitize-rehearsal-failure.mjs';
const filename='20261004202506_reconcile_loan_liability_purge_graph_v1.sql';
const plan={bundle:{migrations:[]},suffix:{migrations:[{filename,version:'20261004202506'}]}};
test('exports only stage, approved identity and SQLSTATE, never messages',()=>{
 const value=sanitizeRehearsalFailure({plan,filename,stderr:'psql:<stdin>:24: ERROR:  P0001\nDETAIL: student-sensitive-do-not-export\npostgresql://secret\n'});
 assert.deepEqual(value,{schemaVersion:1,errorClass:'MIGRATION_APPLICATION_FAILED',failureStage:'disposable-migration-apply',failedMigration:filename,failedVersion:'20261004202506',failureSqlstate:'P0001'});
 assert(!JSON.stringify(value).includes('secret'));
});
test('unknown identity and ambiguous/malformed state fail closed',()=>{
 assert.throws(()=>sanitizeRehearsalFailure({plan,filename:'../../secret',stderr:'ERROR: P0001'}));
 for(const stderr of ['ERROR: raw message','ERROR: P0001 extra detail','ERROR: P0001\nERROR: 42501','ERROR: ALICE','ERROR: Z1234','']) assert.equal(sanitizeRehearsalFailure({plan,filename,stderr}).failureSqlstate,null);
});
