import { describe, expect, it } from "vitest";

import { buildMemory, recallRequest, seedAccepted } from "./memory-l7-fixture.js";

describe("bounded recall pagination", () => {
  it("all pages pin one profile and dual-as-of pair", async () => {
    const { memory } = buildMemory({});
    const seeded: string[] = [];
    for (let i = 0; i < 5; i++) seeded.push(await seedAccepted(memory, `theta shared page term unique${i}`));

    const collected: string[] = [];
    const profiles = new Set<string>();
    const validAsOf = new Set<number>();
    const systemAsOf = new Set<string>();

    let cursor: string | undefined;
    let pages = 0;
    do {
      const request = recallRequest("theta shared page term", { page: cursor === undefined ? { size: 2 } : { size: 2, cursor } });
      const recalled = await memory.recall(request);
      expect(recalled.ok).toBe(true);
      if (!recalled.ok) return;
      profiles.add(recalled.value.rank_receipt.profile);
      validAsOf.add(recalled.value.rank_receipt.valid_as_of);
      systemAsOf.add(recalled.value.rank_receipt.system_as_of);
      for (const entry of recalled.value.records) collected.push(entry.record.record_id);
      cursor = recalled.value.next_page_cursor;
      pages += 1;
      expect(pages).toBeLessThanOrEqual(10);
    } while (cursor !== undefined);

    // One profile and exactly one dual-as-of pair across every page.
    expect(profiles.size).toBe(1);
    expect(validAsOf.size).toBe(1);
    expect(systemAsOf.size).toBe(1);
    expect(pages).toBeGreaterThanOrEqual(3);

    // Every seeded record appears exactly once, no duplicates across pages.
    expect([...collected].sort()).toEqual([...seeded].sort());
    expect(new Set(collected).size).toBe(collected.length);
  });

  it("a page cursor conflicting with a fresh as_of pair is refused as stale", async () => {
    const { memory } = buildMemory({});
    for (let i = 0; i < 3; i++) await seedAccepted(memory, `iota conflict term unique${i}`);

    const first = await memory.recall(recallRequest("iota conflict term", { page: { size: 1 } }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const cursor = first.value.next_page_cursor!;
    expect(cursor).toBeTypeOf("string");

    // Re-use the page cursor but demand a different pinned system cursor → STALE_PAGE.
    const conflicting = await memory.recall(recallRequest("iota conflict term", {
      page: { size: 1, cursor },
      as_of: { system_cursor: "999" },
    }));
    expect(conflicting.ok).toBe(false);
    if (conflicting.ok) return;
    expect(conflicting.error.code).toBe("STALE_PAGE");
  });
});
