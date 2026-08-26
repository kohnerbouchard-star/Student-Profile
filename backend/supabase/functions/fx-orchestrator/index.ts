import {
  handleFxOrchestratorRequest,
} from "../../../src/domains/fx/api/fxOrchestratorHttpHandler.ts";
import {
  type FxFixingSupabaseClient,
  SupabaseFxFixingRepository,
} from "../../../src/domains/fx/infrastructure/supabaseFxFixingRepository.ts";
import { FxFixingRunnerError } from "../../../src/domains/fx/services/fxFixingRunner.ts";
import { createServiceRoleClient } from "../../../src/platform/supabase/serviceRoleClient.ts";

Deno.serve((request: Request) =>
  handleFxOrchestratorRequest(request, {
    createRepository: () => {
      const supabaseUrl = environmentValue("SUPABASE_URL");
      const serviceRoleKey = environmentValue("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) {
        throw new FxFixingRunnerError(
          "fx_scheduler_runtime_config_missing",
          "Required FX scheduler runtime configuration is missing.",
          500,
          false,
        );
      }

      const client = createServiceRoleClient(
        supabaseUrl,
        serviceRoleKey,
        "econovaria-fx-orchestrator-v1",
      );
      return new SupabaseFxFixingRepository(
        client as unknown as FxFixingSupabaseClient,
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
