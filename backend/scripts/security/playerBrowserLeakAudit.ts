const TEXT_FILE_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".log",
  ".map",
  ".md",
  ".mjs",
  ".txt",
]);

const SKIPPED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
]);

const SENSITIVE_IDENTIFIER = String
  .raw`(?:access.?code|authorization|credential|password|player.?session.?token|service.?role|session.?token(?:.?hash)?|token.?hash|internal\w*uuid|player.?uuid|game.?uuid)`;

const SECRET_VALUE_PATTERNS: readonly {
  readonly code: string;
  readonly pattern: RegExp;
}[] = [
  {
    code: "jwt_literal",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    code: "private_key_literal",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    code: "supabase_service_role_literal",
    pattern:
      /\b(?:SUPABASE_SERVICE_ROLE_KEY|service_role_key)\s*[:=]\s*["'][^"'\s]{16,}["']/gi,
  },
];

const SENSITIVE_SINK_PATTERNS: readonly {
  readonly code: string;
  readonly pattern: RegExp;
}[] = [
  {
    code: "sensitive_console_sink",
    pattern: new RegExp(
      String
        .raw`console\.(?:debug|error|info|log|warn)\s*\([^\n;]*${SENSITIVE_IDENTIFIER}`,
      "gi",
    ),
  },
  {
    code: "sensitive_dom_sink",
    pattern: new RegExp(
      String
        .raw`(?:innerHTML|outerHTML|textContent|insertAdjacentHTML)\s*=\s*[^\n;]*${SENSITIVE_IDENTIFIER}`,
      "gi",
    ),
  },
  {
    code: "sensitive_storage_sink",
    pattern: new RegExp(
      String
        .raw`(?:localStorage|sessionStorage)\.(?:setItem|getItem)\s*\([^\n;]*${SENSITIVE_IDENTIFIER}`,
      "gi",
    ),
  },
  {
    code: "sensitive_message_sink",
    pattern: new RegExp(
      String.raw`postMessage\s*\([^\n;]*${SENSITIVE_IDENTIFIER}`,
      "gi",
    ),
  },
];

export interface BrowserLeakViolation {
  readonly path: string;
  readonly line: number;
  readonly code: string;
  readonly excerpt: string;
}

export function auditBrowserText(
  path: string,
  text: string,
): readonly BrowserLeakViolation[] {
  const violations: BrowserLeakViolation[] = [];

  for (const rule of [...SECRET_VALUE_PATTERNS, ...SENSITIVE_SINK_PATTERNS]) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      const offset = match.index ?? 0;
      violations.push({
        path,
        line: lineNumberAt(text, offset),
        code: rule.code,
        excerpt: redactedExcerpt(rule.code),
      });
    }
  }

  return violations.sort((left, right) =>
    left.line - right.line || left.code.localeCompare(right.code)
  );
}

export async function auditBrowserPaths(
  paths: readonly string[],
): Promise<readonly BrowserLeakViolation[]> {
  const violations: BrowserLeakViolation[] = [];

  for (const path of paths) {
    for await (const filePath of walkTextFiles(path)) {
      const text = await Deno.readTextFile(filePath);
      violations.push(...auditBrowserText(filePath, text));
    }
  }

  return violations.sort((left, right) =>
    left.path.localeCompare(right.path) || left.line - right.line ||
    left.code.localeCompare(right.code)
  );
}

async function* walkTextFiles(path: string): AsyncGenerator<string> {
  let fileInfo: Deno.FileInfo;
  try {
    fileInfo = await Deno.stat(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return;
    }
    throw error;
  }

  if (fileInfo.isFile) {
    if (isTextFile(path)) {
      yield path;
    }
    return;
  }

  for await (const entry of Deno.readDir(path)) {
    if (entry.isDirectory && SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
      continue;
    }
    yield* walkTextFiles(joinPath(path, entry.name));
  }
}

function isTextFile(path: string): boolean {
  const normalized = path.toLowerCase();
  for (const extension of TEXT_FILE_EXTENSIONS) {
    if (normalized.endsWith(extension)) {
      return true;
    }
  }
  return false;
}

function joinPath(parent: string, child: string): string {
  return `${parent.replace(/[\\/]$/, "")}/${child}`;
}

function lineNumberAt(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}

function redactedExcerpt(code: string): string {
  return `[REDACTED ${code} match]`;
}

if (import.meta.main) {
  const repositoryRoot = new URL("../../../", import.meta.url).pathname;
  const requestedPaths = Deno.args.length > 0 ? Deno.args : [
    `${repositoryRoot}player-terminal/src`,
    `${repositoryRoot}player-terminal/index.html`,
    `${repositoryRoot}player-terminal/preview`,
    `${repositoryRoot}player-terminal/dist`,
    `${repositoryRoot}player-terminal/coverage`,
    `${repositoryRoot}player-terminal/playwright-report`,
    `${repositoryRoot}player-terminal/test-results`,
    `${repositoryRoot}artifacts`,
  ];
  const violations = await auditBrowserPaths(requestedPaths);

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(
        `${violation.path}:${violation.line} ${violation.code}: ${violation.excerpt}`,
      );
    }
    console.error(
      `Player browser leak audit failed with ${violations.length} violation(s).`,
    );
    Deno.exit(1);
  }

  console.log(
    `Player browser leak audit passed (${requestedPaths.length} roots checked).`,
  );
}
