/**
 * codeflow-parity Lot 7 — client for the off-main-thread force layout.
 *
 * `solveForce` runs the deterministic Barnes-Hut `computeLayout` in a Web Worker
 * when one is available (a real browser), so a Spread/Links re-solve at scale
 * does not block the main thread / drop frames. When no Worker exists (SSR, jsdom
 * tests, or a worker-construction failure) it degrades to a SYNCHRONOUS solve —
 * byte-identical result, just on the main thread. Same-shape output either way
 * (`LayoutResult[]` = `{ id, x, y }[]`), so the caller is agnostic to the path.
 */
import { computeLayout } from "@graphify/graph-layout";

let worker = null;
let workerBroken = false;
let seq = 0;
const pending = new Map();

/** True when this environment can construct a module Web Worker. */
export function workerSupported() {
  return !workerBroken && typeof Worker !== "undefined" && typeof URL !== "undefined";
}

function ensureWorker() {
  if (worker || !workerSupported()) return worker;
  try {
    worker = new Worker(new URL("./layoutWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const { id, positions, error } = event.data ?? {};
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (error) entry.reject(new Error(error));
      else entry.resolve(positions);
    };
    worker.onerror = () => {
      // A worker failure (e.g. import error) must never wedge the feature: reject
      // in-flight work, tear the worker down, and mark the env so future calls
      // take the synchronous fallback.
      workerBroken = true;
      for (const entry of pending.values()) entry.reject(new Error("layout worker error"));
      pending.clear();
      terminateForceWorker();
    };
  } catch {
    worker = null;
    workerBroken = true;
  }
  return worker;
}

/** Tear down the worker (call on component destroy). */
export function terminateForceWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  pending.clear();
}

/**
 * Solve a force layout. Resolves to `{ id, x, y }[]` (input order). Prefers the
 * worker; falls back to a synchronous solve when no worker is available or its
 * construction failed.
 * @param {{id:string}[]} nodes
 * @param {{source:string,target:string}[]} edges
 * @param {object} [options]  computeLayout options (repulsion / linkDistance /
 *                            iterations / initialPositions …)
 * @returns {Promise<{id:string,x:number,y:number}[]>}
 */
export function solveForce(nodes, edges, options = {}) {
  const w = ensureWorker();
  if (!w) return Promise.resolve(computeLayout(nodes ?? [], edges ?? [], options));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      w.postMessage({ id, nodes, edges, options });
    } catch (error) {
      // A non-cloneable payload (should not happen — options is plain + a Map)
      // falls back to sync so the feature never breaks.
      pending.delete(id);
      resolve(computeLayout(nodes ?? [], edges ?? [], options));
    }
  });
}
