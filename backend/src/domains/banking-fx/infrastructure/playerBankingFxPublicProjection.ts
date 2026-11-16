import { parsePlayerBankAccounts } from "../../economy/index.ts";
import {
  PlayerBankingFxError,
  type PlayerBankingFxHistoryPage,
  type PlayerBankingFxMutationResult,
  type PlayerBankingFxOrderDto,
  type PlayerBankingFxOrdersPage,
  type PlayerBankingFxOverview,
  type PlayerBankingFxQuoteDto,
} from "../contracts/playerBankingFxContracts.ts";
import { projectPlayerBankingFxCurrencies } from "./playerBankingFxCurrencyProjection.ts";
import {
  first,
  fixingDto,
  historyDto,
  mutation,
  nestedRow,
  oneRow,
  optionalRows,
  orderDto,
  pageRows,
  pendingOrderStatus,
  quoteDto,
} from "./playerBankingFxProjectionRows.ts";

export function projectPlayerBankingFxOverview(
  overviewValue: unknown,
  accountsValue: unknown,
): PlayerBankingFxOverview {
  const overview = oneRow(overviewValue, "FX overview");
  const allOrders = optionalRows(
    first(overview, "orders", "fx_orders", "fxOrders"),
    "FX overview orders",
  ).map(orderDto);
  const pending = optionalRows(
    first(overview, "pending_orders", "pendingOrders"),
    "FX overview pending orders",
  );
  const completed = optionalRows(
    first(overview, "completed_orders", "completedOrders"),
    "FX overview completed orders",
  );
  let accounts;
  try {
    accounts = parsePlayerBankAccounts(accountsValue);
  } catch {
    throw new PlayerBankingFxError(
      "player_banking_fx_result_invalid",
      "Player bank accounts returned an invalid result.",
      503,
      true,
    );
  }
  return {
    accounts,
    currencies: projectPlayerBankingFxCurrencies(
      first(overview, "currencies", "currency_options", "currencyOptions"),
    ),
    fixing: fixingDto(
      nestedRow(overview, ["fixing", "current_fixing", "currentFixing"]) ??
        overview,
    ),
    pendingOrders: pending.length
      ? pending.map(orderDto)
      : allOrders.filter((order) => pendingOrderStatus(order.status)),
    completedOrders: completed.length
      ? completed.map(orderDto)
      : allOrders.filter((order) => !pendingOrderStatus(order.status)),
  };
}

export function projectPlayerBankingFxHistoryPage(
  value: unknown,
  limit: number,
): PlayerBankingFxHistoryPage {
  const page = pageRows(
    value,
    ["history", "rates", "items", "rows"],
    "FX rate history",
  );
  return {
    items: page.rows.slice(0, limit).map(historyDto),
    hasMore: page.hasMore ?? page.rows.length > limit,
  };
}

export function projectPlayerBankingFxOrdersPage(
  value: unknown,
  limit: number,
): PlayerBankingFxOrdersPage {
  const page = pageRows(value, ["orders", "items", "rows"], "FX orders");
  return {
    items: page.rows.slice(0, limit).map(orderDto),
    hasMore: page.hasMore ?? page.rows.length > limit,
  };
}

export function projectPlayerBankingFxQuoteMutation(
  value: unknown,
): PlayerBankingFxMutationResult<PlayerBankingFxQuoteDto> {
  return mutation(
    value,
    ["quote", "fx_quote", "fxQuote"],
    quoteDto,
    "FX quote",
  );
}

export function projectPlayerBankingFxOrderMutation(
  value: unknown,
  label: string,
): PlayerBankingFxMutationResult<PlayerBankingFxOrderDto> {
  return mutation(
    value,
    ["order", "fx_order", "fxOrder"],
    orderDto,
    label,
  );
}
