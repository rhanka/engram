# Design note before review round 3 of Spec 2 (conductor, 2026-11-18)

Why: review round 2 (Opus 5.5 xhigh, `CHANGES-REQUESTED`) found the same defect class as round 1.
The class is the **symbol-sweep gap**: a symbol, a literal set or an anchor is fixed where the finding names it, and stays wrong everywhere else.
The owner's review rule asks for a design note before the next round when the same class comes back at round 2.
Round 3 is the last round. After it, the remaining options go to the owner.

## Rules for the round-3 fold (binding on the author)

1. **One normative definition.** Each symbol and each literal set has exactly one definition, in S2 §7.4 or in the spec or dossier that owns it. Every other place cites `Symbol (§x)` and never repeats its fields. The Spec 1, 3 and 6A deltas import the definition; they do not copy it. Where a sibling spec uses another casing, give one mechanical camel ↔ snake mapping, with identical fields and identical optionality.
2. **One meaning per symbol.** A type is never reused for a second role.
3. **The owner of record comes first.** Before defining a symbol, look for an existing definition and adapt to it:
   - the outer envelope frozen by Spec 6A §53 and `src/mcp/memory/contracts.ts:437-456`;
   - the `StepReceipt` of the agentic-loop dossier `sentropic/.tmp/agent-loop-v2/design.md:396-437`;
   - `H2ALoopTrackRef`.
   A dossier named by the owner wins over a reviewer's suggested name, including the round-1 M1 text.
4. **Sweep inventory.** For every symbol, literal or anchor the fold touches, the log (LOG §27) lists every occurrence and the line where it now sits. The search covers S2, the sibling deltas, the lot tests, the sibling specs and the owner files.
5. **Re-read every anchor.** Each new or moved anchor is re-read at its exact line, and the ledger quotes the line. An anchor that cannot be quoted is removed or marked `unverified`.

## Conductor rulings on round 2

- **N4, main model and the `refs_only_d6` posture.** Rule 6 of the dossier (DOS:490, « S'applique au shadow ») limits what engram sends to models that *engram itself calls*: the shadow, dreaming and the D7 reranker. The session's own main model already holds its own session content. `ModelContentAuthorizationPolicyV1` is therefore scoped to engram-initiated calls. This is not a new owner point. Add the RED test the reviewer asks for: under `refs_only_d6`, the pinned request stays inline for the main model while the shadow receives references only.
- **N6, our loop versus the agentic-loop dossier.** The S2 seam becomes an adapter over the dossier's `StepReceipt.terminalReason` and its `halt` extension. The S2-owned enum and receipt name are retired, and the mapping table is marked `proposed` until the dossier's Q1–Q14 are settled.
  - The dossier's L1b places the burst machine in chat-core (`design.md:967`). The owner's later answer says chat-core moves to the design system and a new library carries the agentic loop (ANS:93). The owner's answer wins.
  - Record the gap as a coordination point inside `OQ-S2-4`. Do not open a new owner question.
- **M4, decisions overflowing the ceiling.** Adopt the reviewer's fix:
  - a stub budget;
  - beyond it, one aggregate `decision_index` node: count, hash of the ordered digest list, and a paginated `search_history` locator. This node counts as present for invariant 1;
  - one digest field name;
  - one ordering rule;
  - a locator field on `GraphNodeV1`;
  - a RED test at 5,000 decisions.
- **OQ-S2-6, Gemini CLI.** Reframe it as « keep (default, passive `D2 A` / `D4 B`) or retire ». Qualification at P3/P4 is left to the §5.2 rule and is not an owner question. Mark the premise « Google replaced Gemini CLI with Antigravity » as `unverified` (source: DOS:529, an unreviewed annex).
- **MINORS n1–n9.** The conductor settles them, as the rule allows from round 2. Apply each fix exactly as the review states it.
