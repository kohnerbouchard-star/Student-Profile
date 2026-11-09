import { ApiRequestError } from "./errors.js";

// Owned by one terminal composition, never by a module-global session registry.
export function createResourceFreshnessCoordinator() {
  let epoch = 0, session, reads = new WeakMap();
  const owner = {};
  const generations = new Map(), pending = new Set(), tickets = new WeakMap();
  const generation = (key) => generations.get(key) || 0;
  const current = (ticket) => ticket?.owner === owner && ticket.epoch === epoch && ticket.resources.every(([key, value]) => generation(key) === value);
  const assertCurrent = (ticket) => {
    if (current(ticket)) return;
    throw new ApiRequestError("The request was superseded by newer player state.", {
      code: ticket?.epoch === epoch ? "REQUEST_SUPERSEDED" : "REQUEST_ABORTED"
    });
  };
  const reset = () => { epoch++; generations.clear(); pending.clear(); reads = new WeakMap(); };
  return Object.freeze({
    capture: (keys = []) => Object.freeze({ owner, epoch, resources: Object.freeze([...new Set(keys)].map((key) => Object.freeze([key, generation(key)]))) }),
    isCurrent: current,
    assertCurrent,
    reset,
    assertSession(value) {
      if (session !== value) throw new ApiRequestError("The session was retired.", { code: "REQUEST_ABORTED" });
    },
    setSession(value) { if (session !== value) { reset(); session = value; } },
    invalidate(keys) { for (const key of new Set(keys)) { generations.set(key, generation(key) + 1); pending.add(key); } },
    isPending: (key) => pending.has(key),
    settle(ticket, key) { assertCurrent(ticket); pending.delete(key); },
    track(value, ticket) { assertCurrent(ticket); tickets.set(value, ticket); return value; },
    ticketFor: (value) => tickets.get(value),
    coalesce(scope, key, ticket, start) {
      assertCurrent(ticket);
      let entries = reads.get(scope);
      if (!entries) { entries = new Map(); reads.set(scope, entries); }
      const prior = entries.get(key);
      if (prior && current(prior.ticket)) return prior.operation;
      const operation = Promise.resolve().then(() => { assertCurrent(ticket); return start(); }).finally(() => {
        if (entries.get(key)?.operation === operation) entries.delete(key);
      });
      entries.set(key, { ticket, operation });
      return operation;
    }
  });
}
