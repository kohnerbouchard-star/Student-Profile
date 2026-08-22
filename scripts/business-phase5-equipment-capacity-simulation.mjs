#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

function key(prefix, value) {
  return `${prefix}_${String(value).padStart(32, "0")}`;
}

function materialize({ holding, instances, ownerKind }) {
  if (ownerKind !== "business") throw new Error("BUSINESS_EQUIPMENT_OWNERSHIP_MISMATCH");
  const active = instances.filter((instance) => instance.status !== "salvaged").length;
  if (active >= holding.quantityOwned) throw new Error("BUSINESS_EQUIPMENT_ALL_UNITS_MATERIALIZED");
  const instance = {
    key: key("eqp", active + 1),
    ownerKind: "business",
    businessKey: holding.businessKey,
    playerId: null,
    equippedSlot: null,
    status: "active",
  };
  instances.push(instance);
  return instance;
}

function install({ instance, businessKey, installations }) {
  if (instance.ownerKind !== "business" || instance.playerId || instance.equippedSlot) {
    throw new Error("BUSINESS_EQUIPMENT_INSTANCE_PLAYER_OWNED");
  }
  if (instance.businessKey !== businessKey) {
    throw new Error("BUSINESS_EQUIPMENT_OWNERSHIP_MISMATCH");
  }
  const existing = installations.find((entry) => entry.instanceKey === instance.key);
  if (existing) {
    if (existing.businessKey !== businessKey || existing.status === "retired") {
      throw new Error("BUSINESS_EQUIPMENT_INSTALLATION_CONFLICT");
    }
    return { installation: existing, replayed: true };
  }
  const installation = {
    key: key("bei", installations.length + 1),
    instanceKey: instance.key,
    businessKey,
    capabilityKeys: ["tool.fabricator"],
    capacity: 480,
    status: "installed",
    reservations: [],
  };
  installations.push(installation);
  return { installation, replayed: false };
}

function requestHash(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function committedMinutes(installation, period) {
  return installation.reservations
    .filter((entry) => entry.period === period)
    .filter((entry) => ["reserved", "active", "consumed"].includes(entry.status))
    .reduce((sum, entry) => sum + entry.minutes, 0);
}

function reserve({ installation, requirement, period, minutes, intent, idempotencyKey }) {
  if (installation.status !== "installed") throw new Error("BUSINESS_EQUIPMENT_INSTALLATION_UNAVAILABLE");
  if (!installation.capabilityKeys.includes(requirement.capability)) {
    throw new Error("BUSINESS_EQUIPMENT_CAPABILITY_MISMATCH");
  }
  const hash = requestHash({ requirement: requirement.key, period, minutes, intent });
  const existing = installation.reservations.find((entry) =>
    entry.idempotencyKey === idempotencyKey ||
    (entry.requirementKey === requirement.key && entry.period === period && entry.intent === intent)
  );
  if (existing) {
    if (existing.hash !== hash) throw new Error("BUSINESS_EQUIPMENT_IDEMPOTENCY_CONFLICT");
    return { reservation: existing, replayed: true };
  }
  if (committedMinutes(installation, period) + minutes > installation.capacity) {
    throw new Error("BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE");
  }
  const reservation = {
    key: key("eqr", installation.reservations.length + 1),
    requirementKey: requirement.key,
    period,
    minutes,
    intent,
    idempotencyKey,
    hash,
    status: "reserved",
  };
  installation.reservations.push(reservation);
  return { reservation, replayed: false };
}

function transition(reservation, target) {
  if (reservation.status === target) return { replayed: true };
  const allowed = {
    reserved: new Set(["active", "consumed", "released"]),
    active: new Set(["consumed", "released"]),
    consumed: new Set(),
    released: new Set(),
  };
  if (!allowed[reservation.status].has(target)) {
    throw new Error("BUSINESS_EQUIPMENT_RESERVATION_TRANSITION_INVALID");
  }
  reservation.status = target;
  return { replayed: false };
}

function setStatus(installation, status) {
  if (["offline", "retired"].includes(status) && installation.reservations.some((entry) =>
    ["reserved", "active"].includes(entry.status)
  )) {
    throw new Error("BUSINESS_EQUIPMENT_RESERVATION_ACTIVE");
  }
  if (installation.status === "retired" && status !== "retired") {
    throw new Error("BUSINESS_EQUIPMENT_INSTALLATION_RETIRED");
  }
  installation.status = status;
}

const holding = { businessKey: key("biz", 1), quantityOwned: 1 };
const instances = [];
assert.throws(
  () => materialize({ holding, instances, ownerKind: "player" }),
  /BUSINESS_EQUIPMENT_OWNERSHIP_MISMATCH/,
);
const instance = materialize({ holding, instances, ownerKind: "business" });
assert.equal(instance.playerId, null);
assert.equal(instance.equippedSlot, null);
assert.throws(
  () => materialize({ holding, instances, ownerKind: "business" }),
  /BUSINESS_EQUIPMENT_ALL_UNITS_MATERIALIZED/,
);

const installations = [];
assert.throws(
  () => install({ instance: { ...instance, businessKey: key("biz", 2) }, businessKey: holding.businessKey, installations }),
  /BUSINESS_EQUIPMENT_OWNERSHIP_MISMATCH/,
);
const firstInstall = install({ instance, businessKey: holding.businessKey, installations });
assert.equal(firstInstall.replayed, false);
assert.equal(install({ instance, businessKey: holding.businessKey, installations }).replayed, true);

const requirement = { key: key("beq", 1), capability: "tool.fabricator" };
const first = reserve({
  installation: firstInstall.installation,
  requirement,
  period: "equipment:1",
  minutes: 300,
  intent: "production:first",
  idempotencyKey: "equipment-reserve-first",
});
assert.equal(first.replayed, false);
assert.equal(committedMinutes(firstInstall.installation, "equipment:1"), 300);
assert.equal(reserve({
  installation: firstInstall.installation,
  requirement,
  period: "equipment:1",
  minutes: 300,
  intent: "production:first",
  idempotencyKey: "equipment-reserve-first",
}).replayed, true);
assert.throws(
  () => reserve({
    installation: firstInstall.installation,
    requirement,
    period: "equipment:1",
    minutes: 301,
    intent: "production:first",
    idempotencyKey: "equipment-reserve-first",
  }),
  /BUSINESS_EQUIPMENT_IDEMPOTENCY_CONFLICT/,
);
assert.throws(
  () => reserve({
    installation: firstInstall.installation,
    requirement,
    period: "equipment:1",
    minutes: 181,
    intent: "production:second",
    idempotencyKey: "equipment-reserve-second",
  }),
  /BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE/,
);

assert.equal(transition(first.reservation, "active").replayed, false);
assert.throws(
  () => setStatus(firstInstall.installation, "offline"),
  /BUSINESS_EQUIPMENT_RESERVATION_ACTIVE/,
);
assert.equal(transition(first.reservation, "released").replayed, false);
assert.equal(committedMinutes(firstInstall.installation, "equipment:1"), 0);
setStatus(firstInstall.installation, "offline");
assert.throws(
  () => reserve({
    installation: firstInstall.installation,
    requirement,
    period: "equipment:1",
    minutes: 1,
    intent: "production:offline",
    idempotencyKey: "equipment-reserve-offline",
  }),
  /BUSINESS_EQUIPMENT_INSTALLATION_UNAVAILABLE/,
);
setStatus(firstInstall.installation, "installed");

const consumed = reserve({
  installation: firstInstall.installation,
  requirement,
  period: "equipment:2",
  minutes: 480,
  intent: "production:full-period",
  idempotencyKey: "equipment-reserve-full-period",
});
transition(consumed.reservation, "consumed");
assert.equal(committedMinutes(firstInstall.installation, "equipment:2"), 480);
assert.throws(
  () => reserve({
    installation: firstInstall.installation,
    requirement,
    period: "equipment:2",
    minutes: 1,
    intent: "production:double-book",
    idempotencyKey: "equipment-reserve-double-book",
  }),
  /BUSINESS_EQUIPMENT_CAPACITY_UNAVAILABLE/,
);
assert.throws(
  () => transition(consumed.reservation, "released"),
  /BUSINESS_EQUIPMENT_RESERVATION_TRANSITION_INVALID/,
);

console.log("Business Phase 5A equipment capacity simulation: PASS");
