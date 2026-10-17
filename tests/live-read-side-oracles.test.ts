import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("the twenty case manifest pins full OIDs permissions and independently verified expectations without inferring undocumented reasons", () => {
  const manifest = JSON.parse(readFileSync(new URL("./fixtures/live-read-side-cases.json", import.meta.url), "utf8"));
  expect(manifest.cases).toHaveLength(20);
  expect(manifest.cases.map((entry: { id: number }) => entry.id)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
});
