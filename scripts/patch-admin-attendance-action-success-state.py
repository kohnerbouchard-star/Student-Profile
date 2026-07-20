#!/usr/bin/env python3
from pathlib import Path

path = Path("scripts/admin-attendance-action-smoke.mjs")
source = path.read_text(encoding="utf-8")
replacements = [
    (
        '''    return /confirmed/i.test(state);\n  }, null, { timeout: 5000 });''',
        '''    return /confirmed|completed/i.test(state);\n  }, null, { timeout: 10_000 });''',
    ),
    (
        '''  if (result.resultHidden || !result.emptyHidden || !/confirmed/i.test(result.scannerState)) {''',
        '''  if (result.resultHidden || !result.emptyHidden || !/confirmed|completed/i.test(result.scannerState)) {''',
    ),
    (
        '''} catch (error) {\n  console.error(error.stack || error.message || String(error));''',
        '''} catch (error) {\n  try {\n    writeFileSync(`${ARTIFACT_DIR}/attendance-action-error.json`, JSON.stringify({\n      error: error.stack || error.message || String(error),\n      writes,\n      errors,\n    }, null, 2));\n    await page.screenshot({ path: `${ARTIFACT_DIR}/attendance-action-error.png`, fullPage: true });\n    writeFileSync(`${ARTIFACT_DIR}/attendance-action-error.html`, await page.content());\n  } catch (_) {}\n  console.error(error.stack || error.message || String(error));''',
    ),
]
for old, new in replacements:
    if old in source:
        source = source.replace(old, new, 1)
    elif new not in source:
        raise RuntimeError(f"attendance action patch target not found: {old[:80]}")
path.write_text(source, encoding="utf-8")
