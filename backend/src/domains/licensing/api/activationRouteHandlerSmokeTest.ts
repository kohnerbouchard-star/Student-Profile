import type {
  StaffUserRecord,
  SupabaseAuthUser,
} from "../../../auth/types";
import type {
  RedeemPurchaseCodeForGameRpcInput,
} from "../infrastructure/licensingRepository";
import {
  handleLicensingActivationRoute,
} from "./activationRouteHandler";

export interface LicensingActivationApiBoundarySmokeTestResult {
  readonly validActivation: {
    readonly ok: boolean;
    readonly status: number;
    readonly gameSessionId: string | null;
    readonly purchaseCodeHash: string | null;
  };
  readonly missingAuth: {
    readonly ok: boolean;
    readonly status: number;
    readonly errorCode: string | null;
  };
}

export class LicensingActivationApiBoundarySmokeTestAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LicensingActivationApiBoundarySmokeTestAssertionError";
  }
}

export async function runLicensingActivationApiBoundarySmokeTest(): Promise<LicensingActivationApiBoundarySmokeTestResult> {
  const capturedInput: {
    value: RedeemPurchaseCodeForGameRpcInput | null;
  } = {
    value: null,
  };

  const validActivation = await handleLicensingActivationRoute(
    {
      supabaseAuthUser: createSmokeTestAuthUser(),
      requestId: "api-boundary-smoke-test",
      source: "licensing_activation_api_boundary_smoke_test",
      body: {
        purchaseCode: " api-boundary-smoke-test-code ",
        gameName: "API Boundary Smoke Test Game",
        difficultyPreset: "standard",
        attendanceWindow: {},
        businessMarketWindow: {},
        stockMarketWindow: {},
        newsSchedule: {},
      },
    },
    {
      staffRepository: {
        findStaffUserBySupabaseAuthUserId: async () => createSmokeTestStaffUser(),
      },
      activationRepository: {
        redeemPurchaseCodeForGame: async (input) => {
          capturedInput.value = input;

          return {
            game_session_id: "00000000-0000-4000-8000-000000000101",
            entitlement_id: "00000000-0000-4000-8000-000000000102",
            purchase_code_id: "00000000-0000-4000-8000-000000000103",
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

  const missingAuth = await handleLicensingActivationRoute(
    {
      body: {
        purchaseCode: "unused-code",
        gameName: "Missing Auth Game",
      },
    },
    {
      staffRepository: {
        findStaffUserBySupabaseAuthUserId: async () => {
          throw new LicensingActivationApiBoundarySmokeTestAssertionError(
            "Staff repository should not be called when auth user is missing.",
          );
        },
      },
      activationRepository: {
        redeemPurchaseCodeForGame: async () => {
          throw new LicensingActivationApiBoundarySmokeTestAssertionError(
            "Activation repository should not be called when auth user is missing.",
          );
        },
      },
      runtime: createSmokeTestRuntime(),
    },
  );

  return {
    validActivation: {
      ok: validActivation.ok,
      status: validActivation.status,
      gameSessionId: validActivation.body.ok
        ? validActivation.body.activation.gameSessionId
        : null,
      purchaseCodeHash: capturedInput.value?.purchaseCodeHash ?? null,
    },
    missingAuth: {
      ok: missingAuth.ok,
      status: missingAuth.status,
      errorCode: missingAuth.body.ok ? null : missingAuth.body.error.code,
    },
  };
}

export async function assertLicensingActivationApiBoundarySmokeTest(): Promise<LicensingActivationApiBoundarySmokeTestResult> {
  const result = await runLicensingActivationApiBoundarySmokeTest();

  if (!result.validActivation.ok) {
    throw new LicensingActivationApiBoundarySmokeTestAssertionError(
      "Expected valid API boundary activation response to be ok.",
    );
  }

  if (result.validActivation.status !== 200) {
    throw new LicensingActivationApiBoundarySmokeTestAssertionError(
      `Expected valid API boundary activation status 200, received ${result.validActivation.status}.`,
    );
  }

  if (!result.validActivation.gameSessionId) {
    throw new LicensingActivationApiBoundarySmokeTestAssertionError(
      "Expected valid API boundary activation to return a gameSessionId.",
    );
  }

  if (!result.validActivation.purchaseCodeHash) {
    throw new LicensingActivationApiBoundarySmokeTestAssertionError(
      "Expected valid API boundary activation to capture a purchaseCodeHash.",
    );
  }

  if (!/^[a-f0-9]{64}$/.test(result.validActivation.purchaseCodeHash)) {
    throw new LicensingActivationApiBoundarySmokeTestAssertionError(
      "Expected valid API boundary purchaseCodeHash to be a SHA-256 hex digest.",
    );
  }

  if (result.missingAuth.ok) {
    throw new LicensingActivationApiBoundarySmokeTestAssertionError(
      "Expected missing auth API boundary response to fail safely.",
    );
  }

  if (result.missingAuth.status !== 401) {
    throw new LicensingActivationApiBoundarySmokeTestAssertionError(
      `Expected missing auth API boundary status 401, received ${result.missingAuth.status}.`,
    );
  }

  if (result.missingAuth.errorCode !== "missing_staff_auth_user") {
    throw new LicensingActivationApiBoundarySmokeTestAssertionError(
      `Expected missing auth errorCode missing_staff_auth_user, received ${result.missingAuth.errorCode}.`,
    );
  }

  return result;
}

function createSmokeTestAuthUser(): SupabaseAuthUser {
  return {
    id: "00000000-0000-4000-8000-000000000110",
    email: "api-boundary-smoke-test@example.com",
  };
}

function createSmokeTestStaffUser(): StaffUserRecord {
  return {
    id: "00000000-0000-4000-8000-000000000111",
    supabase_auth_user_id: "00000000-0000-4000-8000-000000000110",
    email: "api-boundary-smoke-test@example.com",
    display_name: "API Boundary Smoke Test Staff",
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
