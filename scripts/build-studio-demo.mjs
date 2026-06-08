#!/usr/bin/env node
/**
 * Build a STANDALONE static export of the Svelte studio SPA, pre-loaded with a
 * graphify state dir, so it can be served by GitHub Pages (or opened off the
 * filesystem) WITHOUT the `graphify ontology studio` server.
 *
 * The SPA's data layer (studio/src/lib/api.js) tries the same-origin server
 * routes first, then falls back to static files next to index.html. This script
 * produces exactly those fallback files, reusing the SAME server-side builders
 * the live server uses (no duplicated scene/sidecar/reconciliation logic):
 *
 *   index.html + assets/        <- copy of dist/studio-app (the Vite build)
 *   graph.json                  <- copy of <state>/graph.json (verbatim)
 *   scene.json                  <- buildStudioScene(graph)        (./scene.json)
 *   reconciliation-candidates.json
 *                               <- queryOntologyReconciliationCandidates(...)
 *                                  matching the SPA's request
 *                                  (?sort=score&order=desc&limit=50)
 *   entities.json               <- { id: buildEntitySidecar(state, id) } for
 *                                  every graph node (./entities.json index;
 *                                  fetchEntity looks up by id). A single index
 *                                  is used instead of 1193 per-entity files so
 *                                  the file:// export stays light — most sidecars
 *                                  are empty (no description / no occurrences).
 *
 * Usage:
 *   node scripts/build-studio-demo.mjs --state <dir> --out <dir> [--profile <p>]
 *
 *   --state    graphify state dir (default: .graphify). Must contain graph.json.
 *   --out      target export dir (default: docs/studio). Created if missing.
 *   --profile  profile path/dir for reconciliation context. Optional: when
 *              omitted the reconciliation candidates are emitted from the state's
 *              candidates.json as-is (no profile-hash staleness check).
 *
 * Requires the server build (dist/) and the SPA build (dist/studio-app). Run
 * `npm run build` first, or `node scripts/build-studio-app.mjs` for just the SPA.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { state: ".graphify", out: "docs/studio", profile: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--state") args.state = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--profile") args.profile = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function die(msg) {
  console.error(`build-studio-demo: ${msg}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(
    "Usage: node scripts/build-studio-demo.mjs --state <dir> --out <dir> [--profile <p>]",
  );
  process.exit(0);
}

const stateDir = resolve(args.state);
const outDir = resolve(args.out);
const graphPath = join(stateDir, "graph.json");

if (!existsSync(graphPath)) die(`graph.json not found in state dir: ${graphPath}`);

const spaDir = join(root, "dist", "studio-app");
if (!existsSync(join(spaDir, "index.html"))) {
  die(
    `built SPA not found at ${spaDir}. Run \`npm run build\` (or node scripts/build-studio-app.mjs) first.`,
  );
}

// Import the SAME builders the live server uses. Requires the server build.
let buildStudioScene;
let attachLayoutPositions;
let buildEntitySidecar;
let loadOntologyReconciliationCandidates;
let queryOntologyReconciliationCandidates;
try {
  ({
    buildStudioScene,
    attachLayoutPositions,
    buildEntitySidecar,
    loadOntologyReconciliationCandidates,
    queryOntologyReconciliationCandidates,
  } = await import(join(root, "dist", "index.js")));
} catch (err) {
  die(
    `could not import the server build (dist/index.js). Run \`npm run build:server\` first.\n  ${err instanceof Error ? err.message : String(err)}`,
  );
}

// --- 1. Copy the built SPA (index.html + assets) into the export dir. ---
mkdirSync(outDir, { recursive: true });
// Wipe stale generated data files but keep the dir (so an external .nojekyll or
// similar is not collateral). We copy the SPA over the top.
for (const f of ["scene.json", "graph.json", "reconciliation-candidates.json", "entities.json"]) {
  rmSync(join(outDir, f), { force: true });
}
rmSync(join(outDir, "assets"), { recursive: true, force: true });
cpSync(spaDir, outDir, { recursive: true });

// --- 2. graph.json: verbatim copy (byte-identical to the artifact). ---
const graphRaw = readFileSync(graphPath, "utf-8");
writeFileSync(join(outDir, "graph.json"), graphRaw);
const graph = JSON.parse(graphRaw);
const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];

// --- 3. scene.json: the light Studio scene (server's sceneJsonResult). ---
// Pre-compute and pin node positions (x,y + fx,fy) so the SPA renders the
// settled layout with iterations=1 — no O(n²) force sim on the main thread at
// mount. Matches the live server route byte-for-byte (deterministic layout).
const scene = attachLayoutPositions(buildStudioScene(graph));
writeFileSync(join(outDir, "scene.json"), JSON.stringify(scene));

// --- 4. reconciliation-candidates.json: mirror the SPA's request. ---
// The SPA fetches /api/ontology/reconciliation/candidates?sort=score&order=desc&limit=50.
let candidatesResponse = { items: [], total: 0 };
const candidatesPath = join(stateDir, "ontology", "reconciliation", "candidates.json");
if (existsSync(candidatesPath)) {
  try {
    const queue = loadOntologyReconciliationCandidates(candidatesPath);
    candidatesResponse = queryOntologyReconciliationCandidates(queue, {
      sort: "score",
      order: "desc",
      limit: 50,
      stale: false,
    });
  } catch (err) {
    console.warn(
      `build-studio-demo: could not read reconciliation candidates (${err instanceof Error ? err.message : String(err)}); emitting an empty queue.`,
    );
  }
} else {
  console.warn(
    `build-studio-demo: no candidates.json at ${candidatesPath}; emitting an empty reconciliation queue.`,
  );
}
writeFileSync(
  join(outDir, "reconciliation-candidates.json"),
  JSON.stringify(candidatesResponse),
);

// --- 5. entities.json: { id: sidecar } index for the entity panel. ---
// buildEntitySidecar reads the wiki description index + occurrences from the
// state dir; nodes with neither yield an empty sidecar.
const entities = {};
let withDescription = 0;
let withOccurrences = 0;
for (const node of nodes) {
  const id = node?.id;
  if (typeof id !== "string" || !id) continue;
  const sidecar = buildEntitySidecar(stateDir, id);
  entities[id] = sidecar;
  if (sidecar.description) withDescription += 1;
  if (sidecar.occurrences) withOccurrences += 1;
}
writeFileSync(join(outDir, "entities.json"), JSON.stringify(entities));

// --- Summary. ---
console.log(`build-studio-demo: wrote standalone studio export to ${outDir}`);
console.log(`  nodes: ${nodes.length} | scene nodes: ${scene.nodes.length} | scene edges: ${scene.edges.length}`);
console.log(`  reconciliation candidates: ${candidatesResponse.total ?? candidatesResponse.items.length}`);
console.log(`  entities index: ${Object.keys(entities).length} ids (${withDescription} with description, ${withOccurrences} with occurrences)`);
