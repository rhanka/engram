import { EFFORT_LEVELS, type EffortLevel } from "./results-types.js";
import { failSvg, requireEnum, requireNonEmptyText } from "./svg-tokens.js";

export { GLYPH_STATES, resolveGlyphStyle, type GlyphState, type GlyphStyle } from "./svg-tokens.js";

export const NON_STAR_SHAPES = ["circle", "square", "triangle", "diamond", "pentagon", "cross"] as const;
export type NonStarGlyphShape = (typeof NON_STAR_SHAPES)[number];
export const GLYPH_SHAPES = [...NON_STAR_SHAPES, "star"] as const;
export type GlyphShape = (typeof GLYPH_SHAPES)[number];
export const EFFORT_PROGRESSION_ORDER = [
  "off", "minimal", "low", "medium", "high", "xhigh", "max",
] as const satisfies readonly Exclude<EffortLevel, "cascade">[];
const EFFORT_LEVEL_SET = new Set<string>(EFFORT_LEVELS);
const EFFORT_RANK = new Map<string, number>(EFFORT_PROGRESSION_ORDER.map((effort, index) => [effort, index]));

/** Return 0..6 progression index for non-cascade EffortLevel, or -1 for "cascade". */
export function effortProgressionRank(effort: EffortLevel, path = "effort"): number {
  return EFFORT_RANK.get(requireEnum<EffortLevel>(effort, EFFORT_LEVEL_SET, path)) ?? -1;
}

export const MODEL_RELEASE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "mistral-small-2603": "mistral-small-4", "muse-1.3": "muse-spark-1.3", "muse-wonder-full-1.0": "muse-wonder-1.0",
});
const EFFORT_SUFFIX_RE = /-(?:off|minimal|low|medium|high|xhigh|max)$/;

/** Normalise raw model IDs deterministically before provider shape lookup. */
export function normalizeModelFamilyKey(rawModel: string, path = "model"): string {
  const stripped = requireNonEmptyText(rawModel, path).toLowerCase().replace(/^mesh:/, "");
  const key = stripped.replace(/^[a-z0-9._-]+:/, "").replace(EFFORT_SUFFIX_RE, "")
    .replace(/(\d)-(?=\d)/g, "$1.").trim();
  if (!key) failSvg("EMPTY_STRING", path);
  return Object.hasOwn(MODEL_RELEASE_ALIASES, key) ? MODEL_RELEASE_ALIASES[key]! : key;
}
