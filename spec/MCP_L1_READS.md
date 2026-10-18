# MCP-L1 — scoped neutral reads and in-process read tools

Branch: `feat/memory-mcp-l1-reads`; base: `3eff28a8` (merged L0).
Normative source: frozen `SPEC-memory-mcp-v3.1.md`, M1/M2/M3/M4/M6/M13/M14 and the MCP-L1 row.
Source SHA-256: `f90c927964b44fdf6ad712eee9b894762250239384643a3790931c142d3aeeca`. Restoration delta: `SPEC-memory-mcp-v3.2.md`, SHA-256 `18c697c1cd91287fd9f814c059910ffb4b39ddb1be46af547f384c7d912177b2`, restores D3/D10 from baseline `7bc9baec`; read sections are unchanged and joint re-acceptance of the D10 delta remains `unverified`.
The frozen source is unchanged. This lot implements option B's reads, without claiming an adapter or a complete 0.20.0 release.

## Delivered boundary

- `ScopedCanonicalReadPortV1` is an additive, explicitly versioned store facet. The in-memory core and its SQLite/Postgres wrappers provide it through the same store/fence. Missing or wrong versions refuse `CAPABILITY_UNAVAILABLE`; no legacy read fallback exists.
- Exact scope is bound to the engine's authorization decision before snapshot limits, BM25 statistics, semantic adjacency, vector allowlists, counts and receipts. Point reads use this facet directly, independently of ranking.
- Snapshots and final checks use pure reads. Expiry, disputes, historical state, tombstones and invalid trust withhold bodies without maintenance events, cursor advances or outbox writes. Final validation reuses `revalidateReadOnly`, including a check for cursor advancement during that call.
- `createMemoryReadFacetsV1` constructs `MemoryRecallPortV3` and `MemoryReadPortV1` over one injected engine/store binding. V2 port and packet declarations remain unchanged. The shared authorization guard additionally rejects a revalidation timestamp differing from the requested check time.
- Redaction preserves complete authorized fields, omits components without surviving citations and withholds records without a disclosable identifier. Trust infrastructure failure remains a typed failure, never an empty successful search.
- Public `@sentropic/engram/memory-tools` exposes explicit in-process `search`/`get` construction and a host-instantiated bounded page store. Neutral facet construction stays in the neutral integration surface, preserving its store provenance registry. Importing the product entry activates nothing and loads no native driver, MCP transport or broker.
- Host authentication, per-tool authorization, continuation verdicts, exact scope/store, principal/tenant, agent/session/generation, policy/epoch, audit and deadline are mandatory. No identity or audit fallback is supplied. Reads re-enter the neutral facets after awaited host callbacks so canonical eligibility is checked last.
- Handles use 192 random bits, finite host-selected TTL and quotas, and disposal. Their state binds exact query bytes and limits, identity, scope/purpose, policy/generation, profile, dual-as-of pins and the neutral cursor's eligibility binding. Raw engine cursors are never accepted or exposed by the product facade. Any canonical high-water change conservatively invalidates a continuation.
- M2 input/output validators and M6 sanitized exhaustive error mapping are reused, including neutral retryability. Packet bounds cover the complete envelope and the frozen dual-representation ceiling. Public response digests cover the public page after handle replacement; rank receipts are preserved.

## Test-first evidence

`tests/memory-mcp-l1-reads.test.ts` has 42 behavioral cases citing their governing rules. They cover same-store foreign corpora, caps, semantic allowlists, pure expiry reads, real SQLite no-write/fence behavior, exact reads, atomic omission, version refusal, disputes, trust and authorization verdict matrices, late host/canonical races, query bytes, budgets, pagination, expiry/quota/disposal and generation/parameter drift.

`tests/memory-mcp-l1-packed.test.ts` builds the real product entry and declarations, packs the actual manifest, extracts it into an isolated consumer without dependency installation or source aliases, and runs its guards through the public package export. It verifies mandatory installed types, absence of non-builtin runtime imports and sanitized refusals before provider dispatch.

Tests preceded implementation. The initial new-suite run failed because the modules were absent. Subsequent targeted red cases demonstrated the Unicode query collision, trust-infrastructure masking, cursor race, stale authorization proof and retryability loss before their guards were corrected.

## Gates

Executed locally without Python, network use or new dependencies:

```sh
GRAPHIFY_MEMORY_SKIP_DOCKER=1 npx --offline vitest run tests/memory*
npx --offline tsc --noEmit -p .
git diff --check
npm --offline --prefix engram-memory run build
node scripts/check-memory-mcp-l1-mutations.mjs
```

Memory gate: **43 files passed; 608 tests passed; 11 skipped; 0 failed**. All 43 new L1 cases pass, including real SQLite and packed runtime/type consumption. Root TypeScript, neutral package build and whitespace checks pass.

The 11 skipped cases belong to existing PostgreSQL-dependent lanes (projection cascade, recall parity/golden references, reconciliation and trust-tier round-trip). Docker/connection-based tests were disabled to respect the owner's no-network instruction. PostgreSQL native qualification is not claimed by this local run.

## Mutation evidence

The serial script first requires a clean baseline, mutates production sources only, requires an actual failed behavioral assertion and restores each source in `finally`. **5/5 killed**:

| Mutation | Governing assertion |
|---|---|
| Remove store scope filtering | M3 corpus isolation before caps and ranking |
| Accept absent continuation verdict using `=== false` | M4 absent/nonliteral continuation refusal |
| Reuse the early packet after the last host callback | M3 final canonical eligibility after host awaits |
| Convert verifier infrastructure failure into ineligibility | M6 failure cannot become empty successful search |
| Ignore cursor advance during final revalidation | M3 current eligibility for both search and exact get |

No deviation from the frozen L1 requirements was identified in the delivered behavior. This evidence does not qualify L2 mutations, L4/L5 transport or production host bindings. Independent peer review was not run under the owner's no-network constraint; these author-side tests and mutations are not peer consensus. No push or publication was performed.
