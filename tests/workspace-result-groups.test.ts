/**
 * Track G G6-2 (S1.5) — RESULTS grouped by taxonomy.
 *
 * groupRecordsByType applies activeType + facetState + searchQuery to a
 * dataset and returns one group per remaining node_type id, sorted by
 * count desc. Groups are collapsed by default (open=false). No
 * corpus-specific id is hardcoded.
 */
import { describe, expect, it } from "vitest";

import {
  groupRecordsByType,
  type WorkspaceResultRecord,
} from "../src/workspace/index.js";

const dataset: WorkspaceResultRecord[] = [
  { id: "holmes", label: "Sherlock Holmes", node_type: "Character", status: "approved" },
  { id: "watson", label: "Dr Watson", node_type: "Character", status: "approved" },
  { id: "moriarty", label: "Professor Moriarty", node_type: "Character", status: "needs_review" },
  { id: "baker_street", label: "Baker Street", node_type: "Location", status: "approved" },
  { id: "study_in_scarlet", label: "A Study in Scarlet", node_type: "Work", status: "approved" },
];

describe("Track G G6-2 — RESULTS grouped by taxonomy", () => {
  it("produces one group per node_type, ordered by count desc, collapsed by default", () => {
    const groups = groupRecordsByType(dataset, {
      activeType: "all",
      facetState: {},
      searchQuery: "",
    });
    expect(groups.map((g) => g.typeId)).toEqual(["Character", "Location", "Work"]);
    expect(groups[0]?.count).toBe(3);
    expect(groups[0]?.open).toBe(false);
  });

  it("filters by activeType (all but the requested type are dropped)", () => {
    const groups = groupRecordsByType(dataset, {
      activeType: "Location",
      facetState: {},
      searchQuery: "",
    });
    expect(groups.map((g) => g.typeId)).toEqual(["Location"]);
    expect(groups[0]?.count).toBe(1);
  });

  it("applies facetState (status=approved drops 'needs_review' members)", () => {
    const groups = groupRecordsByType(dataset, {
      activeType: "all",
      facetState: { status: "approved" },
      searchQuery: "",
    });
    const character = groups.find((g) => g.typeId === "Character");
    expect(character?.count).toBe(2);
  });

  it("applies searchQuery (label substring on lower-cased input)", () => {
    const groups = groupRecordsByType(dataset, {
      activeType: "all",
      facetState: {},
      searchQuery: "holmes",
    });
    // Only "Sherlock Holmes" matches → single Character group with count 1.
    expect(groups.map((g) => g.typeId)).toEqual(["Character"]);
    expect(groups[0]?.count).toBe(1);
  });

  it("'all' facet value is treated the same as an unset key", () => {
    const groups = groupRecordsByType(dataset, {
      activeType: "all",
      facetState: { status: "all" },
      searchQuery: "",
    });
    const total = groups.reduce((acc, g) => acc + g.count, 0);
    expect(total).toBe(dataset.length);
  });

  it("honours profile-declared result_groups override (preserves caller-supplied order)", () => {
    const groups = groupRecordsByType(dataset, {
      activeType: "all",
      facetState: {},
      searchQuery: "",
      resultGroups: ["Work", "Character"],
    });
    expect(groups.map((g) => g.typeId)).toEqual(["Work", "Character"]);
  });
});
