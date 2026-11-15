import {
  SCHEDULER_HEADER,
  SCHEDULER_TOKEN_PATTERN,
  SCHEDULER_NAME,
  type WorkerRuntime,
  EMAIL_PATTERN,
} from "./emailWorkerContracts.ts";
import {
  sha256Hex,
  environmentValue,
} from "./emailWorkerValidation.ts";


export async function schedulerRequestIsAuthorized(
  client: any,
  request: Request,
): Promise<boolean> {
  const schedulerToken = String(
    request.headers.get(SCHEDULER_HEADER) || "",
  ).trim();
  if (!SCHEDULER_TOKEN_PATTERN.test(schedulerToken)) {
    return false;
  }

  const schedulerTokenHash = await sha256Hex(
    schedulerToken.toLowerCase(),
  );
  const authorization = await client.rpc(
    "verify_runtime_scheduler_token_v1",
    {
      p_scheduler_name: SCHEDULER_NAME,
      p_token_sha256: schedulerTokenHash,
    },
  );
  return !authorization.error && authorization.data === true;
}


export function readWorkerRuntime(): WorkerRuntime | null {
  const runtime: WorkerRuntime = {
    licenseCodeDerivationSecret: environmentValue(
      "ECONOVARIA_LICENSE_CODE_DERIVATION_SECRET",
    ),
    purchaseCodeHmacSecret: environmentValue(
      "ECONOVARIA_PURCHASE_CODE_HMAC_SECRET",
    ),
    resendApiKey: environmentValue("RESEND_API_KEY"),
    emailFrom: environmentValue("ECONOVARIA_LICENSE_EMAIL_FROM") ||
      environmentValue("ECONOVARIA_AUTH_EMAIL_FROM"),
    supportEmail: environmentValue("ECONOVARIA_LICENSE_SUPPORT_EMAIL"),
  };

  if (
    runtime.licenseCodeDerivationSecret.length < 32 ||
    runtime.purchaseCodeHmacSecret.length < 32 ||
    runtime.licenseCodeDerivationSecret === runtime.purchaseCodeHmacSecret ||
    !runtime.resendApiKey ||
    !runtime.emailFrom ||
    (runtime.supportEmail && !EMAIL_PATTERN.test(runtime.supportEmail))
  ) {
    return null;
  }
  return runtime;
}
