import { EFFORT_LEVELS, type EffortLevel } from "./results-types.js";
import {
  failSvg, normalizeProviderKey, requireBool, requireEnum, requireNonEmptyText, requirePlainObj,
} from "./svg-tokens.js";

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

export const PROVIDER_FIXED_SHAPES: Readonly<Record<string, Readonly<Record<string, NonStarGlyphShape>>>> = {
  openai: { "gpt-6-astra": "circle", "gpt-5.6-sol": "square", "gpt-5.6-luna": "triangle",
    "gpt-4.1": "cross", "gpt-6-luna": "diamond", "gpt-6.2-astra": "pentagon" },
  google: { "gemini-3.8-flash": "circle", "gemini-4-argon": "square", "gemini-4-hydrogen": "triangle",
    "gemini-4-carbon": "diamond", "gemini-4-neon": "pentagon" },
  anthropic: { "claude-opus-5": "circle", "claude-sonnet-5": "square", "claude-sonnet-4.6": "triangle",
    "claude-opus-5.5": "cross", "claude-fable-5.2": "diamond", "claude-haiku-5.5": "pentagon" },
  meta: { "muse-spark-1.3": "circle", "muse-wonder-1.0": "square", "muse-ember-1.0": "triangle" },
  mistral: { "mistral-small-4": "circle", "mistral-large-4": "square" },
  zhipu: { "zai-glm-5.3": "circle" },
};
Object.values(PROVIDER_FIXED_SHAPES).forEach(Object.freeze);
Object.freeze(PROVIDER_FIXED_SHAPES);

export interface ModelShapeInput {
  readonly provider: string;
  readonly model: string;
  readonly isCascade: boolean;
  readonly effort?: EffortLevel;
}
function parseModelArm(arm: ModelShapeInput, path: string) {
  requirePlainObj(arm, path);
  const providerKey = normalizeProviderKey(arm.provider, `${path}.provider`);
  const familyKey = normalizeModelFamilyKey(arm.model, `${path}.model`);
  requireBool(arm.isCascade, `${path}.isCascade`);
  if (arm.effort !== undefined) {
    const effort = requireEnum<EffortLevel>(arm.effort, EFFORT_LEVEL_SET, `${path}.effort`);
    if (effort === "cascade" && !arm.isCascade) failSvg("CASCADE_CONFLICT", `${path}.effort`);
  }
  if (providerKey === "cascades" && !arm.isCascade) failSvg("CASCADE_CONFLICT", `${path}.isCascade`);
  return { providerKey, familyKey, isCascade: arm.isCascade };
}
/** Build a deterministic, collision-free per-provider shape registry (refusing >6 single-model families). */
export function buildShapeRegistry(arms: readonly ModelShapeInput[]) {
  if (!Array.isArray(arms)) failSvg("NOT_ARRAY", "arms");
  const groups = new Map<string, Set<string>>();
  for (let index = 0; index < arms.length; index++) {
    const parsed = parseModelArm(arms[index]!, `arms[${index}]`);
    if (parsed.isCascade) continue;
    groups.set(parsed.providerKey, (groups.get(parsed.providerKey) ?? new Set<string>()).add(parsed.familyKey));
  }
  const byProvider = new Map<string, ReadonlyMap<string, NonStarGlyphShape>>();
  for (const [providerKey, families] of groups) {
    if (families.size > NON_STAR_SHAPES.length) failSvg("PROVIDER_SHAPE_OVERFLOW", `arms.${providerKey}`);
    const pinned = Object.hasOwn(PROVIDER_FIXED_SHAPES, providerKey) ? PROVIDER_FIXED_SHAPES[providerKey]! : {};
    const assigned = new Map<string, NonStarGlyphShape>();
    for (const family of families) if (Object.hasOwn(pinned, family)) assigned.set(family, pinned[family]!);
    const used = new Set(assigned.values());
    const unpinned = [...families].filter((family) => !assigned.has(family)).sort();
    for (const family of unpinned) {
      const free = NON_STAR_SHAPES.find((shape) => !used.has(shape))!;
      assigned.set(family, free);
      used.add(free);
    }
    byProvider.set(providerKey, assigned);
  }
  return {
    byProvider: byProvider as ReadonlyMap<string, ReadonlyMap<string, NonStarGlyphShape>>,
    shapeFor(arm: ModelShapeInput): GlyphShape {
      const parsed = parseModelArm(arm, "arm");
      if (parsed.isCascade) return "star";
      return byProvider.get(parsed.providerKey)?.get(parsed.familyKey) ?? failSvg("BAD_ENUM", "arm.model");
    },
  };
}
export const resolveModelShape = (arm: ModelShapeInput): GlyphShape =>
  (parseModelArm(arm, "arm").isCascade ? "star" : buildShapeRegistry([arm]).shapeFor(arm));
