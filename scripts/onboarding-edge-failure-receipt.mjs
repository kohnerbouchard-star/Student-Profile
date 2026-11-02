import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertEconovariaCiLogSanitized, redactEconovariaCiLog } from "./redact-econovaria-ci-log.mjs";

const PROJECT = "econovaria";
const NAME = `supabase_edge_runtime_${PROJECT}`;
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const FORMAT = '{"id":{{json .Id}},"name":{{json .Name}},"created":{{json .Created}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}';

export function sanitizeOnboardingRuntimeLog(raw, env = {}) {
  let text = String(raw);
  for (const [name, value] of Object.entries(env)) {
    if (/secret|password|token|key|proxy/iu.test(name) && value?.length >= 6) text = text.split(value).join("[environment-value-redacted]");
  }
  text = redactEconovariaCiLog(text)
    .replace(/https?:\/\/[^\s"'<>]+/giu, (value) => {
      try { const url = new URL(value); url.username = ""; url.password = ""; url.search = ""; url.hash = ""; return url.href; }
      catch { return "[url-redacted]"; }
    })
    .replace(/\b(?:Bearer|Basic)\s+[^\s"']+/giu, "[authorization-redacted]")
    .replace(/"?\b(?:[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY)|token|secret|password|credential|api[_-]?key)"?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n]+)/giu, "[credential-redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[email-redacted]")
    .replace(/\x1b\][^\u0007]*(?:\u0007|\x1b\\)/gu, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, "")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/gu, "");
  assertEconovariaCiLogSanitized(text);
  const receipt = { originalBytes: Buffer.byteLength(raw), sha256: createHash("sha256").update(raw).digest("hex"), truncated: false, lines: text.split("\n") };
  while (Buffer.byteLength(JSON.stringify(receipt)) > 8192 && receipt.lines.length) { receipt.lines.pop(); receipt.truncated = true; }
  return receipt;
}

// Read only this job's exact container; never enumerate, start, stop or remove resources.
export function observeOnboardingEdgeFailure(mode, { env = process.env, run = spawnSync, now = Date.now } = {}) {
  const receipt = { mode, available: false, errorClass: "observation_unavailable" };
  try {
    if (!env.RUNNER_TEMP || !/^\d+$/u.test(env.GITHUB_RUN_ID || "") || !/^\d+$/u.test(env.GITHUB_RUN_ATTEMPT || "") || !/^[A-Za-z0-9_-]+$/u.test(env.GITHUB_JOB || "") || !/^[a-f0-9]{40}$/u.test(env.RELEASE_COMMIT || "")) return receipt;
    if (env.DOCKER_HOST && env.DOCKER_HOST !== "unix:///var/run/docker.sock") return { ...receipt, errorClass: "docker_context_unverified" };
    const childEnv = Object.fromEntries(["PATH", "HOME", "DOCKER_CONFIG", "DOCKER_CONTEXT", "DOCKER_HOST", "XDG_CONFIG_HOME"].filter((key) => env[key]).map((key) => [key, env[key]]));
    const command = (tool, args) => run(tool, args, { cwd: ROOT, env: childEnv, encoding: "utf8", timeout: 5000, maxBuffer: 131072 });
    const ok = (result) => !result.error && !result.signal && result.status === 0;
    const context = command("docker", ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"]);
    if (!ok(context) || JSON.parse(context.stdout) !== "unix:///var/run/docker.sock") return { ...receipt, errorClass: "docker_context_unverified" };
    const head = command("git", ["rev-parse", "HEAD"]);
    if (!ok(head) || head.stdout.trim() !== env.RELEASE_COMMIT) return { ...receipt, errorClass: "source_unverified" };
    if (!/^project_id = "econovaria"\r?$/mu.test(readFileSync(join(ROOT, "backend/supabase/config.toml"), "utf8"))) return { ...receipt, errorClass: "project_unverified" };
    const identity = { run: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, job: env.GITHUB_JOB, head: env.RELEASE_COMMIT };
    const path = join(env.RUNNER_TEMP, "onboarding-edge-ownership.json");
    if (mode === "prepare") {
      const before = command("docker", ["container", "inspect", "--format", "{{.Id}}", NAME]);
      const absent = !before.error && !before.signal && before.status === 1 && /^(?:Error response from daemon:|Error:) No such (?:object|container): supabase_edge_runtime_econovaria\s*$/u.test(before.stderr);
      writeFileSync(path, JSON.stringify({ ...identity, absent, since: new Date(now()).toISOString() }), { flag: "wx", mode: 0o600 });
      return { ...receipt, errorClass: absent ? "none" : "preexisting_or_unverified_container", available: absent };
    }
    if (mode !== "capture") return receipt;
    const owner = JSON.parse(readFileSync(path, "utf8"));
    if (!owner.absent || Object.entries(identity).some(([key, value]) => owner[key] !== value) || !Number.isFinite(Date.parse(owner.since))) return { ...receipt, errorClass: "ownership_unverified" };
    const inspection = command("docker", ["container", "inspect", "--format", FORMAT, NAME]);
    if (!ok(inspection)) return { ...receipt, errorClass: "container_unavailable" };
    const container = JSON.parse(inspection.stdout);
    if (!/^[a-f0-9]{64}$/u.test(container.id) || container.name !== `/${NAME}` || container.project !== PROJECT || !(Date.parse(container.created) >= Date.parse(owner.since))) return { ...receipt, errorClass: "ownership_unverified" };
    const logs = command("docker", ["logs", "--since", owner.since, "--tail", "80", "--timestamps", container.id]);
    if (!ok(logs)) return { ...receipt, errorClass: "container_logs_unavailable" };
    return { ...receipt, ...identity, available: true, errorClass: "none", streamOrder: "stdout-then-stderr", log: sanitizeOnboardingRuntimeLog(`${logs.stdout}\n${logs.stderr}`, env) };
  } catch { return receipt; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`ONBOARDING_EDGE_FAILURE ${JSON.stringify(observeOnboardingEdgeFailure(process.argv[2]))}`);
}
