declare module "node:crypto" {
  interface Hash {
    update(data: string, inputEncoding?: "utf8"): Hash;
    digest(encoding: "hex"): string;
  }

  export function createHash(algorithm: "sha256"): Hash;
}
