# Staff Bootstrap V1

This folder contains the backend-only staff bootstrap flow that links a verified
Supabase Auth teacher/admin user to `staff_users.supabase_auth_user_id`.

The access boundary and RLS helpers both depend on this mapping:

```text
staff_users.supabase_auth_user_id = auth.uid()
```

## Bootstrap Behavior

`bootstrapStaffUser(input, dependencies)`:

- validates the Supabase Auth user id and email
- normalizes email to lowercase
- uses `displayName` when provided, otherwise derives a non-empty display name
  from the email local part
- checks for an existing `staff_users` row by Supabase Auth user id
- returns the existing row without creating a duplicate when one already exists
- creates a `staff_users` row when none exists
- writes a system-actor audit log entry after creating a new staff row

The flow is idempotent for repeated runs against the same Supabase Auth user.
If a concurrent bootstrap creates the row after the first lookup but before the
insert succeeds, the service re-reads by Supabase Auth user id and returns the
existing staff row.

## Security Boundary

This is not a public signup flow and does not create routes. It must be called
only from trusted backend/server code using service-role-backed repository
dependencies. Do not expose this flow, service-role credentials, or staff
creation controls to frontend paths.

The audit entry uses `actor_type = "system"`. Player actors are intentionally
not supported for staff bootstrap.
