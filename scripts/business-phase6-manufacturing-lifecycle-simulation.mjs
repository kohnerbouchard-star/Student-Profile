#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

function key(prefix, number) {
  return `${prefix}_${String(number).padStart(32, "0")}`;
}

function createJob({ number, resourcesReserved = true, durationSeconds = 600 }) {
  if (!resourcesReserved) throw new Error("BUSINESS_MANUFACTURING_RESOURCES_NOT_RESERVED");
  return {
    key: key("mfg", number),
    gameKey: key("gam", 1),
    businessKey: key("biz", 1),
    status: "queued",
    resourceState: "reserved",
    durationSeconds,
    queueAvailableAt: 1_000,
    startedAt: null,
    completesAt: null,
    completedAt: null,
    cancelledAt: null,
    failedAt: null,
    attemptCount: 0,
    maxAttempts: 3,
    nextAttemptAt: 1_000,
    leaseToken: null,
    leaseExpiresAt: null,
    lastErrorCode: null,
    transitions: [],
  };
}

function validate(job) {
  if (job.status === "queued") {
    assert.equal(job.resourceState, "reserved");
    assert.equal(job.startedAt, null);
    assert.equal(job.completesAt, null);
    assert.equal(job.leaseToken, null);
  } else if (job.status === "in_progress") {
    assert.equal(job.resourceState, "reserved");
    assert.ok(job.startedAt !== null);
    assert.ok(job.completesAt > job.startedAt);
  } else if (job.status === "completed") {
    assert.equal(job.resourceState, "consumed");
    assert.ok(job.completedAt !== null);
    assert.equal(job.leaseToken, null);
  } else if (job.status === "cancelled") {
    assert.equal(job.resourceState, "released");
    assert.ok(job.cancelledAt !== null);
    assert.equal(job.leaseToken, null);
  } else if (job.status === "failed") {
    assert.equal(job.resourceState, "released");
    assert.ok(job.failedAt !== null);
    assert.equal(job.leaseToken, null);
  } else {
    throw new Error("BUSINESS_MANUFACTURING_STATUS_INVALID");
  }
}

function startQueued(jobs, now, batchSize) {
  return jobs
    .filter((job) => job.status === "queued" && job.queueAvailableAt <= now)
    .sort((left, right) =>
      left.queueAvailableAt - right.queueAvailableAt || left.key.localeCompare(right.key)
    )
    .slice(0, batchSize)
    .map((job) => {
      job.status = "in_progress";
      job.startedAt = now;
      job.completesAt = now + job.durationSeconds;
      job.transitions.push({ from: "queued", to: "in_progress", key: `system:start:${job.key}` });
      validate(job);
      return job;
    });
}

function claimDue(jobs, now, batchSize, leaseSeconds) {
  return jobs
    .filter((job) =>
      job.status === "in_progress" &&
      job.resourceState === "reserved" &&
      job.completesAt <= now &&
      job.nextAttemptAt <= now &&
      job.attemptCount < job.maxAttempts &&
      (job.leaseToken === null || job.leaseExpiresAt <= now)
    )
    .sort((left, right) =>
      left.completesAt - right.completesAt || left.key.localeCompare(right.key)
    )
    .slice(0, batchSize)
    .map((job) => {
      job.attemptCount += 1;
      job.leaseToken = randomUUID();
      job.leaseExpiresAt = now + leaseSeconds;
      validate(job);
      return { job, leaseToken: job.leaseToken };
    });
}

function releaseLease(job, token, now, retryAfter, errorCode) {
  if (
    job.status !== "in_progress" ||
    job.leaseToken !== token ||
    job.leaseExpiresAt === null ||
    job.leaseExpiresAt <= now
  ) {
    throw new Error("BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID");
  }
  job.leaseToken = null;
  job.leaseExpiresAt = null;
  job.nextAttemptAt = now + retryAfter;
  job.lastErrorCode = errorCode;
  validate(job);
}

function settle(job, token, now, outcome) {
  if (
    job.status !== "in_progress" ||
    job.completesAt > now ||
    job.leaseToken !== token ||
    job.leaseExpiresAt === null ||
    job.leaseExpiresAt <= now
  ) {
    throw new Error("BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID");
  }
  if (outcome === "completed") {
    job.resourceState = "consumed";
    job.status = "completed";
    job.completedAt = now;
  } else if (outcome === "failed") {
    job.resourceState = "released";
    job.status = "failed";
    job.failedAt = now;
  } else if (outcome === "cancelled") {
    job.resourceState = "released";
    job.status = "cancelled";
    job.cancelledAt = now;
  } else {
    throw new Error("BUSINESS_MANUFACTURING_OUTCOME_INVALID");
  }
  job.leaseToken = null;
  job.leaseExpiresAt = null;
  job.transitions.push({ from: "in_progress", to: outcome, key: `system:settle:${job.key}:${outcome}` });
  validate(job);
}

const jobs = [
  createJob({ number: 2, durationSeconds: 300 }),
  createJob({ number: 1, durationSeconds: 600 }),
];
assert.throws(
  () => createJob({ number: 3, resourcesReserved: false }),
  /BUSINESS_MANUFACTURING_RESOURCES_NOT_RESERVED/,
);

const started = startQueued(jobs, 1_100, 10);
assert.deepEqual(started.map((job) => job.key), [key("mfg", 1), key("mfg", 2)]);
assert.equal(startQueued(jobs, 1_100, 10).length, 0, "A queued job starts only once.");
assert.equal(jobs[0].completesAt, 1_400);
assert.equal(jobs[1].completesAt, 1_700);

assert.equal(claimDue(jobs, 1_399, 10, 90).length, 0, "A job cannot be leased before server due time.");
const firstClaim = claimDue(jobs, 1_400, 10, 90);
assert.equal(firstClaim.length, 1);
assert.equal(firstClaim[0].job.key, key("mfg", 2));
assert.equal(claimDue(jobs, 1_400, 10, 90).length, 0, "An unexpired lease is exclusive.");

const staleToken = firstClaim[0].leaseToken;
assert.throws(
  () => releaseLease(firstClaim[0].job, randomUUID(), 1_450, 60, "transient_worker_error"),
  /BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID/,
);
releaseLease(firstClaim[0].job, staleToken, 1_450, 60, "transient_worker_error");
assert.equal(claimDue(jobs, 1_509, 10, 90).length, 0, "Retry backoff is server enforced.");

const retryClaim = claimDue(jobs, 1_510, 10, 90);
assert.equal(retryClaim.length, 1);
assert.notEqual(retryClaim[0].leaseToken, staleToken);
assert.throws(
  () => settle(retryClaim[0].job, staleToken, 1_520, "completed"),
  /BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID/,
  "A stale worker cannot settle a reclaimed job.",
);
settle(retryClaim[0].job, retryClaim[0].leaseToken, 1_520, "completed");
assert.equal(retryClaim[0].job.resourceState, "consumed");
assert.equal(claimDue(jobs, 2_000, 10, 90).length, 1, "Only the remaining due job is claimable.");

const finalJob = jobs.find((job) => job.status === "in_progress");
assert.ok(finalJob);
const finalToken = finalJob.leaseToken;
settle(finalJob, finalToken, 2_000, "failed");
assert.equal(finalJob.resourceState, "released");
assert.throws(
  () => settle(finalJob, finalToken, 2_001, "completed"),
  /BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID/,
  "Terminal settlement cannot be repeated into another outcome.",
);

const exhausted = createJob({ number: 4, durationSeconds: 1 });
startQueued([exhausted], 3_000, 1);
exhausted.attemptCount = exhausted.maxAttempts;
assert.equal(claimDue([exhausted], 3_100, 1, 90).length, 0);
assert.equal(exhausted.status, "in_progress");
assert.equal(exhausted.resourceState, "reserved");

console.log("Business Phase 6A timed manufacturing lifecycle simulation: PASS");
