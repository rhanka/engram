# Security & technical-debt ledger — CONTROL (graphify-cyber)

Opening balance, measured 2026-07-29 against local `main` at `a7d605a6`.

Every number here was observed, not estimated. Where a measurement contradicts a
previously-held belief, the contradiction is stated rather than smoothed over.
CONTROL audits and may veto a release; it owns nothing and signs nothing. Every
irreversible act (merge, push, tag, publish) is the principal's call.

Ranked by exploitability x blast radius, each with the smallest safe remediation.

---

## R1 — Release gate: npm advisories (RELEASE-BLOCKING)

**Measured.** `npm audit` at repo root: **21** advisories — 6 high, 10 moderate,
5 low, **0 critical**. This has drifted since the charter was written (20: 5
high, 10 moderate, 5 low), so the gate is moving and must be re-measured at tag
time, never quoted from a previous pass.

The number that actually governs a release is the production-only one, because
devDependencies never reach a consumer install:

| Scope | high | moderate | low | total |
|---|---|---|---|---|
| `npm audit` (all) | 6 | 10 | 5 | 21 |
| `npm audit --omit=dev` | **4** | 10 | 4 | **18** |

Three highs are **dev-only** and cannot be reached by a consumer: `postcss`
(7.5, sourceMappingURL path traversal), `vite` (7.5, `server.fs.deny` bypass —
Windows dev server only), `esbuild` (2.5, Windows dev server). They are build-time
hygiene, not release blockers.

The four highs that DO ship:

| Package | Advisory | Exploitability here |
|---|---|---|
| `ws` | memory-exhaustion DoS from tiny fragments (7.5) | Reachable only if a websocket server accepts untrusted peers. Studio binds loopback. |
| `brace-expansion` | unbounded expansion OOM (7.5) + exponential-time expansion (5.3) | Reached via glob/minimatch during file scanning. Input is the user's own repo, so this is self-DoS, not a third-party attack path. |
| `fast-uri` | host confusion via backslash authority delimiter / failed IDN canonicalisation (7.5 x2) | Reached via ajv schema validation. Matters only where a URI is security-relevant (allow-list decisions). |
| `hono` | CORS reflects any Origin with credentials when `origin` defaults to wildcard (7.1); `hono/jsx` cross-request data disclosure (6.5); serve-static path traversal on Windows (5.9) | Enters via `@hono/node-server` under `@modelcontextprotocol/sdk`. Only live where an MCP/hono server is actually served. |

**Smallest safe remediation.** 16 of the 18 production advisories report
`fixAvailable: true` and are resolvable by a plain, non-forced `npm audit fix`
followed by the full suite. **Never `npm audit fix --force`** — it is permitted to
cross a semver major and will silently change published behaviour.

Resolved by removal (owner decision 2026-10-25, option b): `ollama-ai-provider`
is no longer a dependency (dropped in 0.21.2), so its pinned
`@ai-sdk/provider-utils` 2.x line — and the zod 3 line it pulled
(GHSA-mrhx-c7xc-m3w5, high, on zod) — no longer ships. The Ollama direct
backend is dropped with it (`--backend ollama` is now refused with the
standard `--backend` error); `@sentropic/llm-mesh` has no Ollama provider, so
nothing replaces it.

Not re-verified this pass, carried forward from the charter and still owed before
a tag: the 2510 portable-artifact findings and the 19 clean-install audit
findings. `npm whoami` returning E401 is not a blocker — publish is
tag-driven Trusted Publishing/OIDC, so no local login is expected.

---

## R2 — Raw NUL bytes in tracked sources — **RESOLVED THIS PASS**

The charter recorded 2 raw NUL bytes in one file. **That understated it.** A
byte-level sweep of every tracked text source found **13 raw NUL bytes across 6
files**, all used as composite-key or hash delimiters:

| File | NULs | First offset | Merge broken? |
|---|---|---|---|
| `src/ontology-class-hierarchies-emitter.ts` | 4 | 4149 | **yes** |
| `src/search-index-emitter.ts` | 1 | 7176 | **yes** |
| `tests/sanitize-metadata.test.ts` | 2 | 850 | **yes** |
| `src/extract.ts` | 2 | 241837 | no |
| `src/ontology-studio.ts` | 2 | 12122 | no |
| `studio/src/lib/graphAdapter.js` | 2 | 45487 | no |

**A second correction.** The charter expected `src/ontology-studio.ts` to have
broken 3-way merge. It had not: git's binary sniff only inspects the first 8000
bytes, and that file's NULs sit at 12122. Verified empirically —
`git diff --numstat` reported `1 1` (textual) for it, and `- -` (binary) for the
three files above, whose NULs fall inside the window. So the feared
merge-impossibility was real, but in three files the charter never named.

**Remediation applied** (commits `b8c693b0`, `4bb1073f` on
`cyber/nul-escape-ontology-studio`): each raw byte replaced with the equivalent JS
escape. Behaviour-identical by construction — inside a string or template literal
the escape denotes the same U+0000 code unit, so every cache key and hash digest
fed from these strings is byte-for-byte unchanged. This mattered for the emitter,
whose NULs are fed to a cache-identity hash.

Scope deliberately minimal: NUL only. `tests/sanitize-metadata.test.ts` still
holds raw `0x1F`/`0x7F` fixtures and
`src/ontology-class-hierarchies-emitter.ts` uses raw `0x01` as a projection
delimiter. Neither triggers binary classification — verified, plain `grep` reads
both files correctly now — so they are legibility debt, not a tooling hazard, and
changing the emitter's `0x01` would alter hash inputs and invalidate caches.

**Verification, at the level of effect rather than file content:**

- `tsc --noEmit` clean.
- Root suite: 2438 passed, 2 failed — the 2 pre-existing ones, proven unchanged by
  re-running them on a stashed pristine tree (identical failures).
- Post-commit, the three formerly-binary files now diff as `2 0` (text): **3-way
  merge is restored**.
- The guard test failed against the pre-fix tree, listing all 6 files.

---

## R3 — The tooling trap: `grep` lies, and at least one document rests on it

**Root cause — corrected 2026-07-31, an earlier revision of this file blamed the
wrong component.** It is not ugrep's own binary handling. `grep` here is not a
binary at all: it is a **shell function** that calls ugrep 7.5.0 with a fixed
flag set that includes **`-I`** (skip binary files). Measured on a two-line
probe file carrying one NUL and two matches:

| invocation | result |
|---|---|
| `grep -c MARKER` (the wrapper) | no output, exit 1 |
| `command grep -c MARKER` (bare ugrep) | **2**, exit 0 |
| `command grep -Ic MARKER` | 0, exit 1 |
| `command grep -ac MARKER` | 2, exit 0 |

So ugrep reads a NUL-bearing file perfectly well; **`-I` alone destroys the
result**, and the wrapper injects it. The failure is silent and total across
modes — `-n`, `-c`, `-l`, bare, and `-r`, which drops the offending file without
a word while still succeeding on every other file. That last mode is the worst
case, because the command looks like it worked.

One earlier claim in this file also over-reached and is withdrawn: "a file can
read as normal text in `git diff` and still be invisible to grep" was not true of
`src/extract.ts`, where `git ls-files --eol` did flag it (`i/-text`). The
operative rule is unchanged: **`-a` always**, and no conclusion of absence
without it.

**Verified closed.** `grep -n _makeId src/extract.ts` now returns line 112 —
the exact symbol a previous pass concluded did not exist. It was always there;
the tool was lying. Post-fix, the only tracked file that still disagrees between
`grep` and `grep -a` is `docs/assets/studio.png`, a genuine image. No tracked
text source lies any more.

**Structural prevention** (`tests/source-nul-hygiene.test.ts`): fails the build on
any raw NUL in a tracked text source, reporting each byte offset and whether it
falls inside git's sniff window.

**Introduction vector, recorded because it is easy to repeat.** An agent tool
whose parameters are JSON decodes an escaped NUL in a string payload into a real
byte before it reaches disk. I did exactly that while writing the guard test, and
the harness `Edit` tool additionally round-trips a raw NUL as a space, so editing
these lines through it silently reverts them. This is why the fix was applied by
an explicit byte-level codemod with a diff review, not by hand.

**Residual, and the reason this stays open.** `UPSTREAM_GAP.md:105` states that
language-gap rows "were verified by **reading** `src/extract.ts`, not by running
extraction" — that is, verified against a file that was silently lying to `grep`
at the time. `UPSTREAM_GAP.md:70` already records one census fact about
`src/extract.ts` being superseded. I am **not** claiming specific rows are wrong;
I am reporting that their verification method was unsound, so every `must-audit`
row grounded that way is **unproven** and needs one re-read now that `grep` tells
the truth. Owner: whoever owns the upstream-parity census, not CONTROL.

**Rule to enforce, repo-wide:** any "not found in `<file>`" conclusion is
UNPROVEN unless produced with `grep -a`.

---

## R4 — Test debt: 5 pre-existing failures, now root-caused

Confirmed as exactly 5, in two separate vitest projects — which is why a single
`npm test` at root only ever shows 2 of them:

- **Root suite (2)** — `tests/agent-stats-h2a-evidence.test.ts`: an h2a registry
  instance is not matched to an in-project session (`expected [] to have length 1`),
  and a historical-alias Agent node's label is `undefined`. Reproduced identically
  on pristine `main`.
- **Studio suite (3)** — `studio/src/tests/pickingBackendAgnostic.test.js`: all
  three fail with the *same* cause, `context.uniformMatrix4fv is not a function`
  at `packages/graph/src/renderer.ts:482` (`bindCameraUniforms`). This is a
  **test-double gap, not a product defect**: the mat4 migration made the renderer
  call `uniformMatrix4fv`, and the jsdom WebGL mock was never extended to provide
  it.

**Smallest safe remediation.** The 3 studio failures are one test-only change —
add `uniformMatrix4fv` (and its siblings) to the jsdom WebGL mock. No product
code, no release risk. The 2 root failures are genuine behaviour and need the
agent-stats owner. Note the studio project needs its own `studio/node_modules`;
a worktree with only the root one symlinked cannot run it and will look green.

A permanently-red baseline erodes the signal, and stash-and-recheck is correct
discipline but is not a fix.

---

## R5 — Worktree sprawl: 56 worktrees, inventoried before any deletion

Cleanup is safe **only** with this inventory, because most of these hold work
that exists nowhere else. Counted 56 (it grew from 53 during this pass — other
agents are active, so re-measure before acting).

- **32 branches carry commits not in `main`** — deleting these loses work.
  Largest: `integration/five-wp` (63), `feat/wp4-sources-live` (40),
  `feat/aclp-ontology-studio` (33, 12 dirty), `feat/gitflow-labels` (17),
  `pr/c-graphrag-phase-a` (14).
- **16 are at 0 ahead of `main` and clean** — safe to prune. Includes
  `cyber/nul-byte-hygiene`, a predecessor CONTROL branch that is byte-identical
  to `main` and contains no work.
- **1 is at 0 ahead but dirty** — `b1-phase5-perf-lod` (2 uncommitted files). Hold.
- **7 are detached HEADs** needing individual judgement.

Measured against **local** `main`; if local `main` trails `origin/main` the
"ahead" counts overstate unmerged work, so refresh before pruning. Removing a
worktree does not delete its branch — prune worktrees first, delete branches only
as a separate, deliberate step.

---

## R6 — Scale ceiling: lexical reconciliation does not terminate (ARBITRATION)

Carried from the charter, not re-measured this pass. The lexical reconciliation
tiers are O(n^2) and **do not terminate** on a 40k-node corpus (baseline killed
after 15+ minutes). Inverted-neighbour blocking already exists in the structural
tier and is fast there (38669 pairs in 147 ms).

This is an **architecture arbitration, not a CONTROL decision**: lifting the
blocking strategy into the lexical tiers changes which candidate pairs are ever
compared, and therefore changes reconciliation output. It needs the owner of
reconciliation semantics to rule on acceptable recall loss. Recorded here so it
is not mistaken for a bug someone may quietly "fix".

---

## Standing rules this ledger enforces

1. Never `npm audit fix --force`.
2. Any "not found in `<file>`" conclusion is unproven without `grep -a`.
3. Quantify before proposing; state exploitability, not just severity.
4. A finding that cannot be fixed without a breaking change is **documented and
   escalated**, never silently applied.
5. A test that does not fail against the old code proves nothing.
6. Verify the effect, not the file: for a merge hazard read `git diff --numstat`;
   for a grep hazard re-run the search that previously lied.
7. Re-measure `npm audit` at tag time. Never quote a previous pass.
