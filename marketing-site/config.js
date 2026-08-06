/**
 * Public marketing configuration only.
 * Never place payment-provider secret keys, service-role credentials, or private API tokens here.
 * Production URLs and same-origin endpoints are intentionally blank until approved.
 */
window.ECONOVARIA_MARKETING_CONFIG = Object.freeze({
  environment: "preview",
  app: Object.freeze({
    signInUrl: "",
    signUpUrl: "",
  }),
  checkout: Object.freeze({
    endpoint: "",
    csrfToken: "",
    plans: Object.freeze({
      pilot: "pilot",
      classroom: "classroom",
      institution: "institution",
    }),
  }),
  leads: Object.freeze({
    endpoint: "",
    csrfToken: "",
  }),
  legal: Object.freeze({
    productName: "Econovaria",
    operatorLegalName: "",
    legalContactEmail: "",
    privacyContactEmail: "",
    postalAddress: "",
    governingLaw: "",
  }),
});
