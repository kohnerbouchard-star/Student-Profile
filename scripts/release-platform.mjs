import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildImmutableRelease,
  loadJson,
  validateDistinctEnvironmentManifests,
  validateEnvironmentManifest,
  validatePromotionRecord,
  validateReleaseManifest,
} from "./release-platform-lib.mjs";

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function required(options, key) {
  if (!options[key]) throw new Error(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
  return options[key];
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  const repoRoot = path.resolve(options.repoRoot ?? ".");

  if (command === "build") {
    const manifest = await buildImmutableRelease({
      repoRoot,
      outputRoot: path.resolve(repoRoot, required(options, "output")),
      commit: required(options, "commit"),
      configurationPath: required(options, "config"),
    });
    console.log(JSON.stringify({
      status: "built",
      releaseId: manifest.releaseId,
      commit: manifest.source.commit,
      artifactSetSha256: manifest.artifactSetSha256,
      artifactCount: manifest.artifacts.length,
    }, null, 2));
    return;
  }

  if (command === "validate") {
    const manifestPath = path.resolve(repoRoot, required(options, "manifest"));
    const manifest = await loadJson(manifestPath);
    const validated = await validateReleaseManifest({
      manifest,
      artifactRoot: path.resolve(repoRoot, required(options, "artifactRoot")),
      repoRoot,
      expectedCommit: required(options, "expectedCommit"),
    });
    console.log(JSON.stringify({
      status: "valid",
      releaseId: validated.releaseId,
      commit: validated.source.commit,
      artifactSetSha256: validated.artifactSetSha256,
    }, null, 2));
    return;
  }

  if (command === "validate-environment") {
    const manifest = await loadJson(path.resolve(repoRoot, required(options, "manifest")));
    const validated = validateEnvironmentManifest(manifest, {
      expectedEnvironment: required(options, "expectedEnvironment"),
    });
    console.log(JSON.stringify({
      status: "valid",
      environment: validated.environment,
      identity: validated.identity,
      githubEnvironment: validated.githubEnvironment,
    }, null, 2));
    return;
  }

  if (command === "validate-environment-set") {
    const manifests = ["development", "staging", "production"].map((environment) => {
      const option = `${environment}Manifest`;
      return loadJson(path.resolve(repoRoot, required(options, option)));
    });
    const validated = validateDistinctEnvironmentManifests(await Promise.all(manifests));
    console.log(JSON.stringify({
      status: "valid",
      environments: validated.map(({ environment, identity, githubEnvironment }) => ({
        environment,
        identity,
        githubEnvironment,
      })),
    }, null, 2));
    return;
  }

  if (command === "validate-promotion") {
    const releaseManifestPath = path.resolve(repoRoot, required(options, "releaseManifest"));
    const releaseManifest = await loadJson(releaseManifestPath);
    const record = await loadJson(path.resolve(repoRoot, required(options, "record")));
    const validated = await validatePromotionRecord({
      record,
      releaseManifest,
      releaseManifestPath,
      artifactRoot: path.resolve(repoRoot, required(options, "artifactRoot")),
      repoRoot,
      expectedEnvironment: required(options, "expectedEnvironment"),
    });
    console.log(JSON.stringify({
      status: "valid",
      promotionId: validated.promotionId,
      targetEnvironment: validated.targetEnvironment,
      releaseId: validated.releaseId,
      artifactSetSha256: validated.artifactSetSha256,
    }, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command ?? "(missing)"}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
