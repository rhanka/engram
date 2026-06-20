/**
 * SPEC_GRAPHIFY § "Enrichment Stages" — PHASE 1, ordering invariant.
 *
 * REGRESSION (FIX 2): `buildProject` generated GRAPH_REPORT.md + suggested
 * questions BEFORE the shared finalizer mutated the community labels, so when
 * salient/ingested names resolved, the emitted report still showed the GENERIC
 * `Community N` placeholders. The finalizer now runs FIRST and the report is
 * derived from the FINALIZED labels.
 *
 * This test ingests an assistant label answer (the no-key default path) and
 * asserts the resulting report reflects the ingested name, not `Community N`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cleanupDirs: string[] = [];

function makeProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-report-labels-"));
  cleanupDirs.push(dir);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "sample.ts"), "export function demo() { return 1; }\n", "utf-8");
  return dir;
}

/** A multi-node code extraction so clustering yields at least one community. */
function mockExtract(dir: string): void {
  const file = join(dir, "src", "sample.ts");
  const node = (id: string, label: string) => ({
    id,
    label,
    file_type: "code",
    source_file: file,
  });
  const edge = (source: string, target: string) => ({
    source,
    target,
    relation: "calls",
    confidence: "EXTRACTED" as const,
    source_file: file,
  });
  vi.doMock("../src/extract.js", async () => {
    const actual = await vi.importActual<typeof import("../src/extract.js")>("../src/extract.js");
    return {
      ...actual,
      extractWithDiagnostics: vi.fn(async () => ({
        extraction: {
          nodes: [
            node("alpha_fn", "alpha()"),
            node("beta_fn", "beta()"),
            node("gamma_fn", "gamma()"),
            node("delta_fn", "delta()"),
          ],
          edges: [
            edge("alpha_fn", "beta_fn"),
            edge("beta_fn", "gamma_fn"),
            edge("gamma_fn", "delta_fn"),
            edge("delta_fn", "alpha_fn"),
          ],
          input_tokens: 0,
          output_tokens: 0,
        },
        diagnostics: [],
      })),
    };
  });
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../src/extract.js");
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

const INGESTED_NAME = "Demo Salient Layer";

describe("buildProject GRAPH_REPORT.md reflects FINALIZED community labels", () => {
  it("renders the ingested label, not the generic Community N placeholder", async () => {
    const dir = makeProjectDir();
    mockExtract(dir);

    const noDescribe = {
      html: false,
      describe: false as const,
      // never called (describe:false) — guards against an accidental call.
      describeCallLlm: async () => {
        throw new Error("LLM must not be called when describe:false");
      },
    };

    const { buildProject } = await import("../src/pipeline.js");

    // Run 1: no answer yet → the label stage emits label-instructions/.
    await buildProject(dir, noDescribe);

    const labelDir = join(dir, ".graphify", "label-instructions");
    const instruction = readFileSync(join(labelDir, "communities.md"), "utf-8");
    // The instruction file lists "Community <cid>: ..." for each labeled cid.
    const cids = [...instruction.matchAll(/^Community (\d+):/gmu)].map((m) => Number(m[1]));
    expect(cids.length).toBeGreaterThan(0);

    // The first run's report still shows the generic placeholder (no answer yet).
    const reportPath = join(dir, ".graphify", "GRAPH_REPORT.md");
    const firstReport = readFileSync(reportPath, "utf-8");
    expect(firstReport).toMatch(/Community 0/u);

    // Simulate the assistant answering: map every labeled cid to a salient name.
    const answer = Object.fromEntries(cids.map((cid) => [String(cid), INGESTED_NAME]));
    writeFileSync(join(labelDir, "communities.json"), JSON.stringify(answer), "utf-8");

    // Run 2: the finalizer ingests the answer into `labels` BEFORE the report is
    // generated, so the emitted report must carry the ingested salient name.
    await buildProject(dir, noDescribe);

    const finalReport = readFileSync(reportPath, "utf-8");
    expect(finalReport).toContain(`- "${INGESTED_NAME}"`);
    // The community whose name we ingested is no longer rendered as generic.
    expect(finalReport).not.toMatch(/### Community 0 - "Community 0"/u);

    // The persisted labels JSON also carries the ingested name (the report and
    // the labels store agree).
    const labelsJson = JSON.parse(
      readFileSync(join(dir, ".graphify", ".graphify_labels.json"), "utf-8"),
    ) as Record<string, string>;
    expect(Object.values(labelsJson)).toContain(INGESTED_NAME);

    // Sanity: the instruction dir name we relied on actually exists.
    expect(readdirSync(join(dir, ".graphify")).length).toBeGreaterThan(0);
  });
});
