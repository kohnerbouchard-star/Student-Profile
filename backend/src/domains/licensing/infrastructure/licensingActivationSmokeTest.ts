import type { StaffIdentity } from "../../../auth/types";
import type { RedeemPurchaseCodeForGameRpcInput } from "./licensingRepository";
import {
  handleStaffLicensingActivation,
  type LicensingActivationHandlerInput,
} from "./licensingActivationHandler";

export interface LicensingActivationSmokeTestResult {
  readonly ok: boolean;
  readonly httpStatus: number;
  readonly purchaseCodeHash: string | null;
  readonly gameSessionId: string | null;
}

export async function runLicensingActivationHandlerSmokeTest(): Promise<LicensingActivationSmokeTestResult> {
  const capturedInput: {
    value: RedeemPurchaseCodeForGameRpcInput | null;
  } = {
    value: null,
  };

  const result = await handleStaffLicensingActivation(
    createSmokeTestInput(),
    {
      activationRepository: {
        redeemPurchaseCodeForGame: async (input) => {
          capturedInput.value = input;

          return {
            game_session_id: "00000000-0000-4000-8000-000000000001",
            entitlement_id: "00000000-0000-4000-8000-000000000002",
            purchase_code_id: "00000000-0000-4000-8000-000000000003",
            purchase_code_status: "active",
            redeemed_count: 1,
            max_redemptions: 1,
            activated_at: "2026-06-17T00:00:00.000Z",
          };
        },
      },
      runtime: createSmokeTestRuntime(),
    },
  );

  return {
    ok: result.body.ok,
    httpStatus: result.httpStatus,
    purchaseCodeHash: capturedInput.value?.purchaseCodeHash ?? null,
    gameSessionId: result.body.ok ? result.body.activation.gameSessionId : null,
  };
}

function createSmokeTestInput(): LicensingActivationHandlerInput {
  return {
    staffIdentity: createSmokeTestStaffIdentity(),
    metadata: {
      requestId: "smoke-test-request",
      source: "licensing_activation_smoke_test",
    },
    body: {
      purchaseCode: " smoke-test-code ",
      gameName: "Smoke Test Game",
      difficultyPreset: "standard",
      attendanceWindow: {},
      businessMarketWindow: {},
      stockMarketWindow: {},
      newsSchedule: {},
    },
  };
}

function createSmokeTestStaffIdentity(): StaffIdentity {
  return {
    kind: "staff",
    actorType: "staff_user",
    staffUserId: "00000000-0000-4000-8000-000000000010",
    supabaseAuthUserId: "00000000-0000-4000-8000-000000000011",
    email: "smoke-test@example.com",
    displayName: "Smoke Test Staff",
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
