import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { check, sha256 } from './evidence.mjs';

const ORIGINAL_SQL_FUNCTION_SHA256 = 'd970357b4cd4e59bc3304b19a0b28726879724936c7b2bddbbeb9cab090d7a0e';
const START = 'async function runSql(';
const END = '\nasync function readJson';
const STDIN_SQL = `async function runSql(sql, { label = "database operation" } = {}) {
  const result = spawnSync(
    "psql",
    [DATABASE_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    { input: sql.trim() + "\\n", encoding: "utf8", timeout: 120_000, maxBuffer: 20 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error("Canonical provisioning SQL failed.");
  return String(result.stdout || "").trim();
}
`;

export function adaptProvisioning(source) {
  check(source.split(START).length === 2 && source.split(END).length === 2, 'provisioning-seam-count');
  const start = source.indexOf(START), end = source.indexOf(END,start);
  check(end > start, 'provisioning-seam-order');
  const original = source.slice(start,end);
  check(sha256(original) === ORIGINAL_SQL_FUNCTION_SHA256, 'provisioning-seam-hash');
  const adapted = source.slice(0,start) + STDIN_SQL + source.slice(end);
  // This inverse check covers every SQL statement, caller, assertion and import.
  check(adapted.replace(STDIN_SQL,original) === source, 'provisioning-inverse-equality');
  return adapted;
}
export async function materializeProvisioning(workspace) {
  const sourcePath = 'scripts/game-creation-provisioning-local-acceptance.mjs';
  const adaptedPath = 'scripts/.roster-canonical-provisioning-stdin.mjs';
  const source = await readFile(join(workspace,sourcePath),'utf8');
  const adapted = adaptProvisioning(source);
  await writeFile(join(workspace,adaptedPath),adapted,{mode:0o600});
  return {sourcePath,adaptedPath,sourceSha256:sha256(source),adaptedSha256:sha256(adapted),
    purpose:'canonical-fixture-SQL-stdin-only',originalSqlFunctionSha256:ORIGINAL_SQL_FUNCTION_SHA256};
}
