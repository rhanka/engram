// Proposed archi@1 ingestion pipeline (stages 1–8), Focus binding verification, git readAt and atomic acceptance writer
// (spec/SPEC_EVOL_ARCHI_CARDS.md §5.1–§5.6).
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalBytes, digestOfPreimage } from "./canonical.js";
import { sortDiagnostics, type ArchiDsDiagnostic, type DsDiagnosticSeverity, type EngramDiagnostic } from "./diagnostics.js";
import type {
  NativeDiagramPresentation,
  NativeSemanticDocument,
  NativeViewDocument,
} from "./diagram-native-types.js";
import {
  DS_ADAPTER_SHA256,
  DS_COMMIT,
  DS_RENDERER_SHA256,
} from "./diagram-presentation-pins.js";
import { GENERIC_V2 } from "./diagram-profiles.js";
import { ARCHI_CARDS_PIN, ARCHI_V1_PIN, CONTRACT_PIN, GENERIC_V2_PIN } from "./diagram-registry.js";
import { DIAGRAM_VIEW_SCHEMA_V2 } from "./diagram-schemas.js";
import { checkGovernedViewShape } from "./diagram-view-shape.js";
import type { Pin } from "./types.js";
import { checkArchi, type ArchiManifest } from "./archi-check.js";
import { ARCHI_V1 } from "./archi-profile.js";
import { ARCHI_CARDS_CONTENT, type ArchiCardsContent } from "./archi-cards-data.js";
import { ARCHI_CONTAINER_KINDS, projectArchiCards, type ArchiProjectionBinding } from "./archi-cards.js";
import {
  archiOccurrenceRef,
  archiSummaries,
  buildArchiSourceView,
  checkArchiView,
  type ArchiDsPort,
  type ArchiViewSpec,
} from "./archi-view.js";
import {
  ARCHI_MANIFEST_PATH,
  checkArchiAcceptanceShape,
  checkArchiDocumentInvariants,
  checkArchiManifestShape,
  checkArchiStage1CrossRefs,
  checkArchiViewBindingShape,
  checkArchiViewSpecShape,
  dottedPathToPointer,
  makeArchiDiagnostic,
  parseStrictIJson,
  toArchiDsDiagnostic,
  type ArchiAcceptance,
  type ArchiAcceptanceFileEntry,
  type ArchiRefusal,
  type ArchiRefusalScope,
  type ArchiStage,
  type ArchiViewBinding,
} from "./archi-shapes.js";

const COMMIT_HEX_RE = /^[0-9a-f]{40}$/;

interface RawDsDiagnostic {
  readonly code: string;
  readonly severity: DsDiagnosticSeverity;
  readonly path: string;
  readonly message: string;
  readonly refs?: readonly string[];
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

/** proposed: DS executor port required by ingestArchitecture (§5.3 stages 3, 5, 6). */
export interface ArchiIngestDsPort extends ArchiDsPort {
  readonly commit?: string;
  readonly adapterSha256?: string;
  readonly rendererSha256?: string;
  readonly adapterBytes?: Uint8Array;
  readonly rendererBytes?: Uint8Array;
  validateProfile(profile: unknown, mechanismId?: string): readonly RawDsDiagnostic[];
  verifyExecutorBindings(bindings: unknown, registry: unknown): readonly RawDsDiagnostic[];
  validateDocument(
    document: NativeSemanticDocument,
    options?: { readonly registry?: unknown; readonly bindings?: unknown },
  ): readonly RawDsDiagnostic[];
  validateView(
    view: NativeViewDocument,
    document: NativeSemanticDocument,
    options?: { readonly registry?: unknown; readonly bindings?: unknown },
  ): readonly RawDsDiagnostic[];
  validateDiagramPresentation(
    document: NativeSemanticDocument,
    view: NativeViewDocument,
    options?: { readonly registry?: unknown; readonly bindings?: unknown },
  ): readonly RawDsDiagnostic[];
  bindingRowFor(profile: unknown, mechanismId: string): unknown;
}

/** proposed: pure readAt port reading committed bytes at (commit, path) (§5.1, §5.3 stage 1). */
export type ArchiReadAtPort = (commit: string, path: string) => Uint8Array | string | null | undefined;

/** proposed: atomic writer port for acceptance records (§5.3 stages 7–8, §5.4). */
export interface ArchiWriterObject {
  write(directory: string, files: Readonly<Record<string, string>>): void;
  readExisting?(directory: string): Readonly<Record<string, string>> | null | undefined;
}

export type ArchiWriterFn = ((directory: string, files: Readonly<Record<string, string>>) => void) & {
  readExisting?: (directory: string) => Readonly<Record<string, string>> | null | undefined;
};

export type ArchiWriterPort = ArchiWriterFn | ArchiWriterObject;

/** proposed: in-memory writer port for unit tests (§6.1). */
export interface ArchiMemoryWriterPort extends ArchiWriterFn {
  readonly directories: Map<string, Readonly<Record<string, string>>>;
  readonly writeCount: number;
  readExisting(directory: string): Readonly<Record<string, string>> | null;
}

/** proposed: input to ingestArchitecture (§5.3). */
export interface ArchiIngestInput {
  readonly repository: string;
  readonly commit: string;
}

/**
 * proposed: injected ports for ingestArchitecture (§5.3).
 * Production callers must pass only {readAt, ds, write}.
 */
export interface ArchiIngestPorts {
  readonly readAt: ArchiReadAtPort;
  readonly ds: ArchiIngestDsPort;
  readonly write: ArchiWriterPort;
}

interface InternalArchiIngestSeamPorts extends ArchiIngestPorts {
  readonly cardsContent?: ArchiCardsContent;
  readonly transformProjectedView?: (view: NativeViewDocument, spec: ArchiViewSpec) => NativeViewDocument;
}

/** proposed: acceptance arm returned by ingestArchitecture (§5.3, §5.4). */
export interface ArchiAccepted {
  readonly outcome: "accepted";
  readonly directory: string;
  readonly acceptance: ArchiAcceptance;
  readonly acceptanceDigest: string;
  readonly idempotent: boolean;
  readonly files: Readonly<Record<string, string>>;
}

/** proposed: discriminated union returned by ingestArchitecture (§5.3–§5.5). */
export type ArchiIngestionResult = ArchiAccepted | ArchiRefusal;

const WRITER_CACHE = new WeakMap<object, Map<string, Readonly<Record<string, string>>>>();

function readExistingFromWriter(
  writer: ArchiWriterPort,
  directory: string,
): Readonly<Record<string, string>> | null | undefined {
  if (typeof writer === "function") {
    if (typeof writer.readExisting === "function") {
      return writer.readExisting(directory);
    }
    return WRITER_CACHE.get(writer)?.get(directory) ?? null;
  }
  if (writer && typeof writer === "object") {
    if (typeof writer.readExisting === "function") {
      return writer.readExisting(directory);
    }
    return WRITER_CACHE.get(writer)?.get(directory) ?? null;
  }
  return null;
}

function invokeWriter(writer: ArchiWriterPort, directory: string, files: Readonly<Record<string, string>>): void {
  if (typeof writer === "function") {
    writer(directory, files);
  } else {
    writer.write(directory, files);
  }
  if (writer && (typeof writer === "function" || typeof writer === "object")) {
    let map = WRITER_CACHE.get(writer);
    if (!map) {
      map = new Map<string, Readonly<Record<string, string>>>();
      WRITER_CACHE.set(writer, map);
    }
    map.set(directory, { ...files });
  }
}

function makeRefusal(
  stage: ArchiStage,
  scopeMap: ReadonlyMap<string, readonly (EngramDiagnostic | ArchiDsDiagnostic)[]>,
): ArchiRefusal {
  const scopes: ArchiRefusalScope[] = [...scopeMap.entries()]
    .filter(([, diags]) => diags.length > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([scope, diags]) => ({
      scope,
      diagnostics: sortDiagnostics(diags),
    }));
  return {
    outcome: "refused",
    stage,
    scopes,
  };
}

function addDiagToScope(
  map: Map<string, (EngramDiagnostic | ArchiDsDiagnostic)[]>,
  scope: string,
  ...diags: readonly (EngramDiagnostic | ArchiDsDiagnostic)[]
): void {
  if (diags.length === 0) return;
  const list = map.get(scope) ?? [];
  list.push(...diags);
  map.set(scope, list);
}

function sha256BytesHex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function verifyDsExecutorPort(ds: ArchiIngestDsPort | null | undefined): EngramDiagnostic | null {
  if (
    !ds ||
    typeof ds.validateProfile !== "function" ||
    typeof ds.verifyExecutorBindings !== "function" ||
    typeof ds.validateDocument !== "function" ||
    typeof ds.validateView !== "function" ||
    typeof ds.validateDiagramPresentation !== "function" ||
    typeof ds.projectView !== "function" ||
    typeof ds.classifyInternalRelations !== "function" ||
    typeof ds.analyzeSummaries !== "function" ||
    typeof ds.createProfileRegistry !== "function" ||
    typeof ds.bindingRowFor !== "function"
  ) {
    return makeArchiDiagnostic(
      "archi-executor-unavailable",
      "",
      DS_COMMIT,
      "DS executor port is missing required validation or projection methods.",
    );
  }
  if (ds.commit !== undefined && ds.commit !== DS_COMMIT) {
    return makeArchiDiagnostic(
      "archi-executor-unavailable",
      "/commit",
      ds.commit || DS_COMMIT,
      `DS executor commit "${ds.commit}" does not match pinned DS_COMMIT "${DS_COMMIT}".`,
    );
  }
  const adapterHash = ds.adapterBytes instanceof Uint8Array ? sha256BytesHex(ds.adapterBytes) : ds.adapterSha256;
  const rendererHash = ds.rendererBytes instanceof Uint8Array ? sha256BytesHex(ds.rendererBytes) : ds.rendererSha256;
  if (adapterHash !== DS_ADAPTER_SHA256) {
    return makeArchiDiagnostic(
      "archi-executor-unavailable",
      "/adapterSha256",
      DS_COMMIT,
      `DS adapter entry hash "${String(adapterHash)}" does not match pinned DS_ADAPTER_SHA256.`,
    );
  }
  if (rendererHash !== DS_RENDERER_SHA256) {
    return makeArchiDiagnostic(
      "archi-executor-unavailable",
      "/rendererSha256",
      DS_COMMIT,
      `DS renderer entry hash "${String(rendererHash)}" does not match pinned DS_RENDERER_SHA256.`,
    );
  }
  return null;
}

/**
 * Atomic 8-stage ingestion pipeline for archi@1 descriptions (§5.3).
 */
export function ingestArchitecture(
  input: ArchiIngestInput,
  ports: ArchiIngestPorts,
): ArchiIngestionResult {
  const manifestScope = `file:${ARCHI_MANIFEST_PATH}`;

  // --- Stage 1: source ---
  const stage1Scopes = new Map<string, (EngramDiagnostic | ArchiDsDiagnostic)[]>();
  if (!input || typeof input.commit !== "string" || !COMMIT_HEX_RE.test(input.commit)) {
    addDiagToScope(
      stage1Scopes,
      manifestScope,
      makeArchiDiagnostic(
        "archi-source-unresolved",
        "",
        ARCHI_MANIFEST_PATH,
        `Commit "${String(input?.commit)}" must be a 40-character lowercase hex SHA-1.`,
      ),
    );
    return makeRefusal("source", stage1Scopes);
  }

  let manifestRaw: Uint8Array | string | null | undefined;
  try {
    manifestRaw = ports.readAt(input.commit, ARCHI_MANIFEST_PATH);
  } catch (err) {
    addDiagToScope(
      stage1Scopes,
      manifestScope,
      makeArchiDiagnostic(
        "archi-source-unresolved",
        "",
        ARCHI_MANIFEST_PATH,
        `Commit "${input.commit}" could not be resolved: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return makeRefusal("source", stage1Scopes);
  }

  if (manifestRaw === null || manifestRaw === undefined) {
    addDiagToScope(
      stage1Scopes,
      manifestScope,
      makeArchiDiagnostic(
        "archi-manifest-missing",
        "",
        ARCHI_MANIFEST_PATH,
        `Manifest "${ARCHI_MANIFEST_PATH}" is absent at commit ${input.commit}.`,
      ),
    );
    return makeRefusal("source", stage1Scopes);
  }

  const parsedManifest = parseStrictIJson(manifestRaw);
  if (!parsedManifest.ok) {
    const code = /duplicate/i.test(parsedManifest.reason) ? "archi-input-invalid" : "archi-manifest-invalid";
    addDiagToScope(
      stage1Scopes,
      manifestScope,
      makeArchiDiagnostic(code, parsedManifest.pointer, ARCHI_MANIFEST_PATH, parsedManifest.reason),
    );
    return makeRefusal("source", stage1Scopes);
  }

  const manifestDiags = checkArchiManifestShape(parsedManifest.value, ARCHI_MANIFEST_PATH);
  if (manifestDiags.length > 0) {
    addDiagToScope(stage1Scopes, manifestScope, ...manifestDiags);
    return makeRefusal("source", stage1Scopes);
  }

  const manifest = parsedManifest.value as ArchiManifest;

  // Read document and view specs at the exact repo-relative paths named by the manifest (§5.1, §5.2)
  let docResolved: { readonly resolvedPath: string; readonly bytes: Uint8Array | string } | null = null;
  try {
    const rawDoc = ports.readAt(input.commit, manifest.document);
    if (rawDoc !== null && rawDoc !== undefined) {
      docResolved = { resolvedPath: manifest.document, bytes: rawDoc };
    }
  } catch {
    docResolved = null;
  }
  if (!docResolved) {
    addDiagToScope(
      stage1Scopes,
      manifestScope,
      makeArchiDiagnostic(
        "archi-source-unresolved",
        "/document",
        manifest.document,
        `Document "${manifest.document}" named by manifest cannot be read at commit ${input.commit}.`,
      ),
    );
  }

  const viewResolvedList: { readonly manifestIndex: number; readonly resolvedPath: string; readonly bytes: Uint8Array | string }[] = [];
  for (let i = 0; i < manifest.views.length; i++) {
    const vp = manifest.views[i]!;
    let resolved: { readonly resolvedPath: string; readonly bytes: Uint8Array | string } | null = null;
    try {
      const rawView = ports.readAt(input.commit, vp);
      if (rawView !== null && rawView !== undefined) {
        resolved = { resolvedPath: vp, bytes: rawView };
      }
    } catch {
      resolved = null;
    }
    if (!resolved) {
      addDiagToScope(
        stage1Scopes,
        manifestScope,
        makeArchiDiagnostic(
          "archi-source-unresolved",
          `/views/${i}`,
          vp,
          `View spec "${vp}" named by manifest cannot be read at commit ${input.commit}.`,
        ),
      );
    } else {
      viewResolvedList.push({ manifestIndex: i, ...resolved });
    }
  }

  if (stage1Scopes.size > 0) {
    return makeRefusal("source", stage1Scopes);
  }

  const docScope = `file:${docResolved!.resolvedPath}`;
  const parsedDoc = parseStrictIJson(docResolved!.bytes);
  let document: NativeSemanticDocument | undefined;
  if (!parsedDoc.ok) {
    addDiagToScope(
      stage1Scopes,
      docScope,
      makeArchiDiagnostic("archi-input-invalid", parsedDoc.pointer, docResolved!.resolvedPath, parsedDoc.reason),
    );
  } else {
    const docDiags = checkArchiDocumentInvariants(parsedDoc.value, docResolved!.resolvedPath);
    if (docDiags.length > 0) {
      addDiagToScope(stage1Scopes, docScope, ...docDiags);
    } else {
      document = parsedDoc.value as NativeSemanticDocument;
    }
  }

  const viewSpecs: ArchiViewSpec[] = [];
  const viewScopeByViewId = new Map<string, string>();
  for (const vEntry of viewResolvedList) {
    const vScope = `file:${vEntry.resolvedPath}`;
    const parsedView = parseStrictIJson(vEntry.bytes);
    if (!parsedView.ok) {
      addDiagToScope(
        stage1Scopes,
        vScope,
        makeArchiDiagnostic("archi-input-invalid", parsedView.pointer, vEntry.resolvedPath, parsedView.reason),
      );
      continue;
    }
    const vDiags = checkArchiViewSpecShape(parsedView.value, vEntry.resolvedPath);
    if (vDiags.length > 0) {
      addDiagToScope(stage1Scopes, vScope, ...vDiags);
      continue;
    }
    const spec = parsedView.value as ArchiViewSpec;
    viewSpecs.push(spec);
    viewScopeByViewId.set(spec.viewId, vScope);
  }

  if (document && viewSpecs.length === manifest.views.length && stage1Scopes.size === 0) {
    const cross = checkArchiStage1CrossRefs(manifest, document, viewSpecs);
    addDiagToScope(stage1Scopes, manifestScope, ...cross.manifestDiagnostics);
    for (const [viewId, diags] of cross.viewDiagnostics.entries()) {
      const scope = viewScopeByViewId.get(viewId) ?? viewId;
      addDiagToScope(stage1Scopes, scope, ...diags);
    }
  }

  if (stage1Scopes.size > 0) {
    return makeRefusal("source", stage1Scopes);
  }

  const doc = document!;

  // --- Stage 2: pins ---
  const stage2Diags: EngramDiagnostic[] = [];
  const governedProfilePins = new Map<string, Pin>([
    [ARCHI_V1_PIN.id, ARCHI_V1_PIN],
    [GENERIC_V2_PIN.id, GENERIC_V2_PIN],
  ]);

  for (let i = 0; i < manifest.profilePins.length; i++) {
    const p = manifest.profilePins[i]!;
    const ptr = `/profilePins/${i}`;
    const subj = `${p.id}@${p.version}`;
    const gov = governedProfilePins.get(p.id);
    if (!gov || p.version !== gov.version) {
      stage2Diags.push(
        makeArchiDiagnostic("incompatible_version", ptr, subj, `Profile pin "${subj}" version is not supported.`),
      );
    } else if (p.contentDigest !== gov.contentDigest) {
      stage2Diags.push(
        makeArchiDiagnostic("digest-mismatch", ptr, subj, `Profile pin "${subj}" digest does not match governed artifact.`),
      );
    }
  }

  const cPin = manifest.cardsPin!;
  const cSubj = `${cPin.id}@${cPin.version}`;
  if (cPin.id !== ARCHI_CARDS_PIN.id || cPin.version !== ARCHI_CARDS_PIN.version) {
    stage2Diags.push(
      makeArchiDiagnostic("incompatible_version", "/cardsPin", cSubj, `cardsPin "${cSubj}" version is not supported.`),
    );
  } else if (cPin.contentDigest !== ARCHI_CARDS_PIN.contentDigest) {
    stage2Diags.push(
      makeArchiDiagnostic("digest-mismatch", "/cardsPin", cSubj, `cardsPin "${cSubj}" digest does not match ARCHI_CARDS_V1.`),
    );
  }

  const vsPin = manifest.viewSchemaPin;
  const vsSubj = `${vsPin.id}@${vsPin.version}`;
  if (vsPin.id !== DIAGRAM_VIEW_SCHEMA_V2.pin.id || vsPin.version !== DIAGRAM_VIEW_SCHEMA_V2.pin.version) {
    stage2Diags.push(
      makeArchiDiagnostic(
        "incompatible_version",
        "/viewSchemaPin",
        vsSubj,
        `viewSchemaPin "${vsSubj}" version is not supported.`,
      ),
    );
  } else if (vsPin.contentDigest !== DIAGRAM_VIEW_SCHEMA_V2.pin.contentDigest) {
    stage2Diags.push(
      makeArchiDiagnostic(
        "digest-mismatch",
        "/viewSchemaPin",
        vsSubj,
        `viewSchemaPin "${vsSubj}" digest does not match DIAGRAM_VIEW_SCHEMA_V2.`,
      ),
    );
  }

  const derivedProfileRefs = manifest.profilePins.map((p) => `${p.id}@${p.version.split(".")[0]}`);
  const refsMatch =
    derivedProfileRefs[0] === "archi@1" &&
    derivedProfileRefs.length === doc.profileRefs.length &&
    derivedProfileRefs.every((r, idx) => r === doc.profileRefs[idx]);
  if (!refsMatch) {
    stage2Diags.push(
      makeArchiDiagnostic(
        "archi-pin-mismatch",
        "/profilePins",
        manifest.profilePins[0] ? `${manifest.profilePins[0].id}@${manifest.profilePins[0].version}` : "profilePins",
        "manifest.profilePins must equal document.profileRefs in the same order with archi@1 first (§5.2, §5.3 stage 2).",
      ),
    );
  }

  const usesGeneric =
    Object.values(doc.entities).some((e) => e.profile === "generic@2") ||
    Object.values(doc.relations).some((r) => r.profile === "generic@2") ||
    viewSpecs.some((v) => v.legend !== undefined);
  const hasGenericPin = manifest.profilePins.some((p) => p.id === "generic");
  if (usesGeneric && (!hasGenericPin || !doc.profileRefs.includes("generic@2"))) {
    stage2Diags.push(
      makeArchiDiagnostic(
        "archi-pin-mismatch",
        "/profilePins",
        "generic@2.0.0",
        "Document or view uses generic@2 records without generic@2 pinned in manifest.profilePins and document.profileRefs.",
      ),
    );
  }

  if (stage2Diags.length > 0) {
    return makeRefusal("pins", new Map([["pins", stage2Diags]]));
  }

  // --- Stage 3: executor ---
  const stage3Scopes = new Map<string, (EngramDiagnostic | ArchiDsDiagnostic)[]>();
  const execDiag = verifyDsExecutorPort(ports.ds);
  if (execDiag !== null) {
    addDiagToScope(stage3Scopes, "executor", execDiag);
    return makeRefusal("executor", stage3Scopes);
  }

  const ds = ports.ds;
  const activeDeclarations = hasGenericPin
    ? [ARCHI_V1.declaration, GENERIC_V2.declaration]
    : [ARCHI_V1.declaration];
  for (const decl of activeDeclarations) {
    const profDiags = ds.validateProfile(decl, "scoped-constraints@1").map(toArchiDsDiagnostic);
    addDiagToScope(stage3Scopes, "executor", ...profDiags);
  }

  const registry = ds.createProfileRegistry(activeDeclarations);
  const bindings = {
    schemaVersion: "1",
    rows: activeDeclarations.map((decl) => ds.bindingRowFor(decl, "scoped-constraints@1")),
  };
  const dsOpts = { registry, bindings };

  const bindDiags = ds.verifyExecutorBindings(bindings, registry).map(toArchiDsDiagnostic);
  addDiagToScope(stage3Scopes, "executor", ...bindDiags);

  const dsDocDiags = ds.validateDocument(doc, dsOpts).map(toArchiDsDiagnostic);
  addDiagToScope(stage3Scopes, "document", ...dsDocDiags);

  if (stage3Scopes.size > 0) {
    return makeRefusal("executor", stage3Scopes);
  }

  // --- Stage 4: document ---
  const seamPorts = ports as InternalArchiIngestSeamPorts;
  const cardsContent = seamPorts.cardsContent ?? ARCHI_CARDS_CONTENT;
  const docCheckDiags = checkArchi(doc, cardsContent, manifest.language);
  if (docCheckDiags.length > 0) {
    return makeRefusal("document", new Map([["document", docCheckDiags]]));
  }

  // --- Stage 5: views ---
  const stage5Scopes = new Map<string, (EngramDiagnostic | ArchiDsDiagnostic)[]>();
  const projectedViews: { readonly spec: ArchiViewSpec; readonly sourceView: NativeViewDocument; readonly binding: ArchiProjectionBinding }[] = [];

  for (const spec of viewSpecs) {
    const viewScope = spec.viewId;
    const projBinding: ArchiProjectionBinding = {
      activeHierarchy: spec.activeHierarchy,
      language: manifest.language,
      contractPin: CONTRACT_PIN,
      cardsPin: manifest.cardsPin!,
      ...(spec.legend ? { legendRef: spec.legend.legendRef } : {}),
    };
    const rawSourceView = buildArchiSourceView(doc, spec, CONTRACT_PIN);
    const proj = projectArchiCards(doc, rawSourceView, projBinding, cardsContent);
    if (proj.outcome === "refused") {
      addDiagToScope(stage5Scopes, viewScope, ...proj.diagnostics);
      continue;
    }
    let sourceView: NativeViewDocument = {
      ...rawSourceView,
      presentation: {
        ...rawSourceView.presentation,
        diagram: proj.diagram as unknown as NativeDiagramPresentation,
      },
    };
    if (seamPorts.transformProjectedView) {
      sourceView = seamPorts.transformProjectedView(sourceView, spec);
    }

    const viewShapeErr = checkGovernedViewShape("2", sourceView);
    if (viewShapeErr !== null) {
      addDiagToScope(
        stage5Scopes,
        viewScope,
        makeArchiDiagnostic(
          "archi-input-invalid",
          dottedPathToPointer(viewShapeErr),
          spec.viewId,
          `Derived source view ${spec.viewId} failed checkGovernedViewShape("2") at ${viewShapeErr || "<root>"}.`,
        ),
      );
      continue;
    }

    const dsViewDiags = ds.validateView(sourceView, doc, dsOpts).map(toArchiDsDiagnostic);
    const dsPresDiags = ds.validateDiagramPresentation(doc, sourceView, dsOpts).map(toArchiDsDiagnostic);
    const archiViewDiags = checkArchiView(doc, sourceView, projBinding, ds);
    addDiagToScope(stage5Scopes, viewScope, ...dsViewDiags, ...dsPresDiags, ...archiViewDiags);

    projectedViews.push({ spec, sourceView, binding: projBinding });
  }

  if (stage5Scopes.size > 0) {
    return makeRefusal("views", stage5Scopes);
  }

  // --- Stage 6: fold-states (3 + C states per view) ---
  const stage6Scopes = new Map<string, (EngramDiagnostic | ArchiDsDiagnostic)[]>();
  for (const { spec, sourceView, binding } of projectedViews) {
    const containers = spec.draw
      .filter((entityId) => ARCHI_CONTAINER_KINDS.has(doc.entities[entityId]?.type ?? ""))
      .map(archiOccurrenceRef)
      .sort();
    const defaultCollapsed = spec.collapsed.map(archiOccurrenceRef).sort();
    const defaultSet = new Set<string>(defaultCollapsed);

    const states: { readonly key: string; readonly collapsedIds: readonly string[] }[] = [
      { key: "default", collapsedIds: defaultCollapsed },
      { key: "expanded", collapsedIds: [] },
      { key: "collapsed", collapsedIds: containers },
      ...containers.map((occ) => ({
        key: `toggle:${occ}`,
        collapsedIds: defaultSet.has(occ)
          ? defaultCollapsed.filter((x) => x !== occ)
          : [...defaultCollapsed, occ].sort(),
      })),
    ];

    for (const st of states) {
      const foldScope = `${spec.viewId}/${st.key}`;
      const summaryLabels = archiSummaries(doc, sourceView, st.collapsedIds, ds, manifest.language, cardsContent);
      const { summaryLabels: _old, ...bare } = sourceView;
      void _old;
      const withSummaries = Object.keys(summaryLabels).length > 0 ? { ...bare, summaryLabels } : bare;
      const displayed = ds.projectView(doc, withSummaries, st.collapsedIds);

      const dsFoldViewDiags = ds.validateView(displayed, doc, dsOpts).map(toArchiDsDiagnostic);
      const dsFoldPresDiags = ds.validateDiagramPresentation(doc, displayed, dsOpts).map(toArchiDsDiagnostic);
      const archiFoldViewDiags = checkArchiView(doc, displayed, binding, ds);
      addDiagToScope(stage6Scopes, foldScope, ...dsFoldViewDiags, ...dsFoldPresDiags, ...archiFoldViewDiags);
    }
  }

  if (stage6Scopes.size > 0) {
    return makeRefusal("fold-states", stage6Scopes);
  }

  // --- Stage 7 & 8: versioning & record ---
  const docLocal = doc.documentId.slice("document:".length);
  const revision = doc.revision;
  const directory = `architecture/${docLocal}/r${revision}`;
  const documentPin: Pin = {
    id: doc.documentId,
    version: String(revision),
    contentDigest: digestOfPreimage(doc),
  };
  const semanticCategoryPins: readonly Pin[] = manifest.profilePins.filter((p) => p.id === "generic");

  const nonAcceptanceValues: Record<string, unknown> = {
    "manifest.json": manifest,
    "document.json": doc,
  };
  const bindingPins: Pin[] = [];

  for (const { spec, sourceView } of projectedViews) {
    const viewLocal = spec.viewId.slice("view:".length);
    const viewPin: Pin = {
      id: spec.viewId,
      version: String(revision),
      contentDigest: digestOfPreimage(sourceView),
    };
    const viewBinding: ArchiViewBinding = {
      viewId: spec.viewId,
      activeHierarchy: spec.activeHierarchy,
      language: manifest.language,
      documentPin,
      viewPin,
      profilePins: manifest.profilePins,
      semanticCategoryPins,
      ...(spec.legend ? { legendRef: spec.legend.legendRef } : {}),
      viewSchemaPin: manifest.viewSchemaPin,
      cardsPin: manifest.cardsPin!,
      presentationContractPin: CONTRACT_PIN,
      dsCommit: DS_COMMIT,
    };
    const bindingPin: Pin = {
      id: `binding:${viewLocal}`,
      version: String(revision),
      contentDigest: digestOfPreimage(viewBinding),
    };
    bindingPins.push(bindingPin);
    nonAcceptanceValues[`view-specs/${viewLocal}.json`] = spec;
    nonAcceptanceValues[`views/${viewLocal}.json`] = sourceView;
    nonAcceptanceValues[`bindings/${viewLocal}.json`] = viewBinding;
  }

  const recomputedNonAcceptanceBytes: Record<string, string> = {};
  for (const [relPath, val] of Object.entries(nonAcceptanceValues)) {
    recomputedNonAcceptanceBytes[relPath] = canonicalBytes(val);
  }

  // Stage 7: check if r<revision> already exists
  const existingFiles = readExistingFromWriter(ports.write, directory);
  if (existingFiles !== null && existingFiles !== undefined) {
    const recomputedPaths = Object.keys(recomputedNonAcceptanceBytes).sort();
    const existingNonAccPaths = Object.keys(existingFiles)
      .filter((p) => p !== "acceptance.json")
      .sort();
    const samePaths =
      recomputedPaths.length === existingNonAccPaths.length &&
      recomputedPaths.every((p, idx) => p === existingNonAccPaths[idx]);
    const sameBytes =
      samePaths &&
      recomputedPaths.every((p) => recomputedNonAcceptanceBytes[p] === existingFiles[p]);
    const existingAccRaw = existingFiles["acceptance.json"];

    if (sameBytes && typeof existingAccRaw === "string") {
      const parsedAcc = parseStrictIJson(existingAccRaw);
      if (parsedAcc.ok && checkArchiAcceptanceShape(parsedAcc.value) === null) {
        const storedAcc = parsedAcc.value as ArchiAcceptance;
        return {
          outcome: "accepted",
          directory,
          acceptance: storedAcc,
          acceptanceDigest: digestOfPreimage(storedAcc),
          idempotent: true,
          files: { ...existingFiles },
        };
      }
    }

    const conflictDiag = makeArchiDiagnostic(
      "archi-revision-conflict",
      "/revision",
      `${doc.documentId}@${revision}`,
      `Accepted directory "${directory}" already exists with different bytes; raise document.revision to publish a modified description (§5.3 stage 7, §5.4).`,
    );
    return makeRefusal("versioning", new Map([["document", [conflictDiag]]]));
  }

  // Stage 8: write acceptance record
  if (seamPorts.cardsContent !== undefined || seamPorts.transformProjectedView !== undefined) {
    const firstViewId = viewSpecs[0]?.viewId ?? "view:unknown";
    return makeRefusal(
      "views",
      new Map([
        [
          firstViewId,
          [
            makeArchiDiagnostic(
              "archi-slot-drift",
              "/transformProjectedView",
              firstViewId,
              "Test-injection seams cannot produce an accepted record (§5.3, §5.6.1).",
            ),
          ],
        ],
      ]),
    );
  }
  const sortedFileEntries: ArchiAcceptanceFileEntry[] = Object.keys(nonAcceptanceValues)
    .sort()
    .map((p) => ({
      path: p,
      contentDigest: digestOfPreimage(nonAcceptanceValues[p]),
    }));
  const sortedBindingPins = [...bindingPins].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const acceptance: ArchiAcceptance = {
    format: "engram.archi-acceptance/1",
    source: {
      repository: input.repository,
      commit: input.commit,
      manifestPath: ARCHI_MANIFEST_PATH,
    },
    language: manifest.language,
    owningRepo: manifest.owningRepo,
    documentPin,
    profilePins: manifest.profilePins,
    cardsPin: manifest.cardsPin!,
    viewSchemaPin: manifest.viewSchemaPin,
    bindings: sortedBindingPins,
    files: sortedFileEntries,
  };

  const allFiles: Record<string, string> = {
    ...recomputedNonAcceptanceBytes,
    "acceptance.json": canonicalBytes(acceptance),
  };

  invokeWriter(ports.write, directory, allFiles);

  return {
    outcome: "accepted",
    directory,
    acceptance,
    acceptanceDigest: digestOfPreimage(acceptance),
    idempotent: false,
    files: allFiles,
  };
}

/** proposed: input for Focus binding verification (§5.4, §5.5). */
export interface ArchiVerifyBindingInput {
  readonly document: NativeSemanticDocument;
  readonly view: NativeViewDocument;
  readonly binding: ArchiViewBinding;
  readonly ds?: ArchiDsPort;
  readonly collapsedIds?: readonly string[];
  readonly cardsContent?: ArchiCardsContent;
}

/**
 * Focus verification of a stored ArchiViewBinding against resolved document and view bytes (§5.4, §5.5):
 * - Pin mismatches refuse at stage "pins", scope "binding:<view local>" with `archi-pin-mismatch`
 * - Recomputed faces, tint tables or summaries differing from received bytes refuse at stage "views",
 *   scope "binding:<view local>" with `archi-slot-drift`
 */
export function verifyArchiBinding(
  input: ArchiVerifyBindingInput,
): { readonly outcome: "ok" } | ArchiRefusal {
  const { document, view, binding } = input;
  const rawViewId = typeof binding?.viewId === "string" && binding.viewId.length > 0 ? binding.viewId : "view:unknown";
  const viewLocal = rawViewId.startsWith("view:")
    ? rawViewId.slice("view:".length)
    : rawViewId;
  const scope = `binding:${viewLocal}`;

  const shapeErr = checkArchiViewBindingShape(binding);
  if (shapeErr !== null) {
    return makeRefusal(
      "pins",
      new Map([
        [
          scope,
          [
            makeArchiDiagnostic(
              "archi-pin-mismatch",
              shapeErr,
              rawViewId,
              `Invalid ArchiViewBinding shape at ${shapeErr || "<root>"}.`,
            ),
          ],
        ],
      ]),
    );
  }

  const pinDiags: EngramDiagnostic[] = [];

  if (
    binding.documentPin.id !== document.documentId ||
    binding.documentPin.version !== String(document.revision) ||
    binding.documentPin.contentDigest !== digestOfPreimage(document)
  ) {
    pinDiags.push(
      makeArchiDiagnostic(
        "archi-pin-mismatch",
        "/documentPin",
        `${binding.documentPin.id}@${binding.documentPin.version}`,
        "binding.documentPin does not match resolved document bytes.",
      ),
    );
  }

  if (
    binding.viewPin.id !== view.viewId ||
    binding.viewPin.version !== String(view.revision) ||
    binding.viewPin.contentDigest !== digestOfPreimage(view)
  ) {
    pinDiags.push(
      makeArchiDiagnostic(
        "archi-pin-mismatch",
        "/viewPin",
        `${binding.viewPin.id}@${binding.viewPin.version}`,
        "binding.viewPin does not match resolved view bytes.",
      ),
    );
  }

  if (
    binding.cardsPin.id !== ARCHI_CARDS_PIN.id ||
    binding.cardsPin.version !== ARCHI_CARDS_PIN.version ||
    binding.cardsPin.contentDigest !== ARCHI_CARDS_PIN.contentDigest
  ) {
    pinDiags.push(
      makeArchiDiagnostic(
        "archi-pin-mismatch",
        "/cardsPin",
        `${binding.cardsPin.id}@${binding.cardsPin.version}`,
        "binding.cardsPin does not match governed ARCHI_CARDS_PIN.",
      ),
    );
  }

  if (
    binding.viewSchemaPin.id !== DIAGRAM_VIEW_SCHEMA_V2.pin.id ||
    binding.viewSchemaPin.version !== DIAGRAM_VIEW_SCHEMA_V2.pin.version ||
    binding.viewSchemaPin.contentDigest !== DIAGRAM_VIEW_SCHEMA_V2.pin.contentDigest
  ) {
    pinDiags.push(
      makeArchiDiagnostic(
        "archi-pin-mismatch",
        "/viewSchemaPin",
        `${binding.viewSchemaPin.id}@${binding.viewSchemaPin.version}`,
        "binding.viewSchemaPin does not match governed DIAGRAM_VIEW_SCHEMA_V2.",
      ),
    );
  }

  if (
    binding.presentationContractPin.id !== CONTRACT_PIN.id ||
    binding.presentationContractPin.version !== CONTRACT_PIN.version ||
    binding.presentationContractPin.contentDigest !== CONTRACT_PIN.contentDigest
  ) {
    pinDiags.push(
      makeArchiDiagnostic(
        "archi-pin-mismatch",
        "/presentationContractPin",
        `${binding.presentationContractPin.id}@${binding.presentationContractPin.version}`,
        "binding.presentationContractPin does not match governed CONTRACT_PIN.",
      ),
    );
  }

  if (binding.dsCommit !== DS_COMMIT) {
    pinDiags.push(
      makeArchiDiagnostic(
        "archi-pin-mismatch",
        "/dsCommit",
        binding.dsCommit,
        "binding.dsCommit does not match governed DS_COMMIT.",
      ),
    );
  }

  if (pinDiags.length > 0) {
    return makeRefusal("pins", new Map([[scope, pinDiags]]));
  }

  // Recompute faces and tint tables via projectArchiCards
  const cards = input.cardsContent ?? ARCHI_CARDS_CONTENT;
  const projBinding: ArchiProjectionBinding = {
    activeHierarchy: binding.activeHierarchy,
    language: binding.language,
    contractPin: binding.presentationContractPin,
    cardsPin: binding.cardsPin,
    ...(binding.legendRef ? { legendRef: binding.legendRef } : {}),
  };
  const recomputedProj = projectArchiCards(document, view, projBinding, cards);
  const driftDiags: EngramDiagnostic[] = [];

  if (
    recomputedProj.outcome !== "ok" ||
    !view.presentation.diagram ||
    digestOfPreimage(recomputedProj.diagram) !== digestOfPreimage(view.presentation.diagram)
  ) {
    driftDiags.push(
      makeArchiDiagnostic(
        "archi-slot-drift",
        "/presentation/diagram",
        binding.viewId,
        `Stored presentation.diagram on ${binding.viewId} differs from recomputed projectArchiCards under pinned archi-cards@1.`,
      ),
    );
  }

  if (input.ds && input.collapsedIds !== undefined) {
    const recomputedSummaries = archiSummaries(
      document,
      view,
      input.collapsedIds,
      input.ds,
      binding.language,
      cards,
    );
    if (digestOfPreimage(recomputedSummaries) !== digestOfPreimage(view.summaryLabels ?? {})) {
      driftDiags.push(
        makeArchiDiagnostic(
          "archi-slot-drift",
          "/summaryLabels",
          binding.viewId,
          `Stored summaryLabels on ${binding.viewId} differ from recomputed archiSummaries.`,
        ),
      );
    }
  }

  if (driftDiags.length > 0) {
    return makeRefusal("views", new Map([[scope, driftDiags]]));
  }

  return { outcome: "ok" };
}

export const verifyArchiViewBinding = verifyArchiBinding;

/**
 * Creates a git-backed `readAt` port that reads committed blobs only via `git show <commit>:<path>` (§5.1).
 * Uncommitted working-tree files are never read.
 */
export function createGitReadAt(repositoryPath: string): ArchiReadAtPort {
  return (commit: string, relPath: string): Uint8Array | null => {
    if (!COMMIT_HEX_RE.test(commit)) {
      throw new Error(`Invalid commit SHA "${commit}"`);
    }
    // Verify commit object exists and is reachable in repositoryPath
    execFileSync("git", ["-C", repositoryPath, "cat-file", "-e", `${commit}^{commit}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const buf = execFileSync("git", ["-C", repositoryPath, "show", `${commit}:${relPath}`], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      return null;
    }
  };
}

function readDirectoryFilesRecursive(rootDir: string, currentRel = ""): Record<string, string> {
  const out: Record<string, string> = {};
  const absDir = currentRel ? join(rootDir, currentRel) : rootDir;
  for (const entry of readdirSync(absDir)) {
    const rel = currentRel ? `${currentRel}/${entry}` : entry;
    const abs = join(rootDir, rel);
    const st = statSync(abs);
    if (st.isDirectory()) {
      Object.assign(out, readDirectoryFilesRecursive(rootDir, rel));
    } else if (st.isFile()) {
      out[rel] = readFileSync(abs, "utf8");
    }
  }
  return out;
}

/**
 * Creates an atomic filesystem writer port under `outputRoot` (§5.3 stage 8, §5.4):
 * writes all files into a sibling temporary directory, then performs one atomic `renameSync`.
 * Any failure cleans up the temporary directory and leaves no target directory.
 */
export function createAtomicArchiWriter(
  outputRoot: string,
  options?: { readonly beforeRename?: () => void },
): ArchiWriterFn {
  const readExisting = (directory: string): Readonly<Record<string, string>> | null => {
    const targetDir = join(outputRoot, directory);
    if (!existsSync(targetDir)) return null;
    return readDirectoryFilesRecursive(targetDir);
  };

  const writeFn = ((directory: string, files: Readonly<Record<string, string>>): void => {
    const targetDir = join(outputRoot, directory);
    const parentDir = dirname(targetDir);
    mkdirSync(parentDir, { recursive: true });
    const tmpDir = join(parentDir, `.tmp-archi-${randomBytes(8).toString("hex")}`);
    mkdirSync(tmpDir, { recursive: true });
    try {
      for (const [relPath, content] of Object.entries(files)) {
        const fileAbs = join(tmpDir, relPath);
        mkdirSync(dirname(fileAbs), { recursive: true });
        writeFileSync(fileAbs, content, "utf8");
      }
      options?.beforeRename?.();
      renameSync(tmpDir, targetDir);
    } catch (err) {
      rmSync(tmpDir, { recursive: true, force: true });
      throw err;
    }
  }) as ArchiWriterFn;

  writeFn.readExisting = readExisting;
  return writeFn;
}

/**
 * Creates an in-memory atomic writer port for unit tests (§6.1).
 */
export function createMemoryArchiWriter(): ArchiMemoryWriterPort {
  const directories = new Map<string, Readonly<Record<string, string>>>();
  let count = 0;

  const fn = ((directory: string, files: Readonly<Record<string, string>>): void => {
    count += 1;
    directories.set(directory, { ...files });
  }) as unknown as ArchiMemoryWriterPort;

  Object.defineProperties(fn, {
    directories: { get: () => directories, enumerable: true },
    writeCount: { get: () => count, enumerable: true },
    readExisting: {
      value: (directory: string) => directories.get(directory) ?? null,
      enumerable: true,
    },
  });

  return fn;
}
