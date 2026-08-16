import { describe, expect, it } from "vitest";

import { isVisibleAtDualAsOf } from "../graphify-memory/index.js";

describe("dual as-of foundation", () => {
  it("valid and system axes vary independently at inclusive boundaries", () => {
    const interval = { t: 100, t_end: 200 };

    expect(isVisibleAtDualAsOf(interval, "7", { valid_as_of: 100, system_as_of: "7" })).toBe(true);
    expect(isVisibleAtDualAsOf(interval, "7", { valid_as_of: 200, system_as_of: "7" })).toBe(true);
    expect(isVisibleAtDualAsOf(interval, "7", { valid_as_of: 201, system_as_of: "7" })).toBe(false);
    expect(isVisibleAtDualAsOf(interval, "7", { valid_as_of: 100, system_as_of: "6" })).toBe(false);
    expect(isVisibleAtDualAsOf(interval, "7", { valid_as_of: 150, system_as_of: "8" })).toBe(true);
  });
});
