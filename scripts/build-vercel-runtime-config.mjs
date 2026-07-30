import {
  cp,
  mkdir,
  readFile,
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

const handlerContract = (relativePath, requiredPatterns, forbiddenPatterns = []) =>
  Object.freeze({
    relativePath,
    requiredPatterns: Object.freeze([
      /module\.exports\s*=/u,
      ...requiredPatterns,
    ]),
    forbiddenPatterns: Object.freeze(forbiddenPatterns),
  });

export const VERCEL_CRITICAL_ROUTE_CONTRACTS = Object.freeze([
  handlerContract("api/admin-session/[...path].js", [
    /proxyAdminBff/u,
    /canonicalCatchAllPath/u,
    /canonicalCatchAllPath\(request\.url,\s*"\/api\/admin-session"\)/u,
    /proxyAdmin:\s*false/u,
  ]),
  handlerContract("api/admin/[...path].js", [
    /proxyAdminBff/u,
    /canonicalCatchAllPath/u,
    /canonicalCatchAllPath\(request\.url,\s*"\/api\/admin"\)/u,
    /proxyAdmin:\s*true/u,
  ]),
  handlerContract("api/admin-proxy.js", [
    /proxyAdminBff/u,
    /typeof path !== "string"/u,
    /invalid_proxy_path/u,
    /proxyAdmin:\s*true/u,
  ], [
    /\bfetch\s*\(/u,
    /functions\/v1/u,
    /Authorization|Bearer|service_role/iu,
  ]),
  handlerContract("api/admin-session/mfa/enroll.js", [
    /proxyAdminBff/u,
    /path:\s*\["mfa",\s*"enroll"\]/u,
    /proxyAdmin:\s*false/u,
  ]),
  handlerContract("api/admin-session/mfa/verify.js", [
    /proxyAdminBff/u,
    /path:\s*\["mfa",\s*"verify"\]/u,
    /proxyAdmin:\s*false/u,
  ]),
  handlerContract("api/admin/session/bootstrap.js", [
    /proxyAdminBff/u,
    /path:\s*\["session",\s*"bootstrap"\]/u,
    /proxyAdmin:\s*true/u,
  ]),
  handlerContract("api/admin-logout.js", [
    /proxyAdminBff/u,
    /path:\s*\["logout"\]/u,
    /proxyAdmin:\s*false/u,
  ], [
    /admin-logout-api/u,
  ]),
  handlerContract("api/password-reset.js", [
    /MAX_BODY_BYTES\s*=\s*4_096/u,
    /functions\/v1\/password-reset-api/u,
    /Authorization:\s*`Bearer \$\{match\[1\]\}`/u,
    /redirect:\s*"manual"/u,
    /x-vercel-forwarded-for/u,
  ]),
]);

const ALLOWED_ENVIRONMENTS = new Set(["staging", "production"]);
const PLACEHOLDER_ROUTE_PATTERN = /^(?:placeholder|todo|not[ -]?implemented)\s*;?$/iu;
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

export async function validateCriticalVercelRoutes({
  repoRoot = DEFAULT_REPO_ROOT,
} = {}) {
  for (const contract of VERCEL_CRITICAL_ROUTE_CONTRACTS) {
    const absolutePath = path.join(repoRoot, contract.relativePath);
    let source;
    try {
      source = await readFile(absolutePath, "utf8");
    } catch {
      throw new Error(`Required Vercel route is missing: ${contract.relativePath}`);
    }

    const normalized = source.trim();
    if (!normalized || PLACEHOLDER_ROUTE_PATTERN.test(normalized)) {
      throw new Error(`Required Vercel route is a placeholder: ${contract.relativePath}`);
    }
    for (const requiredPattern of contract.requiredPatterns) {
      if (!requiredPattern.test(source)) {
        throw new Error(`Required Vercel route contract is invalid: ${contract.relativePath}`);
      }
    }
    for (const forbiddenPattern of contract.forbiddenPatterns) {
      if (forbiddenPattern.test(source)) {
        throw new Error(`Required Vercel route contains a retired target: ${contract.relativePath}`);
      }
    }
  }
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
  await validateCriticalVercelRoutes({ repoRoot });
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
