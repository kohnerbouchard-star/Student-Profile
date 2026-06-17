import {
  assertLicensingActivationInvalidRequestSmokeTest,
  type LicensingActivationInvalidRequestSmokeTestResult,
} from "./licensingActivationInvalidRequestSmokeTest";
import {
  assertLicensingActivationHandlerSmokeTest,
} from "./licensingActivationSmokeTestAssertions";
import type {
  LicensingActivationSmokeTestResult,
} from "./licensingActivationSmokeTest";

export interface LicensingActivationSmokeTestSuiteResult {
  readonly validActivation: LicensingActivationSmokeTestResult;
  readonly invalidRequest: LicensingActivationInvalidRequestSmokeTestResult;
}

export async function assertLicensingActivationSmokeTestSuite(): Promise<LicensingActivationSmokeTestSuiteResult> {
  const validActivation = await assertLicensingActivationHandlerSmokeTest();
  const invalidRequest = await assertLicensingActivationInvalidRequestSmokeTest();

  return {
    validActivation,
    invalidRequest,
  };
}
