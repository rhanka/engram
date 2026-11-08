// Mermaid-strict codec tests for archi@1 descriptions (P2-PARTITION-NOTE.r3.md, grammar engram.archi-mermaid/1).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import { ARCHI_CARDS_CONTENT } from "../src/ontology-guardian/archi-cards-data.js";
import {
  archiRelationEncoding,
  buildArchiSemanticModel,
} from "../src/ontology-guardian/archi-cards.js";
import {
  checkArchi,
  type ArchiDiagnosticCode,
} from "../src/ontology-guardian/archi-check.js";
import {
  ARCHI1_DECLARATION,
  ARCHI1_TUPLES,
} from "../src/ontology-guardian/archi-profile.js";
import { canonicalBytes } from "../src/ontology-guardian/canonical.js";
import { validPointer } from "../src/ontology-guardian/diagnostics.js";
import type { NativeSemanticDocument } from "../src/ontology-guardian/diagram-native-types.js";
import { GENERIC_V2 } from "../src/ontology-guardian/diagram-profiles.js";
import {
  ARCHI_MERMAID_DIAGNOSTIC_CODES,
  formatArchiMermaid,
  parseArchiMermaid,
  printArchiMermaid,
  type ArchiManifest,
  type ArchiMermaidDiagnostic,
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

function unwrapPrint(triple: ArchiSourceTriple, options?: { readonly subjectRef?: string }): string {
  const res = printArchiMermaid(triple, options);
  expect(res.ok, res.ok ? "" : res.diagnostics[0]?.message).toBe(true);
  if (!res.ok) throw new Error(res.diagnostics[0]?.message);
  return res.value;
}

function unwrapParse(
  text: string,
  options?: { readonly checkCanonical?: boolean; readonly subjectRef?: string },
): ArchiSourceTriple {
  const res = parseArchiMermaid(text, options);
  expect(res.ok, res.ok ? "" : res.diagnostics[0]?.message).toBe(true);
  if (!res.ok) throw new Error(res.diagnostics[0]?.message);
  return res.value;
}

function unwrapFormat(
  text: string,
  options?: { readonly check?: boolean; readonly subjectRef?: string },
): string {
  const res = formatArchiMermaid(text, options);
  expect(res.ok, res.ok ? "" : res.diagnostics[0]?.message).toBe(true);
  if (!res.ok) throw new Error(res.diagnostics[0]?.message);
  return res.value;
}

function expectParseCode(
  text: unknown,
  expectedCode: ArchiMermaidDiagnosticCode,
  options?: { readonly checkCanonical?: boolean; readonly subjectRef?: string },
): ArchiMermaidDiagnostic {
  const res = parseArchiMermaid(text, options);
  expect(res.ok, `expected parseArchiMermaid to refuse with ${expectedCode}`).toBe(false);
  if (res.ok) throw new Error("expected ok: false");
  expect(res.diagnostics).toHaveLength(1);
  const diag = res.diagnostics[0];
  expect(diag.origin).toBe("engram");
  expect(diag.severity).toBe("error");
  expect(diag.code).toBe(expectedCode);
  expect(diag.nativeCode).toBe(expectedCode);
  expect(validPointer(diag.path)).toBe(true);
  expect(diag.path).toMatch(/^\/\d+$/);
  expect(diag.message).toMatch(/column \d+/);
  expect(diag.subjectRef).toBe(
    options?.subjectRef ?? ".engram/architecture/architecture.mmd",
  );
  expect(Object.keys(diag).sort()).toEqual([
    "code",
    "message",
    "nativeCode",
    "origin",
    "path",
    "severity",
    "subjectRef",
  ]);
  return diag;
}

function expectPrintCode(
  triple: unknown,
  expectedCode: ArchiMermaidDiagnosticCode = "mermaid-strict-unrepresentable",
): ArchiMermaidDiagnostic {
  const res = printArchiMermaid(triple);
  expect(res.ok, `expected printArchiMermaid to refuse with ${expectedCode}`).toBe(false);
  if (res.ok) throw new Error("expected ok: false");
  expect(res.diagnostics).toHaveLength(1);
  const diag = res.diagnostics[0];
  expect(diag.origin).toBe("engram");
  expect(diag.severity).toBe("error");
  expect(diag.code).toBe(expectedCode);
  expect(diag.nativeCode).toBe(expectedCode);
  expect(validPointer(diag.path)).toBe(true);
  expect(Object.keys(diag).sort()).toEqual([
    "code",
    "message",
    "nativeCode",
    "origin",
    "path",
    "severity",
    "subjectRef",
  ]);
  return diag;
}

describe("engram.archi-mermaid/1 — corpus round trips (G-T1, G-T2, G-T3)", () => {
  const fixtures: readonly [string, ArchiSourceTriple][] = [
    ["joint-r2", JOINT_R2],
    ["hosts-r3", HOSTS_R3],
    ["joint-r2-teintes", JOINT_R2_TEINTES],
  ];

  it.each(fixtures)(
    "%s: parseArchiMermaid(printArchiMermaid(j)) equals j on JCS bytes, printArchiMermaid(parseArchiMermaid(t)) equals formatArchiMermaid(t), formatArchiMermaid(t) equals t",
    (_name, j) => {
      const t = unwrapPrint(j);
      expect(t.startsWith("flowchart LR\n%% @dl format engram.archi-mermaid/1\n")).toBe(true);
      expect(t.endsWith("\n")).toBe(true);
      expect(t.endsWith("\n\n")).toBe(false);
      // K9: canonical text holds no '{'
      expect(t.includes("{")).toBe(false);

      // formatArchiMermaid(t) === t for canonical text (G-T1)
      expect(unwrapFormat(t)).toBe(t);
      expect(unwrapFormat(t, { check: true })).toBe(t);

      // parseArchiMermaid(printArchiMermaid(j)) equals j on per-record and whole-triple JCS bytes (G-T3)
      const roundTripped = unwrapParse(t, { checkCanonical: true });
      expect(canonicalBytes(roundTripped.manifest)).toBe(canonicalBytes(j.manifest));
      expect(canonicalBytes(roundTripped.document)).toBe(canonicalBytes(j.document));
      expect(roundTripped.views).toHaveLength(j.views.length);
      for (let i = 0; i < j.views.length; i++) {
        expect(canonicalBytes(roundTripped.views[i])).toBe(canonicalBytes(j.views[i]));
      }
      expect(canonicalBytes(roundTripped)).toBe(canonicalBytes(j));

      // printArchiMermaid(parseArchiMermaid(t)) equals formatArchiMermaid(t) (G-T2)
      expect(unwrapPrint(unwrapParse(t))).toBe(unwrapFormat(t));
    },
  );

  it("joint-r2-teintes: preserves generic@2 legend, legend-key and contains without synthesizing lifecycle and matches §4.9 fragment lines", () => {
    const t = unwrapPrint(JOINT_R2_TEINTES);
    const parsed = unwrapParse(t);

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

  it("G-T2: non-canonical mutants of K1–K12 parse to the same model, print(parse(t)) === format(t), format restores canonical bytes, and check mode reports mermaid-strict-noncanonical (or mermaid-strict-invalid for lexical K9/K10 mutants)", () => {
    const base = unwrapPrint(JOINT_R2_TEINTES);

    // Note on K9 and K10 (m8):
    // K9 (closed escape sets in VSTRING/ASTRING) and K10 (minimal base-10 integers without leading zeros)
    // are enforced directly by the lexical grammar of engram.archi-mermaid/1. Any non-canonical escape
    // (such as `#97;` in VSTRING or `\u0041` in ASTRING) or leading-zero integer (`024` on gap, `01.1` on schema,
    // `00` on revision) is rejected at the lexical stage with `mermaid-strict-invalid` (verified below).
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
      const parsed = unwrapParse(mutant);
      expect(canonicalBytes(parsed), label).toBe(canonicalBytes(JOINT_R2_TEINTES));
      expect(unwrapPrint(parsed), label).toBe(base);
      expect(unwrapFormat(mutant), label).toBe(base);
      expectParseCode(mutant, "mermaid-strict-noncanonical", { checkCanonical: true });
      const fmtCheck = formatArchiMermaid(mutant, { check: true });
      expect(fmtCheck.ok).toBe(false);
      if (!fmtCheck.ok) {
        expect(fmtCheck.diagnostics[0].code).toBe("mermaid-strict-noncanonical");
      }
    }

    // K9 lexical escape mutants (#97; in VSTRING and \u0041 in ASTRING) -> mermaid-strict-invalid (m8)
    expectParseCode(
      base.replace('e_rt_track["track"]', 'e_rt_track["tr#97;ck"]'),
      "mermaid-strict-invalid",
    );
    expectParseCode(
      base.replace(
        '%% @dl role "Contrôle chaque écriture"',
        '%% @dl role "\\u0041Contrôle chaque écriture"',
      ),
      "mermaid-strict-invalid",
    );

    // K10 leading-zero integer mutants (gap card-x 024, schema 01.1, revision 00) -> mermaid-strict-invalid (m8)
    expectParseCode(
      base.replace(
        "%% @dl view roles-teintes archi-composition",
        "%% @dl view roles-teintes archi-composition\n%% @dl gap card-x 024",
      ),
      "mermaid-strict-invalid",
    );
    expectParseCode(
      base.replace("%% @dl schema 1.1", "%% @dl schema 01.1"),
      "mermaid-strict-invalid",
    );
    expectParseCode(
      base.replace("%% @dl revision 0", "%% @dl revision 00"),
      "mermaid-strict-invalid",
    );
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

    const t = unwrapPrint(triple);
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

    expect(unwrapFormat(t)).toBe(t);
    const back = unwrapParse(t, { checkCanonical: true });
    expect(canonicalBytes(back)).toBe(canonicalBytes(triple));
  });

  it("refuses raw '[', ']', '#', '{' or unknown entity escape in VSTRING and raw '{' or bad escape in ASTRING with mermaid-strict-invalid", () => {
    const base = unwrapPrint(JOINT_R2);
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
    const base = unwrapPrint(JOINT_R2);
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
    const tJoint = unwrapPrint(JOINT_R2);
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
    const tAllExp = unwrapPrint(allExpanded);
    expect(tAllExp).toContain("%% @dl expanded e_pkg_h2a");
    expect(tAllExp).toContain("%% @dl expanded e_pkg_plugin");
    expect(tAllExp).toContain("%% @dl expanded e_pkg_track");
    expect(tAllExp).toContain("%% @dl expanded e_sys_engram");
    expect(tAllExp).toContain("%% @dl expanded e_sys_h2a");
    expect(tAllExp).toContain("%% @dl expanded e_sys_track");
    expect(canonicalBytes(unwrapParse(tAllExp))).toBe(canonicalBytes(allExpanded));

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
    const tChildless = unwrapPrint(childlessContainer);
    expect(tChildless).toContain("%% @dl draw e_host_poste");
    expect(tChildless).not.toContain("%% @dl expanded e_host_poste");
    expect(canonicalBytes(unwrapParse(tChildless))).toBe(canonicalBytes(childlessContainer));
  });

  it("refuses expanded on undrawn container, non-container, unknown entity, duplicate expanded, and fold/collapsed keywords", () => {
    const base = unwrapPrint(JOINT_R2_TEINTES);

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
      ...j2.views[0]!,
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

    const t1 = unwrapPrint(j1);
    const t2 = unwrapPrint(j2);
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

    expect(canonicalBytes(unwrapParse(t1, { checkCanonical: true }))).toBe(canonicalBytes(j1));
    expect(canonicalBytes(unwrapParse(t2, { checkCanonical: true }))).toBe(canonicalBytes(j2));

    // Interleaved non-canonical group item lines parse to j1 and formatArchiMermaid restores t1 (§4.6)
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
    expect(canonicalBytes(unwrapParse(interleaved))).toBe(canonicalBytes(j1));
    expect(unwrapFormat(interleaved)).toBe(t1);
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
    const t = unwrapPrint(j);
    expect(canonicalBytes(unwrapParse(t, { checkCanonical: true }))).toBe(canonicalBytes(j));

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
  const base = unwrapPrint(JOINT_R2_TEINTES);

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

  it("1. mermaid-strict-invalid: lexical errors, missing parts, unbalanced subgraph, out-of-order section, kind-spelling mismatch, non-SP whitespace (m3), unsafe ints (m2)", () => {
    // BOM, CR, TAB, control character
    expectParseCode(`\uFEFF${base}`, "mermaid-strict-invalid");
    expectParseCode(base.replace("flowchart LR\n", "flowchart LR\n\uFEFF"), "mermaid-strict-invalid");
    expectParseCode(base.replace("\n", "\r\n"), "mermaid-strict-invalid");
    expectParseCode(base.replace("flowchart LR", "flowchart\tLR"), "mermaid-strict-invalid");
    expectParseCode(base.replace("flowchart LR", "flowchart LR\u0007"), "mermaid-strict-invalid");

    // m3: non-SP Unicode whitespace (U+00A0, U+2003) on line 1, blank line, and annotation line
    expectParseCode(base.replace("flowchart LR\n", "flowchart LR\u00A0\n"), "mermaid-strict-invalid");
    expectParseCode(base.replace("%% @dl language fr", "%% @dl language fr\u2003"), "mermaid-strict-invalid");
    expectParseCode(`\u00A0\n${base}`, "mermaid-strict-invalid");
    expectParseCode(base.replace("flowchart LR\n", "flowchart\u00A0LR\n"), "mermaid-strict-invalid");

    // m2: integers exceeding Number.MAX_SAFE_INTEGER
    expectParseCode(
      base.replace("%% @dl revision 0", "%% @dl revision 9007199254740993"),
      "mermaid-strict-invalid",
    );
    expectParseCode(
      base.replace("%% @dl schema 1.1", "%% @dl schema 9007199254740993.0"),
      "mermaid-strict-invalid",
    );
    expectParseCode(
      base.replace(
        "%% @dl view roles-teintes archi-composition",
        "%% @dl view roles-teintes archi-composition\n%% @dl gap card-x 9007199254740993",
      ),
      "mermaid-strict-invalid",
    );
    expectParseCode(
      base.replace(
        "%% @dl pin cards archi-cards 1 ",
        "%% @dl pin cards archi-cards 9007199254740993 ",
      ),
      "mermaid-strict-invalid",
    );

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

  it("2. mermaid-strict-unsupported: non-LR flowchart, directives, front-matter, free comments, unsupported shapes/links/classes (m4)", () => {
    expectParseCode(base.replace("flowchart LR", "flowchart TB"), "mermaid-strict-unsupported");
    expectParseCode(base.replace("flowchart LR", "graph LR"), "mermaid-strict-unsupported");
    expectParseCode(`%%{init: {'theme': 'dark'}}%%\n${base}`, "mermaid-strict-unsupported");
    // m4: front-matter, free comment, or classDef before flowchart LR on line 1
    expectParseCode(`---\ntitle: x\n---\n${base}`, "mermaid-strict-unsupported");
    expectParseCode(`%% free comment before header\n${base}`, "mermaid-strict-unsupported");
    expectParseCode(`classDef foo fill:#f00\n${base}`, "mermaid-strict-unsupported");
    // m4: classDef in head section (after flowchart LR, before head is complete)
    expectParseCode(
      base.replace("flowchart LR", "flowchart LR\nclassDef foo fill:#f00"),
      "mermaid-strict-unsupported",
    );
    expectParseCode(base.replace("flowchart LR", "flowchart LR\n%% free comment"), "mermaid-strict-unsupported");
    expectParseCode(base.replace("%% @dl language fr", "%%@dl language fr"), "mermaid-strict-unsupported");
    expectParseCode(base.replace("flowchart LR", "flowchart LR\ndirection TB"), "mermaid-strict-unsupported");
    expectParseCode(base.replace("flowchart LR", "flowchart LR\nstyle e_rt_track fill:#f00"), "mermaid-strict-unsupported");
    // m4: accTitle: and accDescr: with trailing colon
    expectParseCode(base.replace("flowchart LR", "flowchart LR\naccTitle: My Title"), "mermaid-strict-unsupported");
    expectParseCode(base.replace("flowchart LR", "flowchart LR\naccDescr: My Description"), "mermaid-strict-unsupported");
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
    // m4: subroutine [[...]] and parallelogram [/.../] shapes
    expectParseCode(
      base.replace('e_rt_track["track"]', 'e_rt_track[["track"]]'),
      "mermaid-strict-unsupported",
    );
    expectParseCode(
      base.replace('e_rt_track["track"]', 'e_rt_track[/"track"/]'),
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
    // m4: Markdown string on edge label
    expectParseCode(
      base.replace(
        'e_pkg_track -->|"déployé comme"| e_rt_track',
        'e_pkg_track -->|"`déployé comme`"| e_rt_track',
      ),
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
    const diag = expectParseCode(`${base}\n`, "mermaid-strict-noncanonical", { checkCanonical: true });
    expect(diag.code).toBe("mermaid-strict-noncanonical");
  });

  it("10. mermaid-strict-unrepresentable: refuses triples outside print domain M (M1–M12, M3, m1, m2, m9)", () => {
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

    // M3: generic@2 entity of type 'container' or carrying lifecycle
    const m3Type = structuredClone(JOINT_R2_TEINTES) as any;
    m3Type.document.entities["entity:legend-memoire"].type = "container";
    expectPrintCode(m3Type);

    const m3Life = structuredClone(JOINT_R2_TEINTES) as any;
    m3Life.document.entities["entity:legend-memoire"].attributes.lifecycle = {
      kind: "enum",
      value: "current",
    };
    expectPrintCode(m3Life);

    // Review M3: nesting relation type contradicts child family (contains on archi@1, partOf on generic@2)
    const m3ContainsOnArchi = structuredClone(JOINT_R2_TEINTES) as any;
    m3ContainsOnArchi.document.relations["relation:po-pkg-track"] = {
      id: "relation:po-pkg-track",
      profile: "generic@2",
      type: "contains",
      endpoints: [
        { role: "parent", target: "entity:sys-track" },
        { role: "child", target: "entity:pkg-track" },
      ],
      attributes: {},
    };
    expectPrintCode(m3ContainsOnArchi);

    const m3PartOfOnGeneric = structuredClone(JOINT_R2_TEINTES) as any;
    m3PartOfOnGeneric.document.relations["relation:ct-key-alim"] = {
      id: "relation:ct-key-alim",
      profile: "archi@1",
      type: "partOf",
      endpoints: [
        { role: "source", target: "entity:key-alim" },
        { role: "target", target: "entity:legend-memoire" },
      ],
      attributes: {
        lifecycle: { kind: "enum", value: "current" },
      },
    };
    expectPrintCode(m3PartOfOnGeneric);

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

    // Review m9: views array order does not match manifest.views order
    const m9ViewsOrder = structuredClone(HOSTS_R3) as any;
    m9ViewsOrder.views = [...m9ViewsOrder.views].reverse();
    expectPrintCode(m9ViewsOrder);

    // M12: unsorted draw set or duplicate in legend.order
    const m12Set = structuredClone(JOINT_R2_TEINTES) as any;
    m12Set.views[0].draw = [...m12Set.views[0].draw].reverse();
    expectPrintCode(m12Set);

    const m12List = structuredClone(JOINT_R2_TEINTES) as any;
    m12List.views[0].legend.order = ["entity:key-alim", "entity:key-alim"];
    expectPrintCode(m12List);
  });
});

describe("engram.archi-mermaid/1 — Round 2 review regression suite (B1, M1, M2, m1, m2, m6, m7)", () => {
  it("M1: parseArchiMermaid, printArchiMermaid, and formatArchiMermaid agree on WORD enums; stage 3 rejects semantic enum typos", () => {
    const base = unwrapPrint(JOINT_R2_TEINTES);

    // 1. Typo on lifecycle ('propsed') parses and formats without throwing or returning unrepresentable
    const badLifecycleText = base.replace("%% @dl lifecycle proposed", "%% @dl lifecycle propsed");
    const parsedLc = unwrapParse(badLifecycleText);
    expect(parsedLc.document.entities["entity:svc-live"]?.attributes["lifecycle"]).toEqual({
      kind: "enum",
      value: "propsed",
    });
    expect(unwrapFormat(badLifecycleText)).toBe(badLifecycleText);
    expect(unwrapFormat(badLifecycleText, { check: true })).toBe(badLifecycleText);

    // 2. Typo on form ('jsonll') parses and formats at the codec layer
    const badFormText = base.replace("%% @dl entity store jsonl", "%% @dl entity store jsonll");
    const parsedForm = unwrapParse(badFormText);
    expect(parsedForm.document.entities["entity:st-events"]?.attributes["form"]).toEqual({
      kind: "enum",
      value: "jsonll",
    });
    expect(unwrapFormat(badFormText)).toBe(badFormText);

    // 3. Typo on enum ('mode wrte') parses and formats at the codec layer, and is rejected by checkArchi
    const badWpRelText = base.replace("%% @dl mode append", "%% @dl mode wrte");
    const parsedMode = unwrapParse(badWpRelText);
    const accessesRel = Object.values(parsedMode.document.relations).find(
      (r) => r.type === "accesses" && (r.attributes["mode"] as any)?.value === "wrte",
    );
    expect(accessesRel?.attributes["mode"]).toEqual({
      kind: "enum",
      value: "wrte",
    });
    expect(unwrapFormat(badWpRelText)).toBe(badWpRelText);
    const modeDiags = checkArchi(parsedMode.document, ARCHI_CARDS_CONTENT, parsedMode.manifest.language);
    expect(modeDiags.some((d) => d.code === "archi-footer-missing")).toBe(true);

    // 4. Unsupported language ('de') parses and formats at the codec layer, and is rejected by checkArchi (archi-input-invalid)
    const badLangText = base.replace("%% @dl language fr", "%% @dl language de");
    const parsedLang = unwrapParse(badLangText);
    expect(parsedLang.manifest.language).toBe("de");
    expect(unwrapFormat(badLangText)).toBe(badLangText);
    const langDiags = checkArchi(parsedLang.document, ARCHI_CARDS_CONTENT, parsedLang.manifest.language);
    expect(langDiags.length).toBeGreaterThan(0);
    expect(langDiags[0]?.code).toBe("archi-input-invalid");
  });

  it("M2: Object.prototype keys (constructor, toString, __proto__, valueOf) never leak or throw in parseArchiMermaid or printArchiMermaid", () => {
    const base = unwrapPrint(JOINT_R2_TEINTES);

    for (const protoKey of ["constructor", "toString", "__proto__", "valueOf", "hasOwnProperty"]) {
      // Gap key in view block -> mermaid-strict-invalid
      expectParseCode(
        base.replace(
          "%% @dl view roles-teintes archi-composition",
          `%% @dl view roles-teintes archi-composition\n%% @dl gap ${protoKey} 10`,
        ),
        "mermaid-strict-invalid",
      );

      // Attribute name in entity block -> mermaid-strict-annotation-unknown (or invalid for __proto__)
      expectParseCode(
        base.replace("%% @dl entity system", `%% @dl entity system\n%% @dl ${protoKey} "x"`),
        "mermaid-strict-annotation-unknown",
      );

      // printArchiMermaid existence checks on entity IDs
      const badOwning = structuredClone(JOINT_R2_TEINTES) as any;
      badOwning.manifest.owningRepo = protoKey;
      expectPrintCode(badOwning);

      const badEndpoint = structuredClone(JOINT_R2_TEINTES) as any;
      badEndpoint.document.relations["relation:da-track"].endpoints[0].target = protoKey;
      expectPrintCode(badEndpoint);

      const badDraw = structuredClone(JOINT_R2_TEINTES) as any;
      badDraw.views[0].draw = [protoKey];
      badDraw.views[0].collapsed = [];
      expectPrintCode(badDraw);

      const badLegendRef = structuredClone(JOINT_R2_TEINTES) as any;
      badLegendRef.views[0].legend.legendRef = protoKey;
      expectPrintCode(badLegendRef);

      const badLegendOrder = structuredClone(JOINT_R2_TEINTES) as any;
      badLegendOrder.views[0].legend.order = [protoKey];
      expectPrintCode(badLegendOrder);

      const badOrdParent = structuredClone(JOINT_R2_TEINTES) as any;
      badOrdParent.views[0].layout = {
        ordering: { [protoKey]: ["entity:pkg-h2a"] },
      };
      expectPrintCode(badOrdParent);

      const badOrdChild = structuredClone(JOINT_R2_TEINTES) as any;
      badOrdChild.views[0].layout = {
        ordering: { "entity:sys-h2a": [protoKey] },
      };
      expectPrintCode(badOrdChild);

      const badGroupItem = structuredClone(JOINT_R2_TEINTES) as any;
      badGroupItem.views[0].layout = {
        grouping: [{ id: "g1", direction: "rows", items: [protoKey] }],
      };
      expectPrintCode(badGroupItem);
    }
  });

  it("m1 & m2: printArchiMermaid refuses unknown keys on all 15 closed record shapes, array buckets, and unsafe integers", () => {
    const mutations: ((t: any) => void)[] = [
      (t) => { t.extra = 1; },
      (t) => { t.manifest.extra = 1; },
      (t) => { t.manifest.viewSchemaPin.extra = 1; },
      (t) => { t.document.extra = 1; },
      (t) => { t.document.schemaVersion.patch = 0; },
      (t) => { t.document.typeDefinitions = []; },
      (t) => { t.document.ports = []; },
      (t) => { t.document.resources = []; },
      (t) => { t.document.entities = []; },
      (t) => { t.document.relations = []; },
      (t) => { t.document.entities["entity:rt-track"].extra = 1; },
      (t) => { t.document.entities["entity:rt-track"].attributes.name.extra = 1; },
      (t) => { t.document.entities["entity:rt-track"].attributes.form.extra = 1; },
      (t) => { t.document.entities["entity:rt-track"].attributes.role.extra = 1; },
      (t) => { t.document.entities["entity:rt-track"].attributes.evidence.extra = 1; },
      (t) => { t.document.entities["entity:rt-track"].attributes.evidence.items[0].extra = 1; },
      (t) => { t.document.relations["relation:da-track"].extra = 1; },
      (t) => { t.document.relations["relation:da-track"].endpoints[0].extra = 1; },
      (t) => { t.views[0].extra = 1; },
      (t) => { t.views[0].legend.extra = 1; },
      (t) => { t.views[0].legend.tokens[0].extra = 1; },
      (t) => { t.views[0].layout = { stretch: true, extra: 1 }; },
      (t) => {
        t.views[0].layout = {
          grouping: [{ id: "g1", direction: "rows", items: ["entity:sys-h2a"], extra: 1 }],
        };
      },
      // m2: unsafe integers in print
      (t) => { t.document.revision = 1e21; },
      (t) => { t.document.schemaVersion.major = Number.MAX_SAFE_INTEGER + 1; },
      (t) => { t.manifest.viewSchemaPin.version = "9007199254740993"; },
      (t) => { t.views[0].layout = { cardGapX: 1e21 }; },
      (t) => {
        t.views[0].layout = {
          grouping: [{ id: "g1", direction: "rows", gapAfter: Number.MAX_SAFE_INTEGER + 1, items: ["entity:sys-h2a"] }],
        };
      },
    ];

    for (const mutate of mutations) {
      const clone = structuredClone(JOINT_R2_TEINTES) as any;
      mutate(clone);
      expectPrintCode(clone, "mermaid-strict-unrepresentable");
    }
  });

  it("m7: orders legend.tokens by decoded model category UTF-16 code units even when ASTRING escaping reverses lexeme order", () => {
    // Model categories: 'a"b' (char code 34 at index 1) < 'a#b' (char code 35 at index 1).
    // ASTRING lexemes: '"a\\"b"' (char code 92 '\\' at index 2) > '"a#b"' (char code 35 '#' at index 2).
    const j = structuredClone(JOINT_R2_TEINTES) as any;
    j.views[0].legend.tokens = [
      { category: 'a"b', token: "st-semantic-data-category1" },
      { category: "a#b", token: "st-semantic-data-category2" },
    ];
    const printed = unwrapPrint(j);
    expect(printed).toContain(
      '%% @dl token "a\\"b" st-semantic-data-category1\n%% @dl token "a#b" st-semantic-data-category2',
    );
    const back = unwrapParse(printed, { checkCanonical: true });
    expect(canonicalBytes(back)).toBe(canonicalBytes(j));
  });

  it("m6: drift guard — codec tables, relation placement, and diagnostic codes match ARCHI1_DECLARATION, GENERIC_V2, ARCHI1_TUPLES, archiRelationEncoding, and ArchiDiagnosticCode", () => {
    // 1. Type-level equality on the 10 mermaid-strict-* diagnostic codes
    expectTypeOf<ArchiMermaidDiagnosticCode>().toEqualTypeOf<
      Extract<ArchiDiagnosticCode, `mermaid-strict-${string}`>
    >();

    // 2. Verify all 11 archi@1 entity types + 2 generic@2 legend entity types (container flags, forms, and attributes)
    for (const et of ARCHI1_DECLARATION.entityTypes) {
      const formAttr = et.attributes.find((a) => a.name === "form") as { readonly values?: readonly string[] } | undefined;
      const sampleForm = formAttr?.values?.[0];
      const probe = structuredClone(JOINT_R2) as any;
      const extraAttrs: Record<string, any> = {
        name: { kind: "text", value: `Probe ${et.id}` },
        lifecycle: { kind: "enum", value: "current" },
        ...(sampleForm ? { form: { kind: "enum", value: sampleForm } } : {}),
      };
      for (const attr of et.attributes) {
        const attrName = String(attr.name);
        if (attrName === "name" || attrName === "form" || attrName === "lifecycle") continue;
        if (attr.kind === "text") extraAttrs[attrName] = { kind: "text", value: "v" };
        else if (attr.kind === "enum") extraAttrs[attrName] = { kind: "enum", value: "v" };
        else if (attr.kind === "collection") extraAttrs[attrName] = { kind: "collection", items: [{ kind: "text", value: "v" }] };
      }
      probe.document.entities["entity:probe-ent"] = {
        id: "entity:probe-ent",
        profile: "archi@1",
        type: et.id,
        attributes: extraAttrs,
      };
      const text = unwrapPrint(probe);
      if (et.container) {
        expect(text).toContain(`subgraph e_probe_ent["Probe ${et.id}"]`);
      } else {
        expect(text).toContain(`\ne_probe_ent["Probe ${et.id}"]`);
      }
      expect(canonicalBytes(unwrapParse(text, { checkCanonical: true }))).toBe(canonicalBytes(probe));
    }

    // 3. Verify all 55 ARCHI1_TUPLES against archiRelationEncoding
    for (const tuple of ARCHI1_TUPLES) {
      const srcDef = ARCHI1_DECLARATION.entityTypes.find((e) => e.id === tuple.sourceType)!;
      const tgtDef = ARCHI1_DECLARATION.entityTypes.find((e) => e.id === tuple.targetType)!;
      const srcForm = (srcDef.attributes.find((a) => a.name === "form") as { readonly values?: readonly string[] } | undefined)?.values?.[0];
      const tgtForm = (tgtDef.attributes.find((a) => a.name === "form") as { readonly values?: readonly string[] } | undefined)?.values?.[0];

      const writerPolicies = tuple.targetType === "store" ? (["single-writer", "multi-writer"] as const) : ([undefined] as const);
      const modes = tuple.relationType === "accesses" ? (["read", "append", "write"] as const) : ([undefined] as const);

      for (const wp of writerPolicies) {
        for (const mode of modes) {
          const probe = structuredClone(JOINT_R2) as any;
          probe.document.entities["entity:p-src"] = {
            id: "entity:p-src",
            profile: "archi@1",
            type: tuple.sourceType,
            attributes: {
              name: { kind: "text", value: "Src" },
              lifecycle: { kind: "enum", value: "current" },
              ...(srcForm ? { form: { kind: "enum", value: srcForm } } : {}),
            },
          };
          probe.document.entities["entity:p-tgt"] = {
            id: "entity:p-tgt",
            profile: "archi@1",
            type: tuple.targetType,
            attributes: {
              name: { kind: "text", value: "Tgt" },
              lifecycle: { kind: "enum", value: "current" },
              ...(tgtForm ? { form: { kind: "enum", value: tgtForm } } : {}),
              ...(wp ? { writerPolicy: { kind: "enum", value: wp } } : {}),
            },
          };
          const relRecord = {
            id: "relation:p-rel",
            profile: "archi@1" as const,
            type: tuple.relationType,
            endpoints: [
              { role: "source", target: "entity:p-src" },
              { role: "target", target: "entity:p-tgt" },
            ],
            attributes: {
              lifecycle: { kind: "enum" as const, value: "current" },
              ...(mode ? { mode: { kind: "enum" as const, value: mode } } : {}),
            },
          };
          probe.document.relations["relation:p-rel"] = relRecord;

          const model = buildArchiSemanticModel(probe.document);
          const guardianEnc = archiRelationEncoding(model, relRecord);
          const printed = unwrapPrint(probe);
          if (tuple.relationType === "partOf") {
            expect(printed).toContain("%% @dl nest p-rel");
          } else if (guardianEnc === "arrow") {
            expect(printed).toContain(`%% @dl edge p-rel ${tuple.relationType}`);
          } else {
            expect(printed).toContain(`%% @dl rel p-rel ${tuple.relationType} e_p_src e_p_tgt`);
          }
          expect(canonicalBytes(unwrapParse(printed, { checkCanonical: true }))).toBe(canonicalBytes(probe));
        }
      }
    }
  });

  it("B1: property test — 5,000 text mutations and 5,000 JSON mutations never throw and always return a valid result union", () => {
    const baseText = unwrapPrint(JOINT_R2_TEINTES);
    const baseLines = baseText.split("\n");
    const codeSet = new Set<string>(ARCHI_MERMAID_DIAGNOSTIC_CODES);

    // Deterministic xorshift32 PRNG
    let seed = 0x9e3779b9;
    const nextRand = (): number => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed >>> 0;
    };
    const pick = <T>(arr: readonly T[]): T => arr[nextRand() % arr.length]!;

    const trickyTokens = [
      "constructor",
      "toString",
      "__proto__",
      "valueOf",
      "hasOwnProperty",
      "flowchart TB",
      "---",
      "%%{init: {}}%%",
      "%% comment",
      "accTitle: x",
      "classDef x fill:#000",
      "class e_rt_track x",
      'e_rt_track[["sub"]]',
      'e_rt_track["`md`"]',
      "%% @dl gap constructor 1",
      "%% @dl gap card-x 9007199254740993",
      "%% @dl gap card-x 024",
      "%% @dl lifecycle propsed",
      "%% @dl entity store jsonll",
      "end",
      "subgraph e_rt_track[\"x\"]",
      "\u00A0",
      "\uD800",
      "\uFEFF",
      "\t",
      "\r",
    ];

    // 1. 5,000 text mutations
    for (let i = 0; i < 5000; i++) {
      const op = nextRand() % 5;
      let mutated: unknown;
      if (i < 10) {
        mutated = [null, undefined, 42, {}, [], true, "", "\uFEFF", "\uD800", "\uDC00"][i];
      } else if (op === 0) {
        const lines = [...baseLines];
        const idx = nextRand() % lines.length;
        lines[idx] = pick(trickyTokens);
        mutated = lines.join("\n");
      } else if (op === 1) {
        const lines = [...baseLines];
        const idx = nextRand() % lines.length;
        lines.splice(idx, 1);
        mutated = lines.join("\n");
      } else if (op === 2) {
        const lines = [...baseLines];
        const a = nextRand() % lines.length;
        const b = nextRand() % lines.length;
        const tmp = lines[a]!;
        lines[a] = lines[b]!;
        lines[b] = tmp;
        mutated = lines.join("\n");
      } else if (op === 3) {
        const lines = [...baseLines];
        const idx = nextRand() % lines.length;
        lines.splice(idx, 0, pick(trickyTokens));
        mutated = lines.join("\n");
      } else {
        const pos = nextRand() % baseText.length;
        mutated = `${baseText.slice(0, pos)}${pick(trickyTokens)}${baseText.slice(pos + 1)}`;
      }

      const pRes = parseArchiMermaid(mutated, { checkCanonical: (i & 1) === 1 });
      if (pRes.ok) {
        const fRes = formatArchiMermaid(mutated);
        expect(fRes.ok).toBe(true);
        const prRes = printArchiMermaid(pRes.value);
        expect(prRes.ok).toBe(true);
      } else {
        const d = pRes.diagnostics[0];
        expect(codeSet.has(d.code)).toBe(true);
        expect(validPointer(d.path)).toBe(true);
        expect(d.message).toMatch(/column \d+/);
      }
    }

    // 2. 5,000 JSON/triple mutations
    const badValues: readonly unknown[] = [
      null,
      undefined,
      0,
      -1,
      1.5,
      1e21,
      Number.MAX_SAFE_INTEGER + 1,
      NaN,
      Infinity,
      "",
      "constructor",
      "toString",
      "__proto__",
      "bad\nstr",
      "lone\uD800",
      [],
      {},
      { extra: 1 },
    ];

    for (let i = 0; i < 5000; i++) {
      if (i < badValues.length) {
        const r = printArchiMermaid(badValues[i]);
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.diagnostics[0].code).toBe("mermaid-strict-unrepresentable");
          expect(validPointer(r.diagnostics[0].path)).toBe(true);
        }
        continue;
      }
      const clone = structuredClone(JOINT_R2_TEINTES) as any;
      const target = nextRand() % 10;
      const val = pick(badValues);
      if (target === 0) clone.manifest.owningRepo = val;
      else if (target === 1) clone.manifest.language = val;
      else if (target === 2) clone.manifest.viewSchemaPin = val;
      else if (target === 3) clone.document.revision = val;
      else if (target === 4) clone.document.schemaVersion = val;
      else if (target === 5) clone.document.ports = val;
      else if (target === 6) clone.document.entities["entity:rt-track"].attributes.lifecycle = val;
      else if (target === 7) clone.document.relations["relation:da-track"].endpoints[0].target = val;
      else if (target === 8) clone.views[0].draw = [val];
      else clone.views[0].layout = val;

      const r = printArchiMermaid(clone);
      if (!r.ok) {
        const d = r.diagnostics[0];
        expect(d.code).toBe("mermaid-strict-unrepresentable");
        expect(validPointer(d.path)).toBe(true);
      }
    }
  });
});
