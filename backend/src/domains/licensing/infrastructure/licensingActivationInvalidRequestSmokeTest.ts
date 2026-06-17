import type { StaffIdentity } from "../../../auth/types";
import {
  handleStaffLicensingActivation,
} from "./licensingActivationHandler";

export interface LicensingActivationInvalidRequestSmokeTestResult {
  readonly ok: boolean;
  readonly httpStatus: number;
  readonly errorCode: string | null;
}

export class LicensingActivationInvalidRequestSmokeTestAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LicensingActivationInvalidRequestSmokeTestAssertionError";
  }
}

export async function runLicensingActivationInvalidRequestSmokeTest(): Promise<LicensingActivationInvalidRequestSmokeTestResult> {
  const result = await handleStaffLicensingActivation(
    {
      staffIdentity: createSmokeTestStaffIdentity(),
      metadata: {
        requestId: "invalid-request-smoke-test",
        source: "licensing_activation_invalid_request_smoke_test",
      },
      body: {
        gameName: "Missing Purchase Code Game",
      },
    },
    {
      activationRepository: {
        redeemPurchaseCodeForGame: async () => {
          throw new LicensingActivationInvalidRequestSmokeTestAssertionError(
            "Activation repository should not be called for invalid request bodies.",
          );
        },
      },
      runtime: createSmokeTestRuntime(),
    },
  );

  return {
    ok: result.body.ok,
    httpStatus: result.httpStatus,
    errorCode: result.body.ok ? null : result.body.error.code,
  };
}

export async function assertLicensingActivationInvalidRequestSmokeTest(): Promise<LicensingActivationInvalidRequestSmokeTestResult> {
  const result = await runLicensingActivationInvalidRequestSmokeTest();

  if (result.ok) {
    throw new LicensingActivationInvalidRequestSmokeTestAssertionError(
      "Expected invalid request smoke test response to fail safely.",
    );
  }

  if (result.httpStatus !== 400) {
    throw new LicensingActivationInvalidRequestSmokeTestAssertionError(
      `Expected invalid request smoke test httpStatus 400, received ${result.httpStatus}.`,
    );
  }

  if (result.errorCode !== "purchase_code_required") {
    throw new LicensingActivationInvalidRequestSmokeTestAssertionError(
      `Expected errorCode purchase_code_required, received ${result.errorCode}.`,
    );
  }

  return result;
}

function createSmokeTestStaffIdentity(): StaffIdentity {
  return {
    kind: "staff",
    actorType: "staff_user",
    staffUserId: "00000000-0000-4000-8000-000000000020",
    supabaseAuthUserId: "00000000-0000-4000-8000-000000000021",
    email: "invalid-smoke-test@example.com",
    displayName: "Invalid Smoke Test Staff",
  };
}

function createSmokeTestRuntime() {
  return {
    TextEncoder: SmokeTestTextEncoder,
    crypto: {
      subtle: {
        digest: async () => createSmokeTestSha256Buffer(),
      },
    },
  };
}

class SmokeTestTextEncoder {
  encode(value: string): Uint8Array {
    return Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
  }
}

function createSmokeTestSha256Buffer(): ArrayBuffer {
  const buffer = new ArrayBuffer(32);
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = index;
  }

  return buffer;
}
