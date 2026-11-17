import {
  type WorkerRuntime,
  type ClaimedEmailJob,
  type RenderedEmail,
  SUPPORTED_TEMPLATE_VERSION,
} from "./emailWorkerContracts.ts";
import {
  JobFailure,
  escapeHtml,
} from "./emailWorkerValidation.ts";


export function renderLicenseEmail(
  runtime: WorkerRuntime,
  job: ClaimedEmailJob,
  licenseCode: string,
): RenderedEmail {
  if (job.template_version !== SUPPORTED_TEMPLATE_VERSION) {
    throw new JobFailure(
      "unsupported_license_email_template",
      "The queued license email template version is unsupported.",
      false,
    );
  }

  const expirationCopy =
    job.purchase_code_expires_after_days === null
      ? "The code remains available until it is redeemed or revoked."
      : `Redeem this code within ${job.purchase_code_expires_after_days} days.`;
  const supportCopy = runtime.supportEmail
    ? `Questions: ${runtime.supportEmail}`
    : "Contact Econovaria support if you did not make this purchase.";
  const subject = "Your Econovaria license code";
  const text = [
    "Your Econovaria payment was confirmed.",
    "",
    `License code: ${licenseCode}`,
    "",
    `License term after activation: ${job.license_duration_days} days.`,
    expirationCopy,
    "This code may be redeemed once. Keep it private.",
    "",
    supportCopy,
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your Econovaria license</title></head>
<body style="margin:0;background:#020617;color:#e2e8f0;font-family:Arial,sans-serif;padding:24px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#0f172a;border:1px solid #334155;border-radius:16px;padding:32px">
      <tr><td>
        <p style="margin:0 0 12px;color:#fb923c;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Payment confirmed</p>
        <h1 style="margin:0 0 16px;color:#f8fafc;font-size:28px">Your Econovaria license</h1>
        <p style="margin:0 0 20px;line-height:1.6">Use the code below to activate one Econovaria game license.</p>
        <p style="margin:0 0 24px;padding:18px;border:1px solid #475569;border-radius:12px;background:#020617;color:#f8fafc;font-family:monospace;font-size:24px;font-weight:800;letter-spacing:.12em;text-align:center">${escapeHtml(licenseCode)}</p>
        <p style="margin:0 0 8px;line-height:1.6">License term after activation: ${job.license_duration_days} days.</p>
        <p style="margin:0 0 8px;line-height:1.6">${escapeHtml(expirationCopy)}</p>
        <p style="margin:0 0 8px;line-height:1.6">This code may be redeemed once. Keep it private.</p>
        <p style="margin:20px 0 0;color:#94a3b8;font-size:13px;line-height:1.5">${escapeHtml(supportCopy)}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;

  return { subject, text, html };
}
