import {
  runLicensingActivationHandlerSmokeTest,
  type LicensingActivationSmokeTestResult,
} from "./licensingActivationSmokeTest";

export class LicensingActivationSmokeTestAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LicensingActivationSmokeTestAssertionError";
  }
}

export async function assertLicensingActivationHandlerSmokeTest(): Promise<LicensingActivationSmokeTestResult> {
  const result = await runLicensingActivationHandlerSmokeTest();

  if (!result.ok) {
    throw new LicensingActivationSmokeTestAssertionError(
      "Expected licensing activation smoke test response to be ok.",
    );
  }

  if (result.httpStatus !== 200) {
    throw new LicensingActivationSmokeTestAssertionError(
      `Expected smoke test httpStatus 200, received ${result.httpStatus}.`,
    );
  }

  if (!result.gameSessionId) {
    throw new LicensingActivationSmokeTestAssertionError(
      "Expected smoke test to return a gameSessionId.",
    );
  }

  if (!result.purchaseCodeHash) {
    throw new LicensingActivationSmokeTestAssertionError(
      "Expected smoke test to capture a purchaseCodeHash.",
    );
  }

  if (!/^[a-f0-9]{64}$/.test(result.purchaseCodeHash)) {
    throw new LicensingActivationSmokeTestAssertionError(
      "Expected smoke test purchaseCodeHash to be a SHA-256 hex digest.",
    );
  }

  return result;
}
