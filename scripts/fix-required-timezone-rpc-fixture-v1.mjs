import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const relativePath =
  "backend/src/domains/stocks/infrastructure/supabaseStockMarketWindowRepository.test.ts";
const absolutePath = path.join(repoRoot, relativePath);
const checkOnly = process.argv.includes("--check");
const before = `  async rpc(functionName: string, args: unknown) {\n    this.calls.push({ functionName, args });\n    return { data: this.result, error: null };\n  }`;
const after = `  async rpc<T = unknown>(functionName: string, args: unknown): Promise<{\n    data: T | null;\n    error: null;\n  }> {\n    this.calls.push({ functionName, args });\n    return { data: this.result as T, error: null };\n  }`;

const source = await readFile(absolutePath, "utf8");
if (source.includes(after)) {
  console.log("Verified required-timezone RPC fixture generics.");
} else if (!source.includes(before)) {
  throw new Error("Required-timezone RPC fixture anchor was not found.");
} else if (checkOnly) {
  console.error(`Required-timezone RPC fixture drift: ${relativePath}`);
  process.exitCode = 1;
} else {
  await writeFile(absolutePath, source.replace(before, after), "utf8");
  console.log("Applied required-timezone RPC fixture generics.");
}
