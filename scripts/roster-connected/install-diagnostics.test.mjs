import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { HOSTS, LIMITS, INCOMPLETE, DNS_QUERY_SCRIPT, serializeSummary, readBounded, proxyPresence, runBounded, parseOs, parseImage, parseMirrors, parseApt, parseResolver, inspectPlaywright, extractNativePackages, countPackages, classifyDnsError, parseProbe, collectDiagnostics, diagnosticsMain } from './install-diagnostics.mjs';

// All filesystem, subprocess and DNS observations are injected. These fixtures
// never invoke diagnostics against the test host or perform network queries.
const SECRET = 'secret_test_token_do_not_disclose';
const SHA = '0123456789abcdef0123456789abcdef01234567';
const UTC = '2026-11-11T12:00:00.000Z';
const ok = (stdout = '', code = 0, durationMs = 1) => ({ status: 'ok', stdout, code, durationMs });
const missing = { status: 'unavailable', stdout: '', code: null, durationMs: 0 };
const LOCK = JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/playwright': { version: '1.65.0', dependencies: { 'playwright-core': '1.65.0' } }, 'node_modules/playwright-core': { version: '1.65.0' } } });
const INSTALLED = JSON.stringify({ name: 'playwright', version: '1.65.0', dependencies: { 'playwright-core': '1.65.0' } });
const CORE = JSON.stringify({ name: 'playwright-core', version: '1.65.0' });
const PACKAGES = {
  tools: ['xvfb', 'fonts-noto-color-emoji', 'fonts-unifont', 'libfontconfig1', 'libfreetype6', 'xfonts-cyrillic', 'xfonts-scalable', 'fonts-liberation', 'fonts-ipafont-gothic', 'fonts-wqy-zenhei', 'fonts-tlwg-loma-otf', 'fonts-freefont-ttf'],
  chromium: ['libasound2t64', 'libatk-bridge2.0-0t64', 'libatk1.0-0t64', 'libatspi2.0-0t64', 'libcairo2', 'libcups2t64', 'libdbus-1-3', 'libdrm2', 'libgbm1', 'libglib2.0-0t64', 'libnspr4', 'libnss3', 'libpango-1.0-0', 'libx11-6', 'libxcb1', 'libxcomposite1', 'libxdamage1', 'libxext6', 'libxfixes3', 'libxkbcommon0', 'libxrandr2'],
};
const PACKAGE_NAMES = [...PACKAGES.tools, ...PACKAGES.chromium];
const BUNDLE = `// packages/playwright-core/src/server/registry/nativeDeps.ts\nvar deps;\nfunction neverExecute() { throw new Error('${SECRET}'); }\ndeps = { "ubuntu24.04-x64": { tools: ${JSON.stringify(PACKAGES.tools)}, chromium: ${JSON.stringify(PACKAGES.chromium)}, firefox: [] } };\n// packages/playwright-core/src/next.ts\n`;
const OS = { id: 'ubuntu', version: '24.04', architecture: 'x64' };
const MATCHED = inspectPlaywright(LOCK, INSTALLED, CORE);
const APT = "DIAG_RETRIES='1'\nDIAG_HTTP='15'\nDIAG_HTTPS='15'\n";
function fixture(overrides = {}) {
  const calls = [], reads = [];
  const read = async (path, cap) => {
    reads.push({ path, cap });
    if (path === '/etc/os-release') return `ID=ubuntu\nVERSION_ID="24.04"\nPRIVATE=${SECRET}\n`;
    if (path === '/etc/apt/apt-mirrors.txt') return 'http://azure.archive.ubuntu.com/ubuntu/\nhttps://archive.ubuntu.com/ubuntu\nhttps://security.ubuntu.com/ubuntu/\n';
    if (path === '/etc/resolv.conf') return `nameserver 127.0.0.53\nsearch ${SECRET}.example\noptions debug\n`;
    if (path.endsWith('/package-lock.json')) return LOCK;
    if (path.endsWith('/playwright/package.json')) return INSTALLED;
    if (path.endsWith('/playwright-core/package.json')) return CORE;
    if (path.endsWith('/playwright-core/lib/coreBundle.js')) return BUNDLE;
    assert.fail('Unexpected read path');
  };
  const run = async (file, args, options) => {
    calls.push({ file, args, options });
    if (file === '/usr/bin/git') return ok(`${SHA}\n`);
    if (file === '/usr/bin/apt-config') return ok(APT);
    if (file === '/usr/bin/dpkg-query') return ok(PACKAGE_NAMES.map(name => `${name}\tinstalled\n`).join(''));
    if (file === '/usr/bin/getent') return ok(`203.0.113.1 STREAM ${args[1]}\n203.0.113.1 DGRAM\n203.0.113.1 RAW\n`);
    if (file === process.execPath) return ok('{"status":"resolved","answerCount":2}');
    assert.fail('Unexpected command');
  };
  return { calls, reads, options: { read, run, now: () => 1, utcNow: () => UTC, imageOs: 'ubuntu24', imageVersion: '20261101.360.1', architecture: 'x64', hasEnvironmentKey: () => false, ...overrides } };
}

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.exitCode = null;
  child.kills = [];
  child.kill = signal => { child.kills.push(signal); return true; };
  child.close = (code = 0) => { child.exitCode = code; child.emit('close', code, null); };
  return child;
}

test('complete summary is strictly aggregate, actual-HEAD bound, and only four fixed hosts are queried', async () => {
  const f = fixture();
  const summary = await collectDiagnostics(f.options);
  assert.equal(summary.status, 'completed'); assert.equal(summary.installationQualified, false);
  assert.equal(summary.headSha, SHA); assert.equal(summary.utc, UTC); assert.deepEqual(summary.os, OS);
  assert.deepEqual(summary.playwright, MATCHED);
  assert.deepEqual(summary.packages, { status: 'observed', expectedCount: 33, installedCount: 33, missingCount: 0 });
  assert.deepEqual(summary.resolver, { status: 'observed', classification: 'loopback', count: 1 });
  const output = serializeSummary(summary);
  for (const sensitive of [SECRET, '127.0.0.53', '203.0.113.1', 'xvfb', 'libasound2t64', '/etc/', 'node_modules']) assert.ok(!output.includes(sensitive), sensitive);
  const nss = f.calls.filter(call => call.file === '/usr/bin/getent');
  assert.deepEqual(nss.map(call => call.args), HOSTS.map(host => ['ahosts', host]));
  const dns = f.calls.filter(call => call.file === process.execPath);
  assert.deepEqual(dns.map(call => call.args.slice(-2)), HOSTS.flatMap(host => [[host, '4'], [host, '6']]));
  assert.equal(f.calls.length, 15);
  assert.deepEqual(f.calls.find(call => call.file === '/usr/bin/git').args, ['rev-parse', '--verify', 'HEAD']);
  assert.deepEqual(f.calls.find(call => call.file === '/usr/bin/apt-config').args, ['shell', 'DIAG_RETRIES', 'Acquire::Retries', 'DIAG_HTTP', 'Acquire::http::Timeout', 'DIAG_HTTPS', 'Acquire::https::Timeout']);
  assert.deepEqual(f.calls.find(call => call.file === '/usr/bin/dpkg-query').args, ['--show', '--showformat=${Package}\t${db:Status-Status}\n', '--', ...PACKAGE_NAMES]);
  assert.equal(f.reads.length, 7); assert.ok(f.reads.every(({ cap }) => cap <= LIMITS.bundleBytes));
  assert.ok(f.calls.every(({ options }) => options.timeoutMs === LIMITS.commandMs));
});

test('serializer rejects unknown fields and secret strings even inside allowlisted fields', async () => {
  const summary = await collectDiagnostics(fixture().options);
  const mutations = [
    value => { value.secret = SECRET; }, value => { value.utc = `${UTC}${SECRET}`; },
    value => { value.headSha = `${SHA}\n${SECRET}`; }, value => { value.os.id = `ubuntu${SECRET}`; },
    value => { value.os.version = `24.04${SECRET}`; }, value => { value.image.version = `20261101.360.1${SECRET}`; },
    value => { value.ubuntuMirrorList.mirrors[0].scheme = `https${SECRET}`; },
    value => { value.proxyEnvironmentPresent.HTTP_PROXY = SECRET; }, value => { value.proxyEnvironmentPresent.UNKNOWN = false; },
    value => { value.apt.retries.value = 101; }, value => { value.apt.retries.status = 'unavailable'; },
    value => { Object.setPrototypeOf(value.os, { toJSON: () => SECRET }); }, value => { value.hosts.toJSON = () => SECRET; },
    value => { Object.defineProperty(value.image, 'version', { get: () => SECRET }); },
    value => { value.image.os = `ubuntu24 ${SECRET}`; }, value => { value.playwright.locked = `1.65.0-${SECRET}`; },
    value => { value.playwright.installed = SECRET; }, value => { value.apt.retries.value = SECRET; },
    value => { value.apt.status = SECRET; }, value => { value.resolver.classification = SECRET; },
    value => { value.resolver.address = SECRET; }, value => { value.ubuntuMirrorList.mirrors[0].host = `${SECRET}@archive.ubuntu.com`; },
    value => { value.packages.installedCount = SECRET; }, value => { value.packages.raw = SECRET; },
    value => { value.hosts[0].host = `${HOSTS[0]}.${SECRET}`; }, value => { value.hosts[0].nss.answerCount = SECRET; },
    value => { value.hosts[0].dnsA.status = SECRET; }, value => { value.hosts[0].dnsAAAA.addresses = [SECRET]; },
    value => { value.hosts.reverse(); }, value => { value.hosts.pop(); }, value => { value.durationMs = Infinity; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(summary); mutate(candidate);
    assert.throws(() => serializeSummary(candidate), { message: 'Invalid diagnostic summary' });
  }
  assert.equal(serializeSummary(INCOMPLETE), JSON.stringify(INCOMPLETE));
});

test('OS/image/version values require whole-field validation, never prefix redaction', () => {
  assert.deepEqual(parseOs('ID="ubuntu"\nVERSION_ID=24.04\n', 'x64'), OS);
  assert.deepEqual(parseOs(`ID=ubuntu${SECRET}\nVERSION_ID="24.04${SECRET}"\n`, SECRET), { id: null, version: null, architecture: null });
  assert.equal(parseOs('ID=ubuntu\nID=ubuntu\nVERSION_ID=24.04', 'arm64').id, null);
  assert.deepEqual(parseImage(`ubuntu24${SECRET}`, `20261101.360.1${SECRET}`), { os: null, version: null });
  for (const value of ['20261301.360.1', '20261100.360.1', '20261101.1;echo secret', '20261101.360.1\n', SECRET]) assert.equal(parseImage('ubuntu24', value).version, null);
  assert.equal(parseImage('ubuntu24', '20261101.360.0').version, '20261101.360.0');
  assert.equal(inspectPlaywright(LOCK, INSTALLED.replace('1.65.0', `1.65.0-${SECRET}`), CORE).installed, null);
});

test('mirror file preserves exact accepted order and rejects credentials/unknown/full invalid URLs', () => {
  const input = [
    '# safe comment', 'https://security.ubuntu.com/ubuntu/', 'http://azure.archive.ubuntu.com/ubuntu',
    'https://archive.ubuntu.com/ubuntu/', 'https://archive.ubuntu.com/ubuntu/',
    `https://${SECRET}@archive.ubuntu.com/ubuntu`, `https://archive.ubuntu.com/ubuntu?token=${SECRET}`,
    `https://archive.ubuntu.com/ubuntu#${SECRET}`, 'https://archive.ubuntu.com.evil.example/ubuntu/',
    'https://other.example/ubuntu/', 'http://packages.microsoft.com/ubuntu/', 'https://archive.ubuntu.com:443/ubuntu/',
    'https://archive.ubuntu.com/ubuntu/../secret', 'https://archive.ubuntu.com/ubuntu extra', 'https://%61rchive.ubuntu.com/ubuntu/',
  ].join('\n');
  const value = parseMirrors(input);
  assert.deepEqual(value.mirrors, [{ scheme: 'https', host: HOSTS[2] }, { scheme: 'http', host: HOSTS[0] }, { scheme: 'https', host: HOSTS[1] }, { scheme: 'https', host: HOSTS[1] }]); assert.equal(value.rejectedCount, 10); assert.equal(value.status, 'filtered');
  assert.ok(!JSON.stringify(value).includes(SECRET));
  assert.deepEqual(parseMirrors(null), { status: 'unavailable', mirrors: [], rejectedCount: 0 });
  assert.equal(parseMirrors('http://archive.ubuntu.com/ubuntu\n'.repeat(65)).mirrors.length, 64);
});

test('apt-config accepts only exact three shell assignments and bounded decimal numbers', () => {
  assert.deepEqual(parseApt(ok(APT)).retries, { status: 'observed', value: 1 });
  assert.equal(parseApt(ok("DIAG_RETRIES='0'\n")).retries.value, 0);
  assert.equal(parseApt(ok('')).httpTimeoutSeconds.status, 'unavailable');
  for (const value of ['-1', '1.5', '1e2', '001', '101', `1${SECRET}`, '1;echo unsafe']) {
    const parsed = parseApt(ok(`DIAG_RETRIES='${value}'\n`));
    assert.equal(parsed.status, 'invalid'); assert.equal(parsed.retries.value, null); assert.ok(!JSON.stringify(parsed).includes(SECRET));
  }
  assert.equal(parseApt(ok("DIAG_HTTP='3601'\n")).httpTimeoutSeconds.value, null);
  assert.equal(parseApt(ok("DIAG_HTTP='3600'\n")).httpTimeoutSeconds.value, 3600);
  for (const text of [`SECRET='${SECRET}'\n`, APT + "DIAG_RETRIES='2'\n", `${APT}echo '${SECRET}'\n`, "DIAG_RETRIES='1'; echo secret\n", "DIAG_RETRIES='1'\r\n"]) assert.equal(parseApt(ok(text)).status, 'invalid');
  assert.equal(parseApt(missing).status, 'unavailable'); assert.equal(parseApt(ok(SECRET, 1)).status, 'error');
});

test('resolver summary contains only classification/count and never resolver IP/search domains', () => {
  for (const [text, classification, count] of [
    ['', 'none', 0], ['nameserver 127.0.0.53\n', 'loopback', 1], ['nameserver ::1\n', 'loopback', 1],
    ['nameserver 192.0.2.1\n', 'non_loopback', 1], ['nameserver 127.0.0.1\nnameserver 192.0.2.1\n', 'mixed', 2],
  ]) {
    const value = parseResolver(`${text}search ${SECRET}\noptions debug\n`);
    assert.deepEqual(value, { status: 'observed', classification, count }); assert.ok(!JSON.stringify(value).includes(SECRET));
  }
  for (const text of [`nameserver 127.0.0.1 ${SECRET}`, `nameserver ${SECRET}`, 'nameserver http://127.0.0.1', 'nameserver 192.0.2.1\n'.repeat(17)]) assert.deepEqual(parseResolver(text), { status: 'invalid', classification: null, count: null });
  assert.equal(parseResolver(null).status, 'unavailable');
});

test('Playwright records installed/locked version disagreement and missing dependencies honestly', () => {
  assert.equal(MATCHED.status, 'matched');
  assert.equal(inspectPlaywright(LOCK, INSTALLED.replaceAll('1.65.0', '1.64.0'), CORE).status, 'mismatch');
  assert.equal(inspectPlaywright(LOCK.replace('"lockfileVersion":3', '"lockfileVersion":2'), INSTALLED, CORE).status, 'mismatch');
  assert.equal(inspectPlaywright(LOCK, INSTALLED, CORE.replace('1.65.0', '1.64.0')).status, 'mismatch');
  for (const texts of [[null, INSTALLED, CORE], [LOCK, null, CORE], [LOCK, INSTALLED, null], ['{invalid', INSTALLED, CORE]]) assert.equal(inspectPlaywright(...texts).status, 'unavailable');
  assert.equal(inspectPlaywright(LOCK, INSTALLED, CORE.replace('playwright-core', SECRET)).status, 'invalid');
});

test('nativeDeps extraction is bounded, source-scoped, hash-bound, and never evaluates source', () => {
  assert.deepEqual(extractNativePackages(BUNDLE, MATCHED, OS), PACKAGE_NAMES);
  for (const bundle of [null, '', BUNDLE.replace('xvfb', SECRET), BUNDLE.replace('tools: [', `tools: [(() => { throw '${SECRET}'; })(),`), BUNDLE.replace('nativeDeps.ts', 'untrusted.ts'), BUNDLE + BUNDLE, 'x'.repeat(LIMITS.bundleBytes + 1), BUNDLE.replace('\n// packages/playwright-core/src/next.ts', '')]) assert.equal(extractNativePackages(bundle, MATCHED, OS), null);
  for (const playwright of [{ ...MATCHED, status: 'mismatch' }, { ...MATCHED, locked: '1.66.0' }]) assert.equal(extractNativePackages(BUNDLE, playwright, OS), null);
  for (const os of [{ ...OS, version: '26.04' }, { ...OS, architecture: 'arm64' }, { ...OS, id: null }]) assert.equal(extractNativePackages(BUNDLE, MATCHED, os), null);
});

test('dpkg inventory emits counts only and rejects unknown packages/status/fields', () => {
  const value = countPackages(ok(`${PACKAGE_NAMES[0]}\tinstalled\n${PACKAGE_NAMES[1]}\tconfig-files\n`, 1), PACKAGE_NAMES);
  assert.deepEqual(value, { status: 'observed', expectedCount: 33, installedCount: 1, missingCount: 32 });
  assert.equal(countPackages(ok('', 1), PACKAGE_NAMES).missingCount, 33);
  assert.equal(countPackages(ok('', 0), PACKAGE_NAMES).status, 'invalid');
  for (const text of [`${SECRET}\tinstalled\n`, `${PACKAGE_NAMES[0]}\t${SECRET}\n`, `${PACKAGE_NAMES[0]}\tinstalled\t${SECRET}\n`, `${PACKAGE_NAMES[0]}\tinstalled\n`.repeat(2)]) assert.equal(countPackages(ok(text, 1), PACKAGE_NAMES).status, 'invalid');
  assert.equal(countPackages(missing, PACKAGE_NAMES).status, 'unavailable');
  assert.equal(countPackages(ok(SECRET, 2), PACKAGE_NAMES).status, 'error');
  assert.equal(countPackages(ok(), null).status, 'unsupported');
});

test('NSS and DNS result classification exposes statuses/counts/durations only', () => {
  const value = parseProbe(ok('203.0.113.1 STREAM archive.ubuntu.com\n203.0.113.1 DGRAM\n2001:db8::1 RAW\n', 0, 12), 'nss');
  assert.deepEqual(value, { status: 'resolved', answerCount: 2, durationMs: 12 });
  assert.equal(parseProbe(ok(SECRET, 2), 'nss').status, 'not_found');
  assert.equal(parseProbe(ok(SECRET, 3), 'nss').status, 'error');
  assert.equal(parseProbe(ok(`203.0.113.1 STREAM bad@${SECRET}`), 'nss').status, 'invalid');
  assert.equal(parseProbe(ok(''), 'nss').status, 'empty');
  for (const [code, status] of [['ENOTFOUND', 'not_found'], ['ENODATA', 'no_data'], ['ESERVFAIL', 'server_failure'], ['EAI_AGAIN', 'temporary_failure'], ['EREFUSED', 'refused'], ['ETIMEOUT', 'timed_out'], ['ENOTIMP', 'unsupported'], [SECRET, 'error'], ['__proto__', 'error'], ['constructor', 'error']]) assert.equal(classifyDnsError(code), status);
  for (const stdout of [SECRET, JSON.stringify({ status: 'resolved', answerCount: 1, raw: SECRET }), JSON.stringify({ status: SECRET, answerCount: 0 }), '{"status":"resolved","answerCount":null}', '{"status":"resolved","answerCount":0}', '{"status":"error","answerCount":1}']) assert.equal(parseProbe(ok(stdout), 'dns').status, 'invalid');
  assert.deepEqual(parseProbe(ok('{"status":"no_data","answerCount":0}', 0, 7), 'dns'), { status: 'no_data', answerCount: 0, durationMs: 7 });
  assert.equal(parseProbe({ ...missing, status: 'timed_out' }, 'dns').status, 'timed_out');
});

test('DNS child code uses mocked default resolver only and refuses any other host or family', () => {
  const exercise = (host, family, answer = ['203.0.113.1'], error = null) => {
    const queried = [], outputs = [];
    const dns = { resolve4: (host, callback) => { queried.push(['4', host]); callback(error, answer); }, resolve6: (host, callback) => { queried.push(['6', host]); callback(error, answer); } };
    vm.runInNewContext(DNS_QUERY_SCRIPT, { require: name => { if (name === 'node:dns') return dns; if (name === 'node:net') return { isIP: value => value === '203.0.113.1' ? 4 : value === '2001:db8::1' ? 6 : 0 }; assert.fail('Unexpected module'); }, process: { argv: ['node', host, family], stdout: { write: value => outputs.push(JSON.parse(value)) } } });
    return { queried, outputs };
  };
  for (const host of HOSTS) assert.deepEqual(exercise(host, '4').queried, [['4', host]]);
  for (const host of [SECRET, `${HOSTS[0]}.evil`, `https://${HOSTS[0]}`, '127.0.0.1']) {
    const value = exercise(host, '4'); assert.deepEqual(value.queried, []); assert.equal(value.outputs[0].status, 'invalid');
  }
  assert.deepEqual(exercise(HOSTS[0], 'TXT').queried, []);
  assert.equal(exercise(HOSTS[0], '6', ['2001:db8::1']).outputs[0].answerCount, 1);
  assert.equal(exercise(HOSTS[0], '4', [], { code: 'ENOTFOUND', message: SECRET }).outputs[0].status, 'not_found');
  assert.equal(exercise(HOSTS[0], '4', [SECRET]).outputs[0].status, 'invalid');
});

test('child runner strips environment, never uses shell/detach, and waits for successful close', async () => {
  const child = fakeChild(); let options, settled = false, cleared = false;
  const pending = runBounded('/usr/bin/getent', ['ahosts', HOSTS[0]], { spawnImpl: (_file, _args, supplied) => { options = supplied; return child; }, setTimer: () => 1, clearTimer: () => { cleared = true; }, now: () => 1 }).then(value => { settled = true; return value; });
  child.stdout.write('safe'); child.stderr.write(SECRET);
  await Promise.resolve(); assert.equal(settled, false);
  child.close(); const result = await pending;
  assert.equal(result.stdout, 'safe'); assert.equal(result.status, 'ok'); assert.equal(cleared, true);
  assert.deepEqual(options.env, { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' });
  assert.equal(options.shell, false); assert.equal(options.detached, false); assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe']);
});

test('deadline kills and awaits child cleanup rather than racing or returning a live child', async () => {
  const child = fakeChild(); let fire, settled = false, delay, cleared = false;
  const pending = runBounded('/usr/bin/getent', [], { timeoutMs: 40, spawnImpl: () => child, setTimer: (callback, ms) => { fire = callback; delay = ms; return 7; }, clearTimer: id => { assert.equal(id, 7); cleared = true; }, now: () => 1 }).then(value => { settled = true; return value; });
  child.stdout.write(SECRET); fire();
  assert.equal(delay, 40); assert.deepEqual(child.kills, ['SIGKILL']);
  await Promise.resolve(); assert.equal(settled, false); assert.equal(cleared, false);
  child.close(null); const result = await pending;
  assert.equal(result.status, 'timed_out'); assert.equal(result.stdout, ''); assert.equal(cleared, true);
});

test('bounded output kills and awaits child, counting stderr without storing it', async () => {
  for (const stream of ['stdout', 'stderr']) {
    const child = fakeChild(); let settled = false;
    const pending = runBounded('/usr/bin/getent', [], { spawnImpl: () => child, setTimer: () => 1, clearTimer: () => {}, now: () => 1 }).then(value => { settled = true; return value; });
    child[stream].write('x'.repeat(LIMITS.outputBytes + 1));
    assert.deepEqual(child.kills, ['SIGKILL']); await Promise.resolve(); assert.equal(settled, false);
    child.close(null); assert.equal((await pending).status, 'output_limit');
  }
});

test('missing utility and spawn errors produce fixed unavailable/error classifications', async () => {
  assert.equal((await runBounded('/missing', [], { spawnImpl: () => { throw new Error(SECRET); } })).status, 'error');
  for (const [code, status] of [['ENOENT', 'unavailable'], [SECRET, 'error']]) {
    const child = fakeChild();
    const pending = runBounded('/missing', [], { spawnImpl: () => child, setTimer: () => 1, clearTimer: () => {}, now: () => 1 });
    child.emit('error', { code, message: SECRET }); child.close(null);
    const value = await pending; assert.equal(value.status, status); assert.equal(value.stdout, ''); assert.ok(!JSON.stringify(value).includes(SECRET));
  }
  let spawned = false;
  assert.equal((await runBounded('/missing', [], { timeoutMs: 0, spawnImpl: () => { spawned = true; } })).status, 'budget_exhausted');
  assert.equal(spawned, false);
});

test('missing configs/dependencies/tools stay unavailable without installation or fallback', async () => {
  const calls = [];
  const value = await collectDiagnostics(fixture({ read: async () => null, run: async (file, args) => { calls.push([file, args]); return missing; } }).options);
  assert.equal(value.playwright.status, 'unavailable'); assert.equal(value.apt.status, 'unavailable');
  assert.equal(value.resolver.status, 'unavailable'); assert.equal(value.ubuntuMirrorList.status, 'unavailable');
  assert.equal(value.packages.status, 'unavailable'); assert.equal(value.headSha, null);
  assert.ok(value.hosts.every(host => host.nss.status === 'unavailable' && host.dnsA.status === 'unavailable' && host.dnsAAAA.status === 'unavailable'));
  assert.ok(!calls.some(([file]) => file === '/usr/bin/dpkg-query')); serializeSummary(value);
});

test('overall budget stops later reads/commands with bounded incomplete observations', async () => {
  let time = 0, calls = 0, reads = 0;
  const value = await collectDiagnostics(fixture({ now: () => time, run: async () => { calls++; time = LIMITS.overallMs; return { ...missing, status: 'timed_out' }; }, read: async () => { reads++; return null; } }).options);
  assert.equal(calls, 1); assert.equal(reads, 0); assert.equal(value.status, 'incomplete');
  assert.equal(value.durationMs, LIMITS.overallMs);
  assert.ok(value.hosts.every(host => host.nss.status === 'budget_exhausted' && host.dnsA.status === 'budget_exhausted' && host.dnsAAAA.status === 'budget_exhausted'));
  serializeSummary(value);
});

test('main emits one sanitized JSON line, failure never exposes stack/raw values or qualifies installation', async () => {
  const outputs = [];
  assert.equal(await diagnosticsMain({ collect: async () => { throw new Error(SECRET); }, write: value => outputs.push(value) }), 1);
  assert.deepEqual(outputs, [`${JSON.stringify(INCOMPLETE)}\n`]);
  const summary = await collectDiagnostics(fixture().options);
  for (const value of [summary, { ...summary, extra: SECRET }]) {
    const lines = []; const exit = await diagnosticsMain({ collect: async () => value, write: value => lines.push(value) });
    assert.equal(lines.length, 1); assert.equal(lines[0].split('\n').length, 2); assert.ok(!lines[0].includes(SECRET));
    assert.equal(JSON.parse(lines[0]).installationQualified, false); assert.equal(exit, value === summary ? 0 : 1);
  }
});

test('source has no network/config overrides, dynamic package execution, installation or raw output paths', async () => {
  const source = await readFile(new URL('./install-diagnostics.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /setServers\s*\(|resolvectl|apt-get|npm\s+(?:ci|install)|npx|writeFile|appendFile|createWriteStream|console\.(?:log|warn|error)|process\.env\[|Object\.(?:entries|keys|values)\(process\.env|JSON\.stringify\(process\.env|eval\s*\(|import\([^)]*playwright|require\([^)]*playwright/);
  assert.deepEqual([...source.matchAll(/process\.env\.(\w+)/g)].map(match => match[1]), ['ImageOS', 'ImageVersion']);
  assert.doesNotMatch(source, /apt-config[^\n]*dump|Promise\.race\s*\(/);
});


test('proxy presence reads only fixed names as boolean existence checks, never values', async () => {
  const names = [];
  const proxy = proxyPresence(name => { names.push(name); return ['HTTP_PROXY', 'https_proxy'].includes(name); });
  assert.deepEqual(names, ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy']);
  assert.deepEqual(proxy, { HTTP_PROXY: true, http_proxy: false, HTTPS_PROXY: false, https_proxy: true, ALL_PROXY: false, all_proxy: false, NO_PROXY: false, no_proxy: false });
  const value = await collectDiagnostics(fixture({ hasEnvironmentKey: name => name === 'HTTP_PROXY' }).options);
  assert.equal(value.proxyEnvironmentPresent.HTTP_PROXY, true); serializeSummary(value);
});

test('bounded reader rejects missing/oversize/nonregular files and always closes opened handles', async () => {
  assert.equal(await readBounded('/fixture', 4, { openFile: async () => { throw new Error(SECRET); } }), null);
  for (const [regular, size, bytes, expected] of [[true, 4, 'safe', 'safe'], [true, 5, 'extra', null], [false, 0, '', null], [true, 4, 'extra', null], [true, 4, 'cut', null]]) {
    let closed = false, read = false;
    const value = await readBounded('/fixture', 4, { openFile: async () => ({ stat: async () => ({ size, isFile: () => regular }), read: async buffer => { read = true; buffer.write(bytes); return { bytesRead: bytes.length }; }, close: async () => { closed = true; } }) });
    assert.equal(value, expected); assert.equal(closed, true);
    if (!regular || size > 4) assert.equal(read, false);
  }
});

test('late filesystem completion reports actual elapsed time and starts no further operations', async () => {
  let time = 0, reads = 0, commands = 0;
  const value = await collectDiagnostics(fixture({ now: () => time, run: async () => { commands++; return ok(`${SHA}\n`); }, read: async () => { reads++; time = LIMITS.overallMs + 500; return null; } }).options);
  assert.equal(commands, 1); assert.equal(reads, 1); assert.equal(value.status, 'incomplete');
  assert.equal(value.observationBudgetMs, LIMITS.overallMs); assert.equal(value.durationMs, LIMITS.overallMs + 500);
  serializeSummary(value);
});

test('a thrown child kill error is sanitized and still awaits close', async () => {
  const child = fakeChild(); let fire, settled = false;
  child.kill = () => { throw new Error(SECRET); };
  const pending = runBounded('/usr/bin/getent', [], { spawnImpl: () => child, setTimer: callback => { fire = callback; return 1; }, clearTimer: () => {}, now: () => 1 }).then(value => { settled = true; return value; });
  fire(); await Promise.resolve(); assert.equal(settled, false);
  child.close(null); const value = await pending; assert.equal(value.status, 'error'); assert.equal(value.stdout, '');
});

test('output-write failure never retries a partial write or exposes its exception', async () => {
  let writes = 0;
  assert.equal(await diagnosticsMain({ collect: async () => INCOMPLETE, write: () => { writes++; throw new Error(SECRET); } }), 1);
  assert.equal(writes, 1);
});


test('summary output waits for callback and retains exactly one listener for late errors', async () => {
  const summary = await collectDiagnostics(fixture().options);
  const output = new EventEmitter(); let callback, writes = 0, settled = false;
  output.write = (value, done) => { writes++; callback = done; assert.equal(output.listenerCount('error'), 1); assert.equal(value, `${serializeSummary(summary)}\n`); return true; };
  const pending = diagnosticsMain({ collect: async () => summary, output }).then(value => { settled = true; return value; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(settled, false); callback(); assert.equal(await pending, 0);
  assert.equal(output.listenerCount('error'), 1);
  assert.doesNotThrow(() => output.emit('error', new Error(SECRET)));
  assert.equal(await diagnosticsMain({ collect: async () => summary, output }), 1);
  assert.equal(writes, 1); assert.equal(output.listenerCount('error'), 1);
});

test('summary output handles early errors, callback errors, and synchronous throws without retry', async () => {
  const summary = await collectDiagnostics(fixture().options);
  for (const mode of ['before_callback', 'callback_error', 'synchronous_throw']) {
    const output = new EventEmitter(); let writes = 0, callback;
    output.write = (_value, done) => {
      writes++; callback = done; assert.equal(output.listenerCount('error'), 1);
      if (mode === 'synchronous_throw') throw new Error(SECRET);
      queueMicrotask(() => { if (mode === 'before_callback') output.emit('error', new Error(SECRET)); else done(new Error(SECRET)); });
      return false;
    };
    assert.equal(await diagnosticsMain({ collect: async () => summary, output }), 1);
    assert.doesNotThrow(() => { callback?.(); output.emit('error', new Error(SECRET)); });
    assert.equal(await diagnosticsMain({ collect: async () => summary, output }), 1);
    assert.equal(writes, 1); assert.equal(output.listenerCount('error'), 1);
  }
});

test('child stdout/stderr stream errors discard output, kill once, and await close', async () => {
  for (const stream of ['stdout', 'stderr']) {
    const child = fakeChild(); let settled = false, cleared = false;
    const pending = runBounded('/usr/bin/getent', [], { spawnImpl: () => child, setTimer: () => 1, clearTimer: () => { cleared = true; }, now: () => 1 }).then(value => { settled = true; return value; });
    child.stdout.write(SECRET); child.stderr.write(SECRET);
    assert.equal(child.stdout.listenerCount('error'), 1); assert.equal(child.stderr.listenerCount('error'), 1);
    child[stream].emit('error', new Error(SECRET));
    child.stdout.emit('error', new Error(SECRET)); child.stderr.emit('error', new Error(SECRET));
    assert.deepEqual(child.kills, ['SIGKILL']); await Promise.resolve(); assert.equal(settled, false); assert.equal(cleared, false);
    child.close(null); const value = await pending;
    assert.equal(value.status, 'error'); assert.equal(value.stdout, ''); assert.equal(cleared, true);
    assert.doesNotThrow(() => { child.stdout.emit('error', new Error(SECRET)); child.stderr.emit('error', new Error(SECRET)); });
    assert.deepEqual(child.kills, ['SIGKILL']); assert.ok(!JSON.stringify(value).includes(SECRET));
  }
});

test('late child stream errors remain handled after successful close without killing a closed child', async () => {
  const child = fakeChild();
  const pending = runBounded('/usr/bin/getent', [], { spawnImpl: () => child, setTimer: () => 1, clearTimer: () => {}, now: () => 1 });
  child.close(); assert.equal((await pending).status, 'ok');
  assert.doesNotThrow(() => { child.stdout.emit('error', new Error(SECRET)); child.stderr.emit('error', new Error(SECRET)); });
  assert.deepEqual(child.kills, []);
});

test('hermetic default stdout errors before/after callbacks never emit raw stacks and remain nonzero', async () => {
  const summary = await collectDiagnostics(fixture().options);
  const moduleUrl = new URL('./install-diagnostics.mjs', import.meta.url).href;
  for (const mode of ['event_without_callback', 'before_callback', 'after_callback', 'callback_error_then_event', 'synchronous_throw']) {
    const program = `
      import { diagnosticsMain } from ${JSON.stringify(moduleUrl)};
      const originalWrite = process.stdout.write.bind(process.stdout);
      let writes = 0;
      process.stdout.write = (_value, callback) => {
        writes++;
        if (${JSON.stringify(mode)} === 'synchronous_throw') throw new Error(${JSON.stringify(SECRET)});
        if (${JSON.stringify(mode)} === 'event_without_callback') {
          queueMicrotask(() => process.stdout.emit('error', new Error(${JSON.stringify(SECRET)})));
        } else if (${JSON.stringify(mode)} === 'before_callback') {
          setImmediate(() => { process.stdout.emit('error', new Error(${JSON.stringify(SECRET)})); setImmediate(callback); });
        } else if (${JSON.stringify(mode)} === 'callback_error_then_event') {
          setImmediate(() => { callback(new Error(${JSON.stringify(SECRET)})); setImmediate(() => process.stdout.emit('error', new Error(${JSON.stringify(SECRET)}))); });
        } else {
          setImmediate(() => { callback(); setImmediate(() => process.stdout.emit('error', new Error(${JSON.stringify(SECRET)}))); });
        }
        return true;
      };
      const outcome = await diagnosticsMain({ collect: async () => (${JSON.stringify(summary)}) });
      if (outcome !== 0) process.exitCode = outcome;
      await new Promise(resolve => setImmediate(() => setImmediate(resolve)));
      process.stdout.emit('error', new Error(${JSON.stringify(SECRET)}));
      originalWrite(JSON.stringify({ writes, outcome, exitCode: process.exitCode, listeners: process.stdout.listenerCount('error') }) + '\\n');
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' }, timeout: 2000, maxBuffer: LIMITS.outputBytes, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(result.error, undefined); assert.equal(result.status, 1); assert.equal(result.stderr, '');
    assert.ok(!result.stdout.includes(SECRET));
    const report = JSON.parse(result.stdout); assert.equal(report.writes, 1); assert.equal(report.exitCode, 1); assert.equal(report.listeners, 1);
    assert.equal(report.outcome, mode === 'after_callback' ? 0 : 1);
  }
});
