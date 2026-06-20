#!/usr/bin/env node
/**
 * Publish-time guard: FAIL the release when the prebuilt studio SPA is absent.
 *
 * `scripts/build-studio-app.mjs` degrades gracefully (exits 0 without producing
 * `dist/studio-app/` when the SPA build cannot run), so an unattended publish
 * could ship a package whose static studio export is broken (no index.html to
 * bundle). `prepublishOnly` runs this AFTER `npm run build` so a missing SPA is
 * a hard error at publish time rather than a silent ship.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = join(root, "dist", "studio-app", "index.html");

if (!existsSync(indexHtml)) {
  console.error(
    `assert-studio-app: ${indexHtml} is missing — the prebuilt studio SPA was not produced, ` +
      "so the published package would ship a broken visual export. " +
      "Run `npm run build:studio` (it needs the studio/ deps + a working build) and retry.",
  );
  process.exit(1);
}

console.log(`assert-studio-app: OK (${indexHtml} present).`);
