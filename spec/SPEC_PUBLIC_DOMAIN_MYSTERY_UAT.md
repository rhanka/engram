# Public Domain Mystery Sagas UAT

## Purpose

Use the external `public-domaine-mystery-sagas-pack` repository as a real open corpus for ontology lifecycle UATs and UI mockups.

This is not a Graphify fixture package. Graphify must not vendor the real corpus. The corpus remains external so Graphify can stay generic, small, and license-isolated while still testing against realistic text.

External corpus repository:

- `../public-domaine-mystery-sagas-pack`
- `https://github.com/rhanka/public-domaine-mystery-sagas-pack`

## Scope For This Merge

This UAT supports the mergeable ontology infrastructure branch:

- profile-aware extraction remains opt-in;
- ontology patches target project-owned source files, not `graph.json`;
- MCP write tools remain explicit and local;
- the Svelte reconciliation studio is not implemented in this merge;
- the corpus is used to shape studio requirements and future screens.
- the public pack may commit a standard `.graphify/` demo state, but Graphify itself must not vendor the corpus.

Current public demo location:

- `../public-domaine-mystery-sagas-pack/.graphify/`
- `../public-domaine-mystery-sagas-pack/examples/graphify-three-works/`

## Mini Corpus

Start with two or three works, not the full pack:

```text
../public-domaine-mystery-sagas-pack/corpus/sherlock-holmes/a-study-in-scarlet/text.txt
../public-domaine-mystery-sagas-pack/corpus/sherlock-holmes/the-adventures-of-sherlock-holmes/text.txt
../public-domaine-mystery-sagas-pack/corpus/arsene-lupin/the-extraordinary-adventures-of-arsene-lupin-gentleman-burglar/text.txt
```

Rationale:

- `A Study in Scarlet` gives Holmes, Watson, narrator identity, first meeting, crime, evidence and backstory.
- `The Adventures of Sherlock Holmes` adds recurring social relations, aliases, case structure and Irene Adler.
- `Arsene Lupin` adds cross-saga pressure: disguise, alias, theft, adversary and anti-hero modeling.

## Candidate Ontology Profile Concepts

These are UAT concepts only, not Graphify built-ins. Graphify must implement generic profile, policy, candidate and patch mechanisms; the mystery profile supplies these concrete values.

Node types:

- `Character`
- `Alias`
- `Work`
- `ChapterOrStory`
- `Case`
- `Event`
- `Location`
- `Object`
- `Evidence`
- `Organization`
- `NarrativeRole`

Relation types:

- `appears_in`
- `alias_of`
- `narrates`
- `investigates`
- `assists`
- `commits`
- `suspected_of`
- `located_in`
- `contains_evidence`
- `mentions`
- `opposes`
- `same_as`

Review statuses:

- `candidate`
- `needs_review`
- `validated`
- `rejected`
- `deprecated`

## Generic Policy Contract

The UAT must exercise configurable policy rather than hard-coded mystery rules.

The project profile should be able to express:

```yaml
evidence_policy:
  minimum:
    source_ref: required
    section_ref: recommended
    snippet: required
    confidence: required
    offsets: optional
  snippet:
    max_chars: 800
  acceptance_rules:
    promote_relation:
      require_direct_mention: true
      require_source_grounding: true
    merge_alias:
      require_shared_entity_context: true
      require_human_review: true

reconciliation_policy:
  candidate_sort:
    - unresolved_high_degree_first
    - weak_evidence_first
    - recurring_entity_first
  status_transitions:
    candidate: [needs_review, validated, rejected]
    needs_review: [validated, rejected]
    validated: [deprecated]
    rejected: []
```

The exact YAML shape can evolve during implementation, but the behavior must remain generic:

- assistants may propose policy changes from sampled candidates;
- deterministic validation enforces the configured policy;
- no LLM is required during patch validation or apply;
- policy changes are written as profile diffs or patches, not silently applied.

## Concrete Evidence Example

A source-grounded candidate should be inspectable without reading the whole book.

Example candidate shape:

```json
{
  "candidate": {
    "action": "promote_relation",
    "subject": "Irene Adler",
    "relation": "appears_in",
    "object": "A Scandal in Bohemia"
  },
  "evidence": {
    "source_ref": "corpus/sherlock-holmes/the-adventures-of-sherlock-holmes/text.txt",
    "work": "The Adventures of Sherlock Holmes",
    "section": "A Scandal in Bohemia",
    "snippet": "To Sherlock Holmes she is always the woman.",
    "confidence": 0.92,
    "offsets": null
  },
  "review": {
    "status": "candidate",
    "reason": "The snippet grounds the character in the story context, but validation still follows the configured profile policy."
  }
}
```

The snippet is intentionally short. A production profile may require exact offsets later, but this UAT should not block the first studio workflow on a full passage segmentation system.

## Skill-Assisted Policy Configuration

The Graphify skills should support a configuration workflow for reconciliation policy:

1. sample a small set of candidates from the active graph/profile;
2. show which candidates are accepted, rejected or ambiguous under current rules;
3. propose deterministic rule changes as a dry-run profile patch;
4. explain the impact in generic terms;
5. wait for user approval before writing anything.

The skill must not inject a mystery-specific ontology into Graphify. It may write or patch project-owned profile files only when the user explicitly approves.

## UI Mocking Scenarios

The future studio should be mocked against these concrete reconciliation jobs:

1. Alias merge: `Holmes`, `Sherlock Holmes`, `Mr. Sherlock Holmes`.
2. Narrator/person split: Watson as narrator voice and Watson as character.
3. Cross-work recurring entity: a validated Holmes canonical entity reused across works.
4. Relation promotion: an inferred relation becomes validated only when evidence policy passes.
5. Event/case grouping: a story-level case bundles characters, evidence, locations and resolution events.
6. Conflict review: a candidate relation has weak evidence or ambiguous speaker attribution.
7. Policy calibration: the skill samples candidates and proposes deterministic profile-rule changes.
8. External registry candidate: optional link from a character/work to a public registry, reviewed as `same_as`.
9. Reject path: a false alias or relation is rejected with reason and audit entry.

## Expected Studio Screens

This UAT should drive the future Svelte studio around these screens:

- Candidate queue: unresolved entities, aliases, relations and weak evidence.
- Evidence panel: source file, chapter/story, quote/snippet, confidence and provenance.
- Canonical entity panel: accepted labels, aliases, status, external mappings and backlinks.
- Graph context panel: local neighborhood around a candidate entity or relation.
- Patch preview: deterministic JSON patch, changed-file summary and dry-run result.
- Audit trail: applied/rejected patches with author, timestamp, reason and graph/profile hashes.

## UAT Commands

Use the external public pack as the standard UAT location. Its committed `.graphify/` directory is the public illustration output.

Inspect the demo:

```bash
cd ../public-domaine-mystery-sagas-pack
graphify summary --graph .graphify/graph.json
```

Regenerate the graph in the pack when the corpus or Graphify behavior changes:

```bash
cd ../public-domaine-mystery-sagas-pack
graphify . --all
```

For isolated experiments, prepare a disposable Graphify UAT folder outside the Graphify repository:

```bash
mkdir -p /tmp/graphify-mystery-uat/corpus
cp ../public-domaine-mystery-sagas-pack/corpus/sherlock-holmes/a-study-in-scarlet/text.txt /tmp/graphify-mystery-uat/corpus/a-study-in-scarlet.txt
cp ../public-domaine-mystery-sagas-pack/corpus/sherlock-holmes/the-adventures-of-sherlock-holmes/text.txt /tmp/graphify-mystery-uat/corpus/the-adventures-of-sherlock-holmes.txt
cp ../public-domaine-mystery-sagas-pack/corpus/arsene-lupin/the-extraordinary-adventures-of-arsene-lupin-gentleman-burglar/text.txt /tmp/graphify-mystery-uat/corpus/arsene-lupin-gentleman-burglar.txt
```

Run a normal knowledge-base graph first:

```bash
graphify /tmp/graphify-mystery-uat --all
```

Then add a project-owned `graphify.yaml`, ontology profile and optional registries in the UAT folder, run configured dataprep, profile extraction, validation, ontology output and patch dry-runs. The exact profile files should live in the UAT repo or temporary folder, not in Graphify package fixtures.

## Executed Isolated UAT On 2026-05-12

The first UAT was run in `/tmp/graphify-mystery-uat` from the three public-pack texts above, without writing into `../public-domaine-mystery-sagas-pack`.

Public pack orientation:

```bash
node dist/cli.js summary --graph ../public-domaine-mystery-sagas-pack/.graphify/graph.json
```

Result: `20` nodes, `38` edges, `3` communities; top hubs were `Sherlock Holmes`, `A Study in Scarlet`, `The Adventures of Sherlock Holmes`, `The Extraordinary Adventures of Arsene Lupin, Gentleman-burglar`, and `Detective Fiction Genre`.

Configured profile UAT:

```bash
node dist/cli.js profile validate --config /tmp/graphify-mystery-uat/graphify.yaml
node dist/cli.js profile dataprep --config /tmp/graphify-mystery-uat/graphify.yaml --all
node dist/cli.js profile validate-extraction --profile-state /tmp/graphify-mystery-uat/.graphify/profile/profile-state.json --input /tmp/graphify-mystery-uat/extractions/mystery-profile-extraction.json --json
node dist/cli.js profile ontology-output --profile-state /tmp/graphify-mystery-uat/.graphify/profile/profile-state.json --input /tmp/graphify-mystery-uat/extractions/mystery-profile-extraction.json --out-dir /tmp/graphify-mystery-uat/.graphify/ontology
node dist/cli.js ontology candidates --profile-state /tmp/graphify-mystery-uat/.graphify/profile/profile-state.json --out /tmp/graphify-mystery-uat/.graphify/ontology/reconciliation/candidates.json --json
```

Results:

- profile valid: `public-domain-mystery-uat`
- dataprep: `3` semantic files, `0` registry nodes
- profile extraction valid with no issues
- ontology outputs: `12` nodes, `6` relations, `11` wiki pages
- candidate queue: `1` deterministic Holmes entity-match candidate, score `0.85`, with source refs from `A Study in Scarlet` and `The Adventures of Sherlock Holmes`

Patch UAT covered these positive scenarios:

- `accept_match`: `character_holmes_adventures_candidate` -> `character_sherlock_holmes`
- `merge_alias`: `Mr. Sherlock Holmes` -> `character_sherlock_holmes`
- `add_relation`: `character_irene_adler` `appears_in` `story_a_scandal_in_bohemia`
- `set_status`: `character_irene_adler` from `candidate` to `needs_review`
- `reject_match`: `character_arsene_lupin` rejected as a Holmes match

Patch validation also rejected the intended negative scenarios:

- unknown evidence ref: `Unknown evidence_ref missing-evidence-ref`
- invalid status transition: `status transition validated -> candidate is not allowed by profile policy`
- invalid relation endpoint: `relation endpoint types Work -> Character are not allowed for appears_in`

Patch apply UAT:

```bash
node dist/cli.js ontology patch apply --profile-state /tmp/graphify-mystery-uat/.graphify/profile/profile-state.json --patch /tmp/graphify-mystery-uat/patches/001-accept-holmes-match.json --dry-run --json
node dist/cli.js ontology patch apply --profile-state /tmp/graphify-mystery-uat/.graphify/profile/profile-state.json --patch /tmp/graphify-mystery-uat/patches/001-accept-holmes-match.json --write --json
node dist/cli.js ontology decision-log --profile-state /tmp/graphify-mystery-uat/.graphify/profile/profile-state.json --json
```

Results:

- dry-run reported exactly three changed-file previews: authoritative decision log, local audit log, and `.graphify/needs_update`
- write apply appended the applied patch to `graphify/reconciliation/decisions.jsonl` and `.graphify/ontology/reconciliation/applied-patches.jsonl`
- `.graphify/needs_update` was marked with `ontology patch applied: mystery-uat-001-accept-holmes-match`
- decision-log preview returned `2` records: authoritative plus audit

Read-only studio API UAT:

```bash
node dist/cli.js ontology studio --config /tmp/graphify-mystery-uat/graphify.yaml --port 38917
curl -sS http://127.0.0.1:38917/api/ontology/reconciliation/candidates
curl -sS http://127.0.0.1:38917/api/ontology/reconciliation/decision-log
curl -sS http://127.0.0.1:38917/api/ontology/rebuild-status
```

Results:

- candidates route returned the Holmes entity-match candidate with `stale: true` after the write apply
- decision-log route returned authoritative and audit records without absolute paths
- rebuild-status route returned `needs_update: true`, `candidates_match: true`, and `decision_log_available: true`

Open follow-up: decide whether to commit the standard UAT `graphify.yaml`, ontology profile and project-owned reconciliation paths directly into `../public-domaine-mystery-sagas-pack`.

## Acceptance Criteria

- The UAT can run without adding proprietary or non-public-domain content.
- Graphify docs and skills direct users to the external corpus rather than bundling it.
- Candidate decisions can be represented as `graphify_ontology_patch_v1`.
- Patch validation catches unknown evidence refs, invalid status transitions and invalid relation endpoints.
- Patch dry-run reports changed files without mutating the UAT folder.
- Patch write appends only to configured authoritative decision logs plus local audit logs.
- `.graphify/needs_update` is marked after write apply.
- Studio design can be evaluated against concrete mystery scenarios before implementation.
- Skills can propose reconciliation-policy configuration changes from sampled candidates without hard-coding this UAT ontology.
