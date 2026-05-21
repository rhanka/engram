# Track G Design System Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Track G workspace consume the real `@sentropic/design-system` token library instead of silently staying on Graphify fallback tokens.

**Architecture:** Keep the existing adapter boundary: Graphify UI components consume `WorkspaceTokens`, while `tokens-ds.ts` maps external design-system exports into that local contract. The package remains usable without the DS dependency; fallback tokens stay as an explicit degraded mode with tests proving which source was used.

**Tech Stack:** TypeScript, Vitest, dynamic ESM import, optional dependency typing, existing `src/workspace/*` renderer stack.

---

## File Structure

- `src/workspace/tokens.ts`: extend the token source metadata contract without changing the existing token groups.
- `src/workspace/tokens-ds.ts`: map and validate the actual `@sentropic/design-system/tokens` export shape.
- `src/workspace/tokens-fallback.ts`: keep fallback as the deterministic safety net.
- `src/workspace/index.ts`: export the resolved-token API used by shell/bootstrap code.
- `tests/workspace-tokens.test.ts`: cover DS present, DS missing, invalid DS, and fallback behavior.
- `src/types/optional-deps.d.ts`: keep type-only shim in sync with the DS public export.
- `package.json`: add `@sentropic/design-system` as an optional peer/optional dependency only after the package/export exists.

### Task 1: Make Token Source Observable

**Files:**
- Modify: `src/workspace/tokens.ts`
- Modify: `src/workspace/tokens-fallback.ts`
- Modify: `src/workspace/index.ts`
- Test: `tests/workspace-tokens.test.ts`

- [ ] **Step 1: Write the failing source-metadata test**

```ts
it("reports fallback token source when the design system is unavailable", async () => {
  const resolved = await resolveWorkspaceTokens("dark");
  expect(resolved.source).toBe("fallback");
  expect(resolved.tokens.colour.surface).toBe(getWorkspaceTokens("dark").colour.surface);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workspace-tokens.test.ts`
Expected: FAIL with `resolveWorkspaceTokens is not defined` or missing `source`.

- [ ] **Step 3: Add the resolved-token contract**

```ts
export type WorkspaceTokenSource = "design-system" | "fallback";

export interface ResolvedWorkspaceTokens {
  source: WorkspaceTokenSource;
  tokens: WorkspaceTokens;
}
```

- [ ] **Step 4: Implement fallback resolver**

```ts
export async function resolveWorkspaceTokens(
  theme: WorkspaceTheme = "dark",
): Promise<ResolvedWorkspaceTokens> {
  const ds = await tryGetDsTokens();
  if (ds) return { source: "design-system", tokens: ds[theme] };
  return { source: "fallback", tokens: getWorkspaceTokens(theme) };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/workspace-tokens.test.ts`
Expected: PASS.

### Task 2: Validate The Real DS Export Shape

**Files:**
- Modify: `src/workspace/tokens-ds.ts`
- Modify: `src/types/optional-deps.d.ts`
- Test: `tests/workspace-tokens.test.ts`

- [ ] **Step 1: Add DS-shape tests with injected import hook**

```ts
it("accepts a design-system export that maps to WorkspaceThemedTokens", async () => {
  const ds = makeWorkspaceThemedTokensFixture();
  const resolved = normaliseDesignSystemTokens({ workspaceTokens: ds });
  expect(resolved).toEqual(ds);
});

it("rejects a design-system export missing required token groups", () => {
  const resolved = normaliseDesignSystemTokens({ workspaceTokens: { dark: {}, light: {} } });
  expect(resolved).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workspace-tokens.test.ts`
Expected: FAIL because `normaliseDesignSystemTokens` is not exported.

- [ ] **Step 3: Implement full token group validation**

```ts
export function normaliseDesignSystemTokens(mod: DsTokensModuleShape): WorkspaceThemedTokens | null {
  const candidate = mod.workspaceTokens ?? mod.default;
  if (!isThemedTokens(candidate)) return null;
  if (!isWorkspaceTokens(candidate.light) || !isWorkspaceTokens(candidate.dark)) return null;
  return candidate;
}
```

- [ ] **Step 4: Update optional dependency shim**

```ts
declare module "@sentropic/design-system/tokens" {
  import type { WorkspaceThemedTokens } from "../workspace/tokens.js";
  export const workspaceTokens: WorkspaceThemedTokens;
  const defaultTokens: WorkspaceThemedTokens;
  export default defaultTokens;
}
```

- [ ] **Step 5: Run token tests**

Run: `npx vitest run tests/workspace-tokens.test.ts`
Expected: PASS.

### Task 3: Wire Runtime Shell To Resolved Tokens

**Files:**
- Modify: `src/workspace/index.ts`
- Modify: CLI/server entrypoint that constructs the workspace shell once identified in code search.
- Test: `tests/workspace-shell.test.ts`

- [ ] **Step 1: Add shell smoke test for token source marker**

```ts
it("embeds the token source for UAT/debugging", () => {
  const html = renderWorkspaceShell({
    tokens: getWorkspaceTokens("dark"),
    tokenSource: "fallback",
    title: "Ontology workspace",
  });
  expect(html).toContain('data-token-source="fallback"');
});
```

- [ ] **Step 2: Run shell test to verify it fails**

Run: `npx vitest run tests/workspace-shell.test.ts`
Expected: FAIL because `tokenSource` is not rendered.

- [ ] **Step 3: Add `tokenSource` to shell options and root DOM**

```ts
tokenSource?: WorkspaceTokenSource;
```

```ts
`<div class="ws-root" role="application" aria-label="Graphify ontology workspace" data-token-source="${escapeHtml(opts.tokenSource ?? "fallback")}">`,
```

- [ ] **Step 4: Replace direct fallback call at the workspace entrypoint**

Use `resolveWorkspaceTokens(theme)` where the shell is assembled, pass `resolved.tokens` to the shell and `resolved.source` as `tokenSource`.

- [ ] **Step 5: Run focused workspace tests**

Run: `npx vitest run tests/workspace-tokens.test.ts tests/workspace-shell.test.ts`
Expected: PASS.

### Task 4: Add Package Contract Once DS Exists

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/workspace-tokens.test.ts`

- [ ] **Step 1: Confirm package availability**

Run: `npm view @sentropic/design-system version`
Expected: prints a version. If it fails with 404/no auth, stop here and keep the adapter/fallback work only.

- [ ] **Step 2: Add optional dependency**

Run: `npm install @sentropic/design-system --save-optional`
Expected: package added under `optionalDependencies`.

- [ ] **Step 3: Run tests with package installed**

Run: `npx vitest run tests/workspace-tokens.test.ts tests/workspace-shell.test.ts`
Expected: PASS and at least one test proves `source === "design-system"` with the package installed.

- [ ] **Step 4: Run tests with optional deps omitted**

Run: `npm install --omit=optional && npx vitest run tests/workspace-tokens.test.ts`
Expected: PASS and fallback source is used.

### Task 5: Verification And Graph Rebuild

**Files:**
- Modify: `.graphify/graph.json`
- Modify: `.graphify/GRAPH_REPORT.md`

- [ ] **Step 1: Run full verification**

Run:
```bash
npm run lint
npm run build
npm test
```
Expected: all pass. If sandbox blocks localhost tests, rerun the same command outside sandbox.

- [ ] **Step 2: Rebuild Graphify graph**

Run: `npx graphify hook-rebuild --scope tracked`
Expected: graph rebuild completes; optional fixture grammar warnings are acceptable.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/workspace src/types/optional-deps.d.ts tests/workspace-tokens.test.ts tests/workspace-shell.test.ts .graphify/graph.json .graphify/GRAPH_REPORT.md
git commit -m "Track G: wire workspace tokens to design system adapter"
```

## Self-Review

- Spec coverage: covers source observability, DS export validation, runtime shell wiring, optional dependency behavior, and graph rebuild.
- Placeholder scan: no placeholder markers; package installation has an explicit stop condition if the DS package is unavailable.
- Type consistency: all tasks use `WorkspaceTokens`, `WorkspaceThemedTokens`, `WorkspaceTokenSource`, and `ResolvedWorkspaceTokens` consistently.
