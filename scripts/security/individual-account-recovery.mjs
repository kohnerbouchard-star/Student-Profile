import { createHash } from 'node:crypto';

export const RECOVERY_TARGETS = Object.freeze({
  staging: 'eecvbssdvarfcykcfrny', production: 'cgiukdjwicykrmtkhudh',
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REF = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{7,159}$/;
const FIELDS = ['version','environment','projectRef','authUserId','operation','requestId',
  'sourceCommit','supportRequestRef','identityEvidenceRef','expiresAt'];

// An immutable operation description, never evidence that a human approved it.
export function validateIndividualRecovery(value, now = Date.now()) {
  if (!value || Array.isArray(value) || typeof value !== 'object' ||
      Object.keys(value).length !== FIELDS.length + 1 ||
      Object.keys(value).some(k => ![...FIELDS, 'factorIds'].includes(k)) ||
      FIELDS.some(k => typeof value[k] !== 'string') || value.version !== '2' ||
      !Object.hasOwn(RECOVERY_TARGETS,value.environment) || RECOVERY_TARGETS[value.environment] !== value.projectRef ||
      value.operation !== 'reset-individual-mfa' || !UUID.test(value.authUserId) || !UUID.test(value.requestId) ||
      !/^[a-f0-9]{40}$/.test(value.sourceCommit) || !REF.test(value.supportRequestRef) || !REF.test(value.identityEvidenceRef) ||
      !Array.isArray(value.factorIds) || value.factorIds.length > 20 ||
      value.factorIds.some(id => typeof id !== 'string' || !UUID.test(id)) ||
      new Set(value.factorIds).size !== value.factorIds.length) throw Error('Invalid individual recovery request');
  const expires = Date.parse(value.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(expires) || expires <= now || expires > now + 900_000 ||
      new Date(expires).toISOString() !== value.expiresAt) throw Error('Invalid individual recovery expiry');
  return Object.freeze(Object.fromEntries([...FIELDS.map(k => [k,value[k]]),
    ['factorIds',Object.freeze([...value.factorIds].sort())]]));
}

export function individualRecoveryDigest(request) {
  return createHash('sha256').update([...FIELDS.map(k => request[k]), request.factorIds.join(',')].join('\n')).digest('hex');
}

export function sameIndividualRecovery(left,right) {
  try {
    const checked = validateIndividualRecovery(left, Date.parse(right.expiresAt)-1);
    return individualRecoveryDigest(checked) === individualRecoveryDigest(right);
  } catch { return false; }
}

// Target metadata belongs to trusted adapter construction, never request JSON.
// Credential provenance still requires a reviewed live adapter; none is supplied.
export function assertIndividualTarget(request,target) {
  if (!target || target.environment !== request.environment || target.projectRef !== request.projectRef ||
      target.supabaseUrl !== `https://${request.projectRef}.supabase.co` ||
      typeof target.operatorSubject !== 'string' || !target.operatorSubject || target.operatorSubject.length > 200) {
    throw Error('Individual recovery target binding unavailable');
  }
}

export function assertIndividualApproval(request,approval,target) {
  assertIndividualTarget(request,target);
  if (!sameIndividualRecovery(approval?.request,request) || approval.subject !== target.operatorSubject ||
      approval.confirmedOperationDigest !== individualRecoveryDigest(request) ||
      approval.supportRequestVerified !== true ||
      (request.environment === 'production' && approval.productionConfirmed !== true) ||
      !Array.isArray(approval.factorIds) || JSON.stringify([...approval.factorIds].sort()) !== JSON.stringify(request.factorIds)) {
    throw Error('Exact individual support approval required');
  }
}
