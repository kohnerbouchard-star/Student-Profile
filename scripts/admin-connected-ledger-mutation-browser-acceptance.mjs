#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resetLocalAcceptanceRateLimits } from "./local-acceptance-rate-limit-reset.mjs";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const ADMIN_EMAIL = String(
  process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "browser.e2e@example.test",
).trim().toLowerCase();

function resetLocalAdminMfaFactor() {
  resetLocalAcceptanceRateLimits();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@example\.test$/.test(ADMIN_EMAIL)) {
    throw new Error("Local Admin MFA reset is restricted to example.test acceptance accounts.");
  }
  const email = ADMIN_EMAIL.replaceAll("'", "''");
  const sql = `
    do $reset$
    declare
      v_user_id uuid;
    begin
      select id into v_user_id
      from auth.users
      where lower(email) = lower('${email}')
      limit 1;

      if v_user_id is not null then
        delete from auth.mfa_challenges
        where factor_id in (
          select id from auth.mfa_factors where user_id = v_user_id
        );
        delete from auth.mfa_factors where user_id = v_user_id;
      end if;
    end
    $reset$;
  `;
  const result = spawnSync(
    "psql",
    [DATABASE_URL, "-X", "-v", "ON_ERROR_STOP=1", "-qAt", "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error("Failed to reset the disposable Admin MFA acceptance factor.");
  }
}

resetLocalAdminMfaFactor();
try {
  await import("../player-terminal/tools/connected-admin-ledger-runner.mjs");
} finally {
  resetLocalAcceptanceRateLimits();
}
