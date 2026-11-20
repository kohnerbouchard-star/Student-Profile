import {
  assertPurgeRuntimeBinding,
  resolvePurgeRuntimeBinding,
} from "./runtimeBinding.ts";

Deno.test("game purge runtime binding maps only the canonical hosted environments", () => {
  assertEquals(
    resolvePurgeRuntimeBinding(
      "https://eecvbssdvarfcykcfrny.supabase.co",
      "staging-bucket",
    ),
    { environmentName: "staging", r2BucketName: "staging-bucket" },
  );
  assertEquals(
    resolvePurgeRuntimeBinding(
      "https://cgiukdjwicykrmtkhudh.supabase.co",
      "production-bucket",
    ),
    { environmentName: "production", r2BucketName: "production-bucket" },
  );
});

Deno.test("game purge runtime binding fails closed for missing or mismatched authority", () => {
  const runtime = {
    environmentName: "staging",
    r2BucketName: "staging-bucket",
  } as const;

  assertThrows(
    () => assertPurgeRuntimeBinding({}, runtime),
    "preflight_environment_not_configured",
  );
  assertThrows(
    () =>
      assertPurgeRuntimeBinding(
        {
          environmentConfigured: true,
          environmentName: "production",
          r2BucketName: "staging-bucket",
        },
        runtime,
      ),
    "preflight_environment_mismatch",
  );
  assertThrows(
    () =>
      assertPurgeRuntimeBinding(
        {
          environmentConfigured: true,
          environmentName: "staging",
          r2BucketName: "other-bucket",
        },
        runtime,
      ),
    "preflight_r2_bucket_mismatch",
  );
  assertPurgeRuntimeBinding(
    {
      environmentConfigured: true,
      environmentName: "staging",
      r2BucketName: "staging-bucket",
    },
    runtime,
  );
});

Deno.test("game purge runtime binding rejects missing runtime configuration", () => {
  assertThrows(
    () => resolvePurgeRuntimeBinding("", "bucket"),
    "runtime_config_missing",
  );
  assertThrows(
    () =>
      resolvePurgeRuntimeBinding(
        "https://eecvbssdvarfcykcfrny.supabase.co",
        "",
      ),
    "runtime_config_missing",
  );
});

function assertThrows(run: () => void, expectedMessage: string): void {
  let observed: unknown;
  try {
    run();
  } catch (error) {
    observed = error;
  }
  if (!(observed instanceof Error) || observed.message !== expectedMessage) {
    throw new Error(
      `Expected ${expectedMessage}, received ${String(observed)}`,
    );
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`);
}
