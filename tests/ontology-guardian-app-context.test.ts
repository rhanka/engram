import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { verifyPackedRegistryEntries } from "../scripts/mcp-memory-l4-packed-acceptance.mjs";

import {
  hashOntologyProfile,
  normalizeOntologyProfile,
  parseOntologyProfile,
} from "../src/ontology-profile.js";
import { checkAdmission, deriveRequirements } from "../src/ontology-guardian/admission.js";
import type { AdmissionEntry } from "../src/ontology-guardian/admission.js";
import { pinsDigestOf, resultDigestOf, stableForHash } from "../src/ontology-guardian/digests.js";
import type { OntologyPayload, Receipt, RegistryEnvelope } from "../src/ontology-guardian/catalog.js";
import type { OntologyRecord } from "../src/ontology-guardian/types.js";
import * as appContextRegistryMod from "../src/ontology-guardian/app-context-registry.js";
import {
  APP_CONTEXT_ADMISSION_ENTRY,
  APP_CONTEXT_CORPUS_DIGEST,
  APP_CONTEXT_CORPUS_REF,
  APP_CONTEXT_PIN,
  APP_CONTEXT_PINNED_CONTENT_DIGEST,
  APP_CONTEXT_PINNED_PINS_DIGEST,
  APP_CONTEXT_PINNED_RAW_SHA256,
  APP_CONTEXT_PINNED_RESULT_DIGEST,
  APP_CONTEXT_PINS_DIGEST,
  APP_CONTEXT_RESULT_DIGEST,
  ENVELOPE_APP_CONTEXT_V1,
  PAYLOAD_APP_CONTEXT_V1,
  RECORD_APP_CONTEXT_V1,
  assertAppContextPayloadCoherent,
  buildAppContextEntry,
  computeAppContextProfileDigests,
  projectAppContextAdmissionEntry,
  verifyRegisteredAppContextProfile,
} from "../src/ontology-guardian/app-context-registry.js";
import { manifest } from "../src/registry/manifest.js";
import type { MemoryRegistryEntryV1, MemoryRegistryPackageV1 } from "../src/mcp/memory/receipts.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const profilePath = join(repoRoot, "profiles", "app-context", "v1", "profile.yaml");
const entriesPath = join(repoRoot, "registry", "entries.v1.json");
const packedAcceptanceScriptPath = join(repoRoot, "scripts", "mcp-memory-l4-packed-acceptance.mjs");

/**
 * L1 test-only synthetic family-corpus receipt bound to the independently
 * retained registration digests. Production exports no passing receipt;
 * full pilot corpus qualification belongs to Lot L7.
 */
const TEST_APP_CONTEXT_FAMILY_CORPUS_RECEIPT: Receipt = Object.freeze({
  receiptKind: "family-corpus",
  libraryId: "@sentropic/engram",
  libraryVersion: "0.26.0",
  issuedAt: "2026-11-11T00:00:00Z",
  validatorRole: "retained-check",
  verdict: "pass",
  family: "ENG",
  corpusDigest: APP_CONTEXT_CORPUS_DIGEST,
  fixtureDigest: APP_CONTEXT_CORPUS_DIGEST,
  severityPolicyDigest: null,
  ruleVerdicts: Object.freeze([] as const),
  evaluatedStack: Object.freeze({
    stack: Object.freeze([
      Object.freeze({
        id: "app-context",
        version: "1",
        contentDigest: APP_CONTEXT_PINNED_CONTENT_DIGEST,
      }),
    ]),
    pinsDigest: APP_CONTEXT_PINNED_PINS_DIGEST,
    resultEvidence: Object.freeze({
      evidenceState: "resolved" as const,
      digest: APP_CONTEXT_PINNED_RESULT_DIGEST,
    }),
  }),
});

describe("G0 guardian registration for app-context@1 (Lot L1, §2.4)", () => {
  it("types RECORD_APP_CONTEXT_V1, PAYLOAD_APP_CONTEXT_V1, and ENVELOPE_APP_CONTEXT_V1 against the existing G0 contracts (MAJOR 1)", () => {
    const envelope: RegistryEnvelope = ENVELOPE_APP_CONTEXT_V1;
    const payload: OntologyPayload = PAYLOAD_APP_CONTEXT_V1;
    const record: OntologyRecord = RECORD_APP_CONTEXT_V1;

    const raw = readFileSync(profilePath, "utf8");
    const rawSha256 = createHash("sha256").update(raw, "utf8").digest("hex");
    const normalized = normalizeOntologyProfile(parseOntologyProfile(raw, profilePath));
    const { profile_hash: _ph, ...normalizedWithoutHash } = normalized;

    const expectedPin = {
      id: "app-context",
      version: "1",
      contentDigest: normalized.profile_hash,
    };
    const expectedPinsDigest = pinsDigestOf({ layers: [expectedPin] });
    const expectedResultDigest = resultDigestOf({
      effectiveDeclarations: stableForHash(normalizedWithoutHash) as Record<string, unknown>,
      effectiveRuleSet: [],
      severityPolicyDigest: null,
    });

    expect(APP_CONTEXT_PINNED_RAW_SHA256).toBe(rawSha256);
    expect(APP_CONTEXT_PINNED_CONTENT_DIGEST).toBe(normalized.profile_hash);
    expect(APP_CONTEXT_PINNED_PINS_DIGEST).toBe(expectedPinsDigest);
    expect(APP_CONTEXT_PINNED_RESULT_DIGEST).toBe(expectedResultDigest);
    expect(APP_CONTEXT_PIN).toEqual(expectedPin);
    expect(APP_CONTEXT_PINS_DIGEST).toBe(expectedPinsDigest);
    expect(APP_CONTEXT_RESULT_DIGEST).toBe(expectedResultDigest);

    expect(record.namespace).toBe("engram");
    expect(record.owner).toBe("engram");
    expect(record.id).toBe("app-context");
    expect(record.version).toBe("1");
    expect(record.lifecycle).toBe("draft");
    expect(record.completeness).toBe("complete");
    expect(record.visibility).toBe("public");
    expect(record.profileShape).toBe("engram-profile");
    expect(record.artifactKind).toBe("profile");
    expect(record.profileRef).toEqual({
      canonicalRef: "engram:app-context@1",
      contentDigest: expectedPin.contentDigest,
    });
    expect(record.corpusRef).toEqual({
      ref: APP_CONTEXT_CORPUS_REF,
      digest: APP_CONTEXT_CORPUS_DIGEST,
    });
    expect(record.digests).toEqual({
      contentDigest: expectedPin.contentDigest,
      pinsDigest: expectedPinsDigest,
      resultEvidence: { evidenceState: "resolved", digest: expectedResultDigest },
    });
    expect(record.lineage).toEqual({ parents: [], mappings: [], migrations: [] });

    expect(payload.canonicalRef).toBe("engram:app-context@1");
    expect(payload.namespace).toBe("engram");
    expect(payload.owner).toBe("engram");
    expect(payload.artifactKind).toBe("profile");
    expect(payload.profileShape).toBe("engram-profile");
    expect(payload.profilePin).toEqual(expectedPin);
    expect(payload.stack).toEqual([expectedPin]);
    expect(payload.artifactBinding).toEqual({
      artifactKind: "profile",
      profilePin: expectedPin,
      stack: [expectedPin],
    });
    expect(payload.digests).toEqual(record.digests);
    expect(payload.lifecycle).toBe("draft");
    expect(payload.visibility).toBe("public");
    expect(payload.ruleSheets).toEqual([]);
    expect(payload.receipts).toEqual([]);
    expect(payload.corpusRef).toEqual(record.corpusRef);

    expect(envelope.kind).toBe("ontology");
    if (envelope.kind !== "ontology") throw new Error("expected ontology envelope");
    expect(envelope.ontology).toEqual(payload);
    expect(envelope.compatibility.entryContract).toBe("1.1.4");
    expect(envelope.parameters.schemaVersion).toBe("1");
    expect(envelope.bindings.length).toBeGreaterThan(0);
    expect(envelope.assets).toEqual([
      {
        role: "profile-data",
        path: "profiles/app-context/v1/profile.yaml",
        mediaType: "application/yaml",
        sha256: rawSha256,
      },
    ]);
  });

  it("registers the complete G0 RegistryEnvelope in registry/entries.v1.json and projects AdmissionEntry from the registered payload (MAJOR 1)", () => {
    const pkg = JSON.parse(readFileSync(entriesPath, "utf8")) as {
      format: string;
      entries: RegistryEnvelope[];
    };
    expect(pkg.format).toBe("sentropic.registry-package/v1");
    const matching = pkg.entries.filter((e) => e.id === ENVELOPE_APP_CONTEXT_V1.id);
    expect(matching).toHaveLength(1);
    const registeredEnvelope = matching[0]!;
    expect(registeredEnvelope).toEqual(ENVELOPE_APP_CONTEXT_V1);
    if (registeredEnvelope.kind !== "ontology") throw new Error("expected ontology kind");

    // DESIGN-NOTE-L1-PINS §2: buildAppContextEntry() regenerates the entry and matches the committed JSON byte-for-byte
    const regenerated = buildAppContextEntry();
    expect(regenerated).toEqual(ENVELOPE_APP_CONTEXT_V1);
    expect(JSON.stringify(regenerated, null, 2)).toBe(JSON.stringify(registeredEnvelope, null, 2));

    const raw = readFileSync(profilePath, "utf8");
    const expectedContentDigest = hashOntologyProfile(
      normalizeOntologyProfile(parseOntologyProfile(raw, profilePath)),
    );
    expect(regenerated.ontology.profilePin.contentDigest).toBe(expectedContentDigest);
    expect(regenerated.ontology.artifactBinding.profilePin).toEqual(regenerated.ontology.profilePin);
    expect(regenerated.ontology.stack).toEqual([regenerated.ontology.profilePin]);
    expect(regenerated.ontology.artifactBinding.stack).toEqual([regenerated.ontology.profilePin]);
    expect(regenerated.ontology.digests.contentDigest).toBe(expectedContentDigest);
    expect(regenerated.ontology.digests.pinsDigest).toBe(
      pinsDigestOf({ layers: regenerated.ontology.stack }),
    );
    expect(regenerated.ontology.canonicalRef).toBe("engram:app-context@1");

    const projectedFromJson = projectAppContextAdmissionEntry(registeredEnvelope.ontology);
    expect(projectedFromJson).toEqual(APP_CONTEXT_ADMISSION_ENTRY);
    expect(projectedFromJson.profilePin).toEqual(PAYLOAD_APP_CONTEXT_V1.profilePin);
    expect(projectedFromJson.pinsDigest).toBe(PAYLOAD_APP_CONTEXT_V1.digests.pinsDigest);
    expect(projectedFromJson.resultEvidence).toEqual(PAYLOAD_APP_CONTEXT_V1.digests.resultEvidence);
    expect(projectedFromJson.corpusDigest).toBe(PAYLOAD_APP_CONTEXT_V1.corpusRef.digest);
  });

  it("accepts the projected entry with L1 test evidence, refuses without receipt, and rejects tampered digests (MAJOR 1 & MAJOR 2)", () => {
    // Production module does not export an automatic passing receipt
    expect("APP_CONTEXT_FAMILY_CORPUS_RECEIPT" in appContextRegistryMod).toBe(false);
    expect(PAYLOAD_APP_CONTEXT_V1.receipts).toEqual([]);

    const projectedEntry = projectAppContextAdmissionEntry(PAYLOAD_APP_CONTEXT_V1);
    const reqs = deriveRequirements(projectedEntry);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]?.receiptKind).toBe("family-corpus");

    // Without receipt (production draft state prior to L7 qualification), checkAdmission refuses
    const draftVerdict = checkAdmission({
      entry: projectedEntry,
      receipts: PAYLOAD_APP_CONTEXT_V1.receipts,
    });
    expect(draftVerdict.admitted).toBe(false);
    if (draftVerdict.admitted === false) {
      expect(draftVerdict.code).toBe("missing-receipt");
    }

    // 1. Valid projected entry + L1 test-scoped receipt admits
    const validVerdict = checkAdmission({
      entry: projectedEntry,
      receipts: [TEST_APP_CONTEXT_FAMILY_CORPUS_RECEIPT],
    });
    expect(validVerdict).toEqual({ admitted: true });

    // 2. Tampered corpusDigest on entry or receipt refuses
    const tamperedCorpusEntry: AdmissionEntry = {
      ...projectedEntry,
      corpusDigest: APP_CONTEXT_CORPUS_DIGEST.replace(/^[0-9a-f]/, (c) => (c === "0" ? "1" : "0")),
    };
    expect(
      checkAdmission({
        entry: tamperedCorpusEntry,
        receipts: [TEST_APP_CONTEXT_FAMILY_CORPUS_RECEIPT],
      }).admitted,
    ).toBe(false);

    const tamperedCorpusReceipt: Receipt = {
      ...TEST_APP_CONTEXT_FAMILY_CORPUS_RECEIPT,
      corpusDigest: APP_CONTEXT_CORPUS_DIGEST.replace(/^[0-9a-f]/, (c) => (c === "0" ? "1" : "0")),
    };
    expect(
      checkAdmission({
        entry: projectedEntry,
        receipts: [tamperedCorpusReceipt],
      }).admitted,
    ).toBe(false);

    // 3. Tampered pinsDigest on entry or receipt refuses
    const tamperedPinsEntry: AdmissionEntry = {
      ...projectedEntry,
      pinsDigest: APP_CONTEXT_PINS_DIGEST.replace(/^[0-9a-f]/, (c) => (c === "0" ? "1" : "0")),
    };
    expect(
      checkAdmission({
        entry: tamperedPinsEntry,
        receipts: [TEST_APP_CONTEXT_FAMILY_CORPUS_RECEIPT],
      }).admitted,
    ).toBe(false);

    const tamperedPinsReceipt: Receipt = {
      ...TEST_APP_CONTEXT_FAMILY_CORPUS_RECEIPT,
      evaluatedStack: {
        ...TEST_APP_CONTEXT_FAMILY_CORPUS_RECEIPT.evaluatedStack,
        pinsDigest: APP_CONTEXT_PINS_DIGEST.replace(/^[0-9a-f]/, (c) => (c === "0" ? "1" : "0")),
      },
    };
    expect(
      checkAdmission({
        entry: projectedEntry,
        receipts: [tamperedPinsReceipt],
      }).admitted,
    ).toBe(false);
  });

  it("rejects profile identity/version substitution and verifies coherent semantic mutation behavior (MAJOR 2 & DESIGN-NOTE-L1-PINS §§3-4)", () => {
    const raw = readFileSync(profilePath, "utf8");

    // 1. Identity substitution (id: changed-profile) rejected before pin construction
    const wrongIdYaml = raw.replace(/^id:\s*app-context$/m, "id: changed-profile");
    expect(wrongIdYaml).not.toBe(raw);
    expect(() => computeAppContextProfileDigests(wrongIdYaml, profilePath)).toThrow(
      /expected app-context@1, got changed-profile@1/i,
    );
    expect(() => verifyRegisteredAppContextProfile(wrongIdYaml, profilePath)).toThrow(
      /expected app-context@1, got changed-profile@1/i,
    );
    expect(() => buildAppContextEntry(wrongIdYaml, profilePath)).toThrow(
      /expected app-context@1, got changed-profile@1/i,
    );

    // 2. Version substitution (version: 2) rejected before pin construction
    const wrongVersionYaml = raw.replace(/^version:\s*1$/m, "version: 2");
    expect(wrongVersionYaml).not.toBe(raw);
    expect(() => computeAppContextProfileDigests(wrongVersionYaml, profilePath)).toThrow(
      /expected app-context@1, got app-context@2/i,
    );
    expect(() => verifyRegisteredAppContextProfile(wrongVersionYaml, profilePath)).toThrow(
      /expected app-context@1, got app-context@2/i,
    );
    expect(() => buildAppContextEntry(wrongVersionYaml, profilePath)).toThrow(
      /expected app-context@1, got app-context@2/i,
    );

    // 3. Valid coherent semantic-profile mutation keeping id: app-context and version: "1"
    const semanticMutatedYaml = raw.replace("      - spec_map_supersedes\n", "");
    expect(semanticMutatedYaml).not.toBe(raw);

    // Must fail pinned registration verification because contentDigest changed
    expect(() => verifyRegisteredAppContextProfile(semanticMutatedYaml, profilePath)).toThrow(
      /contentDigest mismatch/i,
    );

    // Deriving the coherent mutated entry via buildAppContextEntry passes assertAppContextPayloadCoherent
    // and projects cleanly; against the retained receipt it is refused, while with its own receipt it stays admitted.
    const mutatedDigests = computeAppContextProfileDigests(semanticMutatedYaml, profilePath);
    expect(mutatedDigests.contentDigest).not.toBe(APP_CONTEXT_PINNED_CONTENT_DIGEST);

    const mutatedEnvelope = buildAppContextEntry(semanticMutatedYaml, profilePath);
    const mutatedPayload: OntologyPayload = mutatedEnvelope.ontology;
    expect(() => assertAppContextPayloadCoherent(mutatedPayload)).not.toThrow();

    const mutatedAdmissionEntry = projectAppContextAdmissionEntry(mutatedPayload);
    const verdictWithOriginalReceipt = checkAdmission({
      entry: mutatedAdmissionEntry,
      receipts: [TEST_APP_CONTEXT_FAMILY_CORPUS_RECEIPT],
    });
    expect(verdictWithOriginalReceipt.admitted).toBe(false);
    if (verdictWithOriginalReceipt.admitted === false) {
      expect(verdictWithOriginalReceipt.code).toBe("missing-receipt");
    }

    const coherentMutatedReceipt: Receipt = {
      ...TEST_APP_CONTEXT_FAMILY_CORPUS_RECEIPT,
      evaluatedStack: {
        stack: [mutatedDigests.profilePin],
        pinsDigest: mutatedDigests.pinsDigest,
        resultEvidence: {
          evidenceState: "resolved",
          digest: mutatedDigests.resultDigest,
        },
      },
    };
    const verdictWithMatchingReceipt = checkAdmission({
      entry: mutatedAdmissionEntry,
      receipts: [coherentMutatedReceipt],
    });
    expect(verdictWithMatchingReceipt).toEqual({ admitted: true });
  });

  describe("payload coherence check and per-field mutations from committed JSON (R2 MAJOR 1 & DESIGN-NOTE-L1-PINS §§3-4)", () => {
    const ZERO_DIGEST = "0".repeat(64);

    function cloneCommittedPayload(): OntologyPayload {
      const pkg = JSON.parse(readFileSync(entriesPath, "utf8")) as {
        entries: RegistryEnvelope[];
      };
      const entry = pkg.entries.find((e) => e.id === "sentropic.engram.app-context");
      if (!entry || entry.kind !== "ontology") {
        throw new Error("missing committed sentropic.engram.app-context ontology entry");
      }
      return structuredClone(entry.ontology);
    }

    function projectAndCheckWithOriginalReceipt(payload: OntologyPayload): { admitted: boolean } {
      try {
        const entry = projectAppContextAdmissionEntry(payload);
        return checkAdmission({
          entry,
          receipts: [TEST_APP_CONTEXT_FAMILY_CORPUS_RECEIPT],
        });
      } catch {
        return { admitted: false };
      }
    }

    it("admits the unmodified committed JSON payload with the original receipt", () => {
      const committed = cloneCommittedPayload();
      expect(() => assertAppContextPayloadCoherent(committed)).not.toThrow();
      expect(projectAndCheckWithOriginalReceipt(committed)).toEqual({ admitted: true });
    });

    it.each<
      [
        name: string,
        mutate: (payload: Record<string, any>) => void,
        expectedCoherenceThrow: RegExp | null,
      ]
    >([
      [
        "only profilePin.contentDigest = '0'.repeat(64)",
        (p) => {
          p.profilePin = { ...p.profilePin, contentDigest: ZERO_DIGEST };
        },
        /profilePin|contentDigest/i,
      ],
      [
        "only stack[0].contentDigest = '0'.repeat(64)",
        (p) => {
          p.stack = [{ ...p.stack[0], contentDigest: ZERO_DIGEST }];
        },
        /stack/i,
      ],
      [
        "only digests.contentDigest = '0'.repeat(64)",
        (p) => {
          p.digests = { ...p.digests, contentDigest: ZERO_DIGEST };
        },
        /contentDigest/i,
      ],
      [
        "only artifactBinding.profilePin.contentDigest = '0'.repeat(64)",
        (p) => {
          p.artifactBinding = {
            ...p.artifactBinding,
            profilePin: { ...p.artifactBinding.profilePin, contentDigest: ZERO_DIGEST },
          };
        },
        /profilePin/i,
      ],
      [
        "both profile pins and digests.contentDigest changed together, stacks retained",
        (p) => {
          p.profilePin = { ...p.profilePin, contentDigest: ZERO_DIGEST };
          p.artifactBinding = {
            ...p.artifactBinding,
            profilePin: { ...p.artifactBinding.profilePin, contentDigest: ZERO_DIGEST },
          };
          p.digests = { ...p.digests, contentDigest: ZERO_DIGEST };
        },
        /stack/i,
      ],
      [
        "only artifactBinding.stack[0].contentDigest = '0'.repeat(64)",
        (p) => {
          p.artifactBinding = {
            ...p.artifactBinding,
            stack: [{ ...p.artifactBinding.stack[0], contentDigest: ZERO_DIGEST }],
          };
        },
        /stack/i,
      ],
      [
        "only digests.pinsDigest = '0'.repeat(64)",
        (p) => {
          p.digests = { ...p.digests, pinsDigest: ZERO_DIGEST };
        },
        /pinsDigest/i,
      ],
      [
        "only corpusRef.digest = '0'.repeat(64)",
        (p) => {
          p.corpusRef = { ...p.corpusRef, digest: ZERO_DIGEST };
        },
        null,
      ],
      [
        "only canonicalRef = 'engram:changed-profile@2'",
        (p) => {
          p.canonicalRef = "engram:changed-profile@2";
        },
        /canonicalRef/i,
      ],
      [
        "both profile pins, both stacks, and digests.contentDigest changed without updating digests.pinsDigest",
        (p) => {
          const zeroPin = { ...p.profilePin, contentDigest: ZERO_DIGEST };
          p.profilePin = zeroPin;
          p.stack = [zeroPin];
          p.artifactBinding = {
            ...p.artifactBinding,
            profilePin: zeroPin,
            stack: [zeroPin],
          };
          p.digests = { ...p.digests, contentDigest: ZERO_DIGEST };
        },
        /pinsDigest/i,
      ],
      [
        "stack with two layers instead of one",
        (p) => {
          const twoLayers = [p.profilePin, p.profilePin];
          p.stack = twoLayers;
          p.artifactBinding = { ...p.artifactBinding, stack: twoLayers };
        },
        /stack/i,
      ],
    ])("rejects committed payload mutation: %s", (_name, mutate, expectedCoherenceThrow) => {
      const payload = cloneCommittedPayload();
      mutate(payload as unknown as Record<string, any>);

      if (expectedCoherenceThrow !== null) {
        expect(() => assertAppContextPayloadCoherent(payload)).toThrow(expectedCoherenceThrow);
        expect(() => projectAppContextAdmissionEntry(payload)).toThrow(expectedCoherenceThrow);
      }
      expect(projectAndCheckWithOriginalReceipt(payload).admitted).toBe(false);
    });
  });

  it("includes profiles/app-context/v1/profile.yaml in package.json files and npm pack dry-run with matching SHA-256 (R2 MAJOR 2)", () => {
    const pkgJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      files: string[];
    };
    expect(pkgJson.files).toContain("profiles/app-context/v1/profile.yaml");

    const packJsonRaw = execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const packResult = JSON.parse(packJsonRaw) as Array<{
      files: Array<{ path: string; size: number }>;
    }>;
    expect(packResult).toHaveLength(1);
    const packedPaths = packResult[0]!.files.map((f) => f.path);
    expect(packedPaths).toContain("profiles/app-context/v1/profile.yaml");

    const packedProfileMeta = packResult[0]!.files.find(
      (f) => f.path === "profiles/app-context/v1/profile.yaml",
    )!;
    const deliveredBytes = readFileSync(profilePath);
    expect(packedProfileMeta.size).toBe(deliveredBytes.byteLength);

    const deliveredSha256 = createHash("sha256").update(deliveredBytes).digest("hex");
    expect(deliveredSha256).toBe(APP_CONTEXT_PINNED_RAW_SHA256);
    expect(ENVELOPE_APP_CONTEXT_V1.assets[0]?.path).toBe("profiles/app-context/v1/profile.yaml");
    expect(ENVELOPE_APP_CONTEXT_V1.assets[0]?.sha256).toBe(deliveredSha256);
  });

  it("exposes a discriminated union in src/registry/manifest.ts requiring kind narrowing before .mcp access while preserving the memory-only contract (R2 MAJOR 3)", () => {
    // 1. Runtime regression: manifest contains both mcp and ontology entries; narrowing selects each safely
    expect(manifest.format).toBe("sentropic.registry-package/v1");
    expect(manifest.entries).toHaveLength(2);

    const mcpEntries = manifest.entries.filter(
      (entry): entry is MemoryRegistryEntryV1 => entry.kind === "mcp",
    );
    expect(mcpEntries).toHaveLength(1);
    expect(mcpEntries[0]!.id).toBe("sentropic.engram.memory");
    expect(mcpEntries[0]!.mcp.manifestAsset).toBe("dist/registry/provider-manifest.js");

    // Memory-only contract remains usable for callers that require MemoryRegistryPackageV1
    const memoryOnlyPkg: MemoryRegistryPackageV1 = {
      format: manifest.format,
      entries: mcpEntries,
    };
    expect(memoryOnlyPkg.entries[0]!.mcp.connectorIds).toEqual(["engram-memory"]);

    const ontologyEntries = manifest.entries.filter(
      (entry): entry is Extract<RegistryEnvelope, { readonly kind: "ontology" }> =>
        entry.kind === "ontology",
    );
    expect(ontologyEntries).toHaveLength(1);
    expect(ontologyEntries[0]!.id).toBe("sentropic.engram.app-context");
    expect(ontologyEntries[0]!.ontology).toEqual(PAYLOAD_APP_CONTEXT_V1);
    expect("mcp" in ontologyEntries[0]!).toBe(false);

    // 2. Type-level regression: unnarrowed entry.mcp.manifestAsset fails TypeScript compilation,
    //    while kind-narrowed access compiles with zero diagnostics.
    const tsconfigPath = join(repoRoot, "tsconfig.json");
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
    const defaultHost = ts.createCompilerHost(parsedConfig.options, true);
    let oldProgram: ts.Program | undefined;

    function typecheckSnippet(code: string): readonly ts.Diagnostic[] {
      const virtualPath = join(repoRoot, "src", "__manifest_type_probe__.ts");
      const host: ts.CompilerHost = {
        ...defaultHost,
        fileExists: (fileName) =>
          path.resolve(fileName) === virtualPath || defaultHost.fileExists(fileName),
        readFile: (fileName) =>
          path.resolve(fileName) === virtualPath ? code : defaultHost.readFile(fileName),
        getSourceFile: (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
          if (path.resolve(fileName) === virtualPath) {
            return ts.createSourceFile(fileName, code, languageVersion, true);
          }
          return defaultHost.getSourceFile(
            fileName,
            languageVersion,
            onError,
            shouldCreateNewSourceFile,
          );
        },
      };
      const program = ts.createProgram(
        [join(repoRoot, "src", "registry", "manifest.ts"), virtualPath],
        { ...parsedConfig.options, noEmit: true },
        host,
        oldProgram,
      );
      oldProgram = program;
      const sf = program.getSourceFile(virtualPath)!;
      return [
        ...program.getSemanticDiagnostics(sf),
        ...program.getSyntacticDiagnostics(sf),
      ];
    }

    const unnarrowedMcpDiagnostics = typecheckSnippet(`
      import { manifest } from "./registry/manifest.js";
      export const assets: string[] = manifest.entries.map(entry => entry.mcp.manifestAsset);
    `);
    expect(unnarrowedMcpDiagnostics.length).toBeGreaterThan(0);

    const unnarrowedOntologyDiagnostics = typecheckSnippet(`
      import { manifest } from "./registry/manifest.js";
      export const refs: string[] = manifest.entries.map(entry => entry.ontology.canonicalRef);
    `);
    expect(unnarrowedOntologyDiagnostics.length).toBeGreaterThan(0);

    const unnarrowedPackageAssignDiagnostics = typecheckSnippet(`
      import { manifest } from "./registry/manifest.js";
      import type { MemoryRegistryPackageV1 } from "./mcp/memory/receipts.js";
      export const pkg: MemoryRegistryPackageV1 = manifest;
    `);
    expect(unnarrowedPackageAssignDiagnostics.length).toBeGreaterThan(0);

    const narrowedDiagnostics = typecheckSnippet(`
      import { manifest } from "./registry/manifest.js";
      export const assets: string[] = manifest.entries.flatMap(entry =>
        entry.kind === "mcp" ? [entry.mcp.manifestAsset] : []
      );
      export const refs: string[] = manifest.entries.flatMap(entry =>
        entry.kind === "ontology" ? [entry.ontology.canonicalRef] : []
      );
    `);
    expect(narrowedDiagnostics).toEqual([]);
  });

  it("keeps scripts/mcp-memory-l4-packed-acceptance.mjs compatible with the multi-entry registry package (MINOR 3)", () => {
    const scriptSource = readFileSync(packedAcceptanceScriptPath, "utf8");
    expect(scriptSource).not.toContain("assert.equal(entries.entries.length, 1)");

    const entries = JSON.parse(readFileSync(entriesPath, "utf8")) as {
      format: string;
      entries: Array<{ id: string; entryVersion: string; publisher: { packageVersion: string } }>;
    };
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      version: string;
    };

    const verified = verifyPackedRegistryEntries(entries, pkg.version);
    expect(verified.memoryEntry.id).toBe("sentropic.engram.memory");
    expect(verified.appContextEntry.id).toBe("sentropic.engram.app-context");

    // Execute the exact ENABLED_PROBE registry-entries assertion block from the script
    const enabledMatch = scriptSource.match(
      /assert\.equal\(manifestMod\.manifest\.format, 'sentropic\.registry-package\/v1'\);[\s\S]*?assert\.equal\(entry\.id, 'sentropic\.engram\.memory'\);/,
    );
    expect(enabledMatch).not.toBeNull();
    const runEnabledProbeBlock = new Function(
      "assert",
      "fs",
      "path",
      "pkgDir",
      "manifestMod",
      enabledMatch![0] + "\nreturn entry;",
    );
    const selectedEntry = runEnabledProbeBlock(assert, fs, path, repoRoot, {
      manifest: entries,
      default: entries,
    }) as { id: string };
    expect(selectedEntry.id).toBe("sentropic.engram.memory");
  });
});
