import {
  addMarketDecimals,
  compareMarketDecimals,
  multiplyMarketDecimals,
  subtractMarketDecimals,
} from "../calculations/decimalMath.ts";
import type {
  ActiveBookOrderStatus,
  PriceTimeBookOrder,
  PriceTimeBookTrade,
  PriceTimeOrderBookState,
} from "./priceTimeOrderBookStateMachine.ts";
export function rematch(
  state: PriceTimeOrderBookState,
): PriceTimeOrderBookState {
  let orders = state.orders.map((order) => ({ ...order }));
  const trades = [...state.trades];
  const blocked = new Set(state.blockedSelfTradePairKeys);
  let tradeSequence = trades.length + 1;
  while (true) {
    const activeBids = orders
      .filter((order) => isActive(order) && order.side === "buy")
      .sort(compareBids);
    const activeAsks = orders
      .filter((order) => isActive(order) && order.side === "sell")
      .sort(compareAsks);
    let pair: {
      buy: PriceTimeBookOrder;
      sell: PriceTimeBookOrder;
    } | null = null;
    for (const buy of activeBids) {
      for (const sell of activeAsks) {
        if (compareMarketDecimals(buy.limitPrice, sell.limitPrice) < 0) break;
        if (buy.playerPublicId === sell.playerPublicId) {
          blocked.add(`${buy.orderPublicId}|${sell.orderPublicId}`);
          continue;
        }
        pair = { buy, sell };
        break;
      }
      if (pair) break;
    }
    if (!pair) break;
    const quantity = compareMarketDecimals(
        pair.buy.remainingQuantity,
        pair.sell.remainingQuantity,
      ) <= 0
      ? pair.buy.remainingQuantity
      : pair.sell.remainingQuantity;
    const maker = comparePriority(pair.buy, pair.sell) <= 0
      ? pair.buy
      : pair.sell;
    const taker = maker.orderPublicId === pair.buy.orderPublicId
      ? pair.sell
      : pair.buy;
    const executionPrice = maker.limitPrice;
    trades.push({
      tradePublicId: `market-trade.${
        stableHash(
          `${state.bookPublicId}|${tradeSequence}|${pair.buy.orderPublicId}|${pair.sell.orderPublicId}`,
        )
      }.v1`,
      sequence: tradeSequence,
      buyOrderPublicId: pair.buy.orderPublicId,
      sellOrderPublicId: pair.sell.orderPublicId,
      buyerPlayerPublicId: pair.buy.playerPublicId,
      sellerPlayerPublicId: pair.sell.playerPublicId,
      quantity,
      executionPrice,
      grossValue: multiplyMarketDecimals(quantity, executionPrice),
      makerOrderPublicId: maker.orderPublicId,
      takerOrderPublicId: taker.orderPublicId,
      occurredAt: state.observedAt,
      settlementDomain: "financial_instrument",
    });
    orders = orders.map((order) => {
      if (
        order.orderPublicId !== pair!.buy.orderPublicId &&
        order.orderPublicId !== pair!.sell.orderPublicId
      ) {
        return order;
      }
      const remainingQuantity = subtractMarketDecimals(
        order.remainingQuantity,
        quantity,
      );
      const filledQuantity = addMarketDecimals(
        order.filledQuantity,
        quantity,
      );
      const filled = compareMarketDecimals(remainingQuantity, "0") === 0;
      return {
        ...order,
        version: order.version + 1,
        remainingQuantity,
        filledQuantity,
        status: filled ? "filled" as const : "partially_filled" as const,
        terminalAt: filled ? state.observedAt : null,
      };
    });
    tradeSequence += 1;
  }
  assertNoExecutableCross(orders);
  const normalizedOrders = [...orders].sort((left, right) =>
    left.orderPublicId.localeCompare(right.orderPublicId)
  );
  const normalizedTrades = [...trades].sort((left, right) =>
    left.sequence - right.sequence ||
    left.tradePublicId.localeCompare(right.tradePublicId)
  );
  const digest = stableHash([
    ...normalizedOrders.map(canonicalOrder),
    ...normalizedTrades.map(canonicalTrade),
    ...[...blocked].sort(),
    ...state.processedTransitionKeys,
  ].join("\n"));
  return {
    ...state,
    orders: normalizedOrders,
    trades: normalizedTrades,
    blockedSelfTradePairKeys: [...blocked].sort(),
    executableCrossRemaining: false,
    deterministicDigest: digest,
  };
}

export function isActive(
  order: PriceTimeBookOrder,
): order is PriceTimeBookOrder & { readonly status: ActiveBookOrderStatus } {
  return order.status === "open" || order.status === "partially_filled";
}

function assertNoExecutableCross(
  orders: readonly PriceTimeBookOrder[],
): void {
  const bids = orders
    .filter((order) => isActive(order) && order.side === "buy")
    .sort(compareBids);
  const asks = orders
    .filter((order) => isActive(order) && order.side === "sell")
    .sort(compareAsks);
  for (const buy of bids) {
    for (const sell of asks) {
      if (compareMarketDecimals(buy.limitPrice, sell.limitPrice) < 0) break;
      if (buy.playerPublicId !== sell.playerPublicId) {
        throw new Error("order_book_executable_cross_remaining");
      }
    }
  }
}

function compareBids(
  left: PriceTimeBookOrder,
  right: PriceTimeBookOrder,
): number {
  const price = compareMarketDecimals(right.limitPrice, left.limitPrice);
  return price !== 0 ? price : comparePriority(left, right);
}

function compareAsks(
  left: PriceTimeBookOrder,
  right: PriceTimeBookOrder,
): number {
  const price = compareMarketDecimals(left.limitPrice, right.limitPrice);
  return price !== 0 ? price : comparePriority(left, right);
}

function comparePriority(
  left: PriceTimeBookOrder,
  right: PriceTimeBookOrder,
): number {
  const time = Date.parse(left.submittedAt) - Date.parse(right.submittedAt);
  if (time !== 0) return time;
  if (left.prioritySequence !== right.prioritySequence) {
    return left.prioritySequence - right.prioritySequence;
  }
  return left.orderPublicId.localeCompare(right.orderPublicId);
}

function canonicalOrder(order: PriceTimeBookOrder): string {
  return [
    order.orderPublicId,
    order.version,
    order.side,
    order.originalQuantity,
    order.remainingQuantity,
    order.filledQuantity,
    order.limitPrice,
    order.submittedAt,
    order.prioritySequence,
    order.status,
    order.terminalAt ?? "",
    order.replacedByOrderPublicId ?? "",
  ].join("|");
}

function canonicalTrade(trade: PriceTimeBookTrade): string {
  return [
    trade.tradePublicId,
    trade.sequence,
    trade.buyOrderPublicId,
    trade.sellOrderPublicId,
    trade.quantity,
    trade.executionPrice,
    trade.grossValue,
    trade.makerOrderPublicId,
  ].join("|");
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}
