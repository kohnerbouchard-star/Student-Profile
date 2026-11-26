import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { createCampaignReadClient } from "./campaignReadClient.ts";
import {
  createStagingCampaignRpc,
  fenceEpoch,
  stagingFenceEnabled,
} from "./stagingFenceClient.ts";

const SCHEDULER_NAME = "econovaria-campaign-runtime-scheduler-v1";

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
export function useStagingCampaignFence(): boolean {
  const setting = Deno.env.get("ECONOVARIA_STAGING_CAMPAIGN_FENCE");
  return setting === undefined ? false : stagingFenceEnabled(
    setting,
    SUPABASE_URL,
    Deno.env.get("DENO_DEPLOYMENT_ID"),
  );
}

const supabaseClient = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const campaignRuntimeClient = createCampaignReadClient({
  from: (table) => supabaseClient.from(table),
  rpc: (name, args) => supabaseClient.rpc(name, args),
});

export async function authorizeStagingCampaignRuntime(token: string) {
  if (!useStagingCampaignFence() || !/^[0-9a-f]{64}$/.test(token)) return null;
  const result = await supabaseClient.rpc(
    "authorize_staging_campaign_worker_v1",
    {
      p_token_sha256: await sha256Hex(token),
    },
  );
  const admitted = result.data;
  if (
    result.error || !admitted || typeof admitted !== "object" ||
    typeof admitted.epoch !== "string" || !fenceEpoch.test(admitted.epoch) ||
    typeof admitted.smoke !== "boolean"
  ) return null;
  return {
    from: campaignRuntimeClient.from,
    rpc: createStagingCampaignRpc(
      admitted.epoch,
      (name, args) => supabaseClient.rpc(name, args),
    ),
    smoke: admitted.smoke,
  };
}

export async function verifySchedulerToken(token: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const tokenSha256 = await sha256Hex(token);
  const result = await supabaseClient.rpc(
    "verify_runtime_scheduler_token_v1",
    {
      p_scheduler_name: SCHEDULER_NAME,
      p_token_sha256: tokenSha256,
    },
  );
  return !result.error && result.data === true;
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
