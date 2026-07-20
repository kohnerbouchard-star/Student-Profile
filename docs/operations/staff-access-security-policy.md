# Staff access security policy

**Roadmap item:** `OPS-ACCESS-001`  
**Status:** change plan and verification contract only  
**Production changes authorized:** none

This policy governs Econovaria staff access to the application, Supabase project,
GitHub environments, and release credentials. Enabling Auth settings, changing
session controls, rotating credentials, or revoking a production user requires
explicit product-owner approval and the production change-control process.

## Required staff controls

1. Every human staff member uses an individual named account. Shared staff,
   classroom, administrator, service, or break-glass credentials are prohibited.
2. Supabase platform accounts must use TOTP MFA. Organization-level MFA
   enforcement is the target state after all current members enroll two distinct
   factors and the owner approves the cutover.
3. Application staff accounts must enroll an authenticator-app TOTP factor and
   privileged routes must require an `aal2` session before the beta is promoted.
4. Service-role keys, HMAC secrets, deploy tokens, and personal access tokens are
   non-human credentials. They are stored only in protected environment-secret
   stores, have a named owner, and are never used as browser credentials.
5. Access follows least privilege. Project owner, database administrator,
   deployment approver, application administrator, and classroom operator are
   distinct responsibilities even when one person temporarily holds multiple
   roles.
6. Access is reviewed quarterly and within one business day of a staff departure,
   role change, suspected compromise, or lost MFA device.

## Password policy change plan

After isolated-staging verification and owner approval, configure Supabase Auth
for staff passwords as follows:

- minimum length: 14 characters;
- require uppercase, lowercase, digit, and symbol;
- enable leaked-password protection;
- require current password for password changes;
- require recent reauthentication for password changes;
- reject password reuse operationally through the password manager and access
  review process;
- provide production SMTP for recovery mail before enabling recovery-dependent
  enforcement.

Supabase documents that leaked-password protection uses the Pwned Passwords
service and is available on Pro plans and above. Supabase also supports current-
password verification and a reauthentication nonce for sensitive password
changes. Existing users must be forced through a controlled reset campaign; a
settings change alone is not accepted as proof that all staff credentials meet
the new standard.

Official references:

- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/auth/passwords

## MFA and assurance policy

The application must support enrollment, challenge, factor replacement, and
recovery for authenticator-app TOTP. Privileged staff routes must inspect the
session assurance level and reject or redirect an `aal1` session before any
service-role data access. The enforcement rollout is:

1. implement and test enrollment and challenge in isolated staging;
2. enroll every current staff user and record factor-presence evidence without
   recording the TOTP secret;
3. verify privileged routes require `aal2`;
4. enroll a second factor for project owners and break-glass custodians;
5. enable organization MFA enforcement only after owner approval;
6. verify existing non-MFA sessions lose project access as expected.

Supabase Auth supports authenticator-app TOTP and exposes authenticator assurance
levels for server-side enforcement. Supabase platform accounts support TOTP and
recommend a separately stored backup factor because recovery codes are not
issued. Organization-level enforcement is owner-controlled and available on
eligible paid plans.

Official references:

- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/guides/platform/multi-factor-authentication
- https://supabase.com/docs/guides/platform/mfa/org-mfa-enforcement

## Session, recovery, and revocation policy

Target staff-session controls, subject to staging evidence and owner approval:

- access-token lifetime no longer than 30 minutes;
- inactivity timeout of 8 hours;
- maximum session lifetime of 24 hours for normal staff;
- one active session per staff user unless a documented exception exists;
- fresh `aal2` authentication for security, access, credential, release, and
  destructive operations;
- global sign-out after password reset, factor replacement, role removal, or
  suspected compromise.

A normal sign-out may leave an issued access token usable until its expiry.
Sensitive handlers therefore continue to verify the authoritative staff record,
required role, game ownership, and—where required—the underlying session record.
Global sign-out is the required revocation scope for compromise response.

Recovery procedure:

1. verify the staff member through two independent channels;
2. revoke all sessions before issuing recovery access;
3. remove a lost factor only through a logged administrator action;
4. require password reset and enrollment of a new primary and backup factor;
5. review audit events and credential use from the previous 30 days;
6. close the recovery record with the approver and affected account identifiers.

Official references:

- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/auth/signout

## Break-glass access

Exactly two sealed break-glass custodians may exist. Each credential is unique,
uses a password-manager-generated secret and two TOTP factors, is disabled for
routine work, and is tested quarterly. Activation requires an incident ticket,
two-person approval when available, global revocation after use, credential
rotation, and a complete audit review.

## Access review evidence

The quarterly review records only bounded metadata:

- account public identifier and email;
- business owner and role;
- last successful sign-in time;
- MFA factor count and assurance readiness, never factor secrets;
- active session count;
- GitHub, Supabase, release-environment, and application roles;
- decision: retain, reduce, suspend, or revoke;
- reviewer, approver, date, and follow-up deadline.

Do not export password hashes, access or refresh tokens, recovery links, TOTP
secrets, service-role keys, HMAC secrets, internal player UUIDs, or student data.

## Approval and verification gate

No setting is enabled by this document. The approved change record must identify
the isolated-staging project, before/after configuration, affected staff,
recovery readiness, immutable application commit, approver, rollback method, and
observation window. Completion evidence must include successful password-policy,
leaked-password, MFA enrollment/challenge, `aal2`, recovery, global revocation,
wrong-role, and expired-session probes without sensitive payloads in evidence.
