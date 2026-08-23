#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

const hash = (value) => createHash("sha256").update(value).digest("hex");

function complete(job, state, leaseToken, now) {
  const tokenHash = hash(leaseToken);
  if (job.status === "completed") {
    if (job.completionTokenHash !== tokenHash) throw new Error("BUSINESS_MANUFACTURING_COMPLETION_REPLAY_CONFLICT");
    return { ...job.receipt, replayed: true };
  }
  if (
    job.status !== "in_progress" || job.resourceState !== "reserved" ||
    job.completesAt > now || job.leaseToken !== leaseToken || job.leaseExpiresAt <= now
  ) throw new Error("BUSINESS_MANUFACTURING_COMPLETION_LEASE_INVALID");

  const before = structuredClone({ job, state });
  try {
    if (!job.materials.length || job.materials.some((row) => row.status !== "staged")) {
      throw new Error("BUSINESS_MANUFACTURING_MATERIAL_HOLD_MISSING");
    }
    if (!job.labor.length || job.labor.some((row) => !["reserved", "active"].includes(row.status))) {
      throw new Error("BUSINESS_MANUFACTURING_LABOR_HOLD_CONFLICT");
    }
    if (job.equipment.some((row) => !["reserved", "active"].includes(row.status))) {
      throw new Error("BUSINESS_MANUFACTURING_EQUIPMENT_HOLD_CONFLICT");
    }
    let materialCost = 0;
    for (const material of job.materials) {
      if ((state.wip[material.item] ?? 0) < material.quantity) throw new Error("BUSINESS_MANUFACTURING_WIP_QUANTITY_UNAVAILABLE");
      state.wip[material.item] -= material.quantity;
      materialCost += material.quantity * material.unitCost;
      material.status = "consumed";
    }
    const laborCost = job.labor.reduce((sum, row) => sum + row.wage * row.minutes / row.capacity, 0);
    for (const row of job.labor) {
      row.status = "consumed";
      row.costBasis = row.wage * row.minutes / row.capacity;
    }
    for (const row of job.equipment) row.status = "consumed";
    const outputQuantity = job.outputPerUnit * job.quantity;
    const totalCost = materialCost + laborCost;
    const unitCost = totalCost / outputQuantity;
    state.finishedGoods[job.output] = (state.finishedGoods[job.output] ?? 0) + outputQuantity;
    job.status = "completed";
    job.resourceState = "consumed";
    job.completedAt = now;
    job.leaseToken = null;
    job.leaseExpiresAt = null;
    job.completionTokenHash = tokenHash;
    job.receipt = { outputQuantity, materialCost, laborCost, totalCost, unitCost, replayed: false };
    return job.receipt;
  } catch (error) {
    Object.assign(job, before.job);
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, before.state);
    throw error;
  }
}

const lease = randomUUID();
const job = {
  status: "in_progress",
  resourceState: "reserved",
  completesAt: 100,
  leaseToken: lease,
  leaseExpiresAt: 200,
  quantity: 10,
  output: "panel",
  outputPerUnit: 2,
  materials: [
    { item: "steel", quantity: 20, unitCost: 4, status: "staged" },
    { item: "bolts", quantity: 10, unitCost: 1, status: "staged" },
  ],
  labor: [{ minutes: 200, wage: 60, capacity: 300, status: "active" }],
  equipment: [{ minutes: 300, status: "active" }],
};
const state = { wip: { steel: 20, bolts: 10 }, finishedGoods: {} };
assert.throws(() => complete(job, state, lease, 99), /COMPLETION_LEASE_INVALID/);
assert.throws(() => complete(job, state, randomUUID(), 120), /COMPLETION_LEASE_INVALID/);
const receipt = complete(job, state, lease, 120);
assert.equal(receipt.outputQuantity, 20);
assert.equal(receipt.materialCost, 90);
assert.equal(receipt.laborCost, 40);
assert.equal(receipt.totalCost, 130);
assert.equal(receipt.unitCost, 6.5);
assert.equal(state.wip.steel, 0);
assert.equal(state.finishedGoods.panel, 20);
assert.equal(job.resourceState, "consumed");
assert.equal(complete(job, state, lease, 130).replayed, true);
assert.equal(state.finishedGoods.panel, 20, "Replay cannot duplicate Finished Goods.");
assert.throws(() => complete(job, state, randomUUID(), 130), /REPLAY_CONFLICT/);

const broken = structuredClone(job);
broken.status = "in_progress";
broken.resourceState = "reserved";
broken.completedAt = null;
broken.completionTokenHash = null;
broken.receipt = null;
broken.leaseToken = lease;
broken.leaseExpiresAt = 200;
broken.materials[0].status = "staged";
broken.materials[1].status = "staged";
broken.labor[0].status = "active";
broken.equipment[0].status = "active";
const brokenState = { wip: { steel: 1, bolts: 10 }, finishedGoods: {} };
assert.throws(() => complete(broken, brokenState, lease, 120), /WIP_QUANTITY_UNAVAILABLE/);
assert.deepEqual(brokenState, { wip: { steel: 1, bolts: 10 }, finishedGoods: {} });
assert.equal(broken.status, "in_progress");

console.log("Business Phase 6C exact-once manufacturing completion simulation: PASS");
