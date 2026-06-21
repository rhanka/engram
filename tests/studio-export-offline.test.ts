/**
 * Work-stream A — offline `file://` "double-click" single-file studio export.
 * Covers the exporter half of SPEC_STUDIO_OFFLINE_EXPORT.md test obligations:
 *   T3 size budget, T4 escaping correctness, T5 positions preserved,
 *   T6 multi-file bundle byte-unchanged, T7 flag plumbing.
 * (T1 file:// render and T2 api short-circuit live with the studio SPA tests.)
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildStaticStudio,
  buildBundleScript,
  escapeBundleJsonLiteral,
  injectBundleScript,
} from "../src/studio-export.js";

const LS = String.fromCharCode(0x2028); // U+2028 LINE SEPARATOR
const PS = String.fromCharCode(0x2029); // U+2029 PARAGRAPH SEPARATOR

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// A minimal prebuilt SPA: a multi-file index.html (+ a stand-in asset) and the
// single-file template the exporter injects the data script into. The template
// mimics the vite-plugin-singlefile output: an inlined module boot script.
function makeSpaDir(): string {
  const spaDir = mkdtempSync(join(tmpdir(), "graphify-spa-"));
  dirs.push(spaDir);
  writeFileSync(
    join(spaDir, "index.html"),
    '<!doctype html><html><body><div id="app"></div>' +
      '<script type="module" src="./assets/index.js"></script></body></html>',
  );
  mkdirSync(join(spaDir, "assets"), { recursive: true });
  writeFileSync(join(spaDir, "assets", "index.js"), "/* app */\n");
  // The single-file template: JS inlined as a module boot script (no external src).
  writeFileSync(
    join(spaDir, "studio-template.html"),
    "<!doctype html><html><head><style>/* css */</style></head><body>" +
      '<div id="app"></div><script type="module">/* inlined app */</script></body></html>',
  );
  return spaDir;
}

// A state dir with a graph.json whose nodes carry labels (so the scene has them).
// `extraNodes` lets a test inject hostile label strings (T4).
function makeStateDir(extraNodes: Array<Record<string, unknown>> = []): string {
  const stateDir = mkdtempSync(join(tmpdir(), "graphify-state-"));
  dirs.push(stateDir);
  const nodes = [
    { id: "a", label: "Alpha", type: "Character" },
    { id: "b", label: "Beta", type: "Place" },
    { id: "c", label: "Gamma", type: "Event" },
    ...extraNodes,
  ];
  const links = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
  ];
  writeFileSync(join(stateDir, "graph.json"), JSON.stringify({ nodes, links }));
  return stateDir;
}

/** Parse window.__GRAPHIFY_BUNDLE__ out of an emitted studio.html (no eval of app). */
function readInlinedBundle(html: string): Record<string, unknown> {
  const m = html.match(/window\.__GRAPHIFY_BUNDLE__ = JSON\.parse\((".*?")\);<\/script>/s);
  expect(m, "studio.html must carry the bundle script").not.toBeNull();
  // The captured group is a JS/JSON string literal; JSON.parse it twice (the
  // exporter double-encodes), exactly as the browser would.
  const jsonText = JSON.parse(m![1]);
  return JSON.parse(jsonText);
}

describe("escapeBundleJsonLiteral + injectBundleScript (T4 building blocks)", () => {
  it("escapes </script>, U+2028, U+2029 and round-trips via double JSON.parse", () => {
    const value = { evil: `</script><script>alert(1)</script>`, sep: `${LS}line${PS}para` };
    const jsonText = JSON.stringify(value);
    const literal = escapeBundleJsonLiteral(jsonText);

    // No raw "</" survives (cannot close the host <script> early).
    expect(literal.includes("</")).toBe(false);
    // No raw line/paragraph separators survive (no JS SyntaxError at load).
    expect(literal.includes(LS)).toBe(false);
    expect(literal.includes(PS)).toBe(false);

    // Browser-equivalent round-trip: JSON.parse the literal → the JSON text →
    // the object, deep-equal to the input.
    const back = JSON.parse(JSON.parse(literal));
    expect(back).toEqual(value);
  });

  it("injects the bundle script BEFORE the first module script (C4 ordering)", () => {
    const template =
      '<html><body><div id="app"></div><script type="module">boot()</script></body></html>';
    const script = `<script>window.__GRAPHIFY_BUNDLE__ = JSON.parse("{}");</script>`;
    const out = injectBundleScript(template, script);
    expect(out.indexOf("__GRAPHIFY_BUNDLE__")).toBeLessThan(out.indexOf("boot()"));
    expect(out.indexOf('type="module"')).toBeGreaterThan(out.indexOf("__GRAPHIFY_BUNDLE__"));
  });

  it("buildBundleScript yields a parseable classic <script>", () => {
    const script = buildBundleScript({ "scene.json": { nodes: [], edges: [] } });
    expect(script.startsWith("<script>window.__GRAPHIFY_BUNDLE__ = JSON.parse(")).toBe(true);
    expect(script.endsWith(");</script>")).toBe(true);
  });
});

describe("buildStaticStudio single-file emit", () => {
  it("T7: default emit produces a scene-only studio.html (no graph/entities inlined)", () => {
    const spaDir = makeSpaDir();
    const stateDir = makeStateDir();
    const outDir = join(stateDir, "studio");

    const result = buildStaticStudio({ stateDir, outDir, spaDir, onWarning: () => {} });
    expect(result.studioHtmlPath).toBe(join(outDir, "studio.html"));
    expect(result.studioHtmlBytes).toBeGreaterThan(0);

    const html = readFileSync(join(outDir, "studio.html"), "utf-8");
    const bundle = readInlinedBundle(html);
    expect(Object.keys(bundle)).toEqual(["scene.json"]);
    expect(bundle["graph.json"]).toBeUndefined();
    expect(bundle["entities.json"]).toBeUndefined();
  });

  it("T7: --no-single-file (singleFile:false) omits studio.html; multi-file intact", () => {
    const spaDir = makeSpaDir();
    const stateDir = makeStateDir();
    const outDir = join(stateDir, "studio");

    const result = buildStaticStudio({ stateDir, outDir, spaDir, singleFile: false, onWarning: () => {} });
    expect(result.studioHtmlPath).toBeNull();
    expect(result.studioHtmlBytes).toBeNull();
    expect(statSync(join(outDir, "index.html")).isFile()).toBe(true);
    expect(statSync(join(outDir, "scene.json")).isFile()).toBe(true);
    expect(() => statSync(join(outDir, "studio.html"))).toThrow();
  });

  it("T7: --full-offline (fullOffline:true) inlines graph + entities too", () => {
    const spaDir = makeSpaDir();
    const stateDir = makeStateDir();
    const outDir = join(stateDir, "studio");

    buildStaticStudio({ stateDir, outDir, spaDir, fullOffline: true, onWarning: () => {} });
    const html = readFileSync(join(outDir, "studio.html"), "utf-8");
    const bundle = readInlinedBundle(html);
    expect(Object.keys(bundle).sort()).toEqual(["entities.json", "graph.json", "scene.json"]);
    expect(Array.isArray((bundle["graph.json"] as { nodes?: unknown }).nodes)).toBe(true);
    expect(typeof bundle["entities.json"]).toBe("object");
  });

  it("INV-3: a missing single-file template warns and is a best-effort no-op", () => {
    const spaDir = makeSpaDir();
    rmSync(join(spaDir, "studio-template.html"), { force: true }); // template absent
    const stateDir = makeStateDir();
    const outDir = join(stateDir, "studio");

    const warnings: string[] = [];
    const result = buildStaticStudio({
      stateDir,
      outDir,
      spaDir,
      onWarning: (m) => warnings.push(m),
    });
    // Multi-file bundle still emitted; studio.html skipped, no throw.
    expect(statSync(join(outDir, "index.html")).isFile()).toBe(true);
    expect(result.studioHtmlPath).toBeNull();
    expect(warnings.some((w) => /single-file template not found/i.test(w))).toBe(true);
  });

  it("re-export with --no-single-file wipes a stale studio.html from a prior default export", () => {
    const spaDir = makeSpaDir();
    const stateDir = makeStateDir();
    const outDir = join(stateDir, "studio");

    // 1st export (default): studio.html present.
    buildStaticStudio({ stateDir, outDir, spaDir, onWarning: () => {} });
    expect(statSync(join(outDir, "studio.html")).isFile()).toBe(true);

    // 2nd export (--no-single-file): the stale studio.html must be gone.
    buildStaticStudio({ stateDir, outDir, spaDir, singleFile: false, onWarning: () => {} });
    expect(() => statSync(join(outDir, "studio.html"))).toThrow();
  });
});

describe("T4 — escaping correctness end-to-end (hostile scene values)", () => {
  it("a node label with </script>, U+2028, U+2029 parses and round-trips", () => {
    const spaDir = makeSpaDir();
    const hostile = `</script><script>alert('xss')</script>${LS}sep${PS}end`;
    const stateDir = makeStateDir([{ id: "evil", label: hostile, type: "Character" }]);
    const outDir = join(stateDir, "studio");

    buildStaticStudio({ stateDir, outDir, spaDir, onWarning: () => {} });
    const html = readFileSync(join(outDir, "studio.html"), "utf-8");

    // The host <script> is NOT closed early: only ONE </script> follows the
    // bundle assignment (the script's own close), none injected by the value.
    const bundleAssign = html.indexOf("window.__GRAPHIFY_BUNDLE__");
    const afterAssign = html.slice(bundleAssign);
    const firstClose = afterAssign.indexOf("</script>");
    // Everything between the assignment and the first </script> is the JSON.parse
    // call — the hostile "</script>" inside the value was escaped to "<\/script>".
    expect(afterAssign.slice(0, firstClose).includes("JSON.parse(")).toBe(true);
    expect(afterAssign.slice(0, firstClose).includes("</script")).toBe(false);

    // The round-tripped scene carries the hostile label byte-for-byte.
    const bundle = readInlinedBundle(html);
    const scene = bundle["scene.json"] as { nodes: Array<{ id: string; label: string }> };
    const evil = scene.nodes.find((n) => n.id === "evil");
    expect(evil?.label).toBe(hostile);
  });
});

describe("T5 — positions preserved (no degenerate-circle regression)", () => {
  it("the inlined scene is byte-identical to the multi-file scene.json", () => {
    const spaDir = makeSpaDir();
    const stateDir = makeStateDir();
    const outDir = join(stateDir, "studio");

    buildStaticStudio({ stateDir, outDir, spaDir, onWarning: () => {} });
    const sceneFile = readFileSync(join(outDir, "scene.json"), "utf-8");
    const html = readFileSync(join(outDir, "studio.html"), "utf-8");
    const bundle = readInlinedBundle(html);

    // The inlined scene re-serialised must match the on-disk scene.json bytes.
    expect(JSON.stringify(bundle["scene.json"])).toBe(sceneFile);

    // And every node carries finite x,y (positions attached, not a circle).
    const scene = bundle["scene.json"] as { nodes: Array<{ x?: number; y?: number }> };
    expect(scene.nodes.length).toBeGreaterThan(0);
    for (const n of scene.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });
});

describe("T3 — size budget", () => {
  it("scene-only studio.html is smaller than full-offline, and full-offline ≈ +graph+entities", () => {
    const spaDir = makeSpaDir();
    const stateDir = makeStateDir();

    const sceneOnlyDir = join(stateDir, "studio-scene");
    const fullDir = join(stateDir, "studio-full");
    const sceneOnly = buildStaticStudio({ stateDir, outDir: sceneOnlyDir, spaDir, onWarning: () => {} });
    const full = buildStaticStudio({ stateDir, outDir: fullDir, spaDir, fullOffline: true, onWarning: () => {} });

    expect(sceneOnly.studioHtmlBytes!).toBeLessThan(full.studioHtmlBytes!);

    // The full-offline delta is roughly the inlined graph.json + entities.json
    // bytes (double-encoding adds modest overhead; assert the delta is at least
    // the raw added bytes, i.e. data was actually inlined — a generous lower bound).
    const graphBytes = statSync(join(fullDir, "graph.json")).size;
    const entityBytes = statSync(join(fullDir, "entities.json")).size;
    const delta = full.studioHtmlBytes! - sceneOnly.studioHtmlBytes!;
    expect(delta).toBeGreaterThan(graphBytes); // at minimum the graph was added

    // Generous absolute ceiling for this tiny fixture (well under the real-corpus
    // budget of a few MB) — guards against accidental whole-graph double-inlining.
    expect(sceneOnly.studioHtmlBytes!).toBeLessThan(64 * 1024);
  });
});

describe("T6 — multi-file bundle byte-identical with single-file on vs off (INV-2)", () => {
  it("every multi-file artifact is byte-identical; only studio.html presence differs", () => {
    const spaDir = makeSpaDir();
    const stateDir = makeStateDir();
    const withSingle = join(stateDir, "with-single");
    const noSingle = join(stateDir, "no-single");

    buildStaticStudio({ stateDir, outDir: withSingle, spaDir, onWarning: () => {} });
    buildStaticStudio({ stateDir, outDir: noSingle, spaDir, singleFile: false, onWarning: () => {} });

    // Walk both dirs; collect every file path relative to the out dir.
    const walk = (root: string): string[] => {
      const out: string[] = [];
      const rec = (dir: string) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          if (e.isDirectory()) rec(p);
          else out.push(relative(root, p));
        }
      };
      rec(root);
      return out.sort();
    };

    const a = walk(withSingle);
    const b = walk(noSingle);
    // The ONLY difference is the additive studio.html.
    expect(a.filter((p) => p !== "studio.html")).toEqual(b);
    expect(a).toContain("studio.html");
    expect(b).not.toContain("studio.html");

    // Every shared artifact is byte-identical. workspace-manifest.json carries a
    // per-run `generated_at` timestamp (a PRE-EXISTING non-determinism unrelated
    // to single-file): for it, compare modulo that one field — the per-artifact
    // sha256 + size_bytes (the integrity payload) must match exactly.
    for (const rel of b) {
      const left = readFileSync(join(withSingle, rel));
      const right = readFileSync(join(noSingle, rel));
      if (rel === "workspace-manifest.json") {
        const normalize = (buf: Buffer) => {
          const m = JSON.parse(buf.toString("utf-8")) as Record<string, unknown>;
          delete m.generated_at;
          return JSON.stringify(m);
        };
        expect(normalize(left), "manifest mismatch beyond generated_at").toBe(normalize(right));
      } else {
        expect(left.equals(right), `byte mismatch in ${rel}`).toBe(true);
      }
    }
  });
});

// Keep the unused import honest (cpSync is used by no test directly but kept for
// parity with sibling fixtures); reference it to avoid an unused-import lint.
void cpSync;
