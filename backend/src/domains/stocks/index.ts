import type { EdgeSupabaseClient } from "../../platform/supabase/edgeStaffSession.ts";
import type { StockMarketReadRepository } from "./contracts/stockMarketReadContracts.ts";
import {
  SupabaseStockMarketReadRepository,
} from "./infrastructure/supabaseStockMarketReadRepository.ts";

export type {
  StockMarketBoardStockDto,
  StockMarketReadErrorCode,
  StockMarketReadInput,
  StockMarketReadRepository,
  StockMarketReadResult,
} from "./contracts/stockMarketReadContracts.ts";
export { StockMarketReadError } from "./contracts/stockMarketReadContracts.ts";

export function createStockMarketReadRepository(
  client: Pick<EdgeSupabaseClient, "from" | "rpc">,
): StockMarketReadRepository {
  return new SupabaseStockMarketReadRepository(client);
}
