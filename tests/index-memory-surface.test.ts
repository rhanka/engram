/**
 * Package-entry barrel — the agent-memory surface (SPEC_AGENT_MEMORY_SUBSTRATE
 * §9.4/§5). A host (h2a, a server) must be able to import the WHOLE contract from
 * the package entry: the ctx-carrying factory functions, the port + note types,
 * and the storage append types the contract's cabling needs. Before this barrel
 * existed the substrate was landed but importable only via deep `src/...` paths.
 *
 * These are RUNTIME assertions on the value exports; the type exports are proven
 * by tsc (this file imports them and would fail to compile if absent).
 */
import { describe, expect, it } from "vitest";

import * as api from "../src/index.js";
import type {
  // memory port + note types (canonical source: memory-producer-port)
  MemoryPort,
  MemoryProducerPort,
  MemoryRecallPort,
  MemoryContext,
  MemoryNoteInput,
  MemoryKind,
  MemoryScope,
  MemoryEventAnchor,
  MemoryProvenance,
  AdmissionOutcome,
  PromotionOutcome,
  PromotionEvidence,
  TombstoneTarget,
  TombstoneAuthorization,
  TombstoneOutcome,
  MemoryRecallQuery,
  RecalledMemoryNoteView,
  MemoryRecallResultView,
  // factory deps (memory-factory)
  MemoryProducerDeps,
  MemoryRecallDeps,
  MemoryAppendStore,
  // recall pure-surface types (memory-recall)
  MemoryTombstone,
  MemoryRecallInput,
  // storage append types the contract cables against (storage/types)
  GraphNodeInput,
  GraphTombstoneInput,
  GraphStoreAppendCapability,
} from "../src/index.js";

describe("package entry exposes the agent-memory value surface", () => {
  it("exports the three ctx-carrying factory functions", () => {
    expect(typeof api.createMemoryProducer).toBe("function");
    expect(typeof api.createMemoryRecall).toBe("function");
    expect(typeof api.createMemoryPort).toBe("function");
  });

  it("exports the data-pure port helpers (version + shape pre-flight)", () => {
    expect(api.MEMORY_PRODUCER_PORT_VERSION).toBe(1);
    expect(typeof api.validateMemoryNoteShape).toBe("function");
    // the shape pre-flight really runs from the barrel export
    const bad = api.validateMemoryNoteShape({ node_type: "NotAMemoryNote" });
    expect(bad.ok).toBe(false);
  });

  it("exports the recall pure entry point + schema", () => {
    expect(typeof api.recallMemory).toBe("function");
    expect(api.MEMORY_RECALL_SCHEMA).toBe("graphify.memory-recall/v1");
  });
});

// Type-only usage: this block never runs, but referencing every imported type
// forces tsc to prove each is exported from the package entry (Item 1's core).
describe("package entry exposes the agent-memory type surface (tsc-proven)", () => {
  it("compiles against every re-exported memory + append type", () => {
    const _types = (
      _port?: MemoryPort,
      _prod?: MemoryProducerPort,
      _recall?: MemoryRecallPort,
      _ctx?: MemoryContext,
      _note?: MemoryNoteInput,
      _kind?: MemoryKind,
      _scope?: MemoryScope,
      _ev?: MemoryEventAnchor,
      _prov?: MemoryProvenance,
      _admit?: AdmissionOutcome,
      _promo?: PromotionOutcome,
      _evid?: PromotionEvidence,
      _tt?: TombstoneTarget,
      _ta?: TombstoneAuthorization,
      _to?: TombstoneOutcome,
      _q?: MemoryRecallQuery,
      _rv?: RecalledMemoryNoteView,
      _rrv?: MemoryRecallResultView,
      _pd?: MemoryProducerDeps,
      _rd?: MemoryRecallDeps,
      _as?: MemoryAppendStore,
      _ts?: MemoryTombstone,
      _ri?: MemoryRecallInput,
      _ni?: GraphNodeInput,
      _ti?: GraphTombstoneInput,
      _ac?: GraphStoreAppendCapability,
    ): void => {
      void _port; void _prod; void _recall; void _ctx; void _note; void _kind;
      void _scope; void _ev; void _prov; void _admit; void _promo; void _evid;
      void _tt; void _ta; void _to; void _q; void _rv; void _rrv; void _pd;
      void _rd; void _as; void _ts; void _ri; void _ni; void _ti; void _ac;
    };
    expect(typeof _types).toBe("function");
  });
});
