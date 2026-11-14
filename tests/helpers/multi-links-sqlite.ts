import { createRequire, isBuiltin } from "node:module";
import { spawn } from "node:child_process";
import { readSync, writeSync } from "node:fs";
import { loadSqliteTestDriver } from "../fixtures/sqlite-host-driver.js";

// Real SQL engine with the production driver's deferred/default API semantics.
export async function sqliteDriver(onStatement: (sql: string) => void = () => {}) {
  const Database = await loadSqliteEngine();
  return { default: class {
    db: any;
    constructor(path: string) { this.db = new Database(path); }
    pragma(sql: string) { this.db.exec(`PRAGMA ${sql}`); }
    exec(sql: string) { onStatement(sql); this.db.exec(sql); }
    prepare(sql: string) {
      onStatement(sql);
      const stmt = this.db.prepare(sql);
      return { run: (...args: any[]) => stmt.run(...args), get: (...args: any[]) => stmt.get(...args), all: (...args: any[]) => stmt.all(...args) };
    }
    transaction(fn: (...args: any[]) => any) {
      const run = (begin: string, args: any[]) => {
        this.exec(begin);
        try { const result = fn(...args); this.exec("COMMIT"); return result; }
        catch (error) { this.exec("ROLLBACK"); throw error; }
      };
      return Object.assign((...args: any[]) => run("BEGIN", args), {
        immediate: (...args: any[]) => run("BEGIN IMMEDIATE", args),
      });
    }
    close() { this.db.close(); }
  } };
}

// CI installs this test-host driver for each runtime's own ABI. Node 20 must
// never resolve node:sqlite, including when only the PostgreSQL helper is loaded.
export async function loadSqliteEngine(): Promise<any> {
  try { return (await loadSqliteTestDriver()).default; }
  catch (nativeError) {
    if (isBuiltin("node:sqlite")) return createRequire(import.meta.url)("node:sqlite").DatabaseSync;
    // Local mixed-runtime checkouts can explicitly lend a SQLite-capable Node
    // host when their native addon is absent. All assertions still execute real
    // SQL, on one persistent connection, including BEGIN/COMMIT/ROLLBACK.
    const host = process.env.ENGRAM_TEST_SQLITE_NODE;
    if (host) return remoteSqlite(host);
    throw new Error("SQLite test engine unavailable: provide the existing test-host better-sqlite3 driver, or ENGRAM_TEST_SQLITE_NODE for a local engine host", { cause: nativeError });
  }
}

function remoteSqlite(host: string) {
  const worker = `
    const {DatabaseSync} = require('node:sqlite');
    const db = new DatabaseSync(process.argv[1]);
    require('node:readline').createInterface({input:process.stdin}).on('line', line => {
      try {
        const {method,sql,args} = JSON.parse(line);
        const value = method === 'close' ? db.close() : method === 'exec' ? db.exec(sql) : db.prepare(sql)[method](...args);
        process.stdout.write(JSON.stringify({value}, (_,v)=>typeof v==='bigint'?Number(v):v)+'\\n');
        if(method === 'close') process.exit(0);
      } catch(error) { process.stdout.write(JSON.stringify({error:error.message})+'\\n'); }
    });`;
  return class {
    child: ReturnType<typeof spawn>;
    buffered = "";
    constructor(path: string) {
      this.child = spawn(host, ["--no-warnings", "-e", worker, path], { stdio: ["pipe", "pipe", "inherit"] });
      this.exec("SELECT 1"); // engine/startup failures cannot become inverted passes
    }
    request(method: string, sql = "", args: any[] = []) {
      const input = (this.child.stdin as any)._handle.fd, output = (this.child.stdout as any)._handle.fd;
      writeSync(input, JSON.stringify({ method, sql, args }) + "\n");
      const bytes = Buffer.alloc(65536), deadline = Date.now() + 5000;
      while (!this.buffered.includes("\n")) {
        if (Date.now() > deadline) { this.child.kill(); throw new Error("SQLite test engine host did not respond"); }
        try {
          const length = readSync(output, bytes, 0, bytes.length, null);
          if (length === 0) throw new Error("SQLite test engine host exited without a response");
          this.buffered += bytes.toString("utf8", 0, length);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EAGAIN") throw error;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
        }
      }
      const end = this.buffered.indexOf("\n"), response = JSON.parse(this.buffered.slice(0, end));
      this.buffered = this.buffered.slice(end + 1);
      if (response.error) throw new Error(response.error);
      return response.value;
    }
    exec(sql: string) { this.request("exec", sql); }
    prepare(sql: string) {
      return Object.fromEntries(["run", "get", "all"].map(method => [method, (...args: any[]) => this.request(method, sql, args)])) as any;
    }
    close() { try { this.request("close"); } finally { this.child.stdin!.end(); this.child.kill(); } }
  };
}
