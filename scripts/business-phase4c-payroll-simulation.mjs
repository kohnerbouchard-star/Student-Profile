import assert from "node:assert/strict";
import crypto from "node:crypto";

const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

class PayrollAuthority {
  constructor() {
    this.period = 1;
    this.runsByPeriod = new Map();
    this.runsByIdempotency = new Map();
    this.recoveries = new Map();
  }

  settle({ businessKey, idempotencyKey, balance, employees }) {
    const priorByIntent = this.runsByIdempotency.get(idempotencyKey);
    if (priorByIntent) return { ...priorByIntent, replayed: true };
    const periodKey = `payroll:${this.period}`;
    const prior = this.runsByPeriod.get(periodKey);
    if (prior) return { ...prior, replayed: true };

    const ordered = [...employees]
      .filter((employee) => employee.status === "active")
      .sort((left, right) => left.employeeKey.localeCompare(right.employeeKey));
    const due = ordered.reduce((total, employee) => total + employee.wagePerCycle, 0);
    let available = Math.min(Math.max(balance, 0), due);
    let remaining = due;
    let paid = 0;
    const entries = ordered.map((employee, index) => {
      const wagePaid = index === ordered.length - 1
        ? Math.min(employee.wagePerCycle, available)
        : Math.min(
            employee.wagePerCycle,
            available,
            Math.round((available * employee.wagePerCycle / remaining) * 100) / 100,
          );
      available = Math.round((available - wagePaid) * 100) / 100;
      remaining = Math.round((remaining - employee.wagePerCycle) * 100) / 100;
      paid = Math.round((paid + wagePaid) * 100) / 100;
      return {
        employeeKey: employee.employeeKey,
        wageDue: employee.wagePerCycle,
        wagePaid,
        wageUnpaid: employee.wagePerCycle - wagePaid,
      };
    });
    const unpaid = due - paid;
    const run = {
      runKey: `pyr_${hash({ businessKey, periodKey }).slice(0, 32)}`,
      businessKey,
      periodKey,
      due,
      paid,
      unpaid,
      status: unpaid === 0 ? "completed" : paid > 0 ? "partially_paid" : "unpaid",
      entries,
      replayed: false,
    };
    this.period += 1;
    this.runsByPeriod.set(periodKey, run);
    this.runsByIdempotency.set(idempotencyKey, run);
    return run;
  }

  recover({ run, idempotencyKey, balance }) {
    const key = `${run.runKey}|${idempotencyKey}`;
    if (this.recoveries.has(key)) return { ...this.recoveries.get(key), replayed: true };
    let available = Math.min(Math.max(balance, 0), run.unpaid);
    let remaining = run.unpaid;
    let paid = 0;
    for (let index = 0; index < run.entries.length; index += 1) {
      const entry = run.entries[index];
      if (entry.wageUnpaid <= 0) continue;
      const wagePaid = index === run.entries.length - 1
        ? Math.min(entry.wageUnpaid, available)
        : Math.min(
            entry.wageUnpaid,
            available,
            Math.round((available * entry.wageUnpaid / remaining) * 100) / 100,
          );
      available = Math.round((available - wagePaid) * 100) / 100;
      remaining = Math.round((remaining - entry.wageUnpaid) * 100) / 100;
      entry.wagePaid += wagePaid;
      entry.wageUnpaid -= wagePaid;
      paid += wagePaid;
    }
    run.paid += paid;
    run.unpaid -= paid;
    run.status = run.unpaid === 0 ? "completed" : run.paid > 0 ? "partially_paid" : "unpaid";
    const result = { paid, unpaid: run.unpaid, status: run.status, replayed: false };
    this.recoveries.set(key, result);
    return result;
  }
}

const businessKey = `biz_${"a".repeat(32)}`;
const employees = [
  { employeeKey: `emp_${"b".repeat(32)}`, wagePerCycle: 70, status: "active" },
  { employeeKey: `emp_${"a".repeat(32)}`, wagePerCycle: 50, status: "active" },
  { employeeKey: `emp_${"c".repeat(32)}`, wagePerCycle: 90, status: "terminated" },
];

const authority = new PayrollAuthority();
const zeroProduction = authority.settle({
  businessKey,
  idempotencyKey: "payroll-zero-production",
  balance: 80,
  employees,
});
assert.equal(zeroProduction.periodKey, "payroll:1");
assert.equal(zeroProduction.status, "partially_paid");
assert.equal(zeroProduction.due, 120);
assert.equal(zeroProduction.paid, 80);
assert.deepEqual(zeroProduction.entries.map((entry) => entry.employeeKey), [
  `emp_${"a".repeat(32)}`,
  `emp_${"b".repeat(32)}`,
]);

const replay = authority.settle({
  businessKey,
  idempotencyKey: "payroll-zero-production",
  balance: 999,
  employees: [],
});
assert.equal(replay.replayed, true);
assert.equal(replay.periodKey, "payroll:1");
assert.equal(authority.period, 2);

const firstRecovery = authority.recover({
  run: zeroProduction,
  idempotencyKey: "payroll-recovery-0001",
  balance: 20,
});
assert.equal(firstRecovery.paid, 20);
assert.equal(firstRecovery.unpaid, 20);
assert.equal(firstRecovery.status, "partially_paid");

const recoveryReplay = authority.recover({
  run: zeroProduction,
  idempotencyKey: "payroll-recovery-0001",
  balance: 999,
});
assert.equal(recoveryReplay.replayed, true);
assert.equal(recoveryReplay.paid, 20);

const finalRecovery = authority.recover({
  run: zeroProduction,
  idempotencyKey: "payroll-recovery-0002",
  balance: 20,
});
assert.equal(finalRecovery.status, "completed");
assert.equal(finalRecovery.unpaid, 0);
assert.equal(zeroProduction.paid, 120);

const next = authority.settle({
  businessKey,
  idempotencyKey: "payroll-next-period",
  balance: 500,
  employees,
});
assert.equal(next.periodKey, "payroll:2");
assert.equal(next.status, "completed");

console.log("Business Phase 4C-A payroll clock, partial funding, replay, and recovery simulations passed.");
