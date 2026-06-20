import type { Sha256HexDigest } from "./purchaseCodeHasher.ts";
import {
  createRuntimeAgnosticSha256HexDigest,
  type Sha256BytesDigest,
  type Utf8BytesEncoder,
} from "./sha256HexDigest.ts";

export interface WebCryptoRuntime {
  readonly TextEncoder?: new () => {
    encode(value: string): Uint8Array;
  };
  readonly crypto?: {
    readonly subtle?: {
      digest(algorithm: string, value: Uint8Array): Promise<ArrayBuffer>;
    };
  };
}

export class WebCryptoSha256DigestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebCryptoSha256DigestError";
  }
}

export function createWebCryptoSha256HexDigest(
  runtime: WebCryptoRuntime = getDefaultWebCryptoRuntime(),
): Sha256HexDigest {
  const TextEncoderConstructor = runtime.TextEncoder;
  const subtleCrypto = runtime.crypto?.subtle;

  if (!TextEncoderConstructor) {
    throw new WebCryptoSha256DigestError("TextEncoder runtime is not available.");
  }

  if (!subtleCrypto) {
    throw new WebCryptoSha256DigestError(
      "Web Crypto SHA-256 runtime is not available.",
    );
  }

  const textEncoder = new TextEncoderConstructor();

  const encoder: Utf8BytesEncoder = {
    encodeUtf8: (value) => textEncoder.encode(value),
  };

  const digest: Sha256BytesDigest = {
    digestSha256: (value) => subtleCrypto.digest("SHA-256", value),
  };

  return createRuntimeAgnosticSha256HexDigest({
    encoder,
    digest,
  });
}

function getDefaultWebCryptoRuntime(): WebCryptoRuntime {
  return globalThis as unknown as WebCryptoRuntime;
}
