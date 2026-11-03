import type { EdgeSupabaseClient } from "../../platform/supabase/edgeStaffSession.ts";
import type { StoreItemDto } from "./contracts/storeCatalogContracts.ts";
import { SupabaseDashboardStoreListingsReadQuery } from "./infrastructure/supabaseDashboardStoreListingsReadQuery.ts";

export type { StoreItemDto } from "./contracts/storeCatalogContracts.ts";
export { DashboardStoreListingsReadError } from "./infrastructure/supabaseDashboardStoreListingsReadQuery.ts";

export interface DashboardStoreListingsReadQuery {
  read(gameSessionId: string): Promise<readonly StoreItemDto[]>;
}

export function createDashboardStoreListingsReadQuery(
  client: Pick<EdgeSupabaseClient, "from">,
): DashboardStoreListingsReadQuery {
  const query = new SupabaseDashboardStoreListingsReadQuery(client);
  return { read: (gameSessionId) => query.read(gameSessionId) };
}
