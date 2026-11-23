// Test design — single-defect isolation with dependent-digest recomputation:
// - Every negative table case starts from ONE valid baseline built by a factory.
// - The runner asserts that the unmodified baseline is accepted (ok: true).
// - Each row ({ name, mutant, change, expectedCode }) changes one field and
//   recomputes every dependent digest (pinsDigest, entryDigest, asset sha256,
//   severityPolicyDigest, resultingDigests, and receipts) unless that digest is
//   the defect under test — so only the targeted guard can cause refusal.
// - Each row asserts the refusal code (and path when isolating a shadowed guard).
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  DATA_GOVERNANCE_FORMAT,
  sealModelGovernance,
  type QualifiedPin,
} from "../src/model-governance.js";
import { isRecord } from "../src/model-schemas.js";
import { canonicalBytes, tryCanonicalBytes } from "../src/ontology-guardian/canonical.js";
import type {
  Receipt,
  RegistryAsset,
  RegistryEnvelope,
} from "../src/ontology-guardian/catalog.js";
import {
  createCompanionIndex,
  DATA_GOVERNANCE_ASSET_ROLE,
  validateCompanionPublication,
  type CompanionPublishInput,
  type TenantVerificationReceipt,
} from "../src/ontology-guardian/companion-publication.js";
import { pinsDigestOf, stableForHash } from "../src/ontology-guardian/digests.js";
import type { OntologyRecord, Pin, TenantVisibility } from "../src/ontology-guardian/types.js";
import { normalizeOntologyProfile, parseOntologyProfile } from "../src/ontology-profile.js";
import example from "./fixtures/g0-openerp-users-model.json";
import gov2 from "./fixtures/g0-users-governance-v2.json";

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
const baseN = (): any => structuredClone(example);
const baseG2 = (): any => structuredClone(gov2);

const N_BYTES = 2531;
const N_DIGEST = "21684a38e6c3979937f53a286b275971f3ccda431c299078c0e8715a9240e50e";
const CORPUS_D = "c".repeat(64);
const ASSET_PATH = "governance/users-governance-v2.json";
const G2_BYTES = 1768;
const G2_DIGEST = "649b23132c5400ad11f5a92596057830daa2e5fdfee9258a3a54dc516d0da8d0";
const G3_BYTES = 1794;
const G3_DIGEST = "3fb9d4dc071b20b1e5e53fb6038604e977efa3dc2f01bfc5b2ea152cd62c2f58";

const N_PIN: Pin = { id: "openerp-users-example", version: "2", contentDigest: N_DIGEST };
const N_QPIN: QualifiedPin = { namespace: "example", pin: N_PIN };
const PINS_D = pinsDigestOf({ layers: [N_PIN] });
const G2_QPIN: QualifiedPin = {
  namespace: "example",
  pin: { id: "users-governance", version: "2", contentDigest: G2_DIGEST },
};
const G3_QPIN: QualifiedPin = {
  namespace: "example",
  pin: { id: "users-governance", version: "3", contentDigest: G3_DIGEST },
};
const SHEET_A_PIN: Pin = { id: "sheet-a", version: "1", contentDigest: "b".repeat(64) };
const SHEET_B_PIN: Pin = { id: "sheet-b", version: "1", contentDigest: "d".repeat(64) };
const PARENT_PIN: Pin = { id: "parent-base", version: "1", contentDigest: "1".repeat(64) };
const BASE_LAYER_PIN: Pin = { id: "base-layer", version: "1", contentDigest: "5".repeat(64) };
const ALT_BINDING_PIN: Pin = { id: "other-binding-pin", version: "1", contentDigest: "a".repeat(64) };
const PADDED_BASE_PIN: Pin = { id: " padded ", version: "1", contentDigest: "4".repeat(64) };
const DELTA_D = "2".repeat(64);
const MAP_PIN: Pin = { id: "map", version: "1", contentDigest: "3".repeat(64) };

const normN = normalizeOntologyProfile(parseOntologyProfile(baseN()));
const s2 = sealModelGovernance(normN, gov2);

function sealG(edit: (g: any) => void, profile = normN) {
  const g = baseG2();
  edit(g);
  return sealModelGovernance(profile, g);
}

const s3 = sealG((g) => {
  g.version = "3";
  g.entities.users.columns.display_name = {
    pii: { category: "sensitive" },
    retention: "account",
    erasure: "delete",
    protect: { encrypt: true },
  };
});
const s2Alt = sealG((g) => {
  g.entities.users.retention.account.days = 180;
});
const sOtherSeries = sealG((g) => {
  g.id = "other-governance";
});

const altNDoc = baseN();
altNDoc.id = "other-users-model";
const altNormN = normalizeOntologyProfile(parseOntologyProfile(altNDoc));
const sAltN = sealG((g) => {
  g.profile = {
    namespace: "example",
    pin: { id: altNormN.id, version: altNormN.version, contentDigest: altNormN.profile_hash },
  };
}, altNormN);

const sAltNs = sealG((g) => {
  g.namespace = "other";
});
const sAltId = sealG((g) => {
  g.id = "other-id";
});
const sAltVer = sealG((g) => {
  g.version = "9";
});
const sAltProfNs = sealG((g) => {
  g.profile.namespace = "other";
});
const emptyGBytes = canonicalBytes({
  format: DATA_GOVERNANCE_FORMAT,
  namespace: "example",
  id: "users-governance",
  version: "2",
  profile: N_QPIN,
});

function nRec(visibility: TenantVisibility = "public"): OntologyRecord {
  return {
    namespace: "example",
    id: N_PIN.id,
    version: N_PIN.version,
    owner: "engram",
    lifecycle: "published",
    completeness: "complete",
    visibility,
    profileShape: "engram-profile",
    artifactKind: "profile",
    profileRef: { canonicalRef: "example:openerp-users-example@2", contentDigest: N_DIGEST },
    corpusRef: { ref: "engram:users-corpus/2", digest: CORPUS_D },
    digests: {
      contentDigest: N_DIGEST,
      pinsDigest: PINS_D,
      resultEvidence: { evidenceState: "resolved", digest: N_DIGEST },
    },
    lineage: { parents: [], mappings: [], migrations: [] },
    consumers: ["sentbase"],
  };
}

function corpusReceipt(
  verdict: "pass" | "fail" = "pass",
  over: Record<string, unknown> = {},
): Receipt {
  return {
    receiptKind: "family-corpus",
    family: "ENG",
    libraryId: "engram-validator",
    libraryVersion: "1.0.0",
    corpusDigest: CORPUS_D,
    fixtureDigest: CORPUS_D,
    validatorRole: "retained-check",
    verdict,
    issuedAt: "2026-11-22",
    evaluatedStack: {
      stack: [N_PIN],
      pinsDigest: PINS_D,
      resultEvidence: { evidenceState: "resolved", digest: N_DIGEST },
    },
    severityPolicyDigest: null,
    ruleVerdicts: [],
    ...over,
  } as Receipt;
}

function tReceipt(
  tenant: string,
  gPin: QualifiedPin,
  over: Record<string, unknown> = {},
): TenantVerificationReceipt {
  return {
    tenant,
    receiptRef: `receipt:${tenant}:${gPin.pin.id}@${gPin.pin.version}`,
    profilePin: structuredClone(N_QPIN),
    governancePin: structuredClone(gPin),
    verdict: "pass",
    ...over,
  } as TenantVerificationReceipt;
}

function mkEnv(
  vis: TenantVisibility,
  gPin: QualifiedPin,
  opts: {
    id?: string;
    entryVersion?: string;
    assets?: readonly RegistryAsset[];
    receipts?: readonly Receipt[];
  } = {},
): Extract<RegistryEnvelope, { readonly kind: "ontology" }> {
  const defaultAssets: RegistryAsset[] =
    vis === "public"
      ? [
          {
            role: DATA_GOVERNANCE_ASSET_ROLE,
            path: ASSET_PATH,
            mediaType: "application/json",
            sha256: gPin.pin.contentDigest,
          },
        ]
      : [];
  const binding =
    vis === "public"
      ? { artifactKind: "profile" as const, profilePin: N_PIN, stack: [N_PIN] }
      : {
          artifactKind: "profile" as const,
          profilePin: N_PIN,
          stack: [N_PIN],
          relationMatrixRef: "owner:relation-matrix/2",
        };
  return {
    format: "sentropic.registry-entry/v1",
    contractVersion: "1.1.4",
    kind: "ontology",
    id: opts.id ?? `engram.${gPin.pin.id}`,
    name: `${gPin.pin.id}@${gPin.pin.version}`,
    description: "Data-model governance companion.",
    entryVersion: opts.entryVersion ?? gPin.pin.version,
    publisher: { packageName: "@sentropic/engram", packageVersion: "0.28.0" },
    compatibility: {
      entryContract: "1.1.4",
      packages: [],
      schemaProfiles: [DATA_GOVERNANCE_FORMAT],
      requiredHostFeatures: ["ontology-descriptors"],
      optionalHostFeatures: [],
    },
    parameters: { schemaVersion: "1", schema: {}, defaults: {} },
    bindings: [],
    assets: opts.assets ?? defaultAssets,
    extensions: { [DATA_GOVERNANCE_FORMAT]: structuredClone(gPin) },
    requiredExtensions: [DATA_GOVERNANCE_FORMAT],
    ontology: {
      canonicalRef: `example:${N_PIN.id}@${N_PIN.version}`,
      namespace: "example",
      owner: "engram",
      profileShape: "engram-profile",
      artifactKind: "profile",
      profilePin: N_PIN,
      stack: [N_PIN],
      digests: {
        contentDigest: N_DIGEST,
        pinsDigest: PINS_D,
        resultEvidence: { evidenceState: "resolved", digest: N_DIGEST },
      },
      ruleSheets: [],
      lifecycle: "published",
      provenance: { sourceRef: "spec/g0", sourceRevision: "2" },
      lineage: { parents: [], mappings: [], migrations: [] },
      conflictPolicy: "engram:g0-conflicts@1",
      completeness: "complete",
      corpusRef: { ref: "engram:users-corpus/2", digest: CORPUS_D },
      receipts: opts.receipts ?? [corpusReceipt()],
      migrations: [],
      consumers: ["sentbase"],
      compatibility: {
        renderer: "engram:none@1",
        adapter: "engram:profile-bundle@2",
      },
      visibility: vis,
      linkedTools: [],
      artifactBinding: binding,
    },
  } as Extract<RegistryEnvelope, { readonly kind: "ontology" }>;
}

function pubInput(): CompanionPublishInput {
  return {
    envelope: mkEnv("public", G2_QPIN),
    profileRecord: nRec("public"),
    assets: { [ASSET_PATH]: s2.bytes },
    profile: normN,
  };
}

function privInput(
  nVis: TenantVisibility,
  cVis: TenantVisibility,
  gPin: QualifiedPin = G2_QPIN,
): CompanionPublishInput {
  const tenant = cVis.startsWith("private:") ? cVis.slice(8) : "tenant-a";
  return {
    envelope: mkEnv(cVis, gPin),
    profileRecord: nRec(nVis),
    tenantReceipt: tReceipt(tenant, gPin),
  };
}

function mutPub(edit: (input: any) => void): () => any {
  return () => {
    const copy: any = pubInput();
    edit(copy);
    return copy;
  };
}

function mutPriv(
  edit: (input: any) => void,
  nVis: TenantVisibility = "public",
  cVis: TenantVisibility = "private:tenant-a",
): () => any {
  return () => {
    const copy: any = privInput(nVis, cVis);
    edit(copy);
    return copy;
  };
}

function mutRec(edit: (record: any) => void): () => any {
  return () => {
    const record: any = nRec("public");
    edit(record);
    return { ...pubInput(), profileRecord: record };
  };
}

const mutEnv = (edit: (env: any) => void): (() => any) => mutPub((i) => edit(i.envelope));
const mutOnt = (edit: (ont: any) => void): (() => any) => mutPub((i) => edit(i.envelope.ontology));
const mutPrivOnt = (edit: (ont: any) => void): (() => any) => mutPriv((i) => edit(i.envelope.ontology));

function pubWith(
  gPin: QualifiedPin,
  bytes: string,
  opts?: Parameters<typeof mkEnv>[2],
  profile = normN,
): CompanionPublishInput {
  return {
    envelope: mkEnv("public", gPin, opts),
    profileRecord: nRec("public"),
    assets: { [ASSET_PATH]: bytes },
    profile,
  };
}

function pubBytes(bytes: string): CompanionPublishInput {
  const pin = { id: "users-governance", version: "2", contentDigest: sha256(bytes) };
  return pubWith({ namespace: "example", pin }, bytes);
}

function privWithReceipt(
  over: Record<string, unknown> = {},
  gPin: QualifiedPin = G2_QPIN,
  tenant = "tenant-a",
): CompanionPublishInput {
  return { ...privInput("public", "private:tenant-a"), tenantReceipt: tReceipt(tenant, gPin, over) };
}

function policyDigestOf(
  phase: string,
  readinessPolicy: string,
  settings: readonly object[],
): string {
  return sha256(canonicalBytes({ phase, readinessPolicy, settings }));
}

function assetOf(over: Partial<RegistryAsset> = {}): RegistryAsset {
  return {
    role: DATA_GOVERNANCE_ASSET_ROLE,
    path: ASSET_PATH,
    mediaType: "application/json",
    sha256: G2_DIGEST,
    ...over,
  };
}

function assertRefuses(cases: ReadonlyArray<readonly [string, () => any, string]>): void {
  for (const [label, make, code] of cases) {
    expect(validateCompanionPublication(make()), label).toMatchObject({ ok: false, code });
  }
}

const SCOPE = {
  libraries: [{ id: "engram-validator", version: "1.0.0" }],
  proofSets: [] as const,
  selections: [{ phase: "import", readinessPolicy: "accept" }],
};

const SINGLE_SETTINGS = [{ rule: "r1", severity: "error" }];
const SINGLE_POLICY = policyDigestOf("import", "accept", SINGLE_SETTINGS);
const DUAL_SETTINGS = [
  { rule: "r1", severity: "error" },
  { rule: "r2", severity: "warning" },
];
const DUAL_POLICY = policyDigestOf("import", "accept", DUAL_SETTINGS);

type BaselineKind =
  | "pub"
  | "priv"
  | "pubSheet"
  | "pubSheetDual"
  | "pubSheetOverlap"
  | "privSheet"
  | "pubDeriv"
  | "privDeriv"
  | "pubAdmission";

type DigestSkip =
  | "pinsDigest"
  | "entryDigest"
  | "assetSha256"
  | "policyDigest"
  | "resultingDigests"
  | "receipt";

interface NegativeCase {
  readonly name: string;
  readonly mutant: string;
  readonly baseline?: BaselineKind;
  readonly change: (input: any) => void;
  readonly skipDigests?: readonly DigestSkip[];
  readonly expectedCode: string;
  readonly expectedPath?: string;
}

function isHashablePin(value: unknown): value is Pin {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.version === "string" &&
    typeof value.contentDigest === "string" &&
    tryCanonicalBytes(value) !== null
  );
}

function recomputeDependentDigests(input: any, skip: readonly DigestSkip[] = []): void {
  const skipped = new Set<DigestSkip>(skip);
  const env = input?.envelope;
  const ont = env?.ontology;

  if (!skipped.has("policyDigest") && isRecord(ont) && Array.isArray(ont.ruleSheets)) {
    for (const sheet of ont.ruleSheets) {
      if (!isRecord(sheet) || !Array.isArray(sheet.selections)) continue;
      for (const sel of sheet.selections) {
        if (
          isRecord(sel) &&
          typeof sel.phase === "string" &&
          typeof sel.readinessPolicy === "string" &&
          Array.isArray(sel.settings) &&
          tryCanonicalBytes(sel.settings) !== null
        ) {
          sel.severityPolicyDigest = policyDigestOf(sel.phase, sel.readinessPolicy, sel.settings);
        }
      }
    }
    const firstPolicy = ont.ruleSheets[0]?.selections?.[0]?.severityPolicyDigest;
    if (
      typeof firstPolicy === "string" &&
      Array.isArray(ont.receipts) &&
      isRecord(ont.receipts[0]) &&
      ont.receipts[0].severityPolicyDigest !== null
    ) {
      ont.receipts[0].severityPolicyDigest = firstPolicy;
    }
  }

  if (
    !skipped.has("pinsDigest") &&
    isRecord(ont) &&
    isRecord(ont.digests) &&
    Array.isArray(ont.stack) &&
    ont.stack.every(isHashablePin) &&
    Array.isArray(ont.ruleSheets)
  ) {
    const sheetPins: Pin[] = [];
    let allSheetPinsOk = true;
    for (const s of ont.ruleSheets) {
      if (isRecord(s) && isHashablePin(s.sheetPin)) {
        sheetPins.push(s.sheetPin);
      } else {
        allSheetPinsOk = false;
        break;
      }
    }
    if (allSheetPinsOk) {
      let computed: string | null = null;
      const lin = ont.lineage;
      if (
        ont.visibility !== "public" &&
        isRecord(lin) &&
        isRecord(lin.derivationRef) &&
        typeof lin.derivationRef.deltaDigest === "string" &&
        tryCanonicalBytes(lin.derivationRef.deltaDigest) !== null
      ) {
        const mapDig = isRecord(lin.derivationRef.mappingRef) ? lin.derivationRef.mappingRef.contentDigest : null;
        if (mapDig === null || (typeof mapDig === "string" && tryCanonicalBytes(mapDig) !== null)) {
          computed = pinsDigestOf({
            layers: ont.stack,
            ruleSheets: sheetPins,
            deltaDigest: lin.derivationRef.deltaDigest,
            mappingDigest: mapDig,
          });
        }
      } else if (!isRecord(lin) || lin.derivation === undefined) {
        computed = pinsDigestOf({ layers: ont.stack, ruleSheets: sheetPins });
      }
      if (computed !== null) {
        ont.digests.pinsDigest = computed;
        if (Array.isArray(ont.receipts) && isRecord(ont.receipts[0]) && isRecord(ont.receipts[0].evaluatedStack)) {
          ont.receipts[0].evaluatedStack.stack = structuredClone(ont.stack);
          ont.receipts[0].evaluatedStack.pinsDigest = computed;
        }
      }
    }
  }

  if (
    !skipped.has("resultingDigests") &&
    isRecord(ont) &&
    isRecord(ont.digests) &&
    isRecord(ont.lineage) &&
    isRecord(ont.lineage.derivation) &&
    "resultingDigests" in ont.lineage.derivation
  ) {
    ont.lineage.derivation.resultingDigests = structuredClone(ont.digests);
  }

  if (
    !skipped.has("assetSha256") &&
    isRecord(env) &&
    isRecord(input.assets) &&
    typeof input.assets[ASSET_PATH] === "string" &&
    Array.isArray(env.assets) &&
    isRecord(env.extensions) &&
    isRecord(env.extensions[DATA_GOVERNANCE_FORMAT]) &&
    isRecord(env.extensions[DATA_GOVERNANCE_FORMAT].pin)
  ) {
    const govAsset = env.assets.find((a: unknown) => isRecord(a) && a.role === DATA_GOVERNANCE_ASSET_ROLE);
    if (govAsset) {
      const digest = sha256(input.assets[ASSET_PATH]);
      govAsset.sha256 = digest;
      env.extensions[DATA_GOVERNANCE_FORMAT].pin.contentDigest = digest;
    }
  }

  if (
    !skipped.has("receipt") &&
    isRecord(input.tenantReceipt) &&
    isRecord(env) &&
    isRecord(env.extensions) &&
    isRecord(env.extensions[DATA_GOVERNANCE_FORMAT])
  ) {
    input.tenantReceipt.governancePin = structuredClone(env.extensions[DATA_GOVERNANCE_FORMAT]);
  }

  if (!skipped.has("entryDigest") && isRecord(env) && !("entryDigest" in env)) {
    const envBytes = tryCanonicalBytes(env);
    if (envBytes !== null) input.expectedEntryDigest = sha256(envBytes);
  }
}

function mkPubSheet(
  pin: Pin,
  ruleIds: readonly string[],
  settings: readonly object[],
  severityPolicyDigest: string,
  rules: readonly { readonly ruleId: string; readonly severity: string }[],
) {
  return {
    sheetPin: structuredClone(pin),
    ruleIds: [...ruleIds],
    selections: [
      {
        phase: "import",
        readinessPolicy: "accept",
        settings: structuredClone(settings),
        severityPolicyDigest,
        rules: structuredClone(rules),
      },
    ],
  };
}

function buildBaseline(kind: BaselineKind): any {
  const r1 = { ruleId: "r1", severity: "error" };
  const r2 = { ruleId: "r2", severity: "warning" };
  const verdictOf = (r: { ruleId: string; severity: string }) => ({ ...r, verdict: "pass", parity: "proven" });
  let out: any;
  if (kind === "pub") {
    out = pubInput();
  } else if (kind === "priv") {
    out = privInput("public", "private:tenant-a");
  } else if (kind === "pubAdmission") {
    out = { ...pubInput(), admission: { qualificationScope: SCOPE } };
  } else if (kind === "pubSheet") {
    out = pubInput();
    out.envelope.ontology.ruleSheets = [mkPubSheet(SHEET_A_PIN, ["r1"], SINGLE_SETTINGS, SINGLE_POLICY, [r1])];
    out.envelope.ontology.receipts = [
      corpusReceipt("pass", { severityPolicyDigest: SINGLE_POLICY, ruleVerdicts: [verdictOf(r1)] }),
    ];
  } else if (kind === "pubSheetDual" || kind === "pubSheetOverlap") {
    const overlap = kind === "pubSheetOverlap";
    out = pubInput();
    out.envelope.ontology.ruleSheets = [
      mkPubSheet(SHEET_A_PIN, overlap ? ["r1", "r2"] : ["r1"], DUAL_SETTINGS, DUAL_POLICY, overlap ? [r1, r2] : [r1]),
      mkPubSheet(SHEET_B_PIN, ["r2"], DUAL_SETTINGS, DUAL_POLICY, [r2]),
    ];
    out.envelope.ontology.receipts = [
      corpusReceipt("pass", { severityPolicyDigest: DUAL_POLICY, ruleVerdicts: [verdictOf(r1), verdictOf(r2)] }),
    ];
  } else if (kind === "privSheet") {
    out = privInput("public", "private:tenant-a");
    out.envelope.ontology.ruleSheets = [{ sheetPin: structuredClone(SHEET_A_PIN), ruleIds: ["r1"] }];
  } else if (kind === "pubDeriv") {
    out = pubInput();
    out.envelope.ontology.lineage = {
      parents: [structuredClone(PARENT_PIN)],
      derivation: {
        base: structuredClone(PARENT_PIN),
        operations: [
          { op: "add", subject: "t1", declaration: { kind: "text" } },
          { op: "narrow", subject: "t1", constraint: { maxLength: 64 } },
          { op: "deprecate-term", subject: "t2", reason: "renamed" },
          {
            op: "rename-with-mapping",
            subject: "old_col",
            newName: "new_col",
            mappingEntry: { kind: "rename", from: "old_col", to: "new_col" },
          },
        ],
        resultingDigests: structuredClone(out.envelope.ontology.digests),
      },
      mappings: ["m@1"],
      migrations: ["mig@1"],
    };
  } else {
    out = privInput("public", "private:tenant-a");
    out.envelope.ontology.lineage = {
      parents: [],
      derivationRef: { base: structuredClone(N_PIN), deltaDigest: DELTA_D, mappingRef: structuredClone(MAP_PIN) },
      mappings: [],
      migrations: [],
    };
  }
  recomputeDependentDigests(out);
  return out;
}

const NEGATIVE_CASES: readonly NegativeCase[] = [
  // --- 16 Round-2 non-equivalent survivors ---
  {
    name: "duplicate stack pin with recomputed pinsDigest",
    mutant: "M83_skip_coherence_dup_stack",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.stack = [structuredClone(N_PIN), structuredClone(N_PIN)];
      i.envelope.ontology.artifactBinding.stack = [structuredClone(N_PIN), structuredClone(N_PIN)];
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "composed 2-sheet selection omits a ruleId covered by sibling sheet",
    mutant: "M77_skip_compose_ruleIds_order",
    baseline: "pubSheetOverlap",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].selections[0].rules = [{ ruleId: "r1", severity: "error" }];
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "composed 2-sheet sibling carries an extra (phase, readinessPolicy) row",
    mutant: "M78_skip_compose_sel_length",
    baseline: "pubSheetDual",
    change: (i) => {
      i.envelope.ontology.ruleSheets[1].selections.push({
        phase: "export",
        readinessPolicy: "accept",
        settings: structuredClone(DUAL_SETTINGS),
        severityPolicyDigest: policyDigestOf("export", "accept", DUAL_SETTINGS),
        rules: [{ ruleId: "r2", severity: "warning" }],
      });
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "untrimmed pin id on private gPin with synced receipt",
    mutant: "M06_skip_isPin_trimmed",
    baseline: "priv",
    change: (i) => {
      i.envelope.extensions[DATA_GOVERNANCE_FORMAT].pin.id = " padded ";
    },
    expectedCode: "invalid-extension",
  },
  {
    name: "duplicate pin in lineage.parents",
    mutant: "M07_skip_isPinListNoDup_dup",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.lineage.parents = [structuredClone(PARENT_PIN), structuredClone(PARENT_PIN)];
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "unknown field on public ruleSheet",
    mutant: "M31_skip_pub_sheet_extraKey",
    baseline: "pubSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "public ruleSheet with empty selections array",
    mutant: "M32_skip_pub_sheet_empty_sel",
    baseline: "pubSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].selections = [];
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "two ruleSheets sharing the same sheetPin with recomputed pinsDigest",
    mutant: "M33_skip_sheet_dup_pin",
    baseline: "pubSheetDual",
    change: (i) => {
      i.envelope.ontology.ruleSheets[1].sheetPin = structuredClone(SHEET_A_PIN);
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "duplicate ruleIds on private ruleSheet",
    mutant: "M35_skip_sheet_dup_ruleIds",
    baseline: "privSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].ruleIds = ["r1", "r1"];
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on selection setting with recomputed severityPolicyDigest",
    mutant: "E02_skip_setting_extraKey",
    baseline: "pubSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].selections[0].settings[0].extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on SelectionRuleRow",
    mutant: "E03_skip_selRow_extraKey",
    baseline: "pubSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].selections[0].rules[0].extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on SelectionMetadata",
    mutant: "E04_skip_selMeta_extraKey",
    baseline: "pubSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].selections[0].extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on input.admission",
    mutant: "E05_skip_admission_extraKey",
    baseline: "pubAdmission",
    change: (i) => {
      i.admission.extra = 1;
    },
    expectedCode: "invalid-input",
  },
  {
    name: "extra field on PrivateLineage",
    mutant: "E06_skip_privLineage_extraKey",
    baseline: "priv",
    change: (i) => {
      i.envelope.ontology.lineage.extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on PrivateDerivationRef",
    mutant: "E07_skip_privDerivRef_extraKey",
    baseline: "privDeriv",
    change: (i) => {
      i.envelope.ontology.lineage.derivationRef.extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on PublicDerivationRecord",
    mutant: "E09_skip_pubDeriv_extraKey",
    baseline: "pubDeriv",
    change: (i) => {
      i.envelope.ontology.lineage.derivation.extra = 1;
    },
    expectedCode: "invalid-envelope",
  },

  // --- 4 companion-level admission.ts coherence mutants (M79–M82) ---
  {
    name: "artifactBinding.profilePin disagrees with outer profilePin",
    mutant: "M79_skip_coherence_binding_pin_eq",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.artifactBinding.profilePin = structuredClone(ALT_BINDING_PIN);
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "artifactBinding.stack disagrees with outer stack",
    mutant: "M80_skip_coherence_stack_eq",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.artifactBinding.stack = [
        structuredClone(BASE_LAYER_PIN),
        structuredClone(N_PIN),
      ];
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "top of stack disagrees with profilePin with recomputed pinsDigest",
    mutant: "M81_skip_coherence_top_eq",
    baseline: "pub",
    change: (i) => {
      const stack = [structuredClone(N_PIN), structuredClone(BASE_LAYER_PIN)];
      i.envelope.ontology.stack = stack;
      i.envelope.ontology.artifactBinding.stack = structuredClone(stack);
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "ontology digests.contentDigest disagrees with profilePin (coherence path)",
    mutant: "M82_skip_coherence_contentDigest_eq",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.digests.contentDigest = "0".repeat(64);
    },
    expectedCode: "invalid-envelope",
    expectedPath: "ontology",
  },

  // --- Converted stale-digest cases & nested-closure hardening ---
  {
    name: "untrimmed base pin id in stack with recomputed pinsDigest",
    mutant: "M45_skip_ont_stack_trim",
    baseline: "pub",
    change: (i) => {
      const stack = [structuredClone(PADDED_BASE_PIN), structuredClone(N_PIN)];
      i.envelope.ontology.stack = stack;
      i.envelope.ontology.artifactBinding.stack = structuredClone(stack);
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "private ruleSheet extra field with valid pinsDigest",
    mutant: "M30_skip_priv_sheet_extraKey",
    baseline: "privSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "private ruleSheet selections leak with valid pinsDigest",
    mutant: "M29_skip_priv_sheet_selections_leak",
    baseline: "privSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].selections = [];
    },
    expectedCode: "private-content-leak",
  },
  {
    name: "private ruleSheet settings leak with valid pinsDigest",
    mutant: "M29b_skip_priv_sheet_settings_leak",
    baseline: "privSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].settings = [];
    },
    expectedCode: "private-content-leak",
  },
  {
    name: "omitted lineage with valid pinsDigest",
    mutant: "M38_skip_lineage_required",
    baseline: "pub",
    change: (i) => {
      delete i.envelope.ontology.lineage;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "stale public pinsDigest",
    mutant: "M42_skip_ont_pinsDigest",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.digests.pinsDigest = "0".repeat(64);
    },
    skipDigests: ["pinsDigest"],
    expectedCode: "invalid-envelope",
  },
  {
    name: "stale private derivationRef pinsDigest",
    mutant: "M43_skip_priv_pinsDigest",
    baseline: "privDeriv",
    change: (i) => {
      i.envelope.ontology.digests.pinsDigest = PINS_D;
    },
    skipDigests: ["pinsDigest"],
    expectedCode: "invalid-envelope",
  },
  {
    name: "public derivation mismatched resultingDigests",
    mutant: "M40_skip_pub_deriv_resultingDigests",
    baseline: "pubDeriv",
    change: (i) => {
      i.envelope.ontology.lineage.derivation.resultingDigests.pinsDigest = "0".repeat(64);
    },
    skipDigests: ["resultingDigests"],
    expectedCode: "invalid-envelope",
  },
  {
    name: "stale ruleSheet severityPolicyDigest without admission",
    mutant: "M36_skip_standalone_policy_digest",
    baseline: "pubSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].selections[0].severityPolicyDigest = "0".repeat(64);
    },
    skipDigests: ["policyDigest"],
    expectedCode: "invalid-envelope",
  },
  {
    name: "invalid engram-profile severity with recomputed severityPolicyDigest",
    mutant: "M36b_skip_engram_severity_check",
    baseline: "pubSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].selections[0].settings = [{ rule: "r1", severity: "warn" }];
      i.envelope.ontology.ruleSheets[0].selections[0].rules = [{ ruleId: "r1", severity: "warn" }];
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "disagreeing composed ruleSheet severityPolicyDigest",
    mutant: "M76_skip_dual_sheet_policy_disagree",
    baseline: "pubSheetDual",
    change: (i) => {
      i.envelope.ontology.ruleSheets[1].selections[0].severityPolicyDigest = "0".repeat(64);
    },
    skipDigests: ["policyDigest"],
    expectedCode: "invalid-envelope",
  },
  {
    name: "disagreeing composed ruleSheet settings with identical policy digest",
    mutant: "M76b_skip_dual_sheet_settings_disagree",
    baseline: "pubSheetDual",
    change: (i) => {
      i.envelope.ontology.ruleSheets[1].selections[0].settings = [
        { rule: "r1", severity: "info" },
        { rule: "r2", severity: "warning" },
      ];
    },
    skipDigests: ["policyDigest"],
    expectedCode: "invalid-envelope",
  },
  {
    name: "conflicting selection row for overlapping rule across two sheets",
    mutant: "M77b_skip_compose_conflicting_row",
    baseline: "pubSheetOverlap",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].selections[0].rules[1] = {
        ruleId: "r2",
        severity: "info",
      };
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "composed 2-sheet sibling has different (phase, readinessPolicy) with equal length",
    mutant: "M75_skip_compose_missing_scope",
    baseline: "pubSheetOverlap",
    change: (i) => {
      i.envelope.ontology.ruleSheets[1].selections[0].phase = "export";
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "non-plain prototype on tenantReceipt.profilePin.pin",
    mutant: "M01_skip_isPin_isRecord",
    baseline: "priv",
    change: (i) => {
      i.tenantReceipt.profilePin.pin = Object.assign(Object.create({}), N_PIN);
    },
    expectedCode: "invalid-tenant-receipt",
  },
  {
    name: "mismatched G body namespace with recomputed asset sha256",
    mutant: "M59_skip_gDoc_namespace",
    baseline: "pub",
    change: (i) => {
      i.assets[ASSET_PATH] = sAltNs.bytes;
    },
    expectedCode: "substituted-public-asset",
  },
  {
    name: "mismatched G body id with recomputed asset sha256",
    mutant: "M59b_skip_gDoc_id",
    baseline: "pub",
    change: (i) => {
      i.assets[ASSET_PATH] = sAltId.bytes;
    },
    expectedCode: "substituted-public-asset",
  },
  {
    name: "mismatched G body version with recomputed asset sha256",
    mutant: "M59c_skip_gDoc_version",
    baseline: "pub",
    change: (i) => {
      i.assets[ASSET_PATH] = sAltVer.bytes;
    },
    expectedCode: "substituted-public-asset",
  },
  {
    name: "mismatched G body profile.namespace with recomputed asset sha256",
    mutant: "M60_skip_gDoc_profile_ns",
    baseline: "pub",
    change: (i) => {
      i.assets[ASSET_PATH] = sAltProfNs.bytes;
    },
    expectedCode: "substituted-public-asset",
  },
  {
    name: "invalid §4 G body missing entities with recomputed asset sha256",
    mutant: "M61_skip_seal_governance",
    baseline: "pub",
    change: (i) => {
      i.assets[ASSET_PATH] = emptyGBytes;
    },
    expectedCode: "invalid-governance",
  },
  {
    name: "non-canonical pretty valid G with recomputed asset sha256",
    mutant: "M58_skip_pub_canonical",
    baseline: "pub",
    change: (i) => {
      i.assets[ASSET_PATH] = JSON.stringify(gov2, null, 2);
    },
    expectedCode: "substituted-public-asset",
  },
  {
    name: "substituted invalid-§4 bytes without recomputing asset sha256",
    mutant: "M57_skip_pub_bytes_sha",
    baseline: "pub",
    change: (i) => {
      i.assets[ASSET_PATH] = "{}";
    },
    skipDigests: ["assetSha256"],
    expectedCode: "substituted-public-asset",
  },
  {
    name: "missing profile on public companion",
    mutant: "M55_skip_pub_missing_profile",
    baseline: "pub",
    change: (i) => {
      delete i.profile;
    },
    expectedCode: "missing-profile",
  },
  {
    name: "extra field on isClosedStrPair (ontology.provenance)",
    mutant: "M14_skip_closedStrPair_extraKey",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.provenance.extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on isClosedStrDigest (ontology.corpusRef)",
    mutant: "M15_skip_closedStrDigest_extraKey",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.corpusRef.extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "malformed digest on ontology.corpusRef",
    mutant: "M15b_skip_closedStrDigest_digest",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.corpusRef.digest = "not-a-digest";
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on resolved resultEvidence",
    mutant: "M16_skip_digestEvidence_extraKey",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.digests.resultEvidence.extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "malformed digest on resolved resultEvidence",
    mutant: "M16b_skip_digestEvidence_digest",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.digests.resultEvidence.digest = "bad";
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on ontology.digests",
    mutant: "M17_skip_recordDigests_extraKey",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.digests.extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "profileRecord digests.contentDigest mismatches profileRef.contentDigest",
    mutant: "M17b_skip_recordDigests_contentDigest",
    baseline: "pub",
    change: (i) => {
      i.profileRecord.digests.contentDigest = "0".repeat(64);
    },
    expectedCode: "invalid-profile-record",
  },
  {
    name: "profileRecord digests.pinsDigest malformed",
    mutant: "M17c_skip_recordDigests_pinsDigest",
    baseline: "pub",
    change: (i) => {
      i.profileRecord.digests.pinsDigest = "not-a-digest";
    },
    expectedCode: "invalid-profile-record",
  },
  {
    name: "blank namespace on gPin",
    mutant: "M08_skip_qPin_namespace_trim",
    baseline: "priv",
    change: (i) => {
      i.envelope.extensions[DATA_GOVERNANCE_FORMAT].namespace = " ";
    },
    expectedCode: "invalid-extension",
  },
  {
    name: "extra field on gPin",
    mutant: "M08b_skip_qPin_extraKey",
    baseline: "priv",
    change: (i) => {
      i.envelope.extensions[DATA_GOVERNANCE_FORMAT].extra = 1;
    },
    expectedCode: "invalid-extension",
  },
  {
    name: "extra field on envelope.compatibility",
    mutant: "M23_skip_env_compat_extraKey",
    baseline: "pub",
    change: (i) => {
      i.envelope.compatibility.extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on envelope.parameters",
    mutant: "M24_skip_env_params_extraKey",
    baseline: "pub",
    change: (i) => {
      i.envelope.parameters.extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on envelope.bindings entry",
    mutant: "M25_skip_env_binding_extraKey",
    baseline: "pub",
    change: (i) => {
      i.envelope.bindings = [{ key: "k", contract: "c", required: true, extra: 1 }];
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on envelope.assets entry",
    mutant: "M26_skip_env_asset_extraKey",
    baseline: "pub",
    change: (i) => {
      i.envelope.assets[0].extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "untrimmed classification on setting with recomputed policy digest",
    mutant: "M34_skip_setting_classification_trim",
    baseline: "pubSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].selections[0].settings[0].classification = " ";
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "non-record options on setting with recomputed policy digest",
    mutant: "M34b_skip_setting_options_record",
    baseline: "pubSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].selections[0].settings[0].options = [];
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "empty studyDisposition on SelectionRuleRow",
    mutant: "M34c_skip_selRow_disposition_trim",
    baseline: "pubSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].selections[0].rules[0].studyDisposition = "";
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "non-array ontology.ruleSheets",
    mutant: "M34d_skip_ruleSheets_array",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.ruleSheets = {};
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "non-record ruleSheet item",
    mutant: "M34e_skip_ruleSheet_record",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.ruleSheets = [null];
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "floating version on private ruleSheet sheetPin",
    mutant: "M34f_skip_sheet_pin_valid",
    baseline: "privSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].sheetPin.version = "latest";
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "blank entry in private ruleSheet ruleIds",
    mutant: "M34g_skip_sheet_ruleIds_strList",
    baseline: "privSheet",
    change: (i) => {
      i.envelope.ontology.ruleSheets[0].ruleIds = [""];
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "floating version on private derivationRef.base",
    mutant: "M39_skip_privDerivRef_base_pin",
    baseline: "privDeriv",
    change: (i) => {
      i.envelope.ontology.lineage.derivationRef.base.version = "latest";
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "malformed deltaDigest on private derivationRef",
    mutant: "M39b_skip_privDerivRef_deltaDigest",
    baseline: "privDeriv",
    change: (i) => {
      i.envelope.ontology.lineage.derivationRef.deltaDigest = "bad";
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "floating version on private derivationRef.mappingRef",
    mutant: "M39c_skip_privDerivRef_mappingRef_pin",
    baseline: "privDeriv",
    change: (i) => {
      i.envelope.ontology.lineage.derivationRef.mappingRef.version = "latest";
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "floating version on public derivation.base",
    mutant: "M40b_skip_pubDeriv_base_pin",
    baseline: "pubDeriv",
    change: (i) => {
      i.envelope.ontology.lineage.derivation.base.version = "latest";
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on add delta operation",
    mutant: "M41_skip_deltaOp_add_extraKey",
    baseline: "pubDeriv",
    change: (i) => {
      i.envelope.ontology.lineage.derivation.operations[0].extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on narrow delta operation",
    mutant: "M41b_skip_deltaOp_narrow_extraKey",
    baseline: "pubDeriv",
    change: (i) => {
      i.envelope.ontology.lineage.derivation.operations[1].extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on deprecate-term delta operation",
    mutant: "M41c_skip_deltaOp_deprecate_extraKey",
    baseline: "pubDeriv",
    change: (i) => {
      i.envelope.ontology.lineage.derivation.operations[2].extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on rename-with-mapping mappingEntry",
    mutant: "M41d_skip_deltaOp_rename_extraKey",
    baseline: "pubDeriv",
    change: (i) => {
      i.envelope.ontology.lineage.derivation.operations[3].mappingEntry.extra = 1;
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "extra field on ontology.licenceClosure",
    mutant: "M46_skip_licenceClosure_extraKey",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.licenceClosure = {
        licences: ["MIT"],
        closureDigest: "e".repeat(64),
        extra: 1,
      };
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "published payload with deprecatedAt",
    mutant: "M47_skip_lifecycle_pub_deprecatedAt",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.deprecatedAt = "2026-11-22";
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "published payload with supersededBy",
    mutant: "M47b_skip_lifecycle_pub_supersededBy",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.supersededBy = structuredClone(N_PIN);
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "deprecated payload missing deprecatedReason",
    mutant: "M47c_skip_lifecycle_dep_reason",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.lifecycle = "deprecated";
      i.envelope.ontology.deprecatedAt = "2026-11-22";
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "superseded payload with deprecatedAt",
    mutant: "M47d_skip_lifecycle_sup_deprecatedAt",
    baseline: "pub",
    change: (i) => {
      i.envelope.ontology.lifecycle = "superseded";
      i.envelope.ontology.supersededBy = structuredClone(N_PIN);
      i.envelope.ontology.deprecatedAt = "2026-11-22";
    },
    expectedCode: "invalid-envelope",
  },
  {
    name: "non-boolean admission.requireReference",
    mutant: "M62_skip_admission_requireRef_bool",
    baseline: "pubAdmission",
    change: (i) => {
      i.admission.requireReference = "yes";
    },
    expectedCode: "invalid-input",
  },
  {
    name: "floating version on profileRecord",
    mutant: "M51_skip_nRec_version_exact",
    baseline: "pub",
    change: (i) => {
      i.profileRecord.version = "latest";
    },
    expectedCode: "invalid-profile-record",
  },
  {
    name: "wrong profileShape on profileRecord",
    mutant: "M51b_skip_nRec_profileShape",
    baseline: "pub",
    change: (i) => {
      i.profileRecord.profileShape = "diagram-profile";
    },
    expectedCode: "invalid-profile-record",
  },
  {
    name: "wrong artifactKind on profileRecord",
    mutant: "M51c_skip_nRec_artifactKind",
    baseline: "pub",
    change: (i) => {
      i.profileRecord.artifactKind = "base";
    },
    expectedCode: "invalid-profile-record",
  },
  {
    name: "blank migrationRef on profileRecord",
    mutant: "M51d_skip_nRec_migrationRef_trim",
    baseline: "pub",
    change: (i) => {
      i.profileRecord.migrationRef = " ";
    },
    expectedCode: "invalid-profile-record",
  },
  {
    name: "blank catalogEntryRef on profileRecord",
    mutant: "M51e_skip_nRec_catalogEntryRef_trim",
    baseline: "pub",
    change: (i) => {
      i.profileRecord.catalogEntryRef = " ";
    },
    expectedCode: "invalid-profile-record",
  },
  {
    name: "lone surrogate in envelope stack pin",
    mutant: "M61b_skip_lone_surrogate_stack",
    baseline: "pub",
    change: (i) => {
      const badPin = { id: "bad\ud800", version: "2", contentDigest: N_DIGEST };
      i.envelope.ontology.profilePin = badPin;
      i.envelope.ontology.stack = [badPin];
      i.envelope.ontology.artifactBinding.profilePin = badPin;
      i.envelope.ontology.artifactBinding.stack = [badPin];
    },
    expectedCode: "invalid-envelope",
  },
];

it("isolates single-field guards with recomputed dependent digests (negative table)", () => {
  for (const row of NEGATIVE_CASES) {
    const baselineKind = row.baseline ?? "pub";
    const base = buildBaseline(baselineKind);
    expect(
      validateCompanionPublication(base),
      `${row.name} [${row.mutant}]: unmodified ${baselineKind} baseline must be accepted`,
    ).toMatchObject({ ok: true });

    const candidate = buildBaseline(baselineKind);
    row.change(candidate);
    recomputeDependentDigests(candidate, row.skipDigests);
    expect(validateCompanionPublication(candidate), `${row.name} [${row.mutant}]`).toMatchObject({
      ok: false,
      code: row.expectedCode,
      ...(row.expectedPath !== undefined ? { path: row.expectedPath } : {}),
    });
  }
});

it("enforces §2 visibility pairs and fail-closed visibility on N and companion", () => {
  // kills: refusing private G over public N (§7 8a RED clause 1)
  expect(
    validateCompanionPublication(privInput("public", "private:tenant-a")).ok,
    "private G over public N",
  ).toBe(true);

  // kills: admitting public companion for private N (§7 8a RED clause 2)
  expect(
    validateCompanionPublication({ ...pubInput(), profileRecord: nRec("private:tenant-a") }),
    "public G over private N",
  ).toMatchObject({ ok: false, code: "invalid-visibility" });

  // kills: admitting other-tenant companion for private N (§7 8a RED clause 3)
  expect(
    validateCompanionPublication(privInput("private:tenant-a", "private:tenant-b")),
    "other-tenant G over private N",
  ).toMatchObject({ ok: false, code: "invalid-visibility" });

  // kills: rejecting public+public or same-tenant private+private pairs or wrong P-ENTRY digest
  const pubRes = validateCompanionPublication(pubInput());
  expect(pubRes).toMatchObject({
    ok: true,
    visibility: "public",
    entryDigest: sha256(canonicalBytes(pubInput().envelope)),
  });
  expect(
    validateCompanionPublication(privInput("private:tenant-a", "private:tenant-a")),
  ).toMatchObject({ ok: true, visibility: "private:tenant-a" });

  // kills: fail-open on absent, malformed, C1-control, or reserved-key visibility (F4.2)
  const badVisValues: unknown[] = [
    undefined,
    null,
    "",
    "private",
    "private:",
    "private: ",
    "private:a b",
    "private:a:b",
    "private:a\u0080b",
    "private:__proto__",
    "private:constructor",
    "internal",
    "PUBLIC",
  ];
  for (const badVis of badVisValues) {
    const rN: any = nRec("public");
    rN.visibility = badVis;
    expect(
      validateCompanionPublication({ ...pubInput(), profileRecord: rN }),
      `bad N visibility ${String(badVis)}`,
    ).toMatchObject({ ok: false, code: "invalid-visibility" });

    const eC: any = mkEnv("public", G2_QPIN);
    eC.ontology.visibility = badVis;
    expect(
      validateCompanionPublication({ ...pubInput(), envelope: eC }),
      `bad companion visibility ${String(badVis)}`,
    ).toMatchObject({ ok: false, code: "invalid-visibility" });
  }
});

it("closes §5.2 envelope, qualified extensions, §1.4 profileRecord, and path hygiene", () => {
  // kills: rejecting valid optional qualified extension key
  const optExt: any = pubInput();
  optExt.envelope.extensions["sentropic.audit/1"] = { trace: "ok" };
  expect(validateCompanionPublication(optExt).ok, "valid optional qualified ext").toBe(true);

  // kills: rejecting valid deprecated or superseded profileRecord
  const depRec: any = nRec("public");
  depRec.lifecycle = "deprecated";
  depRec.deprecatedReason = "replaced";
  depRec.deprecatedAt = "2026-11-22";
  depRec.supersededBy = { id: N_PIN.id, version: "3", contentDigest: "f".repeat(64) };
  expect(
    validateCompanionPublication({ ...pubInput(), profileRecord: depRec }).ok,
    "deprecated profileRecord",
  ).toBe(true);

  const supRec: any = nRec("public");
  supRec.lifecycle = "superseded";
  supRec.supersededBy = { id: N_PIN.id, version: "3", contentDigest: "f".repeat(64) };
  supRec.migrationRef = "engram:users-2-to-3@1";
  supRec.catalogEntryRef = "engram.users@2";
  expect(
    validateCompanionPublication({ ...pubInput(), profileRecord: supRec }).ok,
    "superseded profileRecord",
  ).toBe(true);

  assertRefuses([
    ["null input", () => null, "invalid-input"],
    [
      "non-plain prototype input (kills M06_skip_input_isRecord)",
      () => Object.assign(Object.create({}), pubInput()),
      "invalid-input",
    ],
    ["null envelope (kills M08_skip_env_isRecord / M54)", mutPub((i) => { i.envelope = null; }), "invalid-envelope"],
    ["self-embedded entryDigest", mutEnv((e) => { e.entryDigest = "a".repeat(64); }), "entry-digest-self-embedded"],
    ["extra envelope key (kills M09_skip_env_extraKey)", mutEnv((e) => { e.extra = 1; }), "invalid-envelope"],
    [
      "bad envelope format (kills M10 / M57_skip_env_format)",
      mutEnv((e) => { e.format = "other/v1"; }),
      "invalid-envelope",
    ],
    ["bad contractVersion", mutEnv((e) => { e.contractVersion = "latest"; }), "invalid-envelope"],
    ["bad envelope kind", mutEnv((e) => { e.kind = "skill"; }), "invalid-envelope"],
    ["blank envelope id", mutEnv((e) => { e.id = " "; }), "invalid-envelope"],
    ["blank envelope name", mutEnv((e) => { e.name = ""; }), "invalid-envelope"],
    ["blank envelope description", mutEnv((e) => { e.description = ""; }), "invalid-envelope"],
    ["floating entryVersion", () => pubWith(G2_QPIN, s2.bytes, { entryVersion: "latest" }), "invalid-envelope"],
    ["bad publisher packageVersion", mutEnv((e) => { e.publisher.packageVersion = "^0.28.0"; }), "invalid-envelope"],
    ["extra publisher field", mutEnv((e) => { e.publisher.extra = 1; }), "invalid-envelope"],
    ["missing compatibility (kills F1.1)", mutEnv((e) => { delete e.compatibility; }), "invalid-envelope"],
    [
      "bad compatibility entryContract",
      mutEnv((e) => { e.compatibility.entryContract = "^1.1.4"; }),
      "invalid-envelope",
    ],
    [
      "bad compatibility packages entry",
      mutEnv((e) => { e.compatibility.packages = [{ name: "a", range: "" }]; }),
      "invalid-envelope",
    ],
    ["bad compatibility schemaProfiles", mutEnv((e) => { e.compatibility.schemaProfiles = [""]; }), "invalid-envelope"],
    [
      "bad compatibility requiredHostFeatures (kills M17)",
      mutEnv((e) => { e.compatibility.requiredHostFeatures = [""]; }),
      "invalid-envelope",
    ],
    [
      "bad compatibility optionalHostFeatures (kills M18)",
      mutEnv((e) => { e.compatibility.optionalHostFeatures = [""]; }),
      "invalid-envelope",
    ],
    ["missing parameters (kills F1.1)", mutEnv((e) => { delete e.parameters; }), "invalid-envelope"],
    ["bad parameters schemaVersion", mutEnv((e) => { e.parameters.schemaVersion = "latest"; }), "invalid-envelope"],
    ["bad parameters schema (kills M20)", mutEnv((e) => { e.parameters.schema = []; }), "invalid-envelope"],
    ["bad parameters defaults", mutEnv((e) => { e.parameters.defaults = []; }), "invalid-envelope"],
    ["missing bindings (kills F1.1)", mutEnv((e) => { delete e.bindings; }), "invalid-envelope"],
    [
      "bad binding required flag",
      mutEnv((e) => { e.bindings = [{ key: "k", contract: "c", required: "yes" }]; }),
      "invalid-envelope",
    ],
    ["non-array assets", mutEnv((e) => { e.assets = {}; }), "invalid-envelope"],
    [
      "non-string asset path (kills isRelPath typeof guard)",
      mutEnv((e) => { e.assets = [assetOf({ path: 123 as any })]; }),
      "invalid-envelope",
    ],
    [
      "duplicate asset path (kills F4.2)",
      () => pubWith(G2_QPIN, s2.bytes, { assets: [assetOf(), assetOf({ role: "notes", mediaType: "text/plain" })] }),
      "invalid-envelope",
    ],
    ["missing requiredExtensions", mutEnv((e) => { delete e.requiredExtensions; }), "missing-required-extension"],
    ["empty requiredExtensions", mutEnv((e) => { e.requiredExtensions = []; }), "missing-required-extension"],
    [
      "duplicate requiredExtensions (kills M47_skip_reqExt_dup)",
      mutEnv((e) => { e.requiredExtensions = [DATA_GOVERNANCE_FORMAT, DATA_GOVERNANCE_FORMAT]; }),
      "missing-required-extension",
    ],
    [
      "unknown requiredExtension",
      mutEnv((e) => {
        e.extensions["other.ext/1"] = {};
        e.requiredExtensions = [DATA_GOVERNANCE_FORMAT, "other.ext/1"];
      }),
      "missing-required-extension",
    ],
    [
      "wrong single requiredExtension",
      mutEnv((e) => { e.requiredExtensions = ["other.ext/1"]; }),
      "missing-required-extension",
    ],
    [
      "missing extension value",
      mutEnv((e) => { delete e.extensions[DATA_GOVERNANCE_FORMAT]; }),
      "missing-required-extension",
    ],
    [
      "proto extensions",
      mutEnv((e) => { e.extensions = Object.create({ [DATA_GOVERNANCE_FORMAT]: G2_QPIN }); }),
      "missing-required-extension",
    ],
    ["unqualified extension key (kills F1.1)", mutEnv((e) => { e.extensions.unqualified = 1; }), "invalid-extension"],
    [
      "slash-only unqualified extension key (kills F1.1)",
      mutEnv((e) => { e.extensions["other/1"] = 1; }),
      "invalid-extension",
    ],
    [
      "floating G pin version",
      mutEnv((e) => { e.extensions[DATA_GOVERNANCE_FORMAT].pin.version = "latest"; }),
      "invalid-extension",
    ],
    [
      "range G pin version",
      mutEnv((e) => { e.extensions[DATA_GOVERNANCE_FORMAT].pin.version = "^2"; }),
      "invalid-extension",
    ],
    ["non-record profileRecord", () => ({ ...pubInput(), profileRecord: null }), "invalid-profile-record"],
    ["extra profileRecord key (kills F4.1)", mutRec((r) => { r.extra = 1; }), "invalid-profile-record"],
    ["draft profileRecord (kills F4.1)", mutRec((r) => { r.lifecycle = "draft"; }), "invalid-profile-record"],
    ["missing profileRecord lifecycle (kills F4.1)", mutRec((r) => { delete r.lifecycle; }), "invalid-profile-record"],
    [
      "superseded profileRecord missing migrationRef (kills F4.1)",
      mutRec((r) => {
        r.lifecycle = "superseded";
        r.supersededBy = { id: N_PIN.id, version: "3", contentDigest: "f".repeat(64) };
      }),
      "invalid-profile-record",
    ],
    ["profileRecord missing owner (kills F4.1)", mutRec((r) => { delete r.owner; }), "invalid-profile-record"],
    [
      "profileRecord bad completeness (kills F4.1)",
      mutRec((r) => { r.completeness = "partial"; }),
      "invalid-profile-record",
    ],
    [
      "profileRecord empty profileRef.canonicalRef (kills F4.1)",
      mutRec((r) => { r.profileRef.canonicalRef = ""; }),
      "invalid-profile-record",
    ],
    ["profileRecord missing corpusRef (kills F4.1)", mutRec((r) => { delete r.corpusRef; }), "invalid-profile-record"],
    [
      "profileRecord unresolved digests (kills F4.1)",
      mutRec((r) => { r.digests.resultEvidence = { evidenceState: "unresolved" }; }),
      "invalid-profile-record",
    ],
    ["profileRecord missing lineage (kills F4.1)", mutRec((r) => { delete r.lineage; }), "invalid-profile-record"],
    ["profileRecord bad consumers (kills F4.1)", mutRec((r) => { r.consumers = [""]; }), "invalid-profile-record"],
    [
      "N pin digest mismatch vs record",
      mutRec((r) => {
        r.profileRef.contentDigest = "0".repeat(64);
        r.digests.contentDigest = "0".repeat(64);
      }),
      "pin-mismatch",
    ],
    ["N namespace swap vs record", mutRec((r) => { r.namespace = "other"; }), "pin-mismatch"],
    ["N id mismatch vs record (kills M56_skip_nRec_id_version)", mutRec((r) => { r.id = "other-id"; }), "pin-mismatch"],
    [
      "N version mismatch vs record (kills M56_skip_nRec_id_version)",
      mutRec((r) => { r.version = "3"; }),
      "pin-mismatch",
    ],
  ]);

  // kills: missing any isRelPath sub-check (F3 + F4.2)
  const badPaths = [
    "",
    " gov/g.json ",
    "gov/ g.json",
    "/abs.json",
    "dir/",
    "a\\b.json",
    "a\x00b.json",
    "a\u0080b.json",
    "./a.json",
    "../escape.json",
    "a//b.json",
  ];
  for (const badPath of badPaths) {
    const inp = {
      ...pubInput(),
      envelope: mkEnv("public", G2_QPIN, { assets: [assetOf({ path: badPath })] }),
    };
    expect(
      validateCompanionPublication(inp),
      `bad asset path ${JSON.stringify(badPath)}`,
    ).toMatchObject({ ok: false, code: "invalid-envelope" });
  }
});

it("closes §5.3 OntologyPayload, lifecycle, lineage, pinsDigest, and public/private tiers", () => {
  // kills: rejecting valid draft with unresolved evidence
  const draftPub: any = pubInput();
  draftPub.envelope.ontology.lifecycle = "draft";
  draftPub.envelope.ontology.digests.resultEvidence = { evidenceState: "unresolved" };
  expect(validateCompanionPublication(draftPub).ok, "draft with unresolved evidence").toBe(true);

  // kills: rejecting valid deprecated and superseded companion payloads
  const depPub: any = pubInput();
  depPub.envelope.ontology.lifecycle = "deprecated";
  depPub.envelope.ontology.deprecatedReason = "old";
  depPub.envelope.ontology.deprecatedAt = "2026-11-22";
  depPub.envelope.ontology.domain = "identity";
  depPub.envelope.ontology.licenceClosure = { licences: ["MIT"], closureDigest: "e".repeat(64) };
  depPub.envelope.ontology.coverage = {
    declaredLimits: "users only",
    coverageDigest: "f".repeat(64),
  };
  expect(validateCompanionPublication(depPub).ok, "valid deprecated + optional fields").toBe(true);

  const supPub: any = pubInput();
  supPub.envelope.ontology.lifecycle = "superseded";
  supPub.envelope.ontology.supersededBy = {
    id: N_PIN.id,
    version: "3",
    contentDigest: "f".repeat(64),
  };
  expect(validateCompanionPublication(supPub).ok, "valid superseded payload").toBe(true);

  // kills: rejecting valid public derivation with all 4 DeltaOperation arms
  expect(validateCompanionPublication(buildBaseline("pubDeriv")).ok, "valid public derivation").toBe(true);

  // kills: rejecting valid private derivationRef with recomputed pinsDigest
  const privDeriv = buildBaseline("privDeriv");
  expect(validateCompanionPublication(privDeriv).ok, "valid private derivationRef").toBe(true);

  const loneSurrogate = '{"x":"\\ud800"}';
  const prettyBadG = JSON.stringify({ invalid: true }, null, 2);

  assertRefuses([
    ["non-record ontology", mutEnv((e) => { e.ontology = null; }), "invalid-envelope"],
    ["unknown ontology payload field", mutOnt((o) => { o.governance = gov2; }), "invalid-envelope"],
    ["missing canonicalRef (kills F1.2)", mutOnt((o) => { delete o.canonicalRef; }), "invalid-envelope"],
    ["missing owner (kills F1.2)", mutOnt((o) => { delete o.owner; }), "invalid-envelope"],
    ["bad optional domain", mutOnt((o) => { o.domain = ""; }), "invalid-envelope"],
    ["bad profileShape", mutOnt((o) => { o.profileShape = "diagram-profile"; }), "invalid-envelope"],
    ["bad artifactKind", mutOnt((o) => { o.artifactKind = "base"; }), "invalid-envelope"],
    ["empty stack", mutOnt((o) => { o.stack = []; }), "invalid-envelope"],
    ["extra artifactBinding field", mutOnt((o) => { o.artifactBinding.extra = 1; }), "invalid-envelope"],
    [
      "public with relationMatrixRef (kills F1.2)",
      mutOnt((o) => { o.artifactBinding.relationMatrixRef = "owner:m/1"; }),
      "invalid-envelope",
    ],
    [
      "private missing relationMatrixRef (kills F1.2)",
      mutPrivOnt((o) => { delete o.artifactBinding.relationMatrixRef; }),
      "invalid-envelope",
    ],
    ["missing provenance (kills F1.2)", mutOnt((o) => { delete o.provenance; }), "invalid-envelope"],
    ["missing conflictPolicy (kills F1.2)", mutOnt((o) => { delete o.conflictPolicy; }), "invalid-envelope"],
    ["bad completeness (kills F1.2)", mutOnt((o) => { o.completeness = "bad"; }), "invalid-envelope"],
    ["missing corpusRef (kills F1.2)", mutOnt((o) => { delete o.corpusRef; }), "invalid-envelope"],
    ["missing migrations (kills F1.2)", mutOnt((o) => { delete o.migrations; }), "invalid-envelope"],
    ["missing consumers (kills F1.2)", mutOnt((o) => { delete o.consumers; }), "invalid-envelope"],
    ["missing compatibility (kills F1.2)", mutOnt((o) => { delete o.compatibility; }), "invalid-envelope"],
    ["missing linkedTools (kills F1.2)", mutOnt((o) => { delete o.linkedTools; }), "invalid-envelope"],
    [
      "excluded licenceClosure licence",
      mutOnt((o) => { o.licenceClosure = { licences: ["GPL-3.0"], closureDigest: "e".repeat(64) }; }),
      "invalid-envelope",
    ],
    [
      "invalid coverage",
      mutOnt((o) => { o.coverage = { declaredLimits: "", coverageDigest: "f".repeat(64) }; }),
      "invalid-envelope",
    ],
    ["non-object receipt item", mutOnt((o) => { o.receipts = ["bad"]; }), "invalid-envelope"],
    [
      "published with unresolved resultEvidence (kills F1.2)",
      mutOnt((o) => { o.digests.resultEvidence = { evidenceState: "unresolved" }; }),
      "invalid-envelope",
    ],
    [
      "draft with unresolved resultEvidence carrying extra digest field",
      mutOnt((o) => {
        o.lifecycle = "draft";
        o.digests.resultEvidence = { evidenceState: "unresolved", digest: N_DIGEST };
      }),
      "invalid-envelope",
    ],
    ["published with deprecatedReason (kills F1.2)", mutOnt((o) => { o.deprecatedReason = "x"; }), "invalid-envelope"],
    [
      "deprecated missing deprecatedAt (kills F1.2)",
      mutOnt((o) => {
        o.lifecycle = "deprecated";
        o.deprecatedReason = "x";
      }),
      "invalid-envelope",
    ],
    [
      "deprecated bad supersededBy (kills F1.2)",
      mutOnt((o) => {
        o.lifecycle = "deprecated";
        o.deprecatedReason = "x";
        o.deprecatedAt = "2026-11-22";
        o.supersededBy = { id: "x" };
      }),
      "invalid-envelope",
    ],
    [
      "superseded missing supersededBy (kills F1.2)",
      mutOnt((o) => { o.lifecycle = "superseded"; }),
      "invalid-envelope",
    ],
    [
      "superseded with deprecatedReason (kills F1.2)",
      mutOnt((o) => {
        o.lifecycle = "superseded";
        o.deprecatedReason = "x";
        o.supersededBy = N_PIN;
      }),
      "invalid-envelope",
    ],
    ["unknown lifecycle (kills F1.2)", mutOnt((o) => { o.lifecycle = "archived"; }), "invalid-envelope"],
    ["null lineage (kills F1.3)", mutOnt((o) => { o.lineage = null; }), "invalid-envelope"],
    [
      "public with PrivateLineage derivationRef (kills F1.3)",
      mutOnt((o) => {
        o.lineage = {
          parents: [],
          derivationRef: { base: N_PIN, deltaDigest: "a".repeat(64) },
          mappings: [],
          migrations: [],
        };
      }),
      "invalid-envelope",
    ],
    [
      "public derivation empty operations (kills F1.3)",
      mutOnt((o) => {
        o.lineage = {
          parents: [],
          derivation: { base: N_PIN, operations: [], resultingDigests: o.digests },
          mappings: [],
          migrations: [],
        };
      }),
      "invalid-envelope",
    ],
    [
      "public derivation bad rename mapping (kills assertValidDeltaOperation)",
      mutOnt((o) => {
        o.lineage = {
          parents: [],
          derivation: {
            base: N_PIN,
            operations: [
              {
                op: "rename-with-mapping",
                subject: "a",
                newName: "b",
                mappingEntry: { kind: "rename", from: "wrong", to: "b" },
              },
            ],
            resultingDigests: o.digests,
          },
          mappings: [],
          migrations: [],
        };
      }),
      "invalid-envelope",
    ],
    [
      "public derivation unknown delta op",
      mutOnt((o) => {
        o.lineage = {
          parents: [],
          derivation: { base: N_PIN, operations: [{ op: "drop", subject: "a" }], resultingDigests: o.digests },
          mappings: [],
          migrations: [],
        };
      }),
      "invalid-envelope",
    ],
    [
      "private derivationRef null (kills F1.3)",
      mutPrivOnt((o) => { o.lineage = { parents: [], derivationRef: null, mappings: [], migrations: [] }; }),
      "invalid-envelope",
    ],
    [
      "private lineage derivation leak",
      mutPrivOnt((o) => { o.lineage = { parents: [], derivation: {}, mappings: [], migrations: [] }; }),
      "private-content-leak",
    ],
    [
      "private lineage operations leak (kills F1.3)",
      mutPrivOnt((o) => { o.lineage = { parents: [], operations: [], mappings: [], migrations: [] }; }),
      "private-content-leak",
    ],
    ["stale expectedEntryDigest", () => ({ ...pubInput(), expectedEntryDigest: "0".repeat(64) }), "stale-entry-digest"],
    [
      "mutated envelope vs original entryDigest",
      mutPub((i) => {
        const d = sha256(canonicalBytes(i.envelope));
        i.envelope.name = "edited";
        i.expectedEntryDigest = d;
      }),
      "stale-entry-digest",
    ],
    [
      "public with tenantReceipt (kills F4.2)",
      () => ({ ...pubInput(), tenantReceipt: tReceipt("tenant-a", G2_QPIN) }),
      "invalid-tenant-receipt",
    ],
    ["missing public G asset entry", () => pubWith(G2_QPIN, s2.bytes, { assets: [] }), "missing-public-asset"],
    [
      "duplicate public G asset",
      () => pubWith(G2_QPIN, s2.bytes, { assets: [assetOf(), assetOf({ path: "governance/dup.json" })] }),
      "duplicate-public-asset",
    ],
    [
      "wrong asset mediaType",
      () => pubWith(G2_QPIN, s2.bytes, { assets: [assetOf({ mediaType: "text/plain" })] }),
      "invalid-public-asset",
    ],
    [
      "asset sha256 mismatch",
      () => pubWith(G2_QPIN, s2.bytes, { assets: [assetOf({ sha256: "0".repeat(64) })] }),
      "substituted-public-asset",
    ],
    ["missing public G asset bytes", () => ({ ...pubInput(), assets: {} }), "missing-public-asset"],
    [
      "proto-inherited input.assets (kills M51_skip_assets_hasOwn)",
      () => ({ ...pubInput(), assets: Object.create({ [ASSET_PATH]: s2.bytes }) }),
      "missing-public-asset",
    ],
    [
      "Object.prototype path in input.assets (kills M51_skip_assets_hasOwn)",
      () => ({ ...pubWith(G2_QPIN, s2.bytes, { assets: [assetOf({ path: "toString" })] }), assets: {} }),
      "missing-public-asset",
    ],
    [
      "substituted valid-§4 bytes",
      () => ({ ...pubInput(), assets: { [ASSET_PATH]: s2.bytes.replace("365", "366") } }),
      "substituted-public-asset",
    ],
    [
      "lone-surrogate public G JSON (kills F2.1 never-throw)",
      () => pubBytes(loneSurrogate),
      "substituted-public-asset",
    ],
    ["non-object JSON public G asset", () => pubBytes("123"), "substituted-public-asset"],
    [
      "non-canonical pretty invalid G (kills parsed.canonical !== bytes)",
      () => pubBytes(prettyBadG),
      "substituted-public-asset",
    ],
    [
      "mismatched G body profile.pin via alt N (kills M50_skip_gDoc_profile)",
      () => pubWith(sAltN.pin, sAltN.bytes, {}, altNormN),
      "substituted-public-asset",
    ],
    [
      "invalid §4 G body missing cdc",
      () => {
        const g = baseG2();
        delete g.entities.users.cdc;
        return pubBytes(canonicalBytes(g));
      },
      "invalid-governance",
    ],
    [
      "private G asset on pubN/privG",
      () => ({
        ...privInput("public", "private:tenant-a"),
        envelope: mkEnv("private:tenant-a", G2_QPIN, { assets: [assetOf()] }),
      }),
      "private-governance-asset",
    ],
    [
      "private G asset on privN/privG",
      () => ({
        ...privInput("private:tenant-a", "private:tenant-a"),
        envelope: mkEnv("private:tenant-a", G2_QPIN, { assets: [assetOf()] }),
      }),
      "private-governance-asset",
    ],
    [
      "private N body supplied to guardian (kills R-6)",
      () => ({ ...privInput("private:tenant-a", "private:tenant-a"), profile: normN }),
      "private-content-leak",
    ],
    [
      "missing tenant receipt",
      () => ({ ...privInput("public", "private:tenant-a"), tenantReceipt: undefined }),
      "invalid-tenant-receipt",
    ],
    ["failing tenant receipt", () => privWithReceipt({ verdict: "fail" }), "invalid-tenant-receipt"],
    ["wrong-tenant receipt", () => privWithReceipt({}, G2_QPIN, "tenant-b"), "invalid-tenant-receipt"],
    ["empty receiptRef", () => privWithReceipt({ receiptRef: " " }), "invalid-tenant-receipt"],
    [
      "wrong N pin in receipt",
      () => privWithReceipt({ profilePin: { namespace: "other", pin: N_PIN } }),
      "invalid-tenant-receipt",
    ],
    [
      "extra field on receipt profilePin (kills isQPin on receipt)",
      () => privWithReceipt({ profilePin: { namespace: "example", pin: N_PIN, extra: 1 } }),
      "invalid-tenant-receipt",
    ],
    ["stale G pin in receipt", () => privWithReceipt({}, G3_QPIN), "invalid-tenant-receipt"],
    ["private body leaked in receipt", () => privWithReceipt({ body: gov2 }), "invalid-tenant-receipt"],
  ]);

  // kills: uncaught throw on hostile throwing getter input (F2 never-throw)
  const throwingInput = Object.defineProperty({}, "envelope", {
    enumerable: true,
    get() {
      throw new Error("getter-boom");
    },
  }) as CompanionPublishInput;
  expect(validateCompanionPublication(throwingInput), "throwing getter").toMatchObject({
    ok: false,
    code: "invalid-input",
  });
  // kills: M55i_skip_pub_parsed_ok (preserves lone-surrogate parse failure reason)
  expect(validateCompanionPublication(pubBytes(loneSurrogate)), "lone-surrogate public G JSON reason").toMatchObject({
    ok: false,
    code: "substituted-public-asset",
    reason: "invalid-unicode:lone-surrogate",
  });
});

it("projects ruleSheets into checkAdmission like app-context-registry (F2.2)", () => {
  // Sheetless baseline admission (public + private) + failing receipt + requireReference + family
  expect(
    validateCompanionPublication(buildBaseline("pubAdmission")).ok,
    "sheetless public admission",
  ).toBe(true);
  expect(
    validateCompanionPublication({
      ...privInput("public", "private:tenant-a"),
      admission: { qualificationScope: SCOPE },
    }).ok,
    "sheetless private admission",
  ).toBe(true);
  expect(
    validateCompanionPublication({
      ...pubWith(G2_QPIN, s2.bytes, { receipts: [corpusReceipt("fail")] }),
      admission: { qualificationScope: SCOPE },
    }),
    "failing receipt refuses",
  ).toMatchObject({ ok: false, code: "missing-receipt" });
  expect(
    validateCompanionPublication({ ...pubInput(), admission: { qualificationScope: SCOPE, requireReference: true } }),
    "requireReference refuses retained-check",
  ).toMatchObject({ ok: false, code: "missing-receipt" });
  expect(
    validateCompanionPublication({ ...pubInput(), admission: { family: "EXT", qualificationScope: SCOPE } }),
    "EXT family refuses ENG receipt",
  ).toMatchObject({ ok: false, code: "missing-receipt" });
  expect(
    validateCompanionPublication({ ...pubInput(), admission: { family: "DIA" as any, qualificationScope: SCOPE } }),
    "invalid admission family refuses",
  ).toMatchObject({ ok: false, code: "invalid-input" });

  // Non-empty ruleSheets (single sheet + two composed sheets)
  const pubSheetBase = buildBaseline("pubSheet");
  // kills: F2.2 wrongly refusing valid public entry with ruleSheets
  expect(
    validateCompanionPublication({ ...pubSheetBase, admission: { qualificationScope: SCOPE } }).ok,
    "valid public ruleSheets admits",
  ).toBe(true);

  // kills: F2.2 public ruleSheets null-policy receipt bypass
  const nullPolicyBypass = buildBaseline("pubSheet");
  nullPolicyBypass.envelope.ontology.receipts[0].severityPolicyDigest = null;
  nullPolicyBypass.envelope.ontology.receipts[0].ruleVerdicts = [];
  recomputeDependentDigests(nullPolicyBypass);
  expect(
    validateCompanionPublication({ ...nullPolicyBypass, admission: { qualificationScope: SCOPE } }),
    "public ruleSheets null-policy bypass refuses",
  ).toMatchObject({ ok: false, code: "missing-receipt" });

  // Two composed public ruleSheets
  const dualBase = buildBaseline("pubSheetDual");
  expect(
    validateCompanionPublication({ ...dualBase, admission: { qualificationScope: SCOPE } }).ok,
    "two composed public ruleSheets admit",
  ).toBe(true);

  // Private ruleSheets + ownerSelections (F2.2)
  const privSheetBase = buildBaseline("privSheet");
  privSheetBase.envelope.ontology.receipts = [
    corpusReceipt("pass", {
      severityPolicyDigest: SINGLE_POLICY,
      ruleVerdicts: [{ ruleId: "r1", severity: "error", verdict: "pass", parity: "proven" }],
    }),
  ];
  recomputeDependentDigests(privSheetBase);
  const ownerSelections = [
    {
      ownerReceiptRef: "owner:sel/1",
      phase: "import",
      readinessPolicy: "accept",
      severityPolicyDigest: SINGLE_POLICY,
      rules: [{ ruleId: "r1", severity: "error" }],
    },
  ];
  // kills: F2.2 wrongly refusing valid private entry with ruleSheets + ownerSelections
  expect(
    validateCompanionPublication({ ...privSheetBase, admission: { qualificationScope: SCOPE, ownerSelections } }).ok,
    "valid private ruleSheets + ownerSelections admits",
  ).toBe(true);

  // kills: admitting private ruleSheets without ownerSelections
  expect(
    validateCompanionPublication({ ...privSheetBase, admission: { qualificationScope: SCOPE } }),
    "private ruleSheets without ownerSelections refuses",
  ).toMatchObject({ ok: false, code: "missing-receipt" });
});

it("enforces cross-tenant deny-as-missing and G-only revision rules in the trusted index", () => {
  const idx = createCompanionIndex();
  const pIn = pubInput();
  const pPub = idx.publish(pIn);
  const gPubPriv: QualifiedPin = {
    namespace: "tenant-a",
    pin: { id: "users-gov-pubn", version: "2", contentDigest: G2_DIGEST },
  };
  const gPrivPriv: QualifiedPin = {
    namespace: "tenant-a",
    pin: { id: "users-gov-privn", version: "2", contentDigest: G3_DIGEST },
  };

  // Mutate caller objects post-publish to prove cloning isolation
  (pIn.envelope as any).name = "mutated-after-publish";
  const privInA1 = privInput("public", "private:tenant-a", gPubPriv);
  const pA1 = idx.publish(privInA1);
  (privInA1.tenantReceipt as any).receiptRef = "mutated-receipt";
  const pA2 = idx.publish(privInput("private:tenant-a", "private:tenant-a", gPrivPriv));

  // kills: failing to index all three permitted §2 pairs
  expect([pPub.ok, pA1.ok, pA2.ok]).toStrictEqual([true, true, true]);

  // kills: publish throwing on null, admitting non-plain input (M66f), or double-reading TOCTOU
  expect(idx.publish(null as any)).toMatchObject({ ok: false, code: "invalid-input" });
  expect(
    idx.publish(Object.assign(Object.create({}), pubInput())),
    "publish rejects non-plain prototype input",
  ).toMatchObject({ ok: false, code: "invalid-input" });
  const throwOnRead1 = Object.defineProperty({}, "envelope", {
    enumerable: true,
    get() {
      throw new Error("first-read-boom");
    },
  }) as CompanionPublishInput;
  expect(idx.publish(throwOnRead1), "publish never throws on read-1 getter").toMatchObject({
    ok: false,
    code: "invalid-input",
  });

  // kills: PROBE_TOCTOU_PUBLISH (double read on input.envelope or input.tenantReceipt)
  const toctouGPin: QualifiedPin = {
    namespace: "tenant-a",
    pin: { id: "toctou-check", version: "1", contentDigest: G2_DIGEST },
  };
  const freshPriv = privInput("public", "private:tenant-a", toctouGPin);
  const swappedEnv: any = structuredClone(freshPriv.envelope);
  swappedEnv.name = "SWAPPED_NAME";
  let envReads = 0;
  let receiptReads = 0;
  const statefulPrivInput: Record<string, unknown> = { profileRecord: freshPriv.profileRecord };
  Object.defineProperty(statefulPrivInput, "envelope", {
    enumerable: true,
    get() {
      envReads++;
      return envReads === 1 ? freshPriv.envelope : swappedEnv;
    },
  });
  Object.defineProperty(statefulPrivInput, "tenantReceipt", {
    enumerable: true,
    get() {
      receiptReads++;
      return receiptReads === 1
        ? freshPriv.tenantReceipt
        : { ...freshPriv.tenantReceipt, receiptRef: "SWAPPED_RECEIPT" };
    },
  });
  const toctouPrivRes = idx.publish(statefulPrivInput as unknown as CompanionPublishInput);
  expect(toctouPrivRes, "single-read publish succeeds").toMatchObject({ ok: true });
  expect([envReads, receiptReads], "publish reads envelope and receipt once").toStrictEqual([1, 1]);
  const toctouPrivResolved = idx.resolve({
    namespace: "tenant-a",
    id: "toctou-check",
    version: "1",
    viewerTenant: "tenant-a",
  });
  expect(toctouPrivResolved, "stored envelope/receipt match read 1 & entryDigest").toMatchObject({
    ok: true,
    envelope: { name: "toctou-check@1" },
    tenantReceipt: { receiptRef: "receipt:tenant-a:toctou-check@1" },
  });
  if (toctouPrivResolved.ok) {
    expect(sha256(canonicalBytes(toctouPrivResolved.envelope))).toBe(
      toctouPrivResolved.indexEntry.entryDigest,
    );
  }

  // kills: double read on public input.assets[ASSET_PATH] and side-effect mutation of envelope
  const toctouPubG = baseG2();
  toctouPubG.id = "toctou-pub";
  const sToctouPub = sealModelGovernance(normN, toctouPubG);
  const toctouPubEnv = mkEnv("public", sToctouPub.pin);
  let assetReads = 0;
  const statefulAssets: Record<string, string> = {};
  Object.defineProperty(statefulAssets, ASSET_PATH, {
    enumerable: true,
    get() {
      assetReads++;
      return assetReads === 1 ? sToctouPub.bytes : "TAMPERED";
    },
  });
  const statefulPubInput: Record<string, unknown> = {
    envelope: toctouPubEnv,
    profileRecord: nRec("public"),
    assets: statefulAssets,
  };
  Object.defineProperty(statefulPubInput, "profile", {
    enumerable: true,
    get() {
      (toctouPubEnv as any).name = "MUTATED_BY_PROFILE_GETTER";
      return normN;
    },
  });
  expect(idx.publish(statefulPubInput as unknown as CompanionPublishInput).ok).toBe(true);
  expect(assetReads, "publish reads asset bytes once").toBe(1);
  const toctouPubResolved = idx.resolve({
    namespace: "example",
    id: "toctou-pub",
    version: "2",
  });
  expect(toctouPubResolved, "stored public envelope/bytes match snapshot").toMatchObject({
    ok: true,
    envelope: { name: "toctou-pub@2" },
    assetBytes: sToctouPub.bytes,
  });

  // kills: accessor getter inside tenantReceipt bypassing canonical snapshot
  const accessorReceiptPriv = privInput("public", "private:tenant-a", {
    namespace: "tenant-a",
    pin: { id: "accessor-receipt", version: "1", contentDigest: G2_DIGEST },
  });
  const accessorReceipt: Record<string, unknown> = { ...accessorReceiptPriv.tenantReceipt };
  Object.defineProperty(accessorReceipt, "receiptRef", {
    enumerable: true,
    get() {
      return "receipt:tenant-a:accessor-receipt@1";
    },
  });
  expect(
    idx.publish({
      ...accessorReceiptPriv,
      tenantReceipt: accessorReceipt as unknown as TenantVerificationReceipt,
    }),
    "publish rejects non-canonical accessor property on tenantReceipt",
  ).toMatchObject({ ok: false, code: "invalid-tenant-receipt" });

  // kills: distinguishing missing entry from missing asset
  const missing = idx.resolve({
    namespace: "example",
    id: "absent",
    version: "2",
    viewerTenant: "tenant-b",
  });
  const missingAsset = idx.resolve(
    { namespace: "example", id: "users-governance", version: "2" },
    { assets: {} },
  );
  const protoAsset = idx.resolve(
    { namespace: "example", id: "users-governance", version: "2" },
    { assets: Object.create({ [ASSET_PATH]: s2.bytes }) },
  );
  expect(missing).toStrictEqual({ ok: false, code: "not-found" });
  expect(missingAsset).toStrictEqual(missing);
  // kills: M52_skip_opts_assets_hasOwn
  expect(protoAsset).toStrictEqual(missing);

  for (const gp of [gPubPriv, gPrivPriv]) {
    const owned = idx.resolve({
      namespace: gp.namespace,
      id: gp.pin.id,
      version: gp.pin.version,
      viewerTenant: "tenant-a",
    });
    // kills: denying owning tenant, leaking assetBytes, or aliasing tenantReceipt
    expect(owned).toMatchObject({
      ok: true,
      visibility: "private:tenant-a",
      indexEntry: { gPin: gp },
      tenantReceipt: {
        tenant: "tenant-a",
        receiptRef: `receipt:tenant-a:${gp.pin.id}@${gp.pin.version}`,
      },
    });
    if (owned.ok) {
      expect(owned.assetBytes).toBeUndefined();
      (owned.indexEntry as any).companion.id = "caller-edit-index";
      if (owned.tenantReceipt) (owned.tenantReceipt as any).receiptRef = "caller-edit-receipt";
    }
    const ownedAgain = idx.resolve({
      namespace: gp.namespace,
      id: gp.pin.id,
      version: gp.pin.version,
      viewerTenant: "tenant-a",
    });
    expect(ownedAgain).toMatchObject({
      ok: true,
      indexEntry: { companion: { id: `engram.${gp.pin.id}` } },
      tenantReceipt: { receiptRef: `receipt:tenant-a:${gp.pin.id}@${gp.pin.version}` },
    });

    // kills: cross-tenant, stale-digest oracle, whitespace/prefixed-tenant, or anonymous leak
    const deniedQueries = [
      { viewerTenant: "tenant-b" },
      { viewerTenant: "tenant-b", expectedEntryDigest: "0".repeat(64) },
      { viewerTenant: "tenant-b", expectedGovernanceDigest: "0".repeat(64) },
      { viewerTenant: "tenant-a " },
      { viewerTenant: "private:tenant-a" },
      {},
    ];
    for (const q of deniedQueries) {
      expect(
        idx.resolve({ namespace: gp.namespace, id: gp.pin.id, version: gp.pin.version, ...q }),
      ).toStrictEqual(missing);
    }
  }

  // kills: failing to resolve public G asset bytes or aliasing published envelope/indexEntry
  const r2 = idx.resolve({ namespace: "example", id: "users-governance", version: "2" });
  expect(r2).toMatchObject({
    ok: true,
    assetBytes: s2.bytes,
    assetPath: ASSET_PATH,
    envelope: { name: "users-governance@2" },
  });
  if (r2.ok) {
    expect(r2.tenantReceipt).toBeUndefined();
    (r2.envelope as any).name = "caller-edit";
    (r2.indexEntry as any).companion.id = "caller-edit";
  }

  // kills: accepting substituted asset or invalid/floating pin at resolve
  expect(
    idx.resolve(
      { namespace: "example", id: "users-governance", version: "2" },
      { assets: { [ASSET_PATH]: `${s2.bytes} ` } },
    ),
  ).toMatchObject({ ok: false, code: "substituted-asset" });
  expect(
    idx.resolve({ namespace: "example", id: "users-governance", version: "latest" }),
  ).toMatchObject({ ok: false, code: "invalid-pin" });
  expect(
    idx.resolve({ namespace: "", id: "users-governance", version: "2" }),
  ).toMatchObject({ ok: false, code: "invalid-pin" });
  expect(
    idx.resolve({ namespace: "example", id: " ", version: "2" }),
  ).toMatchObject({ ok: false, code: "invalid-pin" });
  expect(idx.resolve(null as any)).toMatchObject({ ok: false, code: "invalid-pin" });

  // kills: M37_skip_bySeries_only (different catalog id, SAME G series + reused entryVersion)
  expect(
    idx.publish(pubWith(G3_QPIN, s3.bytes, { id: "engram.users-governance-different-cat-id", entryVersion: "2" })),
    "bySeries blocks reused entryVersion across distinct catalog id",
  ).toMatchObject({ ok: false, code: "reused-entry-version" });

  // kills: deleting byCat check (DIFFERENT G series, SAME catalog id + reused entryVersion)
  expect(
    idx.publish(pubWith(sOtherSeries.pin, sOtherSeries.bytes, { id: "engram.users-governance", entryVersion: "2" })),
    "byCat blocks reused (kind, id, entryVersion) across distinct G series",
  ).toMatchObject({ ok: false, code: "reused-entry-version" });

  // kills: allowing reused G identity with different bytes
  expect(idx.publish(pubWith(s2Alt.pin, s2Alt.bytes, { entryVersion: "4" }))).toMatchObject({
    ok: false,
    code: "reused-governance-identity",
  });

  // kills: unchanged P-ENTRY digest on G-only revision
  const env3 = mkEnv("public", G3_QPIN, { entryVersion: "3" });
  const p3 = idx.publish({ ...pubWith(G3_QPIN, s3.bytes), envelope: env3 });
  expect(p3.ok && pPub.ok).toBe(true);
  if (!p3.ok || !pPub.ok) throw new Error("unreachable");
  expect(p3.entryDigest).toBe(sha256(canonicalBytes(env3)));
  expect(p3.entryDigest).not.toBe(pPub.entryDigest);

  // kills: users-governance@2/@3 or N byte/digest drift on G-only revision
  expect([
    s2.byteLength,
    s2.digest,
    s3.byteLength,
    s3.digest,
    Buffer.byteLength(JSON.stringify(stableForHash(normN)), "utf8"),
    normN.profile_hash,
  ]).toStrictEqual([G2_BYTES, G2_DIGEST, G3_BYTES, G3_DIGEST, N_BYTES, N_DIGEST]);

  // kills: accepting stale P-ENTRY or G digest at resolve
  expect(
    idx.resolve({
      namespace: "example",
      id: "users-governance",
      version: "3",
      expectedEntryDigest: pPub.entryDigest,
    }),
  ).toMatchObject({ ok: false, code: "stale-entry-digest" });
  expect(
    idx.resolve({
      namespace: "example",
      id: "users-governance",
      version: "3",
      expectedEntryDigest: p3.entryDigest,
      expectedGovernanceDigest: G2_DIGEST,
    }),
  ).toMatchObject({ ok: false, code: "digest-mismatch" });

  // kills: rejecting v3, overwriting v2, or caller-edit mutating stored envelope/indexEntry
  expect(
    idx.resolve({
      namespace: "example",
      id: "users-governance",
      version: "3",
      expectedEntryDigest: p3.entryDigest,
    }),
  ).toMatchObject({ ok: true, assetBytes: s3.bytes });
  expect(
    idx.resolve({
      namespace: "example",
      id: "users-governance",
      version: "2",
      expectedEntryDigest: pPub.entryDigest,
    }),
  ).toMatchObject({
    ok: true,
    assetBytes: s2.bytes,
    envelope: { name: "users-governance@2" },
    indexEntry: { companion: { id: "engram.users-governance" } },
  });
});
