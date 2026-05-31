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

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: false });
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

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`build-studio-app: ${src} -> ${dest}`);
