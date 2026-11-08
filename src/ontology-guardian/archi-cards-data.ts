// Proposed archi-cards@1 presentation contract tables, JCS preimage and draft G0 registry record
// (spec/SPEC_EVOL_ARCHI_CARDS.md §3.1, §3.3–§3.6, §3.8–§3.10).
import { digestOfPreimage } from "./canonical.js";
import type { OntologyPayload, RegistryEnvelope } from "./catalog.js";
import { pinsDigestOf } from "./digests.js";
import type { GovernedSchema } from "./diagram-schemas.js";
import type { Digest, OntologyRecord, Pin } from "./types.js";
import type { ArchiLanguage, ArchiVerbKey, ArchiVerbTable } from "./archi-check.js";
import { ARCHI_CORPUS_DIGEST, ARCHI_CORPUS_REF } from "./archi-profile.js";
import {
  ARCHI_FONT_METRICS,
  ARCHI_FONT_METRICS_SHA256,
  type ArchiFontMetricsTable,
} from "./archi-metrics.js";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/** proposed: entity kinds of archi@1 (§2.1, §3.5). */
export type ArchiKind =
  | "actor"
  | "system"
  | "repo"
  | "package"
  | "component"
  | "runtime"
  | "service"
  | "api"
  | "store"
  | "artifact"
  | "host";

/** proposed: card (non-container) entity kinds of archi@1 (§3.2, §3.3). */
export type ArchiCardKind =
  | "actor"
  | "component"
  | "runtime"
  | "service"
  | "api"
  | "store"
  | "artifact";

/** proposed: container (zone) entity kinds of archi@1 (§2.1, §3.2). */
export type ArchiContainerKind = "system" | "repo" | "package" | "host";

/** proposed: icon names used by archi-cards@1 (§3.5). */
export type ArchiIconName = "people" | "robot" | "window" | "link" | "server" | "db" | "cloud";

/** proposed: lifecycle values in worst-status order (§3.6). */
export type ArchiLifecycle = "current" | "proposed" | "retired";

/** proposed: per-language label table of archi-cards@1 (§3.10). */
export interface ArchiLanguageLabels {
  readonly kind: Readonly<Record<ArchiKind, string>>;
  readonly form: Readonly<Record<string, string>>;
  readonly footer: {
    readonly repo: string;
    readonly owner: string;
    readonly writtenBy: string;
    readonly operatedBy: string;
    readonly several: string;
  };
  readonly verb: ArchiVerbTable;
  readonly status: {
    readonly proposed: string;
    readonly retired: string;
  };
  readonly links: string;
  readonly toggle?: string;
}

/** proposed: card detail rule entry (§3.3). */
export interface ArchiDetailRule {
  readonly relation: string;
  readonly direction: "out" | "in";
  readonly prefix: Readonly<Record<ArchiLanguage, string>>;
}

/** proposed: [availablePx, allocatedLines] tuple (§3.9). */
export type ArchiSlotAllocation = readonly [number, number];

/** proposed: §3.9 clamped slot allocation table. */
export interface ArchiAllocationTable {
  readonly card: {
    readonly kicker: ArchiSlotAllocation;
    readonly title: ArchiSlotAllocation;
    readonly body: ArchiSlotAllocation;
    readonly detail: ArchiSlotAllocation;
    readonly footer: ArchiSlotAllocation;
  };
  readonly folded: {
    readonly kicker: ArchiSlotAllocation;
    readonly title: ArchiSlotAllocation;
    readonly subtitle: ArchiSlotAllocation;
    readonly footer: ArchiSlotAllocation;
  };
  readonly expanded: {
    readonly kicker: ArchiSlotAllocation;
    readonly title: ArchiSlotAllocation;
    readonly subtitle: ArchiSlotAllocation;
    readonly footer: ArchiSlotAllocation;
  };
}

const ARCHI_CARDS_SCHEMA_OBJECT: Record<string, unknown> = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "engram:archi-cards-schema/1",
  title: "archi-cards@1 contract",
  type: "object",
  required: [
    "descriptor",
    "labels",
    "icons",
    "detail",
    "verbOrder",
    "status",
    "allocation",
    "lineRule",
    "metrics",
  ],
  additionalProperties: false,
};

const ARCHI_CARDS_SCHEMA_DIGEST: Digest = digestOfPreimage(ARCHI_CARDS_SCHEMA_OBJECT);

/** proposed: governed schema descriptor for archi-cards@1 (§3.1). */
export const ARCHI_CARDS_SCHEMA_V1: GovernedSchema = deepFreeze({
  pin: {
    id: "archi-cards-schema",
    version: "1",
    contentDigest: ARCHI_CARDS_SCHEMA_DIGEST,
  },
  schema: ARCHI_CARDS_SCHEMA_OBJECT,
  digest: ARCHI_CARDS_SCHEMA_DIGEST,
});

/** proposed: contract descriptor for archi-cards@1 (§3.1). */
export const ARCHI_CARDS_DESCRIPTOR = deepFreeze({
  id: "archi-cards@1",
  artifactKind: "contract",
  schemaPin: ARCHI_CARDS_SCHEMA_V1.pin,
  compatibilityMatrixVersion: "1",
} as const);

/** proposed: French and English label tables (§3.10). */
export const ARCHI_CARDS_LABELS: Readonly<Record<ArchiLanguage, ArchiLanguageLabels>> = deepFreeze({
  fr: {
    kind: {
      actor: "Acteur",
      system: "Système",
      repo: "Repo",
      package: "Paquet",
      component: "Composant",
      runtime: "Exécution",
      service: "Service",
      api: "API",
      store: "Stockage",
      artifact: "Artefact",
      host: "Hôte",
    },
    form: {
      human: "Humain",
      agent: "Agent",
      team: "Équipe",
      org: "Organisation",
      library: "Lib",
      plugin: "Plugin",
      app: "App",
      cli: "CLI",
      "mcp-server": "MCP",
      daemon: "Démon",
      job: "Job",
      hook: "Hook",
      mcp: "MCP",
      http: "HTTP",
      "api.cli": "Commandes",
      jsonl: "JSONL",
      file: "Fichier",
      database: "Base",
      "object-store": "Objets",
      graph: "Graphe",
      skill: "Skill",
      manifest: "Manifeste",
      schema: "Schéma",
      doc: "Doc",
      workstation: "Poste",
      cluster: "Cluster",
      "cloud-project": "Projet cloud",
    },
    footer: {
      repo: "repo",
      owner: "propriétaire",
      writtenBy: "écrit par",
      operatedBy: "opéré par",
      several: "plusieurs",
    },
    verb: {
      invokes: "lance",
      "invokes.poll": "sondage",
      consumesApi: "appelle",
      deployedAs: "déployé comme",
      dependsOn: "dépend de",
      documents: "documente",
      executedBy: "exécuté par",
      loadedBy: "chargé par",
      "accesses.append": "ajoute à",
      "accesses.write": "écrit",
    },
    status: {
      proposed: "cible",
      retired: "retiré",
    },
    links: "liaisons",
  },
  en: {
    kind: {
      actor: "Actor",
      system: "System",
      repo: "Repo",
      package: "Package",
      component: "Component",
      runtime: "Runtime",
      service: "Service",
      api: "API",
      store: "Store",
      artifact: "Artifact",
      host: "Host",
    },
    form: {
      human: "Human",
      agent: "Agent",
      team: "Team",
      org: "Organization",
      library: "Lib",
      plugin: "Plugin",
      app: "App",
      cli: "CLI",
      "mcp-server": "MCP",
      daemon: "Daemon",
      job: "Job",
      hook: "Hook",
      mcp: "MCP",
      http: "HTTP",
      "api.cli": "Commands",
      jsonl: "JSONL",
      file: "File",
      database: "Database",
      "object-store": "Objects",
      graph: "Graph",
      skill: "Skill",
      manifest: "Manifest",
      schema: "Schema",
      doc: "Doc",
      workstation: "Workstation",
      cluster: "Cluster",
      "cloud-project": "Cloud project",
    },
    footer: {
      repo: "repo",
      owner: "owner",
      writtenBy: "written by",
      operatedBy: "operated by",
      several: "several",
    },
    verb: {
      invokes: "launches",
      "invokes.poll": "polls",
      consumesApi: "calls",
      deployedAs: "deployed as",
      dependsOn: "depends on",
      documents: "documents",
      executedBy: "run by",
      loadedBy: "loaded by",
      "accesses.append": "appends to",
      "accesses.write": "writes",
    },
    status: {
      proposed: "target",
      retired: "retired",
    },
    links: "links",
  },
});

/** proposed: icon mapping by entity kind and actor form (§3.5). */
export const ARCHI_CARDS_ICONS = deepFreeze({
  actor: { default: "people" as const, agent: "robot" as const },
  system: "window" as const,
  repo: "link" as const,
  package: "link" as const,
  component: "link" as const,
  runtime: "server" as const,
  service: "server" as const,
  api: "link" as const,
  store: "db" as const,
  artifact: "window" as const,
  host: "cloud" as const,
});

/** proposed: detail derivation table by card kind (§3.3). */
export const ARCHI_CARDS_DETAIL: Readonly<Record<ArchiCardKind, ArchiDetailRule>> = deepFreeze({
  component: { relation: "executedBy", direction: "out", prefix: { fr: "exécuté par", en: "run by" } },
  artifact: { relation: "loadedBy", direction: "out", prefix: { fr: "chargé par", en: "loaded by" } },
  runtime: { relation: "runsOn", direction: "out", prefix: { fr: "sur", en: "on" } },
  service: { relation: "runsOn", direction: "out", prefix: { fr: "sur", en: "on" } },
  api: { relation: "providesApi", direction: "in", prefix: { fr: "fourni par", en: "provided by" } },
  store: { relation: "accesses.read", direction: "in", prefix: { fr: "lu par", en: "read by" } },
  actor: { relation: "uses", direction: "out", prefix: { fr: "utilise", en: "uses" } },
});

/** proposed: summary verb ordering (§3.8). */
export const ARCHI_VERB_ORDER: readonly ArchiVerbKey[] = deepFreeze([
  "invokes",
  "invokes.poll",
  "consumesApi",
  "deployedAs",
  "loadedBy",
  "executedBy",
  "dependsOn",
  "documents",
  "accesses.append",
  "accesses.write",
]);

/** proposed: lifecycle precedence order (current < proposed < retired; §3.6). */
export const ARCHI_STATUS_ORDER: readonly ArchiLifecycle[] = deepFreeze([
  "current",
  "proposed",
  "retired",
]);

/** proposed: §3.9 clamped slot allocation table (px × lines). */
export const ARCHI_CARDS_ALLOCATION: ArchiAllocationTable = deepFreeze({
  card: {
    kicker: [358, 1],
    title: [358, 1],
    body: [428, 1],
    detail: [428, 1],
    footer: [428, 1],
  },
  folded: {
    kicker: [290, 1],
    title: [290, 1],
    subtitle: [396, 2],
    footer: [428, 1],
  },
  expanded: {
    kicker: [314, 1],
    title: [314, 2],
    subtitle: [434, 2],
    footer: [434, 1],
  },
});

/** proposed: DS line layout + KIT measurement parameters (§3.9). */
export const ARCHI_LINE_RULE = deepFreeze({
  breakAt: "space",
  wrap: "greedy",
  unknownGlyphWidth: 0.7,
  baselinePadPx: 2,
  kicker: { metric: "body", sizePx: 22, letterSpacingEm: 0.04, uppercase: true },
  title: { metric: "title", sizePx: 32 },
  body: { metric: "body", sizePx: 24 },
  detail: { metric: "body", sizePx: 24 },
  subtitle: { metric: "body", sizePx: 24 },
  footer: { metric: "title", sizePx: 24 },
} as const);

/** proposed: closed preimage of the archi-cards@1 contract (§3.1). */
export interface ArchiCardsContent {
  readonly descriptor: typeof ARCHI_CARDS_DESCRIPTOR;
  readonly labels: Readonly<Record<ArchiLanguage, ArchiLanguageLabels>>;
  readonly icons: typeof ARCHI_CARDS_ICONS;
  readonly detail: Readonly<Record<ArchiCardKind, ArchiDetailRule>>;
  readonly verbOrder: readonly ArchiVerbKey[];
  readonly status: readonly ArchiLifecycle[];
  readonly allocation: ArchiAllocationTable;
  readonly lineRule: typeof ARCHI_LINE_RULE;
  readonly metrics: {
    readonly sha256: typeof ARCHI_FONT_METRICS_SHA256;
    readonly table: ArchiFontMetricsTable;
  };
}

/** proposed: closed JCS preimage of archi-cards@1 (§3.1). */
export const ARCHI_CARDS_CONTENT: ArchiCardsContent = deepFreeze({
  descriptor: ARCHI_CARDS_DESCRIPTOR,
  labels: ARCHI_CARDS_LABELS,
  icons: ARCHI_CARDS_ICONS,
  detail: ARCHI_CARDS_DETAIL,
  verbOrder: ARCHI_VERB_ORDER,
  status: ARCHI_STATUS_ORDER,
  allocation: ARCHI_CARDS_ALLOCATION,
  lineRule: ARCHI_LINE_RULE,
  metrics: {
    sha256: ARCHI_FONT_METRICS_SHA256,
    table: ARCHI_FONT_METRICS,
  },
});

/** proposed: JCS SHA-256 content digest of ARCHI_CARDS_CONTENT (§3.1). */
export const ARCHI_CARDS_CONTENT_DIGEST: Digest = digestOfPreimage(ARCHI_CARDS_CONTENT);

/** proposed: exact Pin for archi-cards@1 (§3.1, §5.2, §5.4). */
export const ARCHI_CARDS_PIN: Pin = deepFreeze({
  id: "archi-cards",
  version: "1",
  contentDigest: ARCHI_CARDS_CONTENT_DIGEST,
});

const ARCHI_CARDS_DIGESTS = {
  contentDigest: ARCHI_CARDS_CONTENT_DIGEST,
  pinsDigest: pinsDigestOf({ layers: [ARCHI_CARDS_PIN] }),
  resultEvidence: { evidenceState: "unresolved" as const },
};

/** proposed: draft G0 OntologyRecord for archi-cards@1 (§3.1). */
export const RECORD_ARCHI_CARDS_V1: OntologyRecord = deepFreeze({
  namespace: "diagram",
  id: "archi-cards",
  version: ARCHI_CARDS_PIN.version,
  owner: "engram",
  lifecycle: "draft",
  completeness: "complete",
  visibility: "public",
  profileShape: "mechanism-descriptor",
  artifactKind: "contract",
  profileRef: { canonicalRef: "engram:archi-cards@1", contentDigest: ARCHI_CARDS_CONTENT_DIGEST },
  corpusRef: { ref: ARCHI_CORPUS_REF, digest: ARCHI_CORPUS_DIGEST },
  digests: ARCHI_CARDS_DIGESTS,
  lineage: { parents: [], mappings: [], migrations: [] },
  consumers: [],
});

/** proposed: draft G0 OntologyPayload for archi-cards@1 (§3.1). */
export const PAYLOAD_ARCHI_CARDS_V1: OntologyPayload = deepFreeze({
  canonicalRef: "engram:archi-cards@1",
  namespace: "diagram",
  owner: "engram",
  profileShape: "mechanism-descriptor",
  artifactKind: "contract",
  profilePin: ARCHI_CARDS_PIN,
  stack: [ARCHI_CARDS_PIN],
  digests: ARCHI_CARDS_DIGESTS,
  ruleSheets: [],
  lifecycle: "draft",
  provenance: { sourceRef: "spec/SPEC_EVOL_ARCHI_CARDS.md", sourceRevision: "e46d822009e99bdb4f1e471a3cc2109bdd42ed1e" },
  lineage: { parents: [], mappings: [], migrations: [] },
  conflictPolicy: "engram:g0-conflicts@1",
  completeness: "complete",
  corpusRef: { ref: ARCHI_CORPUS_REF, digest: ARCHI_CORPUS_DIGEST },
  receipts: [],
  migrations: [],
  consumers: [],
  compatibility: {
    renderer: "transitional:ds-diagram-core-executor-unqualified",
    adapter: "transitional:ds-schema-adapter-unqualified",
  },
  visibility: "public",
  linkedTools: [],
  artifactBinding: {
    artifactKind: "contract",
    schemaPin: ARCHI_CARDS_SCHEMA_V1.pin,
    compatibilityMatrixVersion: "1",
  },
});

/** proposed: draft G0 RegistryEnvelope for archi-cards@1 (§3.1). */
export const ENVELOPE_ARCHI_CARDS_V1: RegistryEnvelope = deepFreeze({
  format: "sentropic.registry-entry/v1",
  contractVersion: "1.1.4",
  kind: "ontology",
  id: "engram-archi-cards-1",
  name: "archi-cards@1",
  description: "Governed archi-cards@1 presentation contract (S1 draft).",
  entryVersion: "1",
  publisher: { packageName: "engram-diagram-lot", packageVersion: "0.1.0" },
  compatibility: {
    entryContract: "1.1.4",
    packages: [],
    schemaProfiles: [`${ARCHI_CARDS_SCHEMA_V1.pin.id}/${ARCHI_CARDS_SCHEMA_V1.pin.version}`],
    requiredHostFeatures: ["ontology-descriptors"],
    optionalHostFeatures: [],
  },
  parameters: {
    schemaVersion: ARCHI_CARDS_SCHEMA_V1.pin.version,
    schema: { $ref: `engram:${ARCHI_CARDS_SCHEMA_V1.pin.id}` },
    defaults: {},
  },
  bindings: [
    {
      key: "contract",
      contract: `engram:archi-cards/1#sha256=${ARCHI_CARDS_SCHEMA_V1.digest}`,
      required: true,
    },
  ],
  assets: [
    {
      role: "contract-data",
      path: "contracts/archi-cards-1.json",
      mediaType: "application/json",
      sha256: ARCHI_CARDS_CONTENT_DIGEST,
    },
  ],
  ontology: PAYLOAD_ARCHI_CARDS_V1,
});
