// Deployment-owned browser configuration template.
// Materialize this as runtime-config.env.js in the deployed browser root.
// Do not commit a materialized file containing environment values.
window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze({
  environment: "__ENVIRONMENT__",
  projectRef: "__SUPABASE_PROJECT_REF__",
  supabaseUrl: "__SUPABASE_URL__",
  supabasePublishableKey: "__SUPABASE_PUBLISHABLE_KEY__",
});
