import type { EdgeSupabaseClient } from "../../platform/supabase/edgeStaffSession.ts";
import type { StockMarketReadRepository } from "./contracts/stockMarketReadContracts.ts";
import {
  SupabaseStockMarketReadRepository,
} from "./infrastructure/supabaseStockMarketReadRepository.ts";
import {
  readStockMarketOpenState,
} from "./infrastructure/supabaseStockMarketWindowRepository.ts";

export type {
  StockMarketBoardStockDto,
  StockMarketReadErrorCode,
  StockMarketReadInput,
  StockMarketReadRepository,
  StockMarketReadResult,
} from "./contracts/stockMarketReadContracts.ts";
export { StockMarketReadError } from "./contracts/stockMarketReadContracts.ts";
export {
  StockMarketOpenStateReadError,
} from "./infrastructure/supabaseStockMarketWindowRepository.ts";

export function createStockMarketReadRepository(
  client: Pick<EdgeSupabaseClient, "from" | "rpc">,
): StockMarketReadRepository {
  return new SupabaseStockMarketReadRepository(client);
}

export interface StockMarketOpenStateReadRepository {
  read(gameSessionId: string, at: Date): Promise<boolean>;
}

export function createStockMarketOpenStateReadRepository(
  client: Pick<EdgeSupabaseClient, "rpc">,
): StockMarketOpenStateReadRepository {
  return {
    read: (gameSessionId, at) =>
      readStockMarketOpenState(client, gameSessionId, at),
  };
}
