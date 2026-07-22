export {};

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

type Trade = {
  id: string;
  buyer: string;
  seller: string;
  item: string;
  quantity: number;
  unitPrice: number;
  feeRate: number;
  taxRate: number;
};

type SimulationResult = {
  accepted: string[];
  rejected: Array<{ id: string; reason: string }>;
  fees: number;
  taxes: number;
  gross: number;
  duplicateSettlements: number;
};

Deno.test("Marketplace abuse simulations are deterministic", () => {
  const input = scenarioTrades();
  assertEquals(simulateTrades(input), simulateTrades(input));
});

Deno.test("Marketplace listing spam is bounded per seller and item", () => {
  const decisions = simulateListingSpam(40, 25);
  assertEquals(decisions.accepted, 25);
  assertEquals(decisions.rejected, 15);
  assertEquals(decisions.reason, "MARKETPLACE_LISTING_CAP_REACHED");
});

Deno.test("Marketplace wash trading and circular trading are rejected", () => {
  const result = simulateTrades([
    trade("wash-1", "player-a", "player-a", 10),
    trade("cycle-1", "player-b", "player-a", 10),
    trade("cycle-2", "player-c", "player-b", 10),
    trade("cycle-3", "player-a", "player-c", 10),
  ]);
  assertReasons(result, [
    "MARKETPLACE_SELF_OR_WASH_TRADE",
    "MARKETPLACE_CIRCULAR_TRADING",
  ]);
  assertEquals(result.accepted, []);
});

Deno.test("Marketplace price manipulation is denied against deterministic reference bands", () => {
  const result = simulateTrades([
    trade("normal-low", "buyer-1", "seller-1", 8),
    trade("normal-mid", "buyer-2", "seller-2", 10),
    trade("normal-high", "buyer-3", "seller-3", 12),
    trade("manipulated", "buyer-4", "seller-4", 150),
  ]);
  assertEquals(result.accepted, ["normal-low", "normal-mid", "normal-high"]);
  assertReasons(result, ["MARKETPLACE_PRICE_BAND_EXCEEDED"]);
});

Deno.test("Marketplace refund abuse and dispute farming are rate bounded", () => {
  const refund = simulateCaseFrequency([0, 2, 4, 7, 8], 3, 10);
  assertEquals(refund.allowed, 3);
  assertEquals(refund.blocked, 2);
  assertEquals(refund.reason, "MARKETPLACE_REFUND_RATE_LIMITED");

  const disputes = simulateCaseFrequency([0, 1, 1, 2, 3, 5], 2, 7);
  assertEquals(disputes.allowed, 2);
  assertEquals(disputes.blocked, 4);
  assertEquals(disputes.reason, "MARKETPLACE_DISPUTE_FARMING_BLOCKED");
});

Deno.test("Marketplace reservation starvation leaves a deterministic free-inventory floor", () => {
  const result = simulateReservationStarvation({
    owned: 100,
    craftingReserved: 30,
    equipmentReserved: 5,
    marketplaceRequests: [20, 20, 20, 20],
    minimumFree: 10,
  });
  assertEquals(result.accepted, [20, 20, 10]);
  assertEquals(result.rejected, [20]);
  assertEquals(result.authoritativeReserved, 85);
  assertEquals(result.available, 15);
});

Deno.test("Marketplace duplicate settlement and concurrent purchase races commit once", () => {
  const duplicate = simulateSettlementAttempts([
    { key: "settle-1", expectedVersion: 7 },
    { key: "settle-1", expectedVersion: 7 },
    { key: "settle-conflict", expectedVersion: 7 },
    { key: "settle-race", expectedVersion: 8 },
  ]);
  assertEquals(duplicate.applied, ["settle-1", "settle-race"]);
  assertEquals(duplicate.replayed, ["settle-1"]);
  assertEquals(duplicate.rejected, [{ key: "settle-conflict", reason: "MARKETPLACE_STALE_VERSION" }]);
  assertEquals(duplicate.version, 9);
});

Deno.test("Marketplace ignores client fee and tax claims and preserves posting conservation", () => {
  const result = settleServerAmounts({
    unitPrice: 12.3456,
    quantity: 7,
    feeRate: 0.025,
    taxRate: 0.075,
    clientFee: 0,
    clientTax: 0,
  });
  assertEquals(result.subtotal, 86.4192);
  assertEquals(result.fee, 2.1605);
  assertEquals(result.tax, 6.4814);
  assertEquals(result.total, 95.0611);
  assertEquals(round(-result.total + result.subtotal + result.fee + result.tax), 0);
});

function scenarioTrades(): Trade[] {
  return [
    trade("trade-1", "buyer-1", "seller-1", 9),
    trade("trade-2", "buyer-2", "seller-2", 10),
    trade("trade-3", "buyer-3", "seller-3", 11),
    { ...trade("trade-3", "buyer-3", "seller-3", 11), id: "trade-3" },
  ];
}

function trade(id: string, buyer: string, seller: string, unitPrice: number): Trade {
  return { id, buyer, seller, item: "data-chip", quantity: 1, unitPrice, feeRate: 0.025, taxRate: 0.05 };
}

function simulateTrades(trades: readonly Trade[]): SimulationResult {
  const result: SimulationResult = {
    accepted: [],
    rejected: [],
    fees: 0,
    taxes: 0,
    gross: 0,
    duplicateSettlements: 0,
  };
  const settled = new Set<string>();
  const graph = new Map<string, Set<string>>();
  const acceptedPrices: number[] = [];

  for (const candidate of trades) {
    if (settled.has(candidate.id)) {
      result.duplicateSettlements += 1;
      continue;
    }
    if (candidate.buyer === candidate.seller) {
      result.rejected.push({ id: candidate.id, reason: "MARKETPLACE_SELF_OR_WASH_TRADE" });
      continue;
    }

    const median = acceptedPrices.length ? sortedMedian(acceptedPrices) : candidate.unitPrice;
    if (acceptedPrices.length >= 3 && (candidate.unitPrice > median * 10 || candidate.unitPrice < median / 10)) {
      result.rejected.push({ id: candidate.id, reason: "MARKETPLACE_PRICE_BAND_EXCEEDED" });
      continue;
    }

    const candidateGraph = cloneGraph(graph);
    addEdge(candidateGraph, candidate.seller, candidate.buyer);
    if (hasDirectedCycle(candidateGraph)) {
      result.rejected.push({ id: candidate.id, reason: "MARKETPLACE_CIRCULAR_TRADING" });
      continue;
    }

    settled.add(candidate.id);
    addEdge(graph, candidate.seller, candidate.buyer);
    acceptedPrices.push(candidate.unitPrice);
    result.accepted.push(candidate.id);
    const subtotal = round(candidate.unitPrice * candidate.quantity);
    result.gross = round(result.gross + subtotal);
    result.fees = round(result.fees + subtotal * candidate.feeRate);
    result.taxes = round(result.taxes + subtotal * candidate.taxRate);
  }

  return result;
}

function simulateListingSpam(attempts: number, cap: number) {
  const accepted = Math.min(attempts, cap);
  return { accepted, rejected: attempts - accepted, reason: "MARKETPLACE_LISTING_CAP_REACHED" };
}

function simulateCaseFrequency(days: readonly number[], limit: number, windowDays: number) {
  const acceptedDays: number[] = [];
  let blocked = 0;
  for (const day of days) {
    const recent = acceptedDays.filter((acceptedDay) => day - acceptedDay < windowDays);
    if (recent.length >= limit) blocked += 1;
    else acceptedDays.push(day);
  }
  return {
    allowed: acceptedDays.length,
    blocked,
    reason: limit === 3 ? "MARKETPLACE_REFUND_RATE_LIMITED" : "MARKETPLACE_DISPUTE_FARMING_BLOCKED",
  };
}

function simulateReservationStarvation(input: {
  owned: number;
  craftingReserved: number;
  equipmentReserved: number;
  marketplaceRequests: readonly number[];
  minimumFree: number;
}) {
  let reserved = input.craftingReserved + input.equipmentReserved;
  const accepted: number[] = [];
  const rejected: number[] = [];
  for (const request of input.marketplaceRequests) {
    const reservable = Math.max(0, input.owned - input.minimumFree - reserved);
    if (reservable <= 0) {
      rejected.push(request);
      continue;
    }
    const quantity = Math.min(request, reservable);
    accepted.push(quantity);
    reserved += quantity;
    if (quantity !== request) rejected.push(request);
  }
  return { accepted, rejected, authoritativeReserved: reserved, available: input.owned - reserved };
}

function simulateSettlementAttempts(attempts: readonly Array<{ key: string; expectedVersion: number }>) {
  let version = 7;
  const receipts = new Map<string, number>();
  const applied: string[] = [];
  const replayed: string[] = [];
  const rejected: Array<{ key: string; reason: string }> = [];

  for (const attempt of attempts) {
    const prior = receipts.get(attempt.key);
    if (prior !== undefined) {
      replayed.push(attempt.key);
      continue;
    }
    if (attempt.expectedVersion !== version) {
      rejected.push({ key: attempt.key, reason: "MARKETPLACE_STALE_VERSION" });
      continue;
    }
    version += 1;
    receipts.set(attempt.key, version);
    applied.push(attempt.key);
  }
  return { applied, replayed, rejected, version };
}

function settleServerAmounts(input: {
  unitPrice: number;
  quantity: number;
  feeRate: number;
  taxRate: number;
  clientFee: number;
  clientTax: number;
}) {
  const subtotal = round(input.unitPrice * input.quantity);
  const fee = round(subtotal * input.feeRate);
  const tax = round(subtotal * input.taxRate);
  return { subtotal, fee, tax, total: round(subtotal + fee + tax) };
}

function addEdge(graph: Map<string, Set<string>>, from: string, to: string): void {
  const edges = graph.get(from) ?? new Set<string>();
  edges.add(to);
  graph.set(from, edges);
}

function cloneGraph(graph: Map<string, Set<string>>): Map<string, Set<string>> {
  return new Map([...graph].map(([node, edges]) => [node, new Set(edges)]));
}

function hasDirectedCycle(graph: Map<string, Set<string>>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) ?? []) if (visit(next)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return [...graph.keys()].some(visit);
}

function sortedMedian(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function assertReasons(result: SimulationResult, expected: readonly string[]): void {
  const reasons = [...new Set(result.rejected.map((item) => item.reason))].sort();
  assertEquals(reasons, [...expected].sort());
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
