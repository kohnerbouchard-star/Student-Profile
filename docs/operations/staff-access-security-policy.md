# Staff Access Security Policy

This policy defines the evidence and approval requirements for staff access. It does not change live Auth settings.

## Account controls

- Unique named staff accounts only; shared routine accounts are prohibited.
- Strong password policy and leaked-password protection must be enabled only through an approved change window with rollback ownership.
- Staff MFA uses an approved factor and must be tested with enrollment, challenge, recovery, and revocation evidence.
- Privileged actions require the reviewed staff role and game ownership checks.
- Recovery must not bypass role, ownership, or MFA requirements.

## Sessions and revocation

- Define bounded session lifetime and inactivity behavior.
- Verify sign-out, global revocation, password reset, factor removal, role removal, and staff deactivation invalidate access as expected.
- Retain redacted evidence for revoked-session rejection and safe return to login.

## Break-glass access

- Maintain a separately controlled emergency identity only when required.
- Require named approval, reason, start/end time, actions taken, monitoring owner, and immediate post-use review.
- Rotate or revoke emergency access after use according to the approved incident procedure.

## Reviews

- Review staff access at least quarterly and after role, employment, or incident changes.
- Record account owner, role, game scope, MFA state, last review, reviewer, and disposition without storing credential values.
- Remove stale or unjustified access through a separately approved change.

## Connected evidence gate

Before claiming completion, isolated staging must demonstrate password-policy behavior, leaked-password protection, MFA enrollment/challenge/recovery, role and ownership denial, session expiration, global revocation, and break-glass logging. Production changes require separate explicit authorization.
