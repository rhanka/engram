/**
 * WP9 agent-stats — Track ledger ↔ work-package join (Phase 1).
 *
 * The Track decision ledger (`.track/events.jsonl`) is the conductor's record of
 * WHICH AGENT was mandated WHICH work-package. Delegation dossiers embed, in
 * their free-text `context` bodies, two kinds of durable agent ids:
 *
 *   - Codex thread-ids (sub-agent session uuids), e.g.
 *       "WP2 Header DS -> 019ea9d2-7979-7991-8216-1b465ec8005b (Ohm); WP6 ..."
 *   - h2a instance ids (`host:name:hash12`), e.g.
 *       "WP1 to codex:codex-graph-lib:84a7f37d306b (env:...); WP2/WP3/WP5 to
 *        claude:graphify:17bddf135979 (env:...)"
 *
 * This module parses the ledger into a `{ trackItemId -> TrackItem }` map. Each
 * item carries its WP label (from the `item.created` title) plus the set of
 * Codex thread-ids and h2a instance ids the dossiers associated with that WP.
 *
 * The correlation step (correlate.ts) then joins a SESSION to a track item when
 * the session's Codex `session_meta.id` / `parent.parentThreadId`, or its
 * matched h2a instance id, appears in that item's id sets — attributing the
 * session (and the WP) to the producing agent. No git authorship involved.
 *
 * Privacy: thread-ids / h2a ids are opaque agent handles already present in the
 * committed Track ledger; they are not personal data. We never read prompt text.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A work-package track item with the agent ids the ledger mandated for it. */
export interface TrackItem {
  /** Track aggregate id (ULID) of the `item.created` event. */
  trackItemId: string;
  /** Normalized WP label parsed from the item title (e.g. "WP9"), or null. */
  wp: string | null;
  /** Item title (verbatim). */
  title: string;
  /** Codex sub-agent thread-ids (uuids) the ledger tied to this WP. */
  threadIds: string[];
  /** h2a instance ids (`host:name:hash12`) the ledger tied to this WP. */
  h2aInstanceIds: string[];
}

const WP_LABEL_RE = /\b[wW][pP]\s?-?(\d{1,3})\b/;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
const H2A_ID_RE = /\b(?:claude|codex|agy):[A-Za-z0-9_.-]+:[0-9a-f]{12}\b/g;

/** Parse a normalized WP label (e.g. "WP9") from a title/body, or null. */
function wpLabel(text: string): string | null {
  if (typeof text !== "string") return null;
  const m = text.match(WP_LABEL_RE);
  return m ? `WP${m[1]}` : null;
}

interface ParsedSegment {
  /** All WP labels this segment's ids are mandated to (multi-WP mandates). */
  wps: string[];
  threadIds: string[];
  h2aIds: string[];
}

/**
 * Split a dossier `context` body into per-WP segments. Delegation lines look
 * like `WP2 Header DS -> <id> (Name); WP6 ... -> <id> (Name)`. We split on the
 * WP-label boundaries so each segment's ids are attributed to the WP that opens
 * it; ids that appear before the first WP label are left unattributed.
 *
 * MULTI-WP MANDATES: a run of labels with no ids in between ("WP2/WP3/WP5 to
 * <id>") carries every label forward — the id joins to ALL of those WPs.
 */
function parseContext(context: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];

  const labelRe = /\b[wW][pP]\s?-?\d{1,3}\b/g;
  const marks: { wp: string; index: number; len: number }[] = [];
  let lm: RegExpExecArray | null;
  while ((lm = labelRe.exec(context)) !== null) {
    const label = wpLabel(lm[0]);
    if (label) marks.push({ wp: label, index: lm.index, len: lm[0].length });
  }
  let carried: string[] = [];
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i]!;
    const end = i + 1 < marks.length ? marks[i + 1]!.index : context.length;
    const slice = context.slice(mark.index, end);
    const threadIds = Array.from(new Set(Array.from(slice.matchAll(UUID_RE), (m) => m[0])));
    // h2a ids contain colons + a host word that is never a WP label, so the
    // segment-bounded scan is safe; a WP that lists several ids keeps them all.
    const h2aIds = Array.from(new Set(Array.from(slice.matchAll(H2A_ID_RE), (m) => m[0])));
    if (threadIds.length || h2aIds.length) {
      segments.push({ wps: [...carried, mark.wp], threadIds, h2aIds });
      carried = [];
    } else {
      // No ids in this label's own slice. Carry the label into the NEXT
      // segment only when it is a tight run like "WP3/WP5" — i.e. nothing but
      // a short separator sits between this label and the next one. Prose
      // mentions ("owner of WP6 publication, WP7 coordination") do not carry.
      const gap = context.slice(mark.index + mark.len, end);
      if (i + 1 < marks.length && /^[\s/,&+|-]{0,3}$/.test(gap)) carried.push(mark.wp);
      else carried = [];
    }
  }

  return segments;
}

/** Pull the `context` string out of a decision/dossier payload, if present. */
function dossierContext(payload: any): string {
  const d = payload?.dossier;
  if (d && typeof d === "object" && typeof d.context === "string") return d.context;
  // Some event kinds carry the prose in body/rationale instead of a dossier.
  for (const k of ["body", "rationale", "content", "note"]) {
    if (typeof payload?.[k] === "string") return payload[k];
  }
  return "";
}

/**
 * Parse a Track ledger (JSONL string) into work-package items keyed by track
 * item id. WP labels resolve to track items by matching the WP label parsed
 * from each `item.created` title; ids from delegation dossiers are attached to
 * every item sharing that WP label.
 */
export function parseTrackLedger(ledger: string): Map<string, TrackItem> {
  const byId = new Map<string, TrackItem>();
  const byWp = new Map<string, TrackItem[]>();

  const lines = ledger.split("\n");

  // Pass 1: collect track items from `item.created`.
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e?.type !== "item.created") continue;
    const trackItemId = typeof e.aggregateId === "string" ? e.aggregateId : undefined;
    if (!trackItemId) continue;
    const title = typeof e.payload?.title === "string" ? e.payload.title : "";
    const body = typeof e.payload?.body === "string" ? e.payload.body : "";
    // WP label from the title, falling back to the body (the real WP9 item's
    // title carries no "WP9" token; only later decisions/body text do).
    const wp = wpLabel(title) ?? wpLabel(body);
    const item: TrackItem = { trackItemId, wp, title, threadIds: [], h2aInstanceIds: [] };
    byId.set(trackItemId, item);
    if (wp) {
      const arr = byWp.get(wp);
      if (arr) arr.push(item);
      else byWp.set(wp, [item]);
    }
  }

  // Pass 2: scan delegation dossiers/decisions for id ↔ WP associations.
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const type = e?.type;
    if (type !== "dossier.revised" && type !== "decision.created" && type !== "decision.outcome") continue;
    const context = dossierContext(e.payload);
    const title = typeof e.payload?.title === "string" ? e.payload.title : "";

    // STRUCTURED JOIN (preferred): when the event carries `targets` ULIDs that
    // resolve to known items, every id in its context attaches to exactly
    // those items — never to items whose WP label merely appears in the prose
    // (e.g. the conductor's id next to "remains owner of WP6 publication").
    const targets: TrackItem[] = Array.isArray(e.payload?.targets)
      ? e.payload.targets
          .filter((t: unknown): t is string => typeof t === "string")
          .map((t: string) => byId.get(t))
          .filter((it: TrackItem | undefined): it is TrackItem => Boolean(it))
      : [];
    if (targets.length > 0) {
      const threadIds = context ? Array.from(new Set(Array.from(context.matchAll(UUID_RE), (m) => m[0]))) : [];
      const h2aIds = context ? Array.from(new Set(Array.from(context.matchAll(H2A_ID_RE), (m) => m[0]))) : [];
      for (const item of targets) {
        for (const tid of threadIds) if (!item.threadIds.includes(tid)) item.threadIds.push(tid);
        for (const hid of h2aIds) if (!item.h2aInstanceIds.includes(hid)) item.h2aInstanceIds.push(hid);
      }
      // A single-target decision titled "WP9 …" names the item's WP even when
      // the item title itself lacks the token.
      if (targets.length === 1 && targets[0] && !targets[0].wp) {
        const inferred = wpLabel(title);
        if (inferred) {
          targets[0].wp = inferred;
          const arr = byWp.get(inferred);
          if (arr) arr.push(targets[0]);
          else byWp.set(inferred, [targets[0]]);
        }
      }
      continue;
    }

    // PROSE FALLBACK: WP-label segmentation over the dossier context.
    if (!context) continue;
    for (const seg of parseContext(context)) {
      for (const wp of seg.wps) {
        const items = byWp.get(wp);
        if (!items) continue; // WP label without a matching track item — skip.
        for (const item of items) {
          for (const tid of seg.threadIds) if (!item.threadIds.includes(tid)) item.threadIds.push(tid);
          for (const hid of seg.h2aIds) if (!item.h2aInstanceIds.includes(hid)) item.h2aInstanceIds.push(hid);
        }
      }
    }
  }

  return byId;
}

/** Load + parse the Track ledger for a repo root (returns empty map if none). */
export function loadTrackItems(repoRoot: string): Map<string, TrackItem> {
  const file = join(repoRoot, ".track", "events.jsonl");
  if (!existsSync(file)) return new Map();
  let content: string;
  try {
    content = readFileSync(file, "utf-8");
  } catch {
    return new Map();
  }
  return parseTrackLedger(content);
}

/**
 * Reverse lookups: thread-id → TrackItem[] and h2a-instance-id → TrackItem[].
 * MULTI-WP: an id mandated to several work-packages maps to ALL of them; the
 * correlation step emits one WP link per mandated item.
 */
export interface TrackIndex {
  byThreadId: Map<string, TrackItem[]>;
  byH2aId: Map<string, TrackItem[]>;
}

export function indexTrackItems(items: Map<string, TrackItem>): TrackIndex {
  const byThreadId = new Map<string, TrackItem[]>();
  const byH2aId = new Map<string, TrackItem[]>();
  const push = (map: Map<string, TrackItem[]>, key: string, item: TrackItem) => {
    const arr = map.get(key);
    if (arr) {
      if (!arr.includes(item)) arr.push(item);
    } else {
      map.set(key, [item]);
    }
  };
  for (const item of items.values()) {
    for (const tid of item.threadIds) push(byThreadId, tid.toLowerCase(), item);
    for (const hid of item.h2aInstanceIds) push(byH2aId, hid, item);
  }
  return { byThreadId, byH2aId };
}
