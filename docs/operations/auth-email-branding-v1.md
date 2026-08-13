# Econovaria Supabase Auth Email Branding V1

## Purpose

This catalog is the canonical visual and operational source for Econovaria authentication email. It covers signup confirmation, password recovery, magic links, invitations, email changes, reauthentication codes, password and email change notifications, phone changes, MFA enrollment changes, and linked-identity changes.

The repository-owned direct Resend signup delivery and the hosted Supabase Auth templates use the same dark security design, scanner-safe review language, sender identity, and staging distinction.

## Brand system

- Background: `#020617`
- Card surface: `#0f172a`
- Border: `#334155`
- Primary action: `#f97316`
- Security accent: `#93c5fd`
- Sender display name: `Econovaria Security`
- Sender address: an environment-specific mailbox on a domain already verified in Resend
- Wordmark: text-based `ECONOVARIA`, with no remote font or image dependency
- Layout: 600 px table-based transactional email with responsive mobile padding

External images, tracking parameters, scripts, forms, and embedded browser content are prohibited. Authentication email is deliberately separate from marketing email.

## Scanner-safe active flows

The active signup, password-recovery, and magic-link templates do not expose `{{ .ConfirmationURL }}` directly. They use `{{ .TokenHash }}` and send the recipient to an explicit review page. The token is consumed only after a user action on that page.

Production routes:

- Signup and pending-account review: `admin-email-verification`
- Password recovery: `/auth/recovery-start.html`

Staging routes remain bound to the staging Supabase project. Every staging message contains an unmistakable `STAGING ENVIRONMENT — TEST ACCOUNT MESSAGE` banner, and the direct signup subject is prefixed with `[STAGING]`.

Resend authentication-link click tracking and open tracking are disabled by the protected rollout before Supabase SMTP is configured. Delivery, bounce, and complaint telemetry may remain enabled.

## Repository authority

- Manifest: `backend/supabase/auth-email-template-manifest.json`
- Hosted templates: `backend/supabase/auth-email-templates/*.html`
- Direct signup mailer: `backend/src/domains/auth/application/staffSignupVerificationEmail.ts`
- Template compiler: `scripts/build-supabase-auth-email-config.mjs`
- SMTP bootstrap compiler: `scripts/configure-supabase-auth-smtp.mjs`
- Hosted-config verifier: `scripts/verify-supabase-auth-email-config.mjs`
- Rollback snapshotter: `scripts/snapshot-supabase-auth-email-config.mjs`
- Hosted template tests: `scripts/auth-email-template-contract.test.mjs`
- Direct delivery tests: `scripts/staff-signup-email-brand-contract.test.mjs`
- SMTP bootstrap tests: `scripts/configure-supabase-auth-smtp.test.mjs`

The template compiler produces only reviewed `mailer_subjects_*`, `mailer_templates_*`, and `mailer_notifications_*_enabled` fields. The SMTP bootstrap sends the Resend key only to Resend, the Supabase Management API, and the environment-specific Supabase Edge secret store. Evidence and rollback artifacts exclude the SMTP password.

## Required protected configuration

Create these GitHub Actions environment secrets in both `staging` and `production`:

- `RESEND_API_KEY`
- `ECONOVARIA_AUTH_EMAIL_FROM`

`ECONOVARIA_AUTH_EMAIL_FROM` may be either the verified mailbox address alone or the full identity `Econovaria Security <mailbox@verified-domain>`. When a display name is supplied, it must be exactly `Econovaria Security`. The workflow derives the sender domain from this secret and requires an exact verified Resend domain with sending enabled.

The existing `SUPABASE_ACCESS_TOKEN` environment secret remains required. The workflow does not accept provider credentials as dispatch inputs, commit them to the repository, print them, or upload them as evidence.

## Protected staging rollout

1. Verify the intended authentication sending domain in Resend with sending enabled.
2. Add `RESEND_API_KEY` and `ECONOVARIA_AUTH_EMAIL_FROM` to the GitHub `staging` environment.
3. Merge an exact reviewed source commit to `main`.
4. Run **Admin Auth Email Staging Candidate** with:
   - the exact current `main` commit;
   - project ref `eecvbssdvarfcykcfrny`;
   - confirmation text `DEPLOY ADMIN AUTH EMAIL STAGING`.
5. The workflow then performs, in order:
   - contract validation;
   - exact Resend sender-domain verification;
   - disabling Resend click/open tracking;
   - Supabase Auth SMTP configuration through the Management API;
   - provisioning `RESEND_API_KEY`, `ECONOVARIA_AUTH_EMAIL_FROM`, and `ECONOVARIA_DEPLOYMENT_ENVIRONMENT` into the staging Edge secret store;
   - deployment of all 13 hosted Auth templates;
   - byte-for-byte hosted template verification;
   - sanitized SMTP, template, and rollback evidence upload.
6. Verify a real staging signup and password-recovery message on desktop and mobile.

The workflow fails before the first Supabase mutation when either protected secret is absent, the sender mailbox is malformed, the sender name is off-brand, the exact domain is missing, domain verification is incomplete, or sending capability is disabled.

## Protected production promotion

Production cannot be configured independently of staging evidence.

1. Add `RESEND_API_KEY` and `ECONOVARIA_AUTH_EMAIL_FROM` to the GitHub `production` environment.
2. Record the successful staging workflow run ID and `sourceDigest`.
3. Run **Admin Auth Email Production Promote** with:
   - the same exact current `main` commit used by staging;
   - the successful staging run ID;
   - the verified staging `sourceDigest`;
   - project ref `cgiukdjwicykrmtkhudh`;
   - confirmation text `PROMOTE ADMIN AUTH EMAIL PRODUCTION`.
4. The production workflow verifies the staging template, SMTP, Resend-domain, and tracking-policy evidence before configuring production.
5. Retain the generated before-state snapshots and promotion evidence for rollback.

## Hosted free-tier constraint

Supabase projects using the free-tier default email provider reject hosted Auth template changes. The protected workflows resolve that dependency by configuring Resend custom SMTP before applying templates. They verify the resulting host, port, username, sender address, and sender name, while never reading the SMTP password back from Supabase or including it in artifacts.
