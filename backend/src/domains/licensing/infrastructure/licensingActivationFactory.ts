import type {
  LicensingActivationRouteAdapterDependencies,
} from "../application/licensingActivationRouteAdapter.ts";
import type {
  LicensingActivationRepository,
} from "./licensingRepository.ts";
import {
  createPurchaseCodeHmacSha256Hasher,
  readPurchaseCodeHmacSecret,
} from "./purchaseCodeHasher.ts";
import {
  createWebCryptoSha256HexDigest,
  type WebCryptoRuntime,
} from "./webCryptoSha256Digest.ts";

export interface LicensingActivationFactoryInput {
  readonly activationRepository: LicensingActivationRepository;
  readonly runtime?: WebCryptoRuntime;
  readonly purchaseCodeHmacSecret?: string;
  readonly readPurchaseCodeHmacSecret?: () => string | undefined;
}

export function createLicensingActivationRouteAdapterDependencies(
  input: LicensingActivationFactoryInput,
): LicensingActivationRouteAdapterDependencies {
  const digest = createWebCryptoSha256HexDigest(input.runtime);
  const purchaseCodeHasher = createPurchaseCodeHmacSha256Hasher({
    digest,
    hmacSecret: input.purchaseCodeHmacSecret,
    readHmacSecret: input.readPurchaseCodeHmacSecret ?? readPurchaseCodeHmacSecret,
  });

  return {
    purchaseCodeHasher,
    redeemPurchaseCodeDependencies: {
      activationRepository: input.activationRepository,
    },
  };
}
