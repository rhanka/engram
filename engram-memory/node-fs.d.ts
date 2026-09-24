declare module "node:fs" {
  interface FileStats {
    readonly dev: number;
    readonly ino: number;
  }

  // The bigint form (fstatSync/statSync with { bigint: true }) — a large XFS/btrfs inode exceeds 2^53 and would
  // lose precision as a JS number, so the fence carries dev/ino as bigint end to end.
  interface BigIntFileStats {
    readonly dev: bigint;
    readonly ino: bigint;
    // Hard-link count of the inode; the fence refuses st_nlink > 1 (a multiply-linked canonical database).
    readonly nlink: bigint;
  }

  interface FileSystemStats {
    readonly type: number | bigint;
  }

  export function mkdirSync(path: string, options: { recursive: true }): void;
  export function openSync(path: string, flags: "a", mode: number): number;
  export function closeSync(fd: number): void;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function rmSync(path: string, options: { force: true }): void;
  export function statSync(path: string): FileStats;
  export function statSync(path: string, options: { bigint: true }): BigIntFileStats;
  export function fstatSync(fd: number, options: { bigint: true }): BigIntFileStats;
  export function statfsSync(path: string): FileSystemStats;
}

declare module "node:path" {
  export function dirname(path: string): string;
}
