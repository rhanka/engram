// Lot 3 (1/2): §3 derived read for the owned acts (§7 row 3).
// Folds owned asserts, inquiries and confirms; the rest stay unlisted for 2/2.
import type { Entry, Exposure, Human, HumanHead, ReadModel, StreamRef, Validation, ValueAt } from "./types.js";
type Transition = { action: Entry["action"]["kind"]; actor: Entry["actor"]["kind"]; owner: "3"; to: Validation | null };
const TRANSITIONS: readonly Transition[] = [
  { action: "assert", actor: "ai", owner: "3", to: "unreviewed" },
  { action: "assert", actor: "human", owner: "3", to: "human-asserted" },
  { action: "uncertain", actor: "ai", owner: "3", to: "uncertain" },
  { action: "uncertain", actor: "human", owner: "3", to: "uncertain" },
  { action: "needs-elicitation", actor: "ai", owner: "3", to: "awaiting-elicitation" },
  { action: "needs-elicitation", actor: "human", owner: "3", to: "awaiting-elicitation" },
  { action: "confirm", actor: "human", owner: "3", to: "confirmed" },
];
export function reduceEntries(entries: readonly Entry[], at: { stream: StreamRef; subjectVersion: string }): ReadModel {
  const values = new Map<number, ValueAt>();
  let aiRev: number | null = null;
  let head: { decision: number; selected: number; judged: number | null; action: "assert" | "confirm"; by: Human; exposure: Exposure; decidedAt: string } | null = null;
  for (const e of entries) {
    const row = TRANSITIONS.find((t) => t.action === e.action.kind && t.actor === e.actor.kind);
    if (row === undefined) throw new Error(`annotation-trust: unlisted transition at revision ${e.revision}`);
    if (e.actor.kind === "ai" && e.action.kind === "assert") {
      const amb = (e.action as { ambiguous?: boolean }).ambiguous === true;
      const v = (amb ? "uncertain" : row.to) as Validation;
      values.set(e.revision, { revision: e.revision, subjectVersion: e.subjectVersion as string, value: e.action.value, validation: v, author: e.actor,
        contentDigest: e.contentDigest, createdAt: e.recordedAt, lastReviewedAt: null });
      aiRev = e.revision;
    } else if (e.actor.kind === "human" && e.action.kind === "assert") {
      const he = e as Entry & { subjectVersion: string; actor: Human; exposure: Exposure };
      values.set(e.revision, { revision: e.revision, subjectVersion: he.subjectVersion, value: e.action.value, validation: row.to as Validation, author: he.actor,
        contentDigest: e.contentDigest, createdAt: e.recordedAt, lastReviewedAt: null });
      head = { decision: e.revision, selected: e.revision, judged: null, action: "assert", by: he.actor, exposure: he.exposure, decidedAt: e.recordedAt };
    } else if (e.action.kind === "uncertain" || e.action.kind === "needs-elicitation") {
      const t = values.get(e.action.judged);
      if (t === undefined || t.subjectVersion !== e.subjectVersion)
        throw new Error(`annotation-trust: unlisted transition at revision ${e.revision}`);
      (t as ValueAt).validation = (e.action.kind === "uncertain" ? "uncertain" : "awaiting-elicitation") as Validation;
    } else if (e.actor.kind === "human" && e.action.kind === "confirm") {
      const he = e as Entry & { actor: Human; exposure: Exposure };
      const t = values.get(e.action.judged);
      if (t === undefined || t.subjectVersion !== e.subjectVersion)
        throw new Error(`annotation-trust: revision ${e.revision} judges no eligible value`);
      t.validation = "confirmed" as Validation;
      t.lastReviewedAt = e.recordedAt;
      head = { decision: e.revision, selected: e.action.judged, judged: e.action.judged, action: "confirm", by: he.actor, exposure: he.exposure, decidedAt: e.recordedAt };
    } else throw new Error(`annotation-trust: unlisted transition at revision ${e.revision}`);
  }
  const aiHead = aiRev === null ? null : values.get(aiRev) ?? null;
  const ai = aiHead !== null && aiHead.author.kind === "ai" ? { ...aiHead, author: aiHead.author } : null;
  const eligible = (v: ValueAt): boolean => v.subjectVersion === at.subjectVersion;
  const selected = head === null ? null : values.get(head.selected) ?? null;
  const human: HumanHead | null = head === null || selected === null ? null : head.action === "assert"
    ? { decision: head.decision, by: head.by, exposure: head.exposure, decidedAt: head.decidedAt, kind: "value", action: "assert", selected, judged: null }
    : { decision: head.decision, by: head.by, exposure: head.exposure, decidedAt: head.decidedAt, kind: "value", action: "confirm", selected, judged: values.get(head.judged as number) as ValueAt };
  const base = { stream: at.stream, revision: entries.length, subjectVersion: at.subjectVersion, ai, human, matchingRejections: [], unverifiedSources: [], pairs: [] };
  if (human !== null && selected !== null && eligible(selected)) return { ...base, trust: "trusted", effective: selected };
  if (human !== null) return { ...base, trust: "withheld", effective: null };
  if (ai !== null && ai.validation === "unreviewed" && eligible(ai)) return { ...base, trust: "provisional", effective: ai };
  return { ...base, trust: "withheld", effective: null };
}
