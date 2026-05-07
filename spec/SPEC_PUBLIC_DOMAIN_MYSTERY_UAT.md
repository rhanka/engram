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

These are UAT concepts only, not Graphify built-ins.

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

## UI Mocking Scenarios

The future studio should be mocked against these concrete reconciliation jobs:

1. Alias merge: `Holmes`, `Sherlock Holmes`, `Mr. Sherlock Holmes`.
2. Narrator/person split: Watson as narrator voice and Watson as character.
3. Cross-work recurring entity: a validated Holmes canonical entity reused across works.
4. Relation promotion: `Watson assists Holmes` from inferred to validated with source evidence.
5. Event/case grouping: a story-level case bundles characters, evidence, locations and resolution events.
6. Conflict review: a candidate relation has weak evidence or ambiguous speaker attribution.
7. External registry candidate: optional link from a character/work to Wikidata, reviewed as `same_as`.
8. Reject path: a false alias or relation is rejected with reason and audit entry.

## Expected Studio Screens

This UAT should drive the future Svelte studio around these screens:

- Candidate queue: unresolved entities, aliases, relations and weak evidence.
- Evidence panel: source file, chapter/story, quote/snippet, confidence and provenance.
- Canonical entity panel: accepted labels, aliases, status, external mappings and backlinks.
- Graph context panel: local neighborhood around a candidate entity or relation.
- Patch preview: deterministic JSON patch, changed-file summary and dry-run result.
- Audit trail: applied/rejected patches with author, timestamp, reason and graph/profile hashes.

## UAT Commands

Prepare a disposable Graphify UAT folder outside the Graphify repository:

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

## Acceptance Criteria

- The UAT can run without adding proprietary or non-public-domain content.
- Graphify docs and skills direct users to the external corpus rather than bundling it.
- Candidate decisions can be represented as `graphify_ontology_patch_v1`.
- Patch validation catches unknown evidence refs, invalid status transitions and invalid relation endpoints.
- Patch dry-run reports changed files without mutating the UAT folder.
- Patch write appends only to configured authoritative decision logs plus local audit logs.
- `.graphify/needs_update` is marked after write apply.
- Studio design can be evaluated against concrete mystery scenarios before implementation.
