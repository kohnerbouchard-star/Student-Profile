import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { createCampaignReadClient } from "./campaignReadClient.ts";

const SCHEDULER_NAME = "econovaria-campaign-runtime-scheduler-v1";

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabaseClient = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const campaignRuntimeClient = createCampaignReadClient({
  from: (table) => supabaseClient.from(table),
  rpc: (name, args) => supabaseClient.rpc(name, args),
});

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
