---
status: author-repaired-awaiting-cofreeze
review-author:
  host: codex
  model: gpt-6.1-sol
  effort: xhigh
author-metadata-source: owner request (declared identity)
target-ref: 1282a31d019052b1f6665bfb27ffd4eb307ed50d
reviewed-base: 1359e6b8637faa12a59b974739cea3f51094d777
review-input-sha256: 989a16f44d07fd35db196fdb2311590d2c8118102d7ec59fc2d709bf7a2afa2f
independent-rereview: unverified
co-owner-acceptance: unverified
---

# MCP-L0a co-review repair handoff

Normative input: `/home/antoinefa/src/graphify/.graphify/scratch/design/memory-mcp/SPEC-memory-mcp-v3.1.md`, exact-byte SHA-256 `f90c927964b44fdf6ad712eee9b894762250239384643a3790931c142d3aeeca`. Co-frozen answers SHA-256: `71ba105149a64ca775c3a27ea5e1d0d16f9abd215cac28aaa87691b1655ba2a7`.

Received review: `/home/antoinefa/src/sentropic/.tmp/engram-mcp/cofreeze-L0a-review.md`, SHA-256 above, verdict **OBJECTIONS** against `1359e6b8`. This handoff records author repairs, not a new co-freeze verdict. The target ref identifies the final implementation/tests; later evidence/documentation commits do not change those bytes. L0b was outside the received review and has no new acceptance here.

| Objection | Repair and independent counterexample |
|---|---|
| O1, M:525,716–718 | Ordinary admission requires an explicit negative tombstone match; unknown/non-Boolean matches refuse `POLICY_UNAVAILABLE`. Recapture requires a present validated same-scope digest collection, so `Set(undefined)` cannot supply eligibility. Both report examples were RED before repair, then GREEN; `O1-tombstone-verdict` and `O1-tombstone-evidence` are killed. |
| O2, M:525,559,561,567 | A06 expected binding requires current literal-true approver enrollment, non-revocation, assurance and host-deployment qualification. Current verdicts bind the exact approving principal/subject, expected issuer and accepted assurance-policy versions. Historical assurance alone refuses, including committed disclosure. The runtime assurance record no longer fixes qualification to `unverified`; qualifying the host changes its supplied verdict, not the contract. The report example was RED; six current-check/configuration mutations are killed. |
| O3, M:538,542,545–547,592,1608 | `ExpectedMemoryInvocationContextV1` is mandatory: current generation/epoch, actual tool, effect time and host confirmation policy. Mutation/destructive envelope requirements derive from tool identity; argument/envelope key equality and argument/trusted-purpose equality are enforced. `MemoryContextProjectionV1.purpose_ref` preserves purpose. Omitted expectations were RED; seven freshness/envelope/purpose mutations are killed. |

All counterexamples live in `tests/memory-mcp-cofreeze.test.ts`, with the exact normative lines in test names and atomic commit bodies. The prior A06 committed-reservation guard remains covered through both confirmation entry points. Only original confirmation expiry and the no-effect execution window are relaxed for committed disclosure; current authorization, current assurance/configuration, original approval and binding checks remain required. Cross-session committed recovery uses the principal-scoped lookup after fresh caller/target authorization (M:567).

| Minor | Disposition under explicit v3.1 rules |
|---|---|
| 5 | Fixed, M:238,244,561,688,821: `query` and `candidate_id` preserve well-formed NFD strings; the independent NFC fixtures are corrected. Candidate input/output, digest-target and withdrawal-confirmation validation agree. The confirmation target counterexample also kills the candidate-target NFC mutation. |
| 6 | Fixed, M:241–242,279: nonempty NFC opaque refs and byte-valid keys permit whitespace; no unspecified trimming remains in these field validators or query validation. |
| 7 | Fixed for authority direction/current expiry, M:517,525,547: invoking principal is the delegate; delegation expiry is checked at the supplied effect time, not issue time. Invocation issue/deadline freshness also uses that time. Adding tenant/namespace fields to the delegation itself is non-normative, left unchanged. |
| 8 | **Non-normative, left unchanged:** v3.1 does not freeze a replacement credential grammar/ceiling. No new token format is invented; existing credential bounds remain for owner/platform disposition. |
| 9 | Fixed, M:567,704,710,782: unknown effects return `MUTATION_OUTCOME_UNKNOWN`; a canonical commitment with replay proof but no stored host output returns `reconcile_canonical`, never a new execution. Missing canonical proof remains unknown. |
| 10 | Fixed, M:527,777: caller admission precedes target normalization in lifecycle and both lookup entries; caller denial is `UNAUTHORIZED`, admitted target denial is `NOT_FOUND`. |
| 11 | Fixed for required bindings/closure, M:561,565,1602: incomplete continuation/expected refs cannot match through `undefined`; every supplied reattachment proof is closed and checked. An added approving-principal namespace field is non-normative, left unchanged; current principal/subject/issuer matching is supplied by O2. |
| 12 | Fixed, M:322–326,785: invalid/synthetic audit IDs produce the constant protocol `-32603` before projection's domain checks, with a distinct `protocol_refusal` arm and no domain envelope. Existing dispatch/envelope guards retain the same refusal. |
| 13 | Fixed, M:706: optional legacy top-level policy copies must equal the applicable sealed projection; tag-only arms reject fabricated capture/admission versions. Both version-copy mutations are killed. |

M5-CROSS-TOOL-KEY now consumes all three independent fixture pairs (capture→withdraw, capture→admission, admission→forget), testing both same-key conflict and distinct-key execution. Stored lookup keys use the spec's nine fields independently of production extraction. `M5-lookup-key-includes-tool` adds tool identity to the lookup criterion and is killed (M:694–698).

A05 adds literal changed-target (`cand_01`→`cand_02`) and changed-effective-value (`reason:duplicate-candidate`→`reason:operator-choice`) vectors, with exact bytes/full hashes and same-key conflict assertions (M:686,690). Bytes were transcribed from the specified closed withdrawal arm, checked by `jq -cS`, then hashed independently by `sha256sum` and Node crypto, without production serialization. The respective hashes are `sha256:3df1c2910332249fd977cdcc779d2d956a0f307e3b549adcecc02971702a6733` and `sha256:9d74c314c207fe80fc36c6b0c8da6feca6b9f0d0a91753b917d46621ac67caee`. Mutations dropping the target or effective reason from digest bytes are killed.

Final validation on restored source bytes: `npx vitest run tests/memory*` = **563 passed, 11 skipped, 0 failed**, across 41 files; `npx tsc --noEmit -p .` and `git diff --check` pass. **114/114 mutations are killed** and every restored-source SHA-256 matches the [mutation evidence](MCP_L0_SOL_MUTATIONS.md), generated by `node scripts/check-memory-mcp-mutations.mjs`. Selected reruns use `MEMORY_MCP_MUTATION_IDS` and do not overwrite the full report. Sources are restored in `finally`; tests/fixtures are never mutated. The full campaign exposed an old missing-policy test masked by O1's earlier refusal; supplying explicit tombstone evidence restores its independent policy-default kill.

The owner forbids network access: no new review/model launch, install, dependency, provider/loader delivery, push, publication or production qualification was performed. All checks use installed local tools with npm offline; no Python is used. Independent re-review, joint freeze, deployment/backend/custody qualification, L5 reference/runtime qualification and co-owner acceptance remain `unverified`. Existing L0b contracts and their earlier evidence do not constitute acceptance by this L0a repair round. M14 option B is unchanged.
