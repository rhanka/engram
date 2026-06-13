import { describe, expect, it } from "vitest";

import {
  resolveNodeDescription,
  resolveNodeDescriptionText,
} from "../src/description-resolution.js";

describe("description resolution", () => {
  it("prefers a legacy inline graph.json description over a sidecar", () => {
    const result = resolveNodeDescription({
      node: { id: "holmes", description: "Inline canonical description." },
      sidecar: { status: "generated", description: "Sidecar fallback description." },
    });

    expect(result).toEqual({
      status: "generated",
      description: "Inline canonical description.",
      source: "legacy_inline",
    });
  });

  it("uses a fresh generated sidecar when inline description is absent", () => {
    const result = resolveNodeDescription({
      node: { id: "holmes" },
      sidecar: {
        status: "generated",
        description: "Fresh sidecar description.",
        description_context_hash: "ctx-a",
      },
      expectedContextHash: "ctx-a",
    });

    expect(result).toEqual({
      status: "generated",
      description: "Fresh sidecar description.",
      source: "sidecar",
    });
  });

  it("ignores stale and pending sidecars for renderable text", () => {
    expect(
      resolveNodeDescriptionText({
        node: { id: "holmes" },
        sidecar: {
          status: "generated",
          description: "Stale sidecar description.",
          description_context_hash: "ctx-old",
        },
        expectedContextHash: "ctx-new",
      }),
    ).toBeNull();

    expect(
      resolveNodeDescriptionText({
        node: { id: "holmes" },
        sidecar: { status: "pending", description: null },
      }),
    ).toBeNull();
  });
});
