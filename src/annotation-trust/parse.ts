// Lot 2b: closed runtime parser for lot 2a entries (§6, §7 row 2b).
import { assertExactKeys, SchemaFailure } from "../../engram-memory/dist/validation.js";
import { isNonEmptyStr, isRecord, isTrimmedStr } from "../model-schemas.js";
import { isExactVersion, pinProblem } from "../ontology-guardian/admission.js";
import { digestOfPreimage } from "../ontology-guardian/canonical.js";
import { isDigest, type Pin } from "../ontology-guardian/types.js";
import { isDigest as isShaDigest, isInstant } from "../time-reference/format.js";
import { VALID_CONFIDENCES } from "../validate.js";
import { TEMPLATE_REF_KEYS } from "./profile.js";
import type { Entry } from "./types.js";
const fail = (msg: string): never => { throw new SchemaFailure(`annotation-trust: ${msg}`); };
const need: (cond: unknown, msg: string) => asserts cond = (cond, msg) => { if (!cond) fail(msg); };
const rev = (v: unknown, min: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= 2147483647;
const link = (v: unknown, what: string): void => { assertExactKeys(v, what, ["sourceRef", "sourceDigest"], ["sourceRef", "sourceDigest"]); need(isTrimmedStr(v.sourceRef) && isDigest(v.sourceDigest), `${what} source malformed`); };
const checkValue = (v: unknown): void => {
  need(isRecord(v) && (v.kind === "class" || v.kind === "note"), "value kind malformed");
  if (v.kind === "class") { assertExactKeys(v, "value", ["kind", "vocabulary", "code"], ["kind", "vocabulary", "code"]); need(pinProblem(v.vocabulary as unknown as Pin, "vocabulary") === null && isTrimmedStr(v.code), "class value malformed"); }
  else { assertExactKeys(v, "value", ["kind", "text"], ["kind", "text"]); need(isNonEmptyStr(v.text), "text malformed"); }
};
export function parseEntry(value: unknown, opts?: { readonly live?: boolean }): Entry {
  const live = opts?.live ?? true; need(isRecord(value), "entry must be an object");
  assertExactKeys(value, "entry", ["stream", "template", "profile", "pinsDigest", "resultDigest", "revision", "expectedRevision", "replacesHuman", "requestId", "commandDigest", "contentDigest", "recorderRef", "policyRef", "authorityReceiptRef", "recordedAt", "observedAt", "subjectVersion", "actor", "exposure", "action", "source", "evidence", "classReasonCode", "rationale"], ["stream", "template", "profile", "pinsDigest", "resultDigest", "revision", "expectedRevision", "replacesHuman", "requestId", "commandDigest", "contentDigest", "recorderRef", "policyRef", "authorityReceiptRef", "recordedAt", "subjectVersion", "actor", "action", "evidence"]);
  assertExactKeys(value.stream, "stream", ["scopeRef", "subjectRef", "slot"], ["scopeRef", "subjectRef", "slot"]);
  need(isTrimmedStr(value.stream.scopeRef) && isTrimmedStr(value.stream.subjectRef) && isTrimmedStr(value.stream.slot), "stream refs malformed");
  assertExactKeys(value.template, "template", TEMPLATE_REF_KEYS, TEMPLATE_REF_KEYS);
  need(value.template.lineage === "engram" && isTrimmedStr(value.template.templateId) && isExactVersion(value.template.templateVersion) && typeof value.template.templateDigestSha256 === "string" && isShaDigest(value.template.templateDigestSha256), "template pin malformed");
  need(pinProblem(value.profile as unknown as Pin, "profile") === null, "profile pin malformed"); need(isDigest(value.pinsDigest) && isDigest(value.resultDigest) && isDigest(value.commandDigest), "entry digests malformed");
  need(rev(value.revision, 1), "revision malformed"); const revision = value.revision;
  need(rev(value.expectedRevision, 0) && value.expectedRevision === revision - 1, "expectedRevision malformed");
  need(value.replacesHuman === null || (rev(value.replacesHuman, 1) && value.replacesHuman < revision), "replacesHuman malformed");
  need(typeof value.requestId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.requestId), "requestId malformed"); need(isTrimmedStr(value.recorderRef) && isTrimmedStr(value.policyRef) && isTrimmedStr(value.authorityReceiptRef), "recorder refs malformed");
  need(isInstant(value.recordedAt), "recordedAt malformed"); need(value.observedAt === undefined || isInstant(value.observedAt), "observedAt malformed"); need((value.classReasonCode === undefined || isTrimmedStr(value.classReasonCode)) && (value.rationale === undefined || isNonEmptyStr(value.rationale)), "reason fields malformed");
  if (value.source !== undefined) link(value.source, "source");
  need(isRecord(value.actor) && (value.actor.kind === "ai" || value.actor.kind === "human" || value.actor.kind === "adapter"), "actor kind malformed");
  const actor = value.actor; need(isTrimmedStr(actor.actorRef), "actorRef malformed");
  need(isRecord(value.action) && isTrimmedStr(value.action.kind), "action kind malformed"); const action = value.action;
  if (actor.kind === "ai") {
    need((actor.channel === "pipeline" || actor.channel === "mcp") && isTrimmedStr(actor.model) && value.exposure === undefined, "ai actor malformed");
    need(action.kind === "assert" || action.kind === "uncertain" || action.kind === "needs-elicitation", "ai cannot decide");
    if (actor.channel === "pipeline") {
      assertExactKeys(actor, "actor.pipeline", ["kind", "actorRef", "model", "channel", "modelVersion", "promptDigest", "runRef", "effort", "promptId", "inputDigest"], ["kind", "actorRef", "model", "channel", "runRef"]);
      need(Object.hasOwn(actor, "modelVersion") && (actor.modelVersion === null || isTrimmedStr(actor.modelVersion)), "pipeline modelVersion malformed");
      need(isDigest(actor.promptDigest), "pipeline promptDigest malformed"); need(isTrimmedStr(actor.runRef) && (actor.effort === undefined || isTrimmedStr(actor.effort)) && (actor.promptId === undefined || isTrimmedStr(actor.promptId)) && (actor.inputDigest === undefined || isDigest(actor.inputDigest)), "pipeline refs malformed");
    } else { assertExactKeys(actor, "actor.mcp", ["kind", "actorRef", "model", "channel", "clientRef", "sessionRef"], ["kind", "actorRef", "model", "channel", "clientRef"]); need(isTrimmedStr(actor.clientRef) && (actor.sessionRef === undefined || isTrimmedStr(actor.sessionRef)), "clientRef malformed"); }
  } else if (actor.kind === "human") {
    need((actor.channel === "ui-select" || actor.channel === "ui-thumbs" || actor.channel === "mcp-elicitation") && isTrimmedStr(actor.receiptRef), "human actor malformed");
    assertExactKeys(value.exposure, "exposure", ["proposal", "shown"], ["proposal"]);
    need(isTrimmedStr(value.exposure.proposal) && (value.exposure.proposal === "shown" || value.exposure.proposal === "not-shown" || value.exposure.proposal === "unknown"), "exposure proposal malformed"); const exposure = value.exposure;
    if (exposure.proposal === "shown") need(Array.isArray(exposure.shown) && exposure.shown.every((n) => rev(n, 1)), "exposure.shown malformed");
    else need(!Object.hasOwn(exposure, "shown"), "exposure.shown belongs to shown only");
    if (actor.channel === "mcp-elicitation") {
      assertExactKeys(actor, "actor.mcp-elicitation", ["kind", "actorRef", "receiptRef", "channel", "elicitation"], ["kind", "actorRef", "receiptRef", "channel", "elicitation"]);
      const common = ["clientRef", "requestRef", "assurance", "trace"], arm = isRecord(actor.elicitation) && actor.elicitation.trace === "complete" ? [...common, "protocolRevision", "sessionRef", "requestDigest", "responseDigest", "startedAt", "endedAt", "auditRef"] : [...common, "legacyRow"];
      assertExactKeys(actor.elicitation, "elicitation", arm, arm);
      need(isTrimmedStr(actor.elicitation.clientRef) && isTrimmedStr(actor.elicitation.requestRef) && actor.elicitation.assurance === "server-asserted", "elicitation binding malformed"); const elicitation = actor.elicitation;
      need(elicitation.trace === "complete" || elicitation.trace === "partial", "elicitation trace malformed");
      if (elicitation.trace === "complete") { need(isTrimmedStr(elicitation.protocolRevision) && isTrimmedStr(elicitation.sessionRef) && isTrimmedStr(elicitation.auditRef) && isDigest(elicitation.requestDigest) && isDigest(elicitation.responseDigest) && isInstant(elicitation.startedAt) && isInstant(elicitation.endedAt), "complete elicitation fields malformed"); }
      else link(elicitation.legacyRow, "legacyRow");
      if (live) need(elicitation.trace !== "partial", "live write refuses a partial trace");
    } else assertExactKeys(actor, "actor.human-ui", ["kind", "actorRef", "receiptRef", "channel"], ["kind", "actorRef", "receiptRef", "channel"]);
    if (live) need(exposure.proposal !== "unknown", "live write refuses unknown exposure");
    if (action.kind === "confirm" || action.kind === "correct" || action.kind === "reject") need(exposure.proposal === "shown" && Array.isArray(exposure.shown) && exposure.shown.includes(action.judged as number), "verdict exposure must list the judged revision");
  } else {
    assertExactKeys(actor, "actor.adapter", ["kind", "actorRef", "channel"], ["kind", "actorRef", "channel"]);
    need(actor.channel === "import" && value.exposure === undefined && action.kind === "preserve-source", "adapter act malformed");
  }
  need(actor.kind === "human" || value.replacesHuman === null, "replacesHuman belongs to a human write");
  need(actor.kind === "adapter" ? value.subjectVersion === null || isTrimmedStr(value.subjectVersion) : isTrimmedStr(value.subjectVersion), "subjectVersion malformed");
  const jd = (): void => { need(rev(action.judged, 1) && action.judged < revision, "judged malformed"); };
  if (action.kind === "assert") { assertExactKeys(action, "action.assert", actor.kind === "ai" ? ["kind", "value", "ambiguous"] : ["kind", "value"], ["kind", "value"]); checkValue(action.value); need(action.ambiguous === undefined || typeof action.ambiguous === "boolean", "ambiguous malformed"); }
  else if (action.kind === "uncertain" || action.kind === "confirm") { assertExactKeys(action, `action.${action.kind}`, ["kind", "judged"], ["kind", "judged"]); jd(); }
  else if (action.kind === "needs-elicitation") { assertExactKeys(action, "action.needs-elicitation", ["kind", "judged", "question"], ["kind", "judged", "question"]); jd(); need(isNonEmptyStr(action.question), "question malformed"); }
  else if (action.kind === "correct") { assertExactKeys(action, "action.correct", ["kind", "judged", "value"], ["kind", "judged", "value"]); jd(); checkValue(action.value); }
  else if (action.kind === "reject") { assertExactKeys(action, "action.reject", ["kind", "judged", "reason"], ["kind", "judged", "reason"]); jd(); need(typeof action.reason === "string" && ["wrong-subject", "contradicted", "insufficient-evidence", "obsolete", "duplicate", "out-of-scope"].includes(action.reason), "reason malformed"); }
  else if (action.kind === "preserve-source") {
    need(actor.kind === "adapter", "only the adapter preserves a source"); assertExactKeys(action, "action.preserve-source", ["kind", "row"], ["kind", "row"]);
    const row = action.row; assertExactKeys(row, "row", ["sourceRef", "sourceDigest", "batchRef", "reportedSource", "reportedClass", "reportedNote", "reportedModel", "pendingHuman"], ["sourceRef", "sourceDigest"]);
    need(isTrimmedStr(row.sourceRef) && isDigest(row.sourceDigest) && (row.batchRef === undefined || isTrimmedStr(row.batchRef)) && (row.reportedSource === undefined || isTrimmedStr(row.reportedSource)) && (row.reportedClass === undefined || isTrimmedStr(row.reportedClass)) && (row.reportedNote === undefined || isNonEmptyStr(row.reportedNote)) && (row.reportedModel === undefined || isTrimmedStr(row.reportedModel)) && (row.pendingHuman === undefined || typeof row.pendingHuman === "boolean"), "row fields malformed");
  } else fail(`unknown action kind ${String(action.kind)}`);
  assertExactKeys(value.evidence, "evidence", ["citations", "evidenceRefs", "sourceRows", "extraction"], ["citations", "evidenceRefs"]); const evidence = value.evidence;
  need(Array.isArray(evidence.citations) && evidence.citations.every((c) => isRecord(c) && isTrimmedStr(c.source_file)) && Array.isArray(evidence.evidenceRefs) && evidence.evidenceRefs.every((r) => isTrimmedStr(r)), "evidence malformed");
  if (evidence.sourceRows !== undefined) { need(Array.isArray(evidence.sourceRows), "sourceRows malformed"); for (const r of evidence.sourceRows) link(r, "sourceRows"); }
  if (evidence.extraction !== undefined) {
    assertExactKeys(evidence.extraction, "extraction", ["confidence", "confidence_score"], []);
    need((evidence.extraction.confidence === undefined || (typeof evidence.extraction.confidence === "string" && VALID_CONFIDENCES.has(evidence.extraction.confidence))) && (evidence.extraction.confidence_score === undefined || typeof evidence.extraction.confidence_score === "number"), "extraction malformed");
  }
  const { contentDigest, ...rest } = value;
  need(contentDigest === digestOfPreimage(rest), "contentDigest mismatch");
  return value as unknown as Entry;
}
