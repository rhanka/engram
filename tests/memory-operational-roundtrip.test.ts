/**
 * Operational memory — LIVE Postgres round-trip (SPEC_AGENT_MEMORY_SUBSTRATE §9.5,
 * item-3c). Proves the whole operational slice against a REAL store: a note admitted
 * through `createMemoryPortForStore` (append D5) is recalled back out of the SAME
 * Postgres store (read-back v1), with the tier + review_status the admission stamped.
 *
 * ENV-GATED: runs ONLY with GRAPHIFY_TEST_POSTGRES_URL set (skips offline / in CI
 * without a database). The deterministic cabling is covered by memory-factory.test;
 * this is the end-to-end SQL proof the fakes cannot give.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createMemoryPortForStore, type MemoryOperationalStore } from "../src/memory-factory.js";
import type { MemoryNoteInput } from "../src/memory-producer-port.js";

describe.skipIf(!process.env.GRAPHIFY_TEST_POSTGRES_URL)(
  "operational memory: live Postgres round-trip (admit → store → recall)",
  () => {
    const connectionString = process.env.GRAPHIFY_TEST_POSTGRES_URL as string;
    const citySlug = `graphify_memory_rt_${Date.now()}`;
    const OWNER = "human:rt-test";
    const T = 1_750_000_000_000;

    it("admits a note and recalls it back from the SAME Postgres store, tier + status intact", async () => {
      const { createPostgresGraphStore } = await import("../src/storage/postgres.js");
      const store = await createPostgresGraphStore({
        connectionString,
        citySlug,
        target: mkdtempSync(join(tmpdir(), "graphify-mem-rt-")),
      });
      try {
        const port = createMemoryPortForStore(store as unknown as MemoryOperationalStore, {
          resolveSource: (ref) => (ref === "ref:A" ? "on 2026-08-01 correction Y was applied because Z" : null),
        });

        const noteInput: MemoryNoteInput = {
          node_type: "MemoryNote",
          memory_kind: "decision",
          subject: "agent-work",
          t: T,
          t_src: "authored-at",
          event: { at: T, kind: "decision-taken", ref: "ref:A" },
          provenance: { cited: "correction Y was applied", source: "ref:A" },
          principal_owner: OWNER,
          scope: "private",
        };
        const admit = await port.admitMemoryNote(noteInput, { principal_owner: OWNER });
        expect(admit.admitted).toBe(true);
        const admittedId = admit.admitted ? admit.id : "";

        const recall = await port.recallMemory({ asOf: T }, { principal_owner: OWNER });
        expect(recall.projection).toBe("notes-only");
        const got = recall.notes.find((n) => (n as Record<string, unknown>).id === admittedId) as
          | Record<string, unknown>
          | undefined;
        expect(got, "the admitted note must recall back from Postgres").toBeTruthy();
        expect(got!.trust).toBe("asserted");
        expect(got!.review_status).toBe("pending");
        expect(got!.principal_owner).toBe(OWNER);
        expect(got!.memory_kind).toBe("decision");
      } finally {
        await store.clear({ force: true });
        await store.close();
      }
    });
  },
);
