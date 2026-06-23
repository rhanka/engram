/**
 * T1 — the end-to-end proof that the offline `studio.html` renders from a bare
 * `file://` URL with ZERO blocked/failed network requests on the first-paint path
 * (INV-1). Loads the REAL emitted single-file studio in headless Chrome over CDP
 * (driven through the `ws` WebSocket protocol — no puppeteer/playwright dep) and
 * asserts: the graph canvas painted, the bundle was read from memory, and the CDP
 * network log shows no `Network.loadingFailed`.
 *
 * Best-effort gate: SKIPS (does not fail) when the prebuilt single-file template,
 * a Chrome binary, or the `ws` module is unavailable in the environment — and also
 * when Chrome is present but fails to launch / expose its CDP websocket for an
 * ENVIRONMENTAL reason (e.g. the GitHub runner's flaky `Failed to connect to the
 * bus` / dbus error that intermittently kills the devtools endpoint). The render
 * assertions stay hard failures whenever Chrome actually comes up.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { buildStaticStudio, SINGLE_FILE_TEMPLATE_NAME } from "../src/studio-export.js";
import { resolveStudioAppDir } from "../src/studio-assets.js";

function findChrome(): string | null {
  for (const bin of ["google-chrome", "chromium", "chromium-browser", "google-chrome-stable"]) {
    const r = spawnSync(bin, ["--version"], { stdio: "ignore" });
    if (r.status === 0) return bin;
  }
  return null;
}

async function tryLoadWs(): Promise<unknown | null> {
  try {
    const mod = await import("ws");
    return (mod as { default?: unknown }).default ?? mod;
  } catch {
    return null;
  }
}

const spaDir = resolveStudioAppDir();
const templateReady = !!spaDir && existsSync(join(spaDir, SINGLE_FILE_TEMPLATE_NAME));
const chromeBin = findChrome();

const procs: ChildProcess[] = [];
afterAll(() => {
  for (const p of procs.splice(0)) {
    try {
      p.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
});

// Minimal CDP client over a raw WebSocket.
function makeCdp(WebSocketCtor: new (url: string, opts?: unknown) => WsLike, url: string) {
  const ws = new WebSocketCtor(url, { maxPayload: 256 * 1024 * 1024 });
  let id = 0;
  const pending = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>();
  const listeners: Array<(msg: CdpMessage) => void> = [];
  const ready = new Promise<void>((res) => ws.on("open", () => res()));
  ws.on("message", (data: unknown) => {
    const msg = JSON.parse(String(data)) as CdpMessage;
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)!;
      pending.delete(msg.id);
      msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  });
  return {
    ready,
    send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
      return new Promise((res, rej) => {
        const i = ++id;
        pending.set(i, { res, rej });
        ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    on: (fn: (msg: CdpMessage) => void) => listeners.push(fn),
    close: () => ws.close(),
  };
}

interface WsLike {
  on(event: string, cb: (...args: unknown[]) => void): void;
  send(data: string): void;
  close(): void;
}
interface CdpMessage {
  id?: number;
  method?: string;
  sessionId?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message: string };
}

describe("T1 — offline studio.html renders over file:// with zero failed requests", () => {
  const run = templateReady && chromeBin ? it : it.skip;

  run(
    "graph paints from the inlined bundle, no blocked/failed network requests",
    async (ctx) => {
      const WebSocketCtor = (await tryLoadWs()) as
        | (new (url: string, opts?: unknown) => WsLike)
        | null;
      if (!WebSocketCtor) {
        // ws unavailable: skip rather than fail (best-effort environment gate).
        ctx.skip("ws module unavailable");
        return;
      }

      // 1. Emit a REAL studio.html from a small real graph.
      const stateDir = mkdtempSync(join(tmpdir(), "t1-state-"));
      const nodes = Array.from({ length: 30 }, (_, i) => ({
        id: `n${i}`,
        label: `Node ${i}`,
        type: "Character",
      }));
      const links = Array.from({ length: 29 }, (_, i) => ({ source: "n0", target: `n${i + 1}` }));
      writeFileSync(join(stateDir, "graph.json"), JSON.stringify({ nodes, links }));
      const outDir = join(stateDir, "studio");
      const result = buildStaticStudio({ stateDir, outDir, onWarning: () => {} });
      expect(result.studioHtmlPath).not.toBeNull();
      const fileUrl = pathToFileURL(result.studioHtmlPath!).href;

      // 2. Launch headless Chrome with a CDP endpoint.
      const userDir = mkdtempSync(join(tmpdir(), "t1-chrome-"));
      const chrome = spawn(
        chromeBin!,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-sandbox",
          // Stability flags for constrained CI runners: avoid the tiny default
          // /dev/shm and the dbus session bus that flakes on GitHub runners.
          "--disable-dev-shm-usage",
          "--disable-dbus",
          "--remote-debugging-port=0",
          `--user-data-dir=${userDir}`,
          "about:blank",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      procs.push(chrome);

      // A failed/aborted launch (missing binary, dbus failure, runner refusing to
      // expose the CDP websocket) is ENVIRONMENTAL — skip rather than fail T1. Any
      // error from the spawn itself or from waiting on the devtools ws lands here.
      let wsUrl: string;
      try {
        wsUrl = await new Promise<string>((res, rej) => {
          let stderr = "";
          const t = setTimeout(() => rej(new Error(`no devtools ws; stderr:\n${stderr}`)), 20000);
          chrome.on("error", (err) => {
            clearTimeout(t);
            rej(err instanceof Error ? err : new Error(String(err)));
          });
          chrome.on("exit", (code, signal) => {
            clearTimeout(t);
            rej(new Error(`chrome exited early (code=${code}, signal=${signal})\n${stderr}`));
          });
          chrome.stderr!.on("data", (d) => {
            stderr += String(d);
            const m = stderr.match(/ws:\/\/[^\s]+\/devtools\/browser\/[a-f0-9-]+/);
            if (m) {
              clearTimeout(t);
              res(m[0]);
            }
          });
        });
      } catch (err) {
        try {
          chrome.kill("SIGKILL");
        } catch {
          /* ignore */
        }
        ctx.skip(`chrome failed to launch / expose CDP websocket: ${(err as Error).message}`);
        return;
      }

      const browser = makeCdp(WebSocketCtor, wsUrl);
      await browser.ready;
      const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await browser.send("Target.attachToTarget", {
        targetId,
        flatten: true,
      });

      // 3. Capture every failed/blocked request for this page session.
      const failed: Array<{ url?: string; errorText?: string; blockedReason?: string }> = [];
      browser.on((msg) => {
        if (msg.sessionId !== sessionId) return;
        if (msg.method === "Network.loadingFailed") {
          failed.push(msg.params as { errorText?: string; blockedReason?: string });
        }
      });

      await browser.send("Network.enable", {}, sessionId);
      await browser.send("Page.enable", {}, sessionId);
      await browser.send("Runtime.enable", {}, sessionId);
      await browser.send("Page.navigate", { url: fileUrl }, sessionId);

      // Give the SPA time to mount + paint the canvas.
      await new Promise((r) => setTimeout(r, 5000));

      const evalExpr = async <T>(expression: string): Promise<T> => {
        const out = await browser.send(
          "Runtime.evaluate",
          { expression, returnByValue: true, awaitPromise: true },
          sessionId,
        );
        if (out.exceptionDetails) {
          throw new Error(`${expression} -> ${JSON.stringify(out.exceptionDetails)}`);
        }
        return out.result.value as T;
      };

      const bundlePresent = await evalExpr<boolean>(
        "typeof window.__GRAPHIFY_BUNDLE__ === 'object' && !!window.__GRAPHIFY_BUNDLE__['scene.json']",
      );
      const appChildren = await evalExpr<number>(
        "document.getElementById('app') ? document.getElementById('app').childElementCount : -1",
      );
      const canvasSized = await evalExpr<boolean>(
        "[...document.querySelectorAll('canvas')].some(c => c.width > 0 && c.height > 0)",
      );

      browser.close();
      chrome.kill("SIGKILL");

      // INV-1: the scene was read from memory, the SPA mounted, the canvas painted,
      // and NOT A SINGLE network request failed or was blocked on first paint.
      expect(bundlePresent).toBe(true);
      expect(appChildren).toBeGreaterThan(0);
      expect(canvasSized).toBe(true);
      expect(failed, `failed/blocked requests: ${JSON.stringify(failed)}`).toHaveLength(0);
    },
    60000,
  );
});
