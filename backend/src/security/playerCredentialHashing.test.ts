import { EdgeActivationError } from "../platform/supabase/edgeResponse.ts";
import {
  createPlayerCredentialMaterial,
  derivePlayerCredentialLookupDigest,
  isLegacyPlayerCredential,
  PLAYER_CREDENTIAL_RUNTIME_ERROR_CODE,
  PLAYER_CREDENTIAL_VERSION,
  readPlayerCredentialRuntimeStatus,
  requirePlayerCredentialRuntimePepper,
  verifyPlayerCredential,
} from "./playerCredentialHashing.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const PEPPER = "0123456789abcdef0123456789abcdef";
const SALT = Uint8Array.from([
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
]);

Deno.test("derives the same peppered lookup digest without PBKDF2 material", async () => {
  const lookupDigest = await derivePlayerCredentialLookupDigest("938204", {
    pepper: PEPPER,
  });
  const material = await createPlayerCredentialMaterial("938204", {
    pepper: PEPPER,
    saltBytes: SALT,
    iterations: 100_000,
  });
  const differentDigest = await derivePlayerCredentialLookupDigest("938205", {
    pepper: PEPPER,
  });

  assertEquals(lookupDigest, material.lookupDigest);
  assertEquals(lookupDigest.length, 64);
  assertEquals(lookupDigest === differentDigest, false);
  assertEquals(lookupDigest.includes("938204"), false);
});

Deno.test("creates deterministic versioned material without plaintext", async () => {
  const material = await createPlayerCredentialMaterial("938204", {
    pepper: PEPPER,
    saltBytes: SALT,
    iterations: 100_000,
  });

  assertEquals(material.credentialVersion, PLAYER_CREDENTIAL_VERSION);
  assertEquals(material.iterations, 100_000);
  assertEquals(material.lookupDigest.length, 64);
  assertEquals(material.salt.length, 22);
  assertEquals(material.verifier.length, 43);
  assertEquals(JSON.stringify(material).includes("938204"), false);
});

Deno.test("verifies the right Access Code and rejects the wrong one", async () => {
  const material = await createPlayerCredentialMaterial("938204", {
    pepper: PEPPER,
    saltBytes: SALT,
    iterations: 100_000,
  });
  const record = {
    credential_version: material.credentialVersion,
    normalized_student_code_hash: material.lookupDigest,
    credential_salt: material.salt,
    credential_verifier: material.verifier,
    credential_iterations: material.iterations,
  };

  assertEquals(
    await verifyPlayerCredential("938204", record, { pepper: PEPPER }),
    true,
  );
  assertEquals(
    await verifyPlayerCredential("938205", record, { pepper: PEPPER }),
    false,
  );
});

Deno.test("recognizes only the bounded legacy SHA-256 shape", () => {
  assertEquals(
    isLegacyPlayerCredential({
      credential_version: "sha256-v1",
      normalized_student_code_hash: "a".repeat(64),
      credential_salt: null,
      credential_verifier: null,
      credential_iterations: null,
    }),
    true,
  );
  assertEquals(
    isLegacyPlayerCredential({
      credential_version: PLAYER_CREDENTIAL_VERSION,
      normalized_student_code_hash: "a".repeat(64),
      credential_salt: "salt",
      credential_verifier: "verifier",
      credential_iterations: 600_000,
    }),
    false,
  );
});

Deno.test("rejects an undersized explicit pepper", async () => {
  let threw = false;
  try {
    await createPlayerCredentialMaterial("938204", {
      pepper: "too-short",
      saltBytes: SALT,
      iterations: 100_000,
    });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("reports only bounded credential runtime readiness metadata", () => {
  assertEquals(readPlayerCredentialRuntimeStatus(PEPPER), {
    ok: true,
    credentialVersion: PLAYER_CREDENTIAL_VERSION,
    iterations: 600_000,
  });
  assertEquals(readPlayerCredentialRuntimeStatus(""), {
    ok: false,
    code: PLAYER_CREDENTIAL_RUNTIME_ERROR_CODE,
    retryable: true,
  });
});

Deno.test("maps a missing runtime pepper to a retryable HTTP 503 error", () => {
  let captured: unknown = null;
  try {
    requirePlayerCredentialRuntimePepper("");
  } catch (error) {
    captured = error;
  }

  assertEquals(captured instanceof EdgeActivationError, true);
  const error = captured as EdgeActivationError;
  assertEquals(error.code, PLAYER_CREDENTIAL_RUNTIME_ERROR_CODE);
  assertEquals(error.status, 503);
  assertEquals(error.retryable, true);
  assertEquals(error.message.includes("ECONOVARIA_PLAYER_CREDENTIAL_PEPPER"), false);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }.`,
    );
  }
}
