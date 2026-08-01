# Release gate — vulnerability dossier (CONTROL)

For the principal. Self-sufficient: no other document needs reading to decide.

Measured on `origin/main` at **4178a51a**, 2026-07-31. Every number carries the
command that produced it, because two of the numbers in circulation this week
were not reproducible between tools.

**Verdict.** Nothing here blocks a merge. **One decision is owed before any
publish/tag**, and it is small: a single LOW advisory with no available fix.
Everything else is either fixable by a plain, non-forced `npm audit fix`, or is
dev-only and never reaches a consumer. The four "high" findings that reach the
production tree are, on inspection, **not reachable** in how this package is
actually used — but that judgement is mine to present, not to impose.

---

## 1. The 28-vs-21 discrepancy, reconciled

Both tools are right. They count **different units** over **different scopes**,
so the numbers were never comparable.

**Unit.** Dependabot emits one alert per *(advisory × manifest)*. `npm audit`
emits one entry per *package node*, folding every advisory of that package into
one `via` list — and additionally flags parent packages that merely *depend on*
a vulnerable child, which carry no advisory of their own.

**Scope.** Root `package.json` declares **no `workspaces`**, so a root
`npm audit` reads `package-lock.json` and **never opens `studio/package-lock.json`**.
Dependabot scans every manifest in the repo.

The arithmetic closes exactly:

| | count | why |
|---|---|---|
| Dependabot, root manifest | **23** | 23 advisories over 14 distinct packages (hono 8, fast-uri 2, vite 2, eleven others ×1) |
| Dependabot, `studio/` manifest | **5** | 4 packages, **all `scope=development`** |
| **Dependabot total** | **28** | 23 + 5 |
| `npm audit` root, full | **21** | the same 14 packages **+ 7 contaminated parents** with no advisory of their own |
| `npm audit` root, `--omit=dev` | **18** | drops the dev-only packages |

The 7 contaminated parents, named so the gap is not mysterious:
`@google-cloud/opentelemetry-resource-util`, `@google-cloud/spanner`,
`@modelcontextprotocol/sdk`, `@opentelemetry/resources`,
`@opentelemetry/sdk-metrics`, `gaxios`, `ollama-ai-provider`.

High counts reconcile the same way: dependabot's 10 high = 7 root + 3 studio;
root's 7 collapse to `npm audit`'s 6 because fast-uri's two advisories are one
package.

**Note on drift.** The conductor read **25 (7 high)** at push time; the same
query now returns **28 (10 high)**. The alert set moves on its own as advisories
are published. **A gate number is only meaningful with its command and commit.**

### Which one governs

**Neither raw count.** A publish ships `files: ["dist","src/skills"]` and
`bin: dist/cli.js`; `studio` is `private: true` and is never published as a
package. So the gate is:

- **`npm audit --omit=dev` at root = 18 (4 high)** is the *starting* unit — it is
  what a consumer installs — then corrected for actual reachability (§2).
- **`studio/` gets its own separate gate**, governing *build integrity*, not the
  consumer artefact. It is currently ungated (§4).

---

## 2. What ships, ranked by exploitability × blast radius

Reachability was resolved from `package-lock.json` (dev/optional flags per node)
and from how the code actually calls these libraries — not from CVE text.

**Decisive finding: three of the four "production highs" are `optional`
dependencies, and the two heaviest are not reachable at all.**

| Advisory | Package | Reaches a consumer? | Real exploitability | Smallest safe action | Consequence if not done | Reversibility | Reco |
|---|---|---|---|---|---|---|---|
| GHSA-96hv-2xvq-fx4p | `ws` (high) | Yes — mandatory prod tree, pulled by `@mistralai/mistralai` | **Not reachable.** The advisory is a *server-side* memory-exhaustion DoS. We never run a ws server: our only direct uses are CDP **clients** in `packages/graph/tests/golden/*.mjs`, and Mistral's SDK uses ws as a client. An attacker would have to *be* the Mistral endpoint. | `npm audit fix` → `ws@8.21.0` | None in practice; keeps a known-high in the tree and in every future scan | Fully reversible (lockfile only) | **Fix** — free |
| GHSA-3jxr-9vmj-r5cp, GHSA-mh99-v99m-4gvg | `brace-expansion` (high) | Optional-only, via `minimatch` | Low. OOM/exponential expansion where the input is **the user's own repo path set** — self-DoS, not a third-party attack path | `npm audit fix` → `2.1.2` | A user with a pathological glob can OOM their own run | Fully reversible | **Fix** — free |
| GHSA-v2hh-gcrm-f6hx, GHSA-4c8g-83qw-93j6 | `fast-uri` (high ×2) | Optional-only, via `ajv` | Low. Host confusion matters only where a URI drives an **allow-list decision**; here ajv uses it for schema `$id`/format validation | `npm audit fix` → `3.1.4` | Theoretical schema-id confusion | Fully reversible | **Fix** — free |
| GHSA-88fw-hqm2-52qc (+7 more) | `hono`, `@hono/node-server` (1 high, 7 moderate) | Optional-only, via `@modelcontextprotocol/sdk` (itself optional) | **Not reachable.** Every one of these advisories needs hono's **HTTP** path (CORS middleware, `hono/jsx`, `serve-static`). `src/serve.ts` runs the MCP server over **`StdioServerTransport`** — stdio, not HTTP. The HTTP adapter is never instantiated. | `npm audit fix` → `hono@4.12.27`, `@hono/node-server@2.0.5` | None in current usage; becomes live the day an HTTP MCP transport is enabled | Fully reversible | **Fix** — free, and it pre-empts the day someone enables HTTP transport |
| GHSA-8988-4f7v-96qf | `@opentelemetry/core` (moderate) | Optional-only (GCP/Spanner backend) | Low — unbounded allocation in W3C Baggage propagation; only with the optional Spanner backend configured | `npm audit fix` → `2.8.0` | Only affects opt-in Spanner users | Fully reversible | **Fix** |
| GHSA-j3f2-48v5-ccww | `protobufjs` (moderate) | Optional-only (GCP) | Low — infinite loop parsing `.proto` **options**; we do not parse third-party `.proto` | `npm audit fix` → `7.6.5` | Negligible | Fully reversible | **Fix** |
| GHSA-w5hq-g745-h8pq | `uuid` (moderate) | Optional-only, via `gaxios` | Low — missing bounds check in v3/v5/v6 **only when `buf` is passed**; callers here do not | `npm audit fix` → `11.1.1` | Negligible | Fully reversible | **Fix** |
| GHSA-frvp-7c67-39w9 | `@hono/node-server` (moderate) | Optional-only | Not reachable (same stdio argument) | `npm audit fix` → `2.0.5` | None currently | Fully reversible | **Fix** |
| GHSA-v422-hmwv-36x6 | `body-parser` (low) | Optional-only | Low — invalid `limit` silently disables size enforcement; we do not configure it | `npm audit fix` → `2.3.0` | Negligible | Fully reversible | **Fix** |
| GHSA-4x5r-pxfx-6jf8 | `@babel/core` (low) | Optional-only (via Spanner) | Low — arbitrary file read via `sourceMappingURL`, build-shaped | `npm audit fix` → `7.29.6` | Negligible | Fully reversible | **Fix** |
| **GHSA-866g-f22w-33x8** | **`@ai-sdk/provider-utils` (low)** | **Yes** — nested `2.2.8` pinned under `ollama-ai-provider` (a *direct* dependency) | Low — uncontrolled resource consumption. Only live when the **Ollama provider** is used, i.e. against a local endpoint the user runs themselves | **NO FIX EXISTS** for the 2.x line that `ollama-ai-provider@1.2.0` pins. See §3. | A known LOW rides into every published version and every future scan | n/a | **Decision required** |

Everything in this table except the last row is closed by one non-forced
`npm audit fix`. **`npm audit fix --force` is never acceptable here** — it is
permitted to cross a semver major and would silently change published behaviour.

---

## 3. The one decision that is the principal's

**Subject.** A single LOW advisory, `GHSA-866g-f22w-33x8`, has **no patched
version** on the line we depend on. It is not remediable — only accepted or
removed.

**Precision that matters.** Earlier I reported this as "two LOW advisories with
no fix". That was the `npm audit` counting unit talking. There is **one**
advisory. `npm audit` lists `ollama-ai-provider` alongside it only because that
package is the *contaminated parent* that pins the vulnerable
`@ai-sdk/provider-utils@2.2.8`; the top-level `@ai-sdk/provider-utils@4.0.27` is
**not** affected. Dependabot, which alerts only on the genuinely vulnerable
package, raises exactly one alert.

**Options.**

- **(a) Accept formally, with an expiry.** Reversible at any moment. The
  exposure is a LOW resource-consumption issue reachable only when a user drives
  the Ollama provider against their own local endpoint. Cost: a known LOW is
  inherited by the tag.
- **(b) Drop `ollama-ai-provider`.** Removes the advisory outright and removes a
  product capability (local Ollama inference). Not reversible without restoring
  the capability.

**Recommendation: (a), recorded with an expiry date, not accepted informally.**
The exposure does not justify removing a feature. But per the harness security
contract an acceptance must be a checked-in row with stable advisory identity,
affected version, component, path, owner, rationale, `review_by` (UTC) and a
removal plan — so that it **expires and fails the gate** rather than quietly
becoming permanent. That register does not exist yet (§4).

I am **not** deciding this. I record that (a) is defensible and that an
acceptance without an expiry is the one form I would object to.

---

## 4. Coverage gaps — surfaces nothing currently scans

Per the harness security contract, an unscanned surface is a **gap**, never an
exception. Four exist today:

1. **`studio/package-lock.json` is outside the root gate.** No `workspaces`
   declaration means root `npm audit` never reads it. It holds 5 alerts, 3 high,
   including one **nobody in this thread had seen**: `form-data`
   **GHSA-hmw2-7cc7-3qxx** (high, CRLF injection, `>=4.0.0 <4.0.6`, fixed in
   `4.0.6`). All 5 are `scope=development`, so they gate **build integrity**, not
   the consumer artefact — but "not in the publish gate" must be a stated
   decision, not an accident of a missing config line.
2. **`packages/graph/package.json` and `forward/graphifyy/package.json` have no
   lockfile**, so neither tool resolves a tree for them. Coverage there is
   **unknown**, which is not the same as clean.
3. **`dist/` is a bundled artefact.** `tsup.config.ts` sets
   `external: optionalRuntimeDeps`, so non-optional runtime dependencies are
   **inlined into `dist/cli.js`**. A dependency scanner reads the package tree,
   not the bundle: a vulnerable inlined copy is invisible to `npm audit`.
4. **No `.security/vulnerability-register.yaml` exists**, so there is nowhere for
   §3's acceptance to live with an expiry, and nothing fails when one lapses.

---

## 5. Out of the gate: dev-only, named as instructed

Reach no consumer; listed so they are excluded **deliberately**:

- Root: `postcss` (high, GHSA-r28c-9q8g-f849), `vite` (high GHSA-fx2h-pf6j-xcff +
  moderate), `esbuild` (low) — all `scope=development`.
- `studio/`: `postcss` (high), `vite` (high + moderate), `esbuild` (low),
  `form-data` (high) — all `scope=development`.

Both `vite` advisories are Windows-only dev-server issues; this project builds on
Linux CI.

---

## 6. Reproduce every number here

```
git fetch origin && git switch --detach 4178a51a
npm audit --json                 # 21 (6 high) — package nodes, incl. contaminated parents
npm audit --omit=dev --json      # 18 (4 high) — what a consumer installs
gh api "repos/rhanka/graphify/dependabot/alerts?state=open&per_page=100"
                                 # 28 (10 high) — advisory × manifest, incl. studio/
```

`studio/` must be audited from inside `studio/`; the root command cannot see it.

---

## 7. CONTROL posture

No veto on any merge — none of this concerns merged work.

I maintain the veto on **publish/tag** until both hold:

1. a plain `npm audit fix` (never `--force`) has run with the suite green, and
2. `GHSA-866g-f22w-33x8` is either removed or **formally accepted with an expiry
   date**, not accepted informally.

Both are the principal's to authorise. I audit; I do not sign.
