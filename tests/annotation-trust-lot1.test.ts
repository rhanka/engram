import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashOntologyProfile, normalizeOntologyProfile, validateOntologyProfile } from "../src/ontology-profile.js";
import { validateProfileExtraction } from "../src/profile-validate.js";
import { semanticProfileDigest } from "../src/ontology-guardian/digests.js";
import { isInstant } from "../src/time-reference/format.js";
import { baseProfile, PREFIXES, PROFILE_PIN, PROFILE_VERSION, standardTerms, template, TEMPLATE_REF,
  UNVERIFIED_RULE_SHEET_PIN, validation, validateStandardTerms, verifyPins } from "../src/annotation-trust/profile.js";
import { ADAPTER_CHANNEL, AI_CHANNELS, HUMAN_CHANNELS, REJECT_REASONS } from "../src/annotation-trust/types.js";
const HERE = dirname(fileURLToPath(import.meta.url));
const spec = readFileSync(join(HERE, "../spec/SPEC_ONTOLOGY_ANNOTATION_TRUST_AND_FEEDBACK.md"), "utf8");
function specTerms(): Map<string, string[]> {
  const lines = spec.split("\n");
  const head = lines.findIndex((l) => l.startsWith("| Engram term | Standard IRI |"));
  expect(head).toBeGreaterThanOrEqual(0);
  const map = new Map<string, string[]>();
  for (const line of lines.slice(head + 2)) {
    if (!line.startsWith("| ")) break;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4 || cells[1].startsWith("---")) break;
    const names = [...cells[1].matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean);
    const toks = [...cells[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((t) => t.includes(":"));
    const iris = [...new Set(toks)].sort();
    for (const iri of iris) {
      const prefix = /^([a-z][a-z0-9]*):[A-Za-z][A-Za-z0-9]*$/.exec(iri)?.[1] ?? "";
      if (prefix === "" || !Object.hasOwn(PREFIXES, prefix)) throw new Error(`spec §1 table: bad IRI ${iri}`);
    }
    for (const n of names) map.set(n, iris);
  }
  return map;
}
describe("lot 1 annotation trust base", () => {
  it("derived base profile normalizes", () => {
    const p = baseProfile();
    expect(validateOntologyProfile(p)).toEqual([]);
    expect(() => normalizeOntologyProfile(p)).not.toThrow();
    expect(p.hardening).toEqual({
      statuses: [...validation.states],
      default_status: validation.initial_state,
      status_transitions: validation.transitions.map(({ from, to, requires }) => ({ from: [...from], to: [...to], requires: [...requires] })),
    });
    expect(PROFILE_PIN.contentDigest).toBe(hashOntologyProfile(normalizeOntologyProfile(baseProfile())));
  });
  it("swapped endpoints fail", () => {
    const profile = normalizeOntologyProfile(baseProfile());
    const nodes = (t1: string, t2: string) => [
      { id: "a", label: "a", file_type: "document", source_file: "s.md", node_type: t1, status: "unreviewed" },
      { id: "b", label: "b", file_type: "document", source_file: "s.md", node_type: t2, status: "unreviewed" },
    ];
    const edges = (relation: string) => [{ source: "a", target: "b", relation, confidence: "EXTRACTED", source_file: "s.md" }];
    const ok = validateProfileExtraction({ nodes: nodes("Annotation", "SubjectVersion"), edges: edges("targets"), hyperedges: [] }, { profile });
    expect(ok.valid).toBe(true);
    const badSource = validateProfileExtraction({ nodes: nodes("SubjectVersion", "Annotation"), edges: edges("targets"), hyperedges: [] }, { profile });
    expect(badSource.valid).toBe(false);
    expect(badSource.issues.some((i) => i.code === "incompatible_source_type")).toBe(true);
    const badTarget = validateProfileExtraction({ nodes: nodes("SubjectVersion", "SubjectVersion"), edges: edges("version_of"), hyperedges: [] }, { profile });
    expect(badTarget.valid).toBe(false);
    expect(badTarget.issues.some((i) => i.code === "incompatible_target_type")).toBe(true);
  });
  it("standard_terms match §1 term by term and bindings match the fixture", () => {
    const expected = specTerms();
    expect(new Set(Object.keys(standardTerms))).toEqual(new Set(expected.keys()));
    for (const [term, iris] of expected) expect([...standardTerms[term]].sort()).toEqual(iris);
    expect(validateStandardTerms(standardTerms)).toEqual([]);
    const mutated = { ...standardTerms, targets: ["oa:hasSource"] };
    expect(validateStandardTerms(mutated).length).toBeGreaterThan(0);
    const undeclared = { ...standardTerms, targets: ["xx:hasTarget"] };
    expect(validateStandardTerms(undeclared).join(" ")).toMatch(/undeclared prefix/);
    expect(validateStandardTerms({ ...standardTerms, constructor: ["oa:Annotation"] }).join(" ")).toMatch(/unknown standard_term/);
    const fixture = JSON.parse(readFileSync(join(HERE, "fixtures/annotation-trust/prefix-bindings.json"), "utf8"));
    expect({ ...fixture.bindings["@context"], prov: fixture.prov.iri }).toEqual(PREFIXES);
    expect(Object.hasOwn(fixture, "_note")).toBe(false);
    expect(isInstant(fixture.retrieved)).toBe(true);
    expect(fixture.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof fixture.extract === "string" && fixture.extract.length > 0).toBe(true);
    expect(PROFILE_VERSION).toBe("0.2.3");
    expect(template.node_types.Annotation.attributes).toEqual({
      channel: { kind: "enum", required: true,
        values: ["pipeline", "mcp", "ui-select", "ui-thumbs", "mcp-elicitation", "import"] },
      exposure: { kind: "enum", required: false, values: ["shown", "not-shown", "unknown"] },
    });
    expect(template.node_types.Selection.attributes).toEqual({
      trust: { kind: "enum", required: true, values: ["provisional", "trusted", "withheld"] },
    });
    expect(template.node_types.EvaluationPair.attributes).toEqual({
      role: { kind: "enum", required: true, values: ["blind", "known-error", "anchored", "unscored"] },
    });
    expect([AI_CHANNELS, HUMAN_CHANNELS, ADAPTER_CHANNEL]).toEqual([
      ["pipeline", "mcp"], ["ui-select", "ui-thumbs", "mcp-elicitation"], "import",
    ]);
    expect(REJECT_REASONS).toEqual([
      "wrong-subject", "contradicted", "insufficient-evidence", "obsolete", "duplicate", "out-of-scope",
    ]);
  });
  it("mismatched template or rule-sheet pin is refused", () => {
    expect(() => verifyPins(TEMPLATE_REF, UNVERIFIED_RULE_SHEET_PIN)).not.toThrow();
    expect(TEMPLATE_REF.templateDigestSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(semanticProfileDigest({ ...template, presentation: { label: "x" } })).toBe(TEMPLATE_REF.templateDigestSha256);
    expect(() => verifyPins({ ...TEMPLATE_REF, templateVersion: "0.2.4" }, UNVERIFIED_RULE_SHEET_PIN)).toThrow(
      /template pin/,
    );
    expect(() => verifyPins({ ...TEMPLATE_REF, templateDigestSha256: `sha256:${"0".repeat(64)}` }, UNVERIFIED_RULE_SHEET_PIN)).toThrow(/template pin/);
    expect(() => verifyPins({ ...TEMPLATE_REF, extra: true } as unknown as typeof TEMPLATE_REF, UNVERIFIED_RULE_SHEET_PIN)).toThrow();
    expect(() => verifyPins(TEMPLATE_REF, { ...UNVERIFIED_RULE_SHEET_PIN, contentDigest: "0".repeat(64) })).toThrow(/rule-sheet pin/);
    expect(() => verifyPins(TEMPLATE_REF, { ...UNVERIFIED_RULE_SHEET_PIN, id: "other-rules" })).toThrow(/rule-sheet pin/);
    expect(() => verifyPins(TEMPLATE_REF, { ...UNVERIFIED_RULE_SHEET_PIN, extra: true } as unknown as typeof UNVERIFIED_RULE_SHEET_PIN)).toThrow();
  });
});
