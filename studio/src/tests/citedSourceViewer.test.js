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

  it("pins the retarget contract in the source (refs identity + activeIndex both tracked)", () => {
    // A plain-JS vitest cannot push prop updates into a Svelte-5 mount(), so
    // the retarget-on-reopen behavior (new refs array + activeIndex re-aim an
    // OPEN viewer, no stacking) is exercised end-to-end by the UAT run; here
    // we pin the load-bearing implementation: the $effect must compare BOTH
    // the refs identity and the activeIndex prop before reseeding `index`.
    const source = readFileSync(
      resolve(process.cwd(), "src/components/CitedSourceViewer.svelte"),
      "utf8",
    );
    expect(source).toMatch(/refs !== lastRefsProp \|\| activeIndex !== lastActiveProp/);
    expect(source).toMatch(/lastRefsProp = refs;/);
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
});
