#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

function clone(value) {
  return structuredClone(value);
}
function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function complete(state, { jobKey, leaseToken, now }) {
  const job = state.jobs.find((entry) => entry.key === jobKey);
  if (!job) throw new Error("BUSINESS_MANUFACTURING_JOB_NOT_FOUND");
  const leaseHash = hash(leaseToken);

  if (job.status === "completed") {
    const receipt = state.receipts.find((entry) => entry.jobKey === job.key);
    if (!receipt || receipt.leaseHash !== leaseHash || job.receiptHash !== leaseHash) {
      throw new Error("BUSINESS_MANUFACTURING_COMPLETION_REPLAY_CONFLICT");
    }
    return { job, receipt, replayed: true };
  }

  if (
    job.status !== "in_progress" ||
    job.resourceState !== "reserved" ||
    job.completesAt > now ||
    job.leaseToken !== leaseToken ||
    job.leaseExpiresAt <= now
  ) {
    throw new Error("BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID");
  }

  const before = clone(state);
  try {
    if (job.outputs.length !== 1) {
      throw new Error("BUSINESS_MANUFACTURING_MULTI_OUTPUT_UNSUPPORTED");
    }

    const outputQuantity = job.outputs[0].baseQuantity * job.quantity;
    const materialHolds = state.materialHolds
      .filter((hold) => hold.jobKey === job.key && hold.status === "held")
      .toSorted((left, right) =>
        left.lineKey.localeCompare(right.lineKey) || left.key.localeCompare(right.key)
      );
    if (materialHolds.length === 0) {
      throw new Error("BUSINESS_MANUFACTURING_MATERIAL_HOLD_MISSING");
    }

    const currencies = new Set(materialHolds.map((hold) => hold.currency));
    if (currencies.size !== 1 || !currencies.has(job.currency)) {
      throw new Error("BUSINESS_MANUFACTURING_COST_CURRENCY_MISMATCH");
    }

    let materialCost = 0;
    for (const hold of materialHolds) {
      const available = state.wip[hold.itemKey] ?? 0;
      if (available < hold.quantity) {
        throw new Error(`BUSINESS_MANUFACTURING_WIP_HOLDING_INVALID:${hold.lineKey}`);
      }
      state.wip[hold.itemKey] = available - hold.quantity;
      materialCost += hold.unitCost * hold.quantity;
    }

    const laborHolds = state.laborHolds.filter((hold) => hold.jobKey === job.key);
    const equipmentHolds = state.equipmentHolds.filter((hold) => hold.jobKey === job.key);
    const laborCost = laborHolds.reduce((sum, hold) => sum + hold.allocatedCost, 0);

    for (const hold of laborHolds.toSorted((a, b) => a.reservationKey.localeCompare(b.reservationKey))) {
      const reservation = state.laborReservations.find((entry) => entry.key === hold.reservationKey);
      if (!reservation || !["reserved", "active"].includes(reservation.status)) {
        throw new Error("BUSINESS_MANUFACTURING_LABOR_HOLD_INVALID");
      }
      reservation.status = "consumed";
      reservation.consumedAt = now;
    }

    for (const hold of equipmentHolds.toSorted((a, b) => a.reservationKey.localeCompare(b.reservationKey))) {
      const reservation = state.equipmentReservations.find((entry) => entry.key === hold.reservationKey);
      if (!reservation || !["reserved", "active"].includes(reservation.status)) {
        throw new Error("BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_INVALID");
      }
      reservation.status = "consumed";
      reservation.consumedAt = now;
    }

    const totalCost = Number((materialCost + laborCost).toFixed(2));
    const unitCost = Number((totalCost / outputQuantity).toFixed(6));
    state.finishedGoods[job.outputItemKey] =
      (state.finishedGoods[job.outputItemKey] ?? 0) + outputQuantity;

    for (const hold of materialHolds) {
      hold.status = "consumed";
      hold.consumedAt = now;
    }

    const receipt = {
      key: `mcr_${String(state.receipts.length + 1).padStart(32, "0")}`,
      jobKey: job.key,
      outputItemKey: job.outputItemKey,
      outputQuantity,
      materialCost: Number(materialCost.toFixed(2)),
      laborCost: Number(laborCost.toFixed(2)),
      totalCost,
      unitCost,
      currency: job.currency,
      leaseHash,
      completedAt: now,
    };
    state.receipts.push(receipt);

    job.status = "completed";
    job.resourceState = "consumed";
    job.outputQuantity = outputQuantity;
    job.materialCost = receipt.materialCost;
    job.laborCost = receipt.laborCost;
    job.totalCost = receipt.totalCost;
    job.unitCost = receipt.unitCost;
    job.receiptHash = leaseHash;
    job.completedAt = now;
    job.leaseToken = null;
    job.leaseExpiresAt = null;

    return { job, receipt, replayed: false };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
}

function baseState() {
  const leaseToken = randomUUID();
  return {
    leaseToken,
    jobs: [{
      key: "mfg_00000000000000000000000000000001",
      status: "in_progress",
      resourceState: "reserved",
      completesAt: 1_000,
      leaseToken,
      leaseExpiresAt: 1_200,
      quantity: 2,
      currency: "USD",
      outputItemKey: "item.finished.panel",
      outputs: [{ baseQuantity: 3 }],
      receiptHash: null,
    }],
    wip: { steel: 8, resin: 4 },
    finishedGoods: {},
    materialHolds: [
      { key: "mmh_02", jobKey: "mfg_00000000000000000000000000000001", lineKey: "input.steel", itemKey: "steel", quantity: 8, unitCost: 2.5, currency: "USD", status: "held" },
      { key: "mmh_01", jobKey: "mfg_00000000000000000000000000000001", lineKey: "input.resin", itemKey: "resin", quantity: 4, unitCost: 1.25, currency: "USD", status: "held" },
    ],
    laborHolds: [
      { jobKey: "mfg_00000000000000000000000000000001", reservationKey: "lab_02", allocatedCost: 7.5 },
      { jobKey: "mfg_00000000000000000000000000000001", reservationKey: "lab_01", allocatedCost: 12.5 },
    ],
    equipmentHolds: [
      { jobKey: "mfg_00000000000000000000000000000001", reservationKey: "eqr_02" },
      { jobKey: "mfg_00000000000000000000000000000001", reservationKey: "eqr_01" },
    ],
    laborReservations: [
      { key: "lab_01", status: "reserved", consumedAt: null },
      { key: "lab_02", status: "active", consumedAt: null },
    ],
    equipmentReservations: [
      { key: "eqr_01", status: "reserved", consumedAt: null },
      { key: "eqr_02", status: "active", consumedAt: null },
    ],
    receipts: [],
  };
}

const state = baseState();
assert.throws(
  () => complete(state, { jobKey: state.jobs[0].key, leaseToken: randomUUID(), now: 1_050 }),
  /BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID/,
);
assert.throws(
  () => complete(state, { jobKey: state.jobs[0].key, leaseToken: state.leaseToken, now: 999 }),
  /BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID/,
);

const first = complete(state, {
  jobKey: state.jobs[0].key,
  leaseToken: state.leaseToken,
  now: 1_050,
});
assert.equal(first.replayed, false);
assert.equal(first.job.status, "completed");
assert.equal(first.job.resourceState, "consumed");
assert.equal(first.receipt.outputQuantity, 6);
assert.equal(first.receipt.materialCost, 25);
assert.equal(first.receipt.laborCost, 20);
assert.equal(first.receipt.totalCost, 45);
assert.equal(first.receipt.unitCost, 7.5);
assert.equal(state.wip.steel, 0);
assert.equal(state.wip.resin, 0);
assert.equal(state.finishedGoods["item.finished.panel"], 6);
assert.ok(state.materialHolds.every((hold) => hold.status === "consumed"));
assert.ok(state.laborReservations.every((row) => row.status === "consumed"));
assert.ok(state.equipmentReservations.every((row) => row.status === "consumed"));

const replay = complete(state, {
  jobKey: state.jobs[0].key,
  leaseToken: state.leaseToken,
  now: 1_060,
});
assert.equal(replay.replayed, true);
assert.equal(state.receipts.length, 1);
assert.equal(state.finishedGoods["item.finished.panel"], 6);
assert.throws(
  () => complete(state, { jobKey: state.jobs[0].key, leaseToken: randomUUID(), now: 1_060 }),
  /BUSINESS_MANUFACTURING_COMPLETION_REPLAY_CONFLICT/,
);

const wipFailure = baseState();
wipFailure.wip.steel = 1;
const wipBefore = clone(wipFailure);
assert.throws(
  () => complete(wipFailure, { jobKey: wipFailure.jobs[0].key, leaseToken: wipFailure.leaseToken, now: 1_050 }),
  /BUSINESS_MANUFACTURING_WIP_HOLDING_INVALID/,
);
assert.deepEqual(wipFailure, wipBefore, "WIP failure must roll back every settlement mutation.");

const laborFailure = baseState();
laborFailure.laborReservations[1].status = "released";
const laborBefore = clone(laborFailure);
assert.throws(
  () => complete(laborFailure, { jobKey: laborFailure.jobs[0].key, leaseToken: laborFailure.leaseToken, now: 1_050 }),
  /BUSINESS_MANUFACTURING_LABOR_HOLD_INVALID/,
);
assert.deepEqual(laborFailure, laborBefore, "Labor failure must roll back WIP and output.");

const equipmentFailure = baseState();
equipmentFailure.equipmentReservations[1].status = "consumed";
const equipmentBefore = clone(equipmentFailure);
assert.throws(
  () => complete(equipmentFailure, { jobKey: equipmentFailure.jobs[0].key, leaseToken: equipmentFailure.leaseToken, now: 1_050 }),
  /BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_INVALID/,
);
assert.deepEqual(equipmentFailure, equipmentBefore, "Equipment failure must roll back all earlier settlement.");

const currencyFailure = baseState();
currencyFailure.materialHolds[0].currency = "EUR";
const currencyBefore = clone(currencyFailure);
assert.throws(
  () => complete(currencyFailure, { jobKey: currencyFailure.jobs[0].key, leaseToken: currencyFailure.leaseToken, now: 1_050 }),
  /BUSINESS_MANUFACTURING_COST_CURRENCY_MISMATCH/,
);
assert.deepEqual(currencyFailure, currencyBefore);

const multiOutput = baseState();
multiOutput.jobs[0].outputs.push({ baseQuantity: 1 });
assert.throws(
  () => complete(multiOutput, { jobKey: multiOutput.jobs[0].key, leaseToken: multiOutput.leaseToken, now: 1_050 }),
  /BUSINESS_MANUFACTURING_MULTI_OUTPUT_UNSUPPORTED/,
);

console.log("Business Phase 6C exact-once completion simulation: PASS");
