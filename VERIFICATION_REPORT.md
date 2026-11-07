# Verification report — five-wp + WP2 integration

## Scope and verdict

Verified in `/home/antoinefa/src/graphify/.worktrees/verify-five-wp-wp2` on
`verify/five-wp-plus-wp2` at `9fb25b3855e9d4fade522a3b09f4e8bece323285`.
`origin/main` resolved to `54d771aea8b1b5feb8e3f13f49f8f41eafd83632`.

**Verdict: PASS relative to `origin/main`; safe to present to the principal for
the merge decision with the documented baseline exception below.** There is no
candidate-specific build, typecheck, test, CLI-parse, or checked collision
regression. The standalone studio suite is not absolutely green, but its three
failures reproduce unchanged on a fresh detached `origin/main` worktree, so
they are **pre-existing** and do not block this integration decision.

The only blocker to an *unconditionally green* test claim is that inherited
studio/jsdom WebGL test failure: `context.uniformMatrix4fv is not a function`.
It requires baseline repair, not an integration rollback.

## Dependency installation

`package.json` and `studio/package.json` each have a matching lockfile, so I
used their reproducible installs:

```text
$ npm ci
added 488 packages, and audited 489 packages in 4s
21 vulnerabilities (5 low, 10 moderate, 6 high)

$ npm ci --prefix studio
added 138 packages, and audited 139 packages in 2s
4 vulnerabilities (1 low, 3 high)
```

Both commands exited successfully. npm also warned that some install scripts
were pending `allowScripts` approval; the required builds and tests nevertheless
ran successfully with the installed dependency tree.

## Typecheck and builds

| Command | Observed result |
| --- | --- |
| `npx tsc --noEmit` | Exit 0. Its only output was npm's `globalignorefile` deprecation warning. |
| `npm run lint` | Exit 0; ran `tsc --noEmit`. |
| `npm run build` | Exit 0. Built `packages/graph`, root ESM/CJS/DTS, and the studio production and single-file bundles. |
| `npm --prefix studio run build` | Exit 0; Vite transformed 4,239 modules and emitted `studio/dist/index.html` plus assets. |

The root build emitted five existing tsup CJS `import.meta` warnings and the
studio build emitted two Svelte non-reactive-update warnings for `canvas` and
`settingsHost`; neither command failed.

I inspected the emitted artifact rather than relying on build exit status:

```text
$ node scripts/assert-studio-app.mjs
assert-studio-app: OK (.../dist/studio-app/index.html present).

$ find dist/studio-app -maxdepth 2 -type f
assets/index-BdSdCeUU.css 123861 bytes
assets/index-d_Vy9-2C.js 381882 bytes
assets/layoutWorker-R3M9r_h0.js 3317 bytes
assets/pdf-gh-BrLFn.js 334783 bytes
assets/pdf.worker.min-DgRcL-GR.js 93 bytes
assets/pdf.worker.min-yatZIOMy.mjs 1375838 bytes
index.html 448 bytes
studio-template.html 2676121 bytes

$ grep -a -o -m 1 '<title>[^<]*</title>' dist/studio-app/studio-template.html
<title>Graphify Ontology Studio</title>

$ grep -a -o -m 1 'id="app"' dist/studio-app/index.html
id="app"
```

## Test results

### Root and graph packages

`npm run test:all` ran the root Vitest suite followed by `npm run test:smoke`.
The root suite reported:

```text
Test Files  266 passed | 4 skipped (270)
     Tests  2619 passed | 15 skipped (2634)
```

No root test failed. The smoke command was rerun separately after the combined
log ended and completed successfully; its observed output included:

```text
graphify pre-publish smoke test
  ✓ Build succeeded
Step 2: Run tests...
```

The separately declared graph-package suite also passed:

```text
$ npm --prefix packages/graph run test
Test Files  23 passed (23)
     Tests  330 passed (330)
```

The supplied brief's historical control was 2,438 passed / 2 failed. The
candidate's observed root count is therefore different (2,619 passed / 0
failed / 15 skipped); this difference is recorded as requested, not treated as
a failure.

### Standalone studio suite and required baseline comparison

Candidate command:

```text
$ npm --prefix studio test
Test Files  1 failed | 36 passed (37)
     Tests  3 failed | 611 passed (614)
```

All three failures are in `src/tests/pickingBackendAgnostic.test.js`:

1. `the renderer exposes NO picking / hit-test / readPixels API on EITHER backend`
2. `the CPU hit-test returns the SAME node under canvas2d and webgl for every cursor`
3. `a cursor dead-centre on each node picks THAT node, independent of backend`

The observed failure is `TypeError: context.uniformMatrix4fv is not a function`
at `packages/graph/src/renderer.ts:482`, following jsdom's
`HTMLCanvasElement.prototype.getContext` “Not implemented” diagnostic.

Per the brief, I created a detached scratch worktree at `origin/main`, installed
both lockfiles, rebuilt it, and ran the **same** command. It reported:

```text
$ npm --prefix studio test   # detached origin/main at 54d771ae
Test Files  1 failed | 27 passed (28)
     Tests  3 failed | 479 passed (482)
```

It failed on the same three test names and the same `uniformMatrix4fv` error.
This proves the three studio failures are pre-existing. The scratch worktree was
removed with `git worktree remove --force` after comparison.

## Focused work-package evidence

| Work package | Result | Focused evidence actually run |
| --- | --- | --- |
| WP1 — de-orphan topology | **PASS** | `npx vitest run tests/assembly-hygiene.test.ts tests/deorphan-attachment-policy.test.ts`: **2 files, 44 passed**. |
| WP2 — structural reconciliation | **PASS** | `npx vitest run tests/ontology-reconciliation-structural.test.ts`: **1 file, 19 passed**; its `ontology candidates --structural` CLI surface also parsed successfully. |
| WP3 — studio windowed paint | **PASS** | Studio `sceneLoader`, `windowScene`, and `windowedFirstPaint` tests: **3 files, 28 passed**. Root/studio builds and the emitted studio artifact also passed inspection. |
| WP4 — sources live | **PASS** | Root source/provenance tests: **6 files, 88 passed**; studio cited-source/HTML/viewer tests: **4 files, 75 passed**. `ontology studio --sources-root` parsed successfully. |
| WP5 — graph time slice | **PASS** | `cli-graph-time-slice` and `graph-time-slice`: **2 files, 28 passed**; `time-slice --help` parsed and listed its bounds, source, output, force, and JSON options. |
| WP6 — track F residual | **PASS** | `node-id-unicode.test.ts`: **1 file, 11 passed**; `query --help` parsed successfully. |

No work package is marked NOT-COVERED-BY-TESTS: each has focused test coverage
that passed in this candidate.

## Collision-surface checks

### `src/cli.ts`

The candidate's diff from `origin/main` is `119` additions and `24` deletions
in `src/cli.ts`. I inspected the contributing commits and then ran this compiled
CLI parse check (exit 0):

```text
$ node dist/cli.js ontology candidates --help
... --structural  Also emit the LOWEST-confidence structural tier ...

$ node dist/cli.js ontology studio --help
... --store <id>          GraphStore backend id to serve group counts and the
                          first-paint window ...
... --sources-root <dir>  Root the cited-source route ...

$ node dist/cli.js time-slice --help
Usage: graphify time-slice [options]
... --since, --until, --graph, --config, --out, --force, --json

$ node dist/cli.js query --help
Usage: graphify query [options] <question>
```

The merged CLI is coherent:

- WP1 adds no CLI surface.
- WP2 retains `ontology candidates --structural`.
- WP3 retains the `ontology studio` window-capable `--store` path.
- WP4 retains `ontology studio --sources-root` for live cited sources.
- WP5 retains the `time-slice` subcommand.
- WP6 retains the `query` command modified for Unicode-safe shared tokenisation.

### `studio/src/lib/graphAdapter.js` (NUL-bearing)

I did not edit this file. I rendered the relevant merged regions with `cat -v`
and located symbols with `grep -a` (never bare grep). The two branch changes are
both present and non-overlapping:

- WP3's `buildWindowScene()` converts the bounded store window through
  `buildScene`, preserves/derives layout, and sets `stats.windowed: true` plus
  `stats.windowLimit`.
- WP4's `citationPage()` normalises a citation page to numeric-or-null, and
  `citationsByFileFrom()` calls `page: citationPage(c?.page)`.

The file exports `buildWindowScene` and contains both the window markers and the
citation conversion. Together with WP3's 28 focused tests and WP4's 163 focused
tests, this is coherent merge evidence; no collision defect was found.

## Retained changes

The verification builds changed `src/workspace/tokens-st-css.generated.ts`; I
restored it to the tracked version. The only retained worktree change is this
`VERIFICATION_REPORT.md`. No source fixes, merge, push, tag, publish, or commit
was performed.
