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
  wp: string;
  threadIds: string[];
  h2aIds: string[];
}

/**
 * Split a dossier `context` body into per-WP segments. Delegation lines look
 * like `WP2 Header DS -> <id> (Name); WP6 ... -> <id> (Name)`. We split on the
 * WP-label boundaries so each segment's ids are attributed to the WP that opens
 * it; ids that appear before the first WP label are left unattributed.
 */
function parseContext(context: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];

  const labelRe = /\b[wW][pP]\s?-?\d{1,3}\b/g;
  const marks: { wp: string; index: number }[] = [];
  let lm: RegExpExecArray | null;
  while ((lm = labelRe.exec(context)) !== null) {
    const label = wpLabel(lm[0]);
    if (label) marks.push({ wp: label, index: lm.index });
  }
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i]!;
    const end = i + 1 < marks.length ? marks[i + 1]!.index : context.length;
    const slice = context.slice(mark.index, end);
    const threadIds = Array.from(new Set(Array.from(slice.matchAll(UUID_RE), (m) => m[0])));
    // h2a ids contain colons + a host word that is never a WP label, so the
    // segment-bounded scan is safe; a WP that lists several ids keeps them all.
    const h2aIds = Array.from(new Set(Array.from(slice.matchAll(H2A_ID_RE), (m) => m[0])));
    if (threadIds.length || h2aIds.length) segments.push({ wp: mark.wp, threadIds, h2aIds });
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
    const wp = wpLabel(title);
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
    if (!context) continue;
    for (const seg of parseContext(context)) {
      const items = byWp.get(seg.wp);
      if (!items) continue; // WP label without a matching track item — skip.
      for (const item of items) {
        for (const tid of seg.threadIds) if (!item.threadIds.includes(tid)) item.threadIds.push(tid);
        for (const hid of seg.h2aIds) if (!item.h2aInstanceIds.includes(hid)) item.h2aInstanceIds.push(hid);
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
 * Reverse lookups: thread-id → TrackItem and h2a-instance-id → TrackItem.
 * Used by correlate.ts to join a session to its mandated work-package.
 */
export interface TrackIndex {
  byThreadId: Map<string, TrackItem>;
  byH2aId: Map<string, TrackItem>;
}

export function indexTrackItems(items: Map<string, TrackItem>): TrackIndex {
  const byThreadId = new Map<string, TrackItem>();
  const byH2aId = new Map<string, TrackItem>();
  for (const item of items.values()) {
    for (const tid of item.threadIds) byThreadId.set(tid.toLowerCase(), item);
    for (const hid of item.h2aInstanceIds) byH2aId.set(hid, item);
  }
  return { byThreadId, byH2aId };
}
