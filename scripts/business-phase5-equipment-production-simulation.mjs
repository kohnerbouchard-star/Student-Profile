#!/usr/bin/env node

import assert from "node:assert/strict";

function committed(installation, period) {
  return installation.reservations
    .filter((r) => r.period === period && ["reserved", "active", "consumed"].includes(r.status))
    .reduce((sum, r) => sum + r.minutes, 0);
}

function allocate({ installations, requirement, period, quantity, intent }) {
  const required = requirement.fixedMinutes + requirement.minutesPerUnit * quantity;
  if (required < requirement.minimumInstances) throw new Error("BUSINESS_EQUIPMENT_REQUIREMENT_INVALID");
  let remaining = required;
  let instancesRemaining = requirement.minimumInstances;
  let instancesUsed = 0;
  const created = [];

  for (const installation of [...installations].sort((a, b) => a.key.localeCompare(b.key))) {
    if (remaining <= 0 && instancesRemaining <= 0) break;
    if (installation.status !== "installed" || !installation.capabilities.includes(requirement.capability)) continue;
    const available = Math.max(0, installation.capacity - committed(installation, period));
    if (!available) continue;
    const minutes = instancesRemaining > 0
      ? Math.min(available, Math.max(1, remaining - (instancesRemaining - 1)))
      : Math.min(available, remaining);
    if (!minutes) continue;
    const reservation = { period, minutes, intent, status: "reserved" };
    installation.reservations.push(reservation);
    created.push({ installation, reservation });
    remaining = Math.max(0, remaining - minutes);
    if (instancesRemaining > 0) instancesRemaining -= 1;
    instancesUsed += 1;
  }

  if (instancesUsed < requirement.minimumInstances) {
    for (const { installation, reservation } of created) installation.reservations.splice(installation.reservations.indexOf(reservation), 1);
    throw new Error("BUSINESS_EQUIPMENT_COVERAGE_UNAVAILABLE");
  }
  if (remaining > 0) {
    for (const { installation, reservation } of created) installation.reservations.splice(installation.reservations.indexOf(reservation), 1);
    throw new Error("BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE");
  }
  return created;
}

function settle(created, succeeds) {
  if (!succeeds) {
    for (const { installation, reservation } of created) {
      installation.reservations.splice(installation.reservations.indexOf(reservation), 1);
    }
    throw new Error("PRODUCTION_SETTLEMENT_FAILED");
  }
  for (const { reservation } of created) reservation.status = "consumed";
}

const makeInstallation = (key, capacity = 480) => ({
  key,
  capacity,
  capabilities: ["tool.fabricator"],
  status: "installed",
  reservations: [],
});

const requirement = {
  capability: "tool.fabricator",
  fixedMinutes: 0,
  minutesPerUnit: 60,
  minimumInstances: 1,
};

const one = makeInstallation("bei_00000000000000000000000000000001");
const first = allocate({ installations: [one], requirement, period: "equipment:1", quantity: 6, intent: "production:first" });
assert.equal(first.reduce((sum, r) => sum + r.reservation.minutes, 0), 360);
settle(first, true);
assert.equal(committed(one, "equipment:1"), 360);
assert.throws(
  () => allocate({ installations: [one], requirement, period: "equipment:1", quantity: 3, intent: "production:second" }),
  /BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE/,
);

const secondPeriod = allocate({ installations: [one], requirement, period: "equipment:2", quantity: 8, intent: "production:full" });
settle(secondPeriod, true);
assert.equal(committed(one, "equipment:2"), 480);
assert.throws(
  () => allocate({ installations: [one], requirement, period: "equipment:2", quantity: 1, intent: "production:double-book" }),
  /BUSINESS_EQUIPMENT_COVERAGE_UNAVAILABLE|BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE/,
);

const a = makeInstallation("bei_00000000000000000000000000000001", 300);
const b = makeInstallation("bei_00000000000000000000000000000002", 300);
const twoInstanceRequirement = { ...requirement, minutesPerUnit: 100, minimumInstances: 2 };
const split = allocate({ installations: [b, a], requirement: twoInstanceRequirement, period: "equipment:3", quantity: 5, intent: "production:split" });
assert.equal(split.length, 2);
assert.equal(split[0].installation.key, a.key);
assert.equal(split.reduce((sum, r) => sum + r.reservation.minutes, 0), 500);
settle(split, true);
assert.equal(committed(a, "equipment:3") + committed(b, "equipment:3"), 500);

const rollback = makeInstallation("bei_00000000000000000000000000000003");
const failed = allocate({ installations: [rollback], requirement, period: "equipment:4", quantity: 2, intent: "production:failure" });
assert.throws(() => settle(failed, false), /PRODUCTION_SETTLEMENT_FAILED/);
assert.equal(committed(rollback, "equipment:4"), 0);

const offline = makeInstallation("bei_00000000000000000000000000000004");
offline.status = "offline";
assert.throws(
  () => allocate({ installations: [offline], requirement, period: "equipment:5", quantity: 1, intent: "production:offline" }),
  /BUSINESS_EQUIPMENT_COVERAGE_UNAVAILABLE/,
);

console.log("Business Phase 5B production equipment allocation simulation: PASS");
