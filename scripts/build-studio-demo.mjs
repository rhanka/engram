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
 *   graph.json                  <- copy of <state>/graph.json (verbatim, unless
 *                                  --complete-registry-seeds adds seed nodes)
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
 *     [--qa-target <id> [--qa-config <path>] [--qa-manifest <path>]
 *      [--qa-report <path>] [--qa-fail-on-error]]
 *
 *   --state    graphify state dir (default: .graphify). Must contain graph.json.
 *   --out      target export dir (default: docs/studio). Created if missing.
 *   --profile  profile path/dir for reconciliation context. Optional: when
 *              omitted the reconciliation candidates are emitted from the state's
 *              candidates.json as-is (no profile-hash staleness check).
 *
 *   --layout   build-time layout id: force | typed-layer | time-oriented |
 *              hierarchy-aware. Omitted => hierarchy-aware when the bundle
 *              carries declared hierarchies, force otherwise.
 *   --complete-registry-seeds <normalized-profile.json>
 *              Materialise the registry rows MISSING from graph.json as seed
 *              nodes before the scene is built. Takes a NORMALIZED profile JSON
 *              (its registries must carry `bound_source_path`; the YAML profile
 *              alone does not bind sources). Off by default — and while it is
 *              off graph.json stays a verbatim byte-identical copy.
 *   --complete-registry-seeds-scope hierarchies|all
 *              Which registries to complete. `hierarchies` (default) completes
 *              only those backing a declared hierarchy — the ones whose
 *              incompleteness silently breaks the sidecar join.
 *
 *   --qa-target        quality.targets.<id> preflight to run after bundle emit.
 *   --qa-config        graphify.yaml / .graphify/config.yaml containing target.
 *                      Defaults to discovery from the current working dir.
 *   --qa-manifest      resolved-target manifest JSON. Required for targets
 *                      that require producer proof or batch coverage; otherwise
 *                      defaults to generated <out>/resolved-target.json.
 *   --qa-report        report path. Defaults to <out>/quality-qa-report.json.
 *   --qa-fail-on-error fail even when the target is advisory/non-blocking.
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
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    state: ".graphify",
    out: "docs/studio",
    profile: null,
    layout: null,
    completeRegistrySeeds: null,
    completeRegistrySeedsScope: "hierarchies",
    qaConfig: null,
    qaFailOnError: false,
    qaManifest: null,
    qaReport: null,
    qaTarget: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--state") args.state = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--profile") args.profile = argv[++i];
    else if (arg === "--layout") args.layout = argv[++i];
    else if (arg === "--complete-registry-seeds") args.completeRegistrySeeds = argv[++i];
    else if (arg === "--complete-registry-seeds-scope") args.completeRegistrySeedsScope = argv[++i];
    else if (arg === "--qa-config") args.qaConfig = argv[++i];
    else if (arg === "--qa-fail-on-error") args.qaFailOnError = true;
    else if (arg === "--qa-manifest") args.qaManifest = argv[++i];
    else if (arg === "--qa-report") args.qaReport = argv[++i];
    else if (arg === "--qa-target") args.qaTarget = argv[++i];
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
    "Usage: node scripts/build-studio-demo.mjs --state <dir> --out <dir> [--profile <p>] [--layout <id>] [--complete-registry-seeds <normalized-profile.json> [--complete-registry-seeds-scope hierarchies|all]] [--qa-target <id> [--qa-config <path>] [--qa-manifest <path>] [--qa-report <path>] [--qa-fail-on-error]]",
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
let applySceneLayout;
let selectDefaultSceneLayoutId;
let completeRegistrySeeds;
let registriesBackingHierarchies;
let registryDisplayLabels;
let loadProfileRegistries;
let buildEntitySidecar;
let emitSceneHierarchies;
let emitClassHierarchies;
let loadOntologyProfile;
let emitWorkspaceManifest;
let discoverQualityTargetsConfig;
let hashQualityTarget;
let loadQualityTargetsConfig;
let QA_REPORT_FILENAME;
let RESOLVED_TARGET_MANIFEST_SCHEMA;
let evaluateQualityBundle;
let sha256File;
let loadOntologyReconciliationCandidates;
let queryOntologyReconciliationCandidates;
try {
  ({
    applySceneLayout,
    buildStudioScene,
    buildEntitySidecar,
    completeRegistrySeeds,
    discoverQualityTargetsConfig,
    loadProfileRegistries,
    registriesBackingHierarchies,
    registryDisplayLabels,
    selectDefaultSceneLayoutId,
    emitSceneHierarchies,
    emitClassHierarchies,
    loadOntologyProfile,
    emitWorkspaceManifest,
    evaluateQualityBundle,
    hashQualityTarget,
    loadQualityTargetsConfig,
    loadOntologyReconciliationCandidates,
    QA_REPORT_FILENAME,
    RESOLVED_TARGET_MANIFEST_SCHEMA,
    queryOntologyReconciliationCandidates,
    sha256File,
  } = await import(join(root, "dist", "index.js")));
} catch (err) {
  die(
    `could not import the server build (dist/index.js). Run \`npm run build:server\` first.\n  ${err instanceof Error ? err.message : String(err)}`,
  );
}

function toManifestPath(path) {
  const rel = relative(process.cwd(), path).split(sep).join("/");
  return rel && !rel.startsWith("../") && rel !== ".." ? rel : path;
}

function sameResolvedPath(left, right) {
  return resolve(left) === resolve(right);
}

function artifactSourcePath(rel, context) {
  if (rel === "graph.json") return context.graphPath;
  if (rel === "scene.json") return context.graphPath;
  if (rel === "scene-hierarchies.json") return join(context.stateDir, "ontology", "hierarchies.json");
  if (rel === "reconciliation-candidates.json") return context.candidatesPath;
  if (rel === "entities.json") return context.stateDir;
  if (rel === "workspace-manifest.json") return join(context.outDir, "workspace-manifest.json");
  if (rel === "ontology/citations.json") return join(context.stateDir, "ontology", "citations.json");
  return join(context.outDir, rel);
}

function buildResolvedTargetManifest(target, targetHash, context) {
  const artifacts = {};
  for (const rel of target.publication.data_allowlist) {
    const path = join(context.outDir, rel);
    if (!existsSync(path)) continue;
    artifacts[rel] = {
      bundle_path: rel,
      source_path: toManifestPath(artifactSourcePath(rel, context)),
      source_kind: "generated",
      sha256: sha256File(path),
    };
  }
  return {
    schema: RESOLVED_TARGET_MANIFEST_SCHEMA,
    target_id: target.id,
    target_hash: targetHash,
    graphify_version: "0.14.0",
    producer: {
      command: "scripts/build-studio-demo.mjs",
      cwd: process.cwd(),
    },
    artifacts,
    resolved_policy: {
      citations: {
        extraction: {
          mode: target.citations.extraction.mode,
          ...(target.citations.extraction.contract_id
            ? { contract_id: target.citations.extraction.contract_id }
            : {}),
        },
        display: target.citations.display,
        inline: target.citations.inline,
        sidecar: { required: target.citations.require_sidecar },
      },
    },
    inputs: {
      state_dir: toManifestPath(context.stateDir),
      graph_path: toManifestPath(context.graphPath),
      bundle_path: toManifestPath(context.outDir),
    },
  };
}

function targetRequiresProducerManifest(target) {
  return target.citations.extraction.require_producer_proof ||
    target.citations.extraction.require_batch_coverage;
}

function loadQualityConfigForPreflight() {
  const configPath = args.qaConfig
    ? resolve(args.qaConfig)
    : (() => {
        const discovery = discoverQualityTargetsConfig(process.cwd());
        return discovery.found ? discovery.path : null;
      })();
  if (!configPath) return null;
  return { path: configPath, config: loadQualityTargetsConfig(configPath) };
}

function selectQualityTargetForPreflight(outDir) {
  const loaded = loadQualityConfigForPreflight();
  if (!loaded) {
    if (args.qaTarget || args.qaConfig || args.qaManifest || args.qaReport || args.qaFailOnError) {
      die("no graphify config found for quality target; pass --qa-config <path>.");
    }
    return null;
  }
  const matchingBlockingTargets = Object.values(loaded.config.targets).filter((target) =>
    target.publication.blocking &&
    target.resolvedBundlePath &&
    sameResolvedPath(target.resolvedBundlePath, outDir)
  );
  if (args.qaTarget) {
    const target = loaded.config.targets[String(args.qaTarget)];
    if (!target) die(`quality target not found in ${loaded.path}: ${args.qaTarget}`);
    const mismatchedBlockingTargets = matchingBlockingTargets.filter((blockingTarget) => blockingTarget.id !== target.id);
    if (mismatchedBlockingTargets.length > 0) {
      die(
        `--out ${outDir} matches blocking quality target(s) ${mismatchedBlockingTargets.map((t) => t.id).join(", ")}; ` +
          `refusing to validate only ${target.id}.`,
      );
    }
    return { configPath: loaded.path, target };
  }

  if (matchingBlockingTargets.length === 1) {
    return { configPath: loaded.path, target: matchingBlockingTargets[0] };
  }
  if (matchingBlockingTargets.length > 1) {
    die(`multiple blocking quality targets match --out ${outDir}; pass --qa-target <id>.`);
  }
  if (args.qaConfig || args.qaManifest || args.qaReport || args.qaFailOnError) {
    die("--qa-target is required unless a single blocking quality target matches --out.");
  }
  return null;
}

// --- 1. Copy the built SPA (index.html + assets) into the export dir. ---
mkdirSync(outDir, { recursive: true });
// Wipe stale generated data files but keep the dir (so an external .nojekyll or
// similar is not collateral). We copy the SPA over the top.
for (const f of [
  "scene.json",
  "scene-hierarchies.json",
  "class-hierarchies.json",
  "graph.json",
  "reconciliation-candidates.json",
  "entities.json",
  "quality-qa-report.json",
  "resolved-target.json",
  "workspace-manifest.json",
]) {
  rmSync(join(outDir, f), { force: true });
}
rmSync(join(outDir, "assets"), { recursive: true, force: true });
cpSync(spaDir, outDir, { recursive: true });

// --- 2. graph.json (verbatim copy unless registry seeds are completed). ---
const graphRaw = readFileSync(graphPath, "utf-8");
const graph = JSON.parse(graphRaw);
if (!Array.isArray(graph.nodes)) graph.nodes = [];

// --- 2b. Registry-seed completion (OPT-IN). ---
// A node_type bound to a registry declares EVERY registry row an entity, but
// extraction only seeds a record the corpus mentions. Registries whose rows are
// mostly uncited therefore land famished, which stays invisible until something
// joins on the registry ids — at which point the hierarchy sidecar silently
// drops the whole forest into dangling_arc_count. Completing the seeds is
// deterministic and LLM-free, and strictly ADDITIVE: no existing node changes.
let seedCompletion = null;
// Raw registry id -> the registry's OWN display label, for the rows whose label
// is not just their id. The registry is the authority on what a record is
// called; the graph's node label is only as good as the extraction that seeded
// it (see 3b, where a self-labelled node falls back to this index).
let registryLabels = new Map();
if (args.completeRegistrySeeds) {
  const scope = String(args.completeRegistrySeedsScope ?? "hierarchies");
  if (scope !== "hierarchies" && scope !== "all") {
    die(`--complete-registry-seeds-scope must be "hierarchies" or "all"; got ${scope}`);
  }
  const normalizedProfilePath = resolve(args.completeRegistrySeeds);
  if (!existsSync(normalizedProfilePath)) {
    die(`--complete-registry-seeds: normalized profile not found: ${normalizedProfilePath}`);
  }
  const normalizedProfile = JSON.parse(readFileSync(normalizedProfilePath, "utf-8"));
  const unbound = Object.entries(normalizedProfile.registries ?? {})
    .filter(([, spec]) => !spec?.bound_source_path)
    .map(([id]) => id);
  if (unbound.length === Object.keys(normalizedProfile.registries ?? {}).length) {
    die(
      `--complete-registry-seeds: no registry in ${normalizedProfilePath} carries bound_source_path; ` +
        "pass the NORMALIZED profile (e.g. <state>/profile/ontology-profile.normalized.json), not the YAML.",
    );
  }
  // Only load the registries we intend to complete: an unbound one would throw.
  const scoped = scope === "all"
    ? Object.keys(normalizedProfile.registries ?? {})
    : registriesBackingHierarchies(normalizedProfile);
  const selectable = scoped.filter((id) => !unbound.includes(id));
  const profileForLoad = {
    ...normalizedProfile,
    registries: Object.fromEntries(
      selectable.map((id) => [id, normalizedProfile.registries[id]]),
    ),
  };
  const registries = loadProfileRegistries(profileForLoad);
  registryLabels = registryDisplayLabels(registries);
  seedCompletion = completeRegistrySeeds({
    registries,
    profile: normalizedProfile,
    graphNodes: graph.nodes,
  });
  graph.nodes.push(...seedCompletion.nodes);
}

// Re-serialize only when completion actually changed the node set; otherwise
// the bundle's graph.json stays byte-identical to the state artifact.
writeFileSync(
  join(outDir, "graph.json"),
  seedCompletion && seedCompletion.added > 0 ? JSON.stringify(graph) : graphRaw,
);
const nodes = graph.nodes;

// --- 3. scene.json: the light Studio scene (server's sceneJsonResult). ---
// Built FIRST but positioned LAST: the hierarchy sidecar (3b) is an input to
// the hierarchy-aware layout, so the scene cannot be baked before it exists.
const scene = buildStudioScene(graph);

// --- 3b. scene-hierarchies.json (workspace-bundle-contract-v1, D1). ---
// STANDALONE sidecar (never embedded in scene.json), emitted iff the
// ontology compile produced <state>/ontology/hierarchies.json. Joins on the
// raw registry ids: the scene contributes its lossless `registry_record_id`s.
const sceneRawIds = new Set();
// Raw id -> label, so tree rows render a readable name instead of a bare code.
const sceneLabels = new Map();
for (const node of scene.nodes) {
  const raw = typeof node.registry_record_id === "string" ? node.registry_record_id : node.id;
  if (!raw) continue;
  sceneRawIds.add(raw);
  if (typeof node.label === "string" && node.label && !sceneLabels.has(raw)) {
    sceneLabels.set(raw, node.label);
  }
}
// A node seeded before its registry carried human names is SELF-LABELLED
// (label === the raw id), which renders as a bare code (`AM0104`) with no name.
// The registry is authoritative for the display name, so it repairs exactly
// those rows — and only those: a real graph label is never overwritten.
for (const [raw, label] of registryLabels) {
  if (!sceneRawIds.has(raw)) continue;
  const current = sceneLabels.get(raw);
  if (!current || current === raw) sceneLabels.set(raw, label);
}
const hierarchiesResult = emitSceneHierarchies({
  ontologyOutputDir: join(stateDir, "ontology"),
  sceneDir: outDir,
  sceneNodeIds: sceneRawIds,
  labels: sceneLabels,
});

// --- 3c. Bake the layout. ---
// Pre-compute and pin node positions (x,y + fx,fy) so the SPA renders the
// settled layout with iterations=1 — no O(n²) force sim on the main thread at
// mount. A corpus with declared hierarchies defaults to `hierarchy-aware`
// (deterministic, O(n), no simulation); everything else keeps `force`.
const sidecarHierarchies = hierarchiesResult.sidecar?.hierarchies ?? {};
const hasHierarchies = Object.values(sidecarHierarchies).some(
  (forest) => Object.keys(forest?.nodes_by_id ?? {}).length > 0,
);
const layoutId = selectDefaultSceneLayoutId({
  hasHierarchies,
  explicit: args.layout ?? undefined,
});
applySceneLayout(scene, layoutId, { hierarchies: sidecarHierarchies });
writeFileSync(join(outDir, "scene.json"), JSON.stringify(scene));

// --- 3c. class-hierarchies.json (EVOL 2.c). ---
// SEPARATE, additive ontology artifact (never embedded in scene/graph),
// emitted into <state>/ontology IFF the bound profile carries a non-empty
// `class_hierarchies` block. Entities join leaf classes by their graph node
// `id` (NOT registry_record_id). Absent block / no --profile => no file
// (byte-identical to today). A profile that cannot be loaded is non-fatal.
let classHierarchiesResult = { written: false, path: null, artifact: null };
if (args.profile) {
  try {
    const ontologyProfile = loadOntologyProfile(args.profile);
    // Emit into the bundle OUT dir (next to scene.json), mirroring
    // emitSceneHierarchies(sceneDir: outDir) + buildStaticStudio — the SPA
    // fetches class-hierarchies.json from the bundle root to drive the group-by
    // / ontology-tree facets. (Previously written to <state>/ontology, so static
    // exports shipped WITHOUT it and lost the group-by taxonomy.)
    classHierarchiesResult = emitClassHierarchies({
      classHierarchies: ontologyProfile.class_hierarchies,
      graphNodes: nodes,
      ontologyOutputDir: outDir,
      profileHash: ontologyProfile.profile_hash,
    });
  } catch (err) {
    console.warn(
      `build-studio-demo: could not load profile for class-hierarchies (${err instanceof Error ? err.message : String(err)}); skipping class-hierarchies.json.`,
    );
  }
}

// --- 4. reconciliation-candidates.json: publish the complete candidate set. ---
// The SPA can page client-side from this static artifact. Publication QA must
// see the full queue/response, not a UI page capped at 50.
let candidatesResponse = { items: [], total: 0 };
const candidatesPath = join(stateDir, "ontology", "reconciliation", "candidates.json");
if (existsSync(candidatesPath)) {
  try {
    const queue = loadOntologyReconciliationCandidates(candidatesPath);
    candidatesResponse = queryOntologyReconciliationCandidates(queue, {
      sort: "score",
      order: "desc",
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

// --- 5b. COHERENCE GATE (hard failure). ---
// graph.json, scene.json and entities.json describe the SAME entity set. A
// divergence means the bundle silently lost or duplicated entities somewhere
// between the three writers, and every count the UI shows becomes a lie. This
// is the check that would have caught a scene truncated to 4000 nodes, so it
// fails the BUILD rather than shipping a bundle that disagrees with itself.
const entityCount = Object.keys(entities).length;
const counts = {
  graph_nodes: nodes.length,
  scene_nodes: scene.nodes.length,
  entities: entityCount,
};
if (
  counts.graph_nodes !== counts.scene_nodes ||
  counts.scene_nodes !== counts.entities
) {
  die(
    "bundle incoherent — graph.json, scene.json and entities.json disagree on the node count:\n" +
      `    graph.json    nodes: ${counts.graph_nodes}\n` +
      `    scene.json    nodes: ${counts.scene_nodes}\n` +
      `    entities.json ids:   ${counts.entities}`,
  );
}

// --- 6. workspace-manifest.json (workspace-bundle-contract-v1). ---
// The bundle descriptor the process-std-am peer consumes first: it discovers the
// artifacts, validates their schema ids, and verifies integrity via the
// per-artifact sha256 + size. Emitted LAST so it hashes the final bytes of
// every artifact above; absent artifacts are recorded present:false (the
// scene is OPTIONAL per F1, so a no-scene bundle stays valid).
const manifestResult = emitWorkspaceManifest({ bundleDir: outDir, counts });

// --- 7. Quality target preflight. ---
let qaReport = null;
const selectedQualityTarget = selectQualityTargetForPreflight(outDir);
if (selectedQualityTarget) {
  const { target } = selectedQualityTarget;
  const targetHash = hashQualityTarget(target);
  const qaManifestPath = args.qaManifest ? resolve(args.qaManifest) : join(outDir, "resolved-target.json");
  if (!args.qaManifest && targetRequiresProducerManifest(target)) {
    die(
      `--qa-manifest is required for quality target ${target.id} because it requires producer proof or extraction-unit coverage.`,
    );
  }
  if (!args.qaManifest) {
    writeFileSync(
      qaManifestPath,
      `${JSON.stringify(buildResolvedTargetManifest(target, targetHash, {
        candidatesPath,
        graphPath,
        outDir,
        stateDir,
      }), null, 2)}\n`,
    );
  }
  const resolvedTargetManifest = existsSync(qaManifestPath)
    ? JSON.parse(readFileSync(qaManifestPath, "utf-8"))
    : null;
  qaReport = evaluateQualityBundle({
    target,
    bundleDir: outDir,
    manifest: resolvedTargetManifest,
    targetHash,
  });
  const qaReportPath = args.qaReport ? resolve(args.qaReport) : join(outDir, QA_REPORT_FILENAME);
  writeFileSync(qaReportPath, `${JSON.stringify(qaReport, null, 2)}\n`);
  if (qaReport.status === "failed" && (target.publication.blocking || args.qaFailOnError)) {
    const failures = qaReport.checks
      .filter((check) => check.severity === "error")
      .slice(0, 10)
      .map((check) => `    - ${check.id}: ${check.message}`)
      .join("\n");
    die(`QA failed for target ${target.id}; report written to ${qaReportPath}\n${failures}`);
  }
}

// --- Summary. ---
console.log(`build-studio-demo: wrote standalone studio export to ${outDir}`);
console.log(`  nodes: ${nodes.length} | scene nodes: ${scene.nodes.length} | scene edges: ${scene.edges.length}`);
console.log(`  coherence: graph ${counts.graph_nodes} = scene ${counts.scene_nodes} = entities ${counts.entities} OK`);
console.log(`  layout: ${layoutId}${hasHierarchies ? " (declared hierarchies present)" : ""}`);
if (seedCompletion) {
  const detail = Object.entries(seedCompletion.byRegistry)
    .map(([id, stat]) => `${id} ${stat.existing}+${stat.added}/${stat.total}`)
    .join(", ");
  console.log(`  registry seeds completed: +${seedCompletion.added} (${detail})`);
}
console.log(
  hierarchiesResult.path
    ? `  scene-hierarchies: ${Object.keys(hierarchiesResult.sidecar.hierarchies).length} hierarchies (${hierarchiesResult.path})`
    : "  scene-hierarchies: none (no ontology/hierarchies.json in state dir)",
);
console.log(
  classHierarchiesResult.path
    ? `  class-hierarchies: ${Object.keys(classHierarchiesResult.artifact.hierarchies).length} hierarchies (${classHierarchiesResult.path})`
    : "  class-hierarchies: none (no class_hierarchies block in profile)",
);
console.log(`  reconciliation candidates: ${candidatesResponse.total ?? candidatesResponse.items.length}`);
console.log(`  entities index: ${Object.keys(entities).length} ids (${withDescription} with description, ${withOccurrences} with occurrences)`);
console.log(
  `  workspace-manifest: ${manifestResult.manifest.present_count}/${manifestResult.manifest.artifacts.length} artifacts present (${manifestResult.path})`,
);
if (qaReport) {
  console.log(
    `  qa: ${qaReport.status} (${qaReport.summary.failed} errors, ${qaReport.summary.warned} warnings)`,
  );
}
