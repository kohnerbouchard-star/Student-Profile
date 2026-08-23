#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

function key(prefix, number) {
  return `${prefix}_${String(number).padStart(32, "0")}`;
}

function requestHash(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}

function queueManufacturing(state, request) {
  const hash = requestHash({
    gameKey: request.gameKey,
    playerKey: request.playerKey,
    businessKey: request.businessKey,
    productKey: request.productKey,
    recipeKey: request.recipeKey,
    outputItemKey: request.outputItemKey,
    quantity: request.quantity,
    priority: request.priority,
  });

  const existing = state.jobs.find((job) =>
    job.gameKey === request.gameKey &&
    job.playerKey === request.playerKey &&
    job.idempotencyKey === request.idempotencyKey
  );
  if (existing) {
    if (existing.requestHash !== hash) {
      throw new Error("BUSINESS_MANUFACTURING_IDEMPOTENCY_CONFLICT");
    }
    return { job: existing, replayed: true };
  }

  const before = clone(state);
  try {
    if (request.gameKey !== state.gameKey || request.businessKey !== state.businessKey) {
      throw new Error("BUSINESS_MANUFACTURING_SCOPE_INVALID");
    }
    if (!request.recipeOwned || !request.recipeAvailable) {
      throw new Error("BUSINESS_MANUFACTURING_RECIPE_UNAVAILABLE");
    }

    const job = {
      key: key("mfg", state.jobs.length + 1),
      gameKey: request.gameKey,
      playerKey: request.playerKey,
      businessKey: request.businessKey,
      productKey: request.productKey,
      recipeKey: request.recipeKey,
      outputItemKey: request.outputItemKey,
      idempotencyKey: request.idempotencyKey,
      requestHash: hash,
      quantity: request.quantity,
      priority: request.priority,
      status: "queued",
      resourceState: "reserved",
      materialHolds: [],
      laborHolds: [],
      equipmentHolds: [],
    };

    for (const input of request.inputs.toSorted((left, right) => left.lineKey.localeCompare(right.lineKey))) {
      const needed = input.quantityPerUnit * request.quantity;
      const warehouse = state.materials[input.itemKey] ?? 0;
      if (warehouse < needed) {
        throw new Error(`BUSINESS_MANUFACTURING_INPUT_UNAVAILABLE:${input.itemKey}`);
      }
      state.materials[input.itemKey] = warehouse - needed;
      state.wip[input.itemKey] = (state.wip[input.itemKey] ?? 0) + needed;
      job.materialHolds.push({ lineKey: input.lineKey, itemKey: input.itemKey, quantity: needed });
    }

    for (const requirement of request.laborRequirements.toSorted((left, right) => left.roleKey.localeCompare(right.roleKey))) {
      let remaining = requirement.minutes;
      let headcountRemaining = requirement.minimumHeadcount;
      const candidates = state.employees
        .filter((employee) => employee.roleKey === requirement.roleKey && employee.skill >= requirement.minimumSkill)
        .toSorted((left, right) => left.key.localeCompare(right.key));
      for (const employee of candidates) {
        if (remaining <= 0 && headcountRemaining <= 0) break;
        const available = employee.capacity - employee.committed;
        if (available <= 0) continue;
        const allocate = headcountRemaining > 0
          ? Math.min(available, Math.max(1, remaining - (headcountRemaining - 1)))
          : Math.min(available, remaining);
        if (allocate <= 0) continue;
        employee.committed += allocate;
        remaining = Math.max(remaining - allocate, 0);
        headcountRemaining = Math.max(headcountRemaining - 1, 0);
        job.laborHolds.push({ employeeKey: employee.key, minutes: allocate });
      }
      if (remaining > 0 || headcountRemaining > 0) {
        throw new Error(`BUSINESS_LABOR_CAPACITY_UNAVAILABLE:${requirement.roleKey}`);
      }
    }

    for (const requirement of request.equipmentRequirements.toSorted((left, right) => left.capability.localeCompare(right.capability))) {
      let remaining = requirement.minutes;
      let instancesRemaining = requirement.minimumInstances;
      const candidates = state.equipment
        .filter((equipment) => equipment.capabilities.includes(requirement.capability) && equipment.status === "installed")
        .toSorted((left, right) => left.key.localeCompare(right.key));
      for (const equipment of candidates) {
        if (remaining <= 0 && instancesRemaining <= 0) break;
        const available = equipment.capacity - equipment.committed;
        if (available <= 0) continue;
        const allocate = instancesRemaining > 0
          ? Math.min(available, Math.max(1, remaining - (instancesRemaining - 1)))
          : Math.min(available, remaining);
        if (allocate <= 0) continue;
        equipment.committed += allocate;
        remaining = Math.max(remaining - allocate, 0);
        instancesRemaining = Math.max(instancesRemaining - 1, 0);
        job.equipmentHolds.push({ equipmentKey: equipment.key, minutes: allocate });
      }
      if (remaining > 0 || instancesRemaining > 0) {
        throw new Error(`BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE:${requirement.capability}`);
      }
    }

    if (job.materialHolds.length === 0) {
      throw new Error("BUSINESS_MANUFACTURING_MATERIAL_HOLD_MISSING");
    }

    state.jobs.push(job);
    return { job, replayed: false };
  } catch (error) {
    Object.assign(state, before);
    throw error;
  }
}

function baseState() {
  return {
    gameKey: key("gam", 1),
    businessKey: key("biz", 1),
    materials: { steel: 20, resin: 10 },
    wip: {},
    employees: [
      { key: key("emp", 1), roleKey: "workforce.fabrication", skill: 8000, capacity: 480, committed: 0 },
      { key: key("emp", 2), roleKey: "workforce.fabrication", skill: 7000, capacity: 480, committed: 0 },
    ],
    equipment: [
      { key: key("bei", 1), capabilities: ["tool.fabricator"], capacity: 480, committed: 0, status: "installed" },
      { key: key("bei", 2), capabilities: ["tool.fabricator"], capacity: 480, committed: 0, status: "installed" },
    ],
    jobs: [],
  };
}

function request(overrides = {}) {
  return {
    gameKey: key("gam", 1),
    playerKey: key("ply", 1),
    businessKey: key("biz", 1),
    productKey: key("prd", 1),
    recipeKey: "recipe.fabricated.panel",
    outputItemKey: key("itm", 1),
    quantity: 2,
    priority: "standard",
    idempotencyKey: "manufacturing-queue-first",
    recipeOwned: true,
    recipeAvailable: true,
    inputs: [
      { lineKey: "input.steel", itemKey: "steel", quantityPerUnit: 4 },
      { lineKey: "input.resin", itemKey: "resin", quantityPerUnit: 2 },
    ],
    laborRequirements: [
      { roleKey: "workforce.fabrication", minutes: 600, minimumHeadcount: 2, minimumSkill: 6000 },
    ],
    equipmentRequirements: [
      { capability: "tool.fabricator", minutes: 600, minimumInstances: 2 },
    ],
    ...overrides,
  };
}

const state = baseState();
const first = queueManufacturing(state, request());
assert.equal(first.replayed, false);
assert.equal(first.job.status, "queued");
assert.equal(first.job.resourceState, "reserved");
assert.equal(state.materials.steel, 12);
assert.equal(state.materials.resin, 6);
assert.equal(state.wip.steel, 8);
assert.equal(state.wip.resin, 4);
assert.equal(first.job.laborHolds.length, 2);
assert.equal(first.job.equipmentHolds.length, 2);
assert.equal(state.employees.reduce((sum, row) => sum + row.committed, 0), 600);
assert.equal(state.equipment.reduce((sum, row) => sum + row.committed, 0), 600);

const replay = queueManufacturing(state, request());
assert.equal(replay.replayed, true);
assert.equal(state.jobs.length, 1);
assert.equal(state.wip.steel, 8, "Idempotency replay cannot move materials twice.");
assert.equal(state.employees.reduce((sum, row) => sum + row.committed, 0), 600);
assert.equal(state.equipment.reduce((sum, row) => sum + row.committed, 0), 600);

assert.throws(
  () => queueManufacturing(state, request({ quantity: 3 })),
  /BUSINESS_MANUFACTURING_IDEMPOTENCY_CONFLICT/,
);

const materialFailure = baseState();
materialFailure.materials.steel = 1;
const materialBefore = clone(materialFailure);
assert.throws(
  () => queueManufacturing(materialFailure, request()),
  /BUSINESS_MANUFACTURING_INPUT_UNAVAILABLE/,
);
assert.deepEqual(materialFailure, materialBefore, "Material failure must roll back every hold.");

const laborFailure = baseState();
laborFailure.employees[1].committed = 480;
const laborBefore = clone(laborFailure);
assert.throws(
  () => queueManufacturing(laborFailure, request()),
  /BUSINESS_LABOR_CAPACITY_UNAVAILABLE/,
);
assert.deepEqual(laborFailure, laborBefore, "Labor failure must roll back Warehouse -> WIP movement.");

const equipmentFailure = baseState();
equipmentFailure.equipment[1].status = "offline";
const equipmentBefore = clone(equipmentFailure);
assert.throws(
  () => queueManufacturing(equipmentFailure, request()),
  /BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE/,
);
assert.deepEqual(equipmentFailure, equipmentBefore, "Equipment failure must roll back materials and labor.");

const doubleBook = baseState();
queueManufacturing(doubleBook, request());
assert.throws(
  () => queueManufacturing(doubleBook, request({
    idempotencyKey: "manufacturing-queue-second",
    productKey: key("prd", 2),
  })),
  /BUSINESS_(LABOR|EQUIPMENT)_CAPACITY_UNAVAILABLE/,
  "A second job cannot claim already committed finite capacity.",
);
assert.equal(doubleBook.jobs.length, 1);

const crossGame = baseState();
assert.throws(
  () => queueManufacturing(crossGame, request({
    gameKey: key("gam", 2),
    idempotencyKey: "manufacturing-cross-game",
  })),
  /BUSINESS_MANUFACTURING_SCOPE_INVALID/,
);
assert.equal(crossGame.jobs.length, 0);

console.log("Business Phase 6B atomic manufacturing resource hold simulation: PASS");
