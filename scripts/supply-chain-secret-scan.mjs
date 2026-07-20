#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import process from "node:process";

const repositoryRoot = resolve(new URL("..", import.meta.url).pathname);
const allowMarker = "secret-scan: allow";

const ignoredExtensions = new Set([
  ".7z", ".avif", ".bmp", ".bz2", ".class", ".db", ".dll", ".dylib",
  ".eot", ".exe", ".gif", ".gz", ".ico", ".jar", ".jpeg", ".jpg", ".lockb",
  ".mov", ".mp3", ".mp4", ".otf", ".pdf", ".png", ".sqlite", ".tar", ".tgz",
  ".ttf", ".wasm", ".webm", ".webp", ".woff", ".woff2", ".xlsx", ".zip"
]);

const rules = Object.freeze([
  {
    id: "private-key",
    description: "private key material",
    expression: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/
  },
  {
    id: "github-token",
    description: "GitHub access token",
    expression: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/
  },
  {
    id: "aws-access-key",
    description: "AWS access key identifier",
    expression: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/
  },
  {
    id: "slack-token",
    description: "Slack token",
    expression: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/
  },
  {
    id: "google-api-key",
    description: "Google API key",
    expression: /\bAIza[0-9A-Za-z_-]{35}\b/
  },
  {
    id: "stripe-live-secret",
    description: "Stripe live secret key",
    expression: /\bsk_live_[0-9A-Za-z]{20,}\b/
  },
  {
    id: "service-role-assignment",
    description: "service-role credential assignment",
    expression: /\b(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\s*[:=]\s*["'][A-Za-z0-9._-]{20,}["']/
  }
]);

function repositoryFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return output.split("\0").filter(Boolean).map((file) => resolve(repositoryRoot, file));
}

function requestedFiles(arguments_) {
  return arguments_.length
    ? arguments_.map((file) => resolve(process.cwd(), file))
    : repositoryFiles();
}

function isScannable(file) {
  try {
    if (!statSync(file).isFile()) return false;
  } catch {
    return false;
  }
  return !ignoredExtensions.has(extname(file).toLowerCase());
}

function displayPath(file) {
  const path = relative(repositoryRoot, file);
  return path.startsWith("..") ? file : path;
}

const findings = [];

for (const file of requestedFiles(process.argv.slice(2))) {
  if (!isScannable(file)) continue;
  const content = readFileSync(file);
  if (content.includes(0)) continue;
  const lines = content.toString("utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.includes(allowMarker)) return;
    for (const rule of rules) {
      if (!rule.expression.test(line)) continue;
      findings.push({
        file: displayPath(file),
        line: index + 1,
        rule: rule.id,
        description: rule.description
      });
    }
  });
}

if (findings.length) {
  console.error(`Secret scan failed with ${findings.length} high-confidence finding${findings.length === 1 ? "" : "s"}:`);
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.rule}] ${finding.description}`);
  }
  console.error(`Use '${allowMarker}' only for reviewed non-secret test or documentation lines.`);
  process.exitCode = 1;
} else {
  console.log("Secret scan passed: no high-confidence credentials found.");
}
