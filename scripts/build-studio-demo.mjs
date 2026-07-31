#!/usr/bin/env node
/**
 * Build a STANDALONE static export of the Svelte studio SPA, pre-loaded with a
 * graphify state dir, so it can be served by GitHub Pages (or opened off the
 * filesystem) WITHOUT the `graphify ontology studio` server.
 *
 * THE BUNDLE IS PRODUCED BY THE REAL EXPORTER. `buildStaticStudio`
 * (src/studio-export.ts) — the engine behind `graphify studio export` — writes
 * every artifact; this script only supplies the two demo-specific INPUTS it
 * cannot derive (completed registry seeds and their display labels) and applies
 * the two demo-specific GATES it must not own (bundle coherence, publication QA).
 *
 * It used to write the artifacts itself. That duplication is exactly how the
 * demo bundles ended up missing everything the exporter had learned to emit
 * since the fork — `search-index.json`, `ontology/citations.json`, the
 * `studio.html` single-file studio, and (the reason this was rewritten)
 * `sources/` + `sources/provenance.json`, so a demo bundle could show WHICH file
 * a passage came from but never the document itself. A published demo now
 * carries the same provenance chain as any other export, and any artifact the
 * exporter learns to emit next arrives here for free.
 *
 * Emitted artifacts: see the header of src/studio-export.ts (single source of
 * truth). Additionally written HERE:
 *   resolved-target.json      <- producer manifest for the quality preflight
 *   quality-qa-report.json    <- the preflight report
 *
 * Usage:
 *   node scripts/build-studio-demo.mjs --state <dir> --out <dir> [--profile <p>]
 *     [--layout <id>] [--complete-registry-seeds <normalized-profile.json>
 *      [--complete-registry-seeds-scope hierarchies|all]]
 *     [--include-sources] [--include-original-sources] [--sources-root <dir>]
 *     [--no-single-file]
 *     [--qa-target <id> [--qa-config <path>] [--qa-manifest <path>]
 *      [--qa-report <path>] [--qa-fail-on-error]]
 *
 *   --state    graphify state dir (default: .graphify). Must contain graph.json.
 *   --out      target export dir (default: docs/studio). Created if missing.
 *   --profile  profile path/dir. Drives class-hierarchies.json + the scene's
 *              per-type visual encoding. Optional.
 *
 *   --layout   build-time layout id: force | typed-layer | time-oriented |
 *              hierarchy-aware. Omitted => `auto` (hierarchy-aware when the
 *              bundle carries declared hierarchies, force otherwise).
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
 *   --include-sources           bundle the CITED documents under sources/.
 *   --include-original-sources  also bundle the ORIGINALS behind converted
 *                               markdown (the PDFs an OCR transcript came from),
 *                               so the viewer opens the paper, not the
 *                               transcript. Unbounded in size — opt in
 *                               deliberately.
 *   --sources-root <dir>        root the relative source_file locators resolve
 *                               against (default: the parent of --state).
 *   --no-single-file            skip the self-contained studio.html.
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
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    includeSources: false,
    includeOriginalSources: false,
    sourcesRoot: null,
    singleFile: true,
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
    else if (arg === "--include-sources") args.includeSources = true;
    else if (arg === "--include-original-sources") args.includeOriginalSources = true;
    else if (arg === "--sources-root") args.sourcesRoot = argv[++i];
    else if (arg === "--no-single-file") args.singleFile = false;
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
    "Usage: node scripts/build-studio-demo.mjs --state <dir> --out <dir> [--profile <p>] [--layout <id>] " +
      "[--complete-registry-seeds <normalized-profile.json> [--complete-registry-seeds-scope hierarchies|all]] " +
      "[--include-sources] [--include-original-sources] [--sources-root <dir>] [--no-single-file] " +
      "[--qa-target <id> [--qa-config <path>] [--qa-manifest <path>] [--qa-report <path>] [--qa-fail-on-error]]",
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

// Import the REAL exporter + the demo-specific helpers. Requires the server build.
let buildStaticStudio;
let completeRegistrySeeds;
let registriesBackingHierarchies;
let registryDisplayLabels;
let loadProfileRegistries;
let discoverQualityTargetsConfig;
let hashQualityTarget;
let loadQualityTargetsConfig;
let QA_REPORT_FILENAME;
let RESOLVED_TARGET_MANIFEST_SCHEMA;
let evaluateQualityBundle;
let sha256File;
try {
  ({
    buildStaticStudio,
    completeRegistrySeeds,
    discoverQualityTargetsConfig,
    loadProfileRegistries,
    registriesBackingHierarchies,
    registryDisplayLabels,
    evaluateQualityBundle,
    hashQualityTarget,
    loadQualityTargetsConfig,
    QA_REPORT_FILENAME,
    RESOLVED_TARGET_MANIFEST_SCHEMA,
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

// --- 1. Registry-seed completion (OPT-IN) — the one INPUT the exporter cannot
// derive on its own, because it needs the NORMALIZED profile's bound registry
// sources rather than the graph. Strictly additive: no existing node changes.
let seedCompletion = null;
// Raw registry id -> the registry's OWN display label, for the rows whose label
// is not just their id. The registry is the authority on what a record is
// called; the graph's node label is only as good as the extraction that seeded it.
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
  const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
  seedCompletion = completeRegistrySeeds({
    registries,
    profile: normalizedProfile,
    graphNodes: Array.isArray(graph.nodes) ? graph.nodes : [],
  });
}

// Stale preflight artifacts from a previous run. The exporter wipes everything
// IT emits, but these two are written here, so they are cleaned here.
for (const f of ["quality-qa-report.json", "resolved-target.json"]) {
  rmSync(join(outDir, f), { force: true });
}

// --- 2. The bundle itself — every artifact, by the real exporter. ---
const result = buildStaticStudio({
  stateDir,
  outDir,
  spaDir,
  ...(args.profile ? { profilePath: args.profile } : {}),
  // Omitted --layout means `auto`: hierarchy-aware iff the bundle declares
  // hierarchies. A demo is a reading surface, so a known structure should be
  // shown as structure rather than as a force disc.
  layoutId: args.layout ?? "auto",
  ...(seedCompletion ? { seedNodes: seedCompletion.nodes } : {}),
  ...(registryLabels.size > 0 ? { hierarchyLabels: registryLabels } : {}),
  ...(args.includeSources ? { includeSources: true } : {}),
  ...(args.includeOriginalSources ? { includeOriginalSources: true } : {}),
  ...(args.sourcesRoot ? { sourcesRoot: resolve(args.sourcesRoot) } : {}),
  ...(args.singleFile ? {} : { singleFile: false }),
  onWarning: (message) => console.warn(message),
});

// --- 3. COHERENCE GATE (hard failure). ---
// graph.json, scene.json and entities.json describe the SAME entity set. A
// divergence means the bundle silently lost or duplicated entities somewhere
// between the three writers, and every count the UI shows becomes a lie. This is
// the check that would have caught a scene truncated to 4000 nodes, so it fails
// the BUILD rather than shipping a bundle that disagrees with itself.
const counts = {
  graph_nodes: result.nodeCount,
  scene_nodes: result.sceneNodeCount,
  entities: result.entityCount,
};
if (counts.graph_nodes !== counts.scene_nodes || counts.scene_nodes !== counts.entities) {
  die(
    "bundle incoherent — graph.json, scene.json and entities.json disagree on the node count:\n" +
      `    graph.json    nodes: ${counts.graph_nodes}\n` +
      `    scene.json    nodes: ${counts.scene_nodes}\n` +
      `    entities.json ids:   ${counts.entities}`,
  );
}

// --- 4. Quality target preflight. ---
const candidatesPath = join(stateDir, "ontology", "reconciliation", "candidates.json");
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
console.log(`  nodes: ${result.nodeCount} | scene nodes: ${result.sceneNodeCount} | scene edges: ${result.sceneEdgeCount}`);
console.log(`  coherence: graph ${counts.graph_nodes} = scene ${counts.scene_nodes} = entities ${counts.entities} OK`);
console.log(`  layout: ${result.layoutId}`);
if (seedCompletion) {
  const detail = Object.entries(seedCompletion.byRegistry)
    .map(([id, stat]) => `${id} ${stat.existing}+${stat.added}/${stat.total}`)
    .join(", ");
  console.log(`  registry seeds completed: +${seedCompletion.added} (${detail})`);
}
console.log(
  result.sceneHierarchiesPath
    ? `  scene-hierarchies: ${result.sceneHierarchiesPath}`
    : "  scene-hierarchies: none (no ontology/hierarchies.json in state dir)",
);
console.log(
  result.classHierarchiesPath
    ? `  class-hierarchies: ${result.classHierarchiesPath}`
    : "  class-hierarchies: none (no class_hierarchies block in profile)",
);
console.log(`  reconciliation candidates: ${result.reconciliationCount}`);
console.log(`  search index: ${result.searchIndexNodeCount} docs`);
console.log(
  `  entities index: ${result.entityCount} ids (${result.descriptionCoverage.described} described, ${result.descriptionCoverage.provisional} provisional)`,
);
console.log(
  result.provenancePath
    ? `  cited-source provenance: ${result.provenanceCount} converted document(s) -> originals (${result.provenancePath})`
    : "  cited-source provenance: none (no cited document records a conversion origin)",
);
if (result.sources) {
  console.log(
    `  sources: ${result.sources.copied} cited file(s), ${(result.sources.bytes / 1e6).toFixed(1)} MB (${result.sources.missing} missing)`,
  );
}
if (result.originalSources) {
  console.log(
    `  original sources: ${result.originalSources.copied} document(s), ${(result.originalSources.bytes / 1e6).toFixed(1)} MB (${result.originalSources.missing} missing)`,
  );
}
console.log(
  `  workspace-manifest: ${result.manifestPresentCount}/${result.manifestArtifactCount} artifacts present (${result.manifestPath})`,
);
console.log(
  result.studioHtmlPath
    ? `  studio.html: ${(result.studioHtmlBytes / 1e6).toFixed(1)} MB single-file studio`
    : "  studio.html: not emitted",
);
if (qaReport) {
  console.log(
    `  qa: ${qaReport.status} (${qaReport.summary.failed} errors, ${qaReport.summary.warned} warnings)`,
  );
}
