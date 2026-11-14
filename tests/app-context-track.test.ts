/**
 * Lot L3 — Read-only Track CLI projection, single `track` wrapper & projection citations.
 *
 * Contract: SPEC_EVOL_APP_CONTEXT_GRAPH.r4.md §4.3, §7 « Lot L3 ».
 * Standalone library under test: `src/app-context/extract-track.ts`.
 * Track is read ONLY through its CLI (`track --version`,
 * `track query --format json`, `track decision ls --format json`); in tests a
 * subprocess adapter fake serves fixture text. Nothing is ever written to any
 * `.track` directory.
 *
 * Supported subset (binding rule 2; mirrors the table in the module header,
 * one test case per row):
 *
 * | # | Input | Result |
 * |---|-------|--------|
 * | 1 | three exact CLI calls, pinned timeout, zero write flags | "runs exactly the three read-only commands ..." |
 * | 2 | kind `frontmatter` | "links explicit ULID declarations ..." |
 * | 3 | kind `section-marker` | "uses section-marker derivation names ..." |
 * | 4 | kind `spec-map` | "uses spec-map derivation names ..." |
 * | 5 | complete `.md` token in `detail.summary` | "extracts intact .md paths ...", "accepts complete refs ..." |
 * | 6 | complete `.md` token in `contextExcerpt` | same two tests, `decides` side |
 * | 7 | affixed, `…`-truncated, or non-separator-adjacent token | "rejects path prefixes, suffixes and embedded matches ...", "B1: rejects non-separator-adjacent token ..." (12 cases: 6 tokens x summary/excerpt, no edge, `unsupported-construct`), "links a complete ref wrapped in explicit separator ..." (31 separators x summary/excerpt, one edge, no diagnostic) |
 * | 8 | complete `.md` token with no declared spec | "emits target-unresolved for complete refs ..." (no edge, `target-unresolved` with file/line) |
 * | 9 | ULID with zero candidates | "links explicit ULID declarations ..." (unknown ids), "handles a missing .track ...", "reports declared but unresolved ..." |
 * | 10 | ULID with two source kinds | "reports target-ambiguous when one ULID ..." |
 * | 11 | forbidden persistence destination or commit | "refuses a persistence destination ...", "rejects a non-40-hex commit ..." |
 */
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createGraph, loadGraphFromData, serializeGraph } from "../src/graph.js";
import { buildFromJson } from "../src/build.js";
import { parseOntologyProfile } from "../src/ontology-profile.js";
import { appContextNodeId } from "../src/app-context/node-id.js";
import type {
  TrackCliDecision,
  TrackCliItem,
  TrackProjectionCitation,
} from "../src/app-context/types.js";
import {
  TRACK_DECISIONS_ARGS,
  TRACK_DECISIONS_REL,
  TRACK_QUERY_ARGS,
  TRACK_QUERY_REL,
  TRACK_TIMEOUT_MS,
  TRACK_VERSION_ARGS,
  buildTrackNodes,
  collectTrackProjections,
  extractTrack,
  formatTrackProjection,
  indexPrettyArrayElements,
  linkExplicitTrackDeclarations,
  linkSpecPathMentions,
  linkTrackInWorkpackages,
  writeTrackProjections,
} from "../src/app-context/extract-track.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const profilePath = join(repoRoot, "profiles", "app-context", "v1", "profile.yaml");
const fixturePath = join(here, "fixtures", "app-context", "track-fixture.json");

// No test in this file ever creates a `.track` directory (not even a
// temporary one): `.track` presence is faked below, and every filesystem
// mutation is intercepted and asserted to stay outside `.track`.
const presentTrackDirs = vi.hoisted(() => new Set<string>());
const mutationTargets = vi.hoisted(
  () => [] as Array<{ op: string; target: string }>,
);
const realpathOverrides = vi.hoisted(() => new Map<string, string>());

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: (...args: unknown[]) => {
      const [p] = args;
      if (
        typeof p === "string" &&
        /(^|[/\\])\.track$/.test(p) &&
        presentTrackDirs.has(p)
      ) {
        return true;
      }
      return (actual.existsSync as (...a: unknown[]) => boolean)(...args);
    },
  };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const record = (op: string, target: unknown): void => {
    if (typeof target === "string") {
      mutationTargets.push({ op, target });
    }
  };
  return {
    ...actual,
    mkdir: async (...args: unknown[]) => {
      record("mkdir", args[0]);
      return (actual.mkdir as (...a: unknown[]) => Promise<unknown>)(...args);
    },
    open: async (...args: unknown[]) => {
      record("open", args[0]);
      return (actual.open as (...a: unknown[]) => Promise<unknown>)(...args);
    },
    writeFile: async (...args: unknown[]) => {
      record("writeFile", args[0]);
      return (actual.writeFile as (...a: unknown[]) => Promise<unknown>)(
        ...args,
      );
    },
    realpath: async (...args: unknown[]) => {
      const override = realpathOverrides.get(String(args[0]));
      if (override !== undefined) {
        return override;
      }
      return (actual.realpath as (...a: unknown[]) => Promise<unknown>)(
        ...args,
      );
    },
  };
});

// Production-runner probe (N3): stubbed `execFileSync` argv/options sibling
// to the fixture runner below. The stub bodies are loaded by the test from
// the delivered fixture file; only calls are recorded here.
const execFileSyncStub = vi.hoisted(() => ({
  calls: [] as Array<{
    bin: unknown;
    args: unknown;
    opts: Record<string, unknown>;
  }>,
  queryStdout: "",
  decisionsStdout: "",
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFileSync: (bin: unknown, args: unknown, opts: unknown): unknown => {
      execFileSyncStub.calls.push({
        bin,
        args,
        opts: { ...(opts as Record<string, unknown>) },
      });
      const argv = args as string[];
      if (argv.length === 1 && argv[0] === "--version") {
        return "track 0.3.0\n";
      }
      if (argv.join(" ") === "query --format json") {
        return execFileSyncStub.queryStdout;
      }
      if (argv.join(" ") === "decision ls --format json") {
        return execFileSyncStub.decisionsStdout;
      }
      throw new Error(`unexpected track invocation: ${(argv as string[]).join(" ")}`);
    },
  };
});

beforeEach(() => {
  presentTrackDirs.clear();
  mutationTargets.length = 0;
  realpathOverrides.clear();
  execFileSyncStub.calls.length = 0;
});

const REPO_KEY = "test-repo";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const CLI_VERSION = "track 0.3.0";

const WP_ID = "01JWWWWWWWWWWWWWWWWWWWWWWW1";

const ITEM_A: TrackCliItem = {
  id: "01JAAAAAAAAAAAAAAAAAAAAAAAAA",
  title: "Alpha feature",
  kind: "feature",
  workspace: "test-ws",
  bucket: "AWAITED",
  realization: "in-progress",
  acceptance: "unknown",
  priority: 2,
  accountable: "tester",
  wpId: WP_ID,
  wpLabel: "WP1",
  detail: {
    summary: "Implements docs/spec/alpha.md section 2.",
    acceptanceLabel: "not evaluated",
  },
};

const ITEM_NO_WP: TrackCliItem = {
  id: "01JBBBBBBBBBBBBBBBBBBBBBBBBB",
  title: "Orphan chore",
  kind: "chore",
  workspace: "test-ws",
  bucket: "DONE",
  realization: "done",
  acceptance: "unknown",
};

const ITEM_WP_NO_LABEL: TrackCliItem = {
  id: "01JCCCCCCCCCCCCCCCCCCCCCCCCC",
  title: "Beta bug",
  kind: "bug",
  workspace: "test-ws",
  bucket: "AWAITED",
  realization: "to-do",
  acceptance: "unknown",
  wpId: WP_ID,
  detail: { summary: "Truncated tail docs/spec/beta.md… do not link." },
};

const DECISION_STRUCTURED: TrackCliDecision = {
  id: "01JDDDDDDDDDDDDDDDDDDDDDDDDD",
  title: "Adopt layout v2",
  workspace: "test-ws",
  decisionKind: "commitment",
  realization: "to-do",
  outcome: "go",
  structured: true,
  structure: "structured",
  accountable: "owner",
  optionCount: 2,
  openQuestionCount: 0,
  hasRecommendation: true,
  contextExcerpt: "See docs/spec/decision-log.md for rationale.",
  options: [
    { id: "keep", summary: "Keep current layout.", title: "Keep" },
    { id: "adopt", summary: "Adopt the new layout.", title: "Adopt" },
  ],
  recommendation: { optionId: "adopt", rationale: "Owner approved." },
  selectedOptionId: "adopt",
};

const DECISION_PLAIN: TrackCliDecision = {
  id: "01JEEEEEEEEEEEEEEEEEEEEEEEEE",
  title: "Defer export format",
  workspace: "test-ws",
  decisionKind: "orientation",
  realization: "to-do",
  outcome: "go",
  structured: false,
  structure: "unstructured",
  optionCount: 0,
  openQuestionCount: 0,
  hasRecommendation: false,
  options: [],
};

function loadRealFixture(): { items: TrackCliItem[]; decisions: TrackCliDecision[] } {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as {
    items: TrackCliItem[];
    decisions: TrackCliDecision[];
  };
}

function parseElementSlice(
  lines: string[],
  span: { line_start: number; line_end: number },
): unknown {
  // Line spans are line-granular; the separator comma after a non-final array
  // element lives on its closing line, so strip one trailing comma.
  const slice = lines.slice(span.line_start - 1, span.line_end).join("\n").replace(/,\s*$/, "");
  return JSON.parse(slice);
}

describe("single track wrapper (Lot L3, §4.3)", () => {
  it("wraps items, decisions and workpackages with computed ids, node_type and untouched CLI fields under track", () => {
    const items = [ITEM_A, ITEM_NO_WP, ITEM_WP_NO_LABEL];
    const decisions = [DECISION_STRUCTURED, DECISION_PLAIN];
    const built = buildTrackNodes({
      repoKey: REPO_KEY,
      commit: COMMIT,
      cliVersion: CLI_VERSION,
      items,
      decisions,
    });

    // 2 items with wpId share one workpackage node: 3 + 2 + 1 = 6 nodes.
    expect(built.nodes).toHaveLength(6);

    const itemNode = built.itemIdToNodeId.get(ITEM_A.id);
    expect(itemNode).toBe(appContextNodeId(REPO_KEY, "TrackItem", [ITEM_A.id]));
    expect(itemNode).toMatch(/^titem:[0-9a-f]{32}$/);
    const itemAttrs = built.nodes.find((n) => n.id === itemNode)!;
    expect(itemAttrs.node_type).toBe("TrackItem");
    expect(itemAttrs.track).toEqual(ITEM_A);
    // No top-level leakage of CLI fields: the graph id space stays collision-free.
    expect("title" in itemAttrs).toBe(false);
    expect("kind" in itemAttrs).toBe(false);
    expect("workspace" in itemAttrs).toBe(false);
    expect(itemAttrs.source_file).toBe("track-projections/track-query.json");
    expect(itemAttrs.citations).toHaveLength(1);
    const itemCite = itemAttrs.citations[0]!;
    expect(itemCite.citation_kind).toBe("track_cli_projection");
    expect(itemCite.source_file).toBe("track-projections/track-query.json");
    expect(itemCite.command).toBe("track query --format json");
    expect(itemCite.cli_version).toBe(CLI_VERSION);
    expect(itemCite.commit).toBe(COMMIT);
    expect(itemCite.json_pointer).toBe("/0");
    // The cited line span parses back to the same record.
    const lines = built.queryText.split("\n");
    expect(
      parseElementSlice(lines, {
        line_start: itemCite.line_start,
        line_end: itemCite.line_end,
      }),
    ).toEqual(ITEM_A);

    const decisionNode = built.decisionIdToNodeId.get(DECISION_STRUCTURED.id);
    expect(decisionNode).toBe(
      appContextNodeId(REPO_KEY, "TrackDecision", [DECISION_STRUCTURED.id]),
    );
    expect(decisionNode).toMatch(/^tdec:[0-9a-f]{32}$/);
    const decisionAttrs = built.nodes.find((n) => n.id === decisionNode)!;
    expect(decisionAttrs.node_type).toBe("TrackDecision");
    expect(decisionAttrs.track).toEqual(DECISION_STRUCTURED);
    expect(decisionAttrs.source_file).toBe("track-projections/track-decisions.json");
    expect(decisionAttrs.citations[0]!.command).toBe("track decision ls --format json");

    const wpNode = built.wpIdToNodeId.get(WP_ID);
    expect(wpNode).toBe(appContextNodeId(REPO_KEY, "TrackWorkpackage", [WP_ID]));
    expect(wpNode).toMatch(/^twp:[0-9a-f]{32}$/);
    const wpAttrs = built.nodes.find((n) => n.id === wpNode)!;
    expect(wpAttrs.node_type).toBe("TrackWorkpackage");
    expect(wpAttrs.track).toEqual({ wpId: WP_ID, wpLabel: "WP1" });
    expect(wpAttrs.source_file).toBe("track-projections/track-query.json");

    // Item without wpId produces no workpackage edge target.
    expect(built.itemIdToNodeId.get(ITEM_NO_WP.id)).toMatch(/^titem:[0-9a-f]{32}$/);
  });

  it("falls back to wpId when wpLabel is missing", () => {
    const built = buildTrackNodes({
      repoKey: REPO_KEY,
      commit: COMMIT,
      cliVersion: CLI_VERSION,
      items: [
        {
          ...ITEM_NO_WP,
          wpId: "01JWXYZWXYZWXYZWXYZWXYZWXZ1",
          wpLabel: undefined,
        },
      ],
      decisions: [],
    });
    const wpNode = built.wpIdToNodeId.get("01JWXYZWXYZWXYZWXYZWXYZWXZ1")!;
    const wpAttrs = built.nodes.find((n) => n.id === wpNode)!;
    expect(wpAttrs.track).toEqual({
      wpId: "01JWXYZWXYZWXYZWXYZWXYZWXZ1",
      wpLabel: "01JWXYZWXYZWXYZWXYZWXYZWXZ1",
    });
  });

  it("preserves every real CLI field of tests/fixtures/app-context/track-fixture.json under track", () => {
    const fixture = loadRealFixture();
    const built = buildTrackNodes({
      repoKey: REPO_KEY,
      commit: COMMIT,
      cliVersion: CLI_VERSION,
      items: fixture.items,
      decisions: fixture.decisions,
    });
    expect(built.nodes.length).toBeGreaterThan(fixture.items.length);
    for (const [index, record] of fixture.items.entries()) {
      const nodeId = built.itemIdToNodeId.get(record.id)!;
      expect(nodeId).toBe(appContextNodeId(REPO_KEY, "TrackItem", [record.id]));
      const attrs = built.nodes.find((n) => n.id === nodeId)!;
      expect(attrs.track).toEqual(record);
      expect(attrs.citations[0]!.json_pointer).toBe(`/${index}`);
    }
    // Spot-check real shapes: numeric priority, detail labels, structured options.
    const csL2 = built.nodes.find(
      (n) => n.id === built.itemIdToNodeId.get("01KTW1NZ55V6FTN3ACJSKQQNQ7"),
    )!;
    expect((csL2.track as TrackCliItem).priority).toBeUndefined();
    expect((csL2.track as TrackCliItem).wpLabel).toBe("WP6");
    const structured = built.nodes.find(
      (n) => n.id === built.decisionIdToNodeId.get("01M6GSB0TCZD5H7WB8GQ0F4J2Q"),
    )!;
    const structuredTrack = structured.track as TrackCliDecision;
    expect(structuredTrack.options).toHaveLength(2);
    expect(structuredTrack.recommendation?.optionId).toBe("approve-all");
    expect(structuredTrack.selectedOptionId).toBe("approve-all");
    const wpb = built.nodes.find(
      (n) => n.id === built.itemIdToNodeId.get("01KTQP5FEAD2BQ860ZQK2WF5BQ"),
    )!;
    expect((wpb.track as TrackCliItem).priority).toBe(1.8);
    expect((wpb.track as TrackCliItem).detail?.acceptanceLabel).toBe("recette non évaluée");
  });

  it("survives serializeGraph → loadGraphFromData with node.id and node.track.id intact", () => {
    const fixture = loadRealFixture();
    const built = buildTrackNodes({
      repoKey: REPO_KEY,
      commit: COMMIT,
      cliVersion: CLI_VERSION,
      items: fixture.items,
      decisions: fixture.decisions,
    });
    const G = createGraph();
    for (const node of built.nodes) {
      G.mergeNode(node.id, {
        node_type: node.node_type,
        track: node.track,
        source_file: node.source_file,
        citations: node.citations,
      });
    }
    const reloaded = loadGraphFromData(JSON.parse(JSON.stringify(serializeGraph(G))));
    for (const node of built.nodes) {
      expect(reloaded.hasNode(node.id)).toBe(true);
      const attrs = reloaded.getNodeAttributes(node.id) as unknown as typeof node;
      expect(attrs.node_type).toBe(node.node_type);
      const reloadedKey = (attrs.track as { id?: string; wpId?: string }).id
        ?? (attrs.track as { wpId?: string }).wpId;
      const expectedKey = (node.track as { id?: string; wpId?: string }).id
        ?? (node.track as { wpId?: string }).wpId;
      expect(reloadedKey).toBe(expectedKey);
      expect(attrs.track).toEqual(node.track);
    }
  });
});

describe("persisted track projections (Lot L3, §4.3)", () => {
  it("formats projections deterministically with 2-space indent plus trailing newline", () => {
    const fixture = loadRealFixture();
    expect(formatTrackProjection(fixture.items)).toBe(
      `${JSON.stringify(fixture.items, null, 2)}\n`,
    );
    expect(formatTrackProjection(fixture.decisions)).toBe(
      `${JSON.stringify(fixture.decisions, null, 2)}\n`,
    );
    expect(formatTrackProjection([])).toBe("[]\n");
  });

  it("recovers every emitted citation from the persisted projections", async () => {
    const wpId = "01JN1WWWWWWWWWWWWWWWWWWWWW";
    const items: TrackCliItem[] = [
      {
        id: "01JN1AAAAAAAAAAAAAAAAAAAAA",
        title: "Alpha",
        kind: "feature",
        workspace: "test-ws",
        bucket: "AWAITED",
        realization: "in-progress",
        acceptance: "unknown",
        priority: 1.5,
        wpId,
        wpLabel: "WPX",
        detail: {
          summary: "Implements docs/spec/alpha.md section 2.",
          acceptanceLabel: "not evaluated",
        },
      },
      {
        id: "01JN1BBBBBBBBBBBBBBBBBBBBB",
        title: "Beta",
        kind: "bug",
        workspace: "test-ws",
        bucket: "DONE",
        realization: "done",
        acceptance: "unknown",
        wpId,
        detail: {
          // Complete ref wrapped in quotes/brackets plus backslashes and braces.
          summary:
            'See "docs/spec/alpha.md" [v2] (final) at C:\\docs\\x {note} end.',
          acceptanceLabel: "recette",
        },
      },
    ];
    const decisions: TrackCliDecision[] = [
      {
        id: "01JN1DDDDDDDDDDDDDDDDDDDDD",
        title: "Adopt v2",
        workspace: "test-ws",
        decisionKind: "commitment",
        realization: "to-do",
        outcome: "go",
        structured: true,
        structure: "structured",
        accountable: "owner",
        optionCount: 2,
        openQuestionCount: 1,
        hasRecommendation: true,
        // Complete ref plus quotes, backslashes and brackets in free text.
        contextExcerpt:
          'Rationale for "docs/spec/beta.md" [v3]: keep C:\\decisions\\y {final}.',
        options: [
          {
            id: "keep",
            summary: 'Keep [current] "layout" at C:\\a\\b.',
            title: "Keep",
          },
          {
            id: "adopt",
            summary: "Adopt {new} layout (v2).",
            title: "Adopt",
          },
        ],
        recommendation: { optionId: "adopt", rationale: 'Owner said "go" [ok].' },
        selectedOptionId: "adopt",
      },
      {
        ...DECISION_PLAIN,
        id: "01JN1EEEEEEEEEEEEEEEEEEEEE",
      },
    ];
    const built = buildTrackNodes({
      repoKey: REPO_KEY,
      commit: COMMIT,
      cliVersion: CLI_VERSION,
      items,
      decisions,
    });
    const ctx = {
      repoKey: REPO_KEY,
      commit: COMMIT,
      cliVersion: CLI_VERSION,
      items,
      decisions,
      ...built,
    };
    const inWp = linkTrackInWorkpackages(ctx);
    const specNode = appContextNodeId(REPO_KEY, "Spec", ["docs/spec/alpha.md"]);
    const betaNode = appContextNodeId(REPO_KEY, "Spec", ["docs/spec/beta.md"]);
    const explicit = linkExplicitTrackDeclarations({
      ...ctx,
      declarations: [
        {
          targetId: specNode,
          kind: "frontmatter",
          track: [items[0]!.id, wpId],
          decisions: [decisions[0]!.id],
        },
      ],
    });
    const mentions = linkSpecPathMentions({
      ...ctx,
      specFileToNodeId: new Map([
        ["docs/spec/alpha.md", specNode],
        ["docs/spec/beta.md", betaNode],
      ]),
    });

    const stateRoot = await mkdtemp(join(tmpdir(), "appctx-l3-"));
    const written = await writeTrackProjections({
      stateRootDir: stateRoot,
      commit: COMMIT,
      queryText: built.queryText,
      decisionsText: built.decisionsText,
    });
    const storedQuery = await readFile(written.queryAbs, "utf8");
    const storedDecisions = await readFile(written.decisionsAbs, "utf8");
    const queryDoc = JSON.parse(storedQuery) as unknown[];
    const decisionsDoc = JSON.parse(storedDecisions) as unknown[];

    // Strict RFC 6901 resolution: any absent property or out-of-range index
    // fails the test instead of comparing `undefined` to `undefined`.
    const resolveStrict = (doc: unknown, pointer: string): unknown => {
      if (pointer === "") {
        return doc;
      }
      let current: unknown = doc;
      for (const raw of pointer.split("/").slice(1)) {
        const segment = raw.replace(/~1/g, "/").replace(/~0/g, "~");
        if (Array.isArray(current)) {
          expect(/^(0|[1-9][0-9]*)$/.test(segment)).toBe(true);
          const index = Number(segment);
          expect(index).toBeLessThan(current.length);
          current = current[index];
        } else if (typeof current === "object" && current !== null) {
          expect(
            Object.prototype.hasOwnProperty.call(current, segment),
          ).toBe(true);
          current = (current as Record<string, unknown>)[segment];
        } else {
          throw new Error(`cannot resolve segment "${segment}" in ${pointer}`);
        }
      }
      return current;
    };
    const checkCitation = (
      citation: TrackProjectionCitation,
      expectedFile: typeof TRACK_QUERY_REL | typeof TRACK_DECISIONS_REL,
      expectedValue: unknown,
      expectedCommand: TrackProjectionCitation["command"],
    ): void => {
      // The oracle follows the citation's own source_file, and that file must
      // be the one expected for the emission (a swapped source_file fails).
      expect(citation.source_file).toBe(expectedFile);
      const doc = citation.source_file === TRACK_QUERY_REL ? queryDoc : decisionsDoc;
      const docText =
        citation.source_file === TRACK_QUERY_REL ? storedQuery : storedDecisions;
      expect([
        "track-projections/track-query.json",
        "track-projections/track-decisions.json",
      ]).toContain(citation.source_file);
      expect(JSON.stringify(citation)).not.toContain("events.jsonl");
      expect(citation.citation_kind).toBe("track_cli_projection");
      expect(citation.command).toBe(expectedCommand);
      expect(citation.cli_version).toBe(CLI_VERSION);
      expect(citation.commit).toBe(COMMIT);
      // The cited line span parses back to the array element ...
      const lines = docText.split("\n");
      expect(citation.line_end).toBeGreaterThanOrEqual(citation.line_start);
      expect(citation.line_start).toBeGreaterThanOrEqual(1);
      expect(citation.line_end).toBeLessThanOrEqual(lines.length);
      const elementIndex = Number(citation.json_pointer.split("/")[1]);
      expect(parseElementSlice(lines, citation)).toEqual(
        (doc as unknown[])[elementIndex],
      );
      // ... and the strictly resolved pointer equals the expected node/edge
      // value, never the same pointer applied to both sides (a `-missing`
      // suffix fails strict resolution instead of matching `undefined`).
      expect(resolveStrict(doc, citation.json_pointer)).toEqual(expectedValue);
    };

    const itemIndexByNode = new Map<string, number>();
    items.forEach((item, index) => {
      itemIndexByNode.set(built.itemIdToNodeId.get(item.id)!, index);
    });
    const decisionIndexByNode = new Map<string, number>();
    decisions.forEach((decision, index) => {
      decisionIndexByNode.set(built.decisionIdToNodeId.get(decision.id)!, index);
    });
    const wpFirstIndex = items.findIndex((item) => item.wpId === wpId);
    const wpNode = built.wpIdToNodeId.get(wpId)!;
    const asQuery = (
      citation: TrackProjectionCitation,
      expectedValue: unknown,
    ): {
      citation: TrackProjectionCitation;
      expectedFile: typeof TRACK_QUERY_REL;
      expectedValue: unknown;
      expectedCommand: TrackProjectionCitation["command"];
    } => ({
      citation,
      expectedFile: TRACK_QUERY_REL,
      expectedValue,
      expectedCommand: "track query --format json",
    });
    const asDecisions = (
      citation: TrackProjectionCitation,
      expectedValue: unknown,
    ): {
      citation: TrackProjectionCitation;
      expectedFile: typeof TRACK_DECISIONS_REL;
      expectedValue: unknown;
      expectedCommand: TrackProjectionCitation["command"];
    } => ({
      citation,
      expectedFile: TRACK_DECISIONS_REL,
      expectedValue,
      expectedCommand: "track decision ls --format json",
    });

    const queryGroups = [
      {
        name: "item nodes",
        checks: built.itemNodes.map((n) =>
          asQuery(n.citations[0]!, items[itemIndexByNode.get(n.id)!]!),
        ),
      },
      {
        name: "workpackage nodes",
        checks: built.workpackageNodes.map((n) =>
          asQuery(n.citations[0]!, items[wpFirstIndex]!.wpId),
        ),
      },
      {
        name: "in_workpackage edges",
        checks: inWp.edges.map((e) =>
          asQuery(
            e.citations[0]!,
            items[itemIndexByNode.get(e.source)!]!.wpId,
          ),
        ),
      },
      {
        name: "explicit tracks edges",
        checks: explicit.edges
          .filter((e) => e.relation === "tracks")
          .map((e) =>
            e.source === wpNode
              ? asQuery(e.citations[0]!, items[wpFirstIndex]!.wpId)
              : asQuery(
                  e.citations[0]!,
                  items[itemIndexByNode.get(e.source)!]!,
                ),
          ),
      },
      {
        name: "summary mention edges",
        checks: mentions.edges
          .filter((e) => e.relation === "tracks")
          .map((e) =>
            asQuery(
              e.citations[0]!,
              items[itemIndexByNode.get(e.source)!]!.detail?.summary,
            ),
          ),
      },
    ];
    const decisionsGroups = [
      {
        name: "decision nodes",
        checks: built.decisionNodes.map((n) =>
          asDecisions(
            n.citations[0]!,
            decisions[decisionIndexByNode.get(n.id)!]!,
          ),
        ),
      },
      {
        name: "explicit decides edges",
        checks: explicit.edges
          .filter((e) => e.relation === "decides")
          .map((e) =>
            asDecisions(
              e.citations[0]!,
              decisions[decisionIndexByNode.get(e.source)!]!,
            ),
          ),
      },
      {
        name: "excerpt mention edges",
        checks: mentions.edges
          .filter((e) => e.relation === "decides")
          .map((e) =>
            asDecisions(
              e.citations[0]!,
              decisions[decisionIndexByNode.get(e.source)!]!.contextExcerpt,
            ),
          ),
      },
    ];
    expect(explicit.diagnostics).toEqual([]);
    expect(mentions.diagnostics).toEqual([]);
    for (const group of queryGroups) {
      expect(group.checks.length, group.name).toBeGreaterThan(0);
      for (const check of group.checks) {
        checkCitation(
          check.citation,
          check.expectedFile,
          check.expectedValue,
          check.expectedCommand,
        );
      }
    }
    for (const group of decisionsGroups) {
      expect(group.checks.length, group.name).toBeGreaterThan(0);
      for (const check of group.checks) {
        checkCitation(
          check.citation,
          check.expectedFile,
          check.expectedValue,
          check.expectedCommand,
        );
      }
    }
  });

  it("writes track-query.json and track-decisions.json and recovers citations by line", async () => {
    const fixture = loadRealFixture();
    const queryText = formatTrackProjection(fixture.items);
    const decisionsText = formatTrackProjection(fixture.decisions);
    const stateRoot = await mkdtemp(join(tmpdir(), "appctx-l3-"));
    const written = await writeTrackProjections({
      stateRootDir: stateRoot,
      commit: COMMIT,
      queryText,
      decisionsText,
    });
    expect(written.queryRel).toBe("track-projections/track-query.json");
    expect(written.decisionsRel).toBe("track-projections/track-decisions.json");

    const queryStored = await readFile(written.queryAbs, "utf8");
    const decisionsStored = await readFile(written.decisionsAbs, "utf8");
    expect(queryStored).toBe(queryText);
    expect(decisionsStored).toBe(decisionsText);
    expect(JSON.parse(queryStored)).toEqual(fixture.items);
    expect(JSON.parse(decisionsStored)).toEqual(fixture.decisions);

    // Recover every item citation from the stored file: span parses back to the record.
    const spans = indexPrettyArrayElements(queryStored);
    expect(spans).toHaveLength(fixture.items.length);
    expect(spans[0]!.line_start).toBe(2);
    const storedLines = queryStored.split("\n");
    for (const [index, span] of spans.entries()) {
      expect(span.line_end).toBeGreaterThanOrEqual(span.line_start);
      expect(parseElementSlice(storedLines, span)).toEqual(fixture.items[index]);
    }
    const decisionSpans = indexPrettyArrayElements(decisionsStored);
    expect(decisionSpans).toHaveLength(fixture.decisions.length);
  });

  it.each(["queryText", "decisionsText"] as const)(
    "should reject a graph document in %s before any projection write",
    async (field) => {
      const stateRoot = await mkdtemp(join(tmpdir(), "appctx-l3-"));
      const projections = { queryText: "[]\n", decisionsText: "[]\n" };
      const written = await writeTrackProjections({
        stateRootDir: stateRoot,
        commit: COMMIT,
        ...projections,
      });
      mutationTargets.length = 0;
      await expect(writeTrackProjections({
        stateRootDir: stateRoot,
        commit: COMMIT,
        ...projections,
        [field]: JSON.stringify({ graph_format: "engram-graph/3", nodes: [], links: [] }),
      })).rejects.toThrow("must return a JSON array");
      expect(mutationTargets).toEqual([]);
      expect(await readFile(written.queryAbs, "utf8")).toBe(projections.queryText);
      expect(await readFile(written.decisionsAbs, "utf8")).toBe(projections.decisionsText);
    },
  );
});

describe("track links and diagnostics (Lot L3, §4.3)", () => {
  function buildContext(
    items: TrackCliItem[] = [ITEM_A, ITEM_NO_WP, ITEM_WP_NO_LABEL],
    decisions: TrackCliDecision[] = [DECISION_STRUCTURED, DECISION_PLAIN],
  ) {
    const built = buildTrackNodes({
      repoKey: REPO_KEY,
      commit: COMMIT,
      cliVersion: CLI_VERSION,
      items,
      decisions,
    });
    return {
      repoKey: REPO_KEY,
      commit: COMMIT,
      cliVersion: CLI_VERSION,
      items,
      decisions,
      ...built,
    };
  }

  it("should retain every projection citation when repeated records share a triple", () => {
    const ctx = buildContext(
      [ITEM_A, { ...ITEM_A }],
      [DECISION_STRUCTURED, { ...DECISION_STRUCTURED }],
    );
    const specNode = appContextNodeId(REPO_KEY, "Spec", ["docs/spec/alpha.md"]);
    const mentions = linkSpecPathMentions({
      ...ctx,
      specFileToNodeId: new Map([
        ["docs/spec/alpha.md", specNode],
        ["docs/spec/decision-log.md", specNode],
      ]),
    });
    expect(mentions.diagnostics).toEqual([]);
    expect(mentions.edges).toHaveLength(4);
    expect(mentions.edges.map(edge => edge.citations[0]!.json_pointer)).toEqual([
      "/0/detail/summary", "/1/detail/summary", "/0/contextExcerpt", "/1/contextExcerpt",
    ]);
    const edges = [...linkTrackInWorkpackages(ctx).edges, ...mentions.edges];
    const graph = buildFromJson({
      nodes: [...new Set(edges.flatMap(edge => [edge.source, edge.target]))].map(id => ({
        id, label: id, file_type: "concept", source_file: TRACK_QUERY_REL,
      })),
      edges: edges.map(edge => ({ ...edge })),
      input_tokens: 0,
      output_tokens: 0,
    });
    const document = serializeGraph(graph);
    expect(document.links).toHaveLength(3);
    for (const link of document.links) {
      expect(link.evidence_observations).toHaveLength(2);
      expect(link.citations).toHaveLength(2);
    }
  });

  it("should build one link per directed triple with verbatim observations from all five producers", () => {
    const ctx = buildContext(
      [ITEM_A, { ...ITEM_WP_NO_LABEL, detail: undefined }],
      [DECISION_STRUCTURED],
    );
    const specNode = appContextNodeId(REPO_KEY, "Spec", ["docs/spec/alpha.md"]);
    const declarations = (["frontmatter", "section-marker", "spec-map", "frontmatter"] as const)
      .map(kind => ({
        targetId: specNode, kind, track: [ITEM_A.id], decisions: [DECISION_STRUCTURED.id],
      }));
    const explicit = linkExplicitTrackDeclarations({ ...ctx, declarations });
    const mentions = linkSpecPathMentions({
      ...ctx,
      specFileToNodeId: new Map([
        ["docs/spec/alpha.md", specNode],
        ["docs/spec/decision-log.md", specNode],
      ]),
    });
    expect(explicit.diagnostics).toEqual([]);
    expect(mentions.diagnostics).toEqual([]);
    const edges = [...linkTrackInWorkpackages(ctx).edges, ...explicit.edges, ...mentions.edges];
    const before = JSON.stringify(edges);
    const nodes = [...new Set(edges.flatMap(edge => [edge.source, edge.target]))].map(id => ({
      id, label: id, file_type: "concept" as const, source_file: TRACK_QUERY_REL,
    }));
    const buildDocument = (ordered: typeof edges) => serializeGraph(buildFromJson({
      nodes,
      edges: ordered.map(edge => ({ ...edge })),
      input_tokens: 0,
      output_tokens: 0,
    }));
    const document = buildDocument([...edges, ...edges]);
    expect(document.graph_format).toBe("engram-graph/2");
    expect(document.links).toHaveLength(4);
    for (const link of document.links) {
      const emissions = edges.filter(edge =>
        edge.source === link.source && edge.target === link.target && edge.relation === link.relation);
      const methods = [...new Set(emissions.flatMap(edge => edge.derivation_methods))].sort();
      expect(link.derivation_methods).toEqual(methods);
      const expectedObservations = emissions.map(edge => ({
        source_file: edge.source_file,
        confidence: edge.confidence,
        derivation_method: edge.derivation_methods[0],
        evidence_refs: edge.evidence_refs,
        citations: edge.citations,
      }));
      const uniqueObservations = [...new Map(expectedObservations.map(obs => [JSON.stringify(obs), obs])).values()];
      expect(link.evidence_observations).toHaveLength(uniqueObservations.length);
      expect(link.evidence_observations).toEqual(expect.arrayContaining(uniqueObservations));
    }
    expect(buildDocument([...edges].reverse())).toEqual(document);
    expect(serializeGraph(loadGraphFromData(JSON.parse(JSON.stringify(document))))).toEqual(document);
    expect(JSON.stringify(edges)).toBe(before);
  });

  it("links items to workpackages via in_workpackage and shares one wp node", () => {
    const ctx = buildContext();
    const { edges } = linkTrackInWorkpackages(ctx);
    // ITEM_A and ITEM_WP_NO_LABEL share WP_ID; ITEM_NO_WP has no wpId.
    expect(edges).toHaveLength(2);
    for (const edge of edges) {
      expect(edge.relation).toBe("in_workpackage");
      expect(edge.target).toBe(ctx.wpIdToNodeId.get(WP_ID));
      expect(edge.confidence).toBe("EXTRACTED");
      expect(edge.derivation_methods).toEqual(["track_query_wp_id"]);
      expect(edge.source_file).toBe("track-projections/track-query.json");
      expect(edge.citations).toHaveLength(1);
      expect(edge.citations[0]!.citation_kind).toBe("track_cli_projection");
      expect(edge.citations[0]!.command).toBe("track query --format json");
      expect(edge.citations[0]!.json_pointer.endsWith("/wpId")).toBe(true);
    }
    const sources = edges.map((e) => e.source).sort();
    expect(sources).toEqual(
      [ctx.itemIdToNodeId.get(ITEM_A.id), ctx.itemIdToNodeId.get(ITEM_WP_NO_LABEL.id)].sort(),
    );
  });

  it("links explicit ULID declarations and reports unknown ULIDs as track-id-unresolved", () => {
    const ctx = buildContext();
    const specNode = appContextNodeId(REPO_KEY, "Spec", ["docs/spec/alpha.md"]);
    const { edges, diagnostics } = linkExplicitTrackDeclarations({
      ...ctx,
      declarations: [
        {
          targetId: specNode,
          kind: "frontmatter",
          track: [ITEM_A.id, WP_ID, "01JZZZZZZZZZZZZZZZZZZZZZZZ9"],
          decisions: [DECISION_STRUCTURED.id, "01JYYYYYYYYYYYYYYYYYYYYYYYYY8"],
        },
      ],
    });
    const tracksEdges = edges.filter((e) => e.relation === "tracks");
    expect(tracksEdges).toHaveLength(2);
    expect(tracksEdges.map((e) => e.source).sort()).toEqual(
      [ctx.itemIdToNodeId.get(ITEM_A.id), ctx.wpIdToNodeId.get(WP_ID)].sort(),
    );
    for (const edge of tracksEdges) {
      expect(edge.target).toBe(specNode);
      expect(edge.derivation_methods).toEqual(["spec_frontmatter_track"]);
    }
    const decidesEdges = edges.filter((e) => e.relation === "decides");
    expect(decidesEdges).toHaveLength(1);
    expect(decidesEdges[0]!.source).toBe(ctx.decisionIdToNodeId.get(DECISION_STRUCTURED.id));
    expect(decidesEdges[0]!.target).toBe(specNode);
    expect(decidesEdges[0]!.derivation_methods).toEqual(["spec_frontmatter_decisions"]);

    expect(diagnostics).toHaveLength(2);
    for (const diag of diagnostics) {
      expect(diag.code).toBe("track-id-unresolved");
      expect(diag.id).toMatch(/^diag:[0-9a-f]{32}$/);
    }
    const codes = diagnostics.map((d) => d.message).join("\n");
    expect(codes).toContain("01JZZZZZZZZZZZZZZZZZZZZZZZ9");
    expect(codes).toContain("01JYYYYYYYYYYYYYYYYYYYYYYYYY8");
  });

  it("keeps every emission for the same triplet in both declaration orders", () => {
    const ctx = buildContext();
    const specNode = appContextNodeId(REPO_KEY, "Spec", ["docs/spec/alpha.md"]);
    const orders = [
      ["frontmatter", "spec_frontmatter_track", "spec-map", "spec_map_track"],
      ["spec-map", "spec_map_track", "frontmatter", "spec_frontmatter_track"],
    ] as const;
    for (const [firstKind, firstMethod, secondKind, secondMethod] of orders) {
      const { edges, diagnostics } = linkExplicitTrackDeclarations({
        ...ctx,
        declarations: [
          {
            targetId: specNode,
            kind: firstKind,
            track: [ITEM_A.id],
            decisions: [DECISION_STRUCTURED.id],
          },
          {
            targetId: specNode,
            kind: secondKind,
            track: [ITEM_A.id],
            decisions: [DECISION_STRUCTURED.id],
          },
        ],
      });
      expect(diagnostics).toEqual([]);
      // No L3 dedup: L5 unions derivations and citations, so both emissions stay.
      const tracksEdges = edges.filter((e) => e.relation === "tracks");
      expect(tracksEdges).toHaveLength(2);
      expect(tracksEdges.map((e) => e.derivation_methods).sort()).toEqual(
        [[firstMethod], [secondMethod]].sort(),
      );
      for (const edge of tracksEdges) {
        expect(edge.source).toBe(ctx.itemIdToNodeId.get(ITEM_A.id));
        expect(edge.citations).toHaveLength(1);
        expect(edge.citations[0]!.json_pointer).toBe("/0");
        expect(edge.citations[0]!.command).toBe("track query --format json");
      }
      const decidesEdges = edges.filter((e) => e.relation === "decides");
      expect(decidesEdges).toHaveLength(2);
      const firstDecides = firstMethod.replace(/_track$/, "_decisions");
      const secondDecides = secondMethod.replace(/_track$/, "_decisions");
      expect(decidesEdges.map((e) => e.derivation_methods).sort()).toEqual(
        [[firstDecides], [secondDecides]].sort(),
      );
      for (const edge of decidesEdges) {
        expect(edge.source).toBe(
          ctx.decisionIdToNodeId.get(DECISION_STRUCTURED.id),
        );
        expect(edge.citations).toHaveLength(1);
        expect(edge.citations[0]!.command).toBe(
          "track decision ls --format json",
        );
      }
    }
  });

  it("reports target-ambiguous when one ULID matches a TrackItem and a TrackWorkpackage", () => {
    const fixture = loadRealFixture();
    const sharedId = fixture.items[0]!.id;
    const items: TrackCliItem[] = fixture.items.map((item, index) =>
      index === 1 ? { ...item, wpId: sharedId } : { ...item },
    );
    const ctx = buildContext(items, []);
    const specNode = appContextNodeId(REPO_KEY, "Spec", ["docs/spec/alpha.md"]);
    const { edges, diagnostics } = linkExplicitTrackDeclarations({
      ...ctx,
      declarations: [
        {
          targetId: specNode,
          kind: "frontmatter",
          track: [sharedId, fixture.items[1]!.id],
          decisions: [],
        },
      ],
    });
    // The shared ULID matches both kinds: no edge, one target-ambiguous diagnostic.
    expect(edges.filter((e) => e.target === specNode)).toHaveLength(1);
    expect(
      edges.find((e) => e.target === specNode)!.source,
    ).toBe(ctx.itemIdToNodeId.get(fixture.items[1]!.id));
    const ambiguous = diagnostics.filter((d) => d.code === "target-ambiguous");
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0]!.id).toBe(
      appContextNodeId(REPO_KEY, "Diagnostic", ["target-ambiguous", sharedId]),
    );
    expect(ambiguous[0]!.id).toMatch(/^diag:[0-9a-f]{32}$/);
    expect(ambiguous[0]!.message).toContain(sharedId);
    // Both candidate projection locations are kept for L5.
    expect(ambiguous[0]!.candidates).toHaveLength(2);
    for (const candidate of ambiguous[0]!.candidates!) {
      expect(candidate.file).toBe("track-projections/track-query.json");
      expect(candidate.endLine).toBeGreaterThanOrEqual(candidate.startLine);
      expect(candidate.label).toContain(sharedId);
    }
    expect(
      ambiguous[0]!.candidates!.map((c) => c.label).sort(),
    ).toEqual(
      [`TrackItem ${sharedId}`, `TrackWorkpackage ${sharedId}`].sort(),
    );
  });

  it("uses spec-map derivation names for manifest declarations", () => {
    const ctx = buildContext();
    const specNode = appContextNodeId(REPO_KEY, "Spec", ["docs/spec/alpha.md"]);
    const { edges, diagnostics } = linkExplicitTrackDeclarations({
      ...ctx,
      declarations: [
        { targetId: specNode, kind: "spec-map", track: [ITEM_A.id], decisions: [] },
      ],
    });
    expect(diagnostics).toEqual([]);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.derivation_methods).toEqual(["spec_map_track"]);
  });

  it("uses section-marker derivation names for marker declarations", () => {
    const ctx = buildContext();
    const specNode = appContextNodeId(REPO_KEY, "Spec", ["docs/spec/alpha.md"]);
    const { edges, diagnostics } = linkExplicitTrackDeclarations({
      ...ctx,
      declarations: [
        {
          targetId: specNode,
          kind: "section-marker",
          track: [ITEM_A.id],
          decisions: [DECISION_STRUCTURED.id],
        },
      ],
    });
    expect(diagnostics).toEqual([]);
    expect(edges).toHaveLength(2);
    const tracksEdges = edges.filter((e) => e.relation === "tracks");
    const decidesEdges = edges.filter((e) => e.relation === "decides");
    expect(tracksEdges).toHaveLength(1);
    expect(tracksEdges[0]!.derivation_methods).toEqual([
      "spec_section_marker_track",
    ]);
    expect(decidesEdges).toHaveLength(1);
    expect(decidesEdges[0]!.derivation_methods).toEqual([
      "spec_section_marker_decisions",
    ]);
  });

  it("emits target-unresolved for complete refs with no declared spec", () => {
    const ghost = "docs/spec/ghost.md";
    const ghostItem: TrackCliItem = {
      ...ITEM_NO_WP,
      detail: { summary: "See docs/spec/ghost.md for details." },
    };
    const ghostDecision: TrackCliDecision = {
      ...DECISION_PLAIN,
      contextExcerpt: "See docs/spec/ghost.md for rationale.",
    };
    const ctx = buildContext([ghostItem], [ghostDecision]);
    const { edges, diagnostics } = linkSpecPathMentions({
      ...ctx,
      specFileToNodeId: new Map([
        ["docs/spec/alpha.md", appContextNodeId(REPO_KEY, "Spec", ["docs/spec/alpha.md"])],
      ]),
    });
    // A complete explicit path with zero candidates diagnoses (§4.1) instead
    // of linking, with the projection file/line as location.
    expect(edges).toEqual([]);
    expect(diagnostics).toHaveLength(2);
    const summaryDiag = diagnostics.find(
      (d) => d.file === TRACK_QUERY_REL,
    )!;
    expect(summaryDiag.code).toBe("target-unresolved");
    expect(summaryDiag.id).toBe(
      appContextNodeId(REPO_KEY, "Diagnostic", ["target-unresolved", ghost]),
    );
    expect(summaryDiag.id).toMatch(/^diag:[0-9a-f]{32}$/);
    expect(summaryDiag.message).toContain(ghost);
    expect(summaryDiag.message).toContain(ghostItem.id);
    expect(summaryDiag.line).toBeGreaterThanOrEqual(1);
    const excerptDiag = diagnostics.find(
      (d) => d.file === TRACK_DECISIONS_REL,
    )!;
    expect(excerptDiag.code).toBe("target-unresolved");
    expect(excerptDiag.id).toBe(
      appContextNodeId(REPO_KEY, "Diagnostic", ["target-unresolved", ghost]),
    );
    expect(excerptDiag.message).toContain(ghost);
    expect(excerptDiag.message).toContain(ghostDecision.id);
    expect(excerptDiag.line).toBeGreaterThanOrEqual(1);
  });

  it("extracts intact .md paths from summaries and excerpts, rejecting …-truncated tails", () => {
    const ctx = buildContext();
    const specFileToNodeId = new Map([
      ["docs/spec/alpha.md", appContextNodeId(REPO_KEY, "Spec", ["docs/spec/alpha.md"])],
      ["docs/spec/decision-log.md", appContextNodeId(REPO_KEY, "Spec", ["docs/spec/decision-log.md"])],
      ["docs/spec/beta.md", appContextNodeId(REPO_KEY, "Spec", ["docs/spec/beta.md"])],
    ]);
    const { edges } = linkSpecPathMentions({ ...ctx, specFileToNodeId });
    // ITEM_A summary names docs/spec/alpha.md intactly; ITEM_WP_NO_LABEL names
    // docs/spec/beta.md only with a … tail; DECISION_STRUCTURED names decision-log.md.
    const tracksEdges = edges.filter((e) => e.relation === "tracks");
    expect(tracksEdges).toHaveLength(1);
    expect(tracksEdges[0]!.source).toBe(ctx.itemIdToNodeId.get(ITEM_A.id));
    expect(tracksEdges[0]!.target).toBe(specFileToNodeId.get("docs/spec/alpha.md"));
    expect(tracksEdges[0]!.derivation_methods).toEqual(["track_item_summary_spec_path"]);
    expect(tracksEdges[0]!.citations[0]!.json_pointer).toBe("/0/detail/summary");
    const decidesEdges = edges.filter((e) => e.relation === "decides");
    expect(decidesEdges).toHaveLength(1);
    expect(decidesEdges[0]!.source).toBe(
      ctx.decisionIdToNodeId.get(DECISION_STRUCTURED.id),
    );
    expect(decidesEdges[0]!.derivation_methods).toEqual([
      "track_decision_excerpt_spec_path",
    ]);
  });

  it("rejects path prefixes, suffixes and embedded matches in summaries and excerpts", () => {
    const alpha = "docs/spec/alpha.md";
    const specNode = appContextNodeId(REPO_KEY, "Spec", [alpha]);
    const specFileToNodeId = new Map([[alpha, specNode]]);
    const summaryItem: TrackCliItem = {
      ...ITEM_NO_WP,
      detail: {
        summary: [
          "See docs/spec/alpha.mdx here,",
          "docs/spec/alpha.md.backup there,",
          "docs/spec/alpha.md/more below,",
          "and \u00e9docs/spec/alpha.md nearby.",
        ].join(" "),
      },
    };
    const excerptDecision: TrackCliDecision = {
      ...DECISION_PLAIN,
      contextExcerpt: [
        "See docs/spec/alpha.mdx here,",
        "docs/spec/alpha.md.backup there,",
        "docs/spec/alpha.md/more below,",
        "and \u00e9docs/spec/alpha.md nearby.",
      ].join(" "),
    };
    const ctx = buildContext([summaryItem], [excerptDecision]);
    const { edges } = linkSpecPathMentions({ ...ctx, specFileToNodeId });
    expect(edges).toEqual([]);
  });

  // M1 counter-examples: each fragment is a match inside a larger invalid
  // token (backup suffix, foreign prefix, astral boundary, combining mark).
  // A fragment is never a complete reference: zero edges. Each rejected
  // fragment is diagnosed per binding rule 2, it never links.
  const FRAGMENT_CASES = [
    "docs/spec/alpha.md~",
    "archive+docs/spec/alpha.md",
    "\u{1D4AA}docs/spec/alpha.md",
    "docs/spec/alpha.md\u{1D4AA}",
    "édocs/spec/alpha.md",
  ];

  it.each(FRAGMENT_CASES)("rejects path fragment in summaries: %s", (fragment) => {
    const alpha = "docs/spec/alpha.md";
    const specNode = appContextNodeId(REPO_KEY, "Spec", [alpha]);
    const item: TrackCliItem = {
      ...ITEM_NO_WP,
      detail: { summary: `See ${fragment} for details.` },
    };
    const ctx = buildContext([item], []);
    const { edges, diagnostics } = linkSpecPathMentions({
      ...ctx,
      specFileToNodeId: new Map([[alpha, specNode]]),
    });
    expect(edges).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("unsupported-construct");
    expect(diagnostics[0]!.id).toMatch(/^diag:[0-9a-f]{32}$/);
    expect(diagnostics[0]!.file).toBe(TRACK_QUERY_REL);
    expect(diagnostics[0]!.line).toBeGreaterThanOrEqual(1);
  });

  it.each(FRAGMENT_CASES)("rejects path fragment in excerpts: %s", (fragment) => {
    const alpha = "docs/spec/alpha.md";
    const specNode = appContextNodeId(REPO_KEY, "Spec", [alpha]);
    const decision: TrackCliDecision = {
      ...DECISION_PLAIN,
      contextExcerpt: `See ${fragment} for rationale.`,
    };
    const ctx = buildContext([], [decision]);
    const { edges, diagnostics } = linkSpecPathMentions({
      ...ctx,
      specFileToNodeId: new Map([[alpha, specNode]]),
    });
    expect(edges).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("unsupported-construct");
    expect(diagnostics[0]!.id).toMatch(/^diag:[0-9a-f]{32}$/);
    expect(diagnostics[0]!.file).toBe(TRACK_DECISIONS_REL);
    expect(diagnostics[0]!.line).toBeGreaterThanOrEqual(1);
  });

  // B1 counter-examples (review R3): `@`, `%`, `\` and emoji symbols are
  // not separators. Each token below is tried in backticks, exactly as the
  // review probed it: the whole token is rejected (zero edges, one
  // `unsupported-construct`), the scanner never links the ASCII fragment
  // inside and never resumes the search inside the rejected token.
  const B1_FRAGMENT_CASES = [
    "archive@docs/spec/alpha.md",
    "docs/spec/alpha.md@backup",
    "docs/spec/alpha.md%20copy",
    "\u{1F5C2}docs/spec/alpha.md",
    "docs/spec/alpha.md\u{1F4BE}",
    "archive\\docs/spec/alpha.md",
  ];

  it.each(B1_FRAGMENT_CASES)(
    "B1: rejects non-separator-adjacent token in summaries: %s",
    (fragment) => {
      const alpha = "docs/spec/alpha.md";
      const specNode = appContextNodeId(REPO_KEY, "Spec", [alpha]);
      const item: TrackCliItem = {
        ...ITEM_NO_WP,
        detail: { summary: `See \`${fragment}\` for details.` },
      };
      const ctx = buildContext([item], []);
      const { edges, diagnostics } = linkSpecPathMentions({
        ...ctx,
        specFileToNodeId: new Map([[alpha, specNode]]),
      });
      expect(edges).toEqual([]);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]!.code).toBe("unsupported-construct");
      expect(diagnostics[0]!.id).toMatch(/^diag:[0-9a-f]{32}$/);
      expect(diagnostics[0]!.file).toBe(TRACK_QUERY_REL);
      expect(diagnostics[0]!.line).toBeGreaterThanOrEqual(1);
    },
  );

  it.each(B1_FRAGMENT_CASES)(
    "B1: rejects non-separator-adjacent token in excerpts: %s",
    (fragment) => {
      const alpha = "docs/spec/alpha.md";
      const specNode = appContextNodeId(REPO_KEY, "Spec", [alpha]);
      const decision: TrackCliDecision = {
        ...DECISION_PLAIN,
        contextExcerpt: `See \`${fragment}\` for rationale.`,
      };
      const ctx = buildContext([], [decision]);
      const { edges, diagnostics } = linkSpecPathMentions({
        ...ctx,
        specFileToNodeId: new Map([[alpha, specNode]]),
      });
      expect(edges).toEqual([]);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]!.code).toBe("unsupported-construct");
      expect(diagnostics[0]!.id).toMatch(/^diag:[0-9a-f]{32}$/);
      expect(diagnostics[0]!.file).toBe(TRACK_DECISIONS_REL);
      expect(diagnostics[0]!.line).toBeGreaterThanOrEqual(1);
    },
  );

  // Positive controls for every explicitly allowed separator: a complete ref
  // wrapped in that separator links once with zero diagnostics. Anything not
  // listed here and not a file-name character rejects the whole token (B1).
  const EXPLICIT_SEPARATOR_CASES = [
    " ",
    "\t",
    "\n",
    "\r",
    ":",
    ";",
    ",",
    "!",
    "?",
    '"',
    "'",
    "`",
    "(",
    ")",
    "[",
    "]",
    "{",
    "}",
    "<",
    ">",
    "«",
    "»",
    "\u2018",
    "\u2019",
    "\u201c",
    "\u201d",
    "\u2013",
    "\u2014",
    "*",
    "#",
    "|",
  ];

  it.each(EXPLICIT_SEPARATOR_CASES)(
    "links a complete ref wrapped in explicit separator in summaries: %s",
    (separator) => {
      const alpha = "docs/spec/alpha.md";
      const specNode = appContextNodeId(REPO_KEY, "Spec", [alpha]);
      const item: TrackCliItem = {
        ...ITEM_NO_WP,
        detail: {
          summary: `Ref${separator}${alpha}${separator}end`,
        },
      };
      const ctx = buildContext([item], []);
      const { edges, diagnostics } = linkSpecPathMentions({
        ...ctx,
        specFileToNodeId: new Map([[alpha, specNode]]),
      });
      const tracksEdges = edges.filter((e) => e.relation === "tracks");
      expect(tracksEdges).toHaveLength(1);
      expect(tracksEdges[0]!.target).toBe(specNode);
      expect(diagnostics).toEqual([]);
    },
  );

  it.each(EXPLICIT_SEPARATOR_CASES)(
    "links a complete ref wrapped in explicit separator in excerpts: %s",
    (separator) => {
      const alpha = "docs/spec/alpha.md";
      const specNode = appContextNodeId(REPO_KEY, "Spec", [alpha]);
      const decision: TrackCliDecision = {
        ...DECISION_PLAIN,
        contextExcerpt: `Note${separator}${alpha}${separator}end`,
      };
      const ctx = buildContext([], [decision]);
      const { edges, diagnostics } = linkSpecPathMentions({
        ...ctx,
        specFileToNodeId: new Map([[alpha, specNode]]),
      });
      const decidesEdges = edges.filter((e) => e.relation === "decides");
      expect(decidesEdges).toHaveLength(1);
      expect(decidesEdges[0]!.target).toBe(specNode);
      expect(diagnostics).toEqual([]);
    },
  );

  it("accepts complete refs surrounded by supported punctuation", () => {
    const alpha = "docs/spec/alpha.md";
    const specNode = appContextNodeId(REPO_KEY, "Spec", [alpha]);
    const specFileToNodeId = new Map([[alpha, specNode]]);
    const summaryItem: TrackCliItem = {
      ...ITEM_NO_WP,
      detail: {
        summary:
          "Ref:docs/spec/alpha.md, also \"docs/spec/alpha.md\"! See {docs/spec/alpha.md} or <docs/spec/alpha.md>?",
      },
    };
    const excerptDecision: TrackCliDecision = {
      ...DECISION_PLAIN,
      contextExcerpt:
        "Notes 'docs/spec/alpha.md' — also «docs/spec/alpha.md» end.",
    };
    const ctx = buildContext([summaryItem], [excerptDecision]);
    const { edges, diagnostics } = linkSpecPathMentions({
      ...ctx,
      specFileToNodeId,
    });
    const tracksEdges = edges.filter((e) => e.relation === "tracks");
    expect(tracksEdges).toHaveLength(1);
    expect(tracksEdges[0]!.target).toBe(specNode);
    const decidesEdges = edges.filter((e) => e.relation === "decides");
    expect(decidesEdges).toHaveLength(1);
    expect(decidesEdges[0]!.target).toBe(specNode);
    expect(diagnostics).toEqual([]);
  });

  it("accepts complete refs wrapped in Markdown punctuation", () => {
    const alpha = "docs/spec/alpha.md";
    const specNode = appContextNodeId(REPO_KEY, "Spec", [alpha]);
    const specFileToNodeId = new Map([[alpha, specNode]]);
    const summaryItem: TrackCliItem = {
      ...ITEM_NO_WP,
      detail: {
        summary:
          "See (docs/spec/alpha.md), [docs/spec/alpha.md](other.md), `docs/spec/alpha.md` and ref docs/spec/alpha.md",
      },
    };
    const excerptDecision: TrackCliDecision = {
      ...DECISION_PLAIN,
      contextExcerpt: 'Mentions "docs/spec/alpha.md"; also \u00abdocs/spec/alpha.md\u00bb.',
    };
    const ctx = buildContext([summaryItem], [excerptDecision]);
    const { edges } = linkSpecPathMentions({ ...ctx, specFileToNodeId });
    const tracksEdges = edges.filter((e) => e.relation === "tracks");
    expect(tracksEdges).toHaveLength(1);
    expect(tracksEdges[0]!.source).toBe(ctx.itemIdToNodeId.get(summaryItem.id));
    expect(tracksEdges[0]!.target).toBe(specNode);
    const decidesEdges = edges.filter((e) => e.relation === "decides");
    expect(decidesEdges).toHaveLength(1);
    expect(decidesEdges[0]!.source).toBe(
      ctx.decisionIdToNodeId.get(excerptDecision.id),
    );
    expect(decidesEdges[0]!.target).toBe(specNode);
  });

  it("links real fixture spec paths: intact summary ref and exact excerpt ref", () => {
    const fixture = loadRealFixture();
    const ctx = buildContext(fixture.items, fixture.decisions);
    const specFileToNodeId = new Map([
      [
        "docs/spec/SPEC_EVOL_INTEGRATION_CARTE_STEVE.md",
        appContextNodeId(REPO_KEY, "Spec", ["docs/spec/SPEC_EVOL_INTEGRATION_CARTE_STEVE.md"]),
      ],
      [
        "docs/spec/decision-tracking-structure-v1.md",
        appContextNodeId(REPO_KEY, "Spec", ["docs/spec/decision-tracking-structure-v1.md"]),
      ],
    ]);
    const { edges } = linkSpecPathMentions({ ...ctx, specFileToNodeId });
    const csL2 = ctx.itemIdToNodeId.get("01KTW1NZ55V6FTN3ACJSKQQNQ7")!;
    const summaryEdge = edges.find(
      (e) => e.source === csL2 && e.relation === "tracks",
    )!;
    expect(summaryEdge.target).toBe(
      specFileToNodeId.get("docs/spec/SPEC_EVOL_INTEGRATION_CARTE_STEVE.md"),
    );
    const decV1 = ctx.decisionIdToNodeId.get("01KW775RC2T3FQD76A3KNNS2FD")!;
    const excerptEdge = edges.find(
      (e) => e.source === decV1 && e.relation === "decides",
    )!;
    expect(excerptEdge.target).toBe(
      specFileToNodeId.get("docs/spec/decision-tracking-structure-v1.md"),
    );
    // The truncated Loi-25 tail of 01KW5RX4BYHM31ZW4M0WXBR15S ("…") yields no edge.
    const loi25 = ctx.decisionIdToNodeId.get("01KW5RX4BYHM31ZW4M0WXBR15S")!;
    expect(edges.filter((e) => e.source === loi25)).toEqual([]);
  });

  it("emits only relations and derivation methods declared in profile.yaml", () => {
    const ctx = buildContext();
    const specNode = appContextNodeId(REPO_KEY, "Spec", ["docs/spec/alpha.md"]);
    const wp = linkTrackInWorkpackages(ctx);
    const explicit = linkExplicitTrackDeclarations({
      ...ctx,
      declarations: [
        {
          targetId: specNode,
          kind: "section-marker",
          track: [ITEM_A.id],
          decisions: [DECISION_STRUCTURED.id],
        },
      ],
    });
    const mentions = linkSpecPathMentions({
      ...ctx,
      specFileToNodeId: new Map([["docs/spec/alpha.md", specNode]]),
    });
    const allEdges = [...wp.edges, ...explicit.edges, ...mentions.edges];
    expect(allEdges.length).toBeGreaterThan(0);

    const raw = readFileSync(profilePath, "utf8");
    const profile = parseOntologyProfile(raw, profilePath);
    const relationTypes = profile.relation_types as Record<
      string,
      { derivation_methods?: string[] }
    >;
    for (const edge of allEdges) {
      const declared = relationTypes[edge.relation];
      expect(declared, `relation ${edge.relation} declared`).toBeDefined();
      for (const method of edge.derivation_methods) {
        expect(
          declared?.derivation_methods ?? [],
          `${edge.relation}.${method} declared`,
        ).toContain(method);
      }
    }
  });
});

describe("read-only CLI collection (Lot L3, §4.3)", () => {
  interface RecordedCall {
    args: readonly string[];
    cwd: string;
    timeoutMs: number;
  }

  async function makeRepoDir(withTrack: boolean): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "appctx-l3-repo-"));
    if (withTrack) {
      // Fake `.track` presence: no directory is created and no Track event
      // (real or temporary) is needed for these tests.
      presentTrackDirs.add(join(dir, ".track"));
    }
    return dir;
  }

  function makeFixtureRunner(calls: RecordedCall[]) {
    const fixture = loadRealFixture();
    return async (args: readonly string[], opts: { cwd: string; timeoutMs: number }) => {
      calls.push({ args, cwd: opts.cwd, timeoutMs: opts.timeoutMs });
      if (args.length === 1 && args[0] === "--version") {
        return { stdout: "track 0.3.0\n" };
      }
      if (args.join(" ") === "query --format json") {
        return { stdout: JSON.stringify(fixture.items) };
      }
      if (args.join(" ") === "decision ls --format json") {
        return { stdout: JSON.stringify(fixture.decisions) };
      }
      throw new Error(`unexpected track invocation: ${args.join(" ")}`);
    };
  }

  it("runs exactly the three read-only commands with timeout and parses projections", async () => {
    const repoDir = await makeRepoDir(true);
    const calls: RecordedCall[] = [];
    const collected = await collectTrackProjections({
      repoDir,
      runner: makeFixtureRunner(calls),
    });
    expect(calls.map((c) => [...c.args])).toEqual([
      ["--version"],
      ["query", "--format", "json"],
      ["decision", "ls", "--format", "json"],
    ]);
    expect(TRACK_VERSION_ARGS).toEqual(["--version"]);
    expect(TRACK_QUERY_ARGS).toEqual(["query", "--format", "json"]);
    expect(TRACK_DECISIONS_ARGS).toEqual(["decision", "ls", "--format", "json"]);
    // Read-only: only the three exact invocations, zero write flags, pinned timeout.
    expect(TRACK_TIMEOUT_MS).toBe(15_000);
    for (const call of calls) {
      expect(call.cwd).toBe(repoDir);
      expect(call.timeoutMs).toBe(15_000);
      for (const arg of call.args) {
        expect(arg.startsWith("--write")).toBe(false);
        expect(arg).not.toBe("import");
      }
    }
    expect(collected.cliVersion).toBe("track 0.3.0");
    const fixture = loadRealFixture();
    expect(collected.items).toEqual(fixture.items);
    expect(collected.decisions).toEqual(fixture.decisions);
  });

  it("runs the production runner with exact read-only argv, cwd, timeout and stdio", async () => {
    const repoDir = await makeRepoDir(true);
    const fixture = loadRealFixture();
    execFileSyncStub.queryStdout = JSON.stringify(fixture.items);
    execFileSyncStub.decisionsStdout = JSON.stringify(fixture.decisions);
    // No runner: the default production runner shells out to `track`.
    const collected = await collectTrackProjections({ repoDir });
    expect(collected.cliVersion).toBe("track 0.3.0");
    expect(collected.items).toEqual(fixture.items);
    expect(collected.decisions).toEqual(fixture.decisions);
    expect(execFileSyncStub.calls).toHaveLength(3);
    expect(execFileSyncStub.calls.map((c) => c.args)).toEqual([
      ["--version"],
      ["query", "--format", "json"],
      ["decision", "ls", "--format", "json"],
    ]);
    for (const call of execFileSyncStub.calls) {
      expect(call.bin).toBe("track");
      expect(call.opts["cwd"]).toBe(repoDir);
      expect(call.opts["timeout"]).toBe(15_000);
      expect(call.opts["stdio"]).toEqual(["ignore", "pipe", "pipe"]);
      expect(call.opts["shell"]).toBeFalsy();
      for (const arg of call.args as string[]) {
        expect(arg.startsWith("--write")).toBe(false);
        expect(arg).not.toBe("import");
      }
    }
    expect(TRACK_TIMEOUT_MS).toBe(15_000);
    // Read-only collection performs zero filesystem mutations.
    expect(mutationTargets).toEqual([]);
  });

  it("collects read-only with zero filesystem mutations and none inside .track", async () => {
    const repoDir = await makeRepoDir(true);
    const calls: RecordedCall[] = [];
    await extractTrack({
      repoDir,
      repoKey: REPO_KEY,
      commit: COMMIT,
      runner: makeFixtureRunner(calls),
      specFileToNodeId: new Map([
        [
          "docs/spec/SPEC_EVOL_INTEGRATION_CARTE_STEVE.md",
          appContextNodeId(REPO_KEY, "Spec", [
            "docs/spec/SPEC_EVOL_INTEGRATION_CARTE_STEVE.md",
          ]),
        ],
      ]),
    });

    // Read-only collection performs zero mutations at all ...
    expect(calls).toHaveLength(3);
    expect(mutationTargets).toEqual([]);
    // ... and belt-and-braces: no intercepted mutation may target `.track`.
    for (const mutation of mutationTargets) {
      expect(mutation.target.split(sep)).not.toContain(".track");
    }
  });

  it("refuses a persistence destination inside .track without writing", async () => {
    const repoDir = await makeRepoDir(false);
    const forbidden = join(repoDir, ".track", "state");
    await expect(
      writeTrackProjections({
        stateRootDir: forbidden,
        commit: COMMIT,
        queryText: "[]\n",
        decisionsText: "[]\n",
      }),
    ).rejects.toThrow(/\.track/);
    expect(mutationTargets).toEqual([]);
  });

  it("refuses a persistence destination that resolves inside .track", async () => {
    const base = await mkdtemp(join(tmpdir(), "appctx-l3-alias-"));
    const alias = join(base, "alias");
    await mkdir(alias, { recursive: true });
    mutationTargets.length = 0;
    // The alias resolves under a `.track` directory without one existing on disk.
    realpathOverrides.set(alias, join(sep, "virtual", "repo", ".track", "hidden"));
    await expect(
      writeTrackProjections({
        stateRootDir: alias,
        commit: COMMIT,
        queryText: "[]\n",
        decisionsText: "[]\n",
      }),
    ).rejects.toThrow(/\.track/);
    expect(mutationTargets).toEqual([]);
  });

  it("refuses a final track-query.json that resolves inside .track", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "appctx-l3-state-"));
    const queryAbs = join(
      resolve(stateRoot),
      "commits",
      COMMIT,
      "track-projections",
      "track-query.json",
    );
    // Final-file link into `.track` without one existing on disk: the target
    // is dangling, but its resolved location is still inside `.track`.
    realpathOverrides.set(
      queryAbs,
      join(sep, "virtual", "repo", ".track", "events.jsonl"),
    );
    await expect(
      writeTrackProjections({
        stateRootDir: stateRoot,
        commit: COMMIT,
        queryText: "[]\n",
        decisionsText: "[]\n",
      }),
    ).rejects.toThrow(/(\.track|symlink)/);
    expect(mutationTargets).toEqual([]);
  });

  it("refuses a real final symlink without following it", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "appctx-l3-state-"));
    const dir = join(
      resolve(stateRoot),
      "commits",
      COMMIT,
      "track-projections",
    );
    await mkdir(dir, { recursive: true });
    const outside = join(
      await mkdtemp(join(tmpdir(), "appctx-l3-outside-")),
      "target.json",
    );
    await writeFile(outside, "{}\n", "utf8");
    // Real on-disk symlink on the final file (no `.track` anywhere here):
    // `lstat` refuses it before any mutation instead of following it.
    await symlink(outside, join(dir, "track-query.json"));
    mutationTargets.length = 0;
    await expect(
      writeTrackProjections({
        stateRootDir: stateRoot,
        commit: COMMIT,
        queryText: "[]\n",
        decisionsText: "[]\n",
      }),
    ).rejects.toThrow(/symlink/);
    expect(mutationTargets).toEqual([]);
    expect(await readFile(outside, "utf8")).toBe("{}\n");
  });

  it("refuses a final track-decisions.json that resolves inside .track", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "appctx-l3-state-"));
    const decisionsAbs = join(
      resolve(stateRoot),
      "commits",
      COMMIT,
      "track-projections",
      "track-decisions.json",
    );
    // Same dangling-link shape on the second final file.
    realpathOverrides.set(
      decisionsAbs,
      join(sep, "virtual", "repo", ".track", "events.jsonl"),
    );
    await expect(
      writeTrackProjections({
        stateRootDir: stateRoot,
        commit: COMMIT,
        queryText: "[]\n",
        decisionsText: "[]\n",
      }),
    ).rejects.toThrow(/(\.track|symlink)/);
    expect(mutationTargets).toEqual([]);
  });

  it("rejects a non-40-hex commit before any write", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "appctx-l3-state-"));
    await expect(
      writeTrackProjections({
        stateRootDir: stateRoot,
        commit: "../escape",
        queryText: "[]\n",
        decisionsText: "[]\n",
      }),
    ).rejects.toThrow(/40-hex/);
    expect(mutationTargets).toEqual([]);
  });

  it("extractTrack end-to-end builds nodes, in_workpackage and excerpt edges", async () => {
    const repoDir = await makeRepoDir(true);
    const calls: RecordedCall[] = [];
    const specNode = appContextNodeId(REPO_KEY, "Spec", [
      "docs/spec/SPEC_EVOL_INTEGRATION_CARTE_STEVE.md",
    ]);
    const result = await extractTrack({
      repoDir,
      repoKey: REPO_KEY,
      commit: COMMIT,
      runner: makeFixtureRunner(calls),
      specFileToNodeId: new Map([
        ["docs/spec/SPEC_EVOL_INTEGRATION_CARTE_STEVE.md", specNode],
        [
          "docs/spec/decision-tracking-structure-v1.md",
          appContextNodeId(REPO_KEY, "Spec", [
            "docs/spec/decision-tracking-structure-v1.md",
          ]),
        ],
      ]),
      declarations: [
        {
          targetId: specNode,
          kind: "spec-map",
          track: ["01KW7HWD831W46RE1RM3NYMR9V"],
          decisions: [],
        },
      ],
    });
    expect(calls).toHaveLength(3);
    expect(result.cliVersion).toBe("track 0.3.0");
    // 5 fixture items + 3 fixture decisions + 3 distinct workpackages (WP4/WP6/WP7).
    expect(result.nodes).toHaveLength(11);
    const relations = result.edges.map((e) => e.relation).sort();
    expect(relations).toContain("in_workpackage");
    expect(relations).toContain("tracks");
    expect(relations).toContain("decides");
    for (const edge of result.edges) {
      expect(edge.confidence).toBe("EXTRACTED");
      expect(edge.citations).toHaveLength(1);
      expect(edge.citations[0]!.cli_version).toBe("track 0.3.0");
      expect(edge.citations[0]!.commit).toBe(COMMIT);
    }
    expect(result.queryText).toBe(
      `${JSON.stringify(loadRealFixture().items, null, 2)}\n`,
    );
  });

  it("propagates mention diagnostics from extractTrack", async () => {
    const repoDir = await makeRepoDir(true);
    const ghostItem: TrackCliItem = {
      ...ITEM_NO_WP,
      detail: { summary: "See docs/spec/ghost.md for details." },
    };
    const ghostDecision: TrackCliDecision = {
      ...DECISION_PLAIN,
      contextExcerpt: "See docs/spec/ghost.md for rationale.",
    };
    const calls: RecordedCall[] = [];
    const result = await extractTrack({
      repoDir,
      repoKey: REPO_KEY,
      commit: COMMIT,
      runner: async (
        args: readonly string[],
        opts: { cwd: string; timeoutMs: number },
      ) => {
        calls.push({ args, cwd: opts.cwd, timeoutMs: opts.timeoutMs });
        if (args.length === 1 && args[0] === "--version") {
          return { stdout: "track 0.3.0\n" };
        }
        if (args.join(" ") === "query --format json") {
          return { stdout: JSON.stringify([ghostItem]) };
        }
        if (args.join(" ") === "decision ls --format json") {
          return { stdout: JSON.stringify([ghostDecision]) };
        }
        throw new Error(`unexpected track invocation: ${args.join(" ")}`);
      },
      specFileToNodeId: new Map(),
    });
    expect(result.edges).toEqual([]);
    expect(result.diagnostics).toHaveLength(2);
    for (const diag of result.diagnostics) {
      expect(diag.code).toBe("target-unresolved");
      expect(diag.id).toMatch(/^diag:[0-9a-f]{32}$/);
      expect(diag.message).toContain("docs/spec/ghost.md");
    }
    expect(
      result.diagnostics.map((d) => d.file).sort(),
    ).toEqual([TRACK_QUERY_REL, TRACK_DECISIONS_REL].sort());
  });

  it("handles a missing .track directory gracefully with zero subprocess calls", async () => {
    const repoDir = await makeRepoDir(false);
    const calls: RecordedCall[] = [];
    const collected = await collectTrackProjections({
      repoDir,
      runner: makeFixtureRunner(calls),
    });
    expect(calls).toEqual([]);
    expect(collected.items).toEqual([]);
    expect(collected.decisions).toEqual([]);
    expect(collected.queryText).toBe("[]\n");
    expect(collected.decisionsText).toBe("[]\n");

    const result = await extractTrack({
      repoDir,
      repoKey: REPO_KEY,
      commit: COMMIT,
      runner: makeFixtureRunner(calls),
    });
    expect(calls).toEqual([]);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports declared but unresolved ids when .track is missing", async () => {
    const repoDir = await makeRepoDir(false);
    const calls: RecordedCall[] = [];
    const specNode = appContextNodeId(REPO_KEY, "Spec", ["docs/spec/alpha.md"]);
    const result = await extractTrack({
      repoDir,
      repoKey: REPO_KEY,
      commit: COMMIT,
      runner: makeFixtureRunner(calls),
      declarations: [
        {
          targetId: specNode,
          kind: "frontmatter",
          track: [ITEM_A.id],
          decisions: [DECISION_STRUCTURED.id],
        },
      ],
    });
    expect(calls).toEqual([]);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.diagnostics).toHaveLength(2);
    const byMessage = new Map(result.diagnostics.map((d) => [d.message, d]));
    for (const ulid of [ITEM_A.id, DECISION_STRUCTURED.id]) {
      const diag = result.diagnostics.find((d) => d.message.includes(ulid))!;
      expect(diag.code).toBe("track-id-unresolved");
      expect(diag.id).toBe(
        appContextNodeId(REPO_KEY, "Diagnostic", ["track-id-unresolved", ulid]),
      );
      expect(byMessage.get(diag.message)).toBe(diag);
    }
  });

  it("rejects malformed CLI JSON instead of inventing records", async () => {
    const repoDir = await makeRepoDir(true);
    await expect(
      collectTrackProjections({
        repoDir,
        runner: async (args) => {
          if (args[0] === "--version") return { stdout: "track 0.3.0\n" };
          return { stdout: "not json{" };
        },
      }),
    ).rejects.toThrow();
    await expect(
      collectTrackProjections({
        repoDir,
        runner: async (args) => {
          if (args[0] === "--version") return { stdout: "track 0.3.0\n" };
          return { stdout: '{"items":[]}' };
        },
      }),
    ).rejects.toThrow(/array/);
  });
});
