export const REQUEST_LIFECYCLE_STAGES = [
  "spec",
  "dev",
  "pr",
  "review",
  "merged",
  "published",
  "deployed",
] as const;

export type RequestLifecycleStage = (typeof REQUEST_LIFECYCLE_STAGES)[number];

export const LEGACY_TRACK_STAGE_ALIASES: Readonly<Record<string, RequestLifecycleStage>> = {
  PR: "pr",
  "mergé": "merged",
  "déployé": "deployed",
};

/**
 * Named normalizeRequestLifecycleStage (distinct from Track's 5-stage
 * normalizeReportStage in sources/track-origin-main/packages/track/src/model/report-status.ts:26-30),
 * while preserving Track's exact undefined-for-unknown return semantics.
 */
export function normalizeRequestLifecycleStage(
  value: unknown,
): RequestLifecycleStage | undefined {
  if (typeof value !== "string") return undefined;
  if ((REQUEST_LIFECYCLE_STAGES as readonly string[]).includes(value)) {
    return value as RequestLifecycleStage;
  }
  return LEGACY_TRACK_STAGE_ALIASES[value];
}
