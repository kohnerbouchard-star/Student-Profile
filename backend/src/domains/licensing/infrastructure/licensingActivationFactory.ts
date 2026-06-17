import type {
  LicensingActivationRouteAdapterDependencies,
} from "../application/licensingActivationRouteAdapter";
import type {
  LicensingActivationRepository,
} from "./licensingRepository";
import {
  createPurchaseCodeSha256Hasher,
} from "./purchaseCodeHasher";
import {
  createWebCryptoSha256HexDigest,
  type WebCryptoRuntime,
} from "./webCryptoSha256Digest";

export interface LicensingActivationFactoryInput {
  readonly activationRepository: LicensingActivationRepository;
  readonly runtime?: WebCryptoRuntime;
}

export function createLicensingActivationRouteAdapterDependencies(
  input: LicensingActivationFactoryInput,
): LicensingActivationRouteAdapterDependencies {
  const digest = createWebCryptoSha256HexDigest(input.runtime);
  const purchaseCodeHasher = createPurchaseCodeSha256Hasher({
    digest,
  });

  return {
    purchaseCodeHasher,
    redeemPurchaseCodeDependencies: {
      activationRepository: input.activationRepository,
    },
  };
}
