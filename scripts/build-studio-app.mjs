#!/usr/bin/env node
/**
 * Build the Svelte studio SPA (studio/) and copy it into dist/studio-app so the
 * compiled `ontology studio` server can serve it from `/studio/`.
 *
 * The studio SPA is a self-contained Vite sub-project with its OWN deps
 * (studio/package.json). The root `npm ci` does not install them, so this
 * script installs them on demand (lockfile-faithful `npm ci`, falling back to
 * `npm install`) before building.
 *
 * Degrades gracefully: if the SPA build cannot run (no network in a sandbox,
 * etc.), it prints a warning and exits 0 WITHOUT producing dist/studio-app, so
 * the server build + `npm test` are never blocked by the optional SPA. The
 * server tolerates a missing dist/studio-app (the /studio route 404s; the
 * legacy server-rendered studio at / is unaffected).
 *
 * Run AFTER `tsup` (clean:true) which would otherwise wipe the copy.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const studio = join(root, "studio");
const src = join(studio, "dist");
const dest = join(root, "dist", "studio-app");
// The single-file Vite pass writes here; its inlined index.html is then lifted
// to dist/studio-template.html (resolved by the exporter alongside index.html).
const singleFileDist = join(studio, "dist-singlefile");
const singleFileTemplate = join(src, "studio-template.html");

function run(cmd, args, cwd, env) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: false,
    ...(env ? { env: { ...process.env, ...env } } : {}),
  });
  return r.status === 0;
}

function warn(msg) {
  console.warn(`build-studio-app: ${msg} — skipping SPA (the /studio route will 404; the legacy studio at / is unaffected).`);
}

if (!existsSync(join(studio, "package.json"))) {
  warn("studio/package.json not found");
  process.exit(0);
}

// Install the SPA's own deps if missing.
if (!existsSync(join(studio, "node_modules", "vite"))) {
  const installed =
    (existsSync(join(studio, "package-lock.json")) && run("npm", ["ci"], studio)) ||
    run("npm", ["install"], studio);
  if (!installed) {
    warn("studio dependency install failed");
    process.exit(0);
  }
}

if (!run("npm", ["run", "build"], studio) || !existsSync(src)) {
  warn("studio SPA build failed");
  process.exit(0);
}

// Second pass: the self-contained single-file template (Blocker 1 fix for the
// offline `file://` studio). Gated by GRAPHIFY_STUDIO_SINGLEFILE=1, written to a
// distinct dir so the multi-file dist/ above stays byte-unchanged (INV-2/INV-4),
// then lifted to dist/studio-template.html as a sibling of index.html (resolved
// by resolveStudioAppDir the same way). Best-effort: a failure here warns but
// does NOT fail the multi-file build — the offline emit then no-ops (INV-3).
rmSync(singleFileDist, { recursive: true, force: true });
if (run("npm", ["run", "build"], studio, { GRAPHIFY_STUDIO_SINGLEFILE: "1" })) {
  const singleFileIndex = join(singleFileDist, "index.html");
  if (existsSync(singleFileIndex)) {
    cpSync(singleFileIndex, singleFileTemplate);
    rmSync(singleFileDist, { recursive: true, force: true });
    console.log(`build-studio-app: single-file template -> ${singleFileTemplate}`);
  } else {
    warn("single-file build produced no index.html (offline studio.html will no-op)");
  }
} else {
  warn("single-file build failed (offline studio.html will no-op)");
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`build-studio-app: ${src} -> ${dest}`);
