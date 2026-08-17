declare module "better-sqlite3" {
  export interface Statement {
    get(...parameters: unknown[]): unknown;
    all(...parameters: unknown[]): unknown[];
    run(...parameters: unknown[]): { changes: number };
  }

  export interface Database {
    exec(source: string): void;
    prepare(source: string): Statement;
    pragma(source: string): unknown;
    close(): void;
  }

  interface DatabaseConstructor {
    new (filename: string, options?: { readonly?: boolean; fileMustExist?: boolean }): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}

declare module "fs-ext" {
  export function flockSync(fd: number, operation: "exnb" | "un"): void;
}
