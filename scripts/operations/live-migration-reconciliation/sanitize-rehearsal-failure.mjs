import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicSqlstates = new Set(['P0001','23502','23503','23505','23514','42501','42P01','42703','42883','42804','42601','0A000','57014','55P03','40P01','40001','08006','08003','53300','53400','54000','53200','55000','XX000']);

export function sanitizeRehearsalFailure({ plan, filename, stderr }) {
  const identities = [...plan.bundle.migrations, ...plan.suffix.migrations];
  const identity = identities.find(row => row.filename === filename);
  assert(identity && /^\d{14}_[a-z0-9_]+\.sql$/.test(identity.filename), 'Unapproved diagnostic identity');
  // psql VERBOSITY=sqlstate emits no message/detail/context for server errors.
  // Even if a tool returns arbitrary text, copy only an exact SQLSTATE token.
  const states = [...stderr.matchAll(/^.*?ERROR:\s+([0-9A-Z]{5})\s*$/gm)].map(match => match[1]);
  return {
    schemaVersion: 1,
    errorClass: 'MIGRATION_APPLICATION_FAILED',
    failureStage: 'disposable-migration-apply',
    failedMigration: identity.filename,
    failedVersion: identity.version,
    failureSqlstate: states.length === 1 && publicSqlstates.has(states[0]) ? states[0] : null,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [planPath, filename, privateErrorPath, destination] = process.argv.slice(2);
  const result = sanitizeRehearsalFailure({ plan: JSON.parse(await readFile(planPath,'utf8')), filename, stderr: await readFile(privateErrorPath,'utf8') });
  await writeFile(destination, JSON.stringify(result) + '\n', { mode: 0o600 });
}
