export {};

declare global {
  var Deno: {
    test(name: string, run: () => void | Promise<void>): void;
    readonly args: readonly string[];
    readTextFile(path: string | URL): Promise<string>;
    writeTextFile(path: string | URL, data: string): Promise<void>;
  };
}
