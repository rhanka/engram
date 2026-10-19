import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TIMING_SCHEMAS } from "../../src/time-reference/index.js";
import { baseDto, mutate, regeneration, validators, type FieldRow, type Obj } from "./dto-matrix-helpers.js";

const { rows } = JSON.parse(readFileSync(new URL("./fixtures/dto-fields.json", import.meta.url), "utf8")) as { rows: FieldRow[] };
const executed = new Set<string>();
function invalidValues(format: string): unknown[] {
  const nullable = format.endsWith("|null");
  const type = format.replace(/\|null$/, "");
  const invalid: unknown[] = nullable ? [] : [null];
  if (type === "array") return [...invalid, "array", 1, true, {}];
  if (type === "object") return [...invalid, "object", 1, true, []];
  invalid.push({}, []);
  if (type === "boolean") return [...invalid, "true", 1];
  if (type === "integer") return [...invalid, "1", true, 1.5];
  if (type === "identifier") return [...invalid, true, 1.5];
  invalid.push(1, 1.5, true);
  if (type === "digest") invalid.push("garbage", "sha256:x", "a".repeat(64), `sha256:${"A".repeat(64)}`, `sha256:${"a".repeat(63)}`, `sha256:${"a".repeat(65)}`);
  if (type === "sha") invalid.push("main", "abc", "A".repeat(40), "a".repeat(39), "a".repeat(41));
  if (type === "instant" || type === "instant|unknown") invalid.push("yesterday", "2026-10-18T10:00:00+01:00");
  if (type === "integer-string") invalid.push("1.5", "1e2", "-1");
  if (type === "repo") invalid.push("repo", "owner/repo/extra");
  if (type.startsWith("enum:") || type.startsWith("literal:")) invalid.push("unpublished-value");
  return invalid;
}

describe("all published DTO fields through public validation and regeneration", () => {
  for (const [dto, path, format, presence, source] of rows) {
    const identity = `${dto}.${path}`;
    it(`${identity} rejects every invalid ${format} (${source})`, () => {
      const base = baseDto(dto, path);
      expect(validators[dto]!(base), "valid control before mutation").toMatchObject({ ok: true });
      expect(regeneration(dto, base), "valid regeneration control").toEqual([]);
      for (const value of invalidValues(format)) {
        const changed = mutate(base, path, value);
        const label = `${identity} = ${JSON.stringify(value)}`;
        expect(validators[dto]!(changed).ok, `validation: ${label}`).toBe(false);
        const errors = regeneration(dto, changed, path);
        expect(errors.length, `regeneration: ${label}`).toBeGreaterThan(0);
        expect(errors.map(e => e.code), label).not.toContain("digest-mismatch");
      }
      if (presence === "required" && !path.endsWith("[]")) {
        const absent = mutate(base, path, undefined, true);
        expect(validators[dto]!(absent).ok, `required ${identity}`).toBe(false);
        expect(regeneration(dto, absent, path).length, `required regeneration ${identity}`).toBeGreaterThan(0);
      } else if (presence === "optional") {
        let absent = mutate(base, path, undefined, true);
        // Budget fields are individually optional but exactly one is required (§6.6).
        if (/\b(targetSeconds|boundSeconds)$/.test(path)) {
          const counterpart = path.replace(/(targetSeconds|boundSeconds)$/, name => name === "targetSeconds" ? "boundSeconds" : "targetSeconds");
          absent = mutate(absent, counterpart, 100);
        }
        if (path.endsWith("receiptRef")) {
          // A receipt reference is optional only while installation is unknown (§6.9).
          absent = mutate(absent, path.replace(/receiptRef$/, "installedAt"), "unknown");
          absent = mutate(absent, path.replace(/receiptRef$/, "verdict"), "unknown");
        }
        expect(validators[dto]!(absent).ok, `optional ${identity}`).toBe(true);
        expect(regeneration(dto, absent), `optional regeneration ${identity}`).toEqual([]);
      }
      executed.add(identity);
    });
  }
  it("covers every field/element of every published schema with independent declarations and executed rows", () => {
    const published = JSON.parse(readFileSync(new URL("../../profiles/repo-knowledge/1/timing.schema.json", import.meta.url), "utf8")) as Record<string, Obj>;
    function paths(dto: string, schema: Obj, prefix = ""): string[] {
      const out: string[] = [];
      for (const [field, child] of Object.entries((schema.properties ?? {}) as Obj)) {
        const p = prefix + field;
        const node = child as Obj;
        out.push(`${dto}.${p}`);
        if (node.items) {
          out.push(`${dto}.${p}[]`);
          out.push(...paths(dto, node.items as Obj, `${p}[].`));
        } else out.push(...paths(dto, node, `${p}.`));
        const row = rows.find(r => r[0] === dto && r[1] === p);
        expect(row, `independent declaration for ${dto}.${p}`).toBeDefined();
        expect(row?.[3], `local presence of ${dto}.${p}`).toBe((schema.required as string[]).includes(field) ? "required" : "optional");
      }
      return out;
    }
    const declared = rows.map(([dto, p]) => `${dto}.${p}`).sort();
    expect(new Set(declared).size, "no duplicate declarations").toBe(rows.length);
    for (const schemas of [TIMING_SCHEMAS, published]) {
      expect(Object.keys(schemas).sort()).toEqual(Object.keys(validators).sort());
      expect(Object.entries(schemas).flatMap(([dto, schema]) => paths(dto, schema as unknown as Obj)).sort()).toEqual(declared);
    }
    expect([...executed].sort(), "every declared field driver completed").toEqual(declared);
  });
});
