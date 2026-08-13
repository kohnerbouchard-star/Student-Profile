# Econovaria Supabase Auth Email Branding V1

## Purpose

This catalog is the canonical visual and operational source for Supabase Auth email. It covers signup confirmation, password recovery, magic links, invitations, email changes, reauthentication codes, password and email change notifications, phone changes, MFA enrollment changes, and linked-identity changes.

The catalog changes presentation and hosted Auth template configuration only. It does not store provider credentials, configure SMTP, or change which application endpoint initiates signup.

## Brand system

- Background: `#020617`
- Card surface: `#0f172a`
- Border: `#334155`
- Primary action: `#f97316`
- Security accent: `#93c5fd`
- Wordmark: text-based `ECONOVARIA`, with no remote font or image dependency
- Layout: 600 px table-based transactional email with responsive mobile padding

External images, tracking parameters, scripts, forms, and embedded browser content are prohibited. Authentication email is deliberately separate from marketing email.

## Scanner-safe active flows

The active signup, password-recovery, and magic-link templates do not expose `{{ .ConfirmationURL }}` directly. They use `{{ .TokenHash }}` and send the recipient to an explicit review page. The token is consumed only after a user action on that page.

Production routes:

- Signup and pending-account review: `admin-email-verification`
- Password recovery: `/auth/recovery-start.html`

Staging routes remain bound to the staging Supabase project. Every staging message contains an unmistakable `STAGING ENVIRONMENT — TEST ACCOUNT MESSAGE` banner.

Resend or any replacement SMTP provider must have authentication-link click tracking disabled. Delivery, bounce, and complaint telemetry may remain enabled.

## Repository authority

- Manifest: `backend/supabase/auth-email-template-manifest.json`
- Templates: `backend/supabase/auth-email-templates/*.html`
- Compiler: `scripts/build-supabase-auth-email-config.mjs`
- Hosted-config verifier: `scripts/verify-supabase-auth-email-config.mjs`
- Rollback snapshotter: `scripts/snapshot-supabase-auth-email-config.mjs`
- Contract tests: `scripts/auth-email-template-contract.test.mjs`

The compiler produces only reviewed `mailer_subjects_*`, `mailer_templates_*`, and `mailer_notifications_*_enabled` fields. It does not send SMTP passwords or modify unrelated Auth settings.

## Protected rollout

1. Merge an exact reviewed template source commit to `main`.
2. Run **Admin Auth Email Staging Candidate** with the exact commit and staging confirmations.
3. Verify a real staging signup/recovery message, desktop and mobile rendering, and provider click-tracking settings.
4. Record the staging `sourceDigest` and successful workflow run ID.
5. Run **Admin Auth Email Production Promote** with that exact staging evidence.
6. Retain the generated before-state snapshot and deployment evidence for rollback.

## SMTP dependency

Hosted Supabase projects using the free-tier default email provider cannot modify Auth email templates. The rollout workflows therefore verify that `smtp_host`, `smtp_user`, and `smtp_admin_email` are configured before making the first template PATCH. They fail before mutation when custom SMTP is absent.

Production delivery requires a verified transactional domain and custom SMTP credentials in Supabase Auth. The workflows report whether custom SMTP appears configured, but they never read, store, or export the SMTP password. Configure Resend SMTP separately in staging and production, then run the protected staging candidate before production promotion.
