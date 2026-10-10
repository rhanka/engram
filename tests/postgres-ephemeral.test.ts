import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decidePostgresLaneV1, postgresImageReference } from "./postgres-ephemeral.js";

const PINNED_16 = "postgres:16@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let initialImage16: string | undefined;
let initialImage17: string | undefined;

beforeEach(() => {
  initialImage16 = process.env.ENGRAM_MEMORY_POSTGRES_IMAGE_16;
  initialImage17 = process.env.ENGRAM_MEMORY_POSTGRES_IMAGE_17;
});

afterEach(() => {
  if (initialImage16 !== undefined) process.env.ENGRAM_MEMORY_POSTGRES_IMAGE_16 = initialImage16;
  else delete process.env.ENGRAM_MEMORY_POSTGRES_IMAGE_16;
  if (initialImage17 !== undefined) process.env.ENGRAM_MEMORY_POSTGRES_IMAGE_17 = initialImage17;
  else delete process.env.ENGRAM_MEMORY_POSTGRES_IMAGE_17;
});

describe("postgres ephemeral lane", () => {
  it("a required Postgres lane fails instead of skipping when Docker or an image is unavailable", () => {
    expect(
      decidePostgresLaneV1({ required: true, dockerAvailable: false, missingImages: [] }),
    ).toMatchObject({ lane: "fail" });
    expect(
      decidePostgresLaneV1({ required: true, dockerAvailable: true, missingImages: ["postgres:16"] }),
    ).toMatchObject({ lane: "fail" });
    expect(
      decidePostgresLaneV1({ required: true, dockerAvailable: true, missingImages: [] }).lane,
    ).toBe("run");
    expect(
      decidePostgresLaneV1({ required: false, dockerAvailable: false, missingImages: [] }).lane,
    ).toBe("skip");
    expect(
      decidePostgresLaneV1({ required: false, dockerAvailable: true, missingImages: ["postgres:17"] }).lane,
    ).toBe("skip");
    expect(
      decidePostgresLaneV1({ required: false, dockerAvailable: true, missingImages: [] }).lane,
    ).toBe("run");
  });

  it("image references honour the pinned override and default to postgres:<major>", () => {
    expect(postgresImageReference("16")).toBe("postgres:16");
    expect(postgresImageReference("17")).toBe("postgres:17");
    process.env.ENGRAM_MEMORY_POSTGRES_IMAGE_16 = PINNED_16;
    expect(postgresImageReference("16")).toBe(PINNED_16);
    expect(postgresImageReference("17")).toBe("postgres:17");
    process.env.ENGRAM_MEMORY_POSTGRES_IMAGE_16 = "   ";
    expect(postgresImageReference("16")).toBe("postgres:16");
  });
});
