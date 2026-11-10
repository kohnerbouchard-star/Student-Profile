import { createPlayerCredentialMaterial } from "../src/security/playerCredentialHashing.ts";
// Synthetic, offline benchmark only. This is not an Edge runtime qualification.
// Never print generated material or use a deployment's credential pepper.
for (const rows of [1, 30, 200]) {
  const start = performance.now();
  for (let row = 0; row < rows; row += 1) {
    await createPlayerCredentialMaterial(`SYNTHETIC-BENCHMARK-${row}`, {
      pepper: "synthetic-benchmark-only-not-a-runtime-secret",
    });
  }
  console.log(
    JSON.stringify({
      rows,
      iterations: 600000,
      wallMs: Math.round(performance.now() - start),
    }),
  );
}
