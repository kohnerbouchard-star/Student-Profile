import type {
  StaffUserRecord,
  SupabaseAuthUser,
} from "../../../auth/types";
import type {
  RedeemPurchaseCodeForGameRpcInput,
} from "../infrastructure/licensingRepository";
import {
  handleLicensingActivationHttpRequest,
  type LicensingActivationHttpResponse,
} from "./activationHttpAdapter";

interface SmokeTestJsonBody {
  readonly ok?: boolean;
  readonly activation?: {
    readonly gameSessionId?: string;
  };
  readonly error?: {
    readonly code?: string;
  };
}

export interface LicensingActivationHttpAdapterSmokeTestResult {
  readonly validPost: {
    readonly ok: boolean;
    readonly status: number;
    readonly contentType: string | null;
    readonly gameSessionId: string | null;
    readonly purchaseCodeHash: string | null;
  };
  readonly methodNotAllowed: {
    readonly ok: boolean;
    readonly status: number;
    readonly contentType: string | null;
    readonly errorCode: string | null;
  };
}

export class LicensingActivationHttpAdapterSmokeTestAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LicensingActivationHttpAdapterSmokeTestAssertionError";
  }
}

export async function runLicensingActivationHttpAdapterSmokeTest(): Promise<LicensingActivationHttpAdapterSmokeTestResult> {
  const capturedInput: {
    value: RedeemPurchaseCodeForGameRpcInput | null;
  } = {
    value: null,
  };

  const validPost = await handleLicensingActivationHttpRequest(
    {
      method: "post",
      supabaseAuthUser: createSmokeTestAuthUser(),
      requestId: "http-adapter-smoke-test",
      body: {
        purchaseCode: " http-adapter-smoke-test-code ",
        gameName: "HTTP Adapter Smoke Test Game",
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
            game_session_id: "00000000-0000-4000-8000-000000000201",
            entitlement_id: "00000000-0000-4000-8000-000000000202",
            purchase_code_id: "00000000-0000-4000-8000-000000000203",
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

  const methodNotAllowed = await handleLicensingActivationHttpRequest(
    {
      method: "GET",
      body: {},
    },
    {
      staffRepository: {
        findStaffUserBySupabaseAuthUserId: async () => {
          throw new LicensingActivationHttpAdapterSmokeTestAssertionError(
            "Staff repository should not be called for unsupported HTTP methods.",
          );
        },
      },
      activationRepository: {
        redeemPurchaseCodeForGame: async () => {
          throw new LicensingActivationHttpAdapterSmokeTestAssertionError(
            "Activation repository should not be called for unsupported HTTP methods.",
          );
        },
      },
      runtime: createSmokeTestRuntime(),
    },
  );

  const validPostBody = readJsonBody(validPost);
  const methodNotAllowedBody = readJsonBody(methodNotAllowed);

  return {
    validPost: {
      ok: validPostBody.ok === true,
      status: validPost.status,
      contentType: readContentType(validPost),
      gameSessionId: validPostBody.activation?.gameSessionId ?? null,
      purchaseCodeHash: capturedInput.value?.purchaseCodeHash ?? null,
    },
    methodNotAllowed: {
      ok: methodNotAllowedBody.ok === true,
      status: methodNotAllowed.status,
      contentType: readContentType(methodNotAllowed),
      errorCode: methodNotAllowedBody.error?.code ?? null,
    },
  };
}

export async function assertLicensingActivationHttpAdapterSmokeTest(): Promise<LicensingActivationHttpAdapterSmokeTestResult> {
  const result = await runLicensingActivationHttpAdapterSmokeTest();

  if (!result.validPost.ok) {
    throw new LicensingActivationHttpAdapterSmokeTestAssertionError(
      "Expected valid POST HTTP adapter response to be ok.",
    );
  }

  if (result.validPost.status !== 200) {
    throw new LicensingActivationHttpAdapterSmokeTestAssertionError(
      `Expected valid POST HTTP adapter status 200, received ${result.validPost.status}.`,
    );
  }

  if (result.validPost.contentType !== "application/json; charset=utf-8") {
    throw new LicensingActivationHttpAdapterSmokeTestAssertionError(
      `Expected valid POST content-type application/json; charset=utf-8, received ${result.validPost.contentType}.`,
    );
  }

  if (!result.validPost.gameSessionId) {
    throw new LicensingActivationHttpAdapterSmokeTestAssertionError(
      "Expected valid POST HTTP adapter response to return a gameSessionId.",
    );
  }

  if (!result.validPost.purchaseCodeHash) {
    throw new LicensingActivationHttpAdapterSmokeTestAssertionError(
      "Expected valid POST HTTP adapter response to capture a purchaseCodeHash.",
    );
  }

  if (!/^[a-f0-9]{64}$/.test(result.validPost.purchaseCodeHash)) {
    throw new LicensingActivationHttpAdapterSmokeTestAssertionError(
      "Expected valid POST purchaseCodeHash to be a SHA-256 hex digest.",
    );
  }

  if (result.methodNotAllowed.ok) {
    throw new LicensingActivationHttpAdapterSmokeTestAssertionError(
      "Expected unsupported HTTP method response to fail.",
    );
  }

  if (result.methodNotAllowed.status !== 405) {
    throw new LicensingActivationHttpAdapterSmokeTestAssertionError(
      `Expected unsupported HTTP method status 405, received ${result.methodNotAllowed.status}.`,
    );
  }

  if (result.methodNotAllowed.contentType !== "application/json; charset=utf-8") {
    throw new LicensingActivationHttpAdapterSmokeTestAssertionError(
      `Expected unsupported HTTP method content-type application/json; charset=utf-8, received ${result.methodNotAllowed.contentType}.`,
    );
  }

  if (result.methodNotAllowed.errorCode !== "method_not_allowed") {
    throw new LicensingActivationHttpAdapterSmokeTestAssertionError(
      `Expected unsupported HTTP method errorCode method_not_allowed, received ${result.methodNotAllowed.errorCode}.`,
    );
  }

  return result;
}

function readJsonBody(response: LicensingActivationHttpResponse): SmokeTestJsonBody {
  return response.body as SmokeTestJsonBody;
}

function readContentType(response: LicensingActivationHttpResponse): string | null {
  return response.headers["content-type"] ?? null;
}

function createSmokeTestAuthUser(): SupabaseAuthUser {
  return {
    id: "00000000-0000-4000-8000-000000000210",
    email: "http-adapter-smoke-test@example.com",
  };
}

function createSmokeTestStaffUser(): StaffUserRecord {
  return {
    id: "00000000-0000-4000-8000-000000000211",
    supabase_auth_user_id: "00000000-0000-4000-8000-000000000210",
    email: "http-adapter-smoke-test@example.com",
    display_name: "HTTP Adapter Smoke Test Staff",
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
