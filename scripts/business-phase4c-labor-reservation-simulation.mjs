#!/usr/bin/env node

import assert from "node:assert/strict";

function available(employee, period) {
  const used = employee.reservations
    .filter((reservation) => reservation.period === period && ["reserved", "active", "consumed"].includes(reservation.status))
    .reduce((sum, reservation) => sum + reservation.minutes, 0);
  return Math.max(0, employee.capacity - used);
}

function allocate({ employees, requirement, quantity, period, source }) {
  const roleEmployees = employees
    .filter((employee) => employee.status === "active")
    .filter((employee) => ["candidate_v2", "migration_v2"].includes(employee.source))
    .filter((employee) => employee.role === requirement.role)
    .sort((a, b) => a.key.localeCompare(b.key));
  if (roleEmployees.length < requirement.headcount) throw new Error("BUSINESS_LABOR_ROLE_COVERAGE_UNAVAILABLE");

  const skilled = roleEmployees.filter((employee) => employee.skill >= requirement.minimumSkill);
  if (skilled.length < requirement.headcount) throw new Error("BUSINESS_LABOR_SKILL_UNAVAILABLE");

  let remaining = requirement.fixedMinutes + requirement.minutesPerUnit * quantity;
  if (remaining < requirement.headcount) throw new Error("BUSINESS_LABOR_REQUIREMENT_INVALID");
  const totalAvailable = skilled.reduce((sum, employee) => sum + available(employee, period), 0);
  if (totalAvailable < remaining) throw new Error("BUSINESS_LABOR_CAPACITY_UNAVAILABLE");

  let headcountRemaining = requirement.headcount;
  let cost = 0;
  const reservations = [];
  for (const employee of skilled) {
    if (remaining <= 0) break;
    const capacity = available(employee, period);
    if (capacity <= 0) continue;
    const minutes = headcountRemaining > 0
      ? Math.min(capacity, Math.max(1, remaining - (headcountRemaining - 1)))
      : Math.min(capacity, remaining);
    if (minutes <= 0) continue;
    const reservation = { period, minutes, status: "reserved", source };
    employee.reservations.push(reservation);
    reservations.push({ employeeKey: employee.key, minutes, reservation });
    remaining -= minutes;
    if (headcountRemaining > 0) headcountRemaining -= 1;
    cost += employee.wage * minutes / employee.capacity;
  }
  if (remaining > 0 || headcountRemaining > 0) throw new Error("BUSINESS_LABOR_CAPACITY_UNAVAILABLE");
  return { reservations, cost: Math.round(cost * 100) / 100 };
}

const employees = [
  { key: "emp_00000000000000000000000000000001", role: "workforce.production.operator", skill: 8000, capacity: 240, wage: 120, status: "active", source: "candidate_v2", reservations: [] },
  { key: "emp_00000000000000000000000000000002", role: "workforce.production.operator", skill: 7000, capacity: 180, wage: 90, status: "active", source: "candidate_v2", reservations: [] },
  { key: "emp_00000000000000000000000000000003", role: "workforce.production.operator", skill: 9000, capacity: 300, wage: 180, status: "active", source: "historical_v1", reservations: [] },
];
const requirement = {
  role: "workforce.production.operator",
  fixedMinutes: 20,
  minutesPerUnit: 10,
  headcount: 2,
  minimumSkill: 6500,
};

const first = allocate({ employees, requirement, quantity: 20, period: "payroll:1", source: "production:a" });
assert.deepEqual(first.reservations.map((entry) => entry.employeeKey), [
  "emp_00000000000000000000000000000001",
  "emp_00000000000000000000000000000002",
]);
assert.equal(first.reservations.reduce((sum, entry) => sum + entry.minutes, 0), 220);
assert.equal(first.cost, 110);
assert.equal(employees[2].reservations.length, 0, "historical compatibility employee must not satisfy canonical production labor");

for (const entry of first.reservations) entry.reservation.status = "consumed";
assert.equal(available(employees[0], "payroll:1"), 21);
assert.equal(available(employees[1], "payroll:1"), 179);

assert.throws(
  () => allocate({ employees, requirement, quantity: 20, period: "payroll:1", source: "production:b" }),
  /BUSINESS_LABOR_CAPACITY_UNAVAILABLE/,
  "same-period production must not double book exhausted minutes",
);

const nextPeriod = allocate({ employees, requirement, quantity: 20, period: "payroll:2", source: "production:c" });
assert.equal(nextPeriod.reservations.reduce((sum, entry) => sum + entry.minutes, 0), 220);
assert.equal(available(employees[0], "payroll:2"), 21);
assert.equal(available(employees[1], "payroll:2"), 179);

const insufficientSkill = employees.map((employee) => ({ ...employee, reservations: [] }));
insufficientSkill[1].skill = 1000;
assert.throws(
  () => allocate({ employees: insufficientSkill, requirement, quantity: 1, period: "payroll:3", source: "production:d" }),
  /BUSINESS_LABOR_SKILL_UNAVAILABLE/,
);

const missingRole = employees.slice(0, 1).map((employee) => ({ ...employee, reservations: [] }));
assert.throws(
  () => allocate({ employees: missingRole, requirement, quantity: 1, period: "payroll:3", source: "production:e" }),
  /BUSINESS_LABOR_ROLE_COVERAGE_UNAVAILABLE/,
);

console.log("Business Phase 4C-B labor reservation simulation: PASS");
