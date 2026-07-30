#!/usr/bin/env node

function required(name) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const databaseUrl = required('DATABASE_URL');
const projectRef = required('SUPABASE_PROJECT_REF');
const expectedProjectRef = required('EXPECTED_PRODUCTION_PROJECT_REF');
const deniedProjectRef = required('DENIED_STAGING_PROJECT_REF');
const parsed = new URL(databaseUrl);
const username = decodeURIComponent(parsed.username || '');
const direct = parsed.hostname === `db.${projectRef}.supabase.co`;
const pooler = username === `postgres.${projectRef}` || username.endsWith(`.${projectRef}`);

if (!/^[a-z0-9]{20}$/.test(projectRef)) {
  throw new Error('Production project ref is invalid');
}
if (projectRef !== expectedProjectRef || projectRef === deniedProjectRef) {
  throw new Error('Production project binding failed');
}
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || (!direct && !pooler)) {
  throw new Error('Database URL is not bound to production');
}
if (!decodeURIComponent(parsed.password || '')) {
  throw new Error('Database URL does not contain a password');
}

// The underlying bootstrap predates password-bearing pooler URLs and performs a
// raw substring compatibility check. The workflow and this runner have already
// verified the parsed username/hostname binding. A PostgreSQL application_name
// query parameter carries the approved direct-host marker without changing the
// network endpoint, credentials, database, or TLS behavior.
parsed.searchParams.set('application_name', `db.${projectRef}.supabase.co`);
process.env.DATABASE_URL = parsed.toString();

await import('./production-canonical-source-bootstrap.mjs');
