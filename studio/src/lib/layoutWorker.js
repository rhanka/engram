/**
 * codeflow-parity Lot 7 — off-main-thread force layout worker.
 *
 * Runs the deterministic Barnes-Hut `computeLayout` (the same module the server
 * build/export uses) in a Web Worker so a Spread/Links re-solve at scale never
 * freezes the main thread. The client (`forceLayoutClient.js`) falls back to a
 * synchronous solve when no Worker is available (SSR / jsdom tests), so this file
 * is only ever loaded in a real browser.
 */
import { computeLayout } from "@graphify/graph-layout";

self.onmessage = (event) => {
  const { id, nodes, edges, options } = event.data ?? {};
  try {
    const positions = computeLayout(nodes ?? [], edges ?? [], options ?? {});
    self.postMessage({ id, positions });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
