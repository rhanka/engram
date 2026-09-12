import { describe, expect, it, vi } from "vitest";

import { openOracle } from "./cdp-harness.mjs";

/**
 * Two concurrent oracles must drive two different pages.
 *
 * This lane runs five test files at once. The harness used to pick its
 * debugging port with `9400 + floor(Math.random() * 400)`, so two files could
 * draw the same number: the second Chrome failed to bind, the second oracle
 * connected to the FIRST one's endpoint, and both then wrote the same
 * page-global `window.__lastCanvas`. That is what produced a test asking for a
 * 400px capture and reading back exactly 900 — the width of whichever fixture
 * happened to be running next door.
 *
 * Pinning `Math.random` to 0 reproduces that collision deterministically,
 * without depending on how vitest happens to schedule the files. Against the
 * old harness both oracles target port 9400 and this test fails. With the port
 * assigned by the OS the mock has nothing left to influence, which is the
 * property being locked in: the collision is impossible, not merely unlikely.
 */
describe("cdp harness port isolation", () => {
  it("keeps two oracles on separate pages even when the port draw collides", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    let first: Awaited<ReturnType<typeof openOracle>> | null = null;
    let second: Awaited<ReturnType<typeof openOracle>> | null = null;

    try {
      first = await openOracle();
      second = await openOracle();

      await first.evaluate(`window.__portIsolationMarker = "first"`);
      await second.evaluate(`window.__portIsolationMarker = "second"`);

      // Reading its own marker back is the whole assertion: on a shared page
      // the second write lands on the first oracle's window and this reads
      // "second".
      await expect(first.evaluate(`window.__portIsolationMarker`)).resolves.toBe(
        "first",
      );
      await expect(
        second.evaluate(`window.__portIsolationMarker`),
      ).resolves.toBe("second");
    } finally {
      // Always close both, including when the assertion above fails: the red
      // phase of this test is expected, and leaking two Chrome processes and
      // their profile directories would pollute every run after it.
      randomSpy.mockRestore();
      if (first) await first.close();
      if (second) await second.close();
    }
  }, 180_000);
});
