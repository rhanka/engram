import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { compileNormalizerByNodeType } from "../src/entity-normalizer.js";
import {
  DEFAULT_FUZZY_EXCLUDE_TYPES,
  DEFAULT_FUZZY_TOKEN_JACCARD_THRESHOLD,
  DEFAULT_RECONCILIATION_CANDIDATE_CAP,
  DEFAULT_STRUCTURAL_TIER_CONFIG,
  GENERIC_ENTITY_NOUNS,
  buildOntologyReconciliationLexicalBlockingIndex,
  buildStructuralIndex,
  differentEntityReason,
  enumerateOntologyReconciliationBlockedPairs,
  fuzzyMatchNodes,
  generateOntologyReconciliationCandidates,
  generateOntologyReconciliationCandidatesWithLexicalBlockingIndexForTest,
  ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA,
  structuralCandidatePairs,
  structuralMatchNodes,
  type GenerateOntologyReconciliationCandidatesOptions,
  type OntologyReconciliationBlockedPair,
  type OntologyReconciliationCandidate,
  type OntologyReconciliationCandidateQueue,
} from "../src/ontology-reconciliation.js";
import type { OntologyPatchContext, OntologyPatchNode, OntologyPatchRelation } from "../src/ontology-patch.js";
import type { NormalizedOntologyProfile } from "../src/types.js";

const profile = { profile_hash: "blocking-profile" } as unknown as NormalizedOntologyProfile;
const generatedAt = "2026-07-30T00:00:00.000Z";
const FUZZY_HONORIFICS = new Set([
  "mr", "mrs", "ms", "miss", "lord", "lady", "captain", "capt", "professor", "prof", "doctor", "madame",
  "madam", "monsieur", "m", "mme", "mlle", "the",
]);
const NON_WORD = /[^\p{L}\p{N}]+/gu;
const PARENTHETICAL = /\([^)]*\)/gu;
const fuzzyTierEligibilityCriterion =
  "A fuzzy variant needs at least 2 tokens on the smaller side, except that a single non-generic token is eligible; nodes whose every variant is empty or a single generic entity noun can never fuzzy-match.";

function context(nodes: OntologyPatchNode[], relations: OntologyPatchRelation[] = []): OntologyPatchContext {
  return {
    rootDir: "/repo",
    stateDir: "/repo/.graphify",
    graphHash: "blocking-graph",
    profile,
    profileState: {} as never,
    nodes,
    relations,
    evidenceRefs: new Set(),
  };
}

function node(id: string, label: string, overrides: Partial<OntologyPatchNode> = {}): OntologyPatchNode {
  return { id, label, type: "Character", ...overrides };
}

function rel(source: string, target: string, type = "mentions"): OntologyPatchRelation {
  return { id: `${source}->${target}:${type}`, type, source_id: source, target_id: target };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeTerm(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((a, b) => a.localeCompare(b));
}

function nodeTerms(value: OntologyPatchNode): string[] {
  return uniqueSorted([
    ...(value.label ? [normalizeTerm(value.label)] : []),
    ...(value.aliases ?? []).map(normalizeTerm),
    ...(value.normalized_terms ?? []).map(normalizeTerm),
  ]);
}

function fuzzyTokens(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(NON_WORD, " ")
    .split(/\s+/u)
    .filter((token) => token.length > 0 && !FUZZY_HONORIFICS.has(token));
}

/** Independent naïve derivation of every fuzzy variant's tokens. */
function fuzzyVariantTokens(value: OntologyPatchNode): string[][] {
  const result: string[][] = [];
  const seen = new Set<string>();
  for (const term of nodeTerms(value)) {
    const variants = [
      ["name", fuzzyTokens(term.replace(PARENTHETICAL, " "))] as const,
      ...(term.match(/\(([^)]*)\)/gu) ?? []).map((match) => ["paren", fuzzyTokens(match.slice(1, -1))] as const),
    ];
    for (const [kind, tokens] of variants) {
      if (tokens.length === 0) continue;
      const key = `${kind}:${tokens.join(" ")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(tokens);
    }
  }
  return result;
}

function naiveFuzzyVariantIsEligible(tokens: readonly string[]): boolean {
  return tokens.length >= 2 || (tokens.length === 1 && !GENERIC_ENTITY_NOUNS.has(tokens[0]!));
}

function naiveFuzzyTierEligibility(comparableNodes: readonly OntologyPatchNode[]) {
  const excludedComparableNodeCount = comparableNodes.filter((entry) =>
    fuzzyVariantTokens(entry).every((tokens) => !naiveFuzzyVariantIsEligible(tokens)),
  ).length;
  const comparableNodeCount = comparableNodes.length;
  return {
    criterion: fuzzyTierEligibilityCriterion,
    minimum_smaller_side_token_count: 2,
    excluded_comparable_node_count: excludedComparableNodeCount,
    comparable_node_count: comparableNodeCount,
    excluded_comparable_node_share: comparableNodeCount === 0 ? 0 : excludedComparableNodeCount / comparableNodeCount,
  };
}

function naiveFuzzyTokenIdfs(comparableNodes: readonly OntologyPatchNode[]): Map<string, number> {
  const documentFrequency = new Map<string, number>();
  for (const entry of comparableNodes) {
    const tokens = new Set(fuzzyVariantTokens(entry).flat());
    for (const token of tokens) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  }
  return new Map(
    [...documentFrequency].map(([token, frequency]) => [token, Math.log(comparableNodes.length / frequency)]),
  );
}

function naiveHasSharedFuzzyTokenAtOrAboveIdf(
  left: OntologyPatchNode,
  right: OntologyPatchNode,
  tokenIdfs: ReadonlyMap<string, number>,
  minimumIdf: number,
): boolean {
  const rightTokens = new Set(fuzzyVariantTokens(right).flat());
  return fuzzyVariantTokens(left).some((tokens) => tokens.some((token) =>
    rightTokens.has(token) && (tokenIdfs.get(token) ?? 0) >= minimumIdf,
  ));
}

function exactNodeTerms(value: OntologyPatchNode, normalizers: ReturnType<typeof compileNormalizerByNodeType>): string[] {
  const normalize = value.type ? normalizers[value.type] ?? normalizeTerm : normalizeTerm;
  return uniqueSorted([
    ...(value.label ? [normalize(value.label)] : []),
    ...(value.aliases ?? []).map(normalize),
    ...(value.normalized_terms ?? []).map(normalize),
  ]);
}

function violatesPartitionScope(
  value: OntologyPatchContext,
  nodeType: string,
  left: OntologyPatchNode,
  right: OntologyPatchNode,
): boolean {
  const registryId = value.profile.node_types?.[nodeType]?.registry;
  if (!registryId || !value.profile.registries?.[registryId]?.partition_column) return false;
  return left.registry_id !== registryId
    || right.registry_id !== registryId
    || !left.registry_partition
    || !right.registry_partition
    || left.registry_partition !== right.registry_partition;
}

function statusRank(status: string | undefined): number {
  switch (status) {
    case "validated": return 4;
    case "needs_review": return 3;
    case "candidate": return 2;
    case "rejected": return 1;
    default: return 0;
  }
}

function chooseCanonicalPair(left: OntologyPatchNode, right: OntologyPatchNode): {
  canonical: OntologyPatchNode;
  candidate: OntologyPatchNode;
} {
  const leftRank = statusRank(left.status);
  const rightRank = statusRank(right.status);
  if (leftRank !== rightRank) {
    return leftRank > rightRank ? { canonical: left, candidate: right } : { canonical: right, candidate: left };
  }
  return left.id.localeCompare(right.id) <= 0
    ? { canonical: left, candidate: right }
    : { canonical: right, candidate: left };
}

function candidateId(canonical: OntologyPatchNode, candidate: OntologyPatchNode, sharedTerms: string[]): string {
  return `reconcile:${sha256(["entity_match", canonical.id, candidate.id, ...sharedTerms].join("|")).slice(0, 24)}`;
}

/** Faithful copy of the current-base naïve lexical double loop plus structural tier. */
function naiveQueue(
  value: OntologyPatchContext,
  options: GenerateOntologyReconciliationCandidatesOptions = {},
  allowed?: ReadonlySet<OntologyReconciliationBlockedPair>,
): OntologyReconciliationCandidateQueue {
  const fuzzyEnabled = options.fuzzy ?? true;
  const fuzzyThreshold = options.fuzzyThreshold ?? DEFAULT_FUZZY_TOKEN_JACCARD_THRESHOLD;
  const fuzzyMinimumSharedTokenIdf = typeof options.fuzzyMinimumSharedTokenIdf === "number"
    && !Number.isNaN(options.fuzzyMinimumSharedTokenIdf)
    ? options.fuzzyMinimumSharedTokenIdf
    : undefined;
  const cap = options.cap ?? DEFAULT_RECONCILIATION_CANDIDATE_CAP;
  const fuzzyExcludeTypes = new Set(options.fuzzyExcludeTypes ?? DEFAULT_FUZZY_EXCLUDE_TYPES);
  const normalizers = compileNormalizerByNodeType(value.profile);
  const candidates: OntologyReconciliationCandidate[] = [];
  const emittedPairs = new Set<string>();
  const comparableNodes = value.nodes
    .filter((entry) => entry.type && nodeTerms(entry).length > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
  const fuzzyTierEligibility = fuzzyEnabled ? naiveFuzzyTierEligibility(comparableNodes) : undefined;
  const fuzzyTokenIdfs = fuzzyMinimumSharedTokenIdf === undefined ? undefined : naiveFuzzyTokenIdfs(comparableNodes);

  for (let i = 0; i < comparableNodes.length; i += 1) {
    for (let j = i + 1; j < comparableNodes.length; j += 1) {
      if (allowed && !allowed.has(`${i}:${j}`)) continue;
      const left = comparableNodes[i]!;
      const right = comparableNodes[j]!;
      if (!left.type || left.type !== right.type) continue;
      if (violatesPartitionScope(value, left.type, left, right)) continue;

      const leftTerms = new Set(exactNodeTerms(left, normalizers));
      const sharedTerms = exactNodeTerms(right, normalizers).filter((term) => leftTerms.has(term));
      const { canonical, candidate } = chooseCanonicalPair(left, right);
      const pairKey = `${canonical.id}|${candidate.id}`;
      const evidenceRefs = uniqueSorted([
        ...(canonical.source_refs ?? []),
        ...(candidate.source_refs ?? []),
      ]);
      const rejectReason = differentEntityReason(left, right);

      if (sharedTerms.length > 0) {
        if (rejectReason) continue;
        const normalize = normalizers[left.type] ?? normalizeTerm;
        const canonicalLabel = canonical.label ? normalize(canonical.label) : null;
        const candidateLabel = candidate.label ? normalize(candidate.label) : null;
        const exactLabelMatch = canonicalLabel !== null
          && canonicalLabel === candidateLabel
          && sharedTerms.includes(canonicalLabel);
        emittedPairs.add(pairKey);
        candidates.push({
          id: candidateId(canonical, candidate, sharedTerms),
          kind: "entity_match",
          status: "candidate",
          score: exactLabelMatch ? 1 : 0.85,
          tier: "exact",
          candidate_id: candidate.id,
          canonical_id: canonical.id,
          shared_terms: sharedTerms,
          evidence_refs: evidenceRefs,
          reasons: [
            `same node type: ${canonical.type}`,
            `shared normalized term(s): ${sharedTerms.join(", ")}`,
          ],
          proposed_patch_operation: "accept_match",
        });
        continue;
      }

      if (!fuzzyEnabled || fuzzyExcludeTypes.has(String(left.type)) || rejectReason) continue;
      const fuzzy = fuzzyMatchNodes(left, right, fuzzyThreshold);
      if (!fuzzy.matched || emittedPairs.has(pairKey)) continue;
      if (
        fuzzyMinimumSharedTokenIdf !== undefined
        && !naiveHasSharedFuzzyTokenAtOrAboveIdf(left, right, fuzzyTokenIdfs!, fuzzyMinimumSharedTokenIdf)
      ) continue;
      emittedPairs.add(pairKey);
      const reasonDetail = fuzzy.equal
        ? "token-set equal (honorific/parenthetical-stripped)"
        : fuzzy.contained
          ? "token containment (honorific/parenthetical-stripped)"
          : `token Jaccard ${fuzzy.jaccard.toFixed(2)} ≥ ${fuzzyThreshold}`;
      candidates.push({
        id: candidateId(canonical, candidate, [reasonDetail]),
        kind: "entity_match",
        status: "candidate",
        score: fuzzy.equal ? 0.9 : fuzzy.contained ? 0.75 : 0.7,
        tier: "fuzzy",
        candidate_id: candidate.id,
        canonical_id: canonical.id,
        shared_terms: [],
        evidence_refs: evidenceRefs,
        reasons: [
          `same node type: ${canonical.type}`,
          `fuzzy match: ${reasonDetail}`,
        ],
        proposed_patch_operation: "accept_match",
      });
    }
  }

  if (options.structural === true) {
    const structuralConfig = { ...DEFAULT_STRUCTURAL_TIER_CONFIG, ...(options.structuralConfig ?? {}) };
    const nodeById = new Map(comparableNodes.map((entry) => [entry.id, entry]));
    const index = buildStructuralIndex(value.relations, value.nodes);
    for (const [leftId, rightId] of structuralCandidatePairs(index, structuralConfig)) {
      const left = nodeById.get(leftId);
      const right = nodeById.get(rightId);
      if (!left || !right || !left.type || left.type !== right.type) continue;
      if (fuzzyExcludeTypes.has(String(left.type))) continue;
      if (violatesPartitionScope(value, left.type, left, right)) continue;

      const { canonical, candidate } = chooseCanonicalPair(left, right);
      const pairKey = `${canonical.id}|${candidate.id}`;
      if (emittedPairs.has(pairKey)) continue;
      const structural = structuralMatchNodes(left, right, index, structuralConfig);
      if (!structural.matched) continue;
      emittedPairs.add(pairKey);

      const basisNeighbours = structural.sharedNeighbours.slice(0, structuralConfig.maxBasisNeighbours);
      const overflow = structural.sharedNeighbours.length - basisNeighbours.length;
      const neighbourList = basisNeighbours
        .map((id) => nodeById.get(id)?.label ?? id)
        .join(", ") + (overflow > 0 ? `, +${overflow} more` : "");
      candidates.push({
        id: candidateId(canonical, candidate, [
          "structural",
          `j${structural.neighbourJaccard.toFixed(3)}`,
          ...basisNeighbours,
        ]),
        kind: "entity_match",
        status: "candidate",
        score: structural.score,
        tier: "structural",
        candidate_id: candidate.id,
        canonical_id: canonical.id,
        shared_terms: [],
        evidence_refs: uniqueSorted([
          ...(canonical.source_refs ?? []),
          ...(candidate.source_refs ?? []),
        ]),
        reasons: [
          `same node type: ${canonical.type}`,
          `structural match: ${structural.sharedNeighbours.length} shared informative neighbour(s), `
            + `neighbour Jaccard ${structural.neighbourJaccard.toFixed(2)}`,
          `shared neighbours: ${neighbourList}`,
          `relation-type profile Jaccard ${structural.relationProfileJaccard.toFixed(2)}`
            + (structural.sharedRelationTypes.length > 0
              ? ` (${structural.sharedRelationTypes.join(", ")})`
              : ""),
          structural.sharedProvenance.length > 0
            ? `shared provenance: ${structural.sharedProvenance.length} ref(s)`
            : "no shared provenance",
          "structural evidence only — no lexical agreement; human adjudication required",
        ],
        proposed_patch_operation: "accept_match",
        score_breakdown: {
          neighbour_jaccard: Number(structural.neighbourJaccard.toFixed(4)),
          shared_neighbours: structural.sharedNeighbours.length,
          relation_profile_jaccard: Number(structural.relationProfileJaccard.toFixed(4)),
          shared_provenance: structural.sharedProvenance.length,
        },
        structural_basis: {
          shared_neighbour_ids: basisNeighbours,
          shared_neighbour_count: structural.sharedNeighbours.length,
          shared_relation_types: structural.sharedRelationTypes,
          shared_provenance_refs: structural.sharedProvenance.slice(0, structuralConfig.maxBasisNeighbours),
        },
      });
    }
  }

  candidates.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const capped = Number.isFinite(cap) && cap >= 0 ? candidates.slice(0, cap) : candidates;
  return {
    schema: ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA,
    graph_hash: value.graphHash,
    profile_hash: value.profile.profile_hash,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    candidate_count: capped.length,
    ...(fuzzyTierEligibility ? { fuzzy_tier_eligibility: fuzzyTierEligibility } : {}),
    candidates: capped,
  };
}

function expectGolden(
  nodes: OntologyPatchNode[],
  relations: OntologyPatchRelation[] = [],
  options: GenerateOntologyReconciliationCandidatesOptions = {},
): void {
  const value = context(nodes, relations);
  for (const structural of [false, true]) {
    const fixedOptions = {
      generatedAt,
      ...options,
      ...(structural ? { structural: true } : {}),
    };
    expect(JSON.stringify(generateOntologyReconciliationCandidates(value, fixedOptions))).toBe(
      JSON.stringify(naiveQueue(value, fixedOptions)),
    );
  }
}

function structuralPositiveControl(): { nodes: OntologyPatchNode[]; relations: OntologyPatchRelation[] } {
  const nodes = [
    node("a", "Alderney", { source_refs: ["doc/a.txt"] }),
    node("b", "Bellweather", { source_refs: ["doc/b.txt"] }),
  ];
  const relations: OntologyPatchRelation[] = [];
  for (let i = 0; i < 6; i += 1) {
    nodes.push(node(`s${i}`, `Shared ${String.fromCharCode(97 + i)}`, { type: "Object" }));
    relations.push(rel("a", `s${i}`), rel("b", `s${i}`));
  }
  return { nodes, relations };
}

function deterministicSyntheticCorpus(count = 2_400): OntologyPatchNode[] {
  return Array.from({ length: count }, (_, index) => {
    const group = Math.floor(index / 100).toString().padStart(2, "0");
    const serial = (index % 100).toString().padStart(3, "0");
    return node(`synthetic-${group}-${serial}`, `Entity Group${group} Subject${serial}`, {
      type: `Synthetic${group}`,
      aliases: index % 17 === 0 ? [`Alias Group${group} Subject${serial}`] : [],
    });
  });
}

function scaleCorpus(count = 40_000): OntologyPatchNode[] {
  return Array.from({ length: count }, (_, index) => node(
    `scale-${index.toString().padStart(5, "0")}`,
    `Entity ${index.toString().padStart(5, "0")}`,
  ));
}

describe("ontology reconciliation lexical blocking", () => {
  it("is byte-identical to the current-base naïve oracle with structural OFF and ON", () => {
    const existingFixtures = [
      node("payment-service", "Payment Service", { type: "Component", aliases: ["Payments"] }),
      node("payments", "Payments", { type: "Component", normalized_terms: ["payments"] }),
      node("hugo", "Hugo Oberstein"),
      node("hugo-spy", "Hugo Oberstein (spy)"),
      node("exmoor", "Devonshire (Exmoor estate)", { type: "Location" }),
      node("estate", "Exmoor estate", { type: "Location" }),
      node("alias-left", "The First Name", { aliases: ["Shared Alias"] }),
      node("alias-right", "The Other Name", { normalized_terms: ["shared alias"] }),
    ];
    const genericToken = Array.from({ length: 32 }, (_, index) => node(
      `generic-${index.toString().padStart(2, "0")}`,
      `Narrator ${index}`,
      { normalized_terms: ["generic shared token"] },
    ));
    const regnalSeries = [
      node("edward-1", "Edward I"),
      node("edward-2", "Edward II"),
      node("edward-3", "Edward III"),
      node("chapter-1", "Part I, Chapter I", { type: "ChapterOrStory" }),
      node("chapter-2", "Part II, Chapter I", { type: "ChapterOrStory" }),
    ];
    const capOverflow = Array.from({ length: 21 }, (_, index) => node(
      `overflow-${index.toString().padStart(2, "0")}`,
      "Shared Canonical Name",
    ));
    const shortTokens = [
      node("short-exact-a", "A"),
      node("short-exact-b", "A"),
      node("short-fuzzy-a", "Q!"),
      node("short-fuzzy-b", "Q?"),
    ];
    const repeatedTokenContainment = [
      node("repeat-left", "Echo Echo"),
      node("repeat-right", "Echo Bravo"),
    ];
    const structural = structuralPositiveControl();

    expectGolden([]);
    expectGolden([node("only", "Only Node")]);
    expectGolden(existingFixtures);
    expectGolden(genericToken);
    expectGolden(regnalSeries);
    expectGolden(shortTokens);
    expectGolden(repeatedTokenContainment);
    expectGolden(capOverflow);
    expectGolden(deterministicSyntheticCorpus());
    expectGolden(structural.nodes, structural.relations);
    expect(generateOntologyReconciliationCandidates(context(capOverflow), { generatedAt }).candidate_count)
      .toBe(DEFAULT_RECONCILIATION_CANDIDATE_CAP);
    expect(generateOntologyReconciliationCandidates(context(structural.nodes, structural.relations), {
      generatedAt,
      structural: true,
    }).candidates.filter((candidate) => candidate.tier === "structural").length).toBeGreaterThan(0);
  });

  it("reverse-proves real production buckets: removing one entry makes the golden go red", () => {
    const value = context([
      node("reverse-left", "Alias-fed left", { aliases: ["shared reverse alias"] }),
      node("reverse-right", "Alias-fed right", { normalized_terms: ["shared reverse alias"] }),
    ]);
    const options = { generatedAt, fuzzy: false };
    const oracle = naiveQueue(value, options);
    expect(JSON.stringify(generateOntologyReconciliationCandidates(value, options))).toBe(JSON.stringify(oracle));

    const index = buildOntologyReconciliationLexicalBlockingIndex(value, options);
    const bucket = [...index.exact.values()].find((entry) => entry.includes(0) && entry.includes(1));
    expect(bucket).toBeDefined();
    bucket!.splice(bucket!.indexOf(1), 1);
    expect(enumerateOntologyReconciliationBlockedPairs(value, options, index)).toEqual(new Set());
    expect(JSON.stringify(generateOntologyReconciliationCandidatesWithLexicalBlockingIndexForTest(value, options, index)))
      .not.toBe(JSON.stringify(oracle));
  });

  it("uses the <= 0.5 single-token fallback without changing either tier configuration", () => {
    const nodes = [
      node("fallback-left", "Alpha Bravo Charlie"),
      node("fallback-right", "Alpha Delta Echo"),
    ];
    const options = { fuzzyThreshold: 0.4 };
    const value = context(nodes);
    expect(enumerateOntologyReconciliationBlockedPairs(value, options)).toEqual(new Set(["0:1"]));
    expectGolden(nodes, [], options);
  });

  it("uses the existing single-token side index for O3 mono-to-multi candidates", () => {
    const nodes = [
      node("o3-mono", "Oberstein!"),
      node("o3-multi", "Oberstein dossier"),
    ];
    const value = context(nodes);

    expect(enumerateOntologyReconciliationBlockedPairs(value)).toEqual(new Set(["0:1"]));
    expectGolden(nodes);
  });

  it("processes 40k selectively-blocked nodes inside the scale budget", () => {
    const value = context(scaleCorpus());
    const started = performance.now();
    const queue = generateOntologyReconciliationCandidates(value, { generatedAt, structural: true });
    const elapsedMs = performance.now() - started;
    expect(elapsedMs).toBeLessThan(5_000);
    expect(queue.candidates).toHaveLength(0);
    console.info(`[ontology blocking scale] 40000 nodes in ${elapsedMs.toFixed(1)} ms`);
  });
});
