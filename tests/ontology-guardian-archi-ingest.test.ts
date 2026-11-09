// archi@1 ingestion pipeline (stages 1–8), all 25 §5.5 diagnostic codes, Focus binding verification, atomic writer and E2E git commit ingestion
// (spec/SPEC_EVOL_ARCHI_CARDS.md §5.1–§5.6, §6.1–§6.2).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalBytes, digestOfPreimage } from "../src/ontology-guardian/canonical.js";
import { sortDiagnostics, validPointer } from "../src/ontology-guardian/diagnostics.js";
import type { NativeSemanticDocument, NativeViewDocument } from "../src/ontology-guardian/diagram-native-types.js";
import {
  DS_ADAPTER_SHA256, DS_COMMIT, DS_RENDERER_SHA256,
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
  ARCHI_MANIFEST_PATH, ARCHI_MMD_PATH,
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
import { printArchiMermaid } from "../src/archi-mermaid/index.js";
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

    // Every single one of the 25 JSON-mode codes in ARCHI_DIAGNOSTIC_CODES was reached!
    expect([...reached].sort()).toEqual(
      ARCHI_DIAGNOSTIC_CODES.filter(
        (c) =>
          !c.startsWith("mermaid-strict-") &&
          c !== "carrier-digest-mismatch" &&
          c !== "export-stale" &&
          c !== "archimate-kind-missing",
      ).sort(),
    );

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

    it("M1: ingests joint-r2 (r0), joint-r2-teintes (r1), and hosts-r3 (r2) end-to-end from a git repository holding ONLY .engram/architecture/architecture.mmd, matches JSON-ingested pins/files, and passes verifyArchiBinding (§5.1–§5.4, §6.2)", async () => {
      const ds = (await loadDsDiagramCore()) as unknown as ArchiIngestDsPort;
      const tmpDir = mkdtempSync(join(tmpdir(), "archi-e2e-mmd-git-"));
      const repoDir = join(tmpDir, "repo-mmd");
      const outDirMmd = join(tmpDir, "engram-out-mmd");
      const outDirJson = join(tmpDir, "engram-out-json");
      mkdirSync(repoDir, { recursive: true });
      mkdirSync(outDirMmd, { recursive: true });
      mkdirSync(outDirJson, { recursive: true });

      const git = (...args: string[]): string =>
        execFileSync("git", ["-C", repoDir, ...args], { encoding: "utf8" }).trim();
      const sha256Hex = (s: string): string => createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");

      try {
        git("init", "-q");
        git("config", "user.name", "Archi Test");
        git("config", "user.email", "archi@test.local");
        git("config", "advice.ignoredHook", "false");

        const archiDir = join(repoDir, ".engram", "architecture");
        mkdirSync(archiDir, { recursive: true });

        // Commit 1 (r0): joint-r2 fixture (.mmd only, zero JSON files in git)
        const mmdR0 = readText("joint-r2/architecture.mmd");
        writeFileSync(join(archiDir, "architecture.mmd"), mmdR0, "utf8");
        git("add", ".");
        git("commit", "-q", "-m", "feat: archi joint-r2 mmd (r0)");
        const commitR0 = git("rev-parse", "HEAD");
        expect(git("ls-files").split("\n")).toEqual([ARCHI_MMD_PATH]);

        // Dirty working tree to prove committed git blob is read exclusively (§5.1)
        writeFileSync(join(archiDir, "architecture.mmd"), "corrupt working tree mmd", "utf8");

        const readAt = createGitReadAt(repoDir);
        const writerMmd = createAtomicArchiWriter(outDirMmd);

        const resR0 = ingestArchitecture(
          { repository: repoDir, commit: commitR0 },
          { readAt, ds, write: writerMmd },
        );
        expect(resR0.outcome).toBe("accepted");
        if (resR0.outcome !== "accepted") return;

        expect(resR0.idempotent).toBe(false);
        expect(resR0.directory).toBe("architecture/archi-joint/r0");
        expect(resR0.acceptance.source).toEqual({
          repository: repoDir,
          commit: commitR0,
          manifestPath: ARCHI_MMD_PATH,
        });
        expect(resR0.acceptance.textDigest).toBe(sha256Hex(mmdR0));
        expect(checkArchiAcceptanceShape(resR0.acceptance)).toBeNull();

        // Cross-format parity with JSON ingestion of joint-r2 (M3 / C5)
        const rawFixManifest = readJson<ArchiManifest>("joint-r2/manifest.json");
        const jsonR0Files: Record<string, string> = {
          [ARCHI_MANIFEST_PATH]: canonicalBytes(rawFixManifest),
          "document.json": canonicalBytes(FIX_DOC),
          "view-specs/deploiement.json": canonicalBytes(DEPLOIEMENT_SPEC),
          "view-specs/h2a-repo.json": canonicalBytes(H2A_REPO_SPEC),
          "view-specs/roles-replie.json": canonicalBytes(ROLES_REPLIE_SPEC),
          "view-specs/roles.json": canonicalBytes(ROLES_SPEC),
        };
        const resJsonR0 = ingestArchitecture(
          { repository: repoDir, commit: commitR0 },
          {
            readAt: (_c, p) => jsonR0Files[p] ?? null,
            ds,
            write: createAtomicArchiWriter(outDirJson),
          },
        );
        expect(resJsonR0.outcome).toBe("accepted");
        if (resJsonR0.outcome === "accepted") {
          expect(resR0.acceptance.documentPin).toEqual(resJsonR0.acceptance.documentPin);
          expect(resR0.acceptance.bindings).toEqual(resJsonR0.acceptance.bindings);
          expect(resR0.acceptance.files).toEqual(resJsonR0.acceptance.files);
          for (const f of resR0.acceptance.files) {
            expect(resR0.files[f.path]).toBe(resJsonR0.files[f.path]);
          }
        }

        // Verify each stored binding passes Focus verifyArchiBinding
        const r0DiskDir = join(outDirMmd, resR0.directory);
        const storedDocR0 = JSON.parse(readFileSync(join(r0DiskDir, "document.json"), "utf8")) as NativeSemanticDocument;
        for (const viewLocal of ["deploiement", "h2a-repo", "roles", "roles-replie"]) {
          const v = JSON.parse(readFileSync(join(r0DiskDir, `views/${viewLocal}.json`), "utf8")) as NativeViewDocument;
          const b = JSON.parse(readFileSync(join(r0DiskDir, `bindings/${viewLocal}.json`), "utf8")) as ArchiViewBinding;
          expect(checkArchiViewBindingShape(b)).toBeNull();
          expect(verifyArchiBinding({ document: storedDocR0, view: v, binding: b, ds })).toEqual({ outcome: "ok" });
        }

        // Idempotent re-ingestion of commitR0 returns stored acceptance and writes nothing
        const resR0Again = ingestArchitecture(
          { repository: repoDir, commit: commitR0 },
          { readAt, ds, write: writerMmd },
        );
        expect(resR0Again).toEqual({
          ...resR0,
          idempotent: true,
        });

        // Commit 2 (r1): joint-r2-teintes (.mmd only, with revision raised to 1)
        const printedR1 = printArchiMermaid({
          manifest: readJson<ArchiManifest>("joint-r2-teintes/manifest.json"),
          document: { ...TINT_DOC, revision: 1 },
          views: [ROLES_TEINTES_SPEC],
        });
        expect(printedR1.ok).toBe(true);
        if (!printedR1.ok) return;
        const mmdR1 = printedR1.value;
        writeFileSync(join(archiDir, "architecture.mmd"), mmdR1, "utf8");
        git("add", "-A");
        git("commit", "-q", "-m", "feat: archi joint-r2-teintes mmd (r1)");
        const commitR1 = git("rev-parse", "HEAD");
        expect(git("ls-files").split("\n")).toEqual([ARCHI_MMD_PATH]);

        const resR1 = ingestArchitecture(
          { repository: repoDir, commit: commitR1 },
          { readAt, ds, write: writerMmd },
        );
        expect(resR1.outcome).toBe("accepted");
        if (resR1.outcome === "accepted") {
          expect(resR1.directory).toBe("architecture/archi-joint/r1");
          expect(resR1.acceptance.source.manifestPath).toBe(ARCHI_MMD_PATH);
          expect(resR1.acceptance.textDigest).toBe(sha256Hex(mmdR1));
          expect(checkArchiAcceptanceShape(resR1.acceptance)).toBeNull();
          const r1DiskDir = join(outDirMmd, resR1.directory);
          const storedDocR1 = JSON.parse(readFileSync(join(r1DiskDir, "document.json"), "utf8")) as NativeSemanticDocument;
          const v1 = JSON.parse(readFileSync(join(r1DiskDir, "views/roles-teintes.json"), "utf8")) as NativeViewDocument;
          const b1 = JSON.parse(readFileSync(join(r1DiskDir, "bindings/roles-teintes.json"), "utf8")) as ArchiViewBinding;
          expect(verifyArchiBinding({ document: storedDocR1, view: v1, binding: b1, ds })).toEqual({ outcome: "ok" });
        }

        // Commit 3 (r2): hosts-r3 (.mmd only, with revision raised to 2)
        const printedR2 = printArchiMermaid({
          manifest: readJson<ArchiManifest>("hosts-r3/manifest.json"),
          document: { ...HO_DOC, revision: 2 },
          views: [DEPLOIEMENT_HOSTS_SPEC, ROLES_HOSTS_SPEC],
        });
        expect(printedR2.ok).toBe(true);
        if (!printedR2.ok) return;
        const mmdR2 = printedR2.value;
        writeFileSync(join(archiDir, "architecture.mmd"), mmdR2, "utf8");
        git("add", "-A");
        git("commit", "-q", "-m", "feat: archi hosts-r3 mmd (r2)");
        const commitR2 = git("rev-parse", "HEAD");
        expect(git("ls-files").split("\n")).toEqual([ARCHI_MMD_PATH]);

        const resR2 = ingestArchitecture(
          { repository: repoDir, commit: commitR2 },
          { readAt, ds, write: writerMmd },
        );
        expect(resR2.outcome).toBe("accepted");
        if (resR2.outcome === "accepted") {
          expect(resR2.directory).toBe("architecture/archi-joint/r2");
          expect(resR2.acceptance.source.manifestPath).toBe(ARCHI_MMD_PATH);
          expect(resR2.acceptance.textDigest).toBe(sha256Hex(mmdR2));
          expect(checkArchiAcceptanceShape(resR2.acceptance)).toBeNull();
          const r2DiskDir = join(outDirMmd, resR2.directory);
          const storedDocR2 = JSON.parse(readFileSync(join(r2DiskDir, "document.json"), "utf8")) as NativeSemanticDocument;
          for (const viewLocal of ["deploiement-hosts", "roles-hosts"]) {
            const v2 = JSON.parse(readFileSync(join(r2DiskDir, `views/${viewLocal}.json`), "utf8")) as NativeViewDocument;
            const b2 = JSON.parse(readFileSync(join(r2DiskDir, `bindings/${viewLocal}.json`), "utf8")) as ArchiViewBinding;
            expect(verifyArchiBinding({ document: storedDocR2, view: v2, binding: b2, ds })).toEqual({ outcome: "ok" });
          }
        }
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  },
);

describe("archi@1 strict Mermaid (.mmd) ingestion M2 & M3 (tier E)", () => {
  const ds = createFakeDsPort();
  const baseMmd = readText("joint-r2-teintes/architecture.mmd");
  const sha256Hex = (bytes: Uint8Array | string): string =>
    createHash("sha256")
      .update(typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes)
      .digest("hex");

  it("M2: reaches all 9 parse/check mermaid-strict-* codes and invalid UTF-8 / BOM through ingestArchitecture with zero writes (§5.3, §5.5, §6.2)", () => {
    const reachedMmdCodes = new Set<ArchiDiagnosticCode>();

    const expectMmdSourceRefusal = (
      rawMmd: Uint8Array | string,
      expectedCode: ArchiDiagnosticCode,
      expectedPath?: string,
    ) => {
      const writer = createMemoryArchiWriter();
      const readCalls: string[] = [];
      const res = ingestArchitecture(
        { repository: "repo-mmd", commit: COMMIT_A },
        {
          readAt: (_commit, path) => {
            readCalls.push(path);
            return path === ARCHI_MMD_PATH ? rawMmd : null;
          },
          ds,
          write: writer,
        },
      );
      expect(res.outcome).toBe("refused");
      expect(writer.writeCount).toBe(0);
      expect(readCalls).toEqual([ARCHI_MMD_PATH]);
      if (res.outcome !== "refused") return;

      expect(res.stage).toBe("source");
      expect(res.scopes).toHaveLength(1);
      expect(res.scopes[0]!.scope).toBe(`file:${ARCHI_MMD_PATH}`);
      expect(res.scopes[0]!.diagnostics.length).toBeGreaterThan(0);
      expect(res.scopes[0]!.diagnostics).toEqual(sortDiagnostics(res.scopes[0]!.diagnostics));
      for (const d of res.scopes[0]!.diagnostics) {
        assertValidArchiDiagnosticEnvelope(d);
        expect(d.origin).toBe("engram");
        expect(d.subjectRef).toBe(ARCHI_MMD_PATH);
        expect(validPointer(d.path!)).toBe(true);
        reachedMmdCodes.add(d.code as ArchiDiagnosticCode);
      }
      expect(res.scopes[0]!.diagnostics[0]!.code).toBe(expectedCode);
      if (expectedPath !== undefined) {
        expect(res.scopes[0]!.diagnostics[0]!.path).toBe(expectedPath);
      }
    };

    // Step 1(a): invalid UTF-8 bytes, UTF-8 BOM (Uint8Array and string), lone surrogate -> mermaid-strict-invalid at /0
    expectMmdSourceRefusal(new Uint8Array([0xff, 0xfe, 0xfd]), "mermaid-strict-invalid", "/0");
    expectMmdSourceRefusal(
      new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from(baseMmd, "utf8")]),
      "mermaid-strict-invalid",
      "/0",
    );
    expectMmdSourceRefusal(`\uFEFF${baseMmd}`, "mermaid-strict-invalid", "/0");
    expectMmdSourceRefusal(`\uD800${baseMmd}`, "mermaid-strict-invalid", "/0");

    // Step 1(b): all 9 parse/check mermaid-strict-* codes
    // 1. mermaid-strict-invalid (lexical tab)
    expectMmdSourceRefusal(baseMmd.replace("flowchart LR", "flowchart\tLR"), "mermaid-strict-invalid", "/0");
    // 2. mermaid-strict-unsupported
    expectMmdSourceRefusal(baseMmd.replace("flowchart LR", "flowchart TB"), "mermaid-strict-unsupported", "/0");
    // 3. mermaid-strict-annotation-unknown
    expectMmdSourceRefusal(
      baseMmd.replace("%% @dl language fr", "%% @dl language fr\n%% @dl bogus value"),
      "mermaid-strict-annotation-unknown",
    );
    // 4. mermaid-strict-duplicate
    expectMmdSourceRefusal(
      baseMmd.replace("%% @dl language fr", "%% @dl language fr\n%% @dl language en"),
      "mermaid-strict-duplicate",
    );
    // 5. mermaid-strict-duplicate-datum
    expectMmdSourceRefusal(
      baseMmd.replace("%% @dl entity system", '%% @dl entity system\n%% @dl name "Track"'),
      "mermaid-strict-duplicate-datum",
    );
    // 6. mermaid-strict-orphan-ref
    expectMmdSourceRefusal(
      baseMmd.replace("%% @dl owning-repo e_repo_h2a", "%% @dl owning-repo e_repo_unknown"),
      "mermaid-strict-orphan-ref",
    );
    // 7. mermaid-strict-placement-drift
    expectMmdSourceRefusal(
      baseMmd.replace('subgraph e_host_poste["Poste de travail"]\nend', 'e_host_poste["Poste de travail"]'),
      "mermaid-strict-placement-drift",
    );
    // 8. mermaid-strict-style-drift
    expectMmdSourceRefusal(
      baseMmd.replace(
        'e_pkg_track -->|"déployé comme"| e_rt_track',
        'e_pkg_track -.->|"déployé comme"| e_rt_track',
      ),
      "mermaid-strict-style-drift",
    );
    // 9. mermaid-strict-noncanonical (trailing blank line)
    expectMmdSourceRefusal(`${baseMmd}\n`, "mermaid-strict-noncanonical");

    expect([...reachedMmdCodes].sort()).toEqual([
      "mermaid-strict-annotation-unknown",
      "mermaid-strict-duplicate",
      "mermaid-strict-duplicate-datum",
      "mermaid-strict-invalid",
      "mermaid-strict-noncanonical",
      "mermaid-strict-orphan-ref",
      "mermaid-strict-placement-drift",
      "mermaid-strict-style-drift",
      "mermaid-strict-unsupported",
    ]);

    // Step 1(c): Stage-1 shape/cross-ref guards on parsed .mmd triple without secondary readAt calls
    // Omitting `pin cards` in a canonical .mmd refuses with archi-manifest-invalid at /cardsPin (§5.2)
    const mmdWithoutCardsPin = baseMmd.replace(/%% @dl pin cards [^\n]+\n/, "");
    expectMmdSourceRefusal(mmdWithoutCardsPin, "archi-manifest-invalid", "/cardsPin");

    // Unsupported language ('de') in a canonical .mmd refuses with archi-manifest-invalid at /language
    const mmdBadLang = baseMmd.replace("%% @dl language fr", "%% @dl language de");
    expectMmdSourceRefusal(mmdBadLang, "archi-manifest-invalid", "/language");

    // owning-repo pointing to a non-repo entity (e_sys_h2a) in a canonical .mmd refuses with archi-input-invalid at /owningRepo
    const mmdBadOwning = baseMmd.replace("%% @dl owning-repo e_repo_h2a", "%% @dl owning-repo e_sys_h2a");
    const writerOwning = createMemoryArchiWriter();
    const resOwning = ingestArchitecture(
      { repository: "repo-mmd", commit: COMMIT_A },
      {
        readAt: (_c, p) => (p === ARCHI_MMD_PATH ? mmdBadOwning : null),
        ds,
        write: writerOwning,
      },
    );
    expect(resOwning).toMatchObject({
      outcome: "refused",
      stage: "source",
      scopes: [
        {
          scope: `file:${ARCHI_MMD_PATH}`,
          diagnostics: [
            expect.objectContaining({
              code: "archi-input-invalid",
              path: "/owningRepo",
              subjectRef: "entity:sys-h2a",
            }),
          ],
        },
      ],
    });
    expect(writerOwning.writeCount).toBe(0);
  });

  it("M3: pins textDigest, matches JSON-ingested pins/files across all 3 fixtures, enforces T3 .mmd precedence, and verifies Stage 7 idempotence & conflict (§5.1, §5.3, §5.4, §6.2)", () => {
    const fixtureCases: readonly {
      readonly name: string;
      readonly mmdRel: string;
      readonly jsonFiles: Readonly<Record<string, string>>;
    }[] = [
      {
        name: "joint-r2",
        mmdRel: "joint-r2/architecture.mmd",
        jsonFiles: {
          [ARCHI_MANIFEST_PATH]: readText("joint-r2/manifest.json"),
          "document.json": readText("joint-r2/document.json"),
          "view-specs/deploiement.json": readText("joint-r2/view-specs/deploiement.json"),
          "view-specs/h2a-repo.json": readText("joint-r2/view-specs/h2a-repo.json"),
          "view-specs/roles-replie.json": readText("joint-r2/view-specs/roles-replie.json"),
          "view-specs/roles.json": readText("joint-r2/view-specs/roles.json"),
        },
      },
      {
        name: "joint-r2-teintes",
        mmdRel: "joint-r2-teintes/architecture.mmd",
        jsonFiles: {
          [ARCHI_MANIFEST_PATH]: readText("joint-r2-teintes/manifest.json"),
          "document.json": readText("joint-r2-teintes/document.json"),
          "view-specs/roles-teintes.json": readText("joint-r2-teintes/view-specs/roles-teintes.json"),
        },
      },
      {
        name: "hosts-r3",
        mmdRel: "hosts-r3/architecture.mmd",
        jsonFiles: {
          [ARCHI_MANIFEST_PATH]: readText("hosts-r3/manifest.json"),
          "document.json": readText("hosts-r3/document.json"),
          "view-specs/deploiement-hosts.json": readText("hosts-r3/view-specs/deploiement-hosts.json"),
          "view-specs/roles-hosts.json": readText("hosts-r3/view-specs/roles-hosts.json"),
        },
      },
    ];

    for (const fc of fixtureCases) {
      const mmdText = readText(fc.mmdRel);
      const mmdBytes = new Uint8Array(Buffer.from(mmdText, "utf8"));
      const expectedTextDigest = sha256Hex(mmdBytes);

      // Ingest via .mmd (as Uint8Array) while corrupt manifest.json also exists (T3 precedence: .mmd wins)
      const writerMmd = createMemoryArchiWriter();
      const readPaths: string[] = [];
      const resMmd = ingestArchitecture(
        { repository: `repo-${fc.name}`, commit: COMMIT_A },
        {
          readAt: (_c, p) => {
            readPaths.push(p);
            if (p === ARCHI_MMD_PATH) return mmdBytes;
            if (p === ARCHI_MANIFEST_PATH) return "{ corrupt manifest ignored when .mmd exists";
            return null;
          },
          ds,
          write: writerMmd,
        },
      );
      expect(resMmd.outcome).toBe("accepted");
      expect(readPaths).toEqual([ARCHI_MMD_PATH]);

      // Ingest via T3 JSON fallback (.mmd absent)
      const writerJson = createMemoryArchiWriter();
      const resJson = ingestArchitecture(
        { repository: `repo-${fc.name}`, commit: COMMIT_A },
        {
          readAt: (_c, p) => (p === ARCHI_MMD_PATH ? null : (fc.jsonFiles[p] ?? null)),
          ds,
          write: writerJson,
        },
      );
      expect(resJson.outcome).toBe("accepted");

      if (resMmd.outcome === "accepted" && resJson.outcome === "accepted") {
        // Check acceptance shape and textDigest on .mmd vs JSON
        expect(checkArchiAcceptanceShape(resMmd.acceptance)).toBeNull();
        expect(checkArchiAcceptanceShape(resJson.acceptance)).toBeNull();
        expect(resMmd.acceptance.source.manifestPath).toBe(ARCHI_MMD_PATH);
        expect(resMmd.acceptance.textDigest).toBe(expectedTextDigest);
        expect(resJson.acceptance.source.manifestPath).toBe(ARCHI_MANIFEST_PATH);
        expect(resJson.acceptance.textDigest).toBeUndefined();
        expect("textDigest" in resJson.acceptance).toBe(false);

        // Cross-format parity (C5): identical documentPin, bindings (viewPin & bindingPin), files digests, and non-acceptance bytes
        expect(resMmd.acceptance.documentPin).toEqual(resJson.acceptance.documentPin);
        expect(resMmd.acceptance.profilePins).toEqual(resJson.acceptance.profilePins);
        expect(resMmd.acceptance.cardsPin).toEqual(resJson.acceptance.cardsPin);
        expect(resMmd.acceptance.viewSchemaPin).toEqual(resJson.acceptance.viewSchemaPin);
        expect(resMmd.acceptance.bindings).toEqual(resJson.acceptance.bindings);
        expect(resMmd.acceptance.files).toEqual(resJson.acceptance.files);
        for (const f of resMmd.acceptance.files) {
          expect(resMmd.files[f.path]).toBe(resJson.files[f.path]);
        }

        // Idempotence (R1): re-ingesting unchanged .mmd (as string) at COMMIT_A or COMMIT_B returns idempotent: true, preserves COMMIT_A, and performs zero writes
        const resSameCommit = ingestArchitecture(
          { repository: `repo-${fc.name}`, commit: COMMIT_A },
          {
            readAt: (_c, p) => (p === ARCHI_MMD_PATH ? mmdText : null),
            ds,
            write: writerMmd,
          },
        );
        expect(resSameCommit).toEqual({
          ...resMmd,
          idempotent: true,
        });
        expect(writerMmd.writeCount).toBe(1);

        const resNextCommit = ingestArchitecture(
          { repository: `repo-${fc.name}`, commit: COMMIT_B },
          {
            readAt: (_c, p) => (p === ARCHI_MMD_PATH ? mmdText : null),
            ds,
            write: writerMmd,
          },
        );
        expect(resNextCommit.outcome).toBe("accepted");
        if (resNextCommit.outcome === "accepted") {
          expect(resNextCommit.idempotent).toBe(true);
          expect(resNextCommit.acceptance.source.commit).toBe(COMMIT_A);
          expect(resNextCommit.acceptance.textDigest).toBe(expectedTextDigest);
          expect(resNextCommit.acceptanceDigest).toBe(resMmd.acceptanceDigest);
          expect(writerMmd.writeCount).toBe(1);
        }

        // Stage 7 textDigest conflict check: if stored acceptance.json has a different textDigest, refuses with archi-revision-conflict
        const tamperedAcc: ArchiAcceptance = {
          ...resMmd.acceptance,
          textDigest: "0".repeat(64),
        };
        writerMmd.directories.set(resMmd.directory, {
          ...resMmd.files,
          "acceptance.json": canonicalBytes(tamperedAcc),
        });
        const resDigestConflict = ingestArchitecture(
          { repository: `repo-${fc.name}`, commit: COMMIT_B },
          {
            readAt: (_c, p) => (p === ARCHI_MMD_PATH ? mmdText : null),
            ds,
            write: writerMmd,
          },
        );
        expect(resDigestConflict).toMatchObject({
          outcome: "refused",
          stage: "versioning",
          scopes: [
            {
              scope: "document",
              diagnostics: [expect.objectContaining({ code: "archi-revision-conflict", path: "/revision" })],
            },
          ],
        });
        expect(writerMmd.writeCount).toBe(1);
      }
    }
  });
});
