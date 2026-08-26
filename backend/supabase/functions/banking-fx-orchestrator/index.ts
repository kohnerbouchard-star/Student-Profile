import { handleBankingFxOrchestratorRequest } from "../../../src/domains/banking-fx/api/bankingFxOrchestratorHttpHandler.ts";
import {
  type StandardFxOrderSettlementClient,
  SupabaseStandardFxOrderSettlementRepository,
} from "../../../src/domains/banking-fx/infrastructure/supabaseStandardFxOrderSettlementRepository.ts";
import { StandardFxOrderSettlementError } from "../../../src/domains/banking-fx/services/standardFxOrderSettlementRunner.ts";
import { createServiceRoleClient } from "../../../src/platform/supabase/serviceRoleClient.ts";

Deno.serve((request: Request) =>
  handleBankingFxOrchestratorRequest(request, {
    createRepository: () => {
      const supabaseUrl = environmentValue("SUPABASE_URL");
      const serviceRoleKey = environmentValue("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) {
        throw new StandardFxOrderSettlementError(
          "banking_fx_orchestrator_runtime_config_missing",
          "Required Banking FX orchestrator configuration is missing.",
          500,
          false,
        );
      }
      const client = createServiceRoleClient(
        supabaseUrl,
        serviceRoleKey,
        "econovaria-banking-fx-orchestrator-v1",
      );
      return new SupabaseStandardFxOrderSettlementRepository(
        client as unknown as StandardFxOrderSettlementClient,
      );
    },
  })
);

function environmentValue(name: string): string {
  try {
    return Deno.env.get(name)?.trim() ?? "";
  } catch {
    return "";
  }
}
