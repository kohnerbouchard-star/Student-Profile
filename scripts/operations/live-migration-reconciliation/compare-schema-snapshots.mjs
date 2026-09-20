#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const IGNORED_KEYS = new Set(["captured_at", "generated_at", "capturedAt", "generatedAt"]);
const SUPABASE_HOSTED_PROFILE = "supabase-hosted-live-v1";
const HOSTED_LOGIN_MEMBERSHIP = Object.freeze({
  role: "postgres",
  member: "cli_login_postgres",
  grantor: "supabase_admin",
  adminOption: false,
});
const LOCAL_PLATFORM_MEMBERSHIPS = Object.freeze([
  Object.freeze({
    role: "supabase_functions_admin",
    member: "postgres",
    grantor: "supabase_admin",
    adminOption: false,
  }),
  Object.freeze({
    role: "supabase_realtime_admin",
    member: "postgres",
    grantor: "supabase_admin",
    adminOption: false,
  }),
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isMembership(row, expected) {
  return row?.role === expected.role && row?.member === expected.member;
}

function isExactMembership(row, expected) {
  return isMembership(row, expected) &&
    row.grantor === expected.grantor &&
    row.adminOption === expected.adminOption &&
    Object.keys(row).length === Object.keys(expected).length;
}

function requireMembershipProfile(rows, expected, count, label) {
  const identityRows = rows.filter((row) => isMembership(row, expected));
  const exactRows = identityRows.filter((row) => isExactMembership(row, expected));
  assert(
    identityRows.length === count && exactRows.length === count,
    `${label} role-membership topology mismatch for ${expected.role}/${expected.member}.`,
  );
}

export function normalizeSupabaseHostedPair(leftInput, rightInput) {
  const left = structuredClone(leftInput);
  const right = structuredClone(rightInput);
  const leftRows = left?.authorization?.roleMemberships;
  const rightRows = right?.authorization?.roleMemberships;
  assert(Array.isArray(leftRows), "Canonical schema has no roleMemberships array.");
  assert(Array.isArray(rightRows), "Hosted schema has no roleMemberships array.");

  requireMembershipProfile(leftRows, HOSTED_LOGIN_MEMBERSHIP, 0, "Canonical");
  requireMembershipProfile(rightRows, HOSTED_LOGIN_MEMBERSHIP, 1, "Hosted");
  for (const membership of LOCAL_PLATFORM_MEMBERSHIPS) {
    requireMembershipProfile(leftRows, membership, 1, "Canonical");
    requireMembershipProfile(rightRows, membership, 0, "Hosted");
  }

  const managed = [HOSTED_LOGIN_MEMBERSHIP, ...LOCAL_PLATFORM_MEMBERSHIPS];
  const strip = (rows) => rows.filter((row) => !managed.some((entry) => isMembership(row, entry)));
  left.authorization.roleMemberships = strip(leftRows);
  right.authorization.roleMemberships = strip(rightRows);
  return {
    left,
    right,
    validation: {
      profile: SUPABASE_HOSTED_PROFILE,
      canonicalLocalPlatformMemberships: LOCAL_PLATFORM_MEMBERSHIPS.length,
      hostedLoginMemberships: 1,
      ignoredMembershipIdentities: managed.map(({ role, member }) => ({ role, member })),
    },
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    args[key.slice(2)] = value;
    index += 1;
  }
  return args;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !IGNORED_KEYS.has(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function collectDifferences(left, right, path = "$", output = [], limit = 100) {
  if (output.length >= limit || Object.is(left, right)) return output;

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      output.push({ path, kind: "array-length", left: left.length, right: right.length });
    }
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length && output.length < limit; index += 1) {
      collectDifferences(left[index], right[index], `${path}[${index}]`, output, limit);
    }
    return output;
  }

  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .filter((key) => !IGNORED_KEYS.has(key))
      .sort();
    for (const key of keys) {
      if (!(key in left)) output.push({ path: `${path}.${key}`, kind: "missing-left" });
      else if (!(key in right)) output.push({ path: `${path}.${key}`, kind: "missing-right" });
      else collectDifferences(left[key], right[key], `${path}.${key}`, output, limit);
      if (output.length >= limit) break;
    }
    return output;
  }

  output.push({ path, kind: "value", left, right });
  return output;
}

async function load(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.left || !args.right) {
    throw new Error("Usage: compare-schema-snapshots.mjs --left clean-replay.json --right live-or-isolated.json");
  }

  const rawLeft = await load(args.left);
  const rawRight = await load(args.right);
  let profileValidation = null;
  let normalized = { left: rawLeft, right: rawRight };
  if (args.profile) {
    if (args.profile !== SUPABASE_HOSTED_PROFILE) {
      throw new Error(`Unsupported comparison profile: ${args.profile}`);
    }
    normalized = normalizeSupabaseHostedPair(rawLeft, rawRight);
    profileValidation = normalized.validation;
  }
  const left = canonicalize(normalized.left);
  const right = canonicalize(normalized.right);
  const leftSha256 = digest(left);
  const rightSha256 = digest(right);
  const differences = collectDifferences(left, right);
  const matched = leftSha256 === rightSha256;

  process.stdout.write(`${JSON.stringify({
    matched,
    profile: args.profile || "exact",
    profileValidation,
    left: { path: resolve(args.left), sha256: leftSha256 },
    right: { path: resolve(args.right), sha256: rightSha256 },
    differenceCountShown: differences.length,
    differences,
  }, null, 2)}\n`);
  if (!matched) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
