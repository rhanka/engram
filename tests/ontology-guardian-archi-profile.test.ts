// archi@1 profile, corpus fixtures, manifests and draft G0 registry tests (spec/SPEC_EVOL_ARCHI_CARDS.md §2, §5.2, §6.1).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalBytes, digestOfPreimage, sha256Hex } from "../src/ontology-guardian/canonical.js";
import { contentDiagramDigest, pinsDigestOf } from "../src/ontology-guardian/digests.js";
import { GOVERNED_PROFILES } from "../src/ontology-guardian/diagram-profiles.js";
import {
  ARCHI1_DECLARATION,
  ARCHI1_TUPLES,
  ARCHI_CORPUS_DIGEST,
  ARCHI_CORPUS_FIXTURES,
  ARCHI_CORPUS_REF,
  ARCHI_V1,
  ARCHI_V1_PIN,
  ENVELOPE_ARCHI_V1,
  PAYLOAD_ARCHI_V1,
  RECORD_ARCHI_V1,
} from "../src/ontology-guardian/archi-profile.js";
import {
  ARCHI_CARDS_CONTENT,
  ARCHI_CARDS_CONTENT_DIGEST,
  ARCHI_CARDS_PIN,
  ARCHI_CARDS_SCHEMA_V1,
  ENVELOPE_ARCHI_CARDS_V1,
  PAYLOAD_ARCHI_CARDS_V1,
  RECORD_ARCHI_CARDS_V1,
} from "../src/ontology-guardian/archi-cards-data.js";
import {
  ARCHI_CARDS_PIN as REGISTRY_CARDS_PIN,
  ARCHI_V1_PIN as REGISTRY_ARCHI_PIN,
  ENVELOPE_ARCHI_CARDS_V1 as REGISTRY_CARDS_ENVELOPE,
  ENVELOPE_ARCHI_V1 as REGISTRY_ARCHI_ENVELOPE,
  GENERIC_V2_PIN,
  PAYLOAD_ARCHI_CARDS_V1 as REGISTRY_CARDS_PAYLOAD,
  PAYLOAD_ARCHI_V1 as REGISTRY_ARCHI_PAYLOAD,
  RECORD_ARCHI_CARDS_V1 as REGISTRY_CARDS_RECORD,
  RECORD_ARCHI_V1 as REGISTRY_ARCHI_RECORD,
} from "../src/ontology-guardian/diagram-registry.js";
import { DIAGRAM_VIEW_SCHEMA_V2 } from "../src/ontology-guardian/diagram-schemas.js";
import { VIEW_SCHEMA_V2_PIN, canonicalBytes as archiCanonicalBytes } from "../src/archi.js";
import { ARCHI_V1 as INDEX_ARCHI_V1 } from "../src/ontology-guardian/index.js";
import { dsCloneAvailable, dsSkipReason, loadDsDiagramCore } from "./helpers/ds-executor.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const EXPECTED_CONTENT_DIGEST = "81ed1a11925f9bb1d644a839cad788555ffeea876c8c09d2d0a34d6981e8b344";
const EXPECTED_ARTIFACT_DIGEST = "950722c1ad9622eb9218c8e34581f16cf89511d0b7176f9ae51d9218ad0f0dc5";

function isDeepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (!Object.isFrozen(value)) return false;
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (!isDeepFrozen(child)) return false;
  }
  return true;
}

function listArchiFixtureFiles(relDir: string): string[] {
  const absDir = join(repoRoot, relDir);
  const out: string[] = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const childRel = posix.join(relDir, entry.name);
    if (entry.isDirectory()) out.push(...listArchiFixtureFiles(childRel));
    else out.push(childRel);
  }
  return out.sort();
}

describe("archi@1 profile declaration (§2.1–§2.5, tier E)", () => {
  it("declares the 11 kinds, 4 containers, closed forms and common attributes", () => {
    expect(ARCHI1_DECLARATION.id).toBe("archi@1");
    expect(ARCHI1_DECLARATION.name).toBe("archi");
    expect(ARCHI1_DECLARATION.version).toBe(1);
    expect(ARCHI1_DECLARATION.completeness).toBe("complete");

    const entities = ARCHI1_DECLARATION.entityTypes as readonly Record<string, any>[];
    expect(entities.map((e) => e["id"])).toEqual([
      "actor", "system", "repo", "package", "component",
      "runtime", "service", "api", "store", "artifact", "host",
    ]);
    expect(entities.filter((e) => e["container"] === true).map((e) => e["id"])).toEqual([
      "system", "repo", "package", "host",
    ]);

    for (const entity of entities) {
      const attrs = entity["attributes"] as readonly Record<string, any>[];
      const names = attrs.map((a) => a["name"]);
      expect(names).not.toContain("facts");
      if (entity["id"] === "actor") {
        expect(attrs.find((a) => a["name"] === "role")).toEqual({ name: "role", kind: "text", maxLength: 400 });
      } else {
        expect(attrs.find((a) => a["name"] === "role")).toMatchObject({ kind: "text", maxLength: 400, required: true });
      }
    }
    const sysAttrs = (entities.find((e) => e["id"] === "system")!["attributes"] as readonly Record<string, any>[]);
    expect(sysAttrs.find((a) => a["name"] === "form")).toBeUndefined();
  });

  it("declares the 15 binary relations, poll trigger on invokes, 55 tuples and required-parent", () => {
    const relations = ARCHI1_DECLARATION.relationTypes as readonly Record<string, any>[];
    expect(relations.map((r) => r["id"])).toEqual([
      "partOf", "managedIn", "runsOn", "ownedBy", "operatedBy",
      "deployedAs", "dependsOn", "executedBy", "loadedBy", "invokes",
      "providesApi", "consumesApi", "uses", "accesses", "documents",
    ]);
    const invokes = relations.find((r) => r["id"] === "invokes")!;
    const trigger = (invokes["attributes"] as readonly Record<string, any>[]).find((a) => a["name"] === "trigger")!;
    expect(trigger).toEqual({
      name: "trigger",
      kind: "enum",
      values: ["hook", "poll", "mcp-stdio", "command", "schedule"],
      required: true,
    });

    expect(ARCHI1_TUPLES).toHaveLength(55);
    expect(ARCHI1_TUPLES.filter((t) => t.relationType === "partOf")).toHaveLength(8);

    const constraints = ARCHI1_DECLARATION.constraints as readonly Record<string, any>[];
    expect(constraints).toContainEqual({
      kind: "required-parent",
      childTypes: ["component"],
      parentFamilyRoots: ["package"],
      hierarchyId: "archi-composition",
    });
    expect(constraints).toContainEqual({ kind: "acyclic-hierarchy", hierarchyId: "archi-composition" });
  });

  it("is deep-frozen and reproduces the re-measured content and artifact digests", () => {
    expect(isDeepFrozen(ARCHI_V1)).toBe(true);
    expect(isDeepFrozen(ARCHI1_DECLARATION)).toBe(true);
    expect(isDeepFrozen(ARCHI_CORPUS_FIXTURES)).toBe(true);
    expect(ARCHI_V1.contentDigest).toBe(EXPECTED_CONTENT_DIGEST);
    expect(ARCHI_V1.artifactDigest).toBe(EXPECTED_ARTIFACT_DIGEST);
    expect(
      contentDiagramDigest({
        profile: ARCHI1_DECLARATION.id,
        completeness: ARCHI1_DECLARATION.completeness,
        entityTypes: ARCHI1_DECLARATION.entityTypes,
        portTypes: ARCHI1_DECLARATION.portTypes,
        relationTypes: ARCHI1_DECLARATION.relationTypes,
        constraints: ARCHI1_DECLARATION.constraints,
        limits: ARCHI1_DECLARATION.limits,
        notes: ARCHI1_DECLARATION.notes,
      }),
    ).toBe(ARCHI_V1.contentDigest);
    expect(sha256Hex(canonicalBytes(ARCHI1_DECLARATION))).toBe(ARCHI_V1.artifactDigest);
  });

  it("registers GOVERNED_PROFILES['archi@1'] last and mirrors namespace/owner/pin/digests across record, payload and envelope (§2.5)", () => {
    expect(Object.keys(GOVERNED_PROFILES)).toEqual([
      "generic@2", "archimate@2", "uml@2", "archi@1",
    ]);
    expect(GOVERNED_PROFILES["archi@1"]).toBe(ARCHI_V1);
    expect(INDEX_ARCHI_V1).toBe(ARCHI_V1);
    expect(REGISTRY_ARCHI_PIN).toBe(ARCHI_V1_PIN);
    expect(REGISTRY_ARCHI_RECORD).toBe(RECORD_ARCHI_V1);
    expect(REGISTRY_ARCHI_PAYLOAD).toBe(PAYLOAD_ARCHI_V1);
    expect(REGISTRY_ARCHI_ENVELOPE).toBe(ENVELOPE_ARCHI_V1);

    expect(ARCHI_V1_PIN).toEqual({ id: "archi", version: "1.0.0", contentDigest: EXPECTED_CONTENT_DIGEST });

    // §7.4.2 family field mapping mirror assertions for the archi@1 row:
    const record = RECORD_ARCHI_V1;
    const pin = ARCHI_V1_PIN;
    const payload = PAYLOAD_ARCHI_V1;
    const envelope = ENVELOPE_ARCHI_V1;
    const canonicalRef = "engram:archi@1";

    expect(record.namespace).toBe("diagram");
    expect(record.id).toBe("archi");
    expect(record.version).toBe("1.0.0");
    expect(record.owner).toBe("engram");
    expect(record.lifecycle).toBe("draft");
    expect(record.completeness).toBe("complete");
    expect(record.profileShape).toBe("diagram-profile");
    expect(record.artifactKind).toBe("base");
    expect(record.profileRef.canonicalRef).toBe(canonicalRef);
    expect(record.profileRef.contentDigest).toBe(pin.contentDigest);
    expect(record.digests!.contentDigest).toBe(pin.contentDigest);
    expect(record.digests!.pinsDigest).toBe(pinsDigestOf({ layers: [pin] }));
    expect(record.digests!.resultEvidence).toEqual({ evidenceState: "unresolved" });
    expect(payload.canonicalRef).toBe(canonicalRef);
    expect(payload.profilePin).toEqual(pin);
    expect(payload.stack).toEqual([pin]);
    expect(payload.digests.contentDigest).toBe(pin.contentDigest);
    expect(payload.digests.pinsDigest).toBe(pinsDigestOf({ layers: [pin] }));
    expect(payload.digests.resultEvidence).toEqual({ evidenceState: "unresolved" });
    expect(payload.namespace).toBe(record.namespace);
    expect(payload.owner).toBe(record.owner);
    expect(payload.corpusRef).toEqual(record.corpusRef);
    expect(payload.migrations).toEqual([]);
    expect(payload.compatibility.renderer.startsWith("transitional:")).toBe(true);
    expect(payload.compatibility.adapter.startsWith("transitional:")).toBe(true);
    expect(payload.artifactBinding).toEqual({
      artifactKind: "base",
      basePin: pin,
      bijectionEvidence: { evidenceState: "unresolved" },
    });
    expect(envelope.kind).toBe("ontology");
    if (envelope.kind !== "ontology") throw new Error("envelope kind");
    expect(envelope.ontology).toBe(payload);
    expect(envelope.ontology.profilePin).toEqual(pin);
    expect(envelope.assets).toEqual([
      {
        role: "profile-data",
        path: "profiles/archi-1.json",
        mediaType: "application/json",
        sha256: ARCHI_V1.artifactDigest,
      },
    ]);
    expect(payload.lineage).toEqual({ parents: [], mappings: [], migrations: [] });
    expect(record.lineage).toEqual({ parents: [], mappings: [], migrations: [] });
  });

  it("registers archi-cards@1 as a draft G0 mechanism-descriptor contract record (§3.1)", () => {
    expect(isDeepFrozen(ARCHI_CARDS_CONTENT)).toBe(true);
    expect(isDeepFrozen(ARCHI_CARDS_PIN)).toBe(true);
    expect(isDeepFrozen(RECORD_ARCHI_CARDS_V1)).toBe(true);
    expect(isDeepFrozen(PAYLOAD_ARCHI_CARDS_V1)).toBe(true);
    expect(isDeepFrozen(ENVELOPE_ARCHI_CARDS_V1)).toBe(true);

    expect(REGISTRY_CARDS_PIN).toBe(ARCHI_CARDS_PIN);
    expect(REGISTRY_CARDS_RECORD).toBe(RECORD_ARCHI_CARDS_V1);
    expect(REGISTRY_CARDS_PAYLOAD).toBe(PAYLOAD_ARCHI_CARDS_V1);
    expect(REGISTRY_CARDS_ENVELOPE).toBe(ENVELOPE_ARCHI_CARDS_V1);

    const expectedDigest = digestOfPreimage(ARCHI_CARDS_CONTENT);
    expect(ARCHI_CARDS_CONTENT_DIGEST).toBe(expectedDigest);
    expect(ARCHI_CARDS_PIN).toEqual({
      id: "archi-cards",
      version: "1",
      contentDigest: expectedDigest,
    });

    const record = RECORD_ARCHI_CARDS_V1;
    const pin = ARCHI_CARDS_PIN;
    const payload = PAYLOAD_ARCHI_CARDS_V1;
    const envelope = ENVELOPE_ARCHI_CARDS_V1;
    const canonicalRef = "engram:archi-cards@1";

    expect(record.namespace).toBe("diagram");
    expect(record.id).toBe("archi-cards");
    expect(record.version).toBe("1");
    expect(record.owner).toBe("engram");
    expect(record.lifecycle).toBe("draft");
    expect(record.completeness).toBe("complete");
    expect(record.profileShape).toBe("mechanism-descriptor");
    expect(record.artifactKind).toBe("contract");
    expect(record.profileRef.canonicalRef).toBe(canonicalRef);
    expect(record.profileRef.contentDigest).toBe(pin.contentDigest);
    expect(record.digests!.contentDigest).toBe(pin.contentDigest);
    expect(record.digests!.pinsDigest).toBe(pinsDigestOf({ layers: [pin] }));
    expect(record.digests!.resultEvidence).toEqual({ evidenceState: "unresolved" });
    expect(payload.canonicalRef).toBe(canonicalRef);
    expect(payload.profilePin).toEqual(pin);
    expect(payload.stack).toEqual([pin]);
    expect(payload.digests.contentDigest).toBe(pin.contentDigest);
    expect(payload.digests.pinsDigest).toBe(pinsDigestOf({ layers: [pin] }));
    expect(payload.digests.resultEvidence).toEqual({ evidenceState: "unresolved" });
    expect(payload.namespace).toBe(record.namespace);
    expect(payload.owner).toBe(record.owner);
    expect(payload.corpusRef).toEqual(record.corpusRef);
    expect(payload.migrations).toEqual([]);
    expect(payload.compatibility.renderer.startsWith("transitional:")).toBe(true);
    expect(payload.compatibility.adapter.startsWith("transitional:")).toBe(true);
    expect(payload.artifactBinding).toEqual({
      artifactKind: "contract",
      schemaPin: ARCHI_CARDS_SCHEMA_V1.pin,
      compatibilityMatrixVersion: "1",
    });
    expect(envelope.kind).toBe("ontology");
    if (envelope.kind !== "ontology") throw new Error("envelope kind");
    expect(envelope.ontology).toBe(payload);
    expect(envelope.ontology.profilePin).toEqual(pin);
    expect(envelope.assets).toEqual([
      {
        role: "contract-data",
        path: "contracts/archi-cards-1.json",
        mediaType: "application/json",
        sha256: ARCHI_CARDS_CONTENT_DIGEST,
      },
    ]);
    expect(payload.lineage).toEqual({ parents: [], mappings: [], migrations: [] });
    expect(record.lineage).toEqual({ parents: [], mappings: [], migrations: [] });
  });

  it("pins every file in tests/fixtures/archi/ by raw-byte SHA-256 in ARCHI_CORPUS_FIXTURES", () => {
    const diskFiles = listArchiFixtureFiles("tests/fixtures/archi");
    expect(ARCHI_CORPUS_FIXTURES.map((f) => f.path)).toEqual(diskFiles);
    for (const entry of ARCHI_CORPUS_FIXTURES) {
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      const actual = createHash("sha256").update(readFileSync(join(repoRoot, entry.path))).digest("hex");
      expect(actual, entry.path).toBe(entry.sha256);
    }
    const expectedDigest = sha256Hex(
      canonicalBytes({ corpus: ARCHI_CORPUS_REF, fixtures: ARCHI_CORPUS_FIXTURES }),
    );
    expect(ARCHI_CORPUS_DIGEST).toBe(expectedDigest);
    expect(RECORD_ARCHI_V1.corpusRef).toEqual({ ref: ARCHI_CORPUS_REF, digest: expectedDigest });
    expect(PAYLOAD_ARCHI_V1.corpusRef).toEqual({ ref: ARCHI_CORPUS_REF, digest: expectedDigest });
    expect(RECORD_ARCHI_CARDS_V1.corpusRef).toEqual({ ref: ARCHI_CORPUS_REF, digest: expectedDigest });
    expect(PAYLOAD_ARCHI_CARDS_V1.corpusRef).toEqual({ ref: ARCHI_CORPUS_REF, digest: expectedDigest });
  });
});

describe("archi@1 fixture manifests (§5.2, §6.1, tier E)", () => {
  const cases = [
    {
      dir: "tests/fixtures/archi/joint-r2",
      expectedProfilePins: [ARCHI_V1_PIN],
      expectedViews: [
        "view-specs/deploiement.json",
        "view-specs/h2a-repo.json",
        "view-specs/roles-replie.json",
        "view-specs/roles.json",
      ],
    },
    {
      dir: "tests/fixtures/archi/joint-r2-teintes",
      expectedProfilePins: [ARCHI_V1_PIN, GENERIC_V2_PIN],
      expectedViews: ["view-specs/roles-teintes.json"],
    },
    {
      dir: "tests/fixtures/archi/hosts-r3",
      expectedProfilePins: [ARCHI_V1_PIN],
      expectedViews: [
        "view-specs/deploiement-hosts.json",
        "view-specs/roles-hosts.json",
      ],
    },
  ] as const;

  it("validates profilePins, viewSchemaPin, sorted views, owningRepo and tint witness reachability", () => {
    for (const { dir, expectedProfilePins, expectedViews } of cases) {
      const absDir = join(repoRoot, dir);
      const manifest = JSON.parse(readFileSync(join(absDir, "manifest.json"), "utf8")) as Record<string, any>;
      const doc = JSON.parse(readFileSync(join(absDir, manifest["document"] as string), "utf8")) as Record<string, any>;

      expect(manifest["format"]).toBe("engram.archi-manifest/1");
      expect(manifest["profilePins"]).toEqual(expectedProfilePins);
      expect(
        (manifest["profilePins"] as { id: string; version: string }[]).map(
          (p) => `${p.id}@${p.version.split(".")[0]}`,
        ),
      ).toEqual(doc["profileRefs"]);
      expect(manifest["viewSchemaPin"]).toEqual(DIAGRAM_VIEW_SCHEMA_V2.pin);

      const views = manifest["views"] as string[];
      expect(views).toEqual([...views].sort());
      expect(new Set(views).size).toBe(views.length);
      expect(views).toEqual(expectedViews);
      for (const viewRel of views) {
        const viewPath = join(absDir, viewRel);
        expect(existsSync(viewPath), viewPath).toBe(true);
        const viewSpec = JSON.parse(readFileSync(viewPath, "utf8")) as Record<string, any>;
        expect(viewSpec["format"]).toBe("engram.archi-view/1");
        if (viewRel === "view-specs/roles-teintes.json") {
          expect(viewSpec["viewId"]).toBe("view:roles-teintes");
        }
      }

      const owningRepo = manifest["owningRepo"] as string;
      expect(doc["entities"][owningRepo]?.type).toBe("repo");
    }
  });

  it("cardsPin equals the archi-cards@1 pin (lot 3, §3.1, §5.2)", () => {
    const expectedPin = {
      id: "archi-cards",
      version: "1",
      contentDigest: digestOfPreimage(ARCHI_CARDS_CONTENT),
    };
    expect(ARCHI_CARDS_PIN).toEqual(expectedPin);
    for (const { dir } of cases) {
      const manifest = JSON.parse(readFileSync(join(repoRoot, dir, "manifest.json"), "utf8")) as Record<string, any>;
      expect(manifest["cardsPin"], dir).toEqual(ARCHI_CARDS_PIN);
    }
  });

  it("exports VIEW_SCHEMA_V2_PIN and canonicalBytes on @sentropic/engram/archi matching fixture manifests and documentPin digests (CP-13, CP-16)", () => {
    expect(VIEW_SCHEMA_V2_PIN).toBe(DIAGRAM_VIEW_SCHEMA_V2.pin);
    expect(Object.isFrozen(VIEW_SCHEMA_V2_PIN)).toBe(true);
    expect(archiCanonicalBytes).toBe(canonicalBytes);

    const knownInput = {
      revision: 0,
      documentId: "document:archi-joint",
      schemaVersion: { minor: 1, major: 1 },
      profileRefs: ["archi@1"],
    };
    const expectedKnownBytes =
      '{"documentId":"document:archi-joint","profileRefs":["archi@1"],"revision":0,"schemaVersion":{"major":1,"minor":1}}';
    expect(archiCanonicalBytes(knownInput)).toBe(expectedKnownBytes);
    expect(sha256Hex(archiCanonicalBytes(knownInput))).toBe(digestOfPreimage(knownInput));

    for (const { dir } of cases) {
      const absDir = join(repoRoot, dir);
      const manifest = JSON.parse(readFileSync(join(absDir, "manifest.json"), "utf8")) as Record<string, any>;
      const doc = JSON.parse(readFileSync(join(absDir, manifest["document"] as string), "utf8")) as Record<string, any>;

      expect(VIEW_SCHEMA_V2_PIN, `${dir}/manifest.json`).toEqual(manifest["viewSchemaPin"]);

      const docBytes = archiCanonicalBytes(doc);
      expect(docBytes, `${dir}/document.json`).toBe(canonicalBytes(doc));
      const documentPin = {
        id: doc["documentId"] as string,
        version: String(doc["revision"]),
        contentDigest: digestOfPreimage(doc),
      };
      expect(sha256Hex(docBytes), `${dir}/document.json`).toBe(documentPin.contentDigest);
      expect(createHash("sha256").update(docBytes, "utf8").digest("hex"), `${dir}/document.json`).toBe(
        documentPin.contentDigest,
      );
    }
  });
});

describe.skipIf(!dsCloneAvailable())(`archi@1 DS executor qualification (tier DS)${dsSkipReason()}`, () => {
  it("passes DS validateProfile and verifyExecutorBindings with [] and matches contentDiagramDigest", async () => {
    const ds = await loadDsDiagramCore();
    expect(ds.contentDiagramDigest(ARCHI_V1.declaration)).toBe(ARCHI_V1.contentDigest);
    expect(ds.validateProfile(ARCHI_V1.declaration, "scoped-constraints@1")).toEqual([]);
    const registry = ds.createProfileRegistry([ARCHI_V1.declaration]);
    const bindings = { schemaVersion: "1", rows: [ds.bindingRowFor(ARCHI_V1.declaration, "scoped-constraints@1")] };
    expect(ds.verifyExecutorBindings(bindings, registry)).toEqual([]);
  });
});
