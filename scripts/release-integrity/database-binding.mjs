export function validateDatabaseUrlProjectRef({ databaseUrl, expectedProjectRef }) {
  if (!/^[a-z0-9]{20}$/.test(String(expectedProjectRef ?? ''))) {
    throw new Error('Expected Supabase project reference must be 20 lowercase alphanumeric characters.');
  }

  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Database URL must use PostgreSQL.');
  }

  const username = decodeURIComponent(parsed.username || '');
  const hostname = parsed.hostname.toLowerCase();
  const direct = hostname === `db.${expectedProjectRef}.supabase.co`;
  const supabasePoolerHost = hostname.endsWith('.pooler.supabase.com');
  const poolerIdentity = username === `postgres.${expectedProjectRef}`
    || username.endsWith(`.${expectedProjectRef}`);
  const pooler = supabasePoolerHost && poolerIdentity;

  if (!direct && !pooler) {
    throw new Error('Database URL is not bound to the expected Supabase project and host.');
  }
  if (!decodeURIComponent(parsed.password || '')) {
    throw new Error('Database URL must contain a password.');
  }

  return {
    schemaVersion: 'econovaria.release-integrity.database-binding.v1',
    status: 'PASS',
    expectedProjectRef,
    connectionType: direct ? 'direct' : 'pooler',
  };
}
