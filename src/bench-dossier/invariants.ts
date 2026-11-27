import { specsOf, type FieldSpec, type Mission } from "../scrap/extract.js";
import { nonEmptyString } from "./results-guards.js";
import type { BenchResultsFile } from "./results-types.js";
import { BenchInvariantError, failInv, validateCountsAndSites,
  validateEstimator, wilson95, type BenchInvariantCode } from "./invariants-checks.js";
export { BenchInvariantError, wilson95, type BenchInvariantCode };

export type MissionShapeCompatibility = ReturnType<typeof compatibleMissionFieldShape>;
function checkUniqueNames(items: readonly { readonly name: string }[], prefix: string): void {
  const seen = new Set<string>();
  items.forEach(({ name }, index) => {
    if (name.includes(".")) failInv("FIELD_NAME_DOT", `${prefix}[${index}].name`);
    if (seen.has(name)) failInv("DUPLICATE_FIELD", `${prefix}[${index}].name`);
    seen.add(name);
  });
}
function parseMissionSpecs(mission: Mission, rootPath: string): FieldSpec[] {
  try {
    const specs = specsOf(mission);
    if (specs.length === 0) failInv("MISSION_FIELD_SHAPE", `${rootPath}.fields`);
    checkUniqueNames(specs, `${rootPath}.fields`);
    specs.forEach((field, index) => field.kind === "record"
      && checkUniqueNames(field.subFields!, `${rootPath}.fields[${index}].fields`));
    return specs;
  } catch (cause) {
    throw cause instanceof BenchInvariantError ? cause
      : new BenchInvariantError("MISSION_FIELD_SHAPE", `${rootPath}.fields`, "BAD_SHAPE", cause);
  }
}
/** Verify golden and candidate missions share identical field names, kinds, sub-fields and cardinality class. */
export function compatibleMissionFieldShape(golden: Mission, cand: Mission) {
  const goldenSpecs: readonly FieldSpec[] = parseMissionSpecs(golden, "$.golden");
  const candidateSpecs: readonly FieldSpec[] = parseMissionSpecs(cand, "$.cand");
  const failShape = (path: string): never => failInv("MISSION_FIELD_SHAPE", path);
  if (goldenSpecs.length !== candidateSpecs.length) failShape("$.cand.fields");
  let maxValuesChanged = false;
  goldenSpecs.forEach((goldField, index) => {
    const candField = candidateSpecs[index]!;
    const fieldPath = `$.cand.fields[${index}]`;
    if (goldField.name !== candField.name) failShape(`${fieldPath}.name`);
    if (goldField.kind !== candField.kind) failShape(`${fieldPath}.kind`);
    if ((goldField.maxValues === 1) !== (candField.maxValues === 1)) failShape(`${fieldPath}.max_values`);
    if (goldField.maxValues !== candField.maxValues) maxValuesChanged = true;
    if (goldField.kind !== "record") return;
    if (goldField.subFields!.length !== candField.subFields!.length) failShape(`${fieldPath}.fields`);
    goldField.subFields!.forEach((sub, subIndex) =>
      sub.name !== candField.subFields![subIndex]!.name && failShape(`${fieldPath}.fields[${subIndex}].name`));
  });
  return { maxValuesChanged, goldenSpecs, candidateSpecs } as const;
}

const INTERNAL_ID_RE = new RegExp(
  "\\b(?:WP\\d+(?:\\.\\d+)?|D-\\d+|O\\d{3,4}|A\\d{2}|T\\d{2}|r\\d+-D\\d+|"
  + "J\\d+|M\\d+|Q\\d+|Q-[A-Z]|F\\d+|LOT-\\d+|AC-\\d+|rel-\\d+|PR\\s*#?\\d+|hrpn/#\\d+)\\b");
/** Reject proseName values violating Focus readability gates (digits, internal IDs, ;, ()). */
export function validateProseName(proseName: string, path = "$"): void {
  nonEmptyString(proseName, path);
  if (/[;()]/.test(proseName) || INTERNAL_ID_RE.test(proseName)) failInv("PROSE_NAME_GATE", path);
  if ([...(proseName.match(/\b(?!h2a\b)\S*\d\S*\b/gi) ?? [])].some((token) =>
    token.replace(/^[.,!?:;"'`]+|[.,!?:;"'`]+$/g, "").replace(/^utf-8$/i, "") !== ""))
    failInv("PROSE_NAME_GATE", path);
}
/** Validate cross-field, uniqueness, prose-name, estimator, count, site-matrix and cost invariants. */
export function validateBenchResultsInvariants(file: BenchResultsFile,
  opts?: { readonly missionSpecs?: readonly FieldSpec[] }): BenchResultsFile {
  const specs = new Map((opts?.missionSpecs ?? []).flatMap((spec) => spec.kind === "record"
    ? spec.subFields!.map((sub) => [`${spec.name}.${sub.name}`, spec] as const) : [[spec.name, spec] as const]));
  const armToProse = new Map<string, string>();
  const proseToArm = new Map<string, string>();
  const primaries = new Map<string, { firstIdx: number; count: number; comparators: Set<string> }>();
  file.records.forEach((record, index) => {
    const base = `$.records[${index}]`;
    const pairKey = JSON.stringify([record.armId, record.field]);
    const entry = primaries.get(pairKey) ?? { firstIdx: index, count: 0, comparators: new Set<string>() };
    if (entry.comparators.has(record.comparator)) failInv("DUPLICATE_RECORD_KEY", base);
    entry.comparators.add(record.comparator);
    if (record.isPrimaryComparator && ++entry.count > 1) failInv("PRIMARY_COMPARATOR", `${base}.isPrimaryComparator`);
    primaries.set(pairKey, entry);
    const prose = record.proseName;
    const prosePath = `${base}.proseName`;
    validateProseName(prose, prosePath);
    if ((armToProse.get(record.armId) ?? prose) !== prose) failInv("PROSE_NAME_CONFLICT", prosePath);
    if ((proseToArm.get(prose) ?? record.armId) !== record.armId) failInv("PROSE_NAME_DUPLICATE", prosePath);
    armToProse.set(record.armId, prose);
    proseToArm.set(prose, record.armId);
    const spec = specs.get(record.field);
    validateCountsAndSites(record, base, file.corpus.goldenIds, file.corpus.currency, spec);
    validateEstimator(record, file.corpus.primaryEstimator, base, spec);
  });
  for (const primary of primaries.values())
    if (primary.count !== 1) failInv("PRIMARY_COMPARATOR", `$.records[${primary.firstIdx}].isPrimaryComparator`);
  return file;
}
