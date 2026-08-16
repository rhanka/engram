declare module "node:fs" {
  interface FileStats {
    readonly dev: number;
    readonly ino: number;
  }

  interface FileSystemStats {
    readonly type: number | bigint;
  }

  export function mkdirSync(path: string, options: { recursive: true }): void;
  export function openSync(path: string, flags: "a", mode: number): number;
  export function closeSync(fd: number): void;
  export function rmSync(path: string, options: { force: true }): void;
  export function statSync(path: string): FileStats;
  export function statfsSync(path: string): FileSystemStats;
}

declare module "node:path" {
  export function dirname(path: string): string;
}
