declare const Deno: {
  readonly env: {
    get(name: string): string | undefined;
  };
  test(name: string, run: () => void | Promise<void>): void;
};
