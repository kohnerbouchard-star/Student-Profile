// Compatibility entrypoint retained for workflows and tooling that still invoke
// the original audit name. The v2 contract is the canonical Admin shell audit.
await import("./admin-shell-identity-v2-smoke.mjs");
