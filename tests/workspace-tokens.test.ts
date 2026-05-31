import { describe, expect, it } from "vitest";

import {
  WORKSPACE_TOKEN_GROUPS,
  getWorkspaceTokens,
  getWorkspaceTokensFallback,
  normaliseDesignSystemTokens,
  resolveWorkspaceTokens,
  serialiseTokensToCss,
  tryGetDsTokens,
  type WorkspaceTokens,
} from "../src/workspace/index.js";

describe("Track G G1 — workspace token fallback", () => {
  it("returns both light and dark themes from getWorkspaceTokensFallback", () => {
    const themed = getWorkspaceTokensFallback();
    expect(themed.light).toBeDefined();
    expect(themed.dark).toBeDefined();
    expect(themed.light).not.toBe(themed.dark);
  });

  it("defaults getWorkspaceTokens() to the design-system default theme", () => {
    const defaultTheme = getWorkspaceTokens();
    const explicit = getWorkspaceTokens("light");
    expect(defaultTheme).toBe(explicit);
  });

  it("exposes every required token group on every theme", () => {
    const themed = getWorkspaceTokensFallback();
    for (const theme of ["light", "dark"] as const) {
      const t: WorkspaceTokens = themed[theme];
      for (const group of WORKSPACE_TOKEN_GROUPS) {
        expect(t[group], `${theme}.${group}`).toBeDefined();
      }
    }
  });

  it("covers the 9 colour roles called out by the spec", () => {
    const required = [
      "surface",
      "surface-2",
      "border",
      "text",
      "text-muted",
      "accent",
      "danger",
      "success",
      "warning",
    ];
    for (const theme of ["light", "dark"] as const) {
      const colour = getWorkspaceTokens(theme).colour;
      for (const role of required) {
        expect(colour, `${theme}.colour.${role}`).toHaveProperty(role);
        const value = (colour as unknown as Record<string, unknown>)[role];
        expect(typeof value).toBe("string");
        // D11: palette is tokenised as OKLCH (DS alignment), no bare hex.
        expect((value as string).startsWith("oklch(")).toBe(true);
        expect((value as string).endsWith(")")).toBe(true);
      }
    }
  });

  it("emits the spacing scale space-0 through space-7", () => {
    const spacing = getWorkspaceTokens("dark").spacing;
    for (let i = 0; i <= 7; i++) {
      const key = `space-${i}` as const;
      expect(spacing, key).toHaveProperty(key);
      const value = (spacing as unknown as Record<string, unknown>)[key];
      expect(typeof value).toBe("string");
    }
  });

  it("serialises tokens to CSS custom properties with the --ws- prefix", () => {
    const tokens = getWorkspaceTokens("dark");
    const css = serialiseTokensToCss(tokens);
    expect(css).toContain("--ws-surface:");
    expect(css).toContain("--ws-text:");
    expect(css).toContain("--ws-accent:");
    expect(css).toContain("--ws-space-4:");
    expect(css).toContain("--ws-radius-md:");
    expect(css).toContain("--ws-outline-color:");
    expect(css).not.toContain("--ws-undefined");
    const lineCount = css.split("\n").length;
    expect(lineCount).toBeGreaterThanOrEqual(9 + 7 + 8 + 3 + 2 + 3);
  });

  it("aliases the --ws- contract onto published design-system --st- tokens", () => {
    const css = serialiseTokensToCss(getWorkspaceTokens());
    // Colour roles resolve through real DS semantic tokens (no bare hex).
    expect(css).toContain("--ws-surface: var(--st-semantic-surface-default);");
    expect(css).toContain("--ws-surface-2: var(--st-semantic-surface-subtle);");
    expect(css).toContain("--ws-text: var(--st-semantic-text-primary);");
    expect(css).toContain("--ws-text-muted: var(--st-semantic-text-secondary);");
    expect(css).toContain("--ws-border: var(--st-semantic-border-subtle);");
    expect(css).toContain("--ws-accent: var(--st-semantic-action-primary);");
    expect(css).toContain("--ws-outline-color: var(--st-semantic-border-interactive);");
    // Spacing / radius / font roles resolve through DS aliases too.
    expect(css).toContain("--ws-space-4: var(--st-spacing-4);");
    expect(css).toContain("--ws-radius-md: var(--st-radius-md);");
    expect(css).toContain("--ws-font-family-sans: var(--st-font-sans);");
    // Distinct display family + community palette are exposed.
    expect(css).toContain("--ws-font-family-display: var(--st-font-display);");
    expect(css).toContain("--ws-community-1: var(--st-semantic-data-category1);");
    expect(css).toContain("--ws-community-8: var(--st-semantic-data-category8);");
    // The colour palette must no longer emit bare hex through the contract.
    expect(css).not.toMatch(/--ws-(surface|text|accent|border|danger|success|warning)[^:]*:\s*#/);
  });

  it("freezes the fallback tokens to prevent mutation by consumers", () => {
    const tokens = getWorkspaceTokens("dark");
    expect(Object.isFrozen(tokens)).toBe(true);
    expect(Object.isFrozen(tokens.colour)).toBe(true);
    expect(Object.isFrozen(tokens.spacing)).toBe(true);
  });

  it("returns null from tryGetDsTokens when @sentropic/design-system is absent", async () => {
    const ds = await tryGetDsTokens();
    expect(ds).toBeNull();
  });

  it("validates the full design-system token shape before accepting it", () => {
    const fallback = getWorkspaceTokensFallback();
    expect(normaliseDesignSystemTokens(fallback)).toBe(fallback);
    expect(normaliseDesignSystemTokens({
      light: { ...fallback.light, colour: { ...fallback.light.colour, accent: 42 } },
      dark: fallback.dark,
    })).toBeNull();
    expect(normaliseDesignSystemTokens({
      light: fallback.light,
      dark: { ...fallback.dark, focusRing: undefined },
    })).toBeNull();
  });

  it("resolves the active tokens with an explicit source label", async () => {
    const resolved = await resolveWorkspaceTokens();
    expect(resolved.source).toBe("fallback");
    expect(resolved.tokens).toBe(getWorkspaceTokens());
    expect(resolved.themedTokens.light).toBe(getWorkspaceTokens());
  });
});
