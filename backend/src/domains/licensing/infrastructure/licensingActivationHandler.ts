import type { StaffIdentity } from "../../../auth/types.ts";
import {
  handleLicensingActivationRequest,
  type LicensingActivationRouteAdapterResult,
} from "../application/licensingActivationRouteAdapter.ts";
import {
  buildLicensingActivationRouteContext,
  type LicensingActivationRequestMetadata,
} from "../contracts/activationRouteContext.ts";
import {
  createLicensingActivationRouteAdapterDependencies,
} from "./licensingActivationFactory.ts";
import type { LicensingActivationRepository } from "./licensingRepository.ts";
import type { WebCryptoRuntime } from "./webCryptoSha256Digest.ts";

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
