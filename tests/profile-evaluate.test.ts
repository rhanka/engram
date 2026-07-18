import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { main } from "../src/cli.js";
import {
  evaluateOccurrences,
  formatEvaluationReport,
  GoldValidationError,
  parseGold,
  TYPED_LINKING_EVALUATION_SCHEMA,
  TYPED_LINKING_GOLD_SCHEMA,
  type TypedLinkingGoldV1,
} from "../src/profile-evaluate.js";
import type { TypedEntityOccurrenceV1 } from "../src/types.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "evaluate");
const cleanup: string[] = [];

afterEach(() => {
  while (cleanup.length > 0) rmSync(cleanup.pop()!, { recursive: true, force: true });
});

function occ(overrides: Partial<TypedEntityOccurrenceV1> & {
  source_file: string;
  node_type: string;
  start: number;
  end: number;
  resolution: TypedEntityOccurrenceV1["resolution"];
}): TypedEntityOccurrenceV1 {
  const { start, end, ...rest } = overrides;
  return {
    id: `${overrides.source_file}:${start}:${end}`,
    raw_span: overrides.raw_span ?? "Span",
    normalized: overrides.normalized ?? "span",
    page: null,
    detector: overrides.detector ?? "lexicon",
    registry_partition: overrides.registry_partition ?? null,
    ...rest,
    offsets: { start, end },
  } as TypedEntityOccurrenceV1;
}

function gold(occurrences: TypedEntityOccurrenceV1[], documents?: TypedLinkingGoldV1["documents"]): TypedLinkingGoldV1 {
  return { schema: TYPED_LINKING_GOLD_SCHEMA, occurrences, ...(documents ? { documents } : {}) };
}

describe("evaluateOccurrences (pure, $0)", () => {
  it("scores a perfect run: mention_recall 1.0, resolution_precision 1.0, unresolved_rate published", () => {
    const items = [
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c1" }),
      occ({ source_file: "a.md", node_type: "Component", start: 10, end: 15, resolution: "linked", registry_record_id: "c2" }),
    ];
    const result = evaluateOccurrences({ run: items, gold: gold(items) });
    expect(result.metrics.overall.mention_recall).toBe(1);
    expect(result.metrics.overall.resolution_precision).toBe(1);
    expect(result.metrics.overall.set_recall).toBe(1);
    // Precision is meaningless without its pair — it must always be present.
    expect(result.metrics.overall.unresolved_rate).toBe(0);
    expect(result.gate).toBe("pass");
  });

  it("marks a parasitic link as a precision miss and still publishes unresolved_rate", () => {
    const goldSet = gold([
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c1" }),
    ]);
    const run = [
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c1" }),
      // parasite: a linked span the gold does not confirm.
      occ({ source_file: "a.md", node_type: "Component", start: 20, end: 25, resolution: "linked", registry_record_id: "c9" }),
    ];
    const result = evaluateOccurrences({ run, gold: goldSet });
    expect(result.metrics.overall.resolution_precision).toBeCloseTo(0.5, 10);
    expect(result.metrics.overall.resolution_precision).toBeLessThan(1);
    expect(result.metrics.overall.unresolved_rate).toBe(0);
    expect(result.metrics.overall.linked_count).toBe(2);
  });

  // Acceptance criterion 9
  it("criterion 9: a run that links nothing → precision null, unresolved_rate 1, positive floor fails the gate", () => {
    const goldSet = gold([
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c1" }),
    ]);
    const run = [
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "unlinked" }),
    ];
    const result = evaluateOccurrences({ run, gold: goldSet, floors: { resolution_precision: 0.9 } });
    expect(result.metrics.overall.resolution_precision).toBeNull();
    expect(result.metrics.overall.resolution_precision).not.toBe(1);
    expect(result.metrics.overall.unresolved_rate).toBe(1);
    expect(result.gate).toBe("fail");
    const floor = result.floors_evaluated.find((entry) => entry.metric === "resolution_precision");
    expect(floor?.pass).toBe(false);
    expect(floor?.value).toBeNull();
  });

  it("computes macro set_recall over non-empty documents and keeps per-document values", () => {
    const goldSet = gold([
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c1" }),
      occ({ source_file: "a.md", node_type: "Component", start: 6, end: 9, resolution: "linked", registry_record_id: "c2" }),
      occ({ source_file: "b.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c3" }),
    ]);
    const run = [
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c1" }),
      // a.md misses c2; b.md fully linked.
      occ({ source_file: "b.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c3" }),
    ];
    const result = evaluateOccurrences({ run, gold: goldSet });
    expect(result.metrics.per_document["a.md"].set_recall).toBeCloseTo(0.5, 10);
    expect(result.metrics.per_document["b.md"].set_recall).toBe(1);
    // macro = (0.5 + 1) / 2
    expect(result.metrics.overall.set_recall).toBeCloseTo(0.75, 10);
  });

  it("never counts an ambiguous run occurrence as a resolved link", () => {
    const goldSet = gold([
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c1" }),
    ]);
    const run = [
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "ambiguous" }),
    ];
    const result = evaluateOccurrences({ run, gold: goldSet });
    expect(result.metrics.overall.set_recall).toBe(0);
    expect(result.metrics.overall.resolution_precision).toBeNull();
    expect(result.metrics.overall.ambiguous_rate).toBe(1);
    expect(result.metrics.overall.unresolved_rate).toBe(1);
  });

  it("emits per-strata metrics keyed by dimension=value", () => {
    const items = [
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c1" }),
      occ({ source_file: "b.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c2" }),
    ];
    const documents = {
      "a.md": { strata: { layout: "scanned", ocr_quality: "low" } },
      "b.md": { strata: { layout: "native" } },
    };
    const result = evaluateOccurrences({ run: items, gold: gold(items, documents) });
    expect(Object.keys(result.metrics.per_strata).sort()).toEqual([
      "layout=native",
      "layout=scanned",
      "ocr_quality=low",
    ]);
    expect(result.metrics.per_strata["layout=scanned"].mention_recall).toBe(1);
  });

  it("is stable to input order (identical hashes + metrics)", () => {
    const items = [
      occ({ source_file: "a.md", node_type: "Component", start: 10, end: 15, resolution: "linked", registry_record_id: "c2" }),
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c1" }),
    ];
    const forward = evaluateOccurrences({ run: items, gold: gold(items) });
    const reversed = evaluateOccurrences({ run: [...items].reverse(), gold: gold([...items].reverse()) });
    expect(reversed.run_hash).toBe(forward.run_hash);
    expect(reversed.gold_hash).toBe(forward.gold_hash);
    expect(reversed.metrics.overall).toEqual(forward.metrics.overall);
  });

  it("rejects duplicate spans in the run and in the gold", () => {
    const dup = [
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c1" }),
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c1" }),
    ];
    expect(() => evaluateOccurrences({ run: dup, gold: gold([dup[0]]) })).toThrow(GoldValidationError);
    expect(() => parseGold({ schema: TYPED_LINKING_GOLD_SCHEMA, occurrences: dup })).toThrow(/GOLD_DUPLICATE_SPAN/);
  });

  it("detects a stale gold via the corpus slice check", () => {
    const goldSet = gold([
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, raw_span: "Alpha", resolution: "linked", registry_record_id: "c1" }),
    ]);
    expect(() => evaluateOccurrences({
      run: goldSet.occurrences,
      gold: goldSet,
      corpusSlice: () => "Bravo",
    })).toThrow(/GOLD_STALE_SPAN/);
    // Corpus unavailable → slice returns null → check skipped, no throw.
    expect(() => evaluateOccurrences({ run: goldSet.occurrences, gold: goldSet, corpusSlice: () => null })).not.toThrow();
  });

  it("rejects a bare-array gold (must be a versioned envelope)", () => {
    expect(() => parseGold([])).toThrow(/GOLD_NOT_ENVELOPE/);
    expect(() => parseGold({ schema: "wrong", occurrences: [] })).toThrow(/GOLD_BAD_SCHEMA/);
  });

  // Acceptance criterion 10 (Stage-3 boundary): no event / AVANT / APRÈS anywhere.
  it("criterion 10: evaluation output carries no event-chaining or AVANT/APRÈS field", () => {
    const items = [
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c1" }),
    ];
    const result = evaluateOccurrences({ run: items, gold: gold(items) });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/AVANT|APR[ÈE]S/i);
    expect(serialized).not.toMatch(/"event(_id)?"/);
    expect(result.schema).toBe(TYPED_LINKING_EVALUATION_SCHEMA);
    // report never shows precision without unresolved-rate.
    const report = formatEvaluationReport(result);
    expect(report).toMatch(/resolution_precision:.*unresolved_rate:/);
  });
});

async function runCli(args: string[]): Promise<{ logs: string[]; errors: string[]; exitCode: number | undefined }> {
  const argv = process.argv;
  const log = console.log;
  const err = console.error;
  const logs: string[] = [];
  const errors: string[] = [];
  process.exitCode = undefined;
  process.argv = ["node", "graphify", ...args];
  console.log = (...items: unknown[]) => { logs.push(items.join(" ")); };
  console.error = (...items: unknown[]) => { errors.push(items.join(" ")); };
  try {
    await main();
    return { logs, errors, exitCode: process.exitCode };
  } finally {
    const observed = process.exitCode;
    process.exitCode = undefined;
    void observed;
    process.argv = argv;
    console.log = log;
    console.error = err;
  }
}

describe("graphify profile evaluate CLI", () => {
  // Acceptance criterion 10: a generic NON-geo fixture passes the runner.
  it("criterion 10: a generic registry-bound fixture passes the runner with no domain code", async () => {
    const out = mkdtempSync(join(tmpdir(), "graphify-eval-"));
    cleanup.push(out);
    const evaluation = join(out, "evaluation.json");
    const { logs, exitCode } = await runCli([
      "profile", "evaluate",
      "--run", join(FIXTURES, "generic-run.json"),
      "--gold", join(FIXTURES, "generic-gold.json"),
      "--out", evaluation,
      "--floor", "mention_recall=1",
      "--floor", "set_recall=1",
      "--floor", "resolution_precision=1",
      "--ceiling", "unresolved_rate=0.5",
    ]);
    expect(exitCode).toBeFalsy();
    const written = JSON.parse(readFileSync(evaluation, "utf-8"));
    expect(written.schema).toBe(TYPED_LINKING_EVALUATION_SCHEMA);
    expect(written.gate).toBe("pass");
    expect(written.metrics.overall.resolution_precision).toBe(1);
    // The report prints precision AND unresolved together.
    expect(logs.join("\n")).toMatch(/resolution_precision:.*unresolved_rate:/);
    // No Stage-3 event chaining leaked into the output.
    const serialized = JSON.stringify(written);
    expect(serialized).not.toMatch(/AVANT|APR[ÈE]S/i);
    expect(serialized).not.toMatch(/"event(_id)?"/);
  });

  it("criterion 10: neither generic fixture contains an event / AVANT / APRÈS field", () => {
    for (const name of ["generic-run.json", "generic-gold.json"]) {
      const raw = readFileSync(join(FIXTURES, name), "utf-8");
      expect(raw).not.toMatch(/AVANT|APR[ÈE]S/i);
      expect(raw).not.toMatch(/"event(_id)?"/);
    }
  });

  // Acceptance criterion 9 through the CLI: gate fail → non-zero exit code.
  it("criterion 9: a nothing-linked run with a positive precision floor exits non-zero", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-eval-nolink-"));
    cleanup.push(dir);
    const runPath = join(dir, "run.json");
    const goldPath = join(dir, "gold.json");
    writeFileSync(runPath, JSON.stringify([
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "unlinked" }),
    ]));
    writeFileSync(goldPath, JSON.stringify(gold([
      occ({ source_file: "a.md", node_type: "Component", start: 0, end: 5, resolution: "linked", registry_record_id: "c1" }),
    ])));
    const evaluation = join(dir, "evaluation.json");
    const { exitCode } = await runCli([
      "profile", "evaluate",
      "--run", runPath,
      "--gold", goldPath,
      "--out", evaluation,
      "--floor", "resolution_precision=0.9",
    ]);
    expect(exitCode).toBe(1);
    const written = JSON.parse(readFileSync(evaluation, "utf-8"));
    expect(written.gate).toBe("fail");
    expect(written.metrics.overall.resolution_precision).toBeNull();
    expect(written.metrics.overall.unresolved_rate).toBe(1);
  });

  it("exits non-zero on a structurally invalid gold", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-eval-bad-"));
    cleanup.push(dir);
    const runPath = join(dir, "run.json");
    const goldPath = join(dir, "gold.json");
    writeFileSync(runPath, JSON.stringify([]));
    writeFileSync(goldPath, JSON.stringify([]));
    const { exitCode, errors } = await runCli([
      "profile", "evaluate",
      "--run", runPath,
      "--gold", goldPath,
    ]);
    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/GOLD_NOT_ENVELOPE/);
  });
});
