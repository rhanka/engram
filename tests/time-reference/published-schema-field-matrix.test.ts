import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateCollectionManifest } from "../../src/time-reference/index.js";
import { INSTANT_PATTERN } from "../../src/time-reference/schemas.js";
import { baseDto, type FieldRow, type Obj } from "./dto-matrix-helpers.js";

const { rows } = JSON.parse(readFileSync(new URL("./fixtures/dto-fields.json", import.meta.url), "utf8")) as { rows: FieldRow[] };
const published = JSON.parse(readFileSync(new URL("../../profiles/repo-knowledge/1/timing.schema.json", import.meta.url), "utf8")) as Record<string, Obj>;

// Independent field declarations and boundary cases verify the shared instant pattern.
const utcInstant = {
  type: "string", pattern: INSTANT_PATTERN, format: "date-time",
  description: "UTC instant; full calendar validity (e.g. 2026-02-30) is enforced by the runtime validator.",
};
function declaredConstraint(format: string): Obj {
  if (format.startsWith("literal:")) return { const: format.slice("literal:".length) };
  if (format.startsWith("enum:")) return { enum: format.slice("enum:".length).split("|") };
  if (format === "instant|unknown") return { anyOf: [utcInstant, { const: "unknown" }] };
  if (format.endsWith("|null")) {
    const constraint = declaredConstraint(format.slice(0, -"|null".length));
    return { ...constraint, type: [constraint.type, "null"] };
  }
  switch (format) {
    case "instant": return utcInstant;
    case "digest": return { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
    case "sha": return { type: "string", pattern: "^[0-9a-f]{40}$" };
    case "repo": return { type: "string", pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$" };
    case "integer-string": return { type: "string", pattern: "^[0-9]+$" };
    case "identifier": return { type: ["integer", "string"] };
    case "array": case "object": case "boolean": case "integer": case "string": return { type: format };
    default: throw new Error(`undeclared field constraint: ${format}`);
  }
}

function resolve(schemas: Record<string, Obj>, dto: string, path: string): { node: Obj; parent: Obj; field: string } {
  let node = schemas[dto]!;
  let parent = node;
  let field = "";
  for (field of path.replaceAll("[]", ".[]").split(".")) {
    parent = node;
    node = (field === "[]" ? parent?.items : (parent?.properties as Obj)?.[field]) as Obj;
    if (!node || typeof node !== "object" || Array.isArray(node)) throw new Error(`missing schema node: ${dto}.${path}`);
  }
  return { node, parent, field };
}

function assertField(schemas: Record<string, Obj>, [dto, path, format, presence]: FieldRow): void {
  const identity = `${dto}.${path}`;
  const { node, parent, field } = resolve(schemas, dto, path);
  const constraintKeys = ["type", "const", "enum", "pattern", "format", "description", "anyOf", "oneOf", "allOf", "not", "$ref"];
  const actual = Object.fromEntries(Object.entries(node).filter(([key]) => constraintKeys.includes(key)));
  expect(actual, identity).toEqual(declaredConstraint(format));
  if (field === "[]") expect(presence, `${identity} element schema`).toBe("required");
  else {
    expect(Array.isArray(parent.required), `${identity} parent required list`).toBe(true);
    expect((parent.required as string[]).includes(field), `${identity} presence`).toBe(presence === "required");
  }
  if (format === "object") expect(node.additionalProperties, `${identity} object closure`).toBe(false);
}

describe("published schema constraints for every DTO field", () => {
  it("uses all 415 declarations and closes every DTO root", () => {
    expect(rows).toHaveLength(415);
    expect(Object.keys(published).sort()).toEqual([...new Set(rows.map(([dto]) => dto))].sort());
    for (const [dto, node] of Object.entries(published)) {
      expect(node.type, dto).toBe("object");
      expect(node.additionalProperties, `${dto} object closure`).toBe(false);
    }
  });

  it.each(rows)("%s.%s carries %s (%s, %s)", (dto, path, format, presence, source) => {
    assertField(published, [dto, path, format, presence, source]);
  });

  it.each(rows.filter(([, , format]) => format.startsWith("instant")))(
    "%s.%s bounds UTC instant components and fractional precision",
    (dto, path) => {
      const { node } = resolve(published, dto, path);
      const instantNode = node.anyOf ? (node.anyOf as Obj[])[0]! : node;
      const pattern = new RegExp(instantNode.pattern as string);
      for (const value of [
        "2026-99-99T99:99:99Z", "2026-00-01T00:00:00Z", "2026-13-01T00:00:00Z",
        "2026-01-00T00:00:00Z", "2026-01-32T00:00:00Z", "2026-01-01T24:00:00Z",
        "2026-01-01T00:60:00Z", "2026-01-01T00:00:60Z", "2026-01-01T00:00:00+01:00",
        "2026-01-01T00:00:00.Z", "2026-01-01T00:00:00.1234Z",
      ]) expect(pattern.test(value), `${dto}.${path}: ${value}`).toBe(false);
      for (const value of [
        "2026-01-01T00:00:00Z", "2026-12-31T23:59:59Z", "2024-02-29T12:00:00Z",
        "2026-01-01T00:00:00.1Z", "2026-01-01T00:00:00.12Z", "2026-01-01T00:00:00.123Z",
      ]) expect(pattern.test(value), `${dto}.${path}: ${value}`).toBe(true);
    },
  );

  it("enforces full calendar validity through the runtime validator", () => {
    const valid = baseDto("CollectionManifestV1");
    expect(validateCollectionManifest(valid).ok).toBe(true);
    for (const collectedAt of ["2024-02-29T00:00:00Z", "2000-02-29T00:00:00Z"]) {
      expect(validateCollectionManifest({ ...valid, collectedAt }).ok, collectedAt).toBe(true);
    }
    for (const collectedAt of ["2026-02-30T00:00:00Z", "2026-02-29T00:00:00Z", "2100-02-29T00:00:00Z"]) {
      expect(validateCollectionManifest({ ...valid, collectedAt }), collectedAt).toMatchObject({
        ok: false, errors: [{ code: "bad-instant", path: "collectedAt" }],
      });
    }
  });

  const mutations: [string, string, string, (node: Obj, parent: Obj, field: string) => void][] = [
    ["profileRef.id without const", "CommittedExportV1", "profileRef.id", node => { delete node.const; }],
    ["installedAt as a free string", "DeliveryMilestonesV1", "installMilestones[].installedAt", node => {
      delete node.anyOf; node.type = "string";
    }],
    ["nested installedAt as a free string", "CommittedExportV1", "milestones[].installMilestones[].installedAt", node => {
      delete node.anyOf; node.type = "string";
    }],
    ["instant without UTC pattern", "CollectionManifestV1", "collectedAt", node => { delete node.pattern; }],
    ["digest without pattern", "CollectionManifestV1", "snapshotDigest", node => { delete node.pattern; }],
    ["SHA without pattern", "CollectionManifestV1", "sourceRevision", node => { delete node.pattern; }],
    ["widened enum", "CohortV1", "metric", node => { (node.enum as string[]).push("unpublished-value"); }],
    ["wrong scalar type", "CollectionManifestV1", "pageSize", node => { node.type = "number"; }],
    ["lost nullability", "CollectionManifestV1", "firstAvailableAt", node => { node.type = "string"; }],
    ["extra nullability", "CollectionManifestV1", "cutoff", node => { node.type = ["string", "null"]; }],
    ["required field made optional", "CollectionManifestV1", "cutoff", (_node, parent, field) => {
      parent.required = (parent.required as string[]).filter(name => name !== field);
    }],
    ["optional field made required", "PullRequestTimingV1", "url", (_node, parent, field) => {
      (parent.required as string[]).push(field);
    }],
    ["open nested object", "CommittedExportV1", "profileRef", node => { node.additionalProperties = true; }],
    ["unconstrained array element", "CollectionManifestV1", "inclusionIds[]", node => { delete node.type; }],
  ];

  it.each(mutations)("detects %s", (_name, dto, path, edit) => {
    const row = rows.find(([name, field]) => name === dto && field === path)!;
    assertField(published, row);
    const changed = structuredClone(published);
    const { node, parent, field } = resolve(changed, dto, path);
    edit(node, parent, field);
    expect(() => assertField(changed, row)).toThrow(`${dto}.${path}`);
  });
});
