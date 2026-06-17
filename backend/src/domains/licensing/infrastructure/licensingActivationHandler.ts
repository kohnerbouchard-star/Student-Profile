import type { StaffIdentity } from "../../../auth/types";
import {
  handleLicensingActivationRequest,
  type LicensingActivationRouteAdapterResult,
} from "../application/licensingActivationRouteAdapter";
import {
  buildLicensingActivationRouteContext,
  type LicensingActivationRequestMetadata,
} from "../contracts/activationRouteContext";
import {
  createLicensingActivationRouteAdapterDependencies,
} from "./licensingActivationFactory";
import type { LicensingActivationRepository } from "./licensingRepository";
import type { WebCryptoRuntime } from "./webCryptoSha256Digest";

export interface LicensingActivationHandlerInput {
  readonly body: unknown;
  readonly staffIdentity: StaffIdentity;
  readonly metadata?: LicensingActivationRequestMetadata;
}

export interface LicensingActivationHandlerDependencies {
  readonly activationRepository: LicensingActivationRepository;
  readonly runtime?: WebCryptoRuntime;
}

export async function handleStaffLicensingActivation(
  input: LicensingActivationHandlerInput,
  dependencies: LicensingActivationHandlerDependencies,
): Promise<LicensingActivationRouteAdapterResult> {
  const context = buildLicensingActivationRouteContext(
    input.staffIdentity,
    input.metadata,
  );

  const adapterDependencies = createLicensingActivationRouteAdapterDependencies({
    activationRepository: dependencies.activationRepository,
    runtime: dependencies.runtime,
  });

  return handleLicensingActivationRequest(
    input.body,
    context,
    adapterDependencies,
  );
}
