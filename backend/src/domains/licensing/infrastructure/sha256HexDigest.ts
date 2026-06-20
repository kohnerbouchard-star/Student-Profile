import type { Sha256HexDigest } from "./purchaseCodeHasher.ts";

export interface Utf8BytesEncoder {
  encodeUtf8(value: string): Uint8Array;
}

export interface Sha256BytesDigest {
  digestSha256(value: Uint8Array): Promise<ArrayBuffer>;
}

export interface RuntimeAgnosticSha256HexDigestDependencies {
  readonly encoder: Utf8BytesEncoder;
  readonly digest: Sha256BytesDigest;
}

export function createRuntimeAgnosticSha256HexDigest(
  dependencies: RuntimeAgnosticSha256HexDigestDependencies,
): Sha256HexDigest {
  return {
    digestUtf8ToHex: (value) => digestUtf8ToHex(value, dependencies),
  };
}

export async function digestUtf8ToHex(
  value: string,
  dependencies: RuntimeAgnosticSha256HexDigestDependencies,
): Promise<string> {
  const bytes = dependencies.encoder.encodeUtf8(value);
  const digestBuffer = await dependencies.digest.digestSha256(bytes);

  return arrayBufferToHex(digestBuffer);
}

export function arrayBufferToHex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
