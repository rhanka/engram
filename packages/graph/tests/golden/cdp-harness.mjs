// Chrome/CDP DIRECT-CANVAS-PIXEL golden oracle (B1 plan §5.1, fix #4).
//
// This is the PRIMARY parity oracle for the Canvas2D -> WebGL migration. It:
//   - launches headless Chrome,
//   - serves the harness page + the @sentropic/graph dist bundle over HTTP,
//   - pins a deterministic font and AWAITS document.fonts.ready before capture,
//   - renders a fixture with the Canvas2D backend onto a REAL <canvas>,
//   - reads the CANVAS BACKING STORE PIXELS DIRECTLY via
//     getImageData (2D) / gl.readPixels (WebGL) inside the page
//     -- NOT a whole-page Page.captureScreenshot (which is weaker: it
//     composites browser chrome/scaling). This supersedes cdp-shot.mjs:47.
//
// Public API:
//   const oracle = await openOracle();          // boots Chrome + server
//   const cap = await oracle.capture(fixture, { dpr, zoom, cssWidth, ... });
//        // -> { width, height, data: Uint8ClampedArray (RGBA, top-left) }
//   await oracle.close();
//
// Self-test:  node cdp-harness.mjs --selftest

import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAPH_PKG = path.resolve(__dirname, "../..");
const DIST_DIR = path.join(GRAPH_PKG, "dist");
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
  throw new Error(
    "No Chrome/Chromium binary found. Set CHROME_BIN. Tried: " +
      CHROME_CANDIDATES.join(", "),
  );
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// Tiny static server: serves the harness dir at / and the dist bundle at
// /graph-dist/.
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        const url = decodeURIComponent((req.url || "/").split("?")[0]);
        let filePath;
        if (url.startsWith("/graph-dist/")) {
          filePath = path.join(DIST_DIR, url.slice("/graph-dist/".length));
        } else {
          const rel = url === "/" ? "/harness-page.html" : url;
          filePath = path.join(__dirname, rel);
        }
        // Path-traversal guard.
        const root = path.dirname(__dirname);
        if (!filePath.startsWith(GRAPH_PKG) && !filePath.startsWith(root)) {
          res.writeHead(403).end("forbidden");
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404).end("not found");
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500).end(String(err));
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

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

async function waitDevtools(port) {
  for (let i = 0; i < 80; i += 1) {
    try {
      const tabs = await getJson(port);
      const page = tabs.find((x) => x.type === "page");
      if (page && page.webSocketDebuggerUrl) return page;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Chrome devtools endpoint did not come up");
}

export async function openOracle() {
  const WebSocket = require("ws");
  const chromeBin = findChrome();
  const { server, port: httpPort } = await startServer();
  const cdpPort = 9400 + Math.floor(Math.random() * 400);
  const profile = path.join(
    GRAPH_PKG,
    ".graphify-cdp-prof-" + process.pid + "-" + Date.now(),
  );

  // B1 Phase 1: the WebGL golden lane (GOLDEN_ENABLE_WEBGL=1) needs a real
  // WebGL2 context. `--disable-gpu` (the deterministic 2D default) gives none,
  // so we swap in ANGLE/SwiftShader SOFTWARE GL — a deterministic, GPU-
  // independent WebGL2 raster stable across CI runners (plan §4.2 / R18). The
  // canvas2d goldens keep `--disable-gpu` for CPU-deterministic 2D rasterization.
  const enableWebGL = process.env.GOLDEN_ENABLE_WEBGL === "1";
  const glFlags = enableWebGL
    ? [
        "--use-gl=angle",
        "--use-angle=swiftshader-webgl",
        "--enable-unsafe-swiftshader", // newer Chrome gates SwiftShader behind this
      ]
    : ["--disable-gpu"];

  const chrome = spawn(
    chromeBin,
    [
      "--headless=new",
      // GPU is off by default: the 2D backend rasterizes on CPU deterministically
      // (Phase 0). The WebGL golden lane (GOLDEN_ENABLE_WEBGL=1) swaps in
      // SwiftShader software GL above so the instanced-shape pixel diff can run.
      ...glFlags,
      "--no-sandbox",
      "--hide-scrollbars",
      "--force-device-scale-factor=1", // we drive DPR via canvas backing store
      "--disable-lcd-text", // grayscale AA -> more cross-runner-stable text
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${profile}`,
      "--window-size=1024,1024",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const pageInfo = await waitDevtools(cdpPort);
  const ws = new WebSocket(pageInfo.webSocketDebuggerUrl, {
    perMessageDeflate: false,
    maxPayload: 512 * 1024 * 1024,
  });

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

  async function evaluate(expression, awaitPromise = true) {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(
        "page eval threw: " +
          (r.exceptionDetails.exception?.description ||
            r.exceptionDetails.text),
      );
    }
    return r.result?.value;
  }

  // Navigate + wait for harness readiness (fonts loaded).
  await send("Page.navigate", { url: `http://127.0.0.1:${httpPort}/` });
  // Poll for the module to have evaluated and the font promise to resolve.
  let ready = false;
  for (let i = 0; i < 120; i += 1) {
    try {
      const ok = await evaluate(
        "(window.__harnessReady ? window.__harnessReady.then(()=>!!window.__fontsReady) : false)",
      );
      if (ok) {
        ready = true;
        break;
      }
    } catch {
      /* page still loading the module */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) {
    throw new Error("harness page never became ready (fonts.ready timeout)");
  }

  async function capture(fixture, opts = {}) {
    const params = {
      dpr: opts.dpr ?? 1,
      cssWidth: opts.cssWidth ?? 200,
      cssHeight: opts.cssHeight ?? 200,
      backend: opts.backend ?? "canvas2d",
      camera: opts.camera ?? { x: 0, y: 0, zoom: opts.zoom ?? 1 },
      // B1 Phase 1 INTERNAL CANARY: opt the WebGL backend into the instanced-
      // shape path. Only forwarded when set; the canvas2d goldens never set it.
      ...(opts.instancedShapes !== undefined
        ? { instancedShapes: opts.instancedShapes }
        : {}),
      // Git-flow LABEL-SCALE knob (-20% pills): only the git-flow captures set
      // it; absent keeps the legacy box metric (pre-existing goldens identical).
      ...(opts.boxBaseHeightPx !== undefined
        ? { boxBaseHeightPx: opts.boxBaseHeightPx }
        : {}),
    };
    // Re-assert fonts.ready before EVERY capture (§5.1).
    await evaluate("document.fonts.ready.then(()=>true)");
    const fixtureJson = JSON.stringify(fixture);
    const optsJson = JSON.stringify(params);
    // __renderFixture returns the ACTIVE backend so a silent canvas2d fallback
    // (e.g. no WebGL context) is observable — never a false "webgl" pass.
    const rendered = await evaluate(
      `window.__renderFixture(${fixtureJson}, ${optsJson})`,
    );
    const out = await evaluate("window.__readPixels()");
    const data = new Uint8ClampedArray(Buffer.from(out.base64, "base64"));
    return {
      width: out.width,
      height: out.height,
      data,
      backend: rendered?.backend ?? params.backend,
    };
  }

  /**
   * True when this Chrome can create a real WebGL2 context (needed for the
   * Canvas2D-vs-WebGL pixel diff). Where it returns false the geometry-parity
   * layer is the gate and the pixel diff records an explicit residual/skip.
   */
  async function hasWebGL() {
    return await evaluate(
      "(function(){try{var c=document.createElement('canvas');return !!(c.getContext('webgl2'));}catch(e){return false;}})()",
    );
  }

  async function close() {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
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
  }

  return { capture, evaluate, hasWebGL, close, chromeBin, httpPort };
}

// ---- self-test -----------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith("cdp-harness.mjs")) {
  if (process.argv.includes("--selftest")) {
    const oracle = await openOracle();
    const fixture = {
      nodes: [
        { id: "a", x: -40, y: 0, size: 12, color: "#ff0000", shape: "circle" },
        { id: "b", x: 40, y: 0, size: 12, color: "#0000ff", shape: "circle" },
      ],
      edges: [{ source: "a", target: "b", width: 3, color: "#3344aa" }],
    };
    const cap = await oracle.capture(fixture, { dpr: 1, zoom: 1 });
    console.log(
      `selftest: chrome=${oracle.chromeBin} capture=${cap.width}x${cap.height} bytes=${cap.data.length}`,
    );
    // sanity: there must be some non-white pixels (the graph drew something).
    let nonWhite = 0;
    for (let i = 0; i < cap.data.length; i += 4) {
      if (cap.data[i] !== 255 || cap.data[i + 1] !== 255 || cap.data[i + 2] !== 255)
        nonWhite += 1;
    }
    console.log(`selftest: non-white pixels = ${nonWhite}`);
    await oracle.close();
    process.exit(nonWhite > 0 ? 0 : 1);
  }
}
