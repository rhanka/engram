import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

// The viewer FRAME now comes from the published, architect-ratified package
// (the lib was extracted FROM this studio's interim component, so the UX is
// iso). These smokes exercise the LIB-BACKED wiring: (1) the published viewer
// renders + navigates our refs and honours our `sourceHref` callback; (2) the
// studio resolver SHIM (lib/citedSources.js) maps refs to bundle paths/bytes
// correctly; (3) App.svelte hosts the lib viewer with the shim resolvers and
// no longer references the decommissioned local component/engines.
import CitedSourceViewer from "@sentropic/cited-source-viewer/CitedSourceViewer.svelte";
import { bundleSourcePath, resolveBundleSource, sourceHrefFor } from "../lib/citedSources.js";

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
  vi.restoreAllMocks();
});

function mountViewer(props) {
  host = document.createElement("div");
  document.body.appendChild(host);
  instance = mount(CitedSourceViewer, { target: host, props });
  flushSync();
  return host;
}

describe("published CitedSourceViewer — lib-backed wiring (markdown path)", () => {
  it("renders our refs, resolves the source and highlights the active quote", async () => {
    const resolveSource = mdResolver();
    const el = mountViewer({
      refs: REFS,
      resolveSource,
      activeIndex: 0,
      title: "corpus/blue-study.md",
    });
    await settle();

    // Header + ref navigation reflect the ref list we passed.
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

    const next = [...el.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Next citation",
    );
    expect(next).toBeTruthy();
    next.click();
    flushSync();
    await settle();

    expect(el.textContent).toContain("Citation 2/2");
    expect(el.querySelector("[data-csv-mark]")?.textContent).toContain("Holmes examined the ledger");
    expect(resolveSource).toHaveBeenCalledTimes(2);
  });

  it("renders the Ouvrir raw-source link from our sourceHref shim callback", async () => {
    const el = mountViewer({
      refs: REFS,
      resolveSource: mdResolver(),
      sourceHref: sourceHrefFor,
      title: "t",
    });
    await settle();
    const link = el.querySelector("a.csv-tb-open");
    expect(link).not.toBeNull();
    expect(link.textContent).toContain("Ouvrir");
    // sourceHrefFor -> bundleSourcePath("corpus/blue-study.md").
    expect(link.getAttribute("href")).toBe("./sources/corpus/blue-study.md");
  });

  it("hides the Ouvrir link when no sourceHref is supplied", async () => {
    const el = mountViewer({ refs: REFS, resolveSource: mdResolver(), title: "t" });
    await settle();
    expect(el.querySelector("a.csv-tb-open")).toBeNull();
  });

  it("renders our GROUPED selection thread (buildSelectionThread output) with the scope toggle", async () => {
    // Two entities, each cited twice — the shape App.svelte's
    // buildSelectionThread emits. The lib gains the Entité/Sélection toggle and
    // a per-entity counter in the default Entité scope.
    const GROUPS = [
      {
        id: "e:holmes",
        label: "Sherlock Holmes",
        refs: [
          { rawRef: "corpus/blue-study.md", section: "Chapter 1", excerpt: "Holmes examined the ledger in silence" },
          { rawRef: "corpus/blue-study.md", section: "Chapter 2", excerpt: "the coronet had vanished from his private safe" },
        ],
      },
      {
        id: "e:watson",
        label: "John Watson",
        refs: [
          { rawRef: "corpus/blue-study.md", section: "Chapter 1", excerpt: "Holmes examined the ledger in silence" },
          { rawRef: "corpus/blue-study.md", section: "Chapter 2", excerpt: "the coronet had vanished from his private safe" },
        ],
      },
    ];
    const el = mountViewer({ refs: [], groups: GROUPS, resolveSource: mdResolver(), title: "t" });
    await settle();
    const scopeOptions = [...el.querySelectorAll(".st-contentSwitcher__option")].map((b) =>
      b.textContent.trim(),
    );
    expect(scopeOptions).toContain("Entité");
    expect(scopeOptions).toContain("Sélection");
    // Header follows the active group's label; counter covers the CURRENT
    // entity only (2 refs) in the default Entité scope, not the whole thread.
    expect(el.textContent).toContain("Sherlock Holmes");
    expect(el.textContent).toContain("Citation 1/2");
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
    expect(el.textContent).toContain("404 sources/corpus/blue-study.md");
  });
});

describe("studio resolver shim (lib/citedSources.js) — maps refs to the bundle", () => {
  it("bundleSourcePath normalizes locators under ./sources/ and encodes segments", () => {
    expect(bundleSourcePath("corpus/report.pdf")).toBe("./sources/corpus/report.pdf");
    expect(bundleSourcePath("./corpus/report.pdf")).toBe("./sources/corpus/report.pdf");
    expect(bundleSourcePath("corpus/my report.pdf")).toBe("./sources/corpus/my%20report.pdf");
  });

  it("sourceHrefFor resolves rawRef/sourceUrl and returns null when unlocatable", () => {
    expect(sourceHrefFor({ rawRef: "corpus/a.md" })).toBe("./sources/corpus/a.md");
    expect(sourceHrefFor({ sourceUrl: "corpus/b.pdf" })).toBe("./sources/corpus/b.pdf");
    expect(sourceHrefFor({ section: "no locator" })).toBeNull();
    expect(sourceHrefFor(null)).toBeNull();
  });

  it("resolveBundleSource fetches the bundle path and routes pdf vs markdown", async () => {
    const bytes = new ArrayBuffer(8);
    const fetchMock = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => bytes,
      text: async () => "# md\n\nbody",
      _url: url,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const pdf = await resolveBundleSource({ rawRef: "corpus/report.pdf" });
    expect(fetchMock).toHaveBeenCalledWith("./sources/corpus/report.pdf");
    expect(pdf).toEqual({ kind: "pdf", data: bytes });

    const md = await resolveBundleSource({ rawRef: "corpus/notes.md" });
    expect(md).toEqual({ kind: "markdown", text: "# md\n\nbody" });
  });

  it("resolveBundleSource raises a helpful error on a missing bundle file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, statusText: "Not Found" })),
    );
    await expect(resolveBundleSource({ rawRef: "corpus/missing.md" })).rejects.toThrow(
      /404 Not Found.*--include-sources/s,
    );
  });

  it("resolveBundleSource rejects a ref that carries no locator", async () => {
    await expect(resolveBundleSource({ section: "nowhere" })).rejects.toThrow(/no source locator/);
  });
});

describe("App.svelte hosts the published viewer with the shim resolvers", () => {
  const appSrc = readFileSync(resolve(process.cwd(), "src/App.svelte"), "utf8");

  it("imports the viewer FROM the published package, not the deleted local component", () => {
    expect(appSrc).toMatch(
      /import\s+CitedSourceViewer\s+from\s+["']@sentropic\/cited-source-viewer\/CitedSourceViewer\.svelte["']/,
    );
    // The decommissioned local component/engines must not be referenced.
    expect(appSrc).not.toMatch(/\.\/components\/CitedSourceViewer\.svelte/);
    expect(appSrc).not.toMatch(/lib\/cited-source\//);
  });

  it("wires the lib viewer with the studio glue resolvers (resolveSource + sourceHref)", () => {
    expect(appSrc).toMatch(/resolveSource=\{resolveBundleSource\}/);
    expect(appSrc).toMatch(/sourceHref=\{sourceHrefFor\}/);
    // The glue helpers still come from the retained local adapter.
    expect(appSrc).toMatch(/from\s+["']\.\/lib\/citedSources\.js["']/);
  });
});
