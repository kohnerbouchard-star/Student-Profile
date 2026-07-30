# Bootstrap signup trusted-IP repair

Production browser account creation calls the public `bootstrap-api` Edge Function directly. The pre-auth rate-limit contract requires one proxy-normalized client IP in the configured trusted header, while the Supabase gateway can provide the address through its forwarding chain.

The bootstrap entrypoint now binds the gateway-provided client IP into the configured `cf-connecting-ip` or `x-real-ip` header before invoking the existing signup handler. The binding:

- preserves the publishable key, device identifier, JSON body, and other reviewed headers;
- accepts only normalized IPv4 or IPv6 values;
- uses the rightmost valid `x-forwarded-for` address when no direct gateway header is available;
- removes forwarding aliases before setting the trusted header;
- rejects `x-forwarded-for` as the configured trusted header so downstream policy remains fail-closed.

The licensing and provisioning transaction is unchanged. Failed attempts before activation do not redeem a purchase code.
