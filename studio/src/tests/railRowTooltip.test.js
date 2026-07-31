import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import HierarchyTreeNode from "../components/HierarchyTreeNode.svelte";
import OntologyClassNode from "../components/OntologyClassNode.svelte";

/* ===========================================================================
 * ELLIPSIZED RAIL ROWS KEEP THEIR FULL TEXT ON HOVER.
 *
 * The rail is 306px wide and every row is ONE LINE — a long process title or a
 * long node-type name truncates with an ellipsis rather than wrapping into a
 * column that pushes the whole subtree down. Truncation that DROPS information
 * is the bug: the reader must still be able to recover the full string.
 *
 * These lock the tooltip on both row shapes:
 *   - a BRANCH row is a DS `Collapsible`, whose label lives in a
 *     `.st-collapsible__title` span no prop can reach (`title` is consumed as
 *     the text prop and omitted from `...rest`) — the `collapsibleTitleTooltip`
 *     action stamps it;
 *   - a LEAF row is a DS `SelectableRow`, whose label is a snippet — the row
 *     wraps it in a titled span, the convention the rail already uses for
 *     entity and community labels.
 * ======================================================================== */

const LONG = "Assess supplier qualification and industrial capability readiness";

const forest = {
  root_ids: ["DE"],
  nodes_by_id: {
    DE: { child_ids: ["DE.AI"], level: 0, label: "Develop" },
    "DE.AI": { child_ids: [], level: 1, label: LONG },
  },
};

function hierarchyProps(nodeId) {
  return {
    nodeId,
    forestKey: "proc_tree",
    nodesById: forest.nodes_by_id,
    labelFor: (id) => String(id),
    sceneIdFor: () => null,
    selectedSet: new Set(),
    onSelectSubtree: () => {},
    ctx: null,
    depth: 0,
  };
}

let host;
let instance;
afterEach(() => {
  if (instance) unmount(instance);
  instance = null;
  host?.remove();
  host = null;
});

function render(component, props) {
  host = document.createElement("div");
  document.body.append(host);
  instance = mount(component, { target: host, props });
  flushSync();
  return host;
}

// A DS Collapsible renders its region only when OPEN, so nested rows do not
// exist in the DOM until their ancestors are expanded — exactly the lazy
// drill-down the rail relies on. Expand everything currently collapsed.
function expandAll(el) {
  for (let pass = 0; pass < 4; pass++) {
    const closed = [...el.querySelectorAll(".st-collapsible__trigger")].filter(
      (b) => b.getAttribute("aria-expanded") === "false",
    );
    if (!closed.length) return;
    for (const b of closed) b.click();
    flushSync();
  }
}

describe("hierarchy rows expose the untruncated label", () => {
  it("a BRANCH row titles the DS collapsible's own title span", () => {
    const el = render(HierarchyTreeNode, hierarchyProps("DE"));
    const title = el.querySelector(".st-collapsible__title");
    expect(title).not.toBeNull();
    // "CODE Label" — exactly the string the row renders (and clips).
    expect(title.textContent.trim()).toBe("DE Develop");
    expect(title.getAttribute("title")).toBe("DE Develop");
  });

  it("a LEAF row carries the full text on a titled span", () => {
    const el = render(HierarchyTreeNode, hierarchyProps("DE.AI"));
    const span = el.querySelector(".rail-hier-label");
    expect(span).not.toBeNull();
    expect(span.getAttribute("title")).toBe(`DE.AI ${LONG}`);
    expect(span.textContent.trim()).toBe(`DE.AI ${LONG}`);
  });

  it("a leaf row does NOT stamp a stale collapsible tooltip", () => {
    const el = render(HierarchyTreeNode, hierarchyProps("DE.AI"));
    expect(el.querySelector(".st-collapsible__title")).toBeNull();
  });
});

describe("ontology class rows expose the untruncated label", () => {
  const ctx = {
    entityStateOf: () => "normal",
    onSetEntityState: () => {},
    ontologyAbsorbed: new Map(),
    ontologyCheckedSet: new Set(),
    soloActive: false,
    typeSet: new Set(),
    entitySet: new Set(),
    labelForRaw: (id) => String(id),
    sceneIdForRaw: () => null,
    onSelectSubtree: () => {},
    onToggleType: () => {},
  };

  it("titles the class trigger and every leaf type row", () => {
    const el = render(OntologyClassNode, {
      node: {
        id: "class:Data",
        label: "Data — Engineering & Programme reference objects",
        count: 12448,
        types: [{ key: "DigitalApplicationTool", count: 4659 }],
        forests: [],
        subs: [],
      },
      ctx,
    });
    expect(el.querySelector(".st-collapsible__title").getAttribute("title")).toBe(
      "Data — Engineering & Programme reference objects",
    );
    expandAll(el);
    expect(el.querySelector(".rail-type-label").getAttribute("title")).toBe(
      "DigitalApplicationTool",
    );
  });

  it("scopes the tooltip to the row's OWN trigger, never its descendants'", () => {
    const el = render(OntologyClassNode, {
      node: {
        id: "class:Process",
        label: "Process",
        count: 4312,
        types: [],
        // TWO forests ⇒ each keeps its own sub-accordion, and each sub-accordion
        // must be titled with ITS OWN label, not the parent class's.
        forests: [
          {
            key: "abp",
            label: "ABP",
            nodeCount: 2030,
            rootIds: ["DE"],
            hierarchy: forest,
          },
          {
            key: "process_std",
            label: "PROCESS_STD",
            nodeCount: 2282,
            rootIds: ["DE"],
            hierarchy: forest,
          },
        ],
        subs: [],
      },
      ctx,
    });
    expandAll(el);
    const titles = [...el.querySelectorAll(".st-collapsible__title")].map((n) => [
      n.textContent.trim(),
      n.getAttribute("title"),
    ]);
    // Every collapsible trigger is titled with its own text — no bleed.
    for (const [text, attr] of titles) expect(attr).toBe(text);
    expect(titles.map(([t]) => t)).toEqual(expect.arrayContaining(["Process", "ABP", "PROCESS_STD"]));
  });
});
