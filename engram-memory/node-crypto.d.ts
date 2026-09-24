declare module "node:crypto" {
  interface BinaryBuffer {
    readonly byteLength: number;
    toString(encoding: "hex" | "base64url" | "utf8"): string;
  }

  interface Hash {
    update(data: string, inputEncoding?: "utf8"): Hash;
    digest(encoding: "hex"): string;
  }

  export function createHash(algorithm: "sha256"): Hash;
  export function randomBytes(size: number): BinaryBuffer;
  export function timingSafeEqual(left: BinaryBuffer, right: BinaryBuffer): boolean;
  export function createCipheriv(algorithm: "aes-256-gcm", key: BinaryBuffer, iv: BinaryBuffer): {
    setAAD(value: BinaryBuffer): void;
    update(value: string, encoding: "utf8"): BinaryBuffer;
    final(): BinaryBuffer;
    getAuthTag(): BinaryBuffer;
  };
  export function createDecipheriv(algorithm: "aes-256-gcm", key: BinaryBuffer, iv: BinaryBuffer): {
    setAAD(value: BinaryBuffer): void;
    setAuthTag(value: BinaryBuffer): void;
    update(value: BinaryBuffer): BinaryBuffer;
    final(): BinaryBuffer;
  };
}

declare module "node:fs/promises" {
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function writeFile(path: string, data: string, options: { encoding: "utf8"; mode: number; flag: "wx" }): Promise<void>;
  export function chmod(path: string, mode: number): Promise<void>;
  export function rename(from: string, to: string): Promise<void>;
  export function stat(path: string): Promise<{ mode: number }>;
}

declare class Buffer {
  static from(value: string, encoding: "utf8" | "base64url"): import("node:crypto").BinaryBuffer;
  static concat(values: import("node:crypto").BinaryBuffer[]): import("node:crypto").BinaryBuffer;
}
