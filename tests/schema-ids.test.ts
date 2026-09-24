import { describe, expect, it } from "vitest";

import {
  engramSchemaId,
  legacySchemaId,
  schemaIdAccepted,
} from "../src/schema-ids.js";

describe("schema-id prefix compat", () => {
  it("maps _v1 ids in both directions", () => {
    expect(legacySchemaId("engram_memory_v1")).toBe("graphify_memory_v1");
    expect(engramSchemaId("graphify_memory_v1")).toBe("engram_memory_v1");
  });

  it("maps any _vN version, not just _v1", () => {
    expect(legacySchemaId("engram_memory_v2")).toBe("graphify_memory_v2");
    expect(engramSchemaId("graphify_memory_v2")).toBe("engram_memory_v2");
    expect(legacySchemaId("engram_memory_v12")).toBe("graphify_memory_v12");
  });

  it("leaves non-versioned or foreign ids untouched", () => {
    expect(legacySchemaId("engram_memory")).toBe("engram_memory");
    expect(legacySchemaId("engram_memory_v")).toBe("engram_memory_v");
    expect(legacySchemaId("other_memory_v2")).toBe("other_memory_v2");
    expect(engramSchemaId("graphify_memory_vNext")).toBe("graphify_memory_vNext");
    expect(legacySchemaId("engram_memory_v2")).not.toBe("engram_memory_v2");
  });

  it("accepts the expected id or its legacy counterpart", () => {
    expect(schemaIdAccepted("engram_memory_v2", "engram_memory_v2")).toBe(true);
    expect(schemaIdAccepted("graphify_memory_v2", "engram_memory_v2")).toBe(true);
    expect(schemaIdAccepted("other_memory_v2", "engram_memory_v2")).toBe(false);
  });
});
