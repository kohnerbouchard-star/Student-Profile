import fs from "node:fs";
import crypto from "node:crypto";

function args(argv) { const out = {}; for (let i = 0; i < argv.length; i += 2) out[argv[i]?.replace(/^--/, "")] = argv[i + 1]; return out; }
function hash(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function read(file) { const buffer = fs.readFileSync(file); return { value: JSON.parse(buffer.toString("utf8")), sha256: hash(buffer) }; }
function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (["authorization", "apikey", "cookie", "setcookie", "secret", "token", "password", "body", "content", "source"].includes(normalized)) {
      if (["secretname", "secret_names", "bindingname", "binding_names"].includes(key.toLowerCase())) result[key] = sanitize(nested);
      continue;
    }
    result[key] = sanitize(nested);
  }
  return result;
}

const input = args(process.argv.slice(2));
if (!input.supabase || !input.cloudflare || !input.out) {
  console.error("Use --supabase <json> --cloudflare <json> --out <json>.");
  process.exitCode = 1;
} else {
  const supabase = read(input.supabase);
  const cloudflare = read(input.cloudflare);
  const snapshot = { schemaVersion: 1, generatedAt: new Date().toISOString(), inputs: { supabaseSha256: supabase.sha256, cloudflareSha256: cloudflare.sha256 }, supabase: sanitize(supabase.value), cloudflare: sanitize(cloudflare.value), secretValuesRetained: false };
  fs.mkdirSync(new URL(".", `file://${input.out}`).pathname, { recursive: true });
  fs.writeFileSync(input.out, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`Wrote sanitized runtime snapshot to ${input.out}`);
}
