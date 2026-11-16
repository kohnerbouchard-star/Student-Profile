#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

function key(prefix, value) {
  return `${prefix}_${String(value).padStart(32, "0")}`;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}

function snapshot(value) {
  return JSON.stringify(value);
}

function baseState(status = "in_progress") {
  return {
    business: { key: key("biz", 1) },
    now: 2_000,
    job: {
      key: key("mfg", 1),
      status,
      resourceState: "reserved",
      startedAt: status === "queued" ? null : 1_000,
      completesAt: status === "queued" ? null : 1_900,
      leaseToken: status === "queued" ? null : randomUUID(),
      leaseExpiresAt: status === "queued" ? null : 2_100,
      attemptCount: 2,
      maxAttempts: 3,
      terminalIdempotencyKey: null,
      terminalRequestHash: null,
      terminalReasonCode: null,
      terminalActorType: null,
      cancelledAt: null,
      failedAt: null,
    },
    wip: {
      "item.steel": { quantity: 10, reserved: 0, unitCost: 3 },
      "item.circuit": { quantity: 5, reserved: 0, unitCost: 7 },
    },
    warehouse: {
      "item.steel": { quantity: 0, unitCost: 3 },
      "item.circuit": { quantity: 0, unitCost: 7 },
    },
    materials: [
      { key: key("mfm", 1), itemKey: "item.steel", quantity: 10, status: "staged" },
      { key: key("mfm", 2), itemKey: "item.circuit", quantity: 5, status: "staged" },
    ],
    labor: [
      { key: key("blr", 1), status: "reserved" },
      { key: key("blr", 2), status: "active" },
    ],
    equipment: [
      { key: key("eqr", 1), status: "reserved" },
      { key: key("eqr", 2), status: "active" },
    ],
    transitions: [],
    audits: [],
    releasePosterCommits: 0,
    finishedGoods: {},
  };
}

function releaseResources(state, terminalStatus, reason, options = {}) {
  const job = state.job;
  if (!["queued", "in_progress"].includes(job.status) || job.resourceState !== "reserved") {
    throw new Error("BUSINESS_MANUFACTURING_RESOURCE_RELEASE_STATE_INVALID");
  }

  for (const material of [...state.materials].sort((a, b) => a.key.localeCompare(b.key))) {
    if (material.status !== "staged") {
      throw new Error("BUSINESS_MANUFACTURING_MATERIAL_STATE_INVALID");
    }
    const wip = state.wip[material.itemKey];
    if (!wip || wip.quantity - wip.reserved < material.quantity) {
      throw new Error("BUSINESS_MANUFACTURING_WIP_QUANTITY_UNAVAILABLE");
    }
    wip.quantity -= material.quantity;
    state.warehouse[material.itemKey].quantity += material.quantity;
    material.status = "released";
  }

  if (state.labor.some((entry) => !["reserved", "active"].includes(entry.status))) {
    throw new Error("BUSINESS_MANUFACTURING_LABOR_RELEASE_CONFLICT");
  }
  if (state.equipment.some((entry) => !["reserved", "active"].includes(entry.status))) {
    throw new Error("BUSINESS_MANUFACTURING_EQUIPMENT_RELEASE_CONFLICT");
  }

  for (const reservation of state.labor) reservation.status = "released";
  for (const reservation of state.equipment) reservation.status = "released";

  if (options.posterFails) {
    throw new Error("BUSINESS_MANUFACTURING_RESOURCE_RELEASE_POST_FAILED");
  }
  state.releasePosterCommits += 1;
  return {
    terminalStatus,
    reason,
    materialLinesReleased: state.materials.length,
    laborReservationsReleased: state.labor.length,
    equipmentReservationsReleased: state.equipment.length,
  };
}

function cancel(state, idempotencyKey, options = {}) {
  const before = clone(state);
  try {
    const job = state.job;
    const requestHash = hash(`${state.business.key}|${job.key}|cancelled`);
    if (job.status === "cancelled") {
      if (
        job.terminalIdempotencyKey !== idempotencyKey ||
        job.terminalRequestHash !== requestHash
      ) {
        throw new Error("BUSINESS_MANUFACTURING_TERMINAL_IDEMPOTENCY_CONFLICT");
      }
      return { job, replayed: true };
    }
    if (!["queued", "in_progress"].includes(job.status) || job.resourceState !== "reserved") {
      throw new Error("BUSINESS_MANUFACTURING_CANCEL_STATE_INVALID");
    }

    const fromStatus = job.status;
    const release = releaseResources(state, "cancelled", "player_cancelled", options);
    job.status = "cancelled";
    job.resourceState = "released";
    job.cancelledAt = state.now;
    job.leaseToken = null;
    job.leaseExpiresAt = null;
    job.terminalIdempotencyKey = idempotencyKey;
    job.terminalRequestHash = requestHash;
    job.terminalReasonCode = "player_cancelled";
    job.terminalActorType = "player";
    state.transitions.push({ from: fromStatus, to: "cancelled", key: `player:cancel:${requestHash.slice(0, 48)}` });
    state.audits.push({ action: "business.manufacturing.cancelled", release });
    return { job, replayed: false };
  } catch (error) {
    Object.keys(state).forEach((property) => delete state[property]);
    Object.assign(state, before);
    throw error;
  }
}

function fail(state, reason, idempotencyKey, options = {}) {
  const before = clone(state);
  try {
    const job = state.job;
    const requestHash = hash(`${job.key}|${reason}|failed`);
    if (job.status === "failed") {
      if (
        job.terminalIdempotencyKey !== idempotencyKey ||
        job.terminalRequestHash !== requestHash
      ) {
        throw new Error("BUSINESS_MANUFACTURING_TERMINAL_IDEMPOTENCY_CONFLICT");
      }
      return { job, replayed: true };
    }
    if (!["queued", "in_progress"].includes(job.status) || job.resourceState !== "reserved") {
      throw new Error("BUSINESS_MANUFACTURING_FAIL_STATE_INVALID");
    }
    if (job.leaseToken && job.leaseExpiresAt > state.now) {
      throw new Error("BUSINESS_MANUFACTURING_COMPLETION_LEASE_ACTIVE");
    }
    if (reason === "completion_attempts_exhausted" && job.attemptCount < job.maxAttempts) {
      throw new Error("BUSINESS_MANUFACTURING_ATTEMPTS_NOT_EXHAUSTED");
    }

    const fromStatus = job.status;
    const release = releaseResources(state, "failed", reason, options);
    job.status = "failed";
    job.resourceState = "released";
    job.failedAt = state.now;
    job.leaseToken = null;
    job.leaseExpiresAt = null;
    job.terminalIdempotencyKey = idempotencyKey;
    job.terminalRequestHash = requestHash;
    job.terminalReasonCode = reason;
    job.terminalActorType = "system";
    state.transitions.push({ from: fromStatus, to: "failed", key: `system:fail:${requestHash.slice(0, 48)}` });
    state.audits.push({ action: "business.manufacturing.failed", release });
    return { job, replayed: false };
  } catch (error) {
    Object.keys(state).forEach((property) => delete state[property]);
    Object.assign(state, before);
    throw error;
  }
}

const queued = baseState("queued");
const queuedCancel = cancel(queued, "cancel-request-0001");
assert.equal(queuedCancel.replayed, false);
assert.equal(queued.job.status, "cancelled");
assert.equal(queued.job.resourceState, "released");
assert.equal(queued.wip["item.steel"].quantity, 0);
assert.equal(queued.warehouse["item.steel"].quantity, 10);
assert.ok(queued.materials.every((entry) => entry.status === "released"));
assert.ok(queued.labor.every((entry) => entry.status === "released"));
assert.ok(queued.equipment.every((entry) => entry.status === "released"));
assert.equal(queued.releasePosterCommits, 1);
const cancelledSnapshot = snapshot(queued);
assert.equal(cancel(queued, "cancel-request-0001").replayed, true);
assert.equal(snapshot(queued), cancelledSnapshot, "Cancellation replay cannot release twice.");
assert.throws(
  () => cancel(queued, "cancel-request-conflict"),
  /BUSINESS_MANUFACTURING_TERMINAL_IDEMPOTENCY_CONFLICT/,
);
assert.equal(snapshot(queued), cancelledSnapshot);

const activeLease = baseState();
const activeBefore = snapshot(activeLease);
assert.throws(
  () => fail(activeLease, "completion_attempts_exhausted", "system-fail-0001"),
  /BUSINESS_MANUFACTURING_COMPLETION_LEASE_ACTIVE/,
);
assert.equal(snapshot(activeLease), activeBefore, "System failure cannot steal an active completion lease.");

const notExhausted = baseState();
notExhausted.job.leaseToken = null;
notExhausted.job.leaseExpiresAt = null;
const notExhaustedBefore = snapshot(notExhausted);
assert.throws(
  () => fail(notExhausted, "completion_attempts_exhausted", "system-fail-0002"),
  /BUSINESS_MANUFACTURING_ATTEMPTS_NOT_EXHAUSTED/,
);
assert.equal(snapshot(notExhausted), notExhaustedBefore);

const exhausted = baseState();
exhausted.job.leaseToken = null;
exhausted.job.leaseExpiresAt = null;
exhausted.job.attemptCount = exhausted.job.maxAttempts;
const failed = fail(exhausted, "completion_attempts_exhausted", `system:exhausted:${exhausted.job.key}`);
assert.equal(failed.replayed, false);
assert.equal(exhausted.job.status, "failed");
assert.equal(exhausted.job.resourceState, "released");
assert.equal(exhausted.warehouse["item.circuit"].quantity, 5);
const failedSnapshot = snapshot(exhausted);
assert.equal(
  fail(exhausted, "completion_attempts_exhausted", `system:exhausted:${exhausted.job.key}`).replayed,
  true,
);
assert.equal(snapshot(exhausted), failedSnapshot);

const wipConflict = baseState("queued");
wipConflict.wip["item.steel"].quantity = 9;
const wipBefore = snapshot(wipConflict);
assert.throws(
  () => cancel(wipConflict, "cancel-wip-conflict"),
  /BUSINESS_MANUFACTURING_WIP_QUANTITY_UNAVAILABLE/,
);
assert.equal(snapshot(wipConflict), wipBefore, "WIP release conflict rolls back every release.");

const laborConflict = baseState("queued");
laborConflict.labor[1].status = "consumed";
const laborBefore = snapshot(laborConflict);
assert.throws(
  () => cancel(laborConflict, "cancel-labor-conflict"),
  /BUSINESS_MANUFACTURING_LABOR_RELEASE_CONFLICT/,
);
assert.equal(snapshot(laborConflict), laborBefore, "Labor conflict rolls material reversal back.");

const equipmentConflict = baseState("queued");
equipmentConflict.equipment[1].status = "consumed";
const equipmentBefore = snapshot(equipmentConflict);
assert.throws(
  () => cancel(equipmentConflict, "cancel-equipment-conflict"),
  /BUSINESS_MANUFACTURING_EQUIPMENT_RELEASE_CONFLICT/,
);
assert.equal(snapshot(equipmentConflict), equipmentBefore);

const posterFailure = baseState("queued");
const posterBefore = snapshot(posterFailure);
assert.throws(
  () => cancel(posterFailure, "cancel-poster-failure", { posterFails: true }),
  /BUSINESS_MANUFACTURING_RESOURCE_RELEASE_POST_FAILED/,
);
assert.equal(snapshot(posterFailure), posterBefore, "Poster failure cannot release evidence or capacity.");

const completionWins = baseState();
completionWins.job.status = "completed";
completionWins.job.resourceState = "consumed";
completionWins.job.leaseToken = null;
completionWins.job.leaseExpiresAt = null;
const completionSnapshot = snapshot(completionWins);
assert.throws(
  () => cancel(completionWins, "cancel-after-complete"),
  /BUSINESS_MANUFACTURING_CANCEL_STATE_INVALID/,
);
assert.equal(snapshot(completionWins), completionSnapshot, "Cancellation cannot reverse completed output.");

console.log("Business Phase 6D exact-once recovery simulation: PASS");
