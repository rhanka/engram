// Lot 3: closed §3 fold. Prior states come from ONE place: lot 1's published
// validation.transitions (profile.ts), looked up by each row's requires. Each row
// adds only what the profile cannot say (actor kind, self, selected-only states,
// owner); one guard (admits) checks every judging row. No hand-written state
// remains; every result state comes from its row. pairs (lot 5) and
// matchingRejections (lot 4a) stay empty until the pin publishes (§7 line 400).
import type { Pin } from "../ontology-guardian/types.js";
import { pinsEqual } from "../ontology-guardian/admission.js";
import { validation } from "./profile.js";
import type { AI, Entry, Exposure, Human, HumanHead, ReadModel, RejectReason, StreamRef, Validation, Value, ValueAt } from "./types.js";
type Transition = { action: Entry["action"]["kind"]; actor: Entry["actor"]["kind"]; owner: "3" | "4a";
  requires?: string; to: Validation | null; ambiguousTo?: Validation; self?: boolean;
  selectedOnly?: readonly Validation[] };
const TRANSITIONS: readonly Transition[] = [
  { action: "assert", actor: "ai", owner: "3", requires: "uncertain-or-ambiguous-assert", to: "unreviewed", ambiguousTo: "uncertain" },
  { action: "assert", actor: "human", owner: "3", requires: "new-human-value", to: "human-asserted" },
  { action: "uncertain", actor: "ai", owner: "3", requires: "uncertain-or-ambiguous-assert", to: "uncertain", self: true },
  { action: "uncertain", actor: "human", owner: "3", requires: "uncertain-or-ambiguous-assert", to: "uncertain" },
  { action: "needs-elicitation", actor: "ai", owner: "3", requires: "needs-elicitation", to: "awaiting-elicitation", self: true },
  { action: "needs-elicitation", actor: "human", owner: "3", requires: "needs-elicitation", to: "awaiting-elicitation" },
  { action: "confirm", actor: "human", owner: "3", requires: "confirm", to: "confirmed", selectedOnly: ["human-asserted"] },
  { action: "correct", actor: "human", owner: "4a", requires: "correct", to: "corrected", selectedOnly: ["human-asserted", "confirmed"] },
  { action: "reject", actor: "human", owner: "4a", requires: "reject", to: "rejected", selectedOnly: ["human-asserted", "confirmed"] },
  { action: "preserve-source", actor: "adapter", owner: "3", to: null },
];
const from = (r: Transition): readonly string[] =>
  validation.transitions.find((t) => (t.requires as readonly string[]).includes(r.requires ?? ""))?.from as readonly string[] ?? [];
const sameAuthor = (a: AI | Human, b: AI | Human): boolean =>
  a.kind === "ai" && b.kind === "ai" && a.channel === "pipeline" && b.channel === "pipeline" ? a.runRef === b.runRef
  : a.kind === "ai" && b.kind === "ai" && a.channel === "mcp" && b.channel === "mcp" && a.sessionRef !== undefined
    && b.sessionRef !== undefined ? a.sessionRef === b.sessionRef
  : a.actorRef === b.actorRef;
export function reduceEntries(entries: readonly Entry[], at: { stream: StreamRef; subjectVersion: string; vocabulary: Pin | null }): ReadModel {
  entries.forEach((e, i) => {
    if (e.revision !== i + 1 || e.expectedRevision !== i || e.stream.scopeRef !== at.stream.scopeRef
      || e.stream.subjectRef !== at.stream.subjectRef || e.stream.slot !== at.stream.slot)
      throw new Error(`annotation-trust: entry ${i} breaks the committed sequence`);
  });
  const values = new Map<number, ValueAt>();
  let aiRev: number | null = null;
  let head: { decision: number; selected: number; judged: number | null; action: "assert" | "confirm" | "correct";
    by: Human; exposure: Exposure; decidedAt: string } | null = null;
  const valuesEqual = (a: Value, b: Value): boolean => a.kind === "class" && b.kind === "class"
    ? a.code === b.code && pinsEqual([a.vocabulary], [b.vocabulary])
    : a.kind === "note" && b.kind === "note" ? a.text === b.text : false;
  const assertTo = TRANSITIONS.find((t) => t.action === "assert" && t.actor === "human")?.to as Validation;
  const unverified: ReadModel["unverifiedSources"] = [];
  const admits = (r: Transition, t: ValueAt | undefined, n: number, e: Entry): boolean => t !== undefined && t.subjectVersion === e.subjectVersion
    && (from(r) as readonly string[]).includes(t.validation) && (!r.selectedOnly?.includes(t.validation) || head?.selected === n)
    && (r.self !== true || sameAuthor(t.author, e.actor as AI | Human));
  const judged = (n: number, e: Entry, row: Transition): ValueAt => {
    const t = values.get(n);
    if (t === undefined || t.subjectVersion !== e.subjectVersion)
      throw new Error(`annotation-trust: revision ${e.revision} judges no eligible value`);
    if (!admits(row, t, n, e)) throw new Error(`annotation-trust: unlisted transition at revision ${e.revision}`);
    return t;
  };
  for (const e of entries) {
    const row = TRANSITIONS.find((t) => t.action === e.action.kind && t.actor === e.actor.kind);
    if (row === undefined) throw new Error(`annotation-trust: unlisted transition at revision ${e.revision}`);
    const replacing = e.actor.kind === "human" && (e.action.kind === "assert" || e.action.kind === "confirm" || e.action.kind === "correct")
      ? head?.decision ?? null : null;
    if (e.action.kind !== "reject" && e.replacesHuman !== replacing)
      throw new Error(`annotation-trust: revision ${e.revision} must set replacesHuman to ${replacing}`);
    if (e.actor.kind === "ai" && e.action.kind === "assert") {
      const amb = (e.action as { ambiguous?: boolean }).ambiguous === true;
      const v = (amb ? row.ambiguousTo ?? row.to : row.to) as Validation;
      values.set(e.revision, { revision: e.revision, subjectVersion: e.subjectVersion as string, value: e.action.value,
        validation: v, author: e.actor,
        contentDigest: e.contentDigest, createdAt: e.recordedAt, lastReviewedAt: null });
      aiRev = e.revision;
    } else if (e.actor.kind === "human" && e.action.kind === "assert") {
      const he = e as Entry & { subjectVersion: string; actor: Human; exposure: Exposure };
      values.set(e.revision, { revision: e.revision, subjectVersion: he.subjectVersion, value: e.action.value,
        validation: row.to as Validation, author: he.actor,
        contentDigest: e.contentDigest, createdAt: e.recordedAt, lastReviewedAt: null });
      head = { decision: e.revision, selected: e.revision, judged: null, action: "assert",
        by: he.actor, exposure: he.exposure, decidedAt: e.recordedAt };
    } else if (e.action.kind === "uncertain" || e.action.kind === "needs-elicitation") {
      const t = values.get(e.action.judged);
      if (!admits(row, t, e.action.judged, e))
        throw new Error(`annotation-trust: unlisted transition at revision ${e.revision}`);
      (t as ValueAt).validation = row.to as Validation;
    } else if (e.actor.kind === "human" && e.action.kind === "confirm") {
      const he = e as Entry & { actor: Human; exposure: Exposure };
      const t = judged(e.action.judged, e, row);
      t.validation = row.to as Validation;
      t.lastReviewedAt = e.recordedAt;
      head = { decision: e.revision, selected: e.action.judged, judged: e.action.judged, action: "confirm",
        by: he.actor, exposure: he.exposure, decidedAt: e.recordedAt };
    } else if (e.actor.kind === "human" && e.action.kind === "correct") {
      const he = e as Entry & { actor: Human; exposure: Exposure };
      const t = judged(e.action.judged, e, row);
      const v = e.action.value;
      if (v.kind !== t.value.kind || (v.kind === "class" && t.value.kind === "class" && !pinsEqual([v.vocabulary], [t.value.vocabulary])))
        throw new Error(`annotation-trust: revision ${e.revision} correct keeps its target's pin`);
      if (valuesEqual(t.value, e.action.value))
        throw new Error(`annotation-trust: revision ${e.revision} correct needs a different value`);
      t.validation = row.to as Validation;
      t.lastReviewedAt = e.recordedAt;
      values.set(e.revision, { revision: e.revision, subjectVersion: e.subjectVersion as string, value: e.action.value,
        validation: assertTo, author: he.actor,
        contentDigest: e.contentDigest, createdAt: e.recordedAt, lastReviewedAt: null });
      head = { decision: e.revision, selected: e.revision, judged: e.action.judged, action: "correct",
        by: he.actor, exposure: he.exposure, decidedAt: e.recordedAt };
    } else if (e.actor.kind === "adapter" && e.action.kind === "preserve-source") {
      unverified.push({ revision: e.revision, row: e.action.row });
    } else throw new Error(`annotation-trust: unlisted transition at revision ${e.revision}`);
  }
  const aiHead = aiRev === null ? null : values.get(aiRev) ?? null;
  const ai = aiHead !== null && aiHead.author.kind === "ai" ? { ...aiHead, author: aiHead.author } : null;
  const eligible = (v: ValueAt): boolean => v.subjectVersion === at.subjectVersion
    && (v.value.kind !== "class" || (at.vocabulary !== null && pinsEqual([v.value.vocabulary], [at.vocabulary])));
  const selected = head === null ? null : values.get(head.selected) ?? null;
  const human: HumanHead | null = head === null || selected === null ? null : head.action === "assert"
    ? { decision: head.decision, by: head.by, exposure: head.exposure, decidedAt: head.decidedAt,
      kind: "value", action: "assert", selected, judged: null }
    : { decision: head.decision, by: head.by, exposure: head.exposure, decidedAt: head.decidedAt,
      kind: "value", action: head.action, selected, judged: values.get(head.judged as number) as ValueAt };
  const base = { stream: at.stream, revision: entries.length, subjectVersion: at.subjectVersion,
    ai, human, matchingRejections: [], unverifiedSources: unverified, pairs: [] };
  if (human !== null && selected !== null && eligible(selected)) return { ...base, trust: "trusted", effective: selected };
  if (human !== null) return { ...base, trust: "withheld", effective: null };
  if (ai !== null && ai.validation === "unreviewed" && eligible(ai)) return { ...base, trust: "provisional", effective: ai };
  return { ...base, trust: "withheld", effective: null };
}
