#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const copy = (value) => structuredClone(value);

function start(state, request) {
  const requestHash = digest({
    game: request.game,
    player: request.player,
    business: request.business,
    product: request.product,
    recipe: request.recipe,
    output: request.output,
    quantity: request.quantity,
    priority: request.priority,
  });
  const replay = state.jobs.find((job) => job.player === request.player && job.idempotencyKey === request.idempotencyKey);
  if (replay) {
    if (replay.requestHash !== requestHash) throw new Error("BUSINESS_MANUFACTURING_IDEMPOTENCY_CONFLICT");
    return { job: replay, replayed: true };
  }

  const before = copy(state);
  try {
    const key = `mfg_${String(state.jobs.length + 1).padStart(32, "0")}`;
    const materials = [];
    for (const input of [...request.inputs].sort((a, b) => a.item.localeCompare(b.item))) {
      const required = input.perUnit * request.quantity;
      if ((state.warehouse[input.item] ?? 0) < required) throw new Error("BUSINESS_MANUFACTURING_INPUT_QUANTITY_UNAVAILABLE");
      state.warehouse[input.item] -= required;
      state.wip[input.item] = (state.wip[input.item] ?? 0) + required;
      materials.push({ item: input.item, quantity: required, status: "staged" });
    }

    const labor = [];
    for (const requirement of request.labor) {
      let remaining = requirement.fixed + requirement.perUnit * request.quantity;
      let headcount = requirement.headcount;
      const employees = state.employees
        .filter((employee) => employee.role === requirement.role && employee.skill >= requirement.skill)
        .sort((a, b) => a.key.localeCompare(b.key));
      for (const employee of employees) {
        if (remaining <= 0 && headcount <= 0) break;
        const used = state.laborReservations
          .filter((reservation) => reservation.employee === employee.key && ["reserved", "active", "consumed"].includes(reservation.status))
          .reduce((sum, reservation) => sum + reservation.minutes, 0);
        const available = employee.capacity - used;
        if (available <= 0) continue;
        const minutes = headcount > 0
          ? Math.min(available, Math.max(1, remaining - (headcount - 1)))
          : Math.min(available, remaining);
        state.laborReservations.push({ job: key, employee: employee.key, minutes, status: "reserved" });
        labor.push({ employee: employee.key, minutes });
        remaining = Math.max(remaining - minutes, 0);
        if (headcount > 0) headcount -= 1;
      }
      if (remaining > 0 || headcount > 0) throw new Error("BUSINESS_MANUFACTURING_LABOR_CAPACITY_UNAVAILABLE");
    }

    const equipment = [];
    for (const requirement of request.equipment) {
      let remaining = requirement.fixed + requirement.perUnit * request.quantity;
      let instances = requirement.instances;
      const installations = state.installations
        .filter((installation) => installation.capabilities.includes(requirement.capability))
        .sort((a, b) => a.key.localeCompare(b.key));
      for (const installation of installations) {
        if (remaining <= 0 && instances <= 0) break;
        const used = state.equipmentReservations
          .filter((reservation) => reservation.installation === installation.key && ["reserved", "active", "consumed"].includes(reservation.status))
          .reduce((sum, reservation) => sum + reservation.minutes, 0);
        const available = installation.capacity - used;
        if (available <= 0) continue;
        const minutes = instances > 0
          ? Math.min(available, Math.max(1, remaining - (instances - 1)))
          : Math.min(available, remaining);
        state.equipmentReservations.push({ job: key, installation: installation.key, minutes, status: "reserved" });
        equipment.push({ installation: installation.key, minutes });
        remaining = Math.max(remaining - minutes, 0);
        if (instances > 0) instances -= 1;
      }
      if (remaining > 0 || instances > 0) throw new Error("BUSINESS_MANUFACTURING_EQUIPMENT_CAPACITY_UNAVAILABLE");
    }

    const job = {
      key,
      player: request.player,
      idempotencyKey: request.idempotencyKey,
      requestHash,
      status: "queued",
      resourceState: "reserved",
      materials,
      labor,
      equipment,
    };
    state.jobs.push(job);
    return { job, replayed: false };
  } catch (error) {
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, before);
    throw error;
  }
}

const base = {
  warehouse: { steel: 100, bolts: 100 },
  wip: {},
  employees: [
    { key: "emp_0001", role: "operator", skill: 9000, capacity: 300 },
    { key: "emp_0002", role: "operator", skill: 8000, capacity: 300 },
  ],
  installations: [
    { key: "eq_0001", capabilities: ["fabricator"], capacity: 480 },
  ],
  laborReservations: [],
  equipmentReservations: [],
  jobs: [],
};
const request = {
  game: "game_1",
  player: "player_1",
  business: "biz_1",
  product: "product_1",
  recipe: "recipe_1",
  output: "panel",
  quantity: 10,
  priority: "standard",
  idempotencyKey: "start-00000001",
  inputs: [{ item: "steel", perUnit: 2 }, { item: "bolts", perUnit: 1 }],
  labor: [{ role: "operator", skill: 7000, headcount: 1, fixed: 0, perUnit: 20 }],
  equipment: [{ capability: "fabricator", instances: 1, fixed: 0, perUnit: 30 }],
};

const state = copy(base);
const first = start(state, request);
assert.equal(first.replayed, false);
assert.equal(state.warehouse.steel, 80);
assert.equal(state.wip.steel, 20);
assert.equal(first.job.labor.reduce((sum, row) => sum + row.minutes, 0), 200);
assert.equal(first.job.equipment.reduce((sum, row) => sum + row.minutes, 0), 300);
assert.equal(start(state, request).replayed, true);
assert.equal(state.jobs.length, 1);
assert.throws(() => start(state, { ...request, quantity: 11 }), /IDEMPOTENCY_CONFLICT/);

const materialFailure = copy(base);
materialFailure.warehouse.steel = 1;
assert.throws(() => start(materialFailure, request), /INPUT_QUANTITY_UNAVAILABLE/);
assert.equal(materialFailure.warehouse.steel, 1);
assert.deepEqual(materialFailure.wip, {});

const laborFailure = copy(base);
laborFailure.employees.forEach((employee) => { employee.capacity = 10; });
assert.throws(() => start(laborFailure, request), /LABOR_CAPACITY_UNAVAILABLE/);
assert.equal(laborFailure.warehouse.steel, 100);
assert.deepEqual(laborFailure.wip, {});
assert.equal(laborFailure.laborReservations.length, 0);

const equipmentFailure = copy(base);
equipmentFailure.installations[0].capacity = 10;
assert.throws(() => start(equipmentFailure, request), /EQUIPMENT_CAPACITY_UNAVAILABLE/);
assert.equal(equipmentFailure.warehouse.steel, 100);
assert.equal(equipmentFailure.laborReservations.length, 0);
assert.equal(equipmentFailure.equipmentReservations.length, 0);

assert.throws(
  () => start(state, { ...request, idempotencyKey: "start-00000002" }),
  /LABOR_CAPACITY_UNAVAILABLE|EQUIPMENT_CAPACITY_UNAVAILABLE/,
  "A second job cannot double-book the first job's finite resources.",
);

console.log("Business Phase 6B atomic manufacturing start simulation: PASS");
