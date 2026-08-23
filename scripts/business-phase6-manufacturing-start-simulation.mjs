#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

function key(prefix, number) {
  return `${prefix}_${String(number).padStart(32, "0")}`;
}
function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function snapshot(state) {
  return structuredClone(state);
}
function restore(state, before) {
  for (const property of Object.keys(state)) delete state[property];
  Object.assign(state, before);
}

function reserveLabor(state, { employeeKey, period, minutes, source }) {
  const employee = state.employees.find((entry) => entry.key === employeeKey);
  if (!employee) throw new Error("BUSINESS_EMPLOYEE_NOT_ACTIVE");
  const used = state.laborReservations
    .filter((entry) => entry.employeeKey === employeeKey && entry.period === period)
    .filter((entry) => ["reserved", "active", "consumed"].includes(entry.status))
    .reduce((sum, entry) => sum + entry.minutes, 0);
  if (used + minutes > employee.capacity) throw new Error("BUSINESS_LABOR_CAPACITY_UNAVAILABLE");
  const reservation = {
    key: key("lrv", state.laborReservations.length + 1),
    employeeKey,
    period,
    minutes,
    source,
    status: "reserved",
  };
  state.laborReservations.push(reservation);
  return reservation;
}

function reserveEquipment(state, { installationKey, period, minutes, intent }) {
  const equipment = state.equipment.find((entry) => entry.key === installationKey);
  if (!equipment || equipment.status !== "installed") {
    throw new Error("BUSINESS_EQUIPMENT_INSTALLATION_UNAVAILABLE");
  }
  const used = state.equipmentReservations
    .filter((entry) => entry.installationKey === installationKey && entry.period === period)
    .filter((entry) => ["reserved", "active", "consumed"].includes(entry.status))
    .reduce((sum, entry) => sum + entry.minutes, 0);
  if (used + minutes > equipment.capacity) throw new Error("BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE");
  const reservation = {
    key: key("eqr", state.equipmentReservations.length + 1),
    installationKey,
    period,
    minutes,
    intent,
    status: "reserved",
  };
  state.equipmentReservations.push(reservation);
  return reservation;
}

function startJob(state, request) {
  const requestHash = hash({
    game: request.gameKey,
    player: request.playerKey,
    business: request.businessKey,
    product: request.productKey,
    recipe: request.recipeKey,
    output: request.outputItemKey,
    quantity: request.quantity,
    priority: request.priority,
  });
  const existing = state.jobs.find((job) =>
    job.gameKey === request.gameKey &&
    job.playerKey === request.playerKey &&
    job.idempotencyKey === request.idempotencyKey
  );
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new Error("BUSINESS_MANUFACTURING_IDEMPOTENCY_CONFLICT");
    }
    return { job: existing, replayed: true };
  }

  const before = snapshot(state);
  try {
    const jobKey = key("mfg", state.jobs.length + 1);
    const materialHolds = [];
    let materialBasis = 0;
    for (const input of [...request.inputs].sort((a, b) => a.itemKey.localeCompare(b.itemKey))) {
      const required = input.quantityPerUnit * request.quantity;
      const warehouse = state.warehouse[input.itemKey] ?? { quantity: 0, unitCost: 0 };
      if (warehouse.quantity < required) {
        throw new Error(`BUSINESS_MANUFACTURING_INPUT_UNAVAILABLE:${input.itemKey}`);
      }
      warehouse.quantity -= required;
      state.warehouse[input.itemKey] = warehouse;
      const wip = state.wip[input.itemKey] ?? { quantity: 0, totalBasis: 0 };
      wip.quantity += required;
      wip.totalBasis += required * warehouse.unitCost;
      state.wip[input.itemKey] = wip;
      materialBasis += required * warehouse.unitCost;
      materialHolds.push({ itemKey: input.itemKey, quantity: required, status: "held" });
    }

    const laborHolds = [];
    for (const requirement of request.laborRequirements) {
      let remaining = requirement.minutesPerUnit * request.quantity + requirement.fixedMinutes;
      let headcount = requirement.minimumHeadcount;
      for (const employee of state.employees
        .filter((entry) => entry.role === requirement.role && entry.skill >= requirement.minimumSkill)
        .sort((a, b) => a.key.localeCompare(b.key))) {
        if (remaining <= 0 && headcount <= 0) break;
        const used = state.laborReservations
          .filter((entry) => entry.employeeKey === employee.key && entry.period === request.payrollPeriod)
          .filter((entry) => ["reserved", "active", "consumed"].includes(entry.status))
          .reduce((sum, entry) => sum + entry.minutes, 0);
        const available = employee.capacity - used;
        if (available <= 0) continue;
        const allocated = headcount > 0
          ? Math.min(available, Math.max(1, remaining - (headcount - 1)))
          : Math.min(available, remaining);
        const reservation = reserveLabor(state, {
          employeeKey: employee.key,
          period: request.payrollPeriod,
          minutes: allocated,
          source: `${jobKey}:labor:${requirement.role}:${employee.key}`,
        });
        laborHolds.push({ reservationKey: reservation.key, minutes: allocated, status: "held" });
        remaining = Math.max(remaining - allocated, 0);
        if (headcount > 0) headcount -= 1;
      }
      if (remaining > 0 || headcount > 0) throw new Error("BUSINESS_LABOR_CAPACITY_UNAVAILABLE");
    }

    const equipmentHolds = [];
    for (const requirement of request.equipmentRequirements) {
      let remaining = requirement.minutesPerUnit * request.quantity + requirement.fixedMinutes;
      let instances = requirement.minimumInstances;
      for (const equipment of state.equipment
        .filter((entry) => entry.capabilities.includes(requirement.capability))
        .sort((a, b) => a.key.localeCompare(b.key))) {
        if (remaining <= 0 && instances <= 0) break;
        const used = state.equipmentReservations
          .filter((entry) => entry.installationKey === equipment.key && entry.period === request.equipmentPeriod)
          .filter((entry) => ["reserved", "active", "consumed"].includes(entry.status))
          .reduce((sum, entry) => sum + entry.minutes, 0);
        const available = equipment.capacity - used;
        if (available <= 0) continue;
        const allocated = instances > 0
          ? Math.min(available, Math.max(1, remaining - (instances - 1)))
          : Math.min(available, remaining);
        const reservation = reserveEquipment(state, {
          installationKey: equipment.key,
          period: request.equipmentPeriod,
          minutes: allocated,
          intent: `${jobKey}:equipment:${requirement.capability}`,
        });
        equipmentHolds.push({ reservationKey: reservation.key, minutes: allocated, status: "held" });
        remaining = Math.max(remaining - allocated, 0);
        if (instances > 0) instances -= 1;
      }
      if (remaining > 0 || instances > 0) throw new Error("BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE");
    }

    const job = {
      key: jobKey,
      gameKey: request.gameKey,
      playerKey: request.playerKey,
      businessKey: request.businessKey,
      productKey: request.productKey,
      recipeKey: request.recipeKey,
      outputItemKey: request.outputItemKey,
      quantity: request.quantity,
      outputQuantity: request.outputPerUnit * request.quantity,
      priority: request.priority,
      idempotencyKey: request.idempotencyKey,
      requestHash,
      status: "queued",
      resourceState: "reserved",
      materialHolds,
      laborHolds,
      equipmentHolds,
      materialBasis,
    };
    if (job.materialHolds.length !== request.inputs.length) {
      throw new Error("BUSINESS_MANUFACTURING_MATERIAL_MANIFEST_COUNT_INVALID");
    }
    if (job.laborHolds.length === 0) {
      throw new Error("BUSINESS_MANUFACTURING_LABOR_MANIFEST_TOTAL_INVALID");
    }
    state.jobs.push(job);
    return { job, replayed: false };
  } catch (error) {
    restore(state, before);
    throw error;
  }
}

function activateJob(state, jobKey) {
  const job = state.jobs.find((entry) => entry.key === jobKey);
  if (!job || job.status !== "queued") throw new Error("BUSINESS_MANUFACTURING_JOB_NOT_QUEUED");
  for (const hold of job.materialHolds) hold.status = "active";
  for (const hold of job.laborHolds) {
    hold.status = "active";
    state.laborReservations.find((entry) => entry.key === hold.reservationKey).status = "active";
  }
  for (const hold of job.equipmentHolds) {
    hold.status = "active";
    state.equipmentReservations.find((entry) => entry.key === hold.reservationKey).status = "active";
  }
  job.status = "in_progress";
}

const baseState = {
  warehouse: {
    "item.steel": { quantity: 100, unitCost: 4 },
    "item.fastener": { quantity: 100, unitCost: 1 },
  },
  wip: {},
  employees: [
    { key: key("emp", 2), role: "workforce.production.operator", skill: 8000, capacity: 300 },
    { key: key("emp", 1), role: "workforce.production.operator", skill: 9000, capacity: 300 },
  ],
  equipment: [
    { key: key("bei", 1), status: "installed", capacity: 480, capabilities: ["tool.fabricator"] },
  ],
  laborReservations: [],
  equipmentReservations: [],
  jobs: [],
};

const request = {
  gameKey: key("gam", 1),
  playerKey: key("ply", 1),
  businessKey: key("biz", 1),
  productKey: key("prd", 1),
  recipeKey: "recipe.fabricated_panel",
  outputItemKey: "item.fabricated_panel",
  outputPerUnit: 2,
  quantity: 10,
  priority: "standard",
  idempotencyKey: "manufacturing-start-0001",
  payrollPeriod: "payroll:1",
  equipmentPeriod: "equipment:1",
  inputs: [
    { itemKey: "item.steel", quantityPerUnit: 2 },
    { itemKey: "item.fastener", quantityPerUnit: 1 },
  ],
  laborRequirements: [
    {
      role: "workforce.production.operator",
      fixedMinutes: 0,
      minutesPerUnit: 20,
      minimumHeadcount: 1,
      minimumSkill: 7000,
    },
  ],
  equipmentRequirements: [
    {
      capability: "tool.fabricator",
      fixedMinutes: 0,
      minutesPerUnit: 30,
      minimumInstances: 1,
    },
  ],
};

const state = snapshot(baseState);
const first = startJob(state, request);
assert.equal(first.replayed, false);
assert.equal(first.job.status, "queued");
assert.equal(state.warehouse["item.steel"].quantity, 80);
assert.equal(state.warehouse["item.fastener"].quantity, 90);
assert.equal(state.wip["item.steel"].quantity, 20);
assert.equal(state.wip["item.fastener"].quantity, 10);
assert.equal(first.job.materialBasis, 90);
assert.equal(first.job.outputQuantity, 20);
assert.equal(first.job.laborHolds.reduce((sum, hold) => sum + hold.minutes, 0), 200);
assert.equal(first.job.equipmentHolds.reduce((sum, hold) => sum + hold.minutes, 0), 300);
assert.equal(first.job.laborHolds[0].reservationKey, key("lrv", 1));

const replay = startJob(state, request);
assert.equal(replay.replayed, true);
assert.equal(state.jobs.length, 1);
assert.equal(state.warehouse["item.steel"].quantity, 80);
assert.equal(state.laborReservations.length, first.job.laborHolds.length);
assert.equal(state.equipmentReservations.length, first.job.equipmentHolds.length);

assert.throws(
  () => startJob(state, { ...request, quantity: 11 }),
  /BUSINESS_MANUFACTURING_IDEMPOTENCY_CONFLICT/,
);

const materialFailure = snapshot(baseState);
materialFailure.warehouse["item.steel"].quantity = 1;
assert.throws(
  () => startJob(materialFailure, request),
  /BUSINESS_MANUFACTURING_INPUT_UNAVAILABLE/,
);
assert.deepEqual(materialFailure, { ...baseState, warehouse: { ...baseState.warehouse, "item.steel": { quantity: 1, unitCost: 4 } } });

const laborFailure = snapshot(baseState);
laborFailure.employees[0].capacity = 10;
laborFailure.employees[1].capacity = 10;
assert.throws(
  () => startJob(laborFailure, request),
  /BUSINESS_LABOR_CAPACITY_UNAVAILABLE/,
);
assert.equal(laborFailure.warehouse["item.steel"].quantity, 100, "Material transfer rolls back with labor failure.");
assert.equal(laborFailure.wip["item.steel"], undefined);
assert.equal(laborFailure.laborReservations.length, 0);

const equipmentFailure = snapshot(baseState);
equipmentFailure.equipment[0].capacity = 100;
assert.throws(
  () => startJob(equipmentFailure, request),
  /BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE/,
);
assert.equal(equipmentFailure.warehouse["item.steel"].quantity, 100, "All earlier holds roll back with equipment failure.");
assert.equal(equipmentFailure.laborReservations.length, 0);
assert.equal(equipmentFailure.equipmentReservations.length, 0);

activateJob(state, first.job.key);
assert.equal(first.job.status, "in_progress");
assert.ok(first.job.materialHolds.every((hold) => hold.status === "active"));
assert.ok(first.job.laborHolds.every((hold) => hold.status === "active"));
assert.ok(first.job.equipmentHolds.every((hold) => hold.status === "active"));
assert.ok(state.laborReservations.every((entry) => entry.status === "active"));
assert.ok(state.equipmentReservations.every((entry) => entry.status === "active"));

const competing = { ...request, idempotencyKey: "manufacturing-start-0002" };
assert.throws(
  () => startJob(state, competing),
  /BUSINESS_LABOR_CAPACITY_UNAVAILABLE|BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE/,
  "Active job capacity cannot be double-booked.",
);

console.log("Business Phase 6B atomic manufacturing start simulation: PASS");
