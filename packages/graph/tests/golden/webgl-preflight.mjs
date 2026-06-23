// SwiftShader headless-WebGL2 PREFLIGHT for the `golden-webgl` CI lane.
//
// Why this exists: the WebGL golden pixel-diff is only meaningful if Chrome can
// actually create a *real WebGL2 context*. On GitHub-hosted runners there is no
// hardware GL, so we drive ANGLE's SOFTWARE backend (SwiftShader). Recent Chrome
// (115+) gates SwiftShader behind `--enable-unsafe-swiftshader` and NO LONGER
// falls back to it automatically, so a misconfigured lane would silently get NO
// context and the pixel-diff suite would skip -- a false "green".
//
// This preflight launches headless Chrome with the exact SwiftShader flag set
// the golden harness uses (cdp-harness.mjs, GOLDEN_ENABLE_WEBGL=1) and asserts a
// genuine WebGL2 context + a clean readPixels. It exits NON-ZERO if no context
// is obtained, so the CI lane HARD-FAILS instead of skipping. This is the gate
// that makes "the WebGL2 pixel-diff actually ran" provable in CI logs.
//
//   node webgl-preflight.mjs   # exit 0 => real WebGL2 ctx; non-zero => no ctx

import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAPH_PKG = path.resolve(__dirname, "../..");
const require = createRequire(pathToFileURL(path.join(GRAPH_PKG, "package.json")));

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/snap/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter(Boolean);

function findChrome() {
  for (const c of CHROME_CANDIDATES) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  throw new Error("No Chrome/Chromium binary found. Set CHROME_BIN. Tried: " + CHROME_CANDIDATES.join(", "));
}

// The SAME software-GL flags cdp-harness.mjs uses under GOLDEN_ENABLE_WEBGL=1.
const GL_FLAGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader-webgl",
  "--enable-unsafe-swiftshader",
];

const PROBE_HTML = `<!doctype html><html><body><canvas id="c" width="64" height="64"></canvas>
<script>
window.__glinfo = (function () {
  try {
    var c = document.getElementById("c");
    // antialias:false matches the golden harness contract (deterministic raster).
    var gl = c.getContext("webgl2", { antialias: false });
    if (!gl) return { webgl2: false, reason: "getContext('webgl2') returned null" };
    var dbg = gl.getExtension("WEBGL_debug_renderer_info");
    var vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    var renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.clearColor(1, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    var px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return {
      webgl2: true,
      vendor: String(vendor),
      renderer: String(renderer),
      version: String(gl.getParameter(gl.VERSION)),
      clearPixel: [px[0], px[1], px[2], px[3]],
    };
  } catch (e) {
    return { webgl2: false, reason: String(e) };
  }
})();
</script></body></html>`;

function getJson(port) {
  return new Promise((res, rej) => {
    http
      .get(`http://127.0.0.1:${port}/json`, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => {
          try {
            res(JSON.parse(d));
          } catch (e) {
            rej(e);
          }
        });
      })
      .on("error", rej);
  });
}

async function main() {
  const WebSocket = require("ws");
  const chromeBin = findChrome();

  const server = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PROBE_HTML);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const httpPort = server.address().port;

  const cdpPort = 9500 + Math.floor(Math.random() * 400);
  const profile = path.join(GRAPH_PKG, ".graphify-webgl-preflight-" + process.pid + "-" + Date.now());

  const chrome = spawn(
    chromeBin,
    [
      "--headless=new",
      ...GL_FLAGS,
      "--no-sandbox",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profile}`,
      "--window-size=256,256",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const cleanup = () => {
    try {
      chrome.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    try {
      server.close();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  let pageInfo = null;
  for (let i = 0; i < 80; i += 1) {
    try {
      const tabs = await getJson(cdpPort);
      const page = tabs.find((x) => x.type === "page");
      if (page && page.webSocketDebuggerUrl) {
        pageInfo = page;
        break;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!pageInfo) {
    cleanup();
    console.error("[webgl-preflight] FAIL: Chrome devtools endpoint did not come up");
    process.exit(2);
  }

  const ws = new WebSocket(pageInfo.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await new Promise((r, rej) => {
    ws.on("open", r);
    ws.on("error", rej);
  });
  ws.on("message", (m) => {
    const o = JSON.parse(m);
    if (o.id && pending.has(o.id)) {
      const { res, rej } = pending.get(o.id);
      pending.delete(o.id);
      if (o.error) rej(new Error(o.error.message || JSON.stringify(o.error)));
      else res(o.result);
    }
  });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${httpPort}/` });

  let info = { webgl2: false, reason: "page never evaluated" };
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await send("Runtime.evaluate", {
        expression: "window.__glinfo ? JSON.stringify(window.__glinfo) : ''",
        returnByValue: true,
      });
      if (r.result && r.result.value) {
        info = JSON.parse(r.result.value);
        break;
      }
    } catch {
      /* page still loading */
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  try {
    ws.close();
  } catch {
    /* ignore */
  }
  cleanup();

  console.log("[webgl-preflight] chrome =", chromeBin);
  console.log("[webgl-preflight] flags  =", GL_FLAGS.join(" "));
  console.log("[webgl-preflight] glinfo =", JSON.stringify(info));

  if (!info.webgl2) {
    console.error(
      "[webgl-preflight] FAIL: no software WebGL2 context. The golden-webgl lane " +
        "requires a Chrome that can create a SwiftShader WebGL2 context. " +
        "Reason: " + (info.reason || "unknown"),
    );
    process.exit(1);
  }

  // A real software context renders through SwiftShader/ANGLE -- assert the
  // clear actually wrote our red so we never pass on a dead/no-op context.
  const [r, g, b, a] = info.clearPixel || [];
  if (!(r === 255 && g === 0 && b === 0 && a === 255)) {
    console.error("[webgl-preflight] FAIL: WebGL2 context present but clear/readPixels wrong:", info.clearPixel);
    process.exit(3);
  }

  console.log(
    `[webgl-preflight] OK: real WebGL2 via "${info.renderer}" (${info.vendor}); ` +
      "clear+readPixels verified. The golden-webgl pixel-diff will RUN.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[webgl-preflight] FAIL (unexpected):", err);
  process.exit(4);
});
