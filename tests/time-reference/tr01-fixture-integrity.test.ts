/** TR-01 — Fixture integrity: vendored L0-D archives match section 2.2 byte for byte. */
import { describe, expect, it } from "vitest";
import { fixtureBytes, sha256Hex } from "./l0d.js";

const EXPECTED: Record<string, { sha256: string; bytes: number }> = {
  "github-sample.json": {
    sha256: "5f46c9f98fc97e0efd9caa7bfdb39a9cca3088a7c7fb6204b119d1724ce1452a",
    bytes: 171533,
  },
  "engram-enriched.json": {
    sha256: "37a9c54032d3b56dd0c78f0aab886da260502a7805b2c898e7fa7377b2596ab7",
    bytes: 15317,
  },
  "engram-older.json": {
    sha256: "be8e2abc21fec7a775b9db26329915ff1be7e275abec790dead565eedeceb97f",
    bytes: 28540,
  },
  "skipped-check-anomalies.json": {
    sha256: "c2f53819003af26509f0df38fb4c2b7eb4c4a7edfb53ed154c6d43ec56022a65",
    bytes: 8439,
  },
};

describe("TR-01 fixture integrity (archives)", () => {
  for (const [name, want] of Object.entries(EXPECTED)) {
    it(`${name}: SHA-256 and byte length equal section 2.2 exactly`, () => {
      const bytes = fixtureBytes(name);
      expect(sha256Hex(bytes)).toBe(want.sha256);
      expect(bytes.length).toBe(want.bytes);
    });
  }

  it("no re-canonicalized copy passes as the archive", () => {
    for (const name of Object.keys(EXPECTED)) {
      const raw = fixtureBytes(name).toString("utf8");
      const recanonical = `${JSON.stringify(JSON.parse(raw))}`;
      // A re-canonicalized copy (no whitespace) differs by construction;
      // only the pinned bytes above are the archive.
      expect(sha256Hex(Buffer.from(recanonical))).not.toBe(EXPECTED[name]?.sha256);
    }
  });
});
