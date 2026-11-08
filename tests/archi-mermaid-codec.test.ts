// Mermaid-strict codec tests for archi@1 descriptions (P2-PARTITION-NOTE.r3.md, grammar engram.archi-mermaid/1).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalBytes } from "../src/ontology-guardian/canonical.js";
import { validPointer } from "../src/ontology-guardian/diagnostics.js";
import type { NativeSemanticDocument } from "../src/ontology-guardian/diagram-native-types.js";
import {
  ARCHI_MERMAID_DIAGNOSTIC_CODES,
  ArchiMermaidError,
  canonical,
  fmt,
  parse,
  print,
  type ArchiManifest,
  type ArchiMermaidDiagnosticCode,
  type ArchiSourceTriple,
  type ArchiViewSpec,
} from "../src/archi-mermaid/index.js";

const testsDir = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(testsDir, "fixtures", "archi");

function loadFixtureTriple(name: string): ArchiSourceTriple {
  const dir = join(fixturesRoot, name);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as ArchiManifest;
  const document = JSON.parse(readFileSync(join(dir, manifest.document), "utf8")) as NativeSemanticDocument;
  const views = manifest.views.map(
    (rel) => JSON.parse(readFileSync(join(dir, rel), "utf8")) as ArchiViewSpec,
  );
  return { manifest, document, views };
}

const JOINT_R2 = loadFixtureTriple("joint-r2");
const HOSTS_R3 = loadFixtureTriple("hosts-r3");
const JOINT_R2_TEINTES = loadFixtureTriple("joint-r2-teintes");

function expectParseCode(
  text: string,
  expectedCode: ArchiMermaidDiagnosticCode,
  options?: { readonly checkCanonical?: boolean; readonly subjectRef?: string },
): ArchiMermaidError {
  let caught: unknown;
  try {
    parse(text, options);
  } catch (err) {
    caught = err;
  }
  expect(caught, `expected parse to fail with ${expectedCode}`).toBeInstanceOf(ArchiMermaidError);
  const error = caught as ArchiMermaidError;
  expect(error.code).toBe(expectedCode);
  expect(error.diagnostic.origin).toBe("engram");
  expect(error.diagnostic.severity).toBe("error");
  expect(error.diagnostic.code).toBe(expectedCode);
  expect(error.diagnostic.nativeCode).toBe(expectedCode);
  expect(validPointer(error.diagnostic.path ?? "")).toBe(true);
  expect(error.diagnostic.path).toMatch(/^\/\d+$/);
  expect(error.diagnostic.subjectRef).toBe(
    options?.subjectRef ?? ".engram/architecture/architecture.mmd",
  );
  expect(Object.keys(error.diagnostic).sort()).toEqual([
    "code",
    "message",
    "nativeCode",
    "origin",
    "path",
    "severity",
    "subjectRef",
  ]);
  return error;
}

function expectPrintCode(
  triple: unknown,
  expectedCode: ArchiMermaidDiagnosticCode = "mermaid-strict-unrepresentable",
): ArchiMermaidError {
  let caught: unknown;
  try {
    print(triple as ArchiSourceTriple);
  } catch (err) {
    caught = err;
  }
  expect(caught, `expected print to fail with ${expectedCode}`).toBeInstanceOf(ArchiMermaidError);
  const error = caught as ArchiMermaidError;
  expect(error.code).toBe(expectedCode);
  expect(error.diagnostic.origin).toBe("engram");
  expect(error.diagnostic.severity).toBe("error");
  expect(error.diagnostic.code).toBe(expectedCode);
  expect(error.diagnostic.nativeCode).toBe(expectedCode);
  expect(validPointer(error.diagnostic.path ?? "")).toBe(true);
  return error;
}

describe("engram.archi-mermaid/1 — corpus round trips (G-T1, G-T2, G-T3)", () => {
  const fixtures: readonly [string, ArchiSourceTriple][] = [
    ["joint-r2", JOINT_R2],
    ["hosts-r3", HOSTS_R3],
    ["joint-r2-teintes", JOINT_R2_TEINTES],
  ];

  it.each(fixtures)(
    "%s: parse(print(j)) equals j on JCS bytes, print(parse(t)) equals canonical(t), fmt(t) equals t",
    (_name, j) => {
      const t = print(j);
      expect(t.startsWith("flowchart LR\n%% @dl format engram.archi-mermaid/1\n")).toBe(true);
      expect(t.endsWith("\n")).toBe(true);
      expect(t.endsWith("\n\n")).toBe(false);
      // K9: canonical text holds no '{'
      expect(t.includes("{")).toBe(false);

      // fmt(t) === t and canonical(t) === t for canonical text (G-T1)
      expect(fmt(t)).toBe(t);
      expect(canonical(t)).toBe(t);
      expect(fmt(t, { check: true })).toBe(t);
      expect(canonical(t, { check: true })).toBe(t);

      // parse(print(j)) equals j on per-record and whole-triple JCS bytes (G-T3)
      const roundTripped = parse(t, { checkCanonical: true });
      expect(canonicalBytes(roundTripped.manifest)).toBe(canonicalBytes(j.manifest));
      expect(canonicalBytes(roundTripped.document)).toBe(canonicalBytes(j.document));
      expect(roundTripped.views).toHaveLength(j.views.length);
      for (let i = 0; i < j.views.length; i++) {
        expect(canonicalBytes(roundTripped.views[i])).toBe(canonicalBytes(j.views[i]));
      }
      expect(canonicalBytes(roundTripped)).toBe(canonicalBytes(j));

      // print(parse(t)) equals canonical(t) (G-T2)
      expect(print(parse(t))).toBe(canonical(t));
    },
  );

  it("joint-r2-teintes: preserves generic@2 legend, legend-key and contains without synthesizing lifecycle and matches §4.9 fragment lines", () => {
    const t = print(JOINT_R2_TEINTES);
    const parsed = parse(t);

    // generic@2 records never get a synthesized lifecycle attribute (§3.2, §3.3, K6, M3)
    expect(parsed.document.entities["entity:legend-memoire"]?.attributes["lifecycle"]).toBeUndefined();
    expect(parsed.document.entities["entity:key-alim"]?.attributes["lifecycle"]).toBeUndefined();
    expect(parsed.document.entities["entity:key-ctrl"]?.attributes["lifecycle"]).toBeUndefined();
    expect(parsed.document.entities["entity:key-mem"]?.attributes["lifecycle"]).toBeUndefined();
    expect(parsed.document.relations["relation:ct-key-alim"]?.attributes).toEqual({});
    expect(parsed.document.relations["relation:ct-key-ctrl"]?.attributes).toEqual({});
    expect(parsed.document.relations["relation:ct-key-mem"]?.attributes).toEqual({});

    // §4.9 worked fragment blocks appear in canonical output
    expect(t).toContain(
      [
        "%% @dl entity legend",
        'subgraph e_legend_memoire["Teintes du dossier mémoire"]',
        "  %% @dl entity legend-key",
        '  %% @dl category "alimentation"',
        "  %% @dl nest ct-key-alim",
        '  e_key_alim["Alimentation (h2a)"]',
      ].join("\n"),
    );
    expect(t).toContain(
      [
        "classDef dashed stroke-dasharray: 5 5",
        "class e_host_cluster,e_svc_live dashed",
      ].join("\n"),
    );
  });

  it("G-T2: non-canonical mutants of K1–K12 parse to the same model, print(parse(t)) === canonical(t), fmt restores canonical bytes, and check mode reports mermaid-strict-noncanonical", () => {
    const base = print(JOINT_R2_TEINTES);

    const mutants: readonly [string, string][] = [
      // K1: trailing space on line 1
      ["K1 trailing space", base.replace("flowchart LR\n", "flowchart LR   \n")],
      // K2: head lines out of canonical order (language before revision)
      [
        "K2 head order",
        base.replace(
          "%% @dl revision 0\n%% @dl language fr",
          "%% @dl language fr\n%% @dl revision 0",
        ),
      ],
      // K3: extra blank line before first top-block
      [
        "K3 extra blank line",
        base.replace("\n\n%% @dl entity actor", "\n\n\n%% @dl entity actor"),
      ],
      // K4: multiple spaces between tokens in annotation
      [
        "K4 multiple spaces",
        base.replace("%% @dl language fr", "%%  @dl   language   fr"),
      ],
      // K5: swap two root sibling blocks (e_legend_memoire before e_host_poste)
      [
        "K5 tree sibling order",
        (() => {
          const hostBlock = [
            "%% @dl entity host workstation",
            '%% @dl role "Poste de l\'owner"',
            '%% @dl evidence "assertion : poste local de l\'owner"',
            'subgraph e_host_poste["Poste de travail"]',
            "end",
          ].join("\n");
          const legendBlock = [
            "%% @dl entity legend",
            'subgraph e_legend_memoire["Teintes du dossier mémoire"]',
            "  %% @dl entity legend-key",
            '  %% @dl category "alimentation"',
            "  %% @dl nest ct-key-alim",
            '  e_key_alim["Alimentation (h2a)"]',
            "  %% @dl entity legend-key",
            '  %% @dl category "controle"',
            "  %% @dl nest ct-key-ctrl",
            '  e_key_ctrl["Contrôle (Track)"]',
            "  %% @dl entity legend-key",
            '  %% @dl category "memoire"',
            "  %% @dl nest ct-key-mem",
            '  e_key_mem["Mémoire (engram)"]',
            "end",
          ].join("\n");
          expect(base).toContain(hostBlock);
          expect(base).toContain(legendBlock);
          return base
            .replace(hostBlock, "__LEGEND_PLACEHOLDER__")
            .replace(legendBlock, hostBlock)
            .replace("__LEGEND_PLACEHOLDER__", legendBlock);
        })(),
      ],
      // K6: explicit lifecycle current written on an archi@1 entity + attribute order swapped
      [
        "K6 lifecycle current written explicitly",
        base.replace(
          '%% @dl entity system\n%% @dl role "Contrôle chaque écriture"',
          '%% @dl entity system\n%% @dl lifecycle current\n%% @dl role "Contrôle chaque écriture"',
        ),
      ],
      // K7: swap two relation blocks in the relations section
      [
        "K7 relation block order",
        base.replace(
          '%% @dl edge da-track deployedAs\n%% @dl evidence "h2a:packages/track/package.json:33"\ne_pkg_track -->|"déployé comme"| e_rt_track\n%% @dl edge da-track-mcp deployedAs\n%% @dl evidence "h2a:packages/track/package.json:34"\ne_pkg_track -->|"déployé comme"| e_rt_track_mcp',
          '%% @dl edge da-track-mcp deployedAs\n%% @dl evidence "h2a:packages/track/package.json:34"\ne_pkg_track -->|"déployé comme"| e_rt_track_mcp\n%% @dl edge da-track deployedAs\n%% @dl evidence "h2a:packages/track/package.json:33"\ne_pkg_track -->|"déployé comme"| e_rt_track',
        ),
      ],
      // K8: swap two draw lines in the view block
      [
        "K8 view draw order",
        base.replace(
          "%% @dl draw e_api_h2a\n%% @dl draw e_api_memory",
          "%% @dl draw e_api_memory\n%% @dl draw e_api_h2a",
        ),
      ],
      // K11: reverse EID order in class dashed line
      [
        "K11 class EID order",
        base.replace(
          "class e_host_cluster,e_svc_live dashed",
          "class e_svc_live,e_host_cluster dashed",
        ),
      ],
      // K12: pin cards placed after pin view-schema in head
      [
        "K12 pin cards after pin view-schema",
        base.replace(
          "%% @dl pin cards archi-cards 1 7de031e42469eb426cd520fab2f390e33ec62fca374d224b463bbe9d70cb1246\n%% @dl pin view-schema diagram-view-schema 2 50c97fc87a9546facff86f2deab8fdb99073419f43eef09958b96225367037ef",
          "%% @dl pin view-schema diagram-view-schema 2 50c97fc87a9546facff86f2deab8fdb99073419f43eef09958b96225367037ef\n%% @dl pin cards archi-cards 1 7de031e42469eb426cd520fab2f390e33ec62fca374d224b463bbe9d70cb1246",
        ),
      ],
    ];

    for (const [label, mutant] of mutants) {
      expect(mutant, label).not.toBe(base);
      const parsed = parse(mutant);
      expect(canonicalBytes(parsed), label).toBe(canonicalBytes(JOINT_R2_TEINTES));
      expect(print(parsed), label).toBe(base);
      expect(canonical(mutant), label).toBe(base);
      expect(fmt(mutant), label).toBe(base);
      expectParseCode(mutant, "mermaid-strict-noncanonical", { checkCanonical: true });
      expect(() => fmt(mutant, { check: true })).toThrow(ArchiMermaidError);
    }
  });
});

describe("engram.archi-mermaid/1 — escaping & lone surrogates (§4.4, K9, M8)", () => {
  it("round-trips the §4.4 bracket/brace/pipe examples and all VSTRING & ASTRING escapes", () => {
    const triple = structuredClone(JOINT_R2) as {
      manifest: ArchiManifest;
      document: {
        entities: Record<string, any>;
        relations: Record<string, any>;
      } & NativeSemanticDocument;
      views: ArchiViewSpec[];
    };

    // §4.4 table values:
    // subgraph e_sys_track["Bêta #91;labo#93; #123;x}"]
    triple.document.entities["entity:sys-track"].attributes.name = {
      kind: "text",
      value: "Bêta [labo] {x}",
    };
    // e_rt_track["track #91;cli#93; #124; écrit"]
    triple.document.entities["entity:rt-track"].attributes.name = {
      kind: "text",
      value: 'track [cli] | écrit #1 "quoted" <&> `code` \u2028 \u2029 ()};:%\\',
    };
    // role ASTRING: Lit [a] puis {b} with \, ", {, U+2028, U+2029, #, [, ]
    triple.document.entities["entity:rt-track"].attributes.role = {
      kind: "text",
      value: 'Lit [a] #1 puis {b} "quote" \\path \u2028 \u2029',
    };
    // edge label VSTRING: lance · hooks [session]
    triple.document.relations["relation:in-track"].attributes.label = {
      kind: "text",
      value: 'lance · hooks [session] #2 "q" {b} | `tick` <&> \u2028 \u2029',
    };

    const t = print(triple);
    expect(t.includes("{")).toBe(false);
    expect(t).toContain('subgraph e_sys_track["Bêta #91;labo#93; #123;x}"]');
    expect(t).toContain(
      'e_rt_track["track #91;cli#93; #124; écrit #35;1 #34;quoted#34; #60;#38;#62; #96;code#96; #8232; #8233; ()};:%\\"]',
    );
    expect(t).toContain(
      '%% @dl role "Lit [a] #1 puis \\u007bb} \\"quote\\" \\\\path \\u2028 \\u2029"',
    );
    expect(t).toContain(
      '-->|"lance · hooks #91;session#93; #35;2 #34;q#34; #123;b} #124; #96;tick#96; #60;#38;#62; #8232; #8233;"|',
    );

    expect(fmt(t)).toBe(t);
    const back = parse(t, { checkCanonical: true });
    expect(canonicalBytes(back)).toBe(canonicalBytes(triple));
  });

  it("refuses raw '[', ']', '#', '{' or unknown entity escape in VSTRING and raw '{' or bad escape in ASTRING with mermaid-strict-invalid", () => {
    const base = print(JOINT_R2);
    expectParseCode(
      base.replace('e_rt_track["track"]', 'e_rt_track["track [cli]"]'),
      "mermaid-strict-invalid",
    );
    expectParseCode(
      base.replace('e_rt_track["track"]', 'e_rt_track["track ]cli"]'),
      "mermaid-strict-invalid",
    );
    expectParseCode(
      base.replace('e_rt_track["track"]', 'e_rt_track["track #1"]'),
      "mermaid-strict-invalid",
    );
    expectParseCode(
      base.replace('e_rt_track["track"]', 'e_rt_track["track #999;"]'),
      "mermaid-strict-invalid",
    );
    expectParseCode(
      base.replace('e_rt_track["track"]', 'e_rt_track["track {x}"]'),
      "mermaid-strict-invalid",
    );
    expectParseCode(
      base.replace(
        '%% @dl role "Valide puis écrit le suivi"',
        '%% @dl role "Valide {raw brace}"',
      ),
      "mermaid-strict-invalid",
    );
    expectParseCode(
      base.replace(
        '%% @dl role "Valide puis écrit le suivi"',
        '%% @dl role "Valide \\n bad escape"',
      ),
      "mermaid-strict-invalid",
    );
  });

  it("refuses a lone surrogate in parse (mermaid-strict-invalid) and in print (mermaid-strict-unrepresentable)", () => {
    const base = print(JOINT_R2);
    expectParseCode(
      base.replace('e_rt_track["track"]', 'e_rt_track["track \uD800"]'),
      "mermaid-strict-invalid",
    );
    expectParseCode(
      base.replace('e_rt_track["track"]', 'e_rt_track["track \uDC00"]'),
      "mermaid-strict-invalid",
    );

    const badLead = structuredClone(JOINT_R2) as any;
    badLead.document.entities["entity:rt-track"].attributes.name.value = "track \uD800";
    expectPrintCode(badLead, "mermaid-strict-unrepresentable");

    const badTrail = structuredClone(JOINT_R2) as any;
    badTrail.document.entities["entity:rt-track"].attributes.role.value = "role \uDC00";
    expectPrintCode(badTrail, "mermaid-strict-unrepresentable");
  });
});

describe("engram.archi-mermaid/1 — fold rule collapsed = D \\ X and refusal cases (§5)", () => {
  it("handles all-folded (X = ∅), all-expanded (X = D), partial exceptions, and childless drawn containers", () => {
    // 1. All-folded (roles-replie in joint-r2 has all 6 drawn containers in collapsed -> 0 expanded lines)
    const tJoint = print(JOINT_R2);
    const replieBlock = tJoint.split("\n\n").find((b) => b.startsWith("%% @dl view roles-replie "))!;
    expect(replieBlock).toBeDefined();
    expect(replieBlock).not.toContain("%% @dl expanded ");

    // 2. All-expanded (X = D -> collapsed = [])
    const allExpanded = structuredClone(JOINT_R2_TEINTES) as {
      manifest: ArchiManifest;
      document: NativeSemanticDocument;
      views: ArchiViewSpec[];
    };
    allExpanded.views[0] = {
      ...allExpanded.views[0]!,
      collapsed: [],
    };
    const tAllExp = print(allExpanded);
    expect(tAllExp).toContain("%% @dl expanded e_pkg_h2a");
    expect(tAllExp).toContain("%% @dl expanded e_pkg_plugin");
    expect(tAllExp).toContain("%% @dl expanded e_pkg_track");
    expect(tAllExp).toContain("%% @dl expanded e_sys_engram");
    expect(tAllExp).toContain("%% @dl expanded e_sys_h2a");
    expect(tAllExp).toContain("%% @dl expanded e_sys_track");
    expect(canonicalBytes(parse(tAllExp))).toBe(canonicalBytes(allExpanded));

    // 3. Drawn container with no drawn child (host-poste drawn without its runtimes) stays in D(v)
    const childlessContainer = structuredClone(JOINT_R2_TEINTES) as {
      manifest: ArchiManifest;
      document: NativeSemanticDocument;
      views: ArchiViewSpec[];
    };
    childlessContainer.views[0] = {
      ...childlessContainer.views[0]!,
      draw: ["entity:host-poste", ...childlessContainer.views[0]!.draw].sort(),
      collapsed: ["entity:host-poste", ...childlessContainer.views[0]!.collapsed].sort(),
    };
    const tChildless = print(childlessContainer);
    expect(tChildless).toContain("%% @dl draw e_host_poste");
    expect(tChildless).not.toContain("%% @dl expanded e_host_poste");
    expect(canonicalBytes(parse(tChildless))).toBe(canonicalBytes(childlessContainer));
  });

  it("refuses expanded on undrawn container, non-container, unknown entity, duplicate expanded, and fold/collapsed keywords", () => {
    const base = print(JOINT_R2_TEINTES);

    // Undrawn container (entity:host-poste is in document, but not in draw of roles-teintes)
    expectParseCode(
      base.replace(
        "%% @dl expanded e_pkg_track",
        "%% @dl expanded e_host_poste\n%% @dl expanded e_pkg_track",
      ),
      "mermaid-strict-orphan-ref",
    );

    // Drawn non-container (entity:rt-track is drawn in roles-teintes, but is a runtime card, not a container)
    expectParseCode(
      base.replace(
        "%% @dl expanded e_pkg_track",
        "%% @dl expanded e_pkg_track\n%% @dl expanded e_rt_track",
      ),
      "mermaid-strict-orphan-ref",
    );

    // Unknown entity EID
    expectParseCode(
      base.replace(
        "%% @dl expanded e_pkg_track",
        "%% @dl expanded e_pkg_track\n%% @dl expanded e_sys_ghost",
      ),
      "mermaid-strict-orphan-ref",
    );

    // Duplicate expanded EID
    expectParseCode(
      base.replace(
        "%% @dl expanded e_pkg_track",
        "%% @dl expanded e_pkg_track\n%% @dl expanded e_pkg_track",
      ),
      "mermaid-strict-duplicate",
    );

    // Forbidden fold keywords: fold, collapsed, folded, unfold (§5 rule 5)
    for (const kw of ["fold", "collapsed", "folded", "unfold"]) {
      expectParseCode(
        base.replace("%% @dl expanded e_pkg_track", `%% @dl ${kw} e_pkg_track`),
        "mermaid-strict-annotation-unknown",
      );
    }

    // Print refusal when collapsed contains an undrawn container or a non-container (M10)
    const badCollapsedUndrawn = structuredClone(JOINT_R2_TEINTES) as any;
    badCollapsedUndrawn.views[0].collapsed = [
      "entity:host-poste",
      ...badCollapsedUndrawn.views[0].collapsed,
    ].sort();
    expectPrintCode(badCollapsedUndrawn, "mermaid-strict-unrepresentable");

    const badCollapsedCard = structuredClone(JOINT_R2_TEINTES) as any;
    badCollapsedCard.views[0].collapsed = [
      ...badCollapsedCard.views[0].collapsed,
      "entity:rt-track",
    ].sort();
    expectPrintCode(badCollapsedCard, "mermaid-strict-unrepresentable");
  });
});

describe("engram.archi-mermaid/1 — layout injectivity (§3.4, §4.5, K8, M11)", () => {
  it("distinguishes subgroup positions among sibling entity refs and round-trips every LayoutHints field", () => {
    const j1 = structuredClone(JOINT_R2_TEINTES) as {
      manifest: ArchiManifest;
      document: NativeSemanticDocument;
      views: ArchiViewSpec[];
    };
    j1.views[0] = {
      ...j1.views[0]!,
      layout: {
        stretch: true,
        cardGapX: 24,
        cardGapY: 32,
        zoneGapX: 48,
        zoneGapY: 64,
        rankGap: 80,
        ordering: {
          "entity:sys-h2a": ["entity:pkg-plugin", "entity:pkg-h2a", "entity:rt-h2a"],
          "entity:sys-engram": [],
        },
        grouping: [
          {
            id: "g",
            direction: "rows",
            stretch: false,
            gapAfter: 40,
            items: [
              "entity:sys-h2a",
              {
                id: "h",
                direction: "columns",
                stretch: true,
                items: ["entity:sys-track"],
              },
              "entity:sys-engram",
            ],
          },
          {
            id: "empty-grp",
            direction: "columns",
            items: [],
          },
        ],
      },
    };

    const j2 = structuredClone(j1);
    j2.views[0] = {
      ...j1.views[0]!,
      layout: {
        ...j1.views[0]!.layout!,
        grouping: [
          {
            id: "g",
            direction: "rows",
            stretch: false,
            gapAfter: 40,
            items: [
              "entity:sys-h2a",
              "entity:sys-engram",
              {
                id: "h",
                direction: "columns",
                stretch: true,
                items: ["entity:sys-track"],
              },
            ],
          },
          {
            id: "empty-grp",
            direction: "columns",
            items: [],
          },
        ],
      },
    };

    const t1 = print(j1);
    const t2 = print(j2);
    expect(t1).not.toBe(t2);

    expect(t1).toContain(
      [
        "%% @dl stretch true",
        "%% @dl gap card-x 24",
        "%% @dl gap card-y 32",
        "%% @dl gap zone-x 48",
        "%% @dl gap zone-y 64",
        "%% @dl gap rank 80",
        "%% @dl order e_sys_engram",
        "%% @dl order e_sys_h2a e_pkg_plugin e_pkg_h2a e_rt_h2a",
        "%% @dl group g rows stretch false gap-after 40",
        "%% @dl item g e_sys_h2a",
        "%% @dl group h columns in g stretch true",
        "%% @dl item h e_sys_track",
        "%% @dl item g e_sys_engram",
        "%% @dl group empty-grp columns",
      ].join("\n"),
    );

    expect(t2).toContain(
      [
        "%% @dl group g rows stretch false gap-after 40",
        "%% @dl item g e_sys_h2a",
        "%% @dl item g e_sys_engram",
        "%% @dl group h columns in g stretch true",
        "%% @dl item h e_sys_track",
        "%% @dl group empty-grp columns",
      ].join("\n"),
    );

    expect(canonicalBytes(parse(t1, { checkCanonical: true }))).toBe(canonicalBytes(j1));
    expect(canonicalBytes(parse(t2, { checkCanonical: true }))).toBe(canonicalBytes(j2));

    // Interleaved non-canonical group item lines parse to j1 and fmt restores t1 (§4.6)
    const interleaved = t1.replace(
      [
        "%% @dl group h columns in g stretch true",
        "%% @dl item h e_sys_track",
        "%% @dl item g e_sys_engram",
      ].join("\n"),
      [
        "%% @dl group h columns in g stretch true",
        "%% @dl item g e_sys_engram",
        "%% @dl item h e_sys_track",
      ].join("\n"),
    );
    expect(canonicalBytes(parse(interleaved))).toBe(canonicalBytes(j1));
    expect(fmt(interleaved)).toBe(t1);
  });

  it("allows reusing layout group ids across distinct views in the same file, while refusing duplicate group ids within one view", () => {
    const j = structuredClone(HOSTS_R3) as {
      manifest: ArchiManifest;
      document: NativeSemanticDocument;
      views: ArchiViewSpec[];
    };
    j.views[0] = {
      ...j.views[0]!,
      layout: {
        grouping: [{ id: "shared-g", direction: "rows", items: ["entity:host-poste"] }],
      },
    };
    j.views[1] = {
      ...j.views[1]!,
      layout: {
        grouping: [{ id: "shared-g", direction: "columns", items: ["entity:sys-h2a"] }],
      },
    };
    const t = print(j);
    expect(canonicalBytes(parse(t, { checkCanonical: true }))).toBe(canonicalBytes(j));

    // Duplicate group id within the same view refuses with mermaid-strict-duplicate
    expectParseCode(
      t.replace(
        "%% @dl group shared-g rows\n%% @dl item shared-g e_host_poste",
        "%% @dl group shared-g rows\n%% @dl item shared-g e_host_poste\n%% @dl group shared-g columns",
      ),
      "mermaid-strict-duplicate",
    );
  });

  it("refuses empty layout: {}, ordering: {}, and grouping: [] on print with mermaid-strict-unrepresentable (M11)", () => {
    const emptyLayout = structuredClone(JOINT_R2_TEINTES) as any;
    emptyLayout.views[0].layout = {};
    expectPrintCode(emptyLayout, "mermaid-strict-unrepresentable");

    const emptyOrdering = structuredClone(JOINT_R2_TEINTES) as any;
    emptyOrdering.views[0].layout = { ordering: {} };
    expectPrintCode(emptyOrdering, "mermaid-strict-unrepresentable");

    const emptyGrouping = structuredClone(JOINT_R2_TEINTES) as any;
    emptyGrouping.views[0].layout = { grouping: [] };
    expectPrintCode(emptyGrouping, "mermaid-strict-unrepresentable");
  });
});

describe("engram.archi-mermaid/1 — all 10 closed diagnostic codes (G-T4, §7)", () => {
  const base = print(JOINT_R2_TEINTES);

  it("exports the exact 10 closed codes in ARCHI_MERMAID_DIAGNOSTIC_CODES", () => {
    expect(ARCHI_MERMAID_DIAGNOSTIC_CODES).toEqual([
      "mermaid-strict-invalid",
      "mermaid-strict-unsupported",
      "mermaid-strict-annotation-unknown",
      "mermaid-strict-duplicate",
      "mermaid-strict-duplicate-datum",
      "mermaid-strict-orphan-ref",
      "mermaid-strict-placement-drift",
      "mermaid-strict-style-drift",
      "mermaid-strict-noncanonical",
      "mermaid-strict-unrepresentable",
    ]);
  });

  it("1. mermaid-strict-invalid: lexical errors, missing parts, unbalanced subgraph, out-of-order section, kind-spelling mismatch", () => {
    // BOM, CR, TAB, control character
    expectParseCode(`\uFEFF${base}`, "mermaid-strict-invalid");
    expectParseCode(base.replace("\n", "\r\n"), "mermaid-strict-invalid");
    expectParseCode(base.replace("flowchart LR", "flowchart\tLR"), "mermaid-strict-invalid");
    expectParseCode(base.replace("flowchart LR", "flowchart LR\u0007"), "mermaid-strict-invalid");

    // Unbalanced subgraph / end
    expectParseCode(`${base}end\n`, "mermaid-strict-invalid");
    expectParseCode(base.replace(/\nend\n/, "\n"), "mermaid-strict-invalid");

    // Missing required head line (pin view-schema)
    expectParseCode(
      base.replace(/%% @dl pin view-schema [^\n]+\n/, ""),
      "mermaid-strict-invalid",
    );

    // Statement without entity head
    expectParseCode(
      base.replace("%% @dl entity store jsonl\n", ""),
      "mermaid-strict-invalid",
    );

    // Inner block without nest
    expectParseCode(
      base.replace("  %% @dl nest po-pkg-track\n", ""),
      "mermaid-strict-invalid",
    );

    // Edge head not followed by edge line
    expectParseCode(
      base.replace('e_pkg_track -->|"déployé comme"| e_rt_track\n', ""),
      "mermaid-strict-invalid",
    );

    // Edge line without edge head
    expectParseCode(
      base.replace('%% @dl edge da-track deployedAs\n%% @dl evidence "h2a:packages/track/package.json:33"\n', ""),
      "mermaid-strict-invalid",
    );

    // Section out of order: edge inside tree
    expectParseCode(
      base.replace(
        'subgraph e_host_poste["Poste de travail"]\nend',
        'subgraph e_host_poste["Poste de travail"]\n  %% @dl edge da-inline deployedAs\n  e_pkg_track -->|"déployé comme"| e_rt_track\nend',
      ),
      "mermaid-strict-invalid",
    );

    // Value spelling contradicts declared kind: bare word for text, quoted string for enum, [] on non-collection
    expectParseCode(
      base.replace('%% @dl role "Contrôle chaque écriture"', "%% @dl role controle"),
      "mermaid-strict-invalid",
    );
    expectParseCode(
      base.replace("%% @dl mode append", '%% @dl mode "append"'),
      "mermaid-strict-invalid",
    );
    expectParseCode(
      base.replace('%% @dl role "Contrôle chaque écriture"', "%% @dl role []"),
      "mermaid-strict-invalid",
    );
  });

  it("2. mermaid-strict-unsupported: non-LR flowchart, directives, free comments, unsupported shapes/links/classes", () => {
    expectParseCode(base.replace("flowchart LR", "flowchart TB"), "mermaid-strict-unsupported");
    expectParseCode(base.replace("flowchart LR", "graph LR"), "mermaid-strict-unsupported");
    expectParseCode(`%%{init: {'theme': 'dark'}}%%\n${base}`, "mermaid-strict-unsupported");
    expectParseCode(base.replace("flowchart LR", "flowchart LR\n%% free comment"), "mermaid-strict-unsupported");
    expectParseCode(base.replace("%% @dl language fr", "%%@dl language fr"), "mermaid-strict-unsupported");
    expectParseCode(base.replace("flowchart LR", "flowchart LR\ndirection TB"), "mermaid-strict-unsupported");
    expectParseCode(base.replace("flowchart LR", "flowchart LR\nstyle e_rt_track fill:#f00"), "mermaid-strict-unsupported");
    expectParseCode(
      base.replace("classDef dashed stroke-dasharray: 5 5", "classDef dashed fill:#f00"),
      "mermaid-strict-unsupported",
    );
    expectParseCode(
      base.replace('e_rt_track["track"]', 'e_rt_track("track")'),
      "mermaid-strict-unsupported",
    );
    expectParseCode(
      base.replace('e_rt_track["track"]', 'e_rt_track{"track"}'),
      "mermaid-strict-unsupported",
    );
    expectParseCode(
      base.replace('e_rt_track["track"]', 'e_rt_track@{ label: "track" }'),
      "mermaid-strict-unsupported",
    );
    expectParseCode(
      base.replace('e_rt_track["track"]', "e_rt_track[track]"),
      "mermaid-strict-unsupported",
    );
    expectParseCode(
      base.replace('e_rt_track["track"]', 'e_rt_track["`track`"]'),
      "mermaid-strict-unsupported",
    );
    expectParseCode(
      base.replace('e_pkg_track -->|"déployé comme"| e_rt_track', 'e_pkg_track ==>|"déployé comme"| e_rt_track'),
      "mermaid-strict-unsupported",
    );
    expectParseCode(
      base.replace('e_pkg_track -->|"déployé comme"| e_rt_track', 'e_pkg_track -->|"déployé comme"| e_rt_track:::dashed'),
      "mermaid-strict-unsupported",
    );
  });

  it("3. mermaid-strict-annotation-unknown: unknown keyword, out-of-context keyword, undeclared attribute/type, lifecycle on generic@2", () => {
    expectParseCode(
      base.replace("%% @dl language fr", "%% @dl language fr\n%% @dl bogus value"),
      "mermaid-strict-annotation-unknown",
    );
    expectParseCode(
      base.replace("%% @dl entity system", "%% @dl entity system\n%% @dl draw e_sys_track"),
      "mermaid-strict-annotation-unknown",
    );
    expectParseCode(
      base.replace("%% @dl entity system", '%% @dl entity system\n%% @dl url "https://example.com"'),
      "mermaid-strict-annotation-unknown",
    );
    expectParseCode(
      base.replace("%% @dl entity system", "%% @dl entity system custom-form"),
      "mermaid-strict-annotation-unknown",
    );
    // lifecycle in generic@2 legend / legend-key / contains block (§3.2, §3.3, §7)
    expectParseCode(
      base.replace("%% @dl entity legend", "%% @dl entity legend\n%% @dl lifecycle proposed"),
      "mermaid-strict-annotation-unknown",
    );
    expectParseCode(
      base.replace("  %% @dl nest ct-key-alim", "  %% @dl nest ct-key-alim\n  %% @dl lifecycle proposed"),
      "mermaid-strict-annotation-unknown",
    );
    // Undeclared entity or relation type (including generic@2 node/container/link)
    expectParseCode(
      base.replace("%% @dl entity legend", "%% @dl entity container"),
      "mermaid-strict-annotation-unknown",
    );
    expectParseCode(
      base.replace("%% @dl rel mi-sys-track managedIn", "%% @dl rel mi-sys-track link"),
      "mermaid-strict-annotation-unknown",
    );
    expectParseCode(
      base.replace("%% @dl format engram.archi-mermaid/1", "%% @dl format engram.archi-mermaid/99"),
      "mermaid-strict-annotation-unknown",
    );
    expectParseCode(
      base.replace("%% @dl pin cards ", "%% @dl pin unknown-role "),
      "mermaid-strict-annotation-unknown",
    );
  });

  it("4. mermaid-strict-duplicate: duplicate ids, head lines, attributes, evidence [] + item, view lines, and list/set items", () => {
    // Duplicate head line
    expectParseCode(
      base.replace("%% @dl language fr", "%% @dl language fr\n%% @dl language en"),
      "mermaid-strict-duplicate",
    );
    // Duplicate profile ref
    expectParseCode(
      base.replace("%% @dl profile archi@1", "%% @dl profile archi@1\n%% @dl profile archi@1"),
      "mermaid-strict-duplicate",
    );
    // Duplicate non-collection attribute
    expectParseCode(
      base.replace(
        '%% @dl role "Contrôle chaque écriture"',
        '%% @dl role "Contrôle chaque écriture"\n%% @dl role "Doublon"',
      ),
      "mermaid-strict-duplicate",
    );
    // Empty collection [] beside an item line
    expectParseCode(
      base.replace(
        '%% @dl evidence "track-facts-r5.md:40-48"',
        '%% @dl evidence []\n%% @dl evidence "track-facts-r5.md:40-48"',
      ),
      "mermaid-strict-duplicate",
    );
    // Duplicate relation local id
    expectParseCode(
      base.replace("%% @dl edge eb-track-in-h2a executedBy", "%% @dl edge da-track executedBy"),
      "mermaid-strict-duplicate",
    );
    // Duplicate key in legend
    expectParseCode(
      base.replace("%% @dl key e_key_alim", "%% @dl key e_key_alim\n%% @dl key e_key_alim"),
      "mermaid-strict-duplicate",
    );
    // Duplicate token category
    expectParseCode(
      base.replace(
        '%% @dl token "alimentation" st-semantic-data-category1',
        '%% @dl token "alimentation" st-semantic-data-category1\n%% @dl token "alimentation" st-semantic-data-category2',
      ),
      "mermaid-strict-duplicate",
    );
    // Duplicate gap key, duplicate order parent, duplicate order child, duplicate item in group
    expectParseCode(
      base.replace(
        "%% @dl view roles-teintes archi-composition",
        "%% @dl view roles-teintes archi-composition\n%% @dl gap rank 20\n%% @dl gap rank 40",
      ),
      "mermaid-strict-duplicate",
    );
    expectParseCode(
      base.replace(
        "%% @dl view roles-teintes archi-composition",
        "%% @dl view roles-teintes archi-composition\n%% @dl order e_sys_h2a e_pkg_h2a e_pkg_h2a",
      ),
      "mermaid-strict-duplicate",
    );
    expectParseCode(
      base.replace(
        "%% @dl view roles-teintes archi-composition",
        "%% @dl view roles-teintes archi-composition\n%% @dl group g1 rows\n%% @dl item g1 e_sys_h2a\n%% @dl item g1 e_sys_h2a",
      ),
      "mermaid-strict-duplicate",
    );
  });

  it("5. mermaid-strict-duplicate-datum: name line, form line, or label line in edge block", () => {
    expectParseCode(
      base.replace("%% @dl entity system", '%% @dl entity system\n%% @dl name "Track"'),
      "mermaid-strict-duplicate-datum",
    );
    expectParseCode(
      base.replace("%% @dl entity runtime cli", "%% @dl entity runtime cli\n%% @dl form cli"),
      "mermaid-strict-duplicate-datum",
    );
    expectParseCode(
      base.replace(
        "%% @dl edge da-track deployedAs",
        '%% @dl edge da-track deployedAs\n%% @dl label "déployé comme"',
      ),
      "mermaid-strict-duplicate-datum",
    );
  });

  it("6. mermaid-strict-orphan-ref: unknown EIDs and undeclared/forward layout group refs", () => {
    expectParseCode(
      base.replace("%% @dl owning-repo e_repo_h2a", "%% @dl owning-repo e_repo_unknown"),
      "mermaid-strict-orphan-ref",
    );
    expectParseCode(
      base.replace("%% @dl draw e_api_h2a", "%% @dl draw e_api_ghost"),
      "mermaid-strict-orphan-ref",
    );
    expectParseCode(
      base.replace("%% @dl key e_key_alim", "%% @dl key e_key_ghost"),
      "mermaid-strict-orphan-ref",
    );
    // Undeclared layout group in `item` or `in`
    expectParseCode(
      base.replace(
        "%% @dl view roles-teintes archi-composition",
        "%% @dl view roles-teintes archi-composition\n%% @dl item missing-grp e_sys_h2a",
      ),
      "mermaid-strict-orphan-ref",
    );
    expectParseCode(
      base.replace(
        "%% @dl view roles-teintes archi-composition",
        "%% @dl view roles-teintes archi-composition\n%% @dl group child rows in parent\n%% @dl group parent columns",
      ),
      "mermaid-strict-orphan-ref",
    );
  });

  it("7. mermaid-strict-placement-drift: container as node, non-container as subgraph, cross-family nesting, edge/rel mismatch", () => {
    // Container (host) written as node instead of subgraph
    expectParseCode(
      base.replace('subgraph e_host_poste["Poste de travail"]\nend', 'e_host_poste["Poste de travail"]'),
      "mermaid-strict-placement-drift",
    );
    // Non-container (store) written as subgraph
    expectParseCode(
      base.replace('e_st_events[".track/events.jsonl"]', 'subgraph e_st_events[".track/events.jsonl"]\nend'),
      "mermaid-strict-placement-drift",
    );
    // Cross-family nesting: archi@1 entity inside generic@2 legend subgraph
    expectParseCode(
      base.replace(
        '  e_key_mem["Mémoire (engram)"]\nend',
        '  e_key_mem["Mémoire (engram)"]\n  %% @dl entity component\n  %% @dl role "x"\n  %% @dl evidence "e"\n  %% @dl nest po-cross\n  %% @dl evidence "e"\n  e_cmp_cross["Cross"]\nend',
      ),
      "mermaid-strict-placement-drift",
    );
    // rel-encoded relation (runsOn) written as edge
    expectParseCode(
      base.replace(
        '%% @dl rel ro-track runsOn e_rt_track e_host_poste\n%% @dl evidence "h2a:packages/track/package.json:33"',
        '%% @dl edge ro-track runsOn\n%% @dl evidence "h2a:packages/track/package.json:33"\ne_rt_track -->|"sur"| e_host_poste',
      ),
      "mermaid-strict-placement-drift",
    );
    // edge-encoded relation (deployedAs) written as rel
    expectParseCode(
      base.replace(
        '%% @dl edge da-track deployedAs\n%% @dl evidence "h2a:packages/track/package.json:33"\ne_pkg_track -->|"déployé comme"| e_rt_track',
        '%% @dl rel da-track deployedAs e_pkg_track e_rt_track\n%% @dl evidence "h2a:packages/track/package.json:33"\n%% @dl label "déployé comme"',
      ),
      "mermaid-strict-placement-drift",
    );
  });

  it("8. mermaid-strict-style-drift: arrow dash mismatch with lifecycle and class block mismatch with preview status", () => {
    // Current edge written with -.->
    expectParseCode(
      base.replace(
        'e_pkg_track -->|"déployé comme"| e_rt_track',
        'e_pkg_track -.->|"déployé comme"| e_rt_track',
      ),
      "mermaid-strict-style-drift",
    );
    // Proposed edge written with -->
    expectParseCode(
      base.replace(
        'e_rt_h2a -.->|"appelle · propositions et questions"| e_api_memory',
        'e_rt_h2a -->|"appelle · propositions et questions"| e_api_memory',
      ),
      "mermaid-strict-style-drift",
    );
    // Missing entity in class dashed block
    expectParseCode(
      base.replace("class e_host_cluster,e_svc_live dashed", "class e_svc_live dashed"),
      "mermaid-strict-style-drift",
    );
    // Missing class block when proposed entities exist
    expectParseCode(
      base.replace("\n\nclassDef dashed stroke-dasharray: 5 5\nclass e_host_cluster,e_svc_live dashed", ""),
      "mermaid-strict-style-drift",
    );
  });

  it("9. mermaid-strict-noncanonical: reported on non-canonical text in check mode", () => {
    const err = expectParseCode(`${base}\n`, "mermaid-strict-noncanonical", { checkCanonical: true });
    expect(err.code).toBe("mermaid-strict-noncanonical");
  });

  it("10. mermaid-strict-unrepresentable: refuses triples outside print domain M (M1–M12)", () => {
    // M1: invalid entity local id
    const m1 = structuredClone(JOINT_R2_TEINTES) as any;
    m1.document.entities["entity:Bad_Id"] = {
      ...m1.document.entities["entity:rt-track"],
      id: "entity:Bad_Id",
    };
    expectPrintCode(m1);

    // M2: non-empty ports
    const m2 = structuredClone(JOINT_R2_TEINTES) as any;
    m2.document.ports = { "port:p1": {} };
    expectPrintCode(m2);

    // M3: generic@2 entity of type 'node' or carrying lifecycle
    const m3Type = structuredClone(JOINT_R2_TEINTES) as any;
    m3Type.document.entities["entity:legend-memoire"].type = "container";
    expectPrintCode(m3Type);

    const m3Life = structuredClone(JOINT_R2_TEINTES) as any;
    m3Life.document.entities["entity:legend-memoire"].attributes.lifecycle = {
      kind: "enum",
      value: "current",
    };
    expectPrintCode(m3Life);

    // M4: dangling relation endpoint
    const m4 = structuredClone(JOINT_R2_TEINTES) as any;
    m4.document.relations["relation:da-track"].endpoints[1].target = "entity:missing";
    expectPrintCode(m4);

    // M5: two partOf parents on one entity
    const m5 = structuredClone(JOINT_R2_TEINTES) as any;
    m5.document.relations["relation:po-dup-parent"] = {
      id: "relation:po-dup-parent",
      profile: "archi@1",
      type: "partOf",
      endpoints: [
        { role: "source", target: "entity:rt-track" },
        { role: "target", target: "entity:sys-h2a" },
      ],
      attributes: {
        lifecycle: { kind: "enum", value: "current" },
        evidence: { kind: "collection", items: [{ kind: "text", value: "x" }] },
      },
    };
    expectPrintCode(m5);

    // M6: undeclared attribute on entity
    const m6 = structuredClone(JOINT_R2_TEINTES) as any;
    m6.document.entities["entity:rt-track"].attributes.unknownAttr = { kind: "text", value: "x" };
    expectPrintCode(m6);

    // M7: archi@1 entity without lifecycle
    const m7 = structuredClone(JOINT_R2_TEINTES) as any;
    delete m7.document.entities["entity:rt-track"].attributes.lifecycle;
    expectPrintCode(m7);

    // M8: control character in string
    const m8 = structuredClone(JOINT_R2_TEINTES) as any;
    m8.document.entities["entity:rt-track"].attributes.role.value = "bad\nline";
    expectPrintCode(m8);

    // M9: manifest.document !== "document.json"
    const m9 = structuredClone(JOINT_R2_TEINTES) as any;
    m9.manifest.document = "other.json";
    expectPrintCode(m9);

    // M12: unsorted draw set or duplicate in legend.order
    const m12Set = structuredClone(JOINT_R2_TEINTES) as any;
    m12Set.views[0].draw = [...m12Set.views[0].draw].reverse();
    expectPrintCode(m12Set);

    const m12List = structuredClone(JOINT_R2_TEINTES) as any;
    m12List.views[0].legend.order = ["entity:key-alim", "entity:key-alim"];
    expectPrintCode(m12List);
  });
});
