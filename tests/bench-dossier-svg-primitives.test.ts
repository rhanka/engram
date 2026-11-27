import { describe, expect, it } from "vitest";
import {
  SvgPrimitiveError,
  escapeXml,
  fmtSvgNum,
  requireFiniteNum,
  requireNonEmptyText,
  DS_VARS,
  ST_FONT_SANS,
  SVG_FONT_FAMILY,
  SVG_THEME_CSS,
  PROVIDER_COLORS,
  normalizeProviderKey,
  requireBool,
  requireEnum,
  requirePlainObj,
  requirePositiveNum,
  resolveArmColor,
  resolveProviderColor,
  CHART_KINDS,
  GLYPH_STATES,
  buildChartA11yIds,
  resolveGlyphStyle,
  toFieldSlug,
  EFFORT_PROGRESSION_ORDER,
  GLYPH_SHAPES,
  MODEL_RELEASE_ALIASES,
  NON_STAR_SHAPES,
  effortProgressionRank,
  normalizeModelFamilyKey,
  PROVIDER_FIXED_SHAPES,
  buildShapeRegistry,
  resolveModelShape,
  type ModelShapeInput,
  resolveRecordGlyphState,
  resolveSeatGlyphState,
} from "../src/bench-dossier/svg-primitives.js";

function parseLeafSvg(xml: string): { tag: string; attrs: Record<string, string>; text?: string } {
  const match = /^<([a-z]+)\s+([^<>]*?)(?:\/>|>([^<>]*)<\/\1>)$/.exec(xml);
  expect(match).not.toBeNull();
  const attrs: Record<string, string> = Object.create(null);
  let rest = match![2]!;
  while (rest.length > 0) {
    const attrMatch = /^([a-z-]+)="([^"]*)"(?:\s+|$)/.exec(rest);
    expect(attrMatch).not.toBeNull();
    attrs[attrMatch![1]!] = attrMatch![2]!;
    rest = rest.slice(attrMatch![0].length);
  }
  return match![3] !== undefined ? { tag: match![1]!, attrs, text: match![3]! } : { tag: match![1]!, attrs };
}

function refuse(fn: () => unknown, code: string, path: string, message?: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(SvgPrimitiveError);
  const err = caught as SvgPrimitiveError;
  expect([err.code, err.path]).toEqual([code, path]);
  if (message) expect(err.message).toBe(message);
}

describe("BD-6 DS-token SVG primitives, normalization & 7x5 glyph registry", () => {

  it("formats SVG numbers, escapes all 5 XML characters and enforces base text/number guards", () => {
    expect(escapeXml("")).toBe("");
    expect(escapeXml(`a&b<c>"d"'e'`)).toBe("a&amp;b&lt;c&gt;&quot;d&quot;&#39;e&#39;");
    expect([fmtSvgNum(-0.001), fmtSvgNum(12.345), fmtSvgNum(-3.5)]).toEqual(["0", "12.35", "-3.5"]);
    expect(requireNonEmptyText(" ok ", "k")).toBe("ok");
    expect(requireFiniteNum(0, "n")).toBe(0);
    const err = new SvgPrimitiveError("BAD_ENUM", "p", "bad");
    expect([err.name, err.message]).toEqual(["SvgPrimitiveError", "BAD_ENUM at p: bad"]);
    refuse(() => requireNonEmptyText("", "k"), "EMPTY_STRING", "k", "EMPTY_STRING at k");
    refuse(() => requireNonEmptyText("  ", "k"), "EMPTY_STRING", "k");
    refuse(() => requireNonEmptyText(1 as unknown as string, "k"), "EMPTY_STRING", "k");
    refuse(() => requireFiniteNum(Number.NaN, "x"), "BAD_NUMBER", "x");
    refuse(() => fmtSvgNum(Number.NaN), "BAD_NUMBER", "value");
    refuse(() => fmtSvgNum(Number.POSITIVE_INFINITY, "x"), "BAD_NUMBER", "x");
    refuse(() => fmtSvgNum(Number.NEGATIVE_INFINITY, "x"), "BAD_NUMBER", "x");
    refuse(() => fmtSvgNum("1" as unknown as number, "x"), "BAD_NUMBER", "x");
    refuse(() => escapeXml(null as unknown as string), "EMPTY_STRING", "text");
  });

  it("exports exact --st-* variables with hex fallbacks and light/dark CSS", () => {
    expect(ST_FONT_SANS).toBe("Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");
    expect(SVG_FONT_FAMILY).toBe(
      "var(--st-font-sans, Inter, system-ui, -apple-system, BlinkMacSystemFont, "
      + "'Segoe UI', 'DejaVu Sans', sans-serif)",
    );
    expect(Object.isFrozen(DS_VARS)).toBe(true);
    expect(DS_VARS).toEqual({
      surfaceDefault: "var(--st-semantic-surface-default, #ffffff)",
      surfaceSubtle: "var(--st-semantic-surface-subtle, #f8fafc)",
      textPrimary: "var(--st-semantic-text-primary, #0f172a)",
      textSecondary: "var(--st-semantic-text-secondary, #475569)",
      textMuted: "var(--st-semantic-text-muted, #64748b)",
      borderSubtle: "var(--st-semantic-border-subtle, #e2e8f0)",
      borderStrong: "var(--st-semantic-border-strong, #94a3b8)",
      feedbackError: "var(--st-semantic-feedback-error, #dc2626)",
      category1: "var(--st-semantic-data-category1, #4E79A7)",
      category2: "var(--st-semantic-data-category2, #F28E2B)",
      category3: "var(--st-semantic-data-category3, #E15759)",
      category4: "var(--st-semantic-data-category4, #76B7B2)",
      category5: "var(--st-semantic-data-category5, #59A14F)",
      category6: "var(--st-semantic-data-category6, #EDC948)",
      category7: "var(--st-semantic-data-category7, #B07AA1)",
      category8: "var(--st-semantic-data-category8, #FF9DA7)",
    });
    const darkCss = "--st-semantic-surface-default:#0f172a;--st-semantic-surface-subtle:#172033;"
      + "--st-semantic-text-primary:#f1f5f9;--st-semantic-text-secondary:#cbd5e1;"
      + "--st-semantic-text-muted:#94a3b8;--st-semantic-border-subtle:#475569";
    expect(SVG_THEME_CSS).toBe(
      ":root{--st-font-sans:Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;"
      + "--st-semantic-surface-default:#ffffff;--st-semantic-surface-subtle:#f8fafc;"
      + "--st-semantic-text-primary:#0f172a;--st-semantic-text-secondary:#475569;"
      + "--st-semantic-text-muted:#64748b;--st-semantic-border-subtle:#e2e8f0;"
      + "--st-semantic-border-strong:#94a3b8;--st-semantic-feedback-error:#dc2626;"
      + "--st-semantic-data-category1:#4E79A7;--st-semantic-data-category2:#F28E2B;"
      + "--st-semantic-data-category3:#E15759;--st-semantic-data-category4:#76B7B2;"
      + "--st-semantic-data-category5:#59A14F;--st-semantic-data-category6:#EDC948;"
      + "--st-semantic-data-category7:#B07AA1;--st-semantic-data-category8:#FF9DA7}"
      + `:root[data-theme="dark"]{${darkCss}}@media (prefers-color-scheme:dark){:root{${darkCss}}}`,
    );
  });

  it("enforces positive number, boolean, enum and plain-object validation guards", () => {
    expect(requirePositiveNum(0.5, "n")).toBe(0.5);
    expect(requireBool(false, "b")).toBe(false);
    expect(requireEnum("a", new Set(["a"]), "e")).toBe("a");
    expect(requirePlainObj({}, "$")).toEqual({});
    expect(requirePlainObj(Object.create(null), "$")).toEqual({});
    for (const bad of [null, [], Object.setPrototypeOf([], null), "x", new Date()]) {
      refuse(() => requirePlainObj(bad, "$"), "NOT_OBJECT", "$");
    }
    refuse(() => requirePositiveNum(0, "n"), "NON_POSITIVE", "n");
    refuse(() => requirePositiveNum(-1, "n"), "NON_POSITIVE", "n");
    refuse(() => requirePositiveNum("1", "n"), "BAD_NUMBER", "n");
    refuse(() => requireBool(1, "b"), "WRONG_TYPE", "b");
    refuse(() => requireEnum("b", new Set(["a"]), "e"), "BAD_ENUM", "e");
    refuse(() => requireEnum(null, new Set(["a"]), "e"), "BAD_ENUM", "e");
  });

  it("maps literal spec hex colors for every provider, Cascades high-contrast and overflow", () => {
    expect(Object.isFrozen(PROVIDER_COLORS)).toBe(true);
    expect(PROVIDER_COLORS).toEqual({
      openai: "var(--st-semantic-data-category1, #4E79A7)",
      anthropic: "var(--st-semantic-data-category2, #F28E2B)",
      meta: "var(--st-semantic-data-category3, #E15759)",
      cohere: "var(--st-semantic-data-category4, #76B7B2)",
      google: "var(--st-semantic-data-category5, #59A14F)",
      mistral: "var(--st-semantic-data-category7, #B07AA1)",
      cascades: "var(--st-semantic-feedback-error, #dc2626)",
      zhipu: "var(--st-semantic-data-category8, #FF9DA7)",
    });
    const providerLiteralCases: readonly [string, string][] = [
      ["OpenAI", "var(--st-semantic-data-category1, #4E79A7)"],
      ["Anthropic", "var(--st-semantic-data-category2, #F28E2B)"],
      ["Meta", "var(--st-semantic-data-category3, #E15759)"],
      ["Cohere", "var(--st-semantic-data-category4, #76B7B2)"],
      ["Google", "var(--st-semantic-data-category5, #59A14F)"],
      ["Mistral", "var(--st-semantic-data-category7, #B07AA1)"],
      ["Cascades", "var(--st-semantic-feedback-error, #dc2626)"],
      ["Zhipu", "var(--st-semantic-data-category8, #FF9DA7)"],
      ["zai", "var(--st-semantic-data-category8, #FF9DA7)"],
      ["z.ai", "var(--st-semantic-data-category8, #FF9DA7)"],
      ["z-ai", "var(--st-semantic-data-category8, #FF9DA7)"],
      ["DeepSeek", "var(--st-semantic-data-category6, #EDC948)"],
      ["unknown", "var(--st-semantic-data-category6, #EDC948)"],
      ["toString", "var(--st-semantic-data-category6, #EDC948)"],
      ["constructor", "var(--st-semantic-data-category6, #EDC948)"],
    ];
    for (const [provider, expected] of providerLiteralCases) {
      expect(resolveProviderColor(provider)).toBe(expected);
    }
    expect(normalizeProviderKey(" z.ai ")).toBe("zhipu");
    expect(normalizeProviderKey("Cascade")).toBe("cascades");
    expect(normalizeProviderKey("constructor")).toBe("constructor");
    expect(normalizeProviderKey("__proto__")).toBe("__proto__");
    expect(resolveArmColor("OpenAI", false)).toBe("var(--st-semantic-data-category1, #4E79A7)");
    expect(resolveArmColor("OpenAI", true)).toBe("var(--st-semantic-feedback-error, #dc2626)");
    expect(resolveArmColor("Cascades", true)).toBe("var(--st-semantic-feedback-error, #dc2626)");
    expect(resolveArmColor("DeepSeek", false)).toBe("var(--st-semantic-data-category6, #EDC948)");
    refuse(() => normalizeProviderKey(""), "EMPTY_STRING", "provider");
    refuse(() => resolveArmColor("Cascades", false), "CASCADE_CONFLICT", "isCascade");
    refuse(() => resolveArmColor("Cascade", false), "CASCADE_CONFLICT", "isCascade");
    refuse(() => resolveArmColor("OpenAI", null as unknown as boolean), "WRONG_TYPE", "isCascade");
    refuse(() => resolveProviderColor(""), "EMPTY_STRING", "provider");
    refuse(() => resolveProviderColor(null as unknown as string), "EMPTY_STRING", "provider");
    refuse(() => resolveArmColor("", true), "EMPTY_STRING", "provider");
  });

  it("converts field keys to slugs and generates unique fig-<slug>-<chartKind> a11y IDs", () => {
    expect(toFieldSlug("office.full_address")).toBe("office-full-address");
    expect(toFieldSlug("__Office..Full__Address__")).toBe("office-full-address");
    expect(toFieldSlug("_a")).toBe("a");
    expect(toFieldSlug("a_")).toBe("a");
    expect(toFieldSlug("city")).toBe("city");
    refuse(() => toFieldSlug(""), "EMPTY_STRING", "field");
    refuse(() => toFieldSlug("..."), "BAD_SLUG", "field");
    expect(CHART_KINDS).toEqual(["pr", "cost", "recall", "acceptance", "overview"]);
    expect(CHART_KINDS.map((kind) => buildChartA11yIds("office-city", kind))).toEqual([
      { titleId: "fig-office-city-pr-title", descId: "fig-office-city-pr-desc" },
      { titleId: "fig-office-city-cost-title", descId: "fig-office-city-cost-desc" },
      { titleId: "fig-office-city-recall-title", descId: "fig-office-city-recall-desc" },
      { titleId: "fig-office-city-acceptance-title", descId: "fig-office-city-acceptance-desc" },
      { titleId: "fig-office-city-overview-title", descId: "fig-office-city-overview-desc" },
    ]);
    for (const bad of ["", "  ", null as never]) {
      refuse(() => buildChartA11yIds(bad, "pr"), "EMPTY_STRING", "slug");
    }
    for (const bad of [" city ", "City", "office_city", "a--b", "-a"]) {
      refuse(() => buildChartA11yIds(bad, "pr"), "BAD_SLUG", "slug");
    }
    for (const bad of ["bar" as never, null as never, undefined as never]) {
      refuse(() => buildChartA11yIds("city", bad), "BAD_ENUM", "chartKind");
    }
    refuse(() => buildChartA11yIds("bad_slug", "pr", "svg.slug", "svg.chartKind"), "BAD_SLUG", "svg.slug");
    refuse(() => buildChartA11yIds("city", "bar" as never, "svg.slug", "svg.chartKind"), "BAD_ENUM", "svg.chartKind");
  });

  it("resolves all 5 glyph states with literal DS-token styles", () => {
    expect(GLYPH_STATES).toEqual([
      "api_filled",
      "seat_measured_hollow",
      "seat_estimated_hollow_dotted",
      "incomplete_hollow_dashed",
      "highlighted",
    ]);
    const blue = "var(--st-semantic-data-category1, #4E79A7)";
    expect(GLYPH_STATES.map((state) => resolveGlyphStyle(state, blue))).toEqual([
      { fill: blue, stroke: "var(--st-semantic-text-primary, #0f172a)", strokeWidth: "1" },
      { fill: "var(--st-semantic-surface-default, #ffffff)", stroke: blue, strokeWidth: "1.9" },
      {
        fill: "var(--st-semantic-surface-default, #ffffff)",
        stroke: blue,
        strokeWidth: "1.9",
        strokeDasharray: "2 2",
      },
      {
        fill: "var(--st-semantic-surface-default, #ffffff)",
        stroke: blue,
        strokeWidth: "1.9",
        strokeDasharray: "3.5 2",
      },
      { fill: blue, stroke: "var(--st-semantic-text-primary, #0f172a)", strokeWidth: "2.4" },
    ]);
    refuse(() => resolveGlyphStyle("bad" as never, blue), "BAD_ENUM", "state");
    refuse(() => resolveGlyphStyle(null as never, blue, "g.s"), "BAD_ENUM", "g.s");
    refuse(() => resolveGlyphStyle("api_filled", ""), "EMPTY_STRING", "color");
    refuse(() => resolveGlyphStyle("api_filled", null as never, "s", "g.c"), "EMPTY_STRING", "g.c");
  });

  it("normalises all 14 verbatim v12 IDs, Lot B and OWNER-REQUESTS aliases and effort ranks", () => {
    expect(NON_STAR_SHAPES).toEqual(["circle", "square", "triangle", "diamond", "pentagon", "cross"]);
    expect(GLYPH_SHAPES).toEqual(["circle", "square", "triangle", "diamond", "pentagon", "cross", "star"]);
    expect(EFFORT_PROGRESSION_ORDER).toEqual(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
    expect(EFFORT_PROGRESSION_ORDER.map((effort) => effortProgressionRank(effort))).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(effortProgressionRank("cascade")).toBe(-1);
    refuse(() => effortProgressionRank("turbo" as never), "BAD_ENUM", "effort");
    refuse(() => effortProgressionRank(null as never), "BAD_ENUM", "effort");
    refuse(() => effortProgressionRank(undefined as never, "p.e"), "BAD_ENUM", "p.e");
    expect(Object.isFrozen(MODEL_RELEASE_ALIASES)).toBe(true);
    expect(MODEL_RELEASE_ALIASES).toEqual({
      "mistral-small-2603": "mistral-small-4",
      "muse-1.3": "muse-spark-1.3",
      "muse-wonder-full-1.0": "muse-wonder-1.0",
    });
    const normCases: readonly [string, string][] = [
      ["gpt-6-astra", "gpt-6-astra"],
      ["gpt-5.6-sol", "gpt-5.6-sol"],
      ["gpt-5.6-luna", "gpt-5.6-luna"],
      ["gpt-4.1", "gpt-4.1"],
      ["gemini-3.8-flash", "gemini-3.8-flash"],
      ["gemini-4-argon-low", "gemini-4-argon"],
      ["claude-opus-5", "claude-opus-5"],
      ["claude-sonnet-5", "claude-sonnet-5"],
      ["claude-sonnet-4.6", "claude-sonnet-4.6"],
      ["claude-opus-5-5", "claude-opus-5.5"],
      ["muse-spark-1.3", "muse-spark-1.3"],
      ["muse-wonder-1.0", "muse-wonder-1.0"],
      ["muse-ember-1.0", "muse-ember-1.0"],
      ["mistral-small-2603", "mistral-small-4"],
      ["gpt-6-astra-low", "gpt-6-astra"],
      ["openai:gpt-5.6-sol-high", "gpt-5.6-sol"],
      ["gpt-5-6-luna-low", "gpt-5.6-luna"],
      ["gpt-4-1-off", "gpt-4.1"],
      ["gpt-4-1", "gpt-4.1"],
      ["claude-sonnet-5-medium", "claude-sonnet-5"],
      ["claude-sonnet-4-6-high", "claude-sonnet-4.6"],
      ["claude-opus-5-5-max", "claude-opus-5.5"],
      ["gemini-3-8-flash-minimal", "gemini-3.8-flash"],
      ["gemini-4-argon", "gemini-4-argon"],
      ["muse-1.3", "muse-spark-1.3"],
      ["muse-1-3-low", "muse-spark-1.3"],
      ["mesh:muse-wonder-1.0-max", "muse-wonder-1.0"],
      ["muse-wonder-full-1-0-max", "muse-wonder-1.0"],
      ["muse-ember-1-0-xhigh", "muse-ember-1.0"],
      ["mistral:mistral-small-2603-low", "mistral-small-4"],
      ["gpt-6-luna-low", "gpt-6-luna"],
      ["mesh:gpt-6.2-astra-max", "gpt-6.2-astra"],
      ["gpt-6-2-sol-xhigh", "gpt-6.2-sol"],
      ["gemini-4-hydrogen-low", "gemini-4-hydrogen"],
      ["mesh:gemini-4-carbon-max", "gemini-4-carbon"],
      ["mesh:gemini-4-neon-max", "gemini-4-neon"],
      ["anthropic:claude-fable-5-2-max", "claude-fable-5.2"],
      ["mesh:anthropic:claude-haiku-5-5-low", "claude-haiku-5.5"],
      ["anthropic:claude-sonnet-5-5-low", "claude-sonnet-5.5"],
      ["mistral-large-4-low", "mistral-large-4"],
      ["z.ai:zai-glm-5-3-low", "zai-glm-5.3"],
      ["MESH:Anthropic:Claude-Opus-5-5-MAX", "claude-opus-5.5"],
      ["gpt-5-6-7-low", "gpt-5.6.7"],
      ["gpt-low-1", "gpt-low-1"],
      ["a:b:c", "b:c"],
      ["foo bar:baz", "foo bar:baz"],
      ["toString", "tostring"],
      ["constructor", "constructor"],
    ];
    for (const [raw, expected] of normCases) {
      expect(normalizeModelFamilyKey(raw)).toBe(expected);
    }
    const badModels = [
      "", "  ", "mesh:", "openai:", "-low", "mesh:openai:-max", "mesh:  -low", "openai:  ", null as never,
    ];
    for (const bad of badModels) {
      refuse(() => normalizeModelFamilyKey(bad, "m"), "EMPTY_STRING", "m");
    }
    refuse(() => normalizeModelFamilyKey(""), "EMPTY_STRING", "model");
  });

  it("pins every exact benchmark-v12 model ID to its exact v12 shape and freezes PROVIDER_FIXED_SHAPES", () => {
    expect(Object.isFrozen(PROVIDER_FIXED_SHAPES)).toBe(true);
    expect(Object.keys(PROVIDER_FIXED_SHAPES)).toEqual([
      "openai", "google", "anthropic", "meta", "mistral", "zhipu",
    ]);
    for (const map of Object.values(PROVIDER_FIXED_SHAPES)) {
      expect(Object.isFrozen(map)).toBe(true);
    }
    const v12Cases: readonly [string, string, string][] = [
      ["OpenAI", "gpt-6-astra", "circle"],
      ["OpenAI", "gpt-5.6-sol", "square"],
      ["OpenAI", "gpt-5.6-luna", "triangle"],
      ["OpenAI", "gpt-4.1", "cross"],
      ["Google", "gemini-3.8-flash", "circle"],
      ["Google", "gemini-4-argon-low", "square"],
      ["Anthropic", "claude-opus-5", "circle"],
      ["Anthropic", "claude-sonnet-5", "square"],
      ["Anthropic", "claude-sonnet-4.6", "triangle"],
      ["Anthropic", "claude-opus-5-5", "cross"],
      ["Meta", "muse-spark-1.3", "circle"],
      ["Meta", "muse-wonder-1.0", "square"],
      ["Meta", "muse-ember-1.0", "triangle"],
      ["Mistral", "mistral-small-2603", "circle"],
    ];
    const v12Arms: ModelShapeInput[] = v12Cases.map(([provider, model]) => ({
      provider, model, isCascade: false,
    }));
    const v12Reg = buildShapeRegistry(v12Arms);
    expect(v12Arms.map((arm) => v12Reg.shapeFor(arm))).toEqual(v12Cases.map(([, , shape]) => shape));
  });

  it("assigns collision-free shapes across Lot B / OWNER-REQUESTS models, aliases and cascades", () => {
    const lotbArms: ModelShapeInput[] = [
      { provider: "OpenAI", model: "gpt-6.2-sol-low", isCascade: false },
      { provider: "OpenAI", model: "gpt-6.2-astra-low", isCascade: false, effort: "low" },
      { provider: "OpenAI", model: "gpt-6-luna-low", isCascade: false, effort: undefined },
      { provider: "OpenAI", model: "gpt-5.6-luna-low", isCascade: false },
      { provider: "OpenAI", model: "gpt-5.6-sol-low", isCascade: false },
      { provider: "OpenAI", model: "gpt-6-astra-low", isCascade: false },
      { provider: "Google", model: "gemini-3.8-flash", isCascade: false },
      { provider: "Google", model: "gemini-4-argon-low", isCascade: false },
      { provider: "Google", model: "gemini-4-hydrogen-low", isCascade: false },
      { provider: "Google", model: "mesh:gemini-4-carbon-max", isCascade: false },
      { provider: "Google", model: "mesh:gemini-4-neon-max", isCascade: false },
      { provider: "Anthropic", model: "claude-opus-5-5-low", isCascade: false },
      { provider: "Anthropic", model: "claude-fable-5-2-max", isCascade: false },
      { provider: "Anthropic", model: "claude-haiku-5-5-low", isCascade: false },
      { provider: "Anthropic", model: "claude-sonnet-5-5-low", isCascade: false },
      { provider: "Meta", model: "muse-1.3", isCascade: false },
      { provider: "Meta", model: "muse-wonder-full-1.0", isCascade: false },
      { provider: "Mistral", model: "mistral-small-4", isCascade: false },
      { provider: "Mistral", model: "mistral-large-4-low", isCascade: false },
      { provider: "Zhipu", model: "zai-glm-5-3-low", isCascade: false },
      { provider: "z.ai", model: "a-model", isCascade: false },
      { provider: "OpenAI", model: "CP-low", isCascade: true, effort: "low" },
    ];
    const reg = buildShapeRegistry([
      ...lotbArms,
      { provider: "openai", model: "gpt-6-astra-high", isCascade: false },
    ]);
    expect(lotbArms.map((arm) => reg.shapeFor(arm))).toEqual([
      "cross", "pentagon", "diamond", "triangle", "square", "circle",
      "circle", "square", "triangle", "diamond", "pentagon",
      "cross", "diamond", "pentagon", "circle",
      "circle", "square",
      "circle", "square",
      "circle", "square",
      "star",
    ]);
    expect(reg.byProvider.get("zhipu")).toEqual(new Map([["zai-glm-5.3", "circle"], ["a-model", "square"]]));
    const lex = buildShapeRegistry([
      { provider: "Acme", model: "z-model", isCascade: false },
      { provider: "Acme", model: "a-model", isCascade: false },
    ]);
    const lexRev = buildShapeRegistry([
      { provider: "Acme", model: "a-model", isCascade: false },
      { provider: "Acme", model: "z-model", isCascade: false },
    ]);
    expect([
      lex.shapeFor({ provider: "Acme", model: "a-model", isCascade: false }),
      lex.shapeFor({ provider: "Acme", model: "z-model", isCascade: false }),
      lexRev.shapeFor({ provider: "Acme", model: "a-model", isCascade: false }),
      lexRev.shapeFor({ provider: "Acme", model: "z-model", isCascade: false }),
      resolveModelShape({ provider: "Zhipu", model: "zai-glm-5-3-low", isCascade: false }),
      resolveModelShape({ provider: "Cascades", model: "c2", isCascade: true, effort: "cascade" }),
      resolveModelShape({ provider: "toString", model: "name", isCascade: false }),
      resolveModelShape({ provider: "constructor", model: "name", isCascade: false }),
      resolveModelShape({ provider: "OpenAI", model: "constructor", isCascade: false }),
    ]).toEqual(["circle", "square", "circle", "square", "circle", "star", "circle", "circle", "circle"]);
  });

  it("refuses malformed shape registry inputs, >6 overflow and both-side cascade conflicts", () => {
    const reg = buildShapeRegistry([{ provider: "OpenAI", model: "gpt-6-astra", isCascade: false }]);
    refuse(() => reg.shapeFor(null as never), "NOT_OBJECT", "arm");
    refuse(() => reg.shapeFor({ provider: "OpenAI", model: "gpt-4.1", isCascade: false }), "BAD_ENUM", "arm.model");
    refuse(
      () => reg.shapeFor({ provider: "Google", model: "gemini-4-argon", isCascade: false }),
      "BAD_ENUM",
      "arm.model",
    );
    refuse(() => resolveModelShape(null as never), "NOT_OBJECT", "arm");
    refuse(() => resolveModelShape({ provider: "", model: "m", isCascade: false }), "EMPTY_STRING", "arm.provider");
    refuse(
      () => resolveModelShape({ provider: "Cascade", model: "c2", isCascade: false }),
      "CASCADE_CONFLICT",
      "arm.isCascade",
    );
    refuse(() => buildShapeRegistry(null as never), "NOT_ARRAY", "arms");
    refuse(() => buildShapeRegistry([null as never]), "NOT_OBJECT", "arms[0]");
    refuse(
      () => buildShapeRegistry([{ provider: "", model: "m", isCascade: false }]),
      "EMPTY_STRING",
      "arms[0].provider",
    );
    refuse(
      () => buildShapeRegistry([{ provider: "OpenAI", model: "", isCascade: false }]),
      "EMPTY_STRING",
      "arms[0].model",
    );
    refuse(
      () => buildShapeRegistry([{ provider: "OpenAI", model: "gpt-4.1", isCascade: null as never }]),
      "WRONG_TYPE",
      "arms[0].isCascade",
    );
    refuse(
      () => buildShapeRegistry([{ provider: "OpenAI", model: "gpt-4.1", isCascade: false, effort: null as never }]),
      "BAD_ENUM",
      "arms[0].effort",
    );
    refuse(
      () => buildShapeRegistry([
        { provider: "OpenAI", model: "gpt-4.1", isCascade: false, effort: "unknown" as never },
      ]),
      "BAD_ENUM",
      "arms[0].effort",
    );
    refuse(
      () => buildShapeRegistry([{ provider: "OpenAI", model: "gpt-4.1", isCascade: false, effort: "cascade" }]),
      "CASCADE_CONFLICT",
      "arms[0].effort",
    );
    refuse(
      () => buildShapeRegistry([{ provider: "Cascade", model: "c2", isCascade: false }]),
      "CASCADE_CONFLICT",
      "arms[0].isCascade",
    );
    refuse(
      () => buildShapeRegistry([{ provider: "Cascades", model: "c2", isCascade: false }]),
      "CASCADE_CONFLICT",
      "arms[0].isCascade",
    );
    const sevenOpenAi: ModelShapeInput[] = [
      "gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-luna", "gpt-6-luna", "gpt-6.2-astra", "gpt-6.2-sol", "gpt-4.1",
    ].map((model) => ({ provider: "OpenAI", model, isCascade: false }));
    refuse(() => buildShapeRegistry(sevenOpenAi), "PROVIDER_SHAPE_OVERFLOW", "arms.openai");
  });

  it("resolves seat glyph states and record glyph states across all costMode/seatStatus combinations", () => {
    expect(resolveSeatGlyphState("measured")).toBe("seat_measured_hollow");
    expect(resolveSeatGlyphState("estimated")).toBe("seat_estimated_hollow_dotted");
    refuse(() => resolveSeatGlyphState("unknown"), "SEAT_UNAVAILABLE", "seatStatus");
    refuse(() => resolveSeatGlyphState("unknown", "p.s"), "SEAT_UNAVAILABLE", "p.s");
    for (const bad of [null, undefined, "bad"]) {
      refuse(() => resolveSeatGlyphState(bad as never), "BAD_ENUM", "seatStatus");
    }
    const plain = { incomplete: false, isHighlighted: false };
    expect(resolveRecordGlyphState(plain)).toBe("api_filled");
    expect(resolveRecordGlyphState(plain, undefined)).toBe("api_filled");
    expect(resolveRecordGlyphState(plain, { costMode: undefined, seatStatus: "unknown" })).toBe("api_filled");
    expect(resolveRecordGlyphState({ incomplete: false, isHighlighted: true })).toBe("highlighted");
    expect(resolveRecordGlyphState({ incomplete: true, isHighlighted: false })).toBe("incomplete_hollow_dashed");
    expect(resolveRecordGlyphState({ incomplete: true, isHighlighted: true })).toBe("incomplete_hollow_dashed");
    expect(resolveRecordGlyphState(plain, { costMode: "seat", seatStatus: "measured" })).toBe("seat_measured_hollow");
    expect(resolveRecordGlyphState(plain, { costMode: "seat", seatStatus: "estimated" }))
      .toBe("seat_estimated_hollow_dotted");
    expect(resolveRecordGlyphState({ incomplete: false, isHighlighted: true },
      { costMode: "seat", seatStatus: "measured" })).toBe("seat_measured_hollow");
    expect(resolveRecordGlyphState({ incomplete: false, isHighlighted: true },
      { costMode: "seat", seatStatus: "estimated" })).toBe("seat_estimated_hollow_dotted");
    expect(resolveRecordGlyphState({ incomplete: true, isHighlighted: true },
      { costMode: "seat", seatStatus: "measured" })).toBe("incomplete_hollow_dashed");
    refuse(() => resolveRecordGlyphState(null as never), "NOT_OBJECT", "arm");
    refuse(() => resolveRecordGlyphState({ incomplete: 1 as never, isHighlighted: false }),
      "WRONG_TYPE", "arm.incomplete");
    refuse(() => resolveRecordGlyphState({ incomplete: false, isHighlighted: null as never }),
      "WRONG_TYPE", "arm.isHighlighted");
    refuse(() => resolveRecordGlyphState(plain, null as never), "NOT_OBJECT", "opts");
    refuse(() => resolveRecordGlyphState(plain, { costMode: null as never }), "BAD_ENUM", "opts.costMode");
    refuse(() => resolveRecordGlyphState(plain, { costMode: "unknown" as never }), "BAD_ENUM", "opts.costMode");
    refuse(() => resolveRecordGlyphState(plain, { costMode: "seat" }), "BAD_ENUM", "opts.seatStatus");
    refuse(() => resolveRecordGlyphState(plain, { costMode: "seat", seatStatus: "unknown" }),
      "SEAT_UNAVAILABLE", "opts.seatStatus");
    refuse(() => resolveRecordGlyphState({ incomplete: true, isHighlighted: false },
      { costMode: "seat", seatStatus: "unknown" }), "SEAT_UNAVAILABLE", "opts.seatStatus");
  });
});
