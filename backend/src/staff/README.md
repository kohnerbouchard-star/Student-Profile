# Staff creation ownership

The uncalled V1 `bootstrapStaff.ts` creator is retired. Actual verified Staff creation is owned by `domains/auth/api/staffLoginHttpHandler.ts` and the `activate_verified_staff_identity_v1` RPC. The read-only Staff bootstrap handler is not a replacement creation flow.

The Supabase Auth identity-to-staff mapping and authorization contracts remain. No SQL, migration, audit history or active login behavior was changed. The old standalone helper's audit event is historical, not a claim of identical current audit semantics.
