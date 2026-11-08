// Proposed test helper (spec/SPEC_EVOL_ARCHI_CARDS.md §6): builds the DS
// diagram-core executor at DS_COMMIT from git objects of the local DS clone
// (never a working tree), transpiled with the repo's TypeScript.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  DS_ADAPTER_PATH,
  DS_COMMIT,
  DS_RENDERER_PATH,
} from "../../src/ontology-guardian/diagram-presentation-pins.js";

const helpersDir = path.dirname(fileURLToPath(import.meta.url));

/** Proposed local DS clone path (sibling checkout of the repository root). */
export const DS_CLONE =
  process.env["DS_CLONE_PATH"] ?? path.resolve(helpersDir, "..", "..", "..", "sent-tech-design-system");

/** Proposed check whether the DS clone and pinned commit are reachable. */
export function dsCloneAvailable(commit: string = DS_COMMIT): boolean {
  try {
    execFileSync("git", ["-C", DS_CLONE, "cat-file", "-e", `${commit}^{commit}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Proposed human-readable skip reason when the DS clone is absent. */
export function dsSkipReason(commit: string = DS_COMMIT): string {
  return dsCloneAvailable(commit) ? "" : ` (skipped: DS clone or commit ${commit} absent at ${DS_CLONE})`;
}

const cache = new Map<string, Promise<Record<string, any>>>();

/** Proposed loader for @sentropic/diagram-core from git blobs at the pinned commit. */
export function loadDsDiagramCore(commit: string = DS_COMMIT): Promise<Record<string, any>> {
  const hit = cache.get(commit);
  if (hit) return hit;
  const promise = (async () => {
    const { build } = await import("esbuild");
    const baseDir = "packages/diagram-core/src";
    const gitShow = (relPath: string): string =>
      execFileSync("git", ["-C", DS_CLONE, "show", `${commit}:${relPath}`], { encoding: "utf8" });
    const transpile = (source: string, fileName: string): string =>
      ts.transpileModule(source, {
        fileName,
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
    const res = await build({
      stdin: {
        contents: transpile(gitShow(`${baseDir}/index.ts`), `${baseDir}/index.ts`),
        resolveDir: "/",
        sourcefile: `${baseDir}/index.ts`,
        loader: "js",
      },
      bundle: true,
      format: "esm",
      platform: "node",
      write: false,
      plugins: [
        {
          name: "ds-git-objects",
          setup(b) {
            b.onResolve({ filter: /^\./ }, (args) => ({
              path: path.posix
                .normalize(path.posix.join(path.posix.dirname(args.importer), args.path))
                .replace(/^\/+/, "")
                .replace(/\.js$/, ".ts"),
              namespace: "ds-git",
            }));
            b.onLoad({ filter: /.*/, namespace: "ds-git" }, (args) => ({
              contents: transpile(gitShow(args.path), args.path),
              loader: "js",
            }));
          },
        },
      ],
    });
    const code = res.outputFiles[0]!.text;
    const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    const adapterBuf = execFileSync("git", ["-C", DS_CLONE, "show", `${commit}:${DS_ADAPTER_PATH}`]);
    const rendererBuf = execFileSync("git", ["-C", DS_CLONE, "show", `${commit}:${DS_RENDERER_PATH}`]);
    const adapterBytes = new Uint8Array(adapterBuf.buffer, adapterBuf.byteOffset, adapterBuf.byteLength);
    const rendererBytes = new Uint8Array(rendererBuf.buffer, rendererBuf.byteOffset, rendererBuf.byteLength);
    const adapterSha256 = createHash("sha256").update(adapterBytes).digest("hex");
    const rendererSha256 = createHash("sha256").update(rendererBytes).digest("hex");
    return {
      ...mod,
      commit,
      adapterBytes,
      rendererBytes,
      adapterSha256,
      rendererSha256,
    };
  })();
  cache.set(commit, promise);
  return promise;
}
