/** Sol R1 F01 (§6.0) — Published schemas are recursive: no `series: [null]`, no unconstrained nested objects. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TIMING_SCHEMAS } from "../../src/time-reference/index.js";
import { validateTimingSchemas } from "../../src/repo-knowledge-contract.js";
import { solRule } from "./sol-r1-helpers.js";

function resolvePath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

describe("Sol R1 F01 recursive closed schemas", () => {
  const rule = solRule("F01") as { closedSchemaPaths: string[] };

  it("every listed nested schema is a closed object", () => {
    for (const p of rule.closedSchemaPaths) {
      const node = resolvePath(TIMING_SCHEMAS, p);
      expect(node, p).toBeTypeOf("object");
      expect((node as Record<string, unknown>)["type"], p).toBe("object");
      expect((node as Record<string, unknown>)["additionalProperties"], p).toBe(false);
    }
  });

  it("the published timing.schema.json artifact matches the code schemas exactly", () => {
    const artifact = JSON.parse(
      readFileSync(new URL("../../profiles/repo-knowledge/1/timing.schema.json", import.meta.url), "utf8"),
    );
    expect(artifact).toEqual(TIMING_SCHEMAS);
  });

  it("validateTimingSchemas enforces closure recursively on the published document", () => {
    expect(validateTimingSchemas(TIMING_SCHEMAS).ok).toBe(true);
    const open = JSON.parse(JSON.stringify(TIMING_SCHEMAS)) as Record<string, Record<string, unknown>>;
    delete open["CohortV1"]?.["additionalProperties"];
    expect(validateTimingSchemas(open).ok).toBe(false);
  });
});
