export type PurgeRuntimeBinding = Readonly<{
  environmentName: string;
  r2BucketName: string;
}>;

export function resolvePurgeRuntimeBinding(
  supabaseUrl: string,
  r2BucketName: string,
): PurgeRuntimeBinding {
  const url = String(supabaseUrl || "").trim();
  const bucket = String(r2BucketName || "").trim();
  if (!url || !bucket) throw new Error("runtime_config_missing");

  const projectRef = new URL(url).hostname.split(".")[0] || "unknown";
  const environmentName = projectRef === "eecvbssdvarfcykcfrny"
    ? "staging"
    : projectRef === "cgiukdjwicykrmtkhudh"
    ? "production"
    : projectRef;
  return { environmentName, r2BucketName: bucket };
}

export function assertPurgeRuntimeBinding(
  preflight: Readonly<Record<string, unknown>>,
  runtimeBinding: PurgeRuntimeBinding,
): void {
  if (preflight.environmentConfigured !== true) {
    throw new Error("preflight_environment_not_configured");
  }
  if (
    String(preflight.environmentName || "") !== runtimeBinding.environmentName
  ) {
    throw new Error("preflight_environment_mismatch");
  }
  if (String(preflight.r2BucketName || "") !== runtimeBinding.r2BucketName) {
    throw new Error("preflight_r2_bucket_mismatch");
  }
}
