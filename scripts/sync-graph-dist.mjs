// Sync the freshly-built local `@sentropic/graph` package into node_modules so
// the root `tsup --dts` build resolves the WORKSPACE types/runtime instead of
// the published tarball pinned in package-lock (currently 0.1.0, which predates
// the layout-registry API the root now imports — see src/scene-layout.ts).
//
// Why this exists: this repo is not an npm-workspaces monorepo, so `npm ci`
// installs the published `@sentropic/graph` from the registry. The root build
// (`tsup --dts`) resolves `@sentropic/graph` from node_modules, so any symbol
// added to packages/graph but not yet published would fail the DTS build with
// TS2305. The `prebuild` step builds packages/graph and runs this script so a
// CLEAN checkout (npm ci + npm run build) is green WITHOUT a hand-refreshed
// dist. This mirrors the existing vitest alias that already points
// `@sentropic/graph` at packages/graph/src.
//
// Runtime stays externalized (tsup keeps `@sentropic/graph` as a bare import),
// so the published graphify still resolves `@sentropic/graph@^0.1.0` at the
// consumer's runtime — only the in-repo build/test sees the fresh local copy.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcPkgDir = resolve(root, "packages/graph");
const srcDist = resolve(srcPkgDir, "dist");
const destPkgDir = resolve(root, "node_modules/@sentropic/graph");
const destDist = resolve(destPkgDir, "dist");

if (!existsSync(srcDist)) {
  console.error(
    `[sync-graph-dist] missing ${srcDist} — run \`npm run build:graph\` first`,
  );
  process.exit(1);
}

mkdirSync(destPkgDir, { recursive: true });
rmSync(destDist, { recursive: true, force: true });
cpSync(srcDist, destDist, { recursive: true });
cpSync(resolve(srcPkgDir, "package.json"), resolve(destPkgDir, "package.json"));

console.log(`[sync-graph-dist] synced ${srcDist} -> ${destDist}`);
