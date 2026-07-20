import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
let differences = 0;

async function patch(relativePath, transform) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");
  const expected = transform(source);
  if (source === expected) return;

  differences += 1;
  if (checkOnly) {
    console.error(`Timezone migration preflight drift: ${relativePath}`);
    return;
  }

  await writeFile(absolutePath, expected, "utf8");
}

const preflightBlock = `do $timezone_validation$
begin
  if exists (
    select 1
    from public.game_settings settings
    where not exists (
      select 1
      from pg_timezone_names zone
      where zone.name = btrim(settings.stock_market_window ->> 'timezone')
    )
  ) then
    raise exception 'STOCK_MARKET_EXISTING_TIMEZONE_INVALID';
  end if;
end;
$timezone_validation$;`;

await patch(
  "backend/supabase/migrations/20260719133000_require_stock_market_timezone_v1.sql",
  (source) => {
    if (source.includes(preflightBlock)) return source;

    const functionMarker =
      "create or replace function public.validate_required_stock_market_timezone()";
    const markerIndex = source.indexOf(functionMarker);
    if (markerIndex < 0) {
      throw new Error("Timezone validation function marker was not found.");
    }

    const prefix = source.slice(0, markerIndex);
    const blockStartCandidates = [
      prefix.lastIndexOf("do language plpgsql '"),
      prefix.lastIndexOf("do $\nbegin\n"),
      prefix.lastIndexOf("do $timezone_validation$\nbegin\n"),
    ];
    const blockStart = Math.max(...blockStartCandidates);

    if (blockStart < 0) {
      throw new Error("Timezone migration preflight block was not found.");
    }

    return `${source.slice(0, blockStart)}${preflightBlock}\n\n${source.slice(markerIndex)}`;
  },
);

await patch(
  "backend/src/domains/stocks/tests/stockExchangeCalendarMigrationContract.test.ts",
  (source) => {
    let expected = source.replace(
      '  assertIncludes(required, "do language plpgsql \'");',
      '  assertIncludes(required, "do $timezone_validation$");',
    );

    if (!expected.includes('assertIncludes(required, "do $timezone_validation$");')) {
      const anchor =
        '  assertIncludes(required, "STOCK_MARKET_EXISTING_TIMEZONE_INVALID");';
      if (!expected.includes(anchor)) {
        throw new Error("Migration preflight assertion anchor was not found.");
      }
      expected = expected.replace(
        anchor,
        `${anchor}\n  assertIncludes(required, "do $timezone_validation$");`,
      );
    }

    return expected;
  },
);

if (checkOnly && differences > 0) {
  process.exitCode = 1;
} else {
  console.log(
    `${checkOnly ? "Verified" : "Applied"} timezone migration preflight syntax.`,
  );
}
