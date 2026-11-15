/** Lex static module declarations without accepting comments or literal contents. */
interface Token {
  readonly kind: "word" | "string" | "punct";
  readonly value: string;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  const quoted = (quote: string): string => {
    const start = ++index;
    let value = "";
    while (index < source.length && source[index] !== quote) {
      if (source[index] === "\\") {
        index += 2;
      } else {
        index++;
      }
    }
    value = source.slice(start, index);
    index++;
    return value;
  };
  const comment = (): boolean => {
    if (source.startsWith("//", index)) {
      while (index < source.length && source[index] !== "\n") index++;
      return true;
    }
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      index = end < 0 ? source.length : end + 2;
      return true;
    }
    return false;
  };
  const template = (): void => {
    index++;
    while (index < source.length) {
      if (source[index] === "\\") {
        index += 2;
        continue;
      }
      if (source[index] === "`") {
        index++;
        return;
      }
      if (source.startsWith("${", index)) {
        index += 2;
        let depth = 1;
        while (index < source.length && depth > 0) {
          if (comment()) continue;
          if (source[index] === '"' || source[index] === "'") {
            quoted(source[index]);
            continue;
          }
          if (source[index] === "`") {
            template();
            continue;
          }
          if (source[index] === "{") depth++;
          if (source[index] === "}") depth--;
          index++;
        }
      } else {
        index++;
      }
    }
  };
  while (index < source.length) {
    if (/\s/u.test(source[index])) {
      index++;
      continue;
    }
    if (comment()) continue;
    const character = source[index];
    if (character === '"' || character === "'") {
      tokens.push({ kind: "string", value: quoted(character) });
    } else if (character === "`") {
      template();
      tokens.push({ kind: "punct", value: "template" });
    } else if (/[A-Za-z_$]/u.test(character)) {
      const start = index++;
      while (index < source.length && /[\w$]/u.test(source[index])) index++;
      tokens.push({ kind: "word", value: source.slice(start, index) });
    } else {
      tokens.push({ kind: "punct", value: character });
      index++;
    }
  }
  return tokens;
}

/** Only value imports/reexports establish runtime reachability. */
export function staticValueImports(source: string): readonly string[] {
  const tokens = tokenize(source);
  const paths: string[] = [];
  let depth = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.value === "{") depth++;
    if (token.value === "}") depth--;
    if (
      depth !== 0 || token.kind !== "word" ||
      !["import", "export"].includes(token.value)
    ) continue;
    const previous = tokens[index - 1];
    if (previous && ![";", "}"].includes(previous.value)) continue;
    let cursor = index + 1;
    let hasValue = false;
    if (token.value === "import" && tokens[cursor]?.kind === "string") {
      paths.push(tokens[cursor].value);
      continue;
    }
    if (
      tokens[cursor]?.value === "type" && tokens[cursor + 1]?.value !== "from"
    ) continue;
    if (token.value === "import" && tokens[cursor]?.kind === "word") {
      hasValue = true;
      cursor++;
      if (tokens[cursor]?.value === ",") cursor++;
    }
    if (tokens[cursor]?.value === "*") {
      hasValue = true;
      cursor++;
      if (tokens[cursor]?.value === "as") cursor += 2;
    } else if (tokens[cursor]?.value === "{") {
      cursor++;
      while (cursor < tokens.length && tokens[cursor].value !== "}") {
        const entry: Token[] = [];
        while (
          cursor < tokens.length && ![",", "}"].includes(tokens[cursor].value)
        ) entry.push(tokens[cursor++]);
        if (
          entry.length &&
          !(entry[0].value === "type" && entry.length > 1 &&
            entry[1].value !== "as")
        ) hasValue = true;
        if (tokens[cursor]?.value === ",") cursor++;
      }
      cursor++;
    }
    if (
      hasValue && tokens[cursor]?.value === "from" &&
      tokens[cursor + 1]?.kind === "string"
    ) paths.push(tokens[cursor + 1].value);
  }
  return paths;
}
