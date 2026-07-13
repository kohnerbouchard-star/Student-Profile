function text(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function disabled(code: string, message: string, capability: string): any {
  return {
    handled: true,
    status: 409,
    body: {
      code,
      message,
      data: { capability, implementationStatus: "not_configured" },
    },
  };
}

export function handleUnsupportedOperation(input: {
  path: string;
  method: string;
}): any {
  const path = input.path;
  const method = input.method;

  if (path.startsWith("/notifications") && method !== "GET") {
    return disabled(
      "notifications_not_configured",
      "Notification delivery and preference persistence are not configured for this simulation.",
      "notifications",
    );
  }
  if (path.startsWith("/account/security/2fa")) {
    return disabled(
      "admin_2fa_not_configured",
      "Administrator two-factor enrollment is not configured in this console. Use the primary Supabase account security flow.",
      "admin_2fa",
    );
  }
  if (path === "/account/password-reset" && method === "POST") {
    return disabled(
      "password_reset_not_configured_here",
      "Password reset must be started from the primary sign-in page.",
      "password_reset",
    );
  }
  if (/^\/games\/[^/]+\/contract-materials\/uploads(?:\/[^/]+)?$/.test(path)) {
    return disabled(
      "contract_material_upload_not_configured",
      "Direct contract file uploads are not configured. Use stable links or in-app form and quiz materials.",
      "contract_material_uploads",
    );
  }
  if (
    /^\/games\/[^/]+\/contract-submissions\/[^/]+\/messages$/.test(path) &&
    method === "POST"
  ) {
    return disabled(
      "submission_messaging_not_configured",
      "Submission messaging is not configured. Review feedback can still be saved through the review action.",
      "submission_messaging",
    );
  }
  if (
    /^\/games\/[^/]+\/contracts\/[^/]+\/submissions$/.test(path) &&
    method === "POST"
  ) {
    return disabled(
      "admin_submission_creation_not_supported",
      "Contract submissions are created from the player application, not the administrator console.",
      "contract_submission_creation",
    );
  }
  if (
    /^\/games\/[^/]+\/players\/[^/]+\/messages$/.test(path) && method === "POST"
  ) {
    return disabled(
      "player_messaging_not_configured",
      "Direct player messaging is not configured. This action has not sent a message.",
      "player_messaging",
    );
  }
  if (
    /^\/games\/[^/]+\/players\/imports\/csv$/.test(path) && method === "POST"
  ) {
    return disabled(
      "roster_csv_import_not_configured",
      "CSV roster import is disabled until the batch player-provisioning endpoint can generate secure access codes atomically.",
      "roster_csv_import",
    );
  }
  if (
    /^\/integrations\/google-classroom\/connect$/.test(path) &&
    method === "POST"
  ) {
    return disabled(
      "google_classroom_not_configured",
      "Google Classroom connection is not configured for this Supabase project.",
      "google_classroom",
    );
  }
  if (
    /^\/games\/[^/]+\/attendance\/absent-notifications$/.test(path) &&
    method === "POST"
  ) {
    return disabled(
      "attendance_notifications_not_configured",
      "Absent-player notifications require the player messaging system and were not sent.",
      "attendance_notifications",
    );
  }
  if (
    /^\/games\/[^/]+\/market\/(?:events|news)/.test(path) && method !== "GET"
  ) {
    return disabled(
      "marketplace_read_only",
      "Marketplace administration is read-only. Market events and news cannot be changed from this console.",
      "market_controls",
    );
  }
  if (
    /^\/games\/[^/]+\/market\/events\/[^/]+\/pause$/.test(path) &&
    method === "POST"
  ) {
    return disabled(
      "marketplace_read_only",
      "Marketplace administration is read-only. Market events cannot be paused from this console.",
      "market_controls",
    );
  }
  if (/^\/games\/[^/]+\/store\/pause$/.test(path) && method === "POST") {
    return disabled(
      "store_pause_not_configured",
      "Global store pausing is not configured. Individual items can be hidden or archived.",
      "store_pause",
    );
  }
  if (path === "/support/issues" && method === "POST") {
    return disabled(
      "support_issue_delivery_not_configured",
      "Issue delivery is not configured. Copy diagnostics and report the issue through the project repository.",
      "support_issues",
    );
  }
  if (path === "/docs/admin-console" && method === "GET") {
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          title: "Eco Novaria Administrator Console",
          implementationStatus: "available_in_console_help",
          message:
            "Use the Help panel for administrator console documentation.",
        },
      },
    };
  }
  if (path === "/diagnostics/admin-console" && method === "GET") {
    return {
      handled: true,
      status: 200,
      body: {
        data: {
          status: "available",
          generatedAt: new Date().toISOString(),
          runtime: "admin-api",
          note:
            "Authentication, selected-game ownership, and route-level diagnostics are active.",
        },
      },
    };
  }
  if (
    /^\/games\/[^/]+\/players\/[^/]+\/access-code$/.test(path) &&
    method === "GET"
  ) {
    return disabled(
      "player_access_code_not_recoverable",
      "Player access codes are stored only as hashes. Reset the code to generate a new readable value.",
      "player_access_code_reveal",
    );
  }
  if (/^\/games\/[^/]+\/player-access-codes$/.test(path) && method === "GET") {
    return disabled(
      "player_access_code_inventory_not_available",
      "Readable access codes are not stored as an inventory. Generate them during player creation or reset.",
      "player_access_codes",
    );
  }
  if (
    /^\/games\/[^/]+\/player-access-codes\/unused$/.test(path) &&
    method === "GET"
  ) {
    return disabled(
      "unused_access_codes_not_available",
      "Readable unused access codes are not stored. Codes are generated only during player creation or reset.",
      "unused_access_codes",
    );
  }
  return { handled: false };
}
