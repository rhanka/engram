import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import CitedSourceViewer from "../components/CitedSourceViewer.svelte";

/**
 * Component render smoke for the INTERIM cited-source viewer. The markdown
 * path mounts fully in jsdom (no canvas needed); the PDF path is covered by
 * the pure engine tests (citedSourcePdfEngine) + UAT screenshots. Also pins
 * the PURITY contract: the component must not import graphify runtime.
 */

const REFS = [
  {
    rawRef: "corpus/blue-study.md",
    section: "Chapter 2",
    excerpt: "the coronet had vanished from his private safe",
  },
  {
    rawRef: "corpus/blue-study.md",
    section: "Chapter 1",
    excerpt: "Holmes examined the ledger in silence",
  },
];

const SOURCE_TEXT =
  "# The Adventure of the Blue Study\n\n" +
  "Holmes examined the ledger in silence.\n\n" +
  "## Chapter 2\n\n" +
  "The banker confessed that the coronet had vanished from his private safe during the night.";

function mdResolver() {
  return vi.fn(async () => ({ kind: "markdown", text: SOURCE_TEXT }));
}

async function settle() {
  // Let the $effect-driven async load resolve and the DOM update.
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
  flushSync();
}

let host;
let instance;
afterEach(() => {
  if (instance) unmount(instance);
  instance = null;
  host?.remove();
  host = null;
});

function mountViewer(props) {
  host = document.createElement("div");
  document.body.appendChild(host);
  instance = mount(CitedSourceViewer, { target: host, props });
  flushSync();
  return host;
}

describe("CitedSourceViewer (markdown path)", () => {
  it("renders refs, resolves the source and highlights the active quote", async () => {
    const resolveSource = mdResolver();
    const el = mountViewer({
      refs: REFS,
      resolveSource,
      activeIndex: 0,
      title: "corpus/blue-study.md",
    });
    await settle();

    // Header + ref navigation reflect the ref list.
    expect(el.textContent).toContain("corpus/blue-study.md");
    expect(el.textContent).toContain("Citation 1/2");
    // The active quote is shown and located in the rendered source.
    expect(el.textContent).toContain("coronet had vanished");
    const mark = el.querySelector("[data-csv-mark]");
    expect(mark).not.toBeNull();
    expect(mark.textContent).toContain("coronet had vanished from his private safe");
    expect(resolveSource).toHaveBeenCalledTimes(1);
    expect(resolveSource).toHaveBeenCalledWith(REFS[0]);
  });

  it("switches the active ref (next) and re-highlights the new quote", async () => {
    const resolveSource = mdResolver();
    const el = mountViewer({ refs: REFS, resolveSource, activeIndex: 0, title: "t" });
    await settle();

    const next = [...el.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Next citation");
    expect(next).toBeTruthy();
    next.click();
    flushSync();
    await settle();

    expect(el.textContent).toContain("Citation 2/2");
    const mark = el.querySelector("[data-csv-mark]");
    expect(mark).not.toBeNull();
    expect(mark.textContent).toContain("Holmes examined the ledger");
    // One resolve per ref activation.
    expect(resolveSource).toHaveBeenCalledTimes(2);
  });

  it("honors the activeIndex prop for the initially-active citation", async () => {
    const el = mountViewer({ refs: REFS, resolveSource: mdResolver(), activeIndex: 1, title: "t" });
    await settle();
    expect(el.textContent).toContain("Citation 2/2");
    expect(el.querySelector("[data-csv-mark]")?.textContent).toContain("Holmes examined");
  });

  it("shows the graceful not-found note when the quote is not in the source", async () => {
    const el = mountViewer({
      refs: [{ rawRef: "corpus/blue-study.md", section: "X", excerpt: "a passage that is nowhere in this document" }],
      resolveSource: mdResolver(),
      title: "t",
    });
    await settle();
    expect(el.querySelector("[data-csv-mark]")).toBeNull();
    expect(el.textContent).toContain("Quote not located in the source");
    // The document still renders (show anyway).
    expect(el.textContent).toContain("Holmes examined the ledger");
  });

  it("surfaces resolver failures as a clear source-unavailable state", async () => {
    const el = mountViewer({
      refs: REFS,
      resolveSource: vi.fn(async () => {
        throw new Error("404 sources/corpus/blue-study.md");
      }),
      title: "t",
    });
    await settle();
    expect(el.textContent).toContain("Source unavailable");
    expect(el.textContent).toContain("404 sources/corpus/blue-study.md");
  });
});

describe("CitedSourceViewer qualified toolbar (immo parity)", () => {
  // Refs spanning TWO source documents: 2 in blue-study.md + 1 in notes.md.
  const MULTI_DOC_REFS = [
    ...REFS,
    { rawRef: "corpus/notes.md", section: "Notes", excerpt: "a passage from the second document" },
  ];
  const multiResolver = () =>
    vi.fn(async (r) =>
      r.rawRef === "corpus/notes.md"
        ? { kind: "markdown", text: "# Notes\n\nHere is a passage from the second document indeed." }
        : { kind: "markdown", text: SOURCE_TEXT },
    );

  it("shows the Doc x/y navigator only when refs span multiple documents", async () => {
    const single = mountViewer({ refs: REFS, resolveSource: mdResolver(), title: "t" });
    await settle();
    expect(single.textContent).not.toContain("Doc");
    unmount(instance);
    instance = null;
    host.remove();

    const multi = mountViewer({ refs: MULTI_DOC_REFS, resolveSource: multiResolver(), title: "t" });
    await settle();
    expect(multi.textContent).toContain("Doc");
    expect(multi.textContent).toContain("1/2");
    expect(multi.textContent).toContain("Citation 1/3");
  });

  it("Next document jumps to the FIRST ref of the next source file and loads it", async () => {
    const resolveSource = multiResolver();
    const el = mountViewer({ refs: MULTI_DOC_REFS, resolveSource, activeIndex: 0, title: "t" });
    await settle();

    const nextDoc = [...el.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Next document",
    );
    expect(nextDoc).toBeTruthy();
    nextDoc.click();
    flushSync();
    await settle();

    // Jumped to ref index 2 (first ref of corpus/notes.md) -> Citation 3/3, Doc 2/2.
    expect(el.textContent).toContain("Citation 3/3");
    expect(el.textContent).toContain("Doc 2/2");
    expect(resolveSource).toHaveBeenLastCalledWith(MULTI_DOC_REFS[2]);
    expect(el.querySelector("[data-csv-mark]")?.textContent).toContain("passage from the second document");
  });

  it("renders the Ouvrir raw-source link from the sourceHref callback", async () => {
    const el = mountViewer({
      refs: REFS,
      resolveSource: mdResolver(),
      sourceHref: (r) => `./sources/${r.rawRef}`,
      title: "t",
    });
    await settle();
    const link = el.querySelector("a.csv-tb-open");
    expect(link).not.toBeNull();
    expect(link.textContent).toContain("Ouvrir");
    expect(link.getAttribute("href")).toBe("./sources/corpus/blue-study.md");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("hides the Ouvrir link when sourceHref is absent or resolves null", async () => {
    const el = mountViewer({ refs: REFS, resolveSource: mdResolver(), title: "t" });
    await settle();
    expect(el.querySelector("a.csv-tb-open")).toBeNull();
  });

  it("pins the retarget contract in the source (thread identity + index props tracked)", () => {
    // A plain-JS vitest cannot push prop updates into a Svelte-5 mount(), so
    // the retarget-on-reopen behavior (new groups/refs array + indexes re-aim
    // an OPEN viewer, no stacking) is exercised end-to-end by the UAT run;
    // here we pin the load-bearing implementation: the $effect must compare
    // the groups AND refs identities AND both index props before reseeding,
    // and the scope prop must be tracked in its OWN effect (a consumer scope
    // echo must never re-seed an internally-navigated position).
    const source = readFileSync(
      resolve(process.cwd(), "src/components/CitedSourceViewer.svelte"),
      "utf8",
    );
    expect(source).toMatch(/groups !== lastGroupsProp \|\|/);
    expect(source).toMatch(/refs !== lastRefsProp \|\|/);
    expect(source).toMatch(/activeGroupIndex !== lastActiveGroupProp \|\|/);
    expect(source).toMatch(/activeIndex !== lastActiveProp\s*\n/);
    expect(source).toMatch(/lastRefsProp = refs;/);
    expect(source).toMatch(/lastGroupsProp = groups;/);
    expect(source).toMatch(/scope !== lastScopeProp/);
  });
});

describe("CitedSourceViewer grouped thread — selection scope (§S.6.1)", () => {
  // Two entities, each cited twice, across TWO documents (the approved
  // multi-entity fixture shape). Group refs are already thread-ordered
  // (selection → document → page) — the consumer glue owns that ordering.
  const NOTES_TEXT =
    "# Notes\n\nHere is a passage from the second document indeed.\n\n" +
    "Later, the doctor wrote his notes by the fire.";
  const GROUP_A = {
    id: "e:holmes",
    label: "Sherlock Holmes",
    refs: [
      { rawRef: "corpus/blue-study.md", section: "Chapter 1", excerpt: "Holmes examined the ledger in silence" },
      { rawRef: "corpus/notes.md", section: "Notes", excerpt: "a passage from the second document" },
    ],
  };
  const GROUP_B = {
    id: "e:watson",
    label: "John Watson",
    refs: [
      { rawRef: "corpus/blue-study.md", section: "Chapter 2", excerpt: "the coronet had vanished from his private safe" },
      { rawRef: "corpus/notes.md", section: "Notes", excerpt: "the doctor wrote his notes" },
    ],
  };
  const GROUPS = [GROUP_A, GROUP_B];
  const groupResolver = () =>
    vi.fn(async (r) =>
      r.rawRef === "corpus/notes.md"
        ? { kind: "markdown", text: NOTES_TEXT }
        : { kind: "markdown", text: SOURCE_TEXT },
    );
  const byLabel = (el, label) =>
    [...el.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label);
  const scopeBtn = (el, text) =>
    [...el.querySelectorAll(".csv-scope-btn")].find((b) => b.textContent.trim() === text);
  const pressKey = async (key) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    flushSync();
    await settle();
  };

  it("defaults to Entité scope: toggle shown, per-entity counter, no entity indicator", async () => {
    const el = mountViewer({ refs: [], groups: GROUPS, resolveSource: groupResolver(), title: "t" });
    await settle();
    expect(scopeBtn(el, "Entité")).toBeTruthy();
    expect(scopeBtn(el, "Sélection")).toBeTruthy();
    expect(scopeBtn(el, "Entité").getAttribute("aria-pressed")).toBe("true");
    // Counter covers the CURRENT entity only (2 refs), not the thread (4).
    expect(el.textContent).toContain("Citation 1/2");
    expect(el.querySelector('[aria-label="Entity navigator"]')).toBeNull();
    // Header follows the active group label.
    expect(el.textContent).toContain("Sherlock Holmes");
  });

  it("hides the scope toggle when only ONE group carries citations (plain Entité mode)", async () => {
    const el = mountViewer({
      refs: [],
      groups: [GROUP_A, { id: "e:empty", label: "Nobody", refs: [] }],
      resolveSource: groupResolver(),
      title: "t",
    });
    await settle();
    expect(el.querySelector(".csv-tb-scope")).toBeNull();
    expect(el.textContent).toContain("Citation 1/2");
  });

  it("Entité scope stops at the entity boundary (next disabled on its last citation)", async () => {
    const el = mountViewer({
      refs: [],
      groups: GROUPS,
      activeGroupIndex: 0,
      activeIndex: 1,
      resolveSource: groupResolver(),
      title: "t",
    });
    await settle();
    expect(el.textContent).toContain("Citation 2/2");
    expect(byLabel(el, "Next citation").disabled).toBe(true);
  });

  it("switching to Sélection makes the counter global and shows the entity indicator", async () => {
    const onScopeChange = vi.fn();
    const el = mountViewer({
      refs: [],
      groups: GROUPS,
      resolveSource: groupResolver(),
      onScopeChange,
      title: "t",
    });
    await settle();
    scopeBtn(el, "Sélection").click();
    flushSync();
    await settle();
    expect(onScopeChange).toHaveBeenCalledWith("selection");
    expect(el.textContent).toContain("Citation 1/4");
    const indicator = el.querySelector('[aria-label="Entity navigator"]');
    expect(indicator).not.toBeNull();
    expect(indicator.textContent).toContain("Entité");
    expect(indicator.textContent).toContain("1/2");
    expect(indicator.textContent).toContain("Sherlock Holmes");
  });

  it("Sélection scope crosses the entity boundary as ONE continuous thread + fires onFocusChange", async () => {
    const onFocusChange = vi.fn();
    const resolveSource = groupResolver();
    const el = mountViewer({
      refs: [],
      groups: GROUPS,
      activeGroupIndex: 0,
      activeIndex: 1, // last citation of entity A
      scope: "selection",
      resolveSource,
      onFocusChange,
      title: "t",
    });
    await settle();
    expect(el.textContent).toContain("Citation 2/4");

    byLabel(el, "Next citation").click();
    flushSync();
    await settle();

    // Landed on the FIRST citation of entity B — overlay never closed.
    expect(onFocusChange).toHaveBeenCalledWith("e:watson", 0);
    expect(el.textContent).toContain("Citation 3/4");
    const indicator = el.querySelector('[aria-label="Entity navigator"]');
    expect(indicator.textContent).toContain("2/2");
    expect(indicator.textContent).toContain("John Watson");
    expect(resolveSource).toHaveBeenLastCalledWith(GROUP_B.refs[0]);
    expect(el.querySelector("[data-csv-mark]")?.textContent).toContain("coronet had vanished");
  });

  it("keyboard n/N steps the ACTIVE scope; e/E jumps entities in Sélection scope", async () => {
    const onFocusChange = vi.fn();
    const el = mountViewer({
      refs: [],
      groups: GROUPS,
      scope: "selection",
      resolveSource: groupResolver(),
      onFocusChange,
      title: "t",
    });
    await settle();
    expect(el.textContent).toContain("Citation 1/4");

    await pressKey("n");
    expect(el.textContent).toContain("Citation 2/4");
    expect(onFocusChange).toHaveBeenLastCalledWith("e:holmes", 1);

    await pressKey("N");
    expect(el.textContent).toContain("Citation 1/4");

    await pressKey("e");
    expect(el.textContent).toContain("Citation 3/4");
    expect(onFocusChange).toHaveBeenLastCalledWith("e:watson", 0);

    await pressKey("E");
    expect(el.textContent).toContain("Citation 1/4");
    expect(onFocusChange).toHaveBeenLastCalledWith("e:holmes", 0);
  });

  it("keyboard e/E is inert in Entité scope (per the approved UX)", async () => {
    const el = mountViewer({ refs: [], groups: GROUPS, resolveSource: groupResolver(), title: "t" });
    await settle();
    expect(el.textContent).toContain("Citation 1/2");
    await pressKey("e");
    // Still on entity A, entity indicator still hidden.
    expect(el.textContent).toContain("Citation 1/2");
    expect(el.textContent).toContain("Sherlock Holmes");
    expect(el.querySelector('[aria-label="Entity navigator"]')).toBeNull();
  });

  it("flat refs mode still supports n/N as citation stepping (single anonymous group)", async () => {
    const el = mountViewer({ refs: REFS, resolveSource: mdResolver(), title: "t" });
    await settle();
    expect(el.textContent).toContain("Citation 1/2");
    await pressKey("n");
    expect(el.textContent).toContain("Citation 2/2");
    await pressKey("N");
    expect(el.textContent).toContain("Citation 1/2");
  });
});

describe("CitedSourceViewer purity (rebase seam)", () => {
  it("imports nothing from graphify — only the sibling pure lib and svelte", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/CitedSourceViewer.svelte"),
      "utf8",
    );
    const importSpecs = [
      ...source.matchAll(/^\s*import\s+(?:[\s\S]*?from\s+)?["']([^"']+)["']/gm),
    ].map((m) => m[1]);
    expect(importSpecs.length).toBeGreaterThan(0);
    for (const spec of importSpecs) {
      expect(spec).toMatch(/^(svelte|\.\.\/lib\/cited-source\/)/);
    }
    // No graphify alias / server import can sneak in.
    expect(source).not.toMatch(/@graphify\//);
    expect(source).not.toMatch(/\.\.\/lib\/(api|graphAdapter|citedSources)/);
  });

  it("declares the §S.6.1 grouped-thread props on the SAME pure seam (no new imports)", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/CitedSourceViewer.svelte"),
      "utf8",
    );
    // The extended API stays a pure-props surface: the grouped thread and its
    // callbacks are declared in $props(), never derived from graphify state.
    for (const prop of [
      "groups = []",
      "activeGroupIndex = 0",
      'scope = "entity"',
      "onScopeChange = null",
      "onFocusChange = null",
    ]) {
      expect(source).toContain(prop);
    }
  });
});
