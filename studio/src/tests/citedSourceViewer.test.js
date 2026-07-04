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
