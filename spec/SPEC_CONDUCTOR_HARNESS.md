# SPEC_CONDUCTOR_HARNESS

## Status

- Product: Graphify conductor workflow
- Scope: operational harness for WP0-WP8 coordination
- Source of truth: `track`, workspace `graphify-conductor`
- Current trigger: WP8, "Harness migration out of superpowers rituals"
- Non-goal: changing Graphify runtime code, CI config, or agent skills

This document replaces implicit superpowers rituals with explicit conductor gates. It is a short runbook: a conductor should be able to resume a session, verify delegated work, decide whether to integrate, and know when a human decision is required.

## Binding Source Of Truth

`track` owns work state. Specs, plans, h2a messages, tmux panes, git branches and CI runs are evidence, not authority.

Minimum track contract:

- Each WP has one `track` row in workspace `graphify-conductor`.
- Delegated workers report against the WP id, not against ad-hoc chat labels.
- `realization` says what the worker claims: `to-do`, `in-progress`, `done`, `cancelled`, or `rejected`.
- `acceptance` says what the conductor has verified: `unknown`, `pass`, `fail`, `stale`, or `waived`.
- DONE is counted only when `realization=done` and `acceptance=pass`, unless the user explicitly waives acceptance.
- Decisions that affect scope, sequencing, or release gates are recorded as `track` decisions.

Conductor baseline query:

```sh
git rev-parse HEAD
track report --commit <HEAD> --decisions --require-accepted
```

If the MCP surface is used instead of the CLI, call `track_report` with the current HEAD, `decisions=true`, and `requireAccepted=true`.

## Ritual-To-Gate Map

| Old ritual | Explicit harness gate | Required evidence |
| --- | --- | --- |
| "Use superpowers / subagents" | `track` row selected, scope and acceptance criteria named | WP id, workspace, expected files/tests |
| "Dispatch agents" | Delegation wave opened | Worker target, branch/worktree, mandate, deadline/checkpoint |
| "h2a says peer is live" | Presence gate only | h2a session heartbeat or inbox delivery status |
| "Worker is working" | Native-live gate | tmux pane, CLI process, recent git diff, or worker report |
| "Plan checklist complete" | Integration gate | diff review, local verification, CI status, graph freshness when code changed |
| "Resume from memory" | Resume gate | `track` report, git status, h2a/tmux inventory, last CI run |
| "Ask user what next" | User-decision gate | exact decision requested, options, default recommendation |

The conductor does not treat any chat transcript or skill checklist as authoritative unless it is reflected in `track` or attached as evidence to a `track` item.

## Liveness Model

### h2a-presence-live

h2a live means a peer has a fresh h2a presence session and can receive push notifications now. It is a delivery signal only.

Use it for:

- discovering reachable peers;
- routing messages and negotiation artifacts;
- confirming that an inbox delivery was live rather than deposited for wake;
- signed negotiation or cross-repo agreement when needed.

Do not use it to infer that a worker is idle, blocked, or actually executing. A headless `codex exec`, native CLI, or tmux worker may be doing valid work without h2a presence.

### tmux/native-live

tmux/native live means there is observable execution state outside h2a: a tmux pane, long-running command, CLI process, worktree diff, log stream, CI run, or recent worker report.

Use it for:

- preventing duplicate delegation;
- deciding whether to wait, interrupt, or resume a worker;
- collecting terminal logs and verification output;
- distinguishing "not reachable over h2a" from "not working".

Before reassigning a WP, check both gates. If h2a is not live but tmux/native is live, leave the worker alone and deposit an h2a wake message if useful.

## Delegation Wave

A delegation wave is a bounded batch of independent WP assignments. The conductor owns the wave; workers own their local implementation.

Open a wave:

1. Run the baseline `track` report and identify rows in `TO-DO` or `AWAITED`.
2. Confirm dependencies and conflicts between WPs. Do not delegate two workers to the same files unless the conflict is intentional.
3. Assign each worker a WP id, branch/worktree, allowed write scope, acceptance criteria, and reporting format.
4. Record the delegation in `track` before or immediately after sending h2a/native instructions.
5. Ask workers to report: files changed, tests run, risks, and whether a graph rebuild was needed.

During a wave:

- Poll `track` first, then h2a presence, then tmux/native state.
- Prefer worker reports tied to WP ids over chat summaries.
- Mark `acceptance=stale` when the branch base, CI result, or graph state no longer matches the report.
- Mark `acceptance=fail` when the conductor has reproduced a blocker or regression.

Close a wave:

1. For each claimed-done WP, inspect diff and evidence.
2. Run the integration gates below.
3. Set `acceptance=pass` only after verification.
4. Leave incomplete WPs in `in-progress` or `to-do`; do not convert uncertainty into DONE.

## Resume Procedure

Run this sequence at the start of any conductor session or after context loss:

1. Establish repository state:

   ```sh
   git status --short --branch
   git rev-parse HEAD
   ```

2. Rebuild the work board from `track`:

   ```sh
   track report --commit <HEAD> --decisions --require-accepted
   ```

3. Check graph freshness before relying on graph semantics:

   ```sh
   test -f .graphify/needs_update && echo stale
   graphify summary --graph .graphify/graph.json
   ```

4. Inventory live coordination:

   ```sh
   h2a sessions --root .h2a
   tmux ls
   ```

5. Inventory integration state:

   ```sh
   gh run list --branch <branch> --limit 5
   ```

6. Reconcile facts in this order: `track` state, git state, CI state, h2a/tmux state, then chat/session memory.

If those sources disagree, do not guess. Keep the WP out of DONE, mark stale or blocked evidence in `track`, and ask the user only when the conflict changes scope or requires authority.

## Integration Gates

Every WP that can affect the product must clear these gates before conductor acceptance.

### Gate 1: Scope

- Changed files match the WP write scope.
- No unrelated refactor, generated churn, or hidden source changes.
- For docs-only WPs, no source code or CI config changed.

### Gate 2: Diff Review

- The conductor reads the diff, not only the worker summary.
- Public contracts, CLI flags, specs, and user-facing behavior are checked against existing conventions.
- Risky assumptions are either verified or called out in `track`.

### Gate 3: Local Verification

- Source changes: run the targeted tests first, then the repo gate expected for the touched surface.
- Shared/runtime changes: include `npm test`, `npm run lint`, and `npm run build` unless a narrower gate is explicitly justified.
- Docs-only changes: run a Markdown/self-review pass and confirm no forbidden paths changed.
- After code changes, run `npx graphify hook-rebuild` and verify graph freshness.

### Gate 4: CI

- The branch CI must be green before final integration unless the user explicitly accepts a waiver.
- Failed or missing CI keeps acceptance at `unknown` or `fail`.
- A stale CI run does not count after new commits land.

### Gate 5: Track Acceptance

- Set `acceptance=pass` only after Gates 1-4 are satisfied.
- Use `waived` only for an explicit user decision.
- Use `stale` when evidence was once valid but no longer matches current HEAD, branch, graph, or CI.

## When To Ask The User

Ask the user when the conductor lacks authority, not when the next verification step is merely tedious.

Required user gates:

- Scope change: WP boundaries, file ownership, or acceptance criteria need to change.
- Product decision: behavior, public contract, release vehicle, or dependency policy is ambiguous.
- Waiver: CI, tests, graph freshness, or review evidence cannot be completed but integration is still requested.
- Destructive action: reset, force-push, deletion, branch rewrite, or reverting someone else's work.
- External authority: credentials, paid services, publish/release, production resources, or network access that is not already approved.
- Conflict: two workers produced incompatible outputs and the correct product direction is not derivable from specs/track.

Do not ask the user merely because h2a presence is absent, a worker is slow, or a local test needs to be run.

## Minimal Done Definition

For a WP to be conductor-DONE:

- `track` row is `realization=done`;
- `acceptance=pass` or an explicit user waiver exists;
- integration gates are recorded with concrete evidence;
- h2a/tmux/native worker state has no unmerged or duplicated live work for the same WP;
- CI status is green or waived;
- graph freshness is current when code changed.

Anything else is still in progress, stale, failed, or awaiting a user decision.
