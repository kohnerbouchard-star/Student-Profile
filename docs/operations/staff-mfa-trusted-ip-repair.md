# Staff MFA trusted-IP repair

The administrator web-session proxy forwards authenticated MFA requests to `staff-mfa-api`. Universal staff request limiting requires one normalized client IP in the runtime-configured trusted header.

The MFA entrypoint now applies the repository-owned gateway trusted-IP binder before publishable-key validation, staff session resolution, and MFA operations. This preserves authentication, role, assurance-level, and rate-limit enforcement while normalizing Supabase gateway forwarding metadata into the configured `cf-connecting-ip` or `x-real-ip` header.

No MFA protection is bypassed or disabled.
