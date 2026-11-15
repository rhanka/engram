# Design note — grounding every code claim (2026-11-15)

Trigger: Spec 2 review round 2 (sentropic, engram-s2-carbon-r2.md, sha256 93df3a6f…). Five findings stayed partly open, and ND-06 found stale file:line anchors and four cited scripts that do not exist. Both rounds showed the same class: claims about existing code that were not checked against the code. Under the conductor rules, a design note comes before round 3.

## Rule
Every statement about existing code in a spec is EVIDENCE, or it is marked as new.
1. **An anchor** (`path:line`) is written only after reading that exact line in the target repository, at a named commit (`origin/main` of that repo, by SHA). Line ranges are re-read after each edit of the spec.
2. **A cited script, Make target, constant, type, function or error code** must exist. Prove it with a command run during the fold: `git grep`, `rg` or `ls`, recording what the command is and its hit. If it does not exist, the spec says « new », names the lot that adds it, and never cites it as existing.
3. **« Wired » or « called » claims** need the call site on the real (non-test) path, as an anchor. A function only called from tests is « not wired ».
4. **Schema claims** (JSON Schema dialects, bounded parameter grammars) are checked against the validator that enforces them: the grammar's own rules (for example `$ref` and open objects being forbidden) bind the spec.
5. **Identity of signers, keys and gates** is taken from the code or registry that defines them, never from a summary.

## Process for round 3
- The fold runs the checks of rules 1–5 and appends a « Grounding ledger » to the fold log. Each row records: claim → command → result → anchor or « new ».
- Any claim that cannot be grounded is removed or rewritten as « new ».
