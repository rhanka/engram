#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 /path/to/graphify.yaml" >&2
  exit 1
fi

CONFIG_PATH="$1"

node --input-type=module - "$CONFIG_PATH" <<'EOF'
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import YAML from "yaml";

const configPath = resolve(process.argv[2]);
const configDir = dirname(configPath);
const config = YAML.parse(readFileSync(configPath, "utf-8")) ?? {};
const stateDir = resolve(configDir, config.outputs?.state_dir ?? ".graphify");
const profileStatePath = resolve(stateDir, "profile", "profile-state.json");
const manifestPath = resolve(stateDir, "ontology", "manifest.json");
const nodesPath = resolve(stateDir, "ontology", "nodes.json");
const queuePath = resolve(stateDir, "ontology", "reconciliation", "candidates.json");

for (const requiredPath of [profileStatePath, manifestPath, nodesPath]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`missing required ontology artifact: ${requiredPath}`);
  }
}

const profileState = JSON.parse(readFileSync(profileStatePath, "utf-8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
const nodes = JSON.parse(readFileSync(nodesPath, "utf-8"));

if (existsSync(queuePath)) {
  const currentQueue = JSON.parse(readFileSync(queuePath, "utf-8"));
  if (typeof currentQueue.candidate_count === "number" && currentQueue.candidate_count > 0) {
    console.log(`Queue already populated: ${queuePath} (${currentQueue.candidate_count} candidate(s))`);
    process.exit(0);
  }
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nodeTerms(node) {
  const normalizedTerms = Array.isArray(node?.normalized_terms) ? node.normalized_terms : [];
  return new Set(normalizedTerms.map((value) => normalize(value)).filter(Boolean));
}

function nodeTokens(node) {
  const values = [
    node?.label,
    ...(Array.isArray(node?.aliases) ? node.aliases : []),
    ...(Array.isArray(node?.normalized_terms) ? node.normalized_terms : []),
  ];
  return new Set(
    values
      .flatMap((value) => normalize(value).split(/\s+/))
      .filter((token) => token.length >= 4),
  );
}

function chooseSeedPair(allNodes) {
  const sherlock = allNodes.find((node) => node?.id === "character_sherlock_holmes");
  const herlock = allNodes.find((node) => node?.id === "character_herlock_sholmes");
  if (sherlock && herlock) {
    return {
      canonical: sherlock,
      candidate: herlock,
      score: 0.97,
      sharedTerms: ["sherlock holmes"],
      reasons: [
        "same node type: Character",
        "cross-work detective alias review: Sherlock Holmes vs Herlock Sholmes",
      ],
    };
  }

  const candidates = allNodes.filter((node) => node?.status === "candidate");
  const canonicals = allNodes.filter((node) => node?.status === "validated");
  for (const candidate of candidates) {
    const candidateTerms = nodeTerms(candidate);
    const candidateTokens = nodeTokens(candidate);
    for (const canonical of canonicals) {
      if (!candidate?.type || candidate.type !== canonical?.type) continue;
      const sharedTerms = Array.from(nodeTerms(canonical)).filter((term) => candidateTerms.has(term));
      if (sharedTerms.length > 0) {
        return {
          canonical,
          candidate,
          score: 0.95,
          sharedTerms,
          reasons: [
            `same node type: ${candidate.type}`,
            `shared normalized term(s): ${sharedTerms.join(", ")}`,
          ],
        };
      }

      const sharedTokens = Array.from(nodeTokens(canonical)).filter((token) => candidateTokens.has(token));
      if (sharedTokens.length > 0) {
        return {
          canonical,
          candidate,
          score: 0.84,
          sharedTerms: sharedTokens.slice(0, 3),
          reasons: [
            `same node type: ${candidate.type}`,
            `shared token(s): ${sharedTokens.slice(0, 3).join(", ")}`,
          ],
        };
      }
    }
  }
  return null;
}

const seed = chooseSeedPair(nodes);
if (!seed) {
  throw new Error(`could not derive a demo reconciliation candidate from ${nodesPath}`);
}

const evidenceRefs = Array.from(new Set([
  ...(Array.isArray(seed.candidate?.source_refs) ? seed.candidate.source_refs : []),
  ...(Array.isArray(seed.canonical?.source_refs) ? seed.canonical.source_refs : []),
]));
const candidateId = "uat:" + createHash("sha256")
  .update([
    "entity_match",
    seed.canonical.id,
    seed.candidate.id,
    ...seed.sharedTerms,
  ].join("|"))
  .digest("hex")
  .slice(0, 24);

const queue = {
  schema: "graphify_ontology_reconciliation_candidates_v1",
  graph_hash: manifest.graph_hash ?? "unknown-graph-hash",
  profile_hash: profileState.profile_hash ?? "unknown-profile-hash",
  generated_at: new Date().toISOString(),
  candidate_count: 1,
  candidates: [
    {
      id: candidateId,
      kind: "entity_match",
      status: "candidate",
      score: seed.score,
      candidate_id: seed.candidate.id,
      canonical_id: seed.canonical.id,
      shared_terms: seed.sharedTerms,
      evidence_refs: evidenceRefs,
      reasons: seed.reasons,
      proposed_patch_operation: "accept_match",
    },
  ],
};

mkdirSync(dirname(queuePath), { recursive: true });
writeFileSync(queuePath, JSON.stringify(queue, null, 2) + "\n", "utf-8");

console.log(`Wrote 1 UAT reconciliation candidate to ${queuePath}`);
console.log(`Seed pair: ${seed.candidate.id} -> ${seed.canonical.id}`);
console.log(`Suggested studio command: node dist/cli.js ontology studio --config ${configPath} --port 4180`);
EOF
