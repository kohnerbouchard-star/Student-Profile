// Test-only owner of a fresh, loopback-only cluster. No database URL accepted.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import net from 'node:net';
import { createHash } from 'node:crypto';

export async function withSyntheticPostgres(fn) {
  const bin = process.env.STAGING_SUFFIX_SYNTHETIC_PG_BIN;
  assert(bin, 'Explicit verified native PG17 binary path required');
  const directory = mkdtempSync(`${tmpdir()}/suffix-repository-only-`);
  const listener = net.createServer();
  await new Promise((res, rej) => { listener.once('error', rej); listener.listen(0, '127.0.0.1', res); });
  const port = listener.address().port;
  await new Promise(res => listener.close(res));
  assert(port >= 20000);
  const env = { PATH: `${bin}:/usr/bin:/bin`, LC_ALL: 'C', ...(process.env.LD_LIBRARY_PATH ? { LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH } : {}) };
  const run = (program, args, input, fail = false, expectedError) => {
    const out = spawnSync(`${bin}/${program}`, args, { env, input, encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
    assert(!out.error && !out.signal, `${program} unavailable or exceeded local bound`);
    if (fail) assert.notEqual(out.status, 0, 'negative unexpectedly succeeded');
    else assert.equal(out.status, 0, `${program}: ${out.stderr?.slice(-2000)}`);
    if (expectedError) assert(out.stderr.includes(expectedError), `unexpected negative: ${out.stderr?.slice(-1000)}`);
    return out.stdout;
  };
  const args = db => ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', db];
  const sql = (db, source, fail = false, expected) => run('psql', ['-XqAt', '-v', 'ON_ERROR_STOP=1', ...args(db)], source, fail, expected);
  const snapshot = db => {
    const nonce = value => value.replace(/^\\(?:un)?restrict .*\n/gm, '');
    // Keep schema/function/ACL bytes entirely separate from COPY normalization.
    const schema = nonce(run('pg_dump', [...args(db), '--format=plain', '--schema-only']));
    const data = nonce(run('pg_dump', [...args(db), '--format=plain', '--data-only']))
      .replace(/^(COPY [^\n]+ FROM stdin;\n)([\s\S]*?)(^\\\.\n)/gm,
        (_, head, rows, end) => head + (rows ? rows.split('\n').slice(0,-1).sort().join('\n') + '\n' : '') + end);
    // Compare complete logical schema/data; report hashes, never SQL/row dumps.
    return createHash('sha256').update(schema).update('\0').update(data).digest('hex');
  };
  let started = false;
  try {
    assert.match(run('postgres', ['--version']), /PostgreSQL\) 17\./);
    run('initdb', ['-D', `${directory}/data`, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust', '--no-sync', '--locale=C', '--encoding=UTF8']);
    run('pg_ctl', ['-D', `${directory}/data`, '-l', `${directory}/server.log`, '-o', `-h 127.0.0.1 -p ${port} -c unix_socket_directories='' -c cluster_name=econovaria_suffix_synthetic_only -c shared_buffers=32MB -c max_connections=20 -c fsync=off`, '-w', 'start']);
    started = true;
    assert.equal(sql('postgres', "select current_setting('cluster_name');").trim(), 'econovaria_suffix_synthetic_only');
    assert.equal(sql('postgres', "show server_encoding;").trim(), 'UTF8');
    sql('postgres', 'create role anon; create role authenticated; create role service_role; create role supabase_auth_admin; create role supabase_admin; create role authenticator;');
    return await fn({ sql, snapshot, dump:(db,extra=[])=>run('pg_dump',[...args(db),'--format=plain',...extra]) });
  } finally {
    if (started) run('pg_ctl', ['-D', `${directory}/data`, '-m', 'immediate', '-w', 'stop']);
    rmSync(directory, { recursive: true, force: true });
  }
}
