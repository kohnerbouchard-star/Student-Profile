#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CREDENTIAL_NAME = String.raw`(?:SUPABASE[ _-]?[A-Z0-9_]*(?:SECRET|KEY|TOKEN|PASSWORD)|DATABASE[ _-]?URL|DB[ _-]?URL|PGPASSWORD|DB[ _-]?PASSWORD|POSTGRES[ _-]?PASSWORD|JWT[ _-]?SECRET|(?:ANON|SERVICE[ _-]?ROLE|SECRET|PUBLISHABLE)[ _-]?KEY|S3[ _-]?(?:ACCESS|SECRET)[ _-]?KEY|S3_[A-Z0-9_]+|ECONOVARIA_[A-Z0-9_]*(?:SECRET|KEY|TOKEN|PASSWORD|PEPPER)|AUTHORIZATION|APIKEY|API[ _-]?KEY|COOKIE|SET[ _-]?COOKIE|X[ _-]?PLAYER[ _-]?SESSION[ _-]?TOKEN|X[ _-]?ECONOVARIA[ _-]?(?:CSRF|PLAYER[ _-]?SESSION)[ _-]?TOKEN)`;

const CREDENTIAL_FIELD_PATTERN = new RegExp(
  String.raw`"?\b${CREDENTIAL_NAME}\b"?[ \t]*(?:=|:|\||│)[ \t]*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n|│]+)`,
  "giu",
);

const REPLACEMENTS = Object.freeze([
  {
    pattern: /"?authorization"?\s*:\s*"?bearer\s+[^\s"']+"?/giu,
    replacement: "[authorization-redacted]",
  },
  {
    pattern: CREDENTIAL_FIELD_PATTERN,
    replacement: "[credential-field-redacted]",
  },
  {
    pattern: /postgres(?:ql)?:\/\/[^\s"'<>]+/giu,
    replacement: "[database-url-redacted]",
  },
  {
    pattern: /\bpostgres:postgres\b/giu,
    replacement: "[database-credential-redacted]",
  },
  {
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu,
    replacement: "[jwt-redacted]",
  },
  {
    pattern: /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/giu,
    replacement: "[supabase-key-redacted]",
  },
  {
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu,
    replacement: "[uuid-redacted]",
  },
  {
    pattern: /-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/gu,
    replacement: "[private-key-redacted]",
  },
]);

const FORBIDDEN = Object.freeze([
  { name: "named credential", pattern: CREDENTIAL_FIELD_PATTERN },
  { name: "database URL", pattern: /postgres(?:ql)?:\/\/[^\s"'<>]+/iu },
  { name: "default database credential", pattern: /\bpostgres:postgres\b/iu },
  { name: "Bearer credential", pattern: /"?authorization"?\s*:\s*"?bearer\s+[^\s"']+"?/iu },
  { name: "JWT", pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u },
  { name: "Supabase key", pattern: /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/iu },
  {
    name: "UUID",
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu,
  },
  { name: "private key", pattern: /-----BEGIN [^-\r\n]*PRIVATE KEY-----/u },
]);

export function redactEconovariaCiLog(value) {
  return REPLACEMENTS.reduce(
    (current, rule) => current.replace(rule.pattern, rule.replacement),
    String(value),
  );
}

export function assertEconovariaCiLogSanitized(value, source = "CI log") {
  const text = String(value);
  for (const rule of FORBIDDEN) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) {
      throw new Error(`${source} still contains ${rule.name}.`);
    }
  }
}

async function readInput() {
  const path = process.argv[2];
  if (path) return readFile(resolve(path), "utf8");
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const sanitized = redactEconovariaCiLog(await readInput());
  assertEconovariaCiLogSanitized(sanitized);
  process.stdout.write(sanitized);
}
