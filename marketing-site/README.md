# Econovaria Marketing Site

Public, static marketing and legal surface for Econovaria. It is intentionally isolated at `/marketing-site/` so the current root authentication application is not replaced or implicitly redirected.

## Runtime configuration

`config.js` is a public browser configuration file. It may contain only approved public URLs, public plan identifiers, and same-origin endpoint paths. It must never contain payment-provider secret keys, Supabase service-role credentials, private API tokens, or internal ownership identifiers.

Required production fields:

- `app.signInUrl`
- `app.signUpUrl`
- `checkout.endpoint`
- `checkout.plans.*`
- `leads.endpoint`
- `legal.operatorLegalName`
- `legal.legalContactEmail`
- `legal.privacyContactEmail`
- `legal.postalAddress`
- `legal.governingLaw`

Blank integrations fail closed with an accessible dialog. They do not navigate to guessed environments or send user data.

## Checkout API contract

The browser sends a same-origin request:

```http
POST /api/billing/checkout-session
Accept: application/json
Content-Type: application/json
X-CSRF-Token: <optional public session-bound token>

{
  "planId": "classroom",
  "billingCadence": "standard",
  "successPath": "?checkout=success",
  "cancelPath": "?checkout=cancelled"
}
```

The backend validates the authenticated or lead context, approved plan, price, currency, tax behavior, and return paths. It creates a hosted provider checkout session with server-held credentials and returns:

```json
{ "checkoutUrl": "https://approved-provider.example/checkout/session" }
```

Access must be provisioned only after a verified payment-provider webhook. The browser response is not proof of payment.

## Lead API contract

The pilot form sends JSON to a same-origin endpoint with credentials and optional CSRF protection. The endpoint must validate content types, body size, field lengths, email format, rate limits, origin/CSRF, abuse signals, retention, and notification routing before storing or forwarding the request.

## Legal launch gates

The legal documents are implemented as product drafts, not approved public instruments. Before launch, designate and review:

1. Service operator legal name and address.
2. Legal, privacy, security, and accessibility contacts.
3. Governing law, venue, liability cap, refund and renewal terms.
4. Product data map, retention schedule, backup expiration, and deletion procedure.
5. Subprocessor register, processing locations, and international transfer terms.
6. Child/student consent model for each launch jurisdiction.
7. Payment provider, plan IDs, prices, taxes, cancellation, and fulfillment controls.
8. Independent accessibility and legal review.

## Accessibility

The marketing implementation includes semantic landmarks, skip navigation, visible focus, keyboard-operable navigation/tabs/dialogs/forms, live status regions, reduced-motion support, responsive reflow, and no mandatory optional cookies. The wider product still requires a full accessibility audit before a public conformance claim.

## Local preview

Serve the repository root over HTTP so shared brand assets resolve correctly:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173/marketing-site/`.
