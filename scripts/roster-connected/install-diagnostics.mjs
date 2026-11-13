// Failure-only observations, never installation or qualification. No data files
// are written. All command output remains private until this module's final schema.
import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

export const HOSTS = Object.freeze(['azure.archive.ubuntu.com', 'archive.ubuntu.com', 'security.ubuntu.com', 'packages.microsoft.com']);
export const LIMITS = Object.freeze({ overallMs: 25_000, commandMs: 1_500, outputBytes: 65_536, configBytes: 16_384, bundleBytes: 4_194_304 });
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SAFE_ENV = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' });
const APT_KEYS = Object.freeze({ retries: ['DIAG_RETRIES', 'Acquire::Retries', 100], httpTimeoutSeconds: ['DIAG_HTTP', 'Acquire::http::Timeout', 3600], httpsTimeoutSeconds: ['DIAG_HTTPS', 'Acquire::https::Timeout', 3600] });
const NATIVE_MARKER = '// packages/playwright-core/src/server/registry/nativeDeps.ts\n';
// Independently read from the locked 1.65.0 package. A new package/version/layout
// is unsupported until reviewed, rather than guessed or executed as JavaScript.
const NATIVE_LIST_SHA256 = '3d086d481ef9438752cbcbaf460196e754a55deefda0d20ac90545e7b241502a';
const EXEC_STATUSES = ['ok', 'unavailable', 'error', 'timed_out', 'output_limit', 'budget_exhausted'];
const PROBE_STATUSES = ['resolved', 'empty', 'not_found', 'no_data', 'server_failure', 'temporary_failure', 'refused', 'unsupported', 'invalid', ...EXEC_STATUSES.filter(value => value !== 'ok')];
const isCount = value => Number.isInteger(value) && value >= 0 && value <= 100_000;
const isDuration = value => Number.isSafeInteger(value) && value >= 0;
const version = value => typeof value === 'string' && /^1\.(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2})$/.test(value) ? value : null;
const optional = predicate => value => value === null || predicate(value);
const member = values => value => values.includes(value);
const exact = (value, schema) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === Object.keys(schema).length
  && Object.entries(schema).every(([key, predicate]) => Object.hasOwn(value, key) && predicate(value[key]));
const validUtc = value => typeof value === 'string' && /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const validImageVersion = value => typeof value === 'string' && /^20\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\.[1-9]\d{0,3}(?:\.(?:0|[1-9]\d?))?$/.test(value);
const unavailablePackages = status => ({ status, expectedCount: null, installedCount: null, missingCount: null });
const probe = (status, answerCount = null, durationMs = 0) => ({ status, answerCount, durationMs });
export const INCOMPLETE = Object.freeze({ schemaVersion: 1, kind: 'roster-install-diagnostics', status: 'incomplete', installationQualified: false });

// Reject custom prototypes, accessors and array properties before JSON.stringify
// can invoke an inherited/custom toJSON or reread a changing getter.
function plainData(value) {
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return true;
  if (typeof value !== 'object') return false;
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) return false;
  return Reflect.ownKeys(value).every(key => {
    if (typeof key !== 'string' || (array && key !== 'length' && !/^(?:0|[1-9]\d*)$/.test(key))) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Object.hasOwn(descriptor, 'value') && plainData(descriptor.value);
  });
}
export function proxyPresence(hasKey = name => Object.hasOwn(process.env, name)) {
  return Object.fromEntries(['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy'].map(name => [name, hasKey(name) === true]));
}

export function serializeSummary(value) {
  if (!plainData(value)) throw new Error('Invalid diagnostic summary');
  const base = { schemaVersion: value => value === 1, kind: value => value === 'roster-install-diagnostics', status: value => value === 'incomplete', installationQualified: value => value === false };
  if (exact(value, base)) return JSON.stringify(INCOMPLETE);
  const aptNumber = maximum => value => exact(value, { status: member(['observed', 'unavailable', 'invalid']), value: optional(value => isCount(value) && value <= maximum) }) && (value.status === 'observed' ? value.value !== null : value.value === null);
  const observation = value => exact(value, { status: member(PROBE_STATUSES), answerCount: optional(value => isCount(value) && value <= 128), durationMs: isDuration })
    && (value.status === 'resolved' ? value.answerCount > 0 : ['empty', 'no_data', 'not_found'].includes(value.status) ? value.answerCount === 0 : value.answerCount === null);
  const valid = exact(value, {
    ...base, status: member(['completed', 'incomplete']), utc: optional(validUtc), headSha: optional(value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)),
    os: value => exact(value, { id: optional(member(['ubuntu'])), version: optional(member(['22.04', '24.04', '26.04'])), architecture: optional(member(['x64', 'arm64'])) }),
    image: value => exact(value, { os: optional(member(['ubuntu22', 'ubuntu24', 'ubuntu26'])), version: optional(validImageVersion) }),
    playwright: value => exact(value, { status: member(['matched', 'mismatch', 'unavailable', 'invalid']), locked: optional(value => version(value) !== null), installed: optional(value => version(value) !== null), installedCore: optional(value => version(value) !== null) }),
    apt: value => exact(value, { status: member(['observed', 'invalid', ...EXEC_STATUSES.filter(value => value !== 'ok')]), retries: aptNumber(100), httpTimeoutSeconds: aptNumber(3600), httpsTimeoutSeconds: aptNumber(3600) }),
    ubuntuMirrorList: value => exact(value, { status: member(['observed', 'filtered', 'unavailable', 'invalid']), mirrors: value => Array.isArray(value) && value.length <= 64 && value.every(entry => exact(entry, { scheme: member(['http', 'https']), host: member(HOSTS.slice(0, 3)) })), rejectedCount: isCount }),
    resolver: value => exact(value, { status: member(['observed', 'unavailable', 'invalid']), classification: optional(member(['none', 'loopback', 'non_loopback', 'mixed'])), count: optional(value => isCount(value) && value <= 16) }),
    packages: value => exact(value, { status: member(['observed', 'unsupported', 'invalid', ...EXEC_STATUSES.filter(value => value !== 'ok')]), expectedCount: optional(isCount), installedCount: optional(isCount), missingCount: optional(isCount) })
      && (value.status === 'observed' ? value.expectedCount === 33 && value.installedCount + value.missingCount === value.expectedCount : value.expectedCount === null && value.installedCount === null && value.missingCount === null),
    hosts: value => Array.isArray(value) && value.length === HOSTS.length && value.every((entry, index) => exact(entry, { host: value => value === HOSTS[index], nss: observation, dnsA: observation, dnsAAAA: observation })),
    proxyEnvironmentPresent: value => exact(value, Object.fromEntries(Object.keys(proxyPresence(() => false)).map(name => [name, value => typeof value === 'boolean']))),
    observationBudgetMs: value => value === LIMITS.overallMs, durationMs: isDuration,
  });
  if (!valid) throw new Error('Invalid diagnostic summary');
  return JSON.stringify(value);
}

// Fixed-size, regular-file reads. Nonblocking open prevents an unexpected FIFO
// from hanging diagnostics. Symlinks are allowed for the system resolv.conf.
export async function readBounded(path, maxBytes, { openFile = open } = {}) {
  let handle;
  try {
    handle = await openFile(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) return null;
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return bytesRead > maxBytes || bytesRead !== stat.size ? null : buffer.subarray(0, bytesRead).toString('utf8');
  } catch { return null; } finally { if (handle) await handle.close().catch(() => {}); }
}

// No shell, inherited environment, detached children, raw stderr, or timeout
// Promise.race. A killed child must emit close (be reaped) before we continue.
export async function runBounded(file, args, { cwd = ROOT, timeoutMs = LIMITS.commandMs, spawnImpl = spawn, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const started = now();
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return { status: 'budget_exhausted', stdout: '', code: null, durationMs: 0 };
  return new Promise(resolveResult => {
    let child, timer, failure = null, stdout = '', bytes = 0, closed = false;
    const result = () => ({ status: failure || 'ok', stdout: failure ? '' : stdout, code: failure ? null : child.exitCode, durationMs: Math.max(0, Math.round(now() - started)) });
    const stop = status => { if (!failure) { failure = status; stdout = ''; if (!closed) { try { child.kill('SIGKILL'); } catch { failure = 'error'; } } } };
    try {
      child = spawnImpl(file, args, { cwd, env: SAFE_ENV, shell: false, detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) { resolveResult({ status: error?.code === 'ENOENT' ? 'unavailable' : 'error', stdout: '', code: null, durationMs: 0 }); return; }
    const accept = (chunk, capture) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > LIMITS.outputBytes) { stop('output_limit'); return; }
      if (capture && !failure) stdout += chunk.toString('utf8');
    };
    // Retain both listeners through close and any late stream events. Error
    // payloads never leave this boundary, including errors after a timeout.
    child.stdout.on('error', () => stop('error'));
    child.stderr.on('error', () => stop('error'));
    child.stdout.on('data', chunk => accept(chunk, true));
    child.stderr.on('data', chunk => accept(chunk, false));
    child.on('error', error => { failure ||= error?.code === 'ENOENT' ? 'unavailable' : 'error'; stdout = ''; });
    child.on('close', () => { closed = true; clearTimer(timer); resolveResult(result()); });
    timer = setTimer(() => stop('timed_out'), Math.min(LIMITS.commandMs, timeoutMs));
  });
}

export function parseOs(text, architecture) {
  const result = { id: null, version: null, architecture: ['x64', 'arm64'].includes(architecture) ? architecture : null };
  if (typeof text !== 'string') return result;
  for (const [key, output, allowed] of [['ID', 'id', ['ubuntu']], ['VERSION_ID', 'version', ['22.04', '24.04', '26.04']]]) {
    const values = text.split('\n').filter(line => line.startsWith(`${key}=`)).map(line => line.slice(key.length + 1));
    if (values.length === 1) result[output] = allowed.find(value => values[0] === value || values[0] === `"${value}"` || values[0] === `'${value}'`) || null;
  }
  return result;
}

export function parseImage(imageOs, imageVersion) {
  return { os: ['ubuntu22', 'ubuntu24', 'ubuntu26'].includes(imageOs) ? imageOs : null, version: validImageVersion(imageVersion) ? imageVersion : null };
}

export function parseMirrors(text) {
  if (typeof text !== 'string') return { status: 'unavailable', mirrors: [], rejectedCount: 0 };
  const mirrors = []; let rejectedCount = 0;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    // Deliberately reject full URLs containing credentials, query/fragment,
    // escapes, ports, extra paths, or unknown hosts. Never partially redact them.
    const match = /^(https?):\/\/(azure\.archive\.ubuntu\.com|archive\.ubuntu\.com|security\.ubuntu\.com)\/ubuntu\/?$/.exec(line);
    if (match && mirrors.length < 64) mirrors.push({ scheme: match[1], host: match[2] }); else rejectedCount++;
  }
  return { status: rejectedCount ? 'filtered' : 'observed', mirrors, rejectedCount };
}

export function parseApt(result) {
  const empty = status => ({ status, ...Object.fromEntries(Object.keys(APT_KEYS).map(key => [key, { status: 'unavailable', value: null }])) });
  if (result.status !== 'ok') return empty(EXEC_STATUSES.includes(result.status) ? result.status : 'error');
  if (result.code !== 0) return empty('error');
  const output = empty('observed');
  const seen = new Set();
  for (const line of result.stdout.split('\n').filter(Boolean)) {
    const match = /^([A-Z_]+)='([^']*)'$/.exec(line);
    const entry = match && Object.entries(APT_KEYS).find(([, [name]]) => name === match[1]);
    if (!entry || seen.has(entry[0])) return empty('invalid');
    const [key, [, , maximum]] = entry; seen.add(key);
    const numeric = /^(?:0|[1-9]\d{0,3})$/.test(match[2]) && Number(match[2]) <= maximum;
    output[key] = { status: numeric ? 'observed' : 'invalid', value: numeric ? Number(match[2]) : null };
    if (!numeric) output.status = 'invalid';
  }
  return output;
}

export function parseResolver(text) {
  const unavailable = status => ({ status, classification: null, count: null });
  if (typeof text !== 'string') return unavailable('unavailable');
  const addresses = [];
  for (const line of text.split('\n')) {
    const entry = line.split(/[;#]/, 1)[0].trim().split(/\s+/);
    if (entry[0] !== 'nameserver') continue;
    if (entry.length !== 2 || !isIP(entry[1]) || addresses.length >= 16) return unavailable('invalid');
    addresses.push(entry[1]);
  }
  const loopbacks = addresses.filter(address => address.startsWith('127.') || address === '::1' || address === '0:0:0:0:0:0:0:1').length;
  return { status: 'observed', classification: !addresses.length ? 'none' : loopbacks === addresses.length ? 'loopback' : loopbacks === 0 ? 'non_loopback' : 'mixed', count: addresses.length };
}

export function inspectPlaywright(lockText, installedText, coreText) {
  const output = { status: 'unavailable', locked: null, installed: null, installedCore: null };
  const parse = text => { try { return typeof text === 'string' ? JSON.parse(text) : null; } catch { return null; } };
  const lock = parse(lockText), installed = parse(installedText), core = parse(coreText);
  output.locked = version(lock?.packages?.['node_modules/playwright']?.version);
  output.installed = installed?.name === 'playwright' ? version(installed.version) : null;
  output.installedCore = core?.name === 'playwright-core' ? version(core.version) : null;
  if (!lock || !installed || !core) return output;
  if (!output.locked || !output.installed || !output.installedCore) return { ...output, status: 'invalid' };
  const lockedCore = version(lock.packages?.['node_modules/playwright-core']?.version);
  output.status = lock.lockfileVersion === 3 && output.locked === output.installed && output.locked === output.installedCore
    && output.locked === lockedCore && lock.packages['node_modules/playwright'].dependencies?.['playwright-core'] === lockedCore
    && installed.dependencies?.['playwright-core'] === lockedCore ? 'matched' : 'mismatch';
  return output;
}

export function extractNativePackages(bundle, playwright, os) {
  if (playwright.status !== 'matched' || playwright.locked !== '1.65.0' || os.id !== 'ubuntu' || os.version !== '24.04' || os.architecture !== 'x64' || typeof bundle !== 'string' || Buffer.byteLength(bundle) > LIMITS.bundleBytes) return null;
  const start = bundle.indexOf(NATIVE_MARKER);
  if (start < 0 || bundle.indexOf(NATIVE_MARKER, start + 1) !== -1) return null;
  const end = bundle.indexOf('\n// ', start + NATIVE_MARKER.length);
  if (end < 0 || end - start > 131_072) return null;
  const section = bundle.slice(start, end);
  const pattern = /"ubuntu24\.04-x64": \{\s*tools: (\[[^\]]{1,8192}\]),\s*chromium: (\[[^\]]{1,8192}\]),/g;
  const matches = [...section.matchAll(pattern)];
  if (matches.length !== 1) return null;
  try {
    const lists = { tools: JSON.parse(matches[0][1]), chromium: JSON.parse(matches[0][2]) };
    if (createHash('sha256').update(JSON.stringify(lists)).digest('hex') !== NATIVE_LIST_SHA256) return null;
    return [...lists.tools, ...lists.chromium];
  } catch { return null; }
}

export function countPackages(result, expected) {
  if (!expected) return unavailablePackages('unsupported');
  if (result.status !== 'ok') return unavailablePackages(EXEC_STATUSES.includes(result.status) ? result.status : 'error');
  if (![0, 1].includes(result.code)) return unavailablePackages('error');
  const seen = new Set(); let installedCount = 0;
  for (const line of result.stdout.split('\n').filter(Boolean)) {
    const fields = line.split('\t');
    if (fields.length !== 2 || !expected.includes(fields[0]) || seen.has(fields[0]) || !['installed', 'not-installed', 'config-files', 'unpacked', 'half-installed', 'half-configured', 'triggers-awaited', 'triggers-pending'].includes(fields[1])) return unavailablePackages('invalid');
    seen.add(fields[0]);
    if (fields[1] === 'installed') installedCount++;
  }
  // A successful query must account for every requested package; dpkg uses 1
  // for a partially/wholly missing package set, which remains a valid inventory.
  if (result.code === 0 && seen.size !== expected.length) return unavailablePackages('invalid');
  return { status: 'observed', expectedCount: expected.length, installedCount, missingCount: expected.length - installedCount };
}

export function classifyDnsError(code) {
  const codes = { ENOTFOUND: 'not_found', ENODATA: 'no_data', ESERVFAIL: 'server_failure', EAI_AGAIN: 'temporary_failure', EREFUSED: 'refused', ETIMEOUT: 'timed_out', ENOTIMP: 'unsupported' };
  return Object.hasOwn(codes, code) ? codes[code] : 'error';
}

// The separate short-lived process bounds native DNS/NSS work too. It uses only
// Node's existing configured resolver, with no server override or DNS fallback.
export const DNS_QUERY_SCRIPT = `
const { resolve4, resolve6 } = require('node:dns');
const { isIP } = require('node:net');
const hosts = ${JSON.stringify(HOSTS)};
const host = process.argv[1], family = process.argv[2];
const emit = (status, answerCount = null) => process.stdout.write(JSON.stringify({ status, answerCount }));
if (!hosts.includes(host) || !['4', '6'].includes(family)) { emit('invalid'); }
else {
  const classify = ${classifyDnsError.toString()};
  try {
    (family === '4' ? resolve4 : resolve6)(host, (error, answers) => {
      if (error) { const status = classify(error.code); emit(status, ['no_data', 'not_found'].includes(status) ? 0 : null); }
      else if (!Array.isArray(answers) || answers.length > 128 || answers.some(answer => isIP(answer) !== Number(family))) emit('invalid');
      else emit(answers.length ? 'resolved' : 'empty', answers.length);
    });
  } catch { emit('error'); }
}
`;

export function parseProbe(result, kind) {
  if (result.status !== 'ok') return probe(EXEC_STATUSES.includes(result.status) ? result.status : 'error', null, result.durationMs);
  if (kind === 'nss') {
    if (result.code === 2) return probe('not_found', 0, result.durationMs);
    if (result.code !== 0) return probe('error', null, result.durationMs);
    const addresses = new Set();
    for (const line of result.stdout.split('\n').filter(Boolean)) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 2 || fields.length > 3 || !isIP(fields[0]) || !['STREAM', 'DGRAM', 'RAW'].includes(fields[1]) || (fields[2] && !/^[a-zA-Z0-9.-]{1,253}$/.test(fields[2]))) return probe('invalid', null, result.durationMs);
      addresses.add(fields[0]);
    }
    return addresses.size > 128 ? probe('invalid', null, result.durationMs) : probe(addresses.size ? 'resolved' : 'empty', addresses.size, result.durationMs);
  }
  if (result.code !== 0) return probe('error', null, result.durationMs);
  try {
    const value = JSON.parse(result.stdout);
    if (!exact(value, { status: member(PROBE_STATUSES), answerCount: optional(value => isCount(value) && value <= 128) })) return probe('invalid', null, result.durationMs);
    if (value.status === 'resolved' ? value.answerCount <= 0 : ['empty', 'no_data', 'not_found'].includes(value.status) ? value.answerCount !== 0 : value.answerCount !== null) return probe('invalid', null, result.durationMs);
    return probe(value.status, value.answerCount, result.durationMs);
  } catch { return probe('invalid', null, result.durationMs); }
}

export async function collectDiagnostics({ read = readBounded, run = runBounded, now = () => performance.now(), utcNow = () => new Date().toISOString(), imageOs = process.env.ImageOS, imageVersion = process.env.ImageVersion, architecture = process.arch, hasEnvironmentKey = name => Object.hasOwn(process.env, name) } = {}) {
  const started = now();
  // A scheduling budget, not a claim to preempt filesystem/kernel operations.
  // The workflow's two-minute timeout is the outer hard cap. Observed duration
  // is never clamped; a late operation ends further work and reports incomplete.
  const elapsed = () => Math.max(0, Math.round(now() - started));
  const remaining = () => LIMITS.overallMs - (now() - started);
  const readSafe = async (path, cap = LIMITS.configBytes) => remaining() > 0 ? read(path, cap) : null;
  const command = async (file, args) => remaining() > 0
    ? run(file, args, { cwd: ROOT, timeoutMs: Math.min(LIMITS.commandMs, remaining()) })
    : { status: 'budget_exhausted', stdout: '', code: null, durationMs: 0 };
  const utc = utcNow();
  const head = await command('/usr/bin/git', ['rev-parse', '--verify', 'HEAD']);
  const headText = head.status === 'ok' && head.code === 0 ? head.stdout.replace(/\n$/, '') : null;
  const os = parseOs(await readSafe('/etc/os-release'), architecture);
  const playwright = inspectPlaywright(await readSafe(join(ROOT, 'package-lock.json'), 524_288), await readSafe(join(ROOT, 'node_modules/playwright/package.json'), 65_536), await readSafe(join(ROOT, 'node_modules/playwright-core/package.json'), 65_536));
  const apt = parseApt(await command('/usr/bin/apt-config', ['shell', ...Object.values(APT_KEYS).flatMap(([name, key]) => [name, key])]));
  // This exact file and the three keys above are used by the reviewed runner:
  // https://github.com/actions/runner-images/blob/ubuntu24/20261101.360/images/ubuntu/scripts/build/configure-apt.sh
  const ubuntuMirrorList = parseMirrors(await readSafe('/etc/apt/apt-mirrors.txt'));
  const resolver = parseResolver(await readSafe('/etc/resolv.conf'));
  const native = playwright.status === 'matched' && playwright.locked === '1.65.0' && os.id === 'ubuntu' && os.version === '24.04' && os.architecture === 'x64'
    ? extractNativePackages(await readSafe(join(ROOT, 'node_modules/playwright-core/lib/coreBundle.js'), LIMITS.bundleBytes), playwright, os) : null;
  const packages = native ? countPackages(await command('/usr/bin/dpkg-query', ['--show', '--showformat=${Package}\t${db:Status-Status}\n', '--', ...native]), native) : unavailablePackages(playwright.status === 'unavailable' ? 'unavailable' : 'unsupported');
  const hosts = [];
  for (const host of HOSTS) {
    const nss = parseProbe(await command('/usr/bin/getent', ['ahosts', host]), 'nss');
    const dnsA = parseProbe(await command(process.execPath, ['--input-type=commonjs', '-e', DNS_QUERY_SCRIPT, host, '4']), 'dns');
    const dnsAAAA = parseProbe(await command(process.execPath, ['--input-type=commonjs', '-e', DNS_QUERY_SCRIPT, host, '6']), 'dns');
    hosts.push({ host, nss, dnsA, dnsAAAA });
  }
  const summary = { ...INCOMPLETE, status: remaining() > 0 ? 'completed' : 'incomplete', utc: validUtc(utc) ? utc : null,
    headSha: typeof headText === 'string' && /^[0-9a-f]{40}$/.test(headText) ? headText : null,
    os, image: parseImage(imageOs, imageVersion), playwright, apt, ubuntuMirrorList, resolver, packages, hosts, proxyEnvironmentPresent: proxyPresence(hasEnvironmentKey), observationBudgetMs: LIMITS.overallMs, durationMs: elapsed() };
  serializeSummary(summary);
  return summary;
}

// Exactly one attempt and one error listener per output stream. The WeakMap does
// not keep discarded injected streams alive. For stdout, the listener deliberately
// lasts until process exit: Node can emit error after the write callback, so
// removing it on completion would expose an unhandled raw exception/stack.
const summaryWrites = new WeakMap();
function writeSummaryOnce(output, value) {
  const previous = summaryWrites.get(output);
  if (previous) { previous.fail(); return Promise.resolve(previous); }
  const state = { failed: false, finish: null, fail: null };
  state.fail = () => {
    state.failed = true;
    if (output === process.stdout) process.exitCode = 1;
    state.finish?.();
  };
  summaryWrites.set(output, state);
  return new Promise(resolveWrite => {
    state.finish = () => { state.finish = null; resolveWrite(state); };
    try {
      output.on('error', state.fail);
      output.write(value, error => { if (error) state.fail(); else state.finish?.(); });
    } catch { state.fail(); }
  });
}

export async function diagnosticsMain({ collect = collectDiagnostics, write, output = process.stdout } = {}) {
  let summaryText, exitCode;
  try {
    const summary = await collect();
    summaryText = serializeSummary(summary);
    exitCode = summary.status === 'completed' ? 0 : 1;
  } catch {
    summaryText = JSON.stringify(INCOMPLETE);
    exitCode = 1;
  }
  // One write only, including a write failure. Never retry a partial write or
  // expose an exception/stack while trying to report a diagnostic failure.
  try {
    if (write) await write(`${summaryText}\n`);
    else if ((await writeSummaryOnce(output, `${summaryText}\n`)).failed) return 1;
  } catch { return 1; }
  return exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // No arguments or environment switches enable alternate hosts or operations.
  const outcome = await diagnosticsMain();
  // A late output error may already have set exitCode; never overwrite it with 0.
  if (outcome !== 0) process.exitCode = outcome;
}
