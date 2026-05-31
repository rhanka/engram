#!/usr/bin/env node
/**
 * Copy the built Svelte studio SPA (studio/dist) into dist/studio-app so the
 * compiled `ontology studio` server can serve it from `/studio/`. Run AFTER
 * `tsup` (which has clean:true and would otherwise wipe the copy).
 *
 * Publishing: `dist/` is already in package.json `files`, so dist/studio-app
 * ships with the package automatically.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "studio", "dist");
const dest = join(root, "dist", "studio-app");

if (!existsSync(src)) {
  console.error(`copy-studio-app: source not found: ${src}. Run \`npm --prefix studio run build\` first.`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`copy-studio-app: ${src} -> ${dest}`);
