# Business V2 Workforce and Payroll Scope Hardening

**Roadmap phase:** 4 — Workforce capacity and payroll  
**Checkpoint:** 4A hardening  
**Branch:** `feat/business-workforce-payroll-foundation-v2`  
**Release status:** draft only; unmerged; undeployed

## Reason for the forward hardening migration

The Phase 4A foundation correctly introduced canonical workforce roles,
candidate offers, recipe labor requirements, finite labor reservations, and
payroll evidence. A relational review identified four invariants that required
explicit database enforcement before certification:

1. A labor reservation must not pair an employee with a Business or workforce
   role that does not own that employee.
2. A production-linked labor reservation must not reference a production run
   owned by another Business.
3. A payroll entry must match the Business and currency of its payroll run and
   the Business and role of its employee.
4. Candidate and recipe skill requirements must never undercut the canonical
   minimum skill for their workforce role.

The foundation migration had already been committed, so these corrections are
implemented as a forward migration rather than rewriting migration history.

## Relational scope enforcement

Composite unique indexes expose the authoritative key combinations required for
foreign-key enforcement across existing tables. Composite foreign keys then bind:

- labor reservations to the same game, Business, employee, and workforce role;
- production-linked reservations to the same game and Business as the production
  run;
- payroll entries to the same game, Business, payroll run, and currency;
- payroll entries to the same game, Business, employee, and workforce role.

The original narrower foreign keys remain in place as defense in depth.

## Skill-floor enforcement

Database triggers reject candidate offers and recipe labor requirements below
the canonical role minimum. A role-definition update is also rejected when a
higher minimum would invalidate existing candidates or recipe requirements.

This keeps role economics server-owned and prevents later administrative writes
from silently weakening or invalidating the workforce model.

## Durable evidence policy

The foundation granted explicit service-role DML, including DELETE, on the new
workforce and payroll tables. The hardening migration revokes direct DELETE from
`service_role` for role definitions, candidate offers, recipe labor
requirements, labor reservations, payroll runs, and payroll entries.

Operational changes must use status transitions and preserve evidence. Browser
roles retain no table or function authority.

## Phase boundary

This hardening does not add Player routes, hiring, payroll settlement, ledger
posting, production integration, or Business UX. Those remain later bounded
Phase 4 checkpoints. No staging or production deployment is authorized.
