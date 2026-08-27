#!/usr/bin/env python3
from __future__ import annotations

import re
import textwrap
from pathlib import Path

WORKFLOW = Path('.github/workflows/c1-backend-api-source-implementation-v2.yml')


def extract_heredocs(source: str) -> None:
    pattern = re.compile(
        r"^\s*cat > (?P<path>[^\s]+) <<'EOF'\n(?P<body>.*?)^\s*EOF\s*$",
        re.MULTILINE | re.DOTALL,
    )
    matches = list(pattern.finditer(source))
    if len(matches) != 2:
        raise SystemExit(f'expected 2 TypeScript heredocs, found {len(matches)}')
    for match in matches:
        path = Path(match.group('path'))
        body = textwrap.dedent(match.group('body')).rstrip() + '\n'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body)


def execute_patch_blocks(source: str) -> None:
    pattern = re.compile(
        r"^\s*python3 - <<'PY'\n(?P<body>.*?)^\s*PY\s*$",
        re.MULTILINE | re.DOTALL,
    )
    blocks = [textwrap.dedent(match.group('body')) for match in pattern.finditer(source)]
    if len(blocks) != 4:
        raise SystemExit(f'expected 4 Python patch blocks, found {len(blocks)}')
    for index, block in enumerate(blocks, start=1):
        code = compile(block, f'{WORKFLOW}:patch-{index}', 'exec')
        exec(code, {'__name__': '__main__'})


def repair_offer_repository_scope() -> None:
    path = Path('backend/src/domains/store/api/playerStorePublicHttpHandler.ts')
    text = path.read_text()
    products_old = '''    if (route.kind === "products") {
      const repository = createRepository();
      const catalog = await repository.listCatalog(publicScope);'''
    products_new = '''    if (route.kind === "products") {
      const repository = createRepository();
      const offerRepository = createOfferRepository();
      const catalog = await repository.listCatalog(publicScope);'''
    if products_old in text:
        text = text.replace(products_old, products_new, 1)
    elif products_new not in text:
        raise SystemExit('products offer repository scope is missing')

    business_old = '''    const offerRepository = createOfferRepository();

    if (route.kind === "business-offer-quote") {'''
    business_new = '''    if (route.kind === "business-offer-quote") {'''
    if business_old in text:
        text = text.replace(business_old, business_new, 1)
    path.write_text(text)


def validate_materialization() -> None:
    required = [
        Path('backend/src/domains/store/contracts/playerStoreFundingPublicContracts.ts'),
        Path('backend/src/domains/store/infrastructure/supabasePlayerStoreFundingPublicRepository.ts'),
    ]
    for path in required:
        if not path.is_file() or path.stat().st_size < 1000:
            raise SystemExit(f'materialized source is missing or truncated: {path}')

    handler = Path('backend/src/domains/store/api/playerStorePublicHttpHandler.ts').read_text()
    if handler.count('const offerRepository = createOfferRepository();') != 1:
        raise SystemExit('handler must retain exactly one catalog offer repository')
    for token in (
        'createFundingRepository',
        'readPlayerStoreFundingAllocations',
        'settleSeededPurchase',
        'settleBusinessOfferPurchase',
    ):
        if token not in handler:
            raise SystemExit(f'handler cutover token missing: {token}')


def main() -> None:
    if not WORKFLOW.is_file():
        raise SystemExit(f'workflow data source is missing: {WORKFLOW}')
    source = WORKFLOW.read_text()
    extract_heredocs(source)
    execute_patch_blocks(source)
    repair_offer_repository_scope()
    validate_materialization()


if __name__ == '__main__':
    main()
