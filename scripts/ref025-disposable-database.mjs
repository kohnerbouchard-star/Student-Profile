import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const digest = value => createHash('sha256').update(value).digest('hex');
export const bankingJob = env => env.GITHUB_ACTIONS === 'true' && env.GITHUB_WORKFLOW === 'banking-fx-clearing-v1' && env.GITHUB_JOB === 'database-acceptance';
export function requireIdentity(actual, expected) { assert.equal(digest(JSON.stringify(actual)), digest(JSON.stringify(expected)), 'REF025_IDENTITY_MISMATCH'); }
export async function isolate(io, visit, timeoutMs = 15000) {
  const before = await io.source();
  const name = `ref025_${randomUUID().replaceAll('-', '')}`;
  const marker = randomUUID();
  let receipt, failure, result, timer, marked = false, closed = false, interrupt, interruptedEarly = false;
  const interrupted = new Promise((_, reject) => { interrupt = () => { interruptedEarly = true; reject(new Error('REF025_INTERRUPTED')); }; });
  interrupted.catch(() => {}); // Keep an early interruption handled until the callback race observes it.
  process.once('SIGTERM', interrupt); process.once('SIGINT', interrupt);
  const active = () => assert(!interruptedEarly, 'REF025_INTERRUPTED');
  try {
    assert.equal(await io.sourceSessions(), 0, 'REF025_SOURCE_BUSY');
    assert.equal(await io.exists(name), false, 'REF025_CHILD_EXISTS');
    active();
    receipt = await io.create(name); // Only a positively acknowledged creation may be cleaned up.
    active();
    await io.record(receipt, marker);
    active();
    await io.mark(receipt, marker); marked = true;
    await io.verify(receipt, marker);
    active();
    await io.configure(receipt);
    requireIdentity(await io.parity(receipt), before.parity);
    active();
    result = await Promise.race([visit({ query: sql => { assert(!closed, 'REF025_SESSION_CLOSED'); return io.query(receipt, marker, sql); } }), interrupted,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('REF025_CALLBACK_TIMEOUT')), timeoutMs); })]);
  } catch (error) { failure = error; }
  finally {
    closed = true; clearTimeout(timer); process.removeListener('SIGTERM', interrupt); process.removeListener('SIGINT', interrupt);
    if (receipt) {
      try {
        await io.verify(receipt, marked ? marker : receipt.marker);
        assert.equal(await io.sessions(receipt), 0, 'REF025_CHILD_BUSY');
        await io.drop(receipt);
        assert.equal(await io.exists(name), false, 'REF025_CHILD_REMAINS');
        await io.cleaned();
      } catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'REF025_CLEANUP_FAILED'); }
    }
    try { requireIdentity(await io.source(), before); }
    catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'REF025_SOURCE_POSTCHECK_FAILED'); }
  }
  if (failure) throw failure;
  return result;
}

export function localAdapter() {
  const env = process.env;
  assert(bankingJob(env), 'REF025_JOB_REQUIRED');
  assert(!env.DOCKER_HOST && !env.DOCKER_CONTEXT && !env.DOCKER_TLS_VERIFY, 'REF025_DOCKER_OVERRIDE');
  assert.equal(realpathSync('.'), realpathSync(env.GITHUB_WORKSPACE), 'REF025_WORKSPACE');
  const execute = (cmd, args, input) => {
    try { return execFileSync(cmd, args, { input, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 }); }
    catch (error) { throw new Error(`REF025_PROCESS_FAILED:${cmd}:${String(error.stderr || '').match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1] || 'UNKNOWN'}`); } // Never expose SQL, credentials or raw process output.
  };
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH));
  assert.equal(execute('git', ['rev-parse', 'HEAD']).trim(), event.pull_request?.head.sha || env.GITHUB_SHA, 'REF025_SOURCE_SHA');
  const config = readFileSync('backend/supabase/config.toml', 'utf8');
  const project = config.match(/^project_id = "([a-zA-Z0-9_-]+)"$/m)?.[1];
  assert(project, 'REF025_PROJECT');
  const context = JSON.parse(execute('docker', ['context', 'inspect']))[0];
  assert.equal(context.Endpoints.docker.Host, 'unix:///var/run/docker.sock', 'REF025_REMOTE_DOCKER');
  const container = JSON.parse(execute('docker', ['inspect', `supabase_db_${project}`]))[0];
  assert(container.State.Running && /^[a-f0-9]{64}$/.test(container.Id), 'REF025_CONTAINER');
  assert.equal(container.Config.Labels['com.supabase.cli.project'], project, 'REF025_PROJECT_LABEL');
  assert.match(container.Config.Image, /^(?:public\.ecr\.aws|ghcr\.io)\/supabase\/postgres:17\.6\.1\.143$/, 'REF025_IMAGE');
  assert.match(container.Image, /^sha256:[a-f0-9]{64}$/, 'REF025_IMAGE_DIGEST');
  assert(Date.parse(container.Created) >= statSync('.git').mtimeMs, 'REF025_PREEXISTING_CONTAINER');
  const binding = { id: container.Id, image: container.Image, created: container.Created };
  const containerCheck = () => {
    const c = JSON.parse(execute('docker', ['inspect', binding.id]))[0];
    assert(c.State.Running, 'REF025_CONTAINER_STOPPED');
    requireIdentity({ id: c.Id, image: c.Image, created: c.Created }, binding);
  };
  const sql = (database, statement) => {
    containerCheck();
    return execute('docker', ['exec', '-i', binding.id, 'psql', '-U', 'supabase_admin', '-d', database, '-XqAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'],
      `set statement_timeout='15s'; set lock_timeout='5s';\n${statement}`).trim();
  };
  const json = (db, query) => JSON.parse(sql(db, query));
  const identity = db => json(db, `select json_build_object('system',(pg_control_system()).system_identifier::text,'oid',oid,'name',datname,'marker',shobj_description(oid,'pg_database')) from pg_database where datname=current_database();`);
  const sourceIdentity = identity('postgres');
  assert.equal(sourceIdentity.name, 'postgres', 'REF025_SOURCE_DATABASE');
  assert.equal(sql('postgres', 'show server_version_num;').slice(0, 2), '17', 'REF025_SERVER_VERSION');
  const files = readdirSync('backend/supabase/migrations').filter(f => /^\d{14}_.+\.sql$/.test(f)).sort();
  const versions = files.map(f => f.slice(0, 14));
  assert.equal(digest(readFileSync('backend/supabase/migrations/20261005004013_add_gated_business_loan_submission_v1.sql')), 'e9ab53f6d86cfe0712c5366ee8f174b7331a23ddcb210056d0bd4bd3f6b77ab2', 'REF025_MIGRATION_BYTES');
  const migrationDigest = digest(files.map(f => `${f}:${digest(readFileSync(`backend/supabase/migrations/${f}`))}`).join('\n'));
  const properties = db => json(db, `select json_build_object('owner',pg_get_userbyid(d.datdba),
    'acl',(select json_agg(x order by x::text) from (select grantor,grantee,privilege_type,is_grantable from aclexplode(coalesce(d.datacl,acldefault('d',d.datdba)))) x),
    'settings',(select coalesce(json_agg(x order by x::text),'[]') from (select setrole,setconfig from pg_db_role_setting where setdatabase=d.oid) x))
    from pg_database d where datname=current_database();`);
  const gates = db => json(db, `select json_agg(x order by x.name) from (select conname name,convalidated valid,pg_get_constraintdef(oid) definition,conrelid::regclass::text relation
    from pg_constraint where conname in ('loan_applications_business_liability_disabled_v1','player_loans_business_liability_disabled_v1')) x;`);
  const schema = db => {
    containerCheck();
    return digest(execute('docker', ['exec', binding.id, 'pg_dump', '-U', 'supabase_admin', '-d', db, '--schema-only'])
      .split('\n').filter(l => !/^\\(?:un)?restrict /.test(l)).join('\n'));
  };
  const parity = db => ({ schema: schema(db), properties: properties(db), gates: gates(db) });
  const source = () => {
    requireIdentity(identity('postgres'), sourceIdentity);
    requireIdentity(json('postgres', 'select json_agg(version order by version) from supabase_migrations.schema_migrations;'), versions);
    const p = parity('postgres');
    assert.equal(p.gates?.length, 2, 'REF025_GATES');
    for (const g of p.gates) assert(g.valid && g.definition === "CHECK ((liability_kind = 'legacy_v1'::text))" && g.name === `${g.relation}_business_liability_disabled_v1`, 'REF025_GATE_SHAPE');
    return { identity: sourceIdentity, migrationDigest, parity: p };
  };
  const exists = name => sql('postgres', `select exists(select 1 from pg_database where datname=${literal(name)});`) === 't';
  const sessionCount = db => Number(sql('postgres', `select count(*) from pg_stat_activity where datname=${literal(db)} and pid<>pg_backend_pid();`));
  const verify = (receipt, marker) => requireIdentity(identity(receipt.name), { ...receipt, marker });
  const configure = receipt => sql('postgres', `do $copy$ declare a record; s record; value text; target text:=${literal(receipt.name)}; begin
    execute format('revoke all on database %I from public, %I',target,(select pg_get_userbyid(datdba) from pg_database where datname=target));
    for a in select p.*,pg_get_userbyid(p.grantor) grantor_name,case when p.grantee=0 then 'public' else quote_ident(pg_get_userbyid(p.grantee)) end grantee_name
      from pg_database d cross join lateral aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) p where d.datname='postgres' loop
      execute format('set local role %I',a.grantor_name);
      execute format('grant %s on database %I to %s%s',a.privilege_type,target,a.grantee_name,case when a.is_grantable then ' with grant option' else '' end);
      reset role;
    end loop;
    for s in select setrole,setconfig from pg_db_role_setting where setdatabase=(select oid from pg_database where datname='postgres') loop
      foreach value in array s.setconfig loop
        if s.setrole=0 then execute format('alter database %I set %I to %L',target,split_part(value,'=',1),substring(value from position('=' in value)+1));
        else execute format('alter role %I in database %I set %I to %L',pg_get_userbyid(s.setrole),target,split_part(value,'=',1),substring(value from position('=' in value)+1)); end if;
      end loop;
    end loop;
  end $copy$;`);
  let journal;
  return {
    record(receipt, marker) {
      writeFileSync(journal, JSON.stringify({ binding, sourceIdentity, migrationDigest, receipt, marker }), { mode: 0o600 });
    },
    cleaned: () => writeFileSync(journal, JSON.stringify({ cleaned: true }), { mode: 0o600 }),
    source, sourceSessions: () => sessionCount('postgres'), exists,
    create(name) {
      journal = join(mkdtempSync(join(tmpdir(), 'ref025-owned-')), 'ownership.json');
      writeFileSync(journal, JSON.stringify({ binding, sourceIdentity, migrationDigest, name, creation: 'unacknowledged' }), { mode: 0o600 });
      const owner = properties('postgres').owner;
      try {
      sql('postgres', `create database "${name}" template postgres owner "${owner.replaceAll('"','""')}";`);
      writeFileSync(journal, JSON.stringify({ binding, sourceIdentity, name, creation: 'acknowledged' }), { mode: 0o600 });
      const receipt = identity(name);
      assert.equal(receipt.name, name, 'REF025_CHILD_DATABASE');
      assert.equal(receipt.system, sourceIdentity.system, 'REF025_CHILD_SERVER');
      assert.notEqual(receipt.oid, sourceIdentity.oid, 'REF025_CHILD_OID');
      return receipt;
      } catch (error) { throw new AggregateError([error], 'REF025_CREATION_UNRESOLVED: ownership journal retained; no unknown resource cleanup'); }
    },
    mark: (r, m) => sql('postgres', `comment on database "${r.name}" is ${literal(m)};`),
    verify, configure, parity: r => parity(r.name), sessions: r => sessionCount(r.name),
    query(r, m, statement) {
      verify(r, m);
      return sql(r.name, `do $bound$ begin if current_database()<>${literal(r.name)} or (select oid from pg_database where datname=current_database())<>${r.oid}
        or shobj_description(${r.oid},'pg_database')<>${literal(m)} then raise exception 'REF025_SESSION_IDENTITY'; end if; end $bound$;\n${statement}`);
    },
    drop: r => sql('postgres', `drop database "${r.name}";`)
  };
}
