// Lot 2a: discriminated annotation-trust entry types (§6, §7 row 2a).
import type { OntologyTemplateEnvelopeRef } from "../metamodel-contracts.js";
import type { template, validation } from "./profile.js";
import type { Digest, Pin } from "../ontology-guardian/types.js";
import type { Confidence, GraphEdge, OntologyCitation, OntologyEvidenceRecord } from "../types.js";
export type Channel = "pipeline" | "mcp" | "ui-select" | "ui-thumbs" | "mcp-elicitation" | "import";
export type RejectReason = "wrong-subject" | "contradicted" | "insufficient-evidence" | "obsolete" | "duplicate" | "out-of-scope";
export type Value = { kind: "class"; vocabulary: Pin; code: string } | { kind: "note"; text: string };
export type SourceLink = { sourceRef: string; sourceDigest: Digest };
export type AI = { kind: "ai"; actorRef: string; model: string } & (
  | { channel: "pipeline"; modelVersion: string | null; promptDigest: Digest; runRef: string; effort?: string; promptId?: string; inputDigest?: Digest }
  | { channel: "mcp"; clientRef: string; sessionRef?: string });
export type Elicitation = { clientRef: string; requestRef: string; assurance: "server-asserted" } & (
  | { trace: "complete"; protocolRevision: string; sessionRef: string; requestDigest: Digest; responseDigest: Digest; startedAt: string; endedAt: string; auditRef: string }
  | { trace: "partial"; legacyRow: SourceLink });
export type Human = { kind: "human"; actorRef: string; receiptRef: string } & (
  | { channel: Extract<Channel, `ui-${string}`> }
  | { channel: "mcp-elicitation"; elicitation: Elicitation });
export type Adapter = { kind: "adapter"; actorRef: string; channel: "import" };
export type Shown = { proposal: "shown"; shown: number[] };
export type Exposure = Shown | { proposal: "not-shown" } | { proposal: "unknown" };
export type Assertion = { kind: "assert"; value: Value };
export type Decide = { kind: "confirm"; judged: number } | { kind: "correct"; judged: number; value: Value } | { kind: "reject"; judged: number; reason: RejectReason };
export type Inquire = { kind: "uncertain"; judged: number } | { kind: "needs-elicitation"; judged: number; question: string };
export type PreservedSource = SourceLink & { batchRef?: string; reportedSource?: string; reportedClass?: string; reportedNote?: string; reportedModel?: string; pendingHuman?: boolean };
export type Evidence = { citations: OntologyCitation[]; evidenceRefs: OntologyEvidenceRecord["id"][]; sourceRows?: SourceLink[]; extraction?: { confidence?: Confidence; confidence_score?: GraphEdge["confidence_score"] } };
export type StreamRef = { scopeRef: string; subjectRef: string; slot: string };
// Lot 3 derived-read types (§3, §7 row 3). ReadModel is §6 verbatim, defined
// once here; pairs and matchingRejections stay empty until lots 5 and 4a fill them.
export type Validation = (typeof validation.states)[number];
export type Trust = "provisional" | "trusted" | "withheld";
export type EvaluationRole = "blind" | "known-error" | "anchored" | "unscored";
export type ValueAt = { revision: number; subjectVersion: string; value: Value; validation: Validation;
  author: AI | Human; contentDigest: Digest; createdAt: string; lastReviewedAt: string | null };
export type HumanHead = { decision: number; by: Human; exposure: Exposure; decidedAt: string } & (
  | { kind: "value"; action: "assert"; selected: ValueAt; judged: null }
  | { kind: "value"; action: "confirm" | "correct"; selected: ValueAt; judged: ValueAt }
  | { kind: "veto"; action: "reject"; judged: ValueAt; reason: RejectReason });
export type EvaluationPair = { ai: ValueAt & { author: AI }; human: number; channel: Channel;
  humanValue: Value | { rejected: RejectReason }; role: EvaluationRole };
export type ReadModel = { stream: StreamRef; revision: number; subjectVersion: string;
  ai: (ValueAt & { author: AI }) | null; human: HumanHead | null;
  matchingRejections: { decision: number; judged: number; subjectVersion: string; reason: RejectReason }[];
  unverifiedSources: { revision: number; row: PreservedSource }[]; pairs: EvaluationPair[] } & (
  | { trust: "withheld"; effective: null }
  | { trust: Exclude<Trust, "withheld">; effective: ValueAt });
export type RequestId = string & { readonly __requestUuid: unique symbol };
export type TemplateRef = OntologyTemplateEnvelopeRef & { readonly lineage: typeof template.lineage };
export type Entry = {
  stream: StreamRef; template: TemplateRef; profile: Pin; pinsDigest: Digest; resultDigest: Digest;
  revision: number; expectedRevision: number; replacesHuman: number | null;
  requestId: RequestId; commandDigest: Digest; contentDigest: Digest; recorderRef: string;
  policyRef: string; authorityReceiptRef: string; recordedAt: string; observedAt?: string;
  source?: SourceLink; evidence: Evidence; classReasonCode?: string; rationale?: string;
} & (
  | { subjectVersion: string; actor: AI; action: (Assertion & { ambiguous?: boolean }) | Inquire }
  | { subjectVersion: string; actor: Human; exposure: Shown; action: Decide }
  | { subjectVersion: string; actor: Human; exposure: Exposure; action: Assertion | Inquire }
  | { subjectVersion: string | null; actor: Adapter; action: { kind: "preserve-source"; row: PreservedSource } });
