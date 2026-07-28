import { writeFile } from "node:fs/promises";

const requiredVariables = [
  "ECONOVARIA_ENVIRONMENT",
  "ECONOVARIA_PROJECT_REF",
  "ECONOVARIA_SUPABASE_URL",
  "ECONOVARIA_SUPABASE_PUBLISHABLE_KEY",
];

for (const variableName of requiredVariables) {
  if (!String(process.env[variableName] || "").trim()) {
    throw new Error(`Missing required environment variable: ${variableName}`);
  }
}

const configuration = {
  environment: String(process.env.ECONOVARIA_ENVIRONMENT).trim(),
  projectRef: String(process.env.ECONOVARIA_PROJECT_REF).trim(),
  supabaseUrl: String(process.env.ECONOVARIA_SUPABASE_URL).trim(),
  apiProxyUrl: "",
  supabasePublishableKey: String(
    process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY
  ).trim(),
};

const contents = `window.__ECONOVARIA_RUNTIME_CONFIG__ = ${JSON.stringify(
  configuration,
  null,
  2
)};\n`;

await writeFile("runtime-config.env.js", contents, {
  encoding: "utf8",
  mode: 0o600,
});

console.log("Generated runtime-config.env.js");
