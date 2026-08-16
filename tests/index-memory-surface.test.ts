import { describe, expect, it } from "vitest";

import * as api from "../src/index.js";

describe("package entry has no legacy memory surface", () => {
  it("does not re-export removed v1 memory factories, ports, or recall helpers", () => {
    const legacyExports = [
      "createMemoryProducer",
      "createMemoryRecall",
      "createMemoryPort",
      "createMemoryPortForStore",
      "MEMORY_PRODUCER_PORT_VERSION",
      "MEMORY_RECALL_SCHEMA",
      "validateMemoryNoteShape",
      "recallMemory",
    ];

    expect(legacyExports.filter((name) => name in api)).toEqual([]);
  });
});
