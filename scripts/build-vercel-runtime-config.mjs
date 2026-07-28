import {
  cp,
  mkdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BROWSER_ROOTS = Object.freeze([
  "index.html",
  "frontend",
  "admin",
  "assets",
  "player-terminal",
  "auth",
]);

const ALLOWED_ENVIRONMENTS = new Set(["staging", "production"]);
const DEFAULT_REPO_ROOT = path.resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);
const DEFAULT_OUTPUT_ROOT = path.join(DEFAULT_REPO_ROOT, "dist");

function requiredEnvironmentValue(environment, name) {
  const value = String(environment[name] || "").trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function deploymentConfiguration(environment) {
  const runtimeEnvironment = requiredEnvironmentValue(
    environment,
    "ECONOVARIA_ENVIRONMENT",
  ).toLowerCase();
  const projectRef = requiredEnvironmentValue(
    environment,
    "ECONOVARIA_PROJECT_REF",
  ).toLowerCase();
  const supabaseUrl = requiredEnvironmentValue(
    environment,
    "ECONOVARIA_SUPABASE_URL",
  ).replace(/\/+$/, "");
  const supabasePublishableKey = requiredEnvironmentValue(
    environment,
    "ECONOVARIA_SUPABASE_PUBLISHABLE_KEY",
  );

  if (!ALLOWED_ENVIRONMENTS.has(runtimeEnvironment)) {
    throw new Error("ECONOVARIA_ENVIRONMENT must be staging or production");
  }
  if (!/^[a-z0-9]{20}$/u.test(projectRef)) {
    throw new Error("ECONOVARIA_PROJECT_REF is invalid");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("ECONOVARIA_SUPABASE_URL is invalid");
  }
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== `${projectRef}.supabase.co` ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error("ECONOVARIA_SUPABASE_URL does not match the project ref");
  }
  if (!supabasePublishableKey.startsWith("sb_publishable_")) {
    throw new Error("ECONOVARIA_SUPABASE_PUBLISHABLE_KEY must be publishable");
  }

  return Object.freeze({
    environment: runtimeEnvironment,
    projectRef,
    supabaseUrl,
    apiProxyUrl: "",
    supabasePublishableKey,
  });
}

async function copyBrowserRoot(repoRoot, outputRoot, relativePath) {
  const source = path.join(repoRoot, relativePath);
  const metadata = await stat(source);
  if (relativePath === "index.html" ? !metadata.isFile() : !metadata.isDirectory()) {
    throw new Error(`Required browser root is invalid: ${relativePath}`);
  }
  await cp(source, path.join(outputRoot, relativePath), {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
}

export async function buildVercelDeployment({
  repoRoot = DEFAULT_REPO_ROOT,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  environment = process.env,
} = {}) {
  const configuration = deploymentConfiguration(environment);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  for (const relativePath of BROWSER_ROOTS) {
    await copyBrowserRoot(repoRoot, outputRoot, relativePath);
  }

  const contents = `window.__ECONOVARIA_RUNTIME_CONFIG__ = ${JSON.stringify(
    configuration,
    null,
    2,
  )};\n`;
  await writeFile(path.join(outputRoot, "runtime-config.env.js"), contents, {
    encoding: "utf8",
  });

  return Object.freeze({
    outputRoot,
    browserRoots: BROWSER_ROOTS,
    environment: configuration.environment,
    projectRef: configuration.projectRef,
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  buildVercelDeployment()
    .then((result) => {
      console.log(
        `Built Vercel static output for ${result.environment} at ${result.outputRoot}`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
