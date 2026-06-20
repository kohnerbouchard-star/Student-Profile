import type {
  LicensingActivationRouteAdapterDependencies,
} from "../application/licensingActivationRouteAdapter.ts";
import type {
  LicensingActivationRepository,
} from "./licensingRepository.ts";
import {
  createPurchaseCodeSha256Hasher,
} from "./purchaseCodeHasher.ts";
import {
  createWebCryptoSha256HexDigest,
  type WebCryptoRuntime,
} from "./webCryptoSha256Digest.ts";

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
