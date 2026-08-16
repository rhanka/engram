import { describe, expect, it } from "vitest";

import { hasProjectionEnvelope } from "../graphify-memory/index.js";

const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("projection carrier", () => {
  it("requires every projected node edge and vector to carry a valid neutral envelope", () => {
    expect(hasProjectionEnvelope({ node_id: "node:one" })).toBe(false);
    expect(hasProjectionEnvelope({
      node_id: "node:one",
      projection: {
        schema_version: 1,
        record_id: "mem_one",
        record_digest: DIGEST,
        scope_ref: "scope:case-7",
        valid_time: { t: 1 },
        projection_cursor: "1",
        envelope_digest: DIGEST,
      },
    })).toBe(false);
  });
});
