import { createHash } from 'node:crypto';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Errors never include actual/expected values, response bodies, URLs or Playwright call logs.
export function check(condition, label) {
  if (!condition) throw new Error(label);
}
export function equal(actual, expected, label) {
  check(JSON.stringify(actual) === JSON.stringify(expected), label);
}
export function absent(text, values, label) {
  check(!values.some(value => value && String(text).includes(value)), label);
}
export function publicReceipt(payload, names, replayed) {
  const data = payload?.data;
  check(data && Object.keys(payload).join(',') === 'data', 'receipt-envelope');
  equal(Object.keys(data).sort(), ['createdCount','credentialsAvailable','replayed','students'], 'receipt-fields');
  check(data.createdCount === names.length && data.replayed === replayed && data.credentialsAvailable === !replayed, 'receipt-state');
  check(Array.isArray(data.students) && data.students.length === names.length, 'receipt-count');
  const identifiers = new Set(), codes = new Set();
  for (const [index, row] of data.students.entries()) {
    equal(Object.keys(row).sort(), replayed ? ['displayName','playerIdentifier','row'] : ['accessCode','displayName','playerIdentifier','row'], 'receipt-row-fields');
    check(row.row === index + 1 && row.displayName === names[index], 'receipt-order');
    check(/^STU-[A-F0-9]{24}$/.test(row.playerIdentifier), 'identifier-format');
    identifiers.add(row.playerIdentifier);
    if (!replayed) {
      check(/^[A-F0-9]{32}$/.test(row.accessCode), 'code-format');
      codes.add(row.accessCode);
    }
  }
  check(identifiers.size === names.length && (replayed || codes.size === names.length), 'distinct-credentials');
  return data;
}
export function underDeadline(start, now = performance.now()) {
  const elapsedMs = now - start;
  check(elapsedMs >= 0 && elapsedMs < 30_000, 'absolute-import-deadline');
  return Math.round(elapsedMs);
}
