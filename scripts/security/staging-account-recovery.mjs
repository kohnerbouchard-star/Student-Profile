#!/usr/bin/env node
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
      !Array.isArray(approval.factorIds) || approval.factorIds.length === 0 ||
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
    await adapters.provider.revokeSessions(request.authUserId);
    await advance('restricted', 'revoked');
  }
  if (state.phase === 'revoked') {
    const factors = await adapters.provider.listFactorMetadata(request.authUserId);
    if (!Array.isArray(factors) || factors.some(factor => factor.status === 'verified' && !approval.factorIds.includes(factor.id))) {
      throw Error('Provider factor state differs from the approved request');
    }
    for (const id of approval.factorIds) {
      if (factors.some(factor => factor.id === id)) await adapters.provider.deleteFactor(request.authUserId, id);
    }
    await advance('revoked', 'removed');
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
