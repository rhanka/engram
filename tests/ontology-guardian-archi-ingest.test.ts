// archi@1 ingestion pipeline (stages 1–8), all 25 §5.5 diagnostic codes, Focus binding verification, atomic writer and E2E git commit ingestion
// (spec/SPEC_EVOL_ARCHI_CARDS.md §5.1–§5.6, §6.1–§6.2).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalBytes, digestOfPreimage } from "../src/ontology-guardian/canonical.js";
import { sortDiagnostics, validPointer } from "../src/ontology-guardian/diagnostics.js";
import type { NativeSemanticDocument, NativeViewDocument } from "../src/ontology-guardian/diagram-native-types.js";
import {
  DS_ADAPTER_SHA256,
  DS_COMMIT,
  DS_RENDERER_SHA256,
} from "../src/ontology-guardian/diagram-presentation-pins.js";
import {
  ARCHI_DIAGNOSTIC_CODES,
  type ArchiDiagnosticCode,
  type ArchiManifest,
} from "../src/ontology-guardian/archi-check.js";
import type { ArchiCardsContent } from "../src/ontology-guardian/archi-cards-data.js";
import {
  archiOccurrenceRef,
  type ArchiViewSpec,
} from "../src/ontology-guardian/archi-view.js";
import {
  ARCHI_MANIFEST_PATH,
  assertValidArchiDiagnosticEnvelope,
  checkArchiAcceptanceShape,
  checkArchiViewBindingShape,
  parseStrictIJson,
  type ArchiAcceptance,
  type ArchiViewBinding,
} from "../src/ontology-guardian/archi-shapes.js";
import {
  createAtomicArchiWriter,
  createGitReadAt,
  createMemoryArchiWriter,
  ingestArchitecture,
  verifyArchiBinding,
  type ArchiIngestDsPort,
  type ArchiIngestPorts,
} from "../src/ontology-guardian/archi-ingest.js";
import { dsCloneAvailable, dsSkipReason, loadDsDiagramCore } from "./helpers/ds-executor.js";

interface ArchiIngestTestPorts extends ArchiIngestPorts {
  readonly cardsContent?: ArchiCardsContent;
  readonly transformProjectedView?: (view: NativeViewDocument, spec: ArchiViewSpec) => NativeViewDocument;
}

const testsDir = dirname(fileURLToPath(import.meta.url));
const readText = (rel: string): string => readFileSync(join(testsDir, "fixtures", "archi", rel), "utf8");
const readJson = <T>(rel: string): T => JSON.parse(readText(rel)) as T;
const toRepoRelativeManifest = (m: ArchiManifest): ArchiManifest => ({
  ...m,
  document: m.document.startsWith(".engram/architecture/") ? m.document : `.engram/architecture/${m.document}`,
  views: m.views.map((v) => (v.startsWith(".engram/architecture/") ? v : `.engram/architecture/${v}`)),
});

const FIX_MANIFEST = toRepoRelativeManifest(readJson<ArchiManifest>("joint-r2/manifest.json"));
const FIX_DOC = readJson<NativeSemanticDocument>("joint-r2/document.json");
const ROLES_SPEC = readJson<ArchiViewSpec>("joint-r2/view-specs/roles.json");
const ROLES_REPLIE_SPEC = readJson<ArchiViewSpec>("joint-r2/view-specs/roles-replie.json");
const DEPLOIEMENT_SPEC = readJson<ArchiViewSpec>("joint-r2/view-specs/deploiement.json");
const H2A_REPO_SPEC = readJson<ArchiViewSpec>("joint-r2/view-specs/h2a-repo.json");

const TINT_MANIFEST = toRepoRelativeManifest(readJson<ArchiManifest>("joint-r2-teintes/manifest.json"));
const TINT_DOC = readJson<NativeSemanticDocument>("joint-r2-teintes/document.json");
const ROLES_TEINTES_SPEC = readJson<ArchiViewSpec>("joint-r2-teintes/view-specs/roles-teintes.json");

const HO_MANIFEST = toRepoRelativeManifest(readJson<ArchiManifest>("hosts-r3/manifest.json"));
const HO_DOC = readJson<NativeSemanticDocument>("hosts-r3/document.json");
const ROLES_HOSTS_SPEC = readJson<ArchiViewSpec>("hosts-r3/view-specs/roles-hosts.json");
const DEPLOIEMENT_HOSTS_SPEC = readJson<ArchiViewSpec>("hosts-r3/view-specs/deploiement-hosts.json");

const COMMIT_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const COMMIT_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function buildFakeFiles(overrides?: {
  manifest?: unknown;
  document?: unknown;
  roles?: unknown;
  includeAllViews?: boolean;
}): Record<string, string> {
  const useAll = overrides?.includeAllViews ?? false;
  const manifest =
    overrides?.manifest ??
    (useAll
      ? FIX_MANIFEST
      : {
          ...FIX_MANIFEST,
          views: [".engram/architecture/view-specs/roles.json"],
        });
  const doc = overrides?.document ?? FIX_DOC;
  const roles = overrides?.roles ?? ROLES_SPEC;
  const out: Record<string, string> = {
    [ARCHI_MANIFEST_PATH]: typeof manifest === "string" ? manifest : canonicalBytes(manifest),
    ".engram/architecture/document.json": typeof doc === "string" ? doc : canonicalBytes(doc),
    ".engram/architecture/view-specs/roles.json": typeof roles === "string" ? roles : canonicalBytes(roles),
  };
  if (useAll) {
    out[".engram/architecture/view-specs/deploiement.json"] = canonicalBytes(DEPLOIEMENT_SPEC);
    out[".engram/architecture/view-specs/h2a-repo.json"] = canonicalBytes(H2A_REPO_SPEC);
    out[".engram/architecture/view-specs/roles-replie.json"] = canonicalBytes(ROLES_REPLIE_SPEC);
  }
  return out;
}

function createFakeDsPort(overrides?: Partial<ArchiIngestDsPort>): ArchiIngestDsPort {
  return {
    commit: DS_COMMIT,
    adapterSha256: DS_ADAPTER_SHA256,
    rendererSha256: DS_RENDERER_SHA256,
    validateProfile: () => [],
    verifyExecutorBindings: () => [],
    validateDocument: () => [],
    validateView: () => [],
    validateDiagramPresentation: () => [],
    createProfileRegistry: (profiles) => ({ profiles }),
    bindingRowFor: (profile: any, mechanismId: string) => ({
      profileId: profile.id,
      version: profile.version,
      mechanismId,
    }),
    projectView: (_doc, view, collapsedIds) => {
      const collapsedSet = new Set(collapsedIds);
      const groups: Record<string, any> = {};
      for (const [gid, g] of Object.entries(view.groups)) {
        const grp = g as { id: string; collapsed: boolean; occurrence?: string };
        groups[gid] = {
          ...grp,
          collapsed: Boolean(grp.occurrence && collapsedSet.has(grp.occurrence)),
        };
      }
      return { ...view, groups };
    },
    classifyInternalRelations: () => new Set<string>(),
    analyzeSummaries: (view) => {
      const actives = new Map<string, unknown>();
      for (const s of Object.values(view.summaryLabels ?? {})) {
        const sum = s as { sourceOccurrence: string; targetOccurrence: string; strokeStyle?: string };
        const style = sum.strokeStyle ?? "solid";
        const key = `(${sum.sourceOccurrence},${sum.targetOccurrence},${style})`;
        actives.set(key, { ...sum, key });
      }
      return { actives, sourceIssues: [], conflicts: [] };
    },
    ...overrides,
  };
}

describe("archi@1 ingestion stages 1–8 and full 25-code §5.5 coverage (tier E)", () => {
  it("reaches every single one of the 25 codes in ARCHI_DIAGNOSTIC_CODES across stages 1–7 and Focus verification (§5.3, §5.5, §6.1)", () => {
    const reached = new Set<ArchiDiagnosticCode>();
    const recordRefusal = (res: ReturnType<typeof ingestArchitecture> | ReturnType<typeof verifyArchiBinding>) => {
      expect(res.outcome).toBe("refused");
      if (res.outcome !== "refused") return;
      expect(res.scopes.length).toBeGreaterThan(0);
      const scopeNames = res.scopes.map((s) => s.scope);
      expect(scopeNames).toEqual([...scopeNames].sort());
      for (const sc of res.scopes) {
        expect(sc.diagnostics.length).toBeGreaterThan(0);
        expect(sc.diagnostics).toEqual(sortDiagnostics(sc.diagnostics));
        for (const d of sc.diagnostics) {
          assertValidArchiDiagnosticEnvelope(d);
          if (d.origin === "engram") {
            expect(validPointer(d.path!)).toBe(true);
            reached.add(d.code as ArchiDiagnosticCode);
          }
        }
      }
    };

    const ds = createFakeDsPort();

    // 1. archi-manifest-missing (Stage 1: source)
    const rMissing = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      { readAt: () => null, ds, write: createMemoryArchiWriter() },
    );
    expect(rMissing).toMatchObject({ outcome: "refused", stage: "source" });
    recordRefusal(rMissing);

    // 2. archi-manifest-invalid (Stage 1: source)
    const rManifestInvalid = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      {
        readAt: (_c, p) => (p === ARCHI_MANIFEST_PATH ? '{"format":"wrong"}' : null),
        ds,
        write: createMemoryArchiWriter(),
      },
    );
    expect(rManifestInvalid).toMatchObject({ outcome: "refused", stage: "source" });
    recordRefusal(rManifestInvalid);

    // 3. archi-source-unresolved (Stage 1: source — bad commit & missing document path)
    const rBadCommit = ingestArchitecture(
      { repository: "repo", commit: "not-a-40-hex-commit" },
      { readAt: () => null, ds, write: createMemoryArchiWriter() },
    );
    expect(rBadCommit).toMatchObject({ outcome: "refused", stage: "source" });
    recordRefusal(rBadCommit);

    const filesMissingDoc = buildFakeFiles();
    delete filesMissingDoc[".engram/architecture/document.json"];
    const rMissingDoc = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      { readAt: (_c, p) => filesMissingDoc[p] ?? null, ds, write: createMemoryArchiWriter() },
    );
    expect(rMissingDoc).toMatchObject({ outcome: "refused", stage: "source" });
    recordRefusal(rMissingDoc);

    // 4. archi-input-invalid (Stage 1: source — owningRepo not a repo, non-container in collapsed)
    const filesBadOwning = buildFakeFiles({
      manifest: { ...FIX_MANIFEST, owningRepo: "entity:sys-h2a", views: [".engram/architecture/view-specs/roles.json"] },
      roles: { ...ROLES_SPEC, collapsed: ["entity:api-h2a", ...ROLES_SPEC.collapsed].sort() },
    });
    const rInputInvalid = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      { readAt: (_c, p) => filesBadOwning[p] ?? null, ds, write: createMemoryArchiWriter() },
    );
    expect(rInputInvalid).toMatchObject({ outcome: "refused", stage: "source" });
    recordRefusal(rInputInvalid);

    // 5. incompatible_version (Stage 2: pins)
    const filesBadVer = buildFakeFiles({
      manifest: {
        ...FIX_MANIFEST,
        views: [".engram/architecture/view-specs/roles.json"],
        cardsPin: { ...FIX_MANIFEST.cardsPin!, version: "99" },
      },
    });
    const rIncompatVer = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      { readAt: (_c, p) => filesBadVer[p] ?? null, ds, write: createMemoryArchiWriter() },
    );
    expect(rIncompatVer).toMatchObject({ outcome: "refused", stage: "pins" });
    recordRefusal(rIncompatVer);

    // 6. digest-mismatch (Stage 2: pins)
    const filesBadDigest = buildFakeFiles({
      manifest: {
        ...FIX_MANIFEST,
        views: [".engram/architecture/view-specs/roles.json"],
        viewSchemaPin: { ...FIX_MANIFEST.viewSchemaPin, contentDigest: "0".repeat(64) },
      },
    });
    const rDigestMismatch = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      { readAt: (_c, p) => filesBadDigest[p] ?? null, ds, write: createMemoryArchiWriter() },
    );
    expect(rDigestMismatch).toMatchObject({ outcome: "refused", stage: "pins" });
    recordRefusal(rDigestMismatch);

    // 7. archi-pin-mismatch (Stage 2: pins — generic@2 omitted while document has generic@2)
    const filesPinMismatch = buildFakeFiles({
      manifest: { ...FIX_MANIFEST, views: [".engram/architecture/view-specs/roles.json"] },
      document: { ...TINT_DOC, profileRefs: ["archi@1"] },
    });
    const rPinMismatch = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      { readAt: (_c, p) => filesPinMismatch[p] ?? null, ds, write: createMemoryArchiWriter() },
    );
    expect(rPinMismatch).toMatchObject({ outcome: "refused", stage: "pins" });
    recordRefusal(rPinMismatch);

    // 8. archi-executor-unavailable (Stage 3: executor — hash mismatch)
    const filesOk = buildFakeFiles();
    const rExecUnavail = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      {
        readAt: (_c, p) => filesOk[p] ?? null,
        ds: createFakeDsPort({ adapterSha256: "f".repeat(64) }),
        write: createMemoryArchiWriter(),
      },
    );
    expect(rExecUnavail).toMatchObject({ outcome: "refused", stage: "executor" });
    recordRefusal(rExecUnavail);

    // 9–13. Stage 4 (document): archi-source-conflict, archi-footer-missing, archi-single-writer, archi-execution-unbound, archi-edge-verb
    const docStage4 = structuredClone(FIX_DOC) as Record<string, any>;
    // archi-source-conflict: pkg-h2a (partOf sys-h2a in repo-h2a) given managedIn repo-engram
    docStage4["relations"]["relation:mi-conflict"] = {
      id: "relation:mi-conflict",
      profile: "archi@1",
      type: "managedIn",
      endpoints: [
        { role: "source", target: "entity:pkg-h2a" },
        { role: "target", target: "entity:repo-engram" },
      ],
      attributes: {},
    };
    // archi-footer-missing: remove ownedBy for repo-engram
    delete docStage4["relations"]["relation:ob-repo-engram"];
    // archi-single-writer: add second writer to single-writer store st-events
    docStage4["relations"]["relation:ac-second-writer"] = {
      id: "relation:ac-second-writer",
      profile: "archi@1",
      type: "accesses",
      endpoints: [
        { role: "source", target: "entity:rt-h2a" },
        { role: "target", target: "entity:st-events" },
      ],
      attributes: {
        mode: { kind: "enum", value: "write" },
        label: { kind: "text", value: "écrit dans · doublon" },
      },
    };
    // archi-execution-unbound: remove da-h2a so ex-control is unbound
    delete docStage4["relations"]["relation:da-h2a"];
    // archi-edge-verb: bad verb on ca-h2a-memory
    docStage4["relations"]["relation:ca-h2a-memory"]["attributes"]["label"]["value"] =
      "mauvais verbe · test";

    const filesStage4 = buildFakeFiles({ document: docStage4 });
    const rStage4 = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      { readAt: (_c, p) => filesStage4[p] ?? null, ds, write: createMemoryArchiWriter() },
    );
    expect(rStage4).toMatchObject({ outcome: "refused", stage: "document" });
    recordRefusal(rStage4);

    // 14–18. Stage 5 (projection): archi-slot-missing, archi-detail-missing, archi-category-unbound, card-overflow, zone-overflow
    const docStage5Proj = structuredClone(FIX_DOC) as Record<string, any>;
    // archi-slot-missing: remove role from sys-h2a
    delete docStage5Proj["entities"]["entity:sys-h2a"]["attributes"]["role"];
    // archi-detail-missing: remove runsOn for rt-h2a (ro-h2a)
    delete docStage5Proj["relations"]["relation:ro-h2a"];
    // archi-category-unbound: add category on rt-claude without legendRef on view
    docStage5Proj["entities"]["entity:rt-claude"]["attributes"]["category"] = {
      kind: "text",
      value: "alimentation",
    };
    // card-overflow: huge unbreakable word in role of rt-codex
    docStage5Proj["entities"]["entity:rt-codex"]["attributes"]["role"]["value"] =
      "W".repeat(80);
    // zone-overflow: huge name on pkg-track (folded in collapsed or kicker overflow)
    docStage5Proj["entities"]["entity:pkg-track"]["attributes"]["name"]["value"] =
      "Z".repeat(80);

    const filesStage5Proj = buildFakeFiles({ document: docStage5Proj });
    const rStage5Proj = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      { readAt: (_c, p) => filesStage5Proj[p] ?? null, ds, write: createMemoryArchiWriter() },
    );
    expect(rStage5Proj).toMatchObject({ outcome: "refused", stage: "views" });
    recordRefusal(rStage5Proj);

    // 19–22. Stage 5 (view checks V1–V4): archi-occurrence-duplicate, archi-zone-mismatch, archi-edge-policy, archi-stroke-status
    const testPortsStage5: ArchiIngestTestPorts = {
      readAt: (_c, p) => filesOk[p] ?? null,
      ds,
      write: createMemoryArchiWriter(),
      transformProjectedView: (view) => {
        const mutated = structuredClone(view) as Record<string, any>;
        // V1: duplicate occurrence of entity:rt-h2a
        mutated["entityOccurrences"]["occurrence:o-rt-h2a-dup"] = {
          ...mutated["entityOccurrences"][archiOccurrenceRef("entity:rt-h2a")],
          id: "occurrence:o-rt-h2a-dup",
        };
        // V2: wrong group on occurrence:o-rt-track
        mutated["entityOccurrences"][archiOccurrenceRef("entity:rt-track")]["group"] = "grp.9.o-sys-h2a";
        // V3: detail relation drawn as arrow (relation:pa-h2a is providesApi = detail)
        mutated["relationOccurrences"]["occurrence:e-pa-h2a"] = {
          id: "occurrence:e-pa-h2a",
          relation: "relation:pa-h2a",
          endpoints: [
            { role: "source", occurrence: archiOccurrenceRef("entity:pkg-h2a") },
            { role: "target", occurrence: archiOccurrenceRef("entity:api-h2a") },
          ],
        };
        // V4: proposed relation drawn solid (relation:ca-h2a-memory is proposed)
        delete mutated["relationOccurrences"]["occurrence:e-ca-h2a-memory"]["strokeStyle"];
        return mutated as NativeViewDocument;
      },
    };
    const rStage5ViewChecks = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      testPortsStage5,
    );
    expect(rStage5ViewChecks).toMatchObject({ outcome: "refused", stage: "views" });
    recordRefusal(rStage5ViewChecks);

    // 23. Stage 6 (fold-states V5): archi-summary-missing
    const dsSummaryMissing = createFakeDsPort({
      classifyInternalRelations: (_view, _doc, collapsedSet) => {
        // When folded, pretend no relations are internal, and mark a relationOccurrence as projected
        return collapsedSet.size > 0 ? new Set<string>() : new Set<string>();
      },
      projectView: (_doc, view, collapsedIds) => {
        const collapsedSet = new Set(collapsedIds);
        const groups: Record<string, any> = {};
        for (const [gid, g] of Object.entries(view.groups)) {
          const grp = g as { id: string; collapsed: boolean; occurrence?: string };
          groups[gid] = {
            ...grp,
            collapsed: Boolean(grp.occurrence && collapsedSet.has(grp.occurrence)),
          };
        }
        if (collapsedSet.size === 0) return { ...view, groups };
        // Add a projected endpoint on an arrow relationOccurrence
        const relOccs = structuredClone(view.relationOccurrences) as Record<string, any>;
        const firstKey = Object.keys(relOccs)[0]!;
        relOccs[firstKey] = {
          ...relOccs[firstKey],
          endpoints: [
            { ...relOccs[firstKey].endpoints[0], semanticTarget: "entity:api-memory" },
            relOccs[firstKey].endpoints[1],
          ],
        };
        return { ...view, groups, relationOccurrences: relOccs, summaryLabels: {} };
      },
      analyzeSummaries: () => ({ actives: new Map(), sourceIssues: [], conflicts: [] }),
    });
    const rStage6 = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      { readAt: (_c, p) => filesOk[p] ?? null, ds: dsSummaryMissing, write: createMemoryArchiWriter() },
    );
    expect(rStage6).toMatchObject({ outcome: "refused", stage: "fold-states" });
    recordRefusal(rStage6);

    // 24. Focus verification: archi-slot-drift & archi-pin-mismatch on binding:<view local>
    const writerAccept = createMemoryArchiWriter();
    const accepted = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      { readAt: (_c, p) => filesOk[p] ?? null, ds, write: writerAccept },
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome === "accepted") {
      const storedView = JSON.parse(accepted.files["views/roles.json"]!) as NativeViewDocument;
      const storedBinding = JSON.parse(accepted.files["bindings/roles.json"]!) as ArchiViewBinding;

      // Valid binding passes
      expect(verifyArchiBinding({ document: FIX_DOC, view: storedView, binding: storedBinding })).toEqual({
        outcome: "ok",
      });

      // Mutate face text while recomputing viewPin so pin matches but slot drifts -> archi-slot-drift
      const driftedView = structuredClone(storedView) as Record<string, any>;
      driftedView["presentation"]["diagram"]["entities"][archiOccurrenceRef("entity:sys-h2a")]["text"]["body"] =
        "Drifted slot text";
      const driftedBinding: ArchiViewBinding = {
        ...storedBinding,
        viewPin: {
          ...storedBinding.viewPin,
          contentDigest: digestOfPreimage(driftedView),
        },
      };
      const rSlotDrift = verifyArchiBinding({
        document: FIX_DOC,
        view: driftedView as NativeViewDocument,
        binding: driftedBinding,
      });
      expect(rSlotDrift).toMatchObject({ outcome: "refused", stage: "views" });
      if (rSlotDrift.outcome === "refused") {
        expect(rSlotDrift.scopes[0]!.scope).toBe("binding:roles");
      }
      recordRefusal(rSlotDrift);

      // Mutate binding documentPin -> archi-pin-mismatch on binding:roles
      const badPinBinding: ArchiViewBinding = {
        ...storedBinding,
        documentPin: { ...storedBinding.documentPin, contentDigest: "0".repeat(64) },
      };
      const rBindingPinMismatch = verifyArchiBinding({
        document: FIX_DOC,
        view: storedView,
        binding: badPinBinding,
      });
      expect(rBindingPinMismatch).toMatchObject({ outcome: "refused", stage: "pins" });
      if (rBindingPinMismatch.outcome === "refused") {
        expect(rBindingPinMismatch.scopes[0]!.scope).toBe("binding:roles");
      }
      recordRefusal(rBindingPinMismatch);
    }

    // 25. Stage 7 (versioning): archi-revision-conflict when r0 exists with different content
    const modifiedDoc = structuredClone(FIX_DOC);
    (modifiedDoc.entities["entity:sys-h2a"]!.attributes["role"] as { value: string }).value =
      "Rôle modifié sans incrémenter la révision";
    const filesModifiedSameRev = buildFakeFiles({ document: modifiedDoc });
    const rRevConflict = ingestArchitecture(
      { repository: "repo", commit: COMMIT_B },
      { readAt: (_c, p) => filesModifiedSameRev[p] ?? null, ds, write: writerAccept },
    );
    expect(rRevConflict).toMatchObject({ outcome: "refused", stage: "versioning" });
    recordRefusal(rRevConflict);

    // Every single one of the 25 codes in ARCHI_DIAGNOSTIC_CODES was reached!
    expect([...reached].sort()).toEqual([...ARCHI_DIAGNOSTIC_CODES].sort());

    // Any DS finding refuses, warnings included (§5.5 line 407)
    const rDsWarn = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      {
        readAt: (_c, p) => filesOk[p] ?? null,
        ds: createFakeDsPort({
          validateDocument: () => [
            {
              code: "legend-key-parent-invalid",
              severity: "warning",
              path: "relations.relation:ct-cross",
              message: "DS warning refuses ingestion.",
            },
          ],
        }),
        write: createMemoryArchiWriter(),
      },
    );
    expect(rDsWarn).toMatchObject({ outcome: "refused", stage: "executor" });
    if (rDsWarn.outcome === "refused") {
      expect(rDsWarn.scopes[0]!.diagnostics[0]).toMatchObject({
        origin: "diagram-core",
        code: "legend-key-parent-invalid",
        nativeCode: "legend-key-parent-invalid",
        severity: "warning",
        subjectRef: "relations.relation:ct-cross",
      });
    }
  });

  it("stage 1 reads only the manifest-named repo-relative path and ignores unnamed sibling files (§5.1, §5.2)", () => {
    const ds = createFakeDsPort();

    // 1. Manifest names repo-root "document.json" and "view-specs/roles.json", while only unnamed
    //    siblings under ".engram/architecture/" exist -> refuses with archi-source-unresolved.
    const rootNamedManifest: ArchiManifest = {
      ...FIX_MANIFEST,
      document: "document.json",
      views: ["view-specs/roles.json"],
    };
    const unnamedPrefixedOnly: Record<string, string> = {
      [ARCHI_MANIFEST_PATH]: canonicalBytes(rootNamedManifest),
      ".engram/architecture/document.json": canonicalBytes(FIX_DOC),
      ".engram/architecture/view-specs/roles.json": canonicalBytes(ROLES_SPEC),
    };
    const rUnresolved = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      { readAt: (_c, p) => unnamedPrefixedOnly[p] ?? null, ds, write: createMemoryArchiWriter() },
    );
    expect(rUnresolved).toMatchObject({ outcome: "refused", stage: "source" });
    if (rUnresolved.outcome === "refused") {
      expect(rUnresolved.scopes[0]!.diagnostics.map((d) => ({ code: d.code, path: d.path }))).toEqual([
        { code: "archi-source-unresolved", path: "/document" },
        { code: "archi-source-unresolved", path: "/views/0" },
      ]);
    }

    // 2. Manifest names ".engram/architecture/document.json" and ".engram/architecture/view-specs/roles.json",
    //    while corrupt unnamed siblings exist both at repo root and in ".engram/architecture/" -> ignored and accepted.
    const filesWithUnnamedSiblings: Record<string, string> = {
      ...buildFakeFiles(),
      "document.json": "{ corrupt root sibling document",
      "view-specs/roles.json": "{ corrupt root sibling view",
      ".engram/architecture/sibling-ignored.json": "{ corrupt sibling in archi dir",
      ".engram/architecture/view-specs/sibling-view.json": "{ corrupt sibling in view-specs dir",
    };
    const rAcceptedPrefixed = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      { readAt: (_c, p) => filesWithUnnamedSiblings[p] ?? null, ds, write: createMemoryArchiWriter() },
    );
    expect(rAcceptedPrefixed.outcome).toBe("accepted");

    // 3. Manifest names "document.json" and "view-specs/roles.json" with valid bytes at repo root,
    //    while corrupt unnamed siblings sit at ".engram/architecture/document.json" and
    //    ".engram/architecture/view-specs/roles.json" -> unnamed siblings are ignored and ingestion accepts.
    const filesRootNamedWithCorruptArchiSiblings: Record<string, string> = {
      [ARCHI_MANIFEST_PATH]: canonicalBytes(rootNamedManifest),
      "document.json": canonicalBytes(FIX_DOC),
      "view-specs/roles.json": canonicalBytes(ROLES_SPEC),
      ".engram/architecture/document.json": "{ corrupt unnamed sibling under .engram/architecture",
      ".engram/architecture/view-specs/roles.json": "{ corrupt unnamed sibling view under .engram/architecture",
    };
    const rAcceptedRoot = ingestArchitecture(
      { repository: "repo", commit: COMMIT_A },
      { readAt: (_c, p) => filesRootNamedWithCorruptArchiSiblings[p] ?? null, ds, write: createMemoryArchiWriter() },
    );
    expect(rAcceptedRoot.outcome).toBe("accepted");
  });

  it("atomic write rollback: a failing write leaves no target directory and no temporary directory on disk (§5.3 stage 8, §6.1)", () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "archi-atomic-fail-"));
    const collectEntriesRecursive = (dir: string): string[] => {
      if (!existsSync(dir)) return [];
      const names: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        names.push(entry.name);
        if (entry.isDirectory()) {
          names.push(...collectEntriesRecursive(join(dir, entry.name)));
        }
      }
      return names;
    };
    try {
      const filesOk = buildFakeFiles();
      const ds = createFakeDsPort();
      const failingWriter = createAtomicArchiWriter(tmpRoot, {
        beforeRename: () => {
          throw new Error("Simulated crash before atomic rename");
        },
      });

      expect(() =>
        ingestArchitecture(
          { repository: "repo", commit: COMMIT_A },
          { readAt: (_c, p) => filesOk[p] ?? null, ds, write: failingWriter },
        ),
      ).toThrow(/Simulated crash before atomic rename/);

      const docDir = join(tmpRoot, "architecture", "archi-joint");
      const r0Dir = join(docDir, "r0");
      expect(existsSync(r0Dir)).toBe(false);
      if (existsSync(docDir)) {
        expect(readdirSync(docDir)).toEqual([]);
      }
      const allEntries = collectEntriesRecursive(tmpRoot);
      expect(allEntries.filter((name) => name.startsWith(".tmp-archi-"))).toEqual([]);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!dsCloneAvailable())(
  `archi@1 end-to-end git commit ingestion with real DS executor (tier DS)${dsSkipReason()}`,
  () => {
    it("ingests joint-r2, joint-r2-teintes and hosts-r3 end-to-end from temporary git repository commits, enforces idempotence and refuses working-tree-only edits (§5.1–§5.6, §6.1)", async () => {
      const ds = (await loadDsDiagramCore()) as unknown as ArchiIngestDsPort;
      const tmpDir = mkdtempSync(join(tmpdir(), "archi-e2e-git-"));
      const repoDir = join(tmpDir, "repo");
      const outDir = join(tmpDir, "engram-out");
      mkdirSync(repoDir, { recursive: true });
      mkdirSync(outDir, { recursive: true });

      const git = (...args: string[]): string =>
        execFileSync("git", ["-C", repoDir, ...args], { encoding: "utf8" }).trim();

      try {
        git("init", "-q");
        git("config", "user.name", "Archi Test");
        git("config", "user.email", "archi@test.local");
        git("config", "advice.ignoredHook", "false");

        const archiDir = join(repoDir, ".engram", "architecture");
        const viewSpecsDir = join(archiDir, "view-specs");
        mkdirSync(viewSpecsDir, { recursive: true });

        // Commit 1 (r0): joint-r2 fixture
        writeFileSync(join(archiDir, "manifest.json"), JSON.stringify(FIX_MANIFEST, null, 2), "utf8");
        writeFileSync(join(archiDir, "document.json"), readText("joint-r2/document.json"), "utf8");
        for (const vf of ["deploiement.json", "h2a-repo.json", "roles-replie.json", "roles.json"]) {
          writeFileSync(join(viewSpecsDir, vf), readText(`joint-r2/view-specs/${vf}`), "utf8");
        }
        git("add", ".");
        git("commit", "-q", "-m", "feat: archi joint-r2 (r0)");
        const commitR0 = git("rev-parse", "HEAD");
        expect(commitR0).toMatch(/^[0-9a-f]{40}$/);

        // Dirty the working tree with invalid JSON to prove working tree is NEVER read (§5.1)
        writeFileSync(join(archiDir, "manifest.json"), "{ invalid working tree json", "utf8");

        const readAt = createGitReadAt(repoDir);
        const writer = createAtomicArchiWriter(outDir);

        const resR0 = ingestArchitecture(
          { repository: repoDir, commit: commitR0 },
          { readAt, ds, write: writer },
        );
        expect(resR0.outcome).toBe("accepted");
        if (resR0.outcome !== "accepted") return;

        expect(resR0.idempotent).toBe(false);
        expect(resR0.directory).toBe("architecture/archi-joint/r0");
        const r0DiskDir = join(outDir, resR0.directory);
        expect(existsSync(r0DiskDir)).toBe(true);

        // Verify all expected files exist on disk as canonicalBytes (no BOM, no trailing newline)
        const expectedR0Paths = [
          "acceptance.json",
          "bindings/deploiement.json",
          "bindings/h2a-repo.json",
          "bindings/roles-replie.json",
          "bindings/roles.json",
          "document.json",
          "manifest.json",
          "view-specs/deploiement.json",
          "view-specs/h2a-repo.json",
          "view-specs/roles-replie.json",
          "view-specs/roles.json",
          "views/deploiement.json",
          "views/h2a-repo.json",
          "views/roles-replie.json",
          "views/roles.json",
        ];
        expect(Object.keys(resR0.files).sort()).toEqual(expectedR0Paths);

        for (const relPath of expectedR0Paths) {
          const diskBytes = readFileSync(join(r0DiskDir, relPath), "utf8");
          expect(diskBytes).toBe(resR0.files[relPath]);
          expect(diskBytes.endsWith("\n")).toBe(false);
          const parsed = parseStrictIJson(diskBytes);
          expect(parsed.ok).toBe(true);
          if (parsed.ok) {
            expect(canonicalBytes(parsed.value)).toBe(diskBytes);
          }
        }

        // Verify acceptance.json closed shape and digests
        const acc = JSON.parse(readFileSync(join(r0DiskDir, "acceptance.json"), "utf8")) as ArchiAcceptance;
        expect(checkArchiAcceptanceShape(acc)).toBeNull();
        expect(acc.source).toEqual({
          repository: repoDir,
          commit: commitR0,
          manifestPath: ARCHI_MANIFEST_PATH,
        });
        expect(acc.bindings.map((b) => b.id)).toEqual([
          "binding:deploiement",
          "binding:h2a-repo",
          "binding:roles",
          "binding:roles-replie",
        ]);
        expect(acc.files.map((f) => f.path)).toEqual(
          expectedR0Paths.filter((p) => p !== "acceptance.json"),
        );
        for (const f of acc.files) {
          const parsed = JSON.parse(readFileSync(join(r0DiskDir, f.path), "utf8")) as unknown;
          expect(digestOfPreimage(parsed)).toBe(f.contentDigest);
        }

        // Verify each stored binding passes Focus verification
        const storedDoc = JSON.parse(readFileSync(join(r0DiskDir, "document.json"), "utf8")) as NativeSemanticDocument;
        for (const viewLocal of ["deploiement", "h2a-repo", "roles", "roles-replie"]) {
          const v = JSON.parse(readFileSync(join(r0DiskDir, `views/${viewLocal}.json`), "utf8")) as NativeViewDocument;
          const b = JSON.parse(readFileSync(join(r0DiskDir, `bindings/${viewLocal}.json`), "utf8")) as ArchiViewBinding;
          expect(checkArchiViewBindingShape(b)).toBeNull();
          expect(verifyArchiBinding({ document: storedDoc, view: v, binding: b, ds })).toEqual({
            outcome: "ok",
          });
        }

        // Idempotent re-ingestion of commitR0 returns stored acceptance and writes nothing
        const resR0Again = ingestArchitecture(
          { repository: repoDir, commit: commitR0 },
          { readAt, ds, write: writer },
        );
        expect(resR0Again).toEqual({
          ...resR0,
          idempotent: true,
        });

        // Commit 2 (r1): joint-r2-teintes fixture (with revision raised to 1)
        rmSync(viewSpecsDir, { recursive: true, force: true });
        mkdirSync(viewSpecsDir, { recursive: true });
        writeFileSync(join(archiDir, "manifest.json"), JSON.stringify(TINT_MANIFEST, null, 2), "utf8");
        writeFileSync(
          join(archiDir, "document.json"),
          JSON.stringify({ ...TINT_DOC, revision: 1 }, null, 2),
          "utf8",
        );
        writeFileSync(
          join(viewSpecsDir, "roles-teintes.json"),
          readText("joint-r2-teintes/view-specs/roles-teintes.json"),
          "utf8",
        );
        git("add", "-A");
        git("commit", "-q", "-m", "feat: archi joint-r2-teintes (r1)");
        const commitR1 = git("rev-parse", "HEAD");

        const resR1 = ingestArchitecture(
          { repository: repoDir, commit: commitR1 },
          { readAt, ds, write: writer },
        );
        expect(resR1.outcome).toBe("accepted");
        if (resR1.outcome === "accepted") {
          expect(resR1.directory).toBe("architecture/archi-joint/r1");
          const tintBinding = JSON.parse(resR1.files["bindings/roles-teintes.json"]!) as ArchiViewBinding;
          expect(tintBinding.semanticCategoryPins).toHaveLength(1);
          expect(tintBinding.semanticCategoryPins[0]!.id).toBe("generic");
          expect(tintBinding.legendRef).toBe("entity:legend-memoire");
        }

        // Commit 3 (r2): hosts-r3 fixture (with revision raised to 2)
        rmSync(viewSpecsDir, { recursive: true, force: true });
        mkdirSync(viewSpecsDir, { recursive: true });
        writeFileSync(join(archiDir, "manifest.json"), JSON.stringify(HO_MANIFEST, null, 2), "utf8");
        writeFileSync(
          join(archiDir, "document.json"),
          JSON.stringify({ ...HO_DOC, revision: 2 }, null, 2),
          "utf8",
        );
        for (const vf of ["deploiement-hosts.json", "roles-hosts.json"]) {
          writeFileSync(join(viewSpecsDir, vf), readText(`hosts-r3/view-specs/${vf}`), "utf8");
        }
        git("add", "-A");
        git("commit", "-q", "-m", "feat: archi hosts-r3 (r2)");
        const commitR2 = git("rev-parse", "HEAD");

        const resR2 = ingestArchitecture(
          { repository: repoDir, commit: commitR2 },
          { readAt, ds, write: writer },
        );
        expect(resR2.outcome).toBe("accepted");
        if (resR2.outcome === "accepted") {
          expect(resR2.directory).toBe("architecture/archi-joint/r2");
          expect(existsSync(join(outDir, "architecture/archi-joint/r2/acceptance.json"))).toBe(true);
        }
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  },
);
