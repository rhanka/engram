# SPEC EVOL — WP6 Platform & Parity

Status: validated for implementation

Date: 2026-07-22

Local baseline: `main` at `d9d2b23` (pending, untagged `@sentropic/graphify@0.17.2`; npm `latest` was `0.17.1` on 2026-07-22)

Track parent: `01KW89F1ZD6TSXAWRXYQQPSD9Y`

## 1. Objective

WP6 is one coordinated intake and release-readiness lane. It owns four existing
Track leaves together:

1. Python Graphify parity residuals (`01KTKVBBWWWTQ0ZQXYR7G7EH8B`).
2. h2a/subagent delivery coordination (`01KTKVBWHK4CW5HP1DV4BBB9EE`).
3. Python Graphify, CodeReviewGraph, and Repowise intake decisions
   (`01KWVE3YSW38NYJCK22GW634G7`).
4. Embedding-provider neutrality through a published sentropic mesh/gateway
   contract (`01KWVM63BTBZHKQSHGKCP945DJ`).

Release readiness means that the code increment is coherent and fully gated,
the intake ledger is current, and unfinished work is represented by an explicit
Track state or blocker. It does not mean declaring an unavailable external
contract complete.

## 2. Source locks

Observed by authoritative remote refs on 2026-07-22:

| Source | Head | Stable tag | Role |
| --- | --- | --- | --- |
| `safishamsi/graphify` | `v8` `82c46e5358d5b3185b7d66573b52f01e59bd2d06` | `v0.9.23` `c83085cf` | Sole port-parity authority |
| `tirth8205/code-review-graph` | `main` `6ce25b4e53f9df397f5136e86a59e17c02a610fe` | `v2.3.7` `6a1ee1c` | Additive product reference |
| `repowise-dev/repowise` | `main` `210b8fa350359d867e0e1da24d6e79dd0b1f51d9` | `v0.34.0` `741e129` | AGPL design reference only |
| `@sentropic/llm-mesh` | npm `0.10.0` | published tarball | Generation/stream contract; no embedding operation |
| `@sentropic/llm-gateway` | npm `0.9.0` | published tarball | Gateway routing contract; no embedding route |

The Python window `31211a0..82c46e5` contains 230 commits. A source lock is not
a mandate to port every commit. Each actionable cluster must be independently
classified and tested under the Track F rules.

## 3. Decisions

### D1 — Parity authority

Python Graphify remains the only upstream parity driver. CodeReviewGraph and
Repowise can inform independently specified product work but cannot create a
parity obligation or drive this package version.

### D2 — Current code increment

Adopt the bounded MCP response cluster from Python commits `fef9dbb` and
`deb2620`, plus the verified call-site provenance slice from `1fbc623`:

- `get_neighbors` and `get_community` accept a defaulted `token_budget`;
- output is cut only at line boundaries;
- a bounded notice appears at both the top and bottom with shown/omitted counts
  and a narrowing hint;
- traversal output uses the same honest truncation posture;
- rendered graph edges expose their own `source_file` / `source_location` when
  present, rather than implying a node-definition line is the relation site;
- under-budget output remains unchanged except for the additive relation-site
  suffix when edge provenance exists.

This is the only source port in the coordinated WP6 slice. It fixes a live,
reproducible MCP context-flood and evidence-location defect without importing a
new subsystem.

### D3 — Provider-neutral embedding boundary

The current boundary remains:

```text
VectorStore -> Graphify EmbeddingProvider <- future MeshEmbeddingProvider
                                             <- @sentropic/llm-mesh.embed()
                                             <- optional gateway transport
```

Graphify storage/vector code must not import Cohere, Ollama, OpenAI, or another
provider SDK. Graphify must not import `@sentropic/llm-gateway` from storage.
The existing injected `EmbeddingProvider` is the source-of-truth boundary until
the mesh contract exists. The current `@sentropic/llm-mesh` dependency remains
generation-only; bumping it solely to imply embedding support is rejected.

The external gate is a published mesh tarball that exports:

- `EmbeddingRequest` and `EmbeddingResponse`;
- `ProviderAdapter.embed` and `LlmMesh.embed`;
- embedding capability metadata and `operation: "embed"` hooks;
- ordered batching and provider/model/dimension identity;
- vector count, dimension, and finite-number validation;
- explicit usage and error semantics where available.

If remote egress is required, gateway must publish a pooled/metered embedding
route consumed by mesh. Graphify remains unaware of the gateway wire protocol.
Source-branch promises do not close this gate; a published tarball integration
test does.

### D4 — h2a/subagent coordination

#### h2a coordination evidence

The active h2a root is `/home/antoinefa/h2a-workspace/.h2a`; the repo-local
`.h2a` is dormant and must not be used as a second authority. WP6 uses one
discovered conductor identity, exact live recipients, inbox processing, and
read-only subagents for adversarial review. Concurrent storage work is excluded
from WP6 and preserved. h2a coordination proves ownership and dependencies; it
does not substitute for repository tests or Track acceptance.

### D5 — Release posture

A patch release is coherent only for the bounded-response/provenance safety
increment and the refreshed intake ledger. WP6 itself remains in progress while
the external embedding gate or any accepted Track F residual remains open.
Publishing is forbidden unless all repository gates, a clean intended tarball,
npm identity, and package provenance are verified. A dirty concurrent checkout
is not an acceptable local publish source even when its unrelated files are
excluded from commits.

## 4. Adopt / defer / reject intake

### Python Graphify (MIT)

| Decision | Concrete output |
| --- | --- |
| Adopt now | Bounded line-list/traversal MCP output and relation-site provenance (`fef9dbb`, `deb2620`, verified slice of `1fbc623`). |
| Already covered | Exact `## graphify` section matching (`97a1371`) is already enforced by `replaceOrAppendSection`; current graph-size and shrink guards also cover their established local contracts. |
| Defer | Atomic graph/manifest write consolidation; cache/watch/partial-build integrity; nested ignore and update semantics; language-specific collectors/resolution; the remainder of `31211a0..82c46e5`. Each needs its own reproducer and bounded lot. |
| Reject | Python packaging/release mechanics, Python-only subprocess/runtime refactors, and provider-specific embedding/runtime wiring. |

### CodeReviewGraph (MIT)

| Decision | Concrete output |
| --- | --- |
| Adopt/covered | `summary`, `review-delta`, `review-analysis`, review eval, install previews, graph provenance, and query-oriented graph tools are already represented in the TypeScript product. No direct port in this slice. |
| Defer | Weighted impact-radius comparison, bounded transitive-test lookup, churn-risk scoring, `review-pr`, additional languages, and persisted flow tables until a local spec/reproducer exists. |
| Reject | SQLite/daemon defaults, direct local/provider embedding baselines, editor-extension parity, Python runtime plumbing, and reverted IBM Bob support. |

### Repowise (AGPL-3.0)

| Decision | Concrete output |
| --- | --- |
| Adopt as design only | Refusal-over-fabrication and bounded agent-response principles; the bounded MCP implementation in this slice is independently derived from the MIT Python parity source. No Repowise code, templates, constants, or translated structures are used. |
| Defer | SCC/import cycles, per-test test-to-code maps, curated responses, deterministic no-LLM wiki expansion, code health/dead code, git-risk/provenance, tours, savings, and generated context blocks to separate specs. |
| Reject | Copying/translating AGPL implementation; resident server/database/provider-key architecture; in-product provider routing; uncalibrated health scores; a dollar/pricing ledger in Graphify core. |

## 5. Acceptance

The coordinated slice is release-ready when:

1. Focused MCP tests prove under-budget compatibility, line-boundary truncation,
   prominent notices, omitted counts, narrowing hints, and relation-site output.
2. A guard test proves `src/storage/vector/**` has no direct provider SDK or
   gateway import.
3. Unit/integration, lint, build, package/tarball, and relevant smoke gates pass.
4. `graphify review-delta`, `graphify portable-check`, Track validation, and
   `npx graphify hook-rebuild` complete against the intended changes.
5. Two independent completion reviewers reconcile blocking findings.
6. Track records the intake specification, h2a evidence, completed acceptance,
   and the external embedding dependency without marking blocked work done.

## 6. Adversarial validation

Two independent `gpt-5.6-sol` / `xhigh` read-only reviews were reconciled before
implementation:

- Release/correctness review: reject a four-leaf completion claim; adopt the
  bounded MCP response increment; require current locks and full release gates.
- Architecture/product review: retain the injected embedding seam; forbid
  provider SDK imports; record a published mesh contract as an external blocker;
  close broad CRG intake and keep Repowise design-only.

Both reviews reject speculative direct embedding adapters and a bulk 230-commit
port. This spec adopts their common minimum and records their exact external
gate.
