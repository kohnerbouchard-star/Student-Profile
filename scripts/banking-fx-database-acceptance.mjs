#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const databaseUrl = process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let parsedDatabaseUrl;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
}

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const databasePort = parsedDatabaseUrl.port || "5432";
if (
  !["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol) ||
  !loopbackHosts.has(parsedDatabaseUrl.hostname) ||
  !/^\d{1,5}$/.test(databasePort) ||
  Number(databasePort) < 1 ||
  Number(databasePort) > 65535 ||
  parsedDatabaseUrl.pathname !== "/postgres" ||
  parsedDatabaseUrl.search !== "" ||
  parsedDatabaseUrl.hash !== ""
) {
  throw new Error(
    "Banking/FX database acceptance is restricted to a loopback PostgreSQL database named postgres.",
  );
}

const fixture = Object.freeze({
  staffId: randomUUID(),
  staffAuthId: randomUUID(),
  gameOneId: randomUUID(),
  gameTwoId: randomUUID(),
  playerOneId: randomUUID(),
  playerTwoId: randomUUID(),
});

const sqlPath = fileURLToPath(
  new URL("./banking-fx-database-acceptance.sql", import.meta.url),
);

function redact(value) {
  let result = String(value).replaceAll(
    databaseUrl,
    "postgresql://***@127.0.0.1:<local>/postgres",
  );
  if (parsedDatabaseUrl.password) {
    result = result.replaceAll(parsedDatabaseUrl.password, "***");
  }
  return result;
}

const result = spawnSync(
  "psql",
  [
    "--no-psqlrc",
    databaseUrl,
    "--set=ON_ERROR_STOP=1",
    `--set=staff_id=${fixture.staffId}`,
    `--set=staff_auth_id=${fixture.staffAuthId}`,
    `--set=game_one_id=${fixture.gameOneId}`,
    `--set=game_two_id=${fixture.gameTwoId}`,
    `--set=player_one_id=${fixture.playerOneId}`,
    `--set=player_two_id=${fixture.playerTwoId}`,
    "--file",
    sqlPath,
  ],
  {
    encoding: "utf8",
    env: {
      ...process.env,
      PGAPPNAME: "econovaria-banking-fx-database-acceptance",
    },
    maxBuffer: 16 * 1024 * 1024,
  },
);

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  const detail = redact(`${result.stdout ?? ""}\n${result.stderr ?? ""}`).trim();
  throw new Error(
    `Banking/FX database acceptance failed.${detail ? `\n${detail}` : ""}`,
  );
}

console.log("B2 Banking/FX database acceptance passed (all fixture writes rolled back).");
