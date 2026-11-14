import { register } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

register(new URL("./multi-links-source-loader.mjs", import.meta.url));
const { createSqliteGraphStorePrepared } = await import("../../src/storage/sqlite.ts");
const { sqliteDriver } = await import("../helpers/multi-links-sqlite.ts");
const gate = new Int32Array(workerData.gate);
let armed = false, mode;
const driver = await sqliteDriver(sql => {
  if (!armed || !sql.startsWith("BEGIN")) return;
  mode = sql;
  if (workerData.role === "second") parentPort.postMessage({ type: "attempting" });
});
const driverModule = { default: class extends driver.default {
  prepare(sql) {
    const stmt = super.prepare(sql);
    return { ...stmt, get: (...args) => {
      const row = stmt.get(...args);
      if (armed && workerData.role === "first" && /^SELECT \* FROM graph_edges/.test(sql)) {
        parentPort.postMessage({ type: "read", mode });
        if (Atomics.wait(gate, 0, 0, 15000) === "timed-out") throw new Error("append overlap gate timed out");
      }
      return row;
    } };
  }
} };
const store = await createSqliteGraphStorePrepared({ citySlug: "p2", target: workerData.target }, { driverModule });
await store.queryWindow(0, 10); // finish setup before the coordinated append
parentPort.postMessage({ type: "ready" });
parentPort.once("message", async () => {
  armed = true;
  try { parentPort.postMessage({ type: "result", outcome: await store.appendEdge(workerData.edge) }); }
  catch (error) { parentPort.postMessage({ type: "result", error: error.message }); }
  finally { await store.close(); parentPort.close(); }
});
