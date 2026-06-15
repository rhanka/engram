#!/usr/bin/env node
/**
 * Assemble a SINGLE static studio bundle containing SEVERAL model
 * re-indexations, switchable IN-UI (the studio header dropdown).
 *
 * One studio SPA shell sits at the bundle root; each model's data files live
 * under `models/<id>/` (scene.json + graph.json + reconciliation-candidates.json
 * + entities.json), and a top-level `models.json` manifest lists what's
 * available. The SPA (studio/src/lib/modelStore.svelte.js + api.js) fetches
 * `./models.json` at mount, then resolves every data fetch under
 * `./models/<active>/...`; switching the dropdown re-renders the SAME studio in
 * place (no reload, no new tab).
 *
 * This reuses the EXACT same server-side builders as the single-model
 * `build-studio-demo.mjs` (buildStudioScene / attachLayoutPositions /
 * buildEntitySidecar / reconciliation query) — no duplicated scene logic — and
 * honours GRAPHIFY_FAST_LAYOUT=1 for the layout pinning step.
 *
 * Usage:
 *   node scripts/build-studio-multimodel.mjs --config <models.config.json> --out <dir>
 *   node scripts/build-studio-multimodel.mjs \
 *     --model opus-4.8xh:"Claude Opus 4.8":/path/graph-opus.json \
 *     --model sonnet-4.6:"Claude Sonnet 4.6":/path/graph-sonnet.json \
 *     --out .graphify/scratch/studio-multimodel
 *
 *   --config  JSON: { "default"?: id, "models": [ { "id", "label"?, "graph",
 *                     "state"? (sidecar/recon state dir, default = graph's dir) } ] }
 *   --model   inline model spec  id:label:graphPath  (repeatable; alt to --config)
 *   --out     target bundle dir (default: .graphify/scratch/studio-multimodel)
 *   --default the model id selected first (else config.default, else first model)
 *
 * Requires the server build (dist/index.js) and the SPA build (studio/dist or
 * dist/studio-app). Run `npm run build:server` + `npm run build:studio` first.
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

function die(msg) {
  console.error(`build-studio-multimodel: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { config: null, out: ".graphify/scratch/studio-multimodel", models: [], default: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") args.config = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--default") args.default = argv[++i];
    else if (arg === "--model") {
      // id:label:graphPath — label may itself contain no colon; split on first/last.
      const spec = argv[++i];
      const first = spec.indexOf(":");
      const last = spec.lastIndexOf(":");
      if (first < 0 || last <= first) die(`bad --model spec (want id:label:graph): ${spec}`);
      args.models.push({
        id: spec.slice(0, first),
        label: spec.slice(first + 1, last),
        graph: spec.slice(last + 1),
      });
    } else if (arg === "--help" || arg === "-h") args.help = true;
    else die(`unknown argument: ${arg}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("Usage: node scripts/build-studio-multimodel.mjs --config <c.json> --out <dir>");
  console.log("   or: node scripts/build-studio-multimodel.mjs --model id:label:graph [...] --out <dir>");
  process.exit(0);
}

// --- Resolve the model list (config file OR inline --model specs). ---
let models = args.models;
let defaultId = args.default;
if (args.config) {
  const cfg = JSON.parse(readFileSync(resolve(args.config), "utf-8"));
  if (!Array.isArray(cfg.models) || cfg.models.length === 0) die(`config has no models[]: ${args.config}`);
  models = cfg.models;
  defaultId = defaultId ?? cfg.default ?? null;
}
if (!models || models.length === 0) {
  die("no models given (use --config or one or more --model id:label:graph)");
}

// --- Locate the built SPA shell. ---
const spaDir = existsSync(join(root, "dist", "studio-app", "index.html"))
  ? join(root, "dist", "studio-app")
  : join(root, "studio", "dist");
if (!existsSync(join(spaDir, "index.html"))) {
  die(`built SPA not found (looked in dist/studio-app and studio/dist). Run \`npm run build:studio\` first.`);
}

// --- Import the SAME builders the live server + single-model demo use. ---
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
  die(`could not import the server build (dist/index.js). Run \`npm run build:server\` first.\n  ${err instanceof Error ? err.message : String(err)}`);
}

const outDir = resolve(args.out);

// --- 1. Fresh bundle: copy the SPA shell to the root. ---
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(spaDir, outDir, { recursive: true });

// --- 2. Per model: build scene + graph + recon + entities under models/<id>/. ---
const manifestModels = [];
for (const m of models) {
  if (!m.id || !m.graph) die(`model entry missing id or graph: ${JSON.stringify(m)}`);
  const graphPath = resolve(m.graph);
  if (!existsSync(graphPath)) {
    console.warn(`build-studio-multimodel: [skip] ${m.id}: graph not found (${graphPath})`);
    continue;
  }
  const stateDir = m.state ? resolve(m.state) : dirname(graphPath);
  const modelOut = join(outDir, "models", m.id);
  mkdirSync(modelOut, { recursive: true });

  // graph.json: verbatim copy of THIS model's artifact.
  const graphRaw = readFileSync(graphPath, "utf-8");
  writeFileSync(join(modelOut, "graph.json"), graphRaw);
  const graph = JSON.parse(graphRaw);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];

  // scene.json: light Studio scene with pinned layout (GRAPHIFY_FAST_LAYOUT-aware).
  const scene = attachLayoutPositions(buildStudioScene(graph));
  writeFileSync(join(modelOut, "scene.json"), JSON.stringify(scene));

  // reconciliation-candidates.json: mirror the SPA's request, if the state dir
  // carries a candidates queue (multimodel scratch graphs usually don't).
  let candidatesResponse = { items: [], total: 0 };
  const candidatesPath = join(stateDir, "ontology", "reconciliation", "candidates.json");
  if (existsSync(candidatesPath)) {
    try {
      const queue = loadOntologyReconciliationCandidates(candidatesPath);
      candidatesResponse = queryOntologyReconciliationCandidates(queue, {
        sort: "score", order: "desc", limit: 50, stale: false,
      });
    } catch (err) {
      console.warn(`build-studio-multimodel: ${m.id}: recon read failed (${err instanceof Error ? err.message : String(err)}); empty queue.`);
    }
  }
  writeFileSync(join(modelOut, "reconciliation-candidates.json"), JSON.stringify(candidatesResponse));

  // entities.json: { id: sidecar } index for the entity panel.
  const entities = {};
  for (const node of nodes) {
    const id = node?.id;
    if (typeof id !== "string" || !id) continue;
    entities[id] = buildEntitySidecar(stateDir, id);
  }
  writeFileSync(join(modelOut, "entities.json"), JSON.stringify(entities));

  manifestModels.push({
    id: m.id,
    label: m.label || m.id,
    nodeCount: scene.nodes.length,
    path: `models/${m.id}`,
  });
  console.log(`build-studio-multimodel: [staged] ${m.id}: ${scene.nodes.length} scene nodes, ${scene.edges.length} edges -> ${modelOut}/`);
}

if (manifestModels.length === 0) die("no models staged (all graphs missing?)");

// --- 3. Top-level models.json manifest (version 1). ---
const chosenDefault =
  defaultId && manifestModels.some((m) => m.id === defaultId) ? defaultId : manifestModels[0].id;
const manifest = { version: 1, default: chosenDefault, models: manifestModels };
writeFileSync(join(outDir, "models.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`\nbuild-studio-multimodel: wrote multi-model studio bundle to ${outDir}`);
console.log(`  models: ${manifestModels.map((m) => `${m.id} (${m.nodeCount})`).join(", ")}`);
console.log(`  default: ${chosenDefault}`);
console.log(`  manifest: ${join(outDir, "models.json")}`);
