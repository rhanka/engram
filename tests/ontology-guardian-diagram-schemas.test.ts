// Diagram schema negative/positive fixtures (design note round 3, section C).
// One negative fixture per required field and per closed enum, plus empty
// records, wrong types and extra properties; every pinned native document
// validates. Independent validator: Ajv 2020-12, Node only.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const testsDir = process.env.DIAGRAM_TESTS_DIR ?? dirname(fileURLToPath(import.meta.url));

import {
  DIAGRAM_PRESENTATION_CONTRACT_SCHEMA,
  DIAGRAM_SEMANTIC_SCHEMA,
  DIAGRAM_VIEW_SCHEMA,
} from "../src/ontology-guardian/diagram-schemas.js";

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSemantic = ajv.compile(DIAGRAM_SEMANTIC_SCHEMA.schema);
const validateView = ajv.compile(DIAGRAM_VIEW_SCHEMA.schema);
const validatePresentation = ajv.compile(DIAGRAM_PRESENTATION_CONTRACT_SCHEMA.schema);

const A64 = "a".repeat(64);

function minimalSemantic(): Record<string, unknown> {
  return {
    documentId: "document:test-1",
    revision: 0,
    profileRefs: ["generic@1"],
    entities: {
      "entity:a": {
        id: "entity:a", profile: "generic@1", type: "node",
        attributes: { name: { kind: "text", value: "A" } },
      },
    },
    relations: {},
  };
}

function minimalView(): Record<string, unknown> {
  return {
    viewId: "view:1",
    semanticDocumentId: "document:test-1",
    revision: 0,
    entityOccurrences: { "occurrence:a": { id: "occurrence:a", entity: "entity:a" } },
    relationOccurrences: {},
    portOccurrences: {},
    groups: {},
    filters: [],
  };
}

function minimalContract(): Record<string, unknown> {
  return {
    contractPin: { id: "diagram-presentation", version: "1", contentDigest: A64 },
    entities: {},
    legends: {},
    categoryTokens: [],
  };
}

describe("semantic schema negatives: every required field, enum and record", () => {
  it("rejects a missing required field, one per field", () => {
    for (const field of ["documentId", "revision", "profileRefs", "entities", "relations"]) {
      const doc = minimalSemantic();
      delete doc[field];
      expect(validateSemantic(doc), `missing ${field}`).toBe(false);
    }
  });

  it("rejects wrong types, empty records and extra properties", () => {
    expect(validateSemantic({})).toBe(false);
    expect(validateSemantic({ ...minimalSemantic(), revision: "0" })).toBe(false);
    expect(validateSemantic({ ...minimalSemantic(), profileRefs: [] })).toBe(false);
    expect(validateSemantic({ ...minimalSemantic(), profileRefs: ["generic@9"] })).toBe(false);
    expect(validateSemantic({ ...minimalSemantic(), surprise: true })).toBe(false);
    const badVersion = minimalSemantic();
    badVersion["schemaVersion"] = { major: 1 };
    expect(validateSemantic(badVersion)).toBe(false);
  });

  it("rejects empty port and type-definition records", () => {
    const ports = minimalSemantic();
    ports["ports"] = { "port:empty": {} };
    expect(validateSemantic(ports)).toBe(false);
    const typedefs = minimalSemantic();
    typedefs["typeDefinitions"] = { "custom": {} };
    expect(validateSemantic(typedefs)).toBe(false);
  });

  it("rejects malformed attribute values, one per kind defect", () => {
    const cases: unknown[] = [
      { value: "A" },
      { kind: "bogus", value: "A" },
      { kind: "text", value: "A", surprise: 1 },
      { kind: "text" },
      { kind: "collection" },
      { kind: "struct", type: "multiplicity" },
      { kind: "quantity", value: "1" },
      { kind: "boolean", value: "yes" },
    ];
    for (const value of cases) {
      const doc = minimalSemantic();
      ((doc["entities"] as Record<string, Record<string, unknown>>)["entity:a"] as Record<string, unknown>)["attributes"] = { name: value };
      expect(validateSemantic(doc), JSON.stringify(value)).toBe(false);
    }
  });

  it("accepts every native value kind and populated port/typedef records", () => {
    const doc = minimalSemantic();
    const attrs = ((doc["entities"] as Record<string, Record<string, unknown>>)["entity:a"] as Record<string, unknown>)["attributes"] as Record<string, unknown>;
    Object.assign(attrs, {
      state: { kind: "enum", value: "active" },
      weight: { kind: "quantity", value: 3, unit: "unit" },
      createdAt: { kind: "date", value: "2026-10-27" },
      pinned: { kind: "boolean", value: true },
      tags: { kind: "collection", items: [{ kind: "text", value: "store" }] },
      owner: { kind: "reference", refKind: "entity" },
      applied: { kind: "reference", value: "entity:b" },
      multiplicity: {
        kind: "struct", type: "multiplicity",
        fields: {
          lower: { kind: "quantity", value: 0, unit: "unit" },
          upper: { kind: "quantity", value: -1, unit: "unit" },
        },
      },
    });
    doc["ports"] = {
      "port:p": {
        id: "port:p", profile: "generic@1", type: "port", owner: "entity:a",
        direction: "in", label: "in", attributes: { label: { kind: "text", value: "in" } },
      },
    };
    doc["typeDefinitions"] = {
      "custom-node": { id: "custom-node", profile: "generic@1", baseType: "node", attributes: {} },
    };
    expect(validateSemantic(doc)).toBe(true);
  });

  it("accepts every pinned native document from the corpus", () => {
    const generic = JSON.parse(readFileSync(join(testsDir, "fixtures", "generic-v1-minimal-document.json"), "utf8"));
    expect(validateSemantic(generic)).toBe(true);
    for (const name of ["archimate-skeleton-document.json", "uml-skeleton-document.json"]) {
      const doc = (JSON.parse(readFileSync(join(testsDir, "fixtures", "pinned-sources", name), "utf8")) as { document: unknown }).document;
      expect(validateSemantic(doc)).toBe(true);
    }
  });

  it("keeps DiagramState packaging separate from SemanticDocument", () => {
    const doc = minimalSemantic();
    (doc as Record<string, unknown>)["views"] = [];
    expect(validateSemantic(doc)).toBe(false);
  });
});

describe("view schema negatives: the full native field set", () => {
  it("rejects an identity-only view and each missing native field", () => {
    expect(validateView({ viewId: "view:1", semanticDocumentId: "d", revision: 0 })).toBe(false);
    for (const field of [
      "viewId", "semanticDocumentId", "revision",
      "entityOccurrences", "relationOccurrences", "portOccurrences", "groups", "filters",
    ]) {
      const view = minimalView();
      delete view[field];
      expect(validateView(view), `missing ${field}`).toBe(false);
    }
    expect(validateView({ ...minimalView(), hover: true })).toBe(false);
  });

  it("rejects open or dangling occurrences, groups, filters and geometry", () => {
    const open = minimalView();
    (open["entityOccurrences"] as Record<string, unknown>)["occurrence:a"] = {
      id: "occurrence:a", entity: "entity:a", surprise: 1,
    };
    expect(validateView(open)).toBe(false);
    const missing = minimalView();
    (missing["entityOccurrences"] as Record<string, unknown>)["occurrence:a"] = { id: "occurrence:a" };
    expect(validateView(missing)).toBe(false);
    const rel = minimalView();
    rel["relationOccurrences"] = {
      "occurrence:r": { id: "occurrence:r", relation: "relation:x", endpoints: [{ role: "source" }], surprise: 1 },
    };
    expect(validateView(rel)).toBe(false);
    const port = minimalView();
    port["portOccurrences"] = { "occurrence:p": {} };
    expect(validateView(port)).toBe(false);
    const group = minimalView();
    group["groups"] = { "grp.1.a": { id: "grp.1.a", occurrence: "occurrence:a", collapsed: true, extra: 1 } };
    expect(validateView(group)).toBe(false);
    const filter = minimalView();
    filter["filters"] = [{ collapsed: [] }];
    expect(validateView(filter)).toBe(false);
    const geometry = minimalView();
    (geometry["entityOccurrences"] as Record<string, Record<string, unknown>>)["occurrence:a"]!["geometry"] = { x: 0, y: 0, z: 0 };
    expect(validateView(geometry)).toBe(false);
  });

  it("accepts complete native views with projection, fold and summary state", () => {
    const view = minimalView();
    (view["entityOccurrences"] as Record<string, unknown>)["occurrence:a"] = {
      id: "occurrence:a", entity: "entity:a", group: "grp.1.a", geometry: { x: 0, y: 0, width: 460, height: 200 },
    };
    view["relationOccurrences"] = {
      "occurrence:r": {
        id: "occurrence:r", relation: "relation:link-a", strokeStyle: "dashed",
        endpoints: [
          { role: "source", occurrence: "occurrence:a" },
          {
            role: "target", occurrence: "occurrence:a",
            semanticTarget: "entity:b", sourceOccurrence: "occurrence:b",
          },
        ],
        waypoints: [{ x: 1, y: 2 }],
      },
    };
    view["portOccurrences"] = {
      "occurrence:p": { id: "occurrence:p", port: "port:p", ownerOccurrence: "occurrence:a", side: "right", order: 0 },
    };
    view["groups"] = { "grp.1.a": { id: "grp.1.a", occurrence: "occurrence:a", collapsed: true } };
    view["filters"] = [{ kind: "in-fold", collapsed: ["occurrence:a"] }];
    view["presentation"] = {
      camera: { x: 0, y: 0, zoom: 1 },
      grid: { size: 8, snap: true },
      theme: "light",
      diagram: {
        contractPin: { id: "diagram-presentation", version: "1", contentDigest: A64 },
        entities: {
          "occurrence:a": { form: "card", text: { title: "A", kicker: "K" }, icon: "window", categoryRef: "entity:k" },
        },
        legends: { "occurrence:l": { order: ["entity:k"] } },
        categoryTokens: [{ legendRef: "occurrence:l", category: "genair", token: "st-semantic-data-category1" }],
      },
    };
    (view as Record<string, unknown>)["summaryLabels"] = {
      "sum:0": {
        id: "sum:0", sourceOccurrence: "occurrence:a", targetOccurrence: "occurrence:a",
        label: "Overview", relationIds: ["relation:link-a"], strokeStyle: "solid",
      },
    };
    expect(validateView(view)).toBe(true);
  });

  it("rejects incomplete presentation state and diagram values", () => {
    const camera = minimalView();
    camera["presentation"] = { camera: { x: 0, y: 0 } };
    expect(validateView(camera)).toBe(false);
    const diagram = minimalView();
    diagram["presentation"] = { diagram: { entities: {}, legends: {}, categoryTokens: [] } };
    expect(validateView(diagram)).toBe(false);
    const shape = minimalView();
    shape["presentation"] = {
      camera: { x: 0, y: 0, zoom: 1 },
      diagram: { ...minimalContract(), entities: { "occurrence:a": { text: {} } } },
    };
    expect(validateView(shape)).toBe(false);
  });
});

describe("presentation schema negatives: every required field and enum", () => {
  it("rejects a missing required field, one per field", () => {
    for (const field of ["contractPin", "entities", "legends", "categoryTokens"]) {
      const contract = minimalContract();
      delete contract[field];
      expect(validatePresentation(contract), `missing ${field}`).toBe(false);
    }
  });

  it("rejects bad pins, icons, tokens, bounds and extra properties", () => {
    const pin = minimalContract();
    (pin["contractPin"] as Record<string, unknown>)["contentDigest"] = "xyz";
    expect(validatePresentation(pin)).toBe(false);
    const icon = minimalContract();
    (icon["entities"] as Record<string, unknown>)["occurrence:k"] = {
      form: "legend-key", text: {}, icon: "https://example.com/i.svg",
    };
    expect(validatePresentation(icon)).toBe(false);
    const token = minimalContract();
    (token["categoryTokens"] as unknown[])!.push({ legendRef: "l", category: "GenAiR", token: "t" });
    expect(validatePresentation(token)).toBe(false);
    const title = minimalContract();
    (title["entities"] as Record<string, unknown>)["occurrence:k"] = {
      form: "card", text: { title: "t".repeat(201) },
    };
    expect(validatePresentation(title)).toBe(false);
    expect(validatePresentation({ ...minimalContract(), surprise: 1 })).toBe(false);
  });

  it("accepts the closed legend-key record with all retained strings", () => {
    const contract = minimalContract();
    (contract["entities"] as Record<string, unknown>)["occurrence:legend-genair"] = {
      form: "legend-key",
      text: {
        kicker: "TINT · BLUE",
        body: "GenAiR template, unchanged",
        detail: "standard GenAiR code and service",
        footer: "tint: genair",
      },
      icon: "window",
      categoryRef: "entity:legend-genair",
    };
    (contract["legends"] as Record<string, unknown>)["occurrence:legend"] = {
      order: ["entity:legend-genair"],
    };
    (contract["categoryTokens"] as unknown[])!.push({
      legendRef: "occurrence:legend", category: "genair", token: "st-semantic-data-category1",
    });
    expect(validatePresentation(contract)).toBe(true);
  });
});
