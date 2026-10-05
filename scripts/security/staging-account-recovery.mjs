#!/usr/bin/env node
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const STAGING_PROJECT = 'eecvbssdvarfcykcfrny';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{40}$/;
const FIELDS = ['requestId', 'projectRef', 'authUserId', 'sourceCommit', 'identityEvidenceRef', 'expiresAt'];

// This parses an operator request, not proof of approval. Neither application
// roles nor a caller-supplied actor/MFA flag can authorize the live operation.
export function validateRecoveryRequest(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !FIELDS.includes(key)) ||
      FIELDS.some(key => typeof value[key] !== 'string')) throw new Error('Invalid recovery request');
  if (value.projectRef !== STAGING_PROJECT || !UUID.test(value.requestId) ||
      !UUID.test(value.authUserId) || !SHA.test(value.sourceCommit) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{7,159}$/.test(value.identityEvidenceRef)) {
    throw new Error('Recovery identity or staging scope is invalid');
  }
  const expiry = Date.parse(value.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(expiry) || expiry <= now || expiry > now + 15 * 60_000) {
    throw new Error('Recovery request must expire within fifteen minutes');
  }
  return Object.freeze({ ...value });
}

export function recoveryPlan(value, now = Date.now()) {
  const request = validateRecoveryRequest(value, now);
  return Object.freeze({
    mode: 'plan-only', requestId: request.requestId, projectRef: request.projectRef,
    sourceCommit: request.sourceCommit, liveExecutionEnabled: false,
    steps: Object.freeze([
      'Verify external system operator authentication and independent identity evidence',
      'Atomically restrict the exact approved account and audit the operation',
      'Revoke and verify old sessions before removing the approved lost factors',
      'Issue a user-bound expiring single-use recovery grant after provider confirmation',
      'Verify new primary and backup factors recorded for this recovery attempt',
      'Set password privately at AAL2 and complete the account security transition',
      'Revoke recovery sessions, consume grant and require fresh sign-in',
    ]),
  });
}

// Orchestration is dependency-injected for disposable qualification. No live
// adapter is exported or constructed by this CLI. The approval verifier must be
// a trusted external system-identity integration, never request JSON validation.
export async function runApprovedRecovery(value, adapters, now = Date.now()) {
  const request = validateRecoveryRequest(value, now);
  const approval = await adapters.verifyOperatorApproval(request);
  if (!approval || approval.verified !== true || approval.principalKind !== 'system' ||
      approval.identityChecksVerified !== true || typeof approval.subject !== 'string' || !approval.subject ||
      !Number.isFinite(approval.authenticatedAt) || approval.authenticatedAt > now || now-approval.authenticatedAt > 300_000 ||
      FIELDS.some(key => approval.request?.[key] !== request[key]) ||
      !Array.isArray(approval.factorIds) || approval.factorIds.length > 20 ||
      approval.factorIds.some(id => typeof id !== 'string' || !UUID.test(id)) ||
      new Set(approval.factorIds).size !== approval.factorIds.length) throw Error('External operator approval required');
  await adapters.store.begin(request, approval);
  let state = await adapters.store.read(request);
  const advance = async (expected, next, evidence = {}) => {
    await adapters.store.advance(request, expected, next, evidence);
    state = await adapters.store.read(request);
    if (state.phase !== next) throw Error('Recovery transition was not confirmed');
  };
  if (state.phase === 'restricted') {
    await advance('restricted', 'revoking');
    await adapters.provider.revokeSessions(request.authUserId);
    await advance('revoking', 'revoked');
  }
  if (state.phase === 'revoked') {
    await advance('revoked', 'removing');
    const factors = await adapters.provider.listFactorMetadata(request.authUserId);
    if (!Array.isArray(factors) || factors.some(factor => factor.status === 'verified' && !approval.factorIds.includes(factor.id))) {
      throw Error('Provider factor state differs from the approved request');
    }
    for (const id of approval.factorIds) {
      if (factors.some(factor => factor.id === id)) await adapters.provider.deleteFactor(request.authUserId, id);
    }
    await advance('removing', 'removed');
  }
  if (state.phase === 'removed') {
    // prepare must persist encrypted delivery material idempotently by request ID;
    // returning only its hash prevents operator logs from containing the grant.
    const delivery = await adapters.delivery.prepare(request);
    if (!delivery || !/^[a-f0-9]{64}$/.test(delivery.grantDigest) ||
        !Number.isFinite(delivery.expiresAt) || delivery.expiresAt <= now || delivery.expiresAt > now + 900_000) {
      throw Error('Invalid recovery delivery record');
    }
    await advance('removed', 'ready', delivery);
  }
  if (state.phase !== 'ready') throw Error('Recovery is not ready for delivery');
  // Delivery may be retried; it must use the same persisted single-use link.
  await adapters.delivery.send(request);
  return Object.freeze({requestId:request.requestId,phase:'ready',restricted:true});
}

// Only injected disposable integrations are used here. The CLI never constructs
// this adapter or obtains a key, provider token, recipient, or delivery credential.
export function createRecoveryDelivery({ key, store, provider, clock = Date.now }) {
  if (!(key instanceof Uint8Array) || key.length !== 32) throw Error('Delivery encryption key unavailable');
  const binding = request => Buffer.from(JSON.stringify(['recovery-delivery-v1', ...FIELDS.map(field => request[field])]));
  const checkedRecord = (request, record) => {
    if (!record || record.version !== 1 || record.expiresAt !== Date.parse(request.expiresAt) ||
        record.expiresAt <= clock() || !/^[a-f0-9]{64}$/.test(record.grantDigest) ||
        typeof record.sealed !== 'string') throw Error('Recovery delivery unavailable');
    return record;
  };
  return {
    async prepare(value) {
      const request = validateRecoveryRequest(value, clock());
      const existing = await store.readDelivery(request);
      if (existing) return { grantDigest: checkedRecord(request, existing).grantDigest, expiresAt: existing.expiresAt };
      // One-shot reservation precedes the provider call: even a lost token-issue
      // response must never cause another issuance or a replacement link.
      if (await store.reserveDelivery(request) !== true) throw Error('Recovery delivery requires reconciliation');
      const grant = randomBytes(32).toString('base64url');
      let token;
      try { token = await provider.issueRecoveryToken(request); }
      catch { throw Error('Recovery token issuance requires reconciliation'); }
      if (!token || token.authUserId !== request.authUserId || token.projectRef !== request.projectRef ||
          typeof token.tokenHash !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(token.tokenHash)) {
        throw Error('Recovery token identity mismatch');
      }
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(binding(request));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify({ grant, tokenHash: token.tokenHash }), 'utf8'), cipher.final()]);
      const record = { version: 1, grantDigest: createHash('sha256').update(grant).digest('hex'),
        expiresAt: Date.parse(request.expiresAt),
        sealed: Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url') };
      if (await store.saveDelivery(request, record) !== true) throw Error('Recovery delivery persistence unavailable');
      return { grantDigest: record.grantDigest, expiresAt: record.expiresAt };
    },
    async send(value) {
      const request = validateRecoveryRequest(value, clock());
      const record = checkedRecord(request, await store.readDelivery(request));
      if (await store.deliveryReady(request, record.grantDigest) !== true) throw Error('Recovery delivery is not ready');
      if (record.delivered === true) return;
      const sealed = Buffer.from(record.sealed, 'base64url');
      if (sealed.length < 29) throw Error('Recovery delivery unavailable');
      let payload;
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0,12));
        decipher.setAAD(binding(request)); decipher.setAuthTag(sealed.subarray(12,28));
        payload = JSON.parse(Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]).toString('utf8'));
      } catch { throw Error('Recovery delivery authentication failed'); }
      if (!/^[A-Za-z0-9_-]{43}$/.test(payload.grant) || !/^[A-Za-z0-9_-]{16,256}$/.test(payload.tokenHash) ||
          createHash('sha256').update(payload.grant).digest('hex') !== record.grantDigest) throw Error('Recovery delivery unavailable');
      // Recipient resolution belongs to the trusted provider by approved user ID.
      // It MUST support durable idempotency; a timeout does not acknowledge mail.
      let delivered;
      try { delivered = await provider.sendRecovery(request, payload, { idempotencyKey: `recovery:${request.requestId}` }); }
      catch { throw Error('Recovery delivery outcome unknown'); }
      if (delivered?.acknowledged !== true) throw Error('Recovery delivery outcome unknown');
      if (await store.acknowledgeDelivery(request, record.grantDigest) !== true) throw Error('Recovery delivery acknowledgement unavailable');
    },
  };
}

// Callable only with an explicitly supplied service RPC adapter; no connection,
// credentials or executable command is provided here.
export function createRecoveryDeliveryStore(rpc) {
  const call = async (request, action, record = null) => {
    const result = await rpc('system_recovery_delivery_v1', {
      p_id: request.requestId, p_user: request.authUserId, p_source: request.sourceCommit,
      p_evidence: request.identityEvidenceRef, p_request_expires: request.expiresAt,
      p_action: action, p_record: record,
    });
    if (result.error || (['save','ack'].includes(action) && result.data !== true)) throw Error('Recovery delivery persistence unavailable');
    return result.data;
  };
  return {
    readDelivery: request => call(request, 'read'),
    reserveDelivery: request => call(request, 'reserve'),
    saveDelivery: (request, record) => call(request, 'save', record),
    deliveryReady: (request, digest) => call(request, 'ready', { grantDigest: digest }),
    acknowledgeDelivery: (request, digest) => call(request, 'ack', { grantDigest: digest }),
  };
}

// Read-only reconciliation can describe an interrupted attempt, but cannot prove
// that old service-role effects have stopped. No timeout authorizes a restart.
export async function assessRecoveryReconciliation(value, adapters, now = Date.now()) {
  const expiry = Date.parse(value?.expiresAt);
  if (!Number.isFinite(expiry)) throw Error('Invalid recovery identity');
  const request = validateRecoveryRequest(value, Math.min(now, expiry - 1));
  const approval = await adapters.verifyOperatorApproval(request);
  if (!approval || approval.verified !== true || approval.principalKind !== 'system' ||
      approval.identityChecksVerified !== true || typeof approval.subject !== 'string' || !approval.subject ||
      !Number.isFinite(approval.authenticatedAt) || approval.authenticatedAt > now || now-approval.authenticatedAt > 300_000 ||
      FIELDS.some(field => approval.request?.[field] !== request[field])) throw Error('External operator approval required');
  const state = await adapters.store.read(request);
  if (!state || state.restricted !== true || !['restricted','revoking','revoked','removing','removed','ready','enrolling','completing','cancelled'].includes(state.phase)) {
    throw Error('Restricted recovery attempt unavailable');
  }
  return Object.freeze({ requestId: request.requestId, phase: state.phase, restricted: true,
    expired: expiry <= now, restartAllowed: false, providerActionsAllowed: false,
    requiredEvidence: Object.freeze(['independent identity review', 'verified quiescence of all previous executors and provider operations',
      'exact provider and account-security state reconciliation', 'separately approved new attempt']) });
}

// Bounded restart never takes over an in-flight operation. The database permits
// only expired, unreserved ready/enrolling attempts after operator effects ended.
export async function restartExpiredRecovery(previous, value, adapters, now = Date.now()) {
  const oldExpiry = Date.parse(previous?.expiresAt);
  if (!Number.isFinite(oldExpiry) || oldExpiry > now) throw Error('Previous attempt is not expired');
  const oldRequest = validateRecoveryRequest(previous, oldExpiry - 1);
  const request = validateRecoveryRequest(value, now);
  if (request.requestId === oldRequest.requestId || request.authUserId !== oldRequest.authUserId ||
      request.projectRef !== oldRequest.projectRef) throw Error('Restart identity mismatch');
  const approval = await adapters.verifyRestartApproval(oldRequest, request);
  if (!approval || approval.verified !== true || approval.principalKind !== 'system' ||
      approval.identityChecksVerified !== true || typeof approval.subject !== 'string' || !approval.subject ||
      !Number.isFinite(approval.authenticatedAt) || approval.authenticatedAt > now || now-approval.authenticatedAt > 300_000 ||
      FIELDS.some(field => approval.previous?.[field] !== oldRequest[field] || approval.request?.[field] !== request[field])) {
    throw Error('Fresh external operator restart approval required');
  }
  const result = await adapters.rpc('system_recovery_restart_v1', {
    p_old_id: oldRequest.requestId, p_old_source: oldRequest.sourceCommit,
    p_old_evidence: oldRequest.identityEvidenceRef, p_old_expires: oldRequest.expiresAt,
    p_new_id: request.requestId, p_user: request.authUserId, p_new_source: request.sourceCommit,
    p_operator: approval.subject, p_evidence: request.identityEvidenceRef, p_expires: request.expiresAt,
  });
  if (result.error || result.data !== request.requestId) throw Error('Recovery restart unavailable; restriction preserved');
  return Object.freeze({ requestId: request.requestId, phase: 'restricted', restricted: true });
}

// A separately bound worker may deliver non-secret lifecycle notices. Provider
// support for this idempotency key is required; unknown outcomes stay pending.
export async function deliverRecoveryNotice(value, kind, { rpc, provider }, now = Date.now()) {
  const expiry = Date.parse(value?.expiresAt);
  if (!Number.isFinite(expiry) || !['started','completed'].includes(kind)) throw Error('Invalid recovery notice');
  const request = validateRecoveryRequest(value, Math.min(now, expiry - 1));
  const args = { p_id: request.requestId, p_user: request.authUserId, p_source: request.sourceCommit, p_kind: kind };
  const pending = await rpc('system_recovery_notice_v1', args);
  if (pending.error || pending.data?.kind !== kind) throw Error('Recovery notice unavailable');
  if (pending.data.delivered === true) return;
  let receipt;
  try { receipt = await provider.sendNotice(request, { kind }, { idempotencyKey: `recovery-notice:${request.requestId}:${kind}` }); }
  catch { throw Error('Recovery notice outcome unknown'); }
  if (receipt?.acknowledged !== true) throw Error('Recovery notice outcome unknown');
  const ack = await rpc('system_recovery_notice_v1', { ...args, p_ack: true });
  if (ack.error || ack.data?.delivered !== true) throw Error('Recovery notice acknowledgement unavailable');
}

export async function main(args) {
  // Deliberately no live adapter, secret discovery, environment-variable toggle,
  // or network import. Enabling execution requires another reviewed change.
  if (args.length !== 2 || args[0] !== '--plan') {
    throw new Error('Live recovery execution is disabled; use --plan <request.json>');
  }
  const value = JSON.parse(await readFile(args[1], 'utf8'));
  process.stdout.write(`${JSON.stringify(recoveryPlan(value), null, 2)}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(() => {
    process.stderr.write('Recovery request rejected. No live action was performed.\n');
    process.exitCode = 1;
  });
}
