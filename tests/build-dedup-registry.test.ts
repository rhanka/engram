import { describe, expect, it } from "vitest";

import { deduplicateByLabel } from "../src/build.js";
import type { Extraction } from "../src/types.js";

function makeExtraction(
  nodes: Extraction["nodes"],
  edges: Extraction["edges"] = [],
): Extraction {
  return {
    nodes,
    edges,
    hyperedges: [],
    input_tokens: 0,
    output_tokens: 0,
  };
}

describe("deduplicateByLabel — registry identity preservation (G5)", () => {
  it("never merges same-source nodes with the same label and different registry_record_id (pass 1), keeping edges distinct", () => {
    const extraction = makeExtraction(
      [
        {
          id: "registry_processes_PS0107_90_01",
          label: "Regulatory directives",
          source_file: "registries/processes.csv",
          file_type: "document",
          node_type: "ProcessStdProcess",
          registry_id: "processes",
          registry_record_id: "PS0107.90.01",
        },
        {
          id: "registry_processes_PS0107_90_01_04",
          label: "Regulatory directives",
          source_file: "registries/processes.csv",
          file_type: "document",
          node_type: "ProcessStdProcess",
          registry_id: "processes",
          registry_record_id: "PS0107.90.01.04",
        },
        {
          id: "registry_processes_PS0107_90",
          label: "Continued regulatory",
          source_file: "registries/processes.csv",
          file_type: "document",
          node_type: "ProcessStdProcess",
          registry_id: "processes",
          registry_record_id: "PS0107.90",
        },
      ],
      [
        {
          source: "registry_processes_PS0107_90",
          target: "registry_processes_PS0107_90_01",
          relation: "parent_process_of",
          confidence: "EXTRACTED",
          source_file: "registries/processes.csv",
        },
        {
          source: "registry_processes_PS0107_90_01",
          target: "registry_processes_PS0107_90_01_04",
          relation: "parent_process_of",
          confidence: "EXTRACTED",
          source_file: "registries/processes.csv",
        },
      ],
    );

    const out = deduplicateByLabel(extraction);
    expect(out.nodes.map((n) => n.id)).toEqual([
      "registry_processes_PS0107_90_01",
      "registry_processes_PS0107_90_01_04",
      "registry_processes_PS0107_90",
    ]);
    expect(out.edges).toEqual([
      expect.objectContaining({
        source: "registry_processes_PS0107_90",
        target: "registry_processes_PS0107_90_01",
        relation: "parent_process_of",
      }),
      expect.objectContaining({
        source: "registry_processes_PS0107_90_01",
        target: "registry_processes_PS0107_90_01_04",
        relation: "parent_process_of",
      }),
    ]);
  });

  it("never merges same-source nodes with the same label and different registry_id (pass 1), keeping edges distinct", () => {
    const extraction = makeExtraction(
      [
        {
          id: "reg_processes_ad",
          label: "Regulatory directives",
          source_file: "registries/combined.csv",
          file_type: "document",
          registry_id: "processes",
        },
        {
          id: "reg_documents_ad",
          label: "Regulatory directives",
          source_file: "registries/combined.csv",
          file_type: "document",
          registry_id: "documents",
        },
        {
          id: "hub",
          label: "Regulatory Hub",
          source_file: "registries/combined.csv",
          file_type: "document",
        },
      ],
      [
        {
          source: "hub",
          target: "reg_processes_ad",
          relation: "governs",
          confidence: "EXTRACTED",
          source_file: "registries/combined.csv",
        },
        {
          source: "hub",
          target: "reg_documents_ad",
          relation: "publishes",
          confidence: "EXTRACTED",
          source_file: "registries/combined.csv",
        },
      ],
    );

    const out = deduplicateByLabel(extraction);
    expect(out.nodes.map((n) => n.id)).toEqual([
      "reg_processes_ad",
      "reg_documents_ad",
      "hub",
    ]);
    expect(out.edges).toEqual([
      expect.objectContaining({ source: "hub", target: "reg_processes_ad", relation: "governs" }),
      expect.objectContaining({ source: "hub", target: "reg_documents_ad", relation: "publishes" }),
    ]);
  });

  it("never merges cross-source chunk candidates with different registry identities (pass 2)", () => {
    const extraction = makeExtraction(
      [
        {
          id: "registry_zones_c1",
          label: "Central Zone",
          source_file: "registries/zones-a.csv",
          file_type: "document",
          registry_id: "zones",
          registry_record_id: "c1",
        },
        {
          id: "registry_zones_c2",
          label: "Central Zone",
          source_file: "registries/zones-b.csv",
          file_type: "document",
          registry_id: "zones",
          registry_record_id: "c2",
        },
        {
          id: "registry_other_c1",
          label: "Central Zone",
          source_file: "registries/other.csv",
          file_type: "document",
          registry_id: "other_zones",
          registry_record_id: "c1",
        },
      ],
      [
        {
          source: "registry_zones_c1",
          target: "registry_zones_c2",
          relation: "adjacent_to",
          confidence: "EXTRACTED",
          source_file: "registries/zones-a.csv",
        },
        {
          source: "registry_zones_c2",
          target: "registry_other_c1",
          relation: "overlaps",
          confidence: "EXTRACTED",
          source_file: "registries/other.csv",
        },
      ],
    );

    const out = deduplicateByLabel(extraction);
    expect(out.nodes.map((n) => n.id)).toEqual([
      "registry_zones_c1",
      "registry_zones_c2",
      "registry_other_c1",
    ]);
    expect(out.edges).toHaveLength(2);
  });

  it("covers camelCase and partition/registry field variants (registryRecordId, registryId, registry, registry_partition, registryPartition)", () => {
    const extraction = makeExtraction([
      {
        id: "camel_rec_1",
        label: "Shared ComponentName",
        source_file: "registries/camel.json",
        file_type: "document",
        registryRecordId: "REC-01",
      },
      {
        id: "camel_rec_2",
        label: "Shared ComponentName",
        source_file: "registries/camel.json",
        file_type: "document",
        registryRecordId: "REC-02",
      },
      {
        id: "camel_reg_1",
        label: "Shared SystemName",
        source_file: "registries/camel.json",
        file_type: "document",
        registryId: "sys_a",
      },
      {
        id: "camel_reg_2",
        label: "Shared SystemName",
        source_file: "registries/camel.json",
        file_type: "document",
        registryId: "sys_b",
      },
      {
        id: "bare_reg_1",
        label: "Shared BareRegistry",
        source_file: "registries/camel.json",
        file_type: "document",
        registry: "reg_alpha",
      },
      {
        id: "bare_reg_2",
        label: "Shared BareRegistry",
        source_file: "registries/camel.json",
        file_type: "document",
        registry: "reg_beta",
      },
      {
        id: "part_1",
        label: "Shared PartitionedZone",
        source_file: "registries/zones.csv",
        file_type: "document",
        registry_id: "zones",
        registry_partition: "north",
      },
      {
        id: "part_2",
        label: "Shared PartitionedZone",
        source_file: "registries/zones.csv",
        file_type: "document",
        registry_id: "zones",
        registryPartition: "south",
      },
    ]);

    const out = deduplicateByLabel(extraction);
    expect(out.nodes).toHaveLength(8);
  });

  it("still merges two nodes with the same label and the SAME registry identity", () => {
    const extraction = makeExtraction(
      [
        {
          id: "registry_processes_PS0107_90_01_c1",
          label: "Regulatory directives",
          source_file: "registries/processes.csv",
          file_type: "document",
          registry_id: "processes",
          registry_record_id: "PS0107.90.01",
        },
        {
          id: "registry_processes_PS0107_90_01",
          label: "Regulatory directives",
          source_file: "registries/processes.csv",
          file_type: "document",
          registry_id: "processes",
          registry_record_id: "PS0107.90.01",
        },
        {
          id: "registry_processes_PS0107_90_01_04",
          label: "Regulatory directives",
          source_file: "registries/processes.csv",
          file_type: "document",
          registry_id: "processes",
          registry_record_id: "PS0107.90.01.04",
        },
        {
          id: "registry_processes_PS0107_90_01_04_c2",
          label: "Regulatory directives",
          source_file: "docs/manual.md",
          file_type: "document",
          registry_id: "processes",
          registry_record_id: "PS0107.90.01.04",
        },
      ],
      [
        {
          source: "registry_processes_PS0107_90_01_c1",
          target: "registry_processes_PS0107_90_01_04_c2",
          relation: "parent_process_of",
          confidence: "EXTRACTED",
          source_file: "docs/manual.md",
        },
      ],
    );

    const out = deduplicateByLabel(extraction);
    expect(out.nodes.map((n) => n.id)).toEqual([
      "registry_processes_PS0107_90_01",
      "registry_processes_PS0107_90_01_04",
    ]);
    expect(out.edges).toEqual([
      expect.objectContaining({
        source: "registry_processes_PS0107_90_01",
        target: "registry_processes_PS0107_90_01_04",
        relation: "parent_process_of",
      }),
    ]);
  });

  it("keeps today's merge behaviour when only ONE of two same-label nodes carries a registry id", () => {
    const sameSource = makeExtraction(
      [
        {
          id: "registry_processes_PS0107_90_01",
          label: "Regulatory directives",
          source_file: "docs/regulatory.md",
          file_type: "document",
          registry_id: "processes",
          registry_record_id: "PS0107.90.01",
        },
        {
          id: "regulatory_directives_c1",
          label: "Regulatory directives",
          source_file: "docs/regulatory.md",
          file_type: "document",
        },
      ],
      [
        {
          source: "regulatory_directives_c1",
          target: "registry_processes_PS0107_90_01",
          relation: "mentions",
          confidence: "EXTRACTED",
          source_file: "docs/regulatory.md",
        },
      ],
    );

    const outPass1 = deduplicateByLabel(sameSource);
    expect(outPass1.nodes).toHaveLength(1);
    expect(outPass1.nodes[0]?.id).toBe("registry_processes_PS0107_90_01");
    expect(outPass1.edges).toHaveLength(0);

    const crossSourceChunk = makeExtraction([
      {
        id: "registry_processes_PS0107_90_01",
        label: "Regulatory directives",
        source_file: "registries/processes.csv",
        file_type: "document",
        registry_id: "processes",
        registry_record_id: "PS0107.90.01",
      },
      {
        id: "regulatory_directives_c1",
        label: "Regulatory directives",
        source_file: "docs/chunk-1.md",
        file_type: "document",
      },
    ]);

    const outPass2 = deduplicateByLabel(crossSourceChunk);
    expect(outPass2.nodes).toHaveLength(1);
    expect(outPass2.nodes[0]?.id).toBe("registry_processes_PS0107_90_01");
  });
});
