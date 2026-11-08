// Universal archi carrier (engram.archi-carrier/1, P-4) tests C-T1..C-T8
// (spec/SPEC_EVOL_ARCHI_CARDS.md « P-4 — the archi carrier (engram.archi-carrier/1) », §5.5, §5.6.6, §6.1, §6.2).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  ARCHI_CARRIER_DIAGNOSTIC_CODES,
  ARCHI_MERMAID_DIAGNOSTIC_CODES,
  checkArchiCarrier,
  decodeArchiCarrier,
  encodeArchiCarrier,
  formatArchiMermaid,
  parseArchiMermaid,
  printArchiMermaid,
  type ArchiCarrierDiagnostic,
  type ArchiCarrierDiagnosticCode,
  type ArchiMermaidDiagnosticCode,
  type ArchiSourceTriple,
} from "../src/archi-mermaid/index.js";
import * as archiMermaidModule from "../src/archi-mermaid/index.js";
import { ARCHI_CONTAINER_KINDS } from "../src/ontology-guardian/archi-cards.js";
import {
  ARCHI_DIAGNOSTIC_CODES,
  type ArchiDiagnosticCode,
} from "../src/ontology-guardian/archi-check.js";
import {
  ARCHI_MMD_PATH,
  assertValidArchiDiagnosticEnvelope,
} from "../src/ontology-guardian/archi-shapes.js";
import { validPointer } from "../src/ontology-guardian/diagnostics.js";

const testsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(testsDir, "..");
const fixturesRoot = join(testsDir, "fixtures", "archi");

function readFixtureMmd(name: string): string {
  return readFileSync(join(fixturesRoot, name, "architecture.mmd"), "utf8");
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Independent N1–N5 reference oracle from P-4 §1.4. */
function normalizeCarrierN1ToN5(raw: string): string {
  // N1: split on CRLF, CR, or LF
  const rawLines = raw.split(/\r\n|\r|\n/);
  // N2: strip trailing SP/TAB via linear scan
  const trimmed = rawLines.map((line) => {
    let end = line.length;
    while (end > 0 && (line[end - 1] === " " || line[end - 1] === "\t")) end--;
    return line.slice(0, end);
  });
  // N3: slice between first and last non-empty line
  const firstNonEmpty = trimmed.findIndex((l) => l.length > 0);
  if (firstNonEmpty === -1) return "";
  let lastNonEmpty = trimmed.length - 1;
  while (lastNonEmpty > firstNonEmpty && trimmed[lastNonEmpty] === "") lastNonEmpty--;
  const window = trimmed.slice(firstNonEmpty, lastNonEmpty + 1);
  // N4: longest common SP/TAB prefix across non-empty lines
  const nonEmpty = window.filter((l) => l.length > 0);
  const firstIndent = nonEmpty[0]!.match(/^[ \t]*/)?.[0] ?? "";
  let prefixLen = firstIndent.length;
  while (prefixLen > 0 && !nonEmpty.every((l) => l.startsWith(firstIndent.slice(0, prefixLen)))) {
    prefixLen--;
  }
  const dedented = prefixLen > 0 ? window.map((l) => (l.length > 0 ? l.slice(prefixLen) : "")) : window;
  // N5: join with LF and terminate with one LF
  return `${dedented.join("\n")}\n`;
}

function unwrapParseMmd(text: string): ArchiSourceTriple {
  const res = parseArchiMermaid(text, { checkCanonical: true });
  expect(res.ok, res.ok ? "" : res.diagnostics[0]?.message).toBe(true);
  if (!res.ok) throw new Error(res.diagnostics[0]?.message);
  return res.value;
}

const FX_JOINT_R2 = readFixtureMmd("joint-r2");
const FX_JOINT_R2_TEINTES = readFixtureMmd("joint-r2-teintes");
const FX_HOSTS_R3 = readFixtureMmd("hosts-r3");

function expectCarrierRefusal(
  res: ReturnType<typeof encodeArchiCarrier> | ReturnType<typeof decodeArchiCarrier> | ReturnType<typeof checkArchiCarrier>,
  expectedCode: ArchiMermaidDiagnosticCode | ArchiCarrierDiagnosticCode,
  expectedPath: string,
  expectedSubjectRef: string,
): ArchiCarrierDiagnostic {
  expect(res.ok, `expected refusal ${expectedCode} at ${expectedPath}`).toBe(false);
  if (res.ok) throw new Error("expected ok: false");
  expect(res.diagnostics).toHaveLength(1);
  const diag = res.diagnostics[0];
  assertValidArchiDiagnosticEnvelope(diag);
  expect(diag.origin).toBe("engram");
  expect(diag.severity).toBe("error");
  expect(diag.code).toBe(expectedCode);
  expect(diag.nativeCode).toBe(expectedCode);
  expect(diag.path).toBe(expectedPath);
  expect(diag.subjectRef).toBe(expectedSubjectRef);
  expect(validPointer(diag.path)).toBe(true);
  return diag;
}

describe("engram.archi-carrier/1 (P-4, Lot 6)", () => {
  it("C-T1: round-trips all 3 corpus fixtures × 7 views × 53 fold states (3 + C per view) plus the sys-a1 / sys-a-b UTF-16 vs EID byte order flip", () => {
    const corpus: readonly { readonly name: string; readonly text: string }[] = [
      { name: "joint-r2", text: FX_JOINT_R2 },
      { name: "joint-r2-teintes", text: FX_JOINT_R2_TEINTES },
      { name: "hosts-r3", text: FX_HOSTS_R3 },
    ];

    let viewCount = 0;
    let stateCount = 0;

    for (const { text } of corpus) {
      const triple = unwrapParseMmd(text);
      const expectedSha = sha256Hex(text);

      for (const spec of triple.views) {
        viewCount++;
        const viewLocal = spec.viewId.slice("view:".length);
        const drawnContainers = spec.draw
          .filter((entityId) => ARCHI_CONTAINER_KINDS.has(triple.document.entities[entityId]?.type ?? ""))
          .sort();
        const defaultCollapsed = [...spec.collapsed].sort();
        const defaultSet = new Set(defaultCollapsed);

        const foldStates: { readonly key: string; readonly collapsed: readonly string[] }[] = [
          { key: "default", collapsed: defaultCollapsed },
          { key: "expanded", collapsed: [] },
          { key: "collapsed", collapsed: drawnContainers },
          ...drawnContainers.map((c) => ({
            key: `toggle:${c}`,
            collapsed: defaultSet.has(c)
              ? defaultCollapsed.filter((x) => x !== c)
              : [...defaultCollapsed, c].sort(),
          })),
        ];

        for (const st of foldStates) {
          stateCount++;
          const enc = encodeArchiCarrier({
            text,
            view: viewLocal,
            collapsed: st.collapsed,
          });
          expect(enc.ok, enc.ok ? "" : enc.diagnostics[0]?.message).toBe(true);
          if (!enc.ok) continue;

          const headerLine = enc.value.split("\n")[0]!;
          if (st.collapsed.length === 0) {
            expect(headerLine.endsWith(" collapsed=-")).toBe(true);
          }

          const dec = decodeArchiCarrier(enc.value);
          expect(dec).toEqual({
            ok: true,
            value: {
              text,
              view: viewLocal,
              collapsed: st.collapsed,
              sha256: expectedSha,
            },
          });

          const chk = checkArchiCarrier(enc.value, text);
          expect(chk).toEqual(dec);
        }
      }
    }

    expect(viewCount).toBe(7);
    expect(stateCount).toBe(53);

    // Order-flip case: entity:sys-a-b vs entity:sys-a1
    // Model UTF-16 order: "entity:sys-a-b" < "entity:sys-a1" ('-' 0x2d < '1' 0x31)
    // Header EID order:   "e_sys_a1" < "e_sys_a_b" ('1' 0x31 < '_' 0x5f)
    expect("entity:sys-a-b" < "entity:sys-a1").toBe(true);
    expect("e_sys_a1" < "e_sys_a_b").toBe(true);

    const parsedBase = unwrapParseMmd(FX_JOINT_R2);
    const baseTriple: ArchiSourceTriple = {
      manifest: parsedBase.manifest,
      document: {
        ...parsedBase.document,
        entities: {
          ...parsedBase.document.entities,
          "entity:sys-a-b": {
            id: "entity:sys-a-b",
            profile: "archi@1",
            type: "system",
            attributes: {
              name: { kind: "text", value: "Système A-B" },
              role: { kind: "text", value: "Système témoin A-B" },
              lifecycle: { kind: "enum", value: "current" },
              evidence: { kind: "collection", items: [{ kind: "text", value: "P2:327" }] },
            },
          },
          "entity:sys-a1": {
            id: "entity:sys-a1",
            profile: "archi@1",
            type: "system",
            attributes: {
              name: { kind: "text", value: "Système A1" },
              role: { kind: "text", value: "Système témoin A1" },
              lifecycle: { kind: "enum", value: "current" },
              evidence: { kind: "collection", items: [{ kind: "text", value: "P2:327" }] },
            },
          },
        },
        relations: {
          ...parsedBase.document.relations,
          "relation:mi-sys-a-b": {
            id: "relation:mi-sys-a-b",
            profile: "archi@1",
            type: "managedIn",
            endpoints: [
              { role: "source", target: "entity:sys-a-b" },
              { role: "target", target: "entity:repo-h2a" },
            ],
            attributes: {
              lifecycle: { kind: "enum", value: "current" },
              evidence: { kind: "collection", items: [{ kind: "text", value: "P2:327" }] },
            },
          },
          "relation:mi-sys-a1": {
            id: "relation:mi-sys-a1",
            profile: "archi@1",
            type: "managedIn",
            endpoints: [
              { role: "source", target: "entity:sys-a1" },
              { role: "target", target: "entity:repo-h2a" },
            ],
            attributes: {
              lifecycle: { kind: "enum", value: "current" },
              evidence: { kind: "collection", items: [{ kind: "text", value: "P2:327" }] },
            },
          },
        },
      },
      views: parsedBase.views.map((v) =>
        v.viewId === "view:roles"
          ? {
              ...v,
              draw: [...v.draw, "entity:sys-a-b", "entity:sys-a1"].sort(),
              collapsed: [...v.collapsed, "entity:sys-a-b", "entity:sys-a1"].sort(),
            }
          : v,
      ),
    };

    const printedFlip = printArchiMermaid(baseTriple);
    expect(printedFlip.ok).toBe(true);
    if (!printedFlip.ok) return;
    const tFlip = printedFlip.value;

    const modelOrder = ["entity:sys-a-b", "entity:sys-a1"] as const;
    const encFlip = encodeArchiCarrier({
      text: tFlip,
      view: "roles",
      collapsed: modelOrder,
    });
    expect(encFlip.ok).toBe(true);
    if (!encFlip.ok) return;

    const flipHeader = encFlip.value.split("\n")[0]!;
    expect(flipHeader).toContain("collapsed=e_sys_a1,e_sys_a_b");

    const decFlip = decodeArchiCarrier(encFlip.value);
    expect(decFlip).toEqual({
      ok: true,
      value: {
        text: tFlip,
        view: "roles",
        collapsed: ["entity:sys-a-b", "entity:sys-a1"],
        sha256: sha256Hex(tFlip),
      },
    });
  });

  it("C-T2: enforces every refusal path, precedence order, RFC 6901 location, and default/custom subjectRef in encode, decode, and check", () => {
    const validEnc = encodeArchiCarrier({
      text: FX_JOINT_R2,
      view: "roles",
      collapsed: ["entity:pkg-h2a", "entity:sys-h2a"],
    });
    expect(validEnc.ok).toBe(true);
    if (!validEnc.ok) return;
    const validFrame = validEnc.value;
    const validSha = sha256Hex(FX_JOINT_R2);

    // 1. Non-canonical t: swap two attribute lines with different names in one block
    // (`role` and `lifecycle` of `e_svc_live` at FX-J 1-based lines 31-32, 0-based lines 30-31)
    const fxLines = FX_JOINT_R2.split("\n");
    expect(fxLines[30]).toBe('  %% @dl role "Tient le track record vivant"');
    expect(fxLines[31]).toBe("  %% @dl lifecycle proposed");
    const swappedLines = [...fxLines];
    swappedLines[30] = fxLines[31]!;
    swappedLines[31] = fxLines[30]!;
    const swappedText = swappedLines.join("\n");

    // In encode: step 3 returns codec diagnostic unshifted at "/30"
    expectCarrierRefusal(
      encodeArchiCarrier({ text: swappedText, view: "roles", collapsed: [] }),
      "mermaid-strict-noncanonical",
      "/30",
      ARCHI_MMD_PATH,
    );

    // In decode: step 3 shifts payload diagnostic path from "/30" to "/31"
    const swappedSha = sha256Hex(swappedText);
    const frameWithSwappedPayload = `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${swappedSha} view=roles collapsed=-\n${swappedText}`;
    expectCarrierRefusal(
      decodeArchiCarrier(frameWithSwappedPayload),
      "mermaid-strict-noncanonical",
      "/31",
      "archi-carrier",
    );

    // 2. U+FFFE and U+FFFF in encode (mermaid-strict-unrepresentable at "/text") and decode (mermaid-strict-invalid)
    for (const nonChar of ["\uFFFE", "\uFFFF"]) {
      const textWithNonChar = FX_JOINT_R2.replace("Mémoire gouvernée du track", `Mémoire ${nonChar} du track`);
      expectCarrierRefusal(
        encodeArchiCarrier({ text: textWithNonChar, view: "roles", collapsed: [] }),
        "mermaid-strict-unrepresentable",
        "/text",
        ARCHI_MMD_PATH,
      );
      expectCarrierRefusal(
        decodeArchiCarrier(`archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=roles collapsed=-\n${textWithNonChar}`),
        "mermaid-strict-invalid",
        "/26",
        "archi-carrier",
      );
      expectCarrierRefusal(
        decodeArchiCarrier(`archi-carrier${nonChar} 1 text=engram.archi-mermaid/1 sha256=${validSha} view=roles collapsed=-\n${FX_JOINT_R2}`),
        "mermaid-strict-invalid",
        "/0",
        "archi-carrier",
      );
    }

    // 3. encode step 1: non-object, unknown key order & RFC 6901 escaping, non-string text, invalid view, non-array collapsed
    for (const badInput of [null, undefined, "string", 42, true, []]) {
      expectCarrierRefusal(
        encodeArchiCarrier(badInput),
        "mermaid-strict-invalid",
        "",
        ARCHI_MMD_PATH,
      );
    }

    // Unknown key checked before field types, first in Object.keys order, RFC 6901 escaped
    expectCarrierRefusal(
      encodeArchiCarrier({
        text: 123,
        "a/b~c": 1,
        secondExtra: 2,
        view: "INVALID_VIEW",
        collapsed: "not-an-array",
      }),
      "mermaid-strict-invalid",
      "/a~1b~0c",
      ARCHI_MMD_PATH,
    );

    // Non-string text checked before view and collapsed
    expectCarrierRefusal(
      encodeArchiCarrier({
        text: 123,
        view: "INVALID_VIEW",
        collapsed: "not-an-array",
      }),
      "mermaid-strict-invalid",
      "/text",
      ARCHI_MMD_PATH,
    );

    // Invalid view checked before collapsed
    for (const badView of [123, "", "view:roles", "Roles", "a".repeat(41), "-roles"]) {
      expectCarrierRefusal(
        encodeArchiCarrier({
          text: FX_JOINT_R2,
          view: badView,
          collapsed: "not-an-array",
        }),
        "mermaid-strict-invalid",
        "/view",
        ARCHI_MMD_PATH,
      );
    }

    // Non-array collapsed
    for (const badCollapsed of [null, undefined, "entity:sys-h2a", {}, 123]) {
      expectCarrierRefusal(
        encodeArchiCarrier({
          text: FX_JOINT_R2,
          view: "roles",
          collapsed: badCollapsed,
        }),
        "mermaid-strict-invalid",
        "/collapsed",
        ARCHI_MMD_PATH,
      );
    }

    // 4. Unknown view -> mermaid-strict-orphan-ref
    expectCarrierRefusal(
      encodeArchiCarrier({
        text: FX_JOINT_R2,
        view: "nonexistent-view",
        collapsed: [],
      }),
      "mermaid-strict-orphan-ref",
      "/view",
      ARCHI_MMD_PATH,
    );
    expectCarrierRefusal(
      decodeArchiCarrier(
        `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=nonexistent-view collapsed=-\n${FX_JOINT_R2}`,
      ),
      "mermaid-strict-orphan-ref",
      "/0",
      "archi-carrier",
    );

    // 5. collapsed item rules (a) invalid -> (b) orphan/non-container/undrawn -> (c) duplicate -> (d) unsorted
    // (a) invalid entity ref in encode
    for (const badItem of [123, "", "sys-h2a", "e_sys_h2a", "entity:Sys_H2a", `entity:${"a".repeat(41)}`]) {
      expectCarrierRefusal(
        encodeArchiCarrier({
          text: FX_JOINT_R2,
          view: "roles",
          collapsed: ["entity:pkg-h2a", badItem as string],
        }),
        "mermaid-strict-invalid",
        "/collapsed/1",
        ARCHI_MMD_PATH,
      );
    }

    // (b) orphan entity, undrawn container (entity:host-cluster on view roles), drawn non-container (entity:rt-h2a, entity:svc-live), generic@2 legend container
    for (const orphanOrNonContainer of [
      "entity:ghost-system",
      "entity:host-cluster",
      "entity:rt-h2a",
      "entity:svc-live",
    ]) {
      expectCarrierRefusal(
        encodeArchiCarrier({
          text: FX_JOINT_R2,
          view: "roles",
          collapsed: [orphanOrNonContainer],
        }),
        "mermaid-strict-orphan-ref",
        "/collapsed/0",
        ARCHI_MMD_PATH,
      );
    }
    expectCarrierRefusal(
      encodeArchiCarrier({
        text: FX_JOINT_R2_TEINTES,
        view: "roles-teintes",
        collapsed: ["entity:legend-memoire"],
      }),
      "mermaid-strict-orphan-ref",
      "/collapsed/0",
      ARCHI_MMD_PATH,
    );

    // (c) duplicate before (d) noncanonical in encode:
    // [dup, dup]
    expectCarrierRefusal(
      encodeArchiCarrier({
        text: FX_JOINT_R2,
        view: "roles",
        collapsed: ["entity:sys-h2a", "entity:sys-h2a"],
      }),
      "mermaid-strict-duplicate",
      "/collapsed/1",
      ARCHI_MMD_PATH,
    );
    // ["entity:pkg-h2a", "entity:sys-h2a", "entity:pkg-h2a"] where index 2 fails BOTH (c) and (d) -> must emit -duplicate
    expectCarrierRefusal(
      encodeArchiCarrier({
        text: FX_JOINT_R2,
        view: "roles",
        collapsed: ["entity:pkg-h2a", "entity:sys-h2a", "entity:pkg-h2a"],
      }),
      "mermaid-strict-duplicate",
      "/collapsed/2",
      ARCHI_MMD_PATH,
    );

    // (d) unsorted in encode
    expectCarrierRefusal(
      encodeArchiCarrier({
        text: FX_JOINT_R2,
        view: "roles",
        collapsed: ["entity:sys-h2a", "entity:pkg-h2a"],
      }),
      "mermaid-strict-noncanonical",
      "/collapsed/1",
      ARCHI_MMD_PATH,
    );

    // Decode collapsed= checks at "/0": (b) -> (c) -> (d)
    for (const badEid of ["e_ghost_sys", "e_host_cluster", "e_rt_h2a", "e_svc_live"]) {
      expectCarrierRefusal(
        decodeArchiCarrier(
          `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=roles collapsed=${badEid}\n${FX_JOINT_R2}`,
        ),
        "mermaid-strict-orphan-ref",
        "/0",
        "archi-carrier",
      );
    }
    // [dup, dup] in decode
    expectCarrierRefusal(
      decodeArchiCarrier(
        `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=roles collapsed=e_sys_h2a,e_sys_h2a\n${FX_JOINT_R2}`,
      ),
      "mermaid-strict-duplicate",
      "/0",
      "archi-carrier",
    );
    // e_pkg_h2a,e_sys_h2a,e_pkg_h2a in decode -> index 2 fails both (c) and (d), emits -duplicate before -noncanonical
    expectCarrierRefusal(
      decodeArchiCarrier(
        `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=roles collapsed=e_pkg_h2a,e_sys_h2a,e_pkg_h2a\n${FX_JOINT_R2}`,
      ),
      "mermaid-strict-duplicate",
      "/0",
      "archi-carrier",
    );
    // Unsorted in decode
    expectCarrierRefusal(
      decodeArchiCarrier(
        `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=roles collapsed=e_sys_h2a,e_pkg_h2a\n${FX_JOINT_R2}`,
      ),
      "mermaid-strict-noncanonical",
      "/0",
      "archi-carrier",
    );

    const fffeText = FX_JOINT_R2.replace("Mémoire gouvernée du track", "Mémoire \uFFFE du track");
    // encode step 1 before step 2
    expectCarrierRefusal(encodeArchiCarrier({ text: fffeText, view: "Roles", collapsed: [] }), "mermaid-strict-invalid", "/view", ARCHI_MMD_PATH);
    // encode step 2 before step 3
    expectCarrierRefusal(encodeArchiCarrier({ text: swappedText.replace("Mémoire gouvernée du track", "Mémoire \uFFFE du track"), view: "roles", collapsed: [] }), "mermaid-strict-unrepresentable", "/text", ARCHI_MMD_PATH);
    // encode step 3 before step 4
    expectCarrierRefusal(encodeArchiCarrier({ text: swappedText, view: "nonexistent-view", collapsed: [] }), "mermaid-strict-noncanonical", "/30", ARCHI_MMD_PATH);
    // encode step 4 before step 5
    expectCarrierRefusal(encodeArchiCarrier({ text: FX_JOINT_R2, view: "nonexistent-view", collapsed: [123] }), "mermaid-strict-orphan-ref", "/view", ARCHI_MMD_PATH);
    // rule (b) before rule (d): index 1 is undrawn on roles AND sorts before index 0
    expectCarrierRefusal(encodeArchiCarrier({ text: FX_JOINT_R2, view: "roles", collapsed: ["entity:sys-h2a", "entity:host-cluster"] }), "mermaid-strict-orphan-ref", "/collapsed/1", ARCHI_MMD_PATH);
    expectCarrierRefusal(decodeArchiCarrier(`archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=roles collapsed=e_sys_h2a,e_host_cluster\n${FX_JOINT_R2}`), "mermaid-strict-orphan-ref", "/0", "archi-carrier");
    // decode step 4 before step 5
    expectCarrierRefusal(decodeArchiCarrier(`archi-carrier 1 text=engram.archi-mermaid/1 sha256=${"0".repeat(64)} view=nonexistent-view collapsed=-\n${FX_JOINT_R2}`), "carrier-digest-mismatch", "/0", "archi-carrier");

    // 6. Header token order precedence in decode (path: "/0")
    // Magic mismatch (even when version is 2)
    expectCarrierRefusal(
      decodeArchiCarrier(`wrong-magic 2 text=bad\n${FX_JOINT_R2}`),
      "mermaid-strict-invalid",
      "/0",
      "archi-carrier",
    );
    // Version INT != 1 refuses with mermaid-strict-unsupported whatever follows (missing tokens, bad text=, 7+ tokens)
    for (const badVerHeader of [
      "archi-carrier 2",
      "archi-carrier 0",
      "archi-carrier 99 text=unknown sha256=BAD view=BAD collapsed=BAD extra",
    ]) {
      expectCarrierRefusal(
        decodeArchiCarrier(`${badVerHeader}\n${FX_JOINT_R2}`),
        "mermaid-strict-unsupported",
        "/0",
        "archi-carrier",
      );
    }
    // Missing or non-INT version -> mermaid-strict-invalid
    for (const nonIntVerHeader of [
      "archi-carrier",
      "archi-carrier v1 text=engram.archi-mermaid/1",
      "archi-carrier 1.0 text=engram.archi-mermaid/1",
      "archi-carrier 01 text=engram.archi-mermaid/1",
      "archi-carrier -1 text=engram.archi-mermaid/1",
    ]) {
      expectCarrierRefusal(
        decodeArchiCarrier(`${nonIntVerHeader}\n${FX_JOINT_R2}`),
        "mermaid-strict-invalid",
        "/0",
        "archi-carrier",
      );
    }
    // text= unknown non-empty value -> mermaid-strict-annotation-unknown (even if sha256= is missing or bad)
    expectCarrierRefusal(
      decodeArchiCarrier(`archi-carrier 1 text=engram.archi-mermaid/2\n${FX_JOINT_R2}`),
      "mermaid-strict-annotation-unknown",
      "/0",
      "archi-carrier",
    );
    expectCarrierRefusal(
      decodeArchiCarrier(`archi-carrier 1 text=other-format sha256=INVALID\n${FX_JOINT_R2}`),
      "mermaid-strict-annotation-unknown",
      "/0",
      "archi-carrier",
    );
    // text= missing, wrong key, or empty value -> mermaid-strict-invalid
    for (const badTextTokenHeader of [
      "archi-carrier 1",
      "archi-carrier 1 text=",
      "archi-carrier 1 format=engram.archi-mermaid/1",
    ]) {
      expectCarrierRefusal(
        decodeArchiCarrier(`${badTextTokenHeader}\n${FX_JOINT_R2}`),
        "mermaid-strict-invalid",
        "/0",
        "archi-carrier",
      );
    }
    // sha256= missing, wrong key, empty, short, or uppercase hex -> mermaid-strict-invalid
    for (const badShaHeader of [
      "archi-carrier 1 text=engram.archi-mermaid/1",
      "archi-carrier 1 text=engram.archi-mermaid/1 sha256=",
      `archi-carrier 1 text=engram.archi-mermaid/1 digest=${validSha} view=roles collapsed=-`,
      "archi-carrier 1 text=engram.archi-mermaid/1 sha256=abcd view=roles collapsed=-",
      `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha.toUpperCase()} view=roles collapsed=-`,
    ]) {
      expectCarrierRefusal(
        decodeArchiCarrier(`${badShaHeader}\n${FX_JOINT_R2}`),
        "mermaid-strict-invalid",
        "/0",
        "archi-carrier",
      );
    }
    // view= missing, wrong key, empty, or not LOCAL -> mermaid-strict-invalid
    for (const badViewHeader of [
      `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha}`,
      `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view= collapsed=-`,
      `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} v=roles collapsed=-`,
      `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=Roles collapsed=-`,
      `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=view:roles collapsed=-`,
    ]) {
      expectCarrierRefusal(
        decodeArchiCarrier(`${badViewHeader}\n${FX_JOINT_R2}`),
        "mermaid-strict-invalid",
        "/0",
        "archi-carrier",
      );
    }
    // collapsed= missing, wrong key, empty, or not '-' / EID list -> mermaid-strict-invalid
    for (const badCollapsedHeader of [
      `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=roles`,
      `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=roles collapsed=`,
      `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=roles fold=-`,
      `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=roles collapsed=entity:sys-h2a`,
      `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=roles collapsed=e_sys_h2a,`,
      `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=roles collapsed=,e_sys_h2a`,
    ]) {
      expectCarrierRefusal(
        decodeArchiCarrier(`${badCollapsedHeader}\n${FX_JOINT_R2}`),
        "mermaid-strict-invalid",
        "/0",
        "archi-carrier",
      );
    }
    // Seventh token -> mermaid-strict-invalid
    expectCarrierRefusal(
      decodeArchiCarrier(
        `archi-carrier 1 text=engram.archi-mermaid/1 sha256=${validSha} view=roles collapsed=- seventh\n${FX_JOINT_R2}`,
      ),
      "mermaid-strict-invalid",
      "/0",
      "archi-carrier",
    );

    // 7. Default and custom subjectRef on encode, decode, and check
    expectCarrierRefusal(
      encodeArchiCarrier({
        get text(): string {
          throw new Error("unreadable");
        },
        view: "roles",
        collapsed: [],
      }),
      "mermaid-strict-invalid",
      "",
      ARCHI_MMD_PATH,
    );
    expectCarrierRefusal(
      encodeArchiCarrier(null, {
        get subjectRef(): string {
          throw new Error("unreadable subjectRef");
        },
      }),
      "mermaid-strict-invalid",
      "",
      ARCHI_MMD_PATH,
    );
    expectCarrierRefusal(decodeArchiCarrier("", { subjectRef: "" }), "mermaid-strict-invalid", "/0", "archi-carrier");
    expectCarrierRefusal(encodeArchiCarrier(null, { subjectRef: "" }), "mermaid-strict-invalid", "", ARCHI_MMD_PATH);
    expectCarrierRefusal(
      decodeArchiCarrier("", { subjectRef: 123 as unknown as string }),
      "mermaid-strict-invalid",
      "/0",
      "archi-carrier",
    );
    expectCarrierRefusal(
      encodeArchiCarrier(null, { subjectRef: 123 as unknown as string }),
      "mermaid-strict-invalid",
      "",
      ARCHI_MMD_PATH,
    );
    expectCarrierRefusal(
      encodeArchiCarrier(null, { subjectRef: "custom/source.mmd" }),
      "mermaid-strict-invalid",
      "",
      "custom/source.mmd",
    );
    expectCarrierRefusal(
      decodeArchiCarrier("", { subjectRef: "exports/roles.svg" }),
      "mermaid-strict-invalid",
      "/0",
      "exports/roles.svg",
    );
    expectCarrierRefusal(
      checkArchiCarrier("", FX_JOINT_R2, { subjectRef: "exports/roles.svg" }),
      "mermaid-strict-invalid",
      "/0",
      "exports/roles.svg",
    );
    // In checkArchiCarrier, findings on committedText always carry subjectRef: DEFAULT_SUBJECT_REF (ARCHI_MMD_PATH)
    expectCarrierRefusal(
      checkArchiCarrier(validFrame, swappedText, { subjectRef: "exports/roles.svg" }),
      "mermaid-strict-noncanonical",
      "/30",
      ARCHI_MMD_PATH,
    );
    expectCarrierRefusal(
      checkArchiCarrier(validFrame, 123, { subjectRef: "exports/roles.svg" }),
      "mermaid-strict-invalid",
      "/0",
      ARCHI_MMD_PATH,
    );
  });

  it("C-T3: refuses header sha256 tamper or payload label edit with carrier-digest-mismatch at /0", () => {
    const enc = encodeArchiCarrier({
      text: FX_JOINT_R2,
      view: "roles",
      collapsed: [],
    });
    expect(enc.ok).toBe(true);
    if (!enc.ok) return;
    const frame = enc.value;
    const sha = sha256Hex(FX_JOINT_R2);

    // 1. Flip a hex digit in sha256=
    const flippedDigit = sha[0] === "0" ? "1" : "0";
    const flippedSha = `${flippedDigit}${sha.slice(1)}`;
    const frameBadSha = frame.replace(`sha256=${sha}`, `sha256=${flippedSha}`);
    expectCarrierRefusal(
      decodeArchiCarrier(frameBadSha),
      "carrier-digest-mismatch",
      "/0",
      "archi-carrier",
    );
    expectCarrierRefusal(
      checkArchiCarrier(frameBadSha, FX_JOINT_R2, { subjectRef: "exports/roles.svg" }),
      "carrier-digest-mismatch",
      "/0",
      "exports/roles.svg",
    );

    // 2. Edit a label in the payload (canonical payload, unchanged header sha256=)
    const editedPayloadFrame = frame.replace('subgraph e_sys_h2a["h2a"]', 'subgraph e_sys_h2a["h2a-edited"]');
    expectCarrierRefusal(
      decodeArchiCarrier(editedPayloadFrame),
      "carrier-digest-mismatch",
      "/0",
      "archi-carrier",
    );
  });

  it("C-T4: refuses a valid frame checked against a newer committed text (revision 0 -> 1) with export-stale at /0", () => {
    const enc = encodeArchiCarrier({
      text: FX_JOINT_R2,
      view: "roles",
      collapsed: ["entity:pkg-h2a"],
    });
    expect(enc.ok).toBe(true);
    if (!enc.ok) return;

    const newerText = FX_JOINT_R2.replace("%% @dl revision 0", "%% @dl revision 1");
    expect(formatArchiMermaid(newerText, { check: true }).ok).toBe(true);

    expectCarrierRefusal(
      checkArchiCarrier(enc.value, newerText),
      "export-stale",
      "/0",
      "archi-carrier",
    );
    expectCarrierRefusal(
      checkArchiCarrier(enc.value, newerText, { subjectRef: "exports/roles.drawio" }),
      "export-stale",
      "/0",
      "exports/roles.drawio",
    );
  });

  it("C-T5: survives N1–N5 slot whitespace perturbations across SVG/ArchiMate, draw.io, and PlantUML, and refuses destructive re-wraps", () => {
    const collapsed = ["entity:pkg-h2a", "entity:sys-h2a"];
    const enc = encodeArchiCarrier({
      text: FX_JOINT_R2,
      view: "roles",
      collapsed,
    });
    expect(enc.ok).toBe(true);
    if (!enc.ok) return;
    const canonicalFrame = enc.value;
    const expectedDecoded = {
      text: FX_JOINT_R2,
      view: "roles",
      collapsed,
      sha256: sha256Hex(FX_JOINT_R2),
    };

    const rawFrameLines = canonicalFrame.slice(0, -1).split("\n");

    // (a) Positive fixtures:
    // 1. Text slot (SVG <metadata>, ArchiMate property): CRLF, two outer blank lines,
    //    uniform 4-space prefix, uniform TAB prefix, trailing spaces, and missing final LF
    const svgFourSpaceCrlfNoFinalLf = [
      "",
      "   ",
      ...rawFrameLines.map((l) => (l.length > 0 ? `    ${l}   ` : "  ")),
      "",
      "  \t ",
    ].join("\r\n");

    const archiMateTabPrefixNoFinalLf = [
      "\t",
      "",
      ...rawFrameLines.map((l) => (l.length > 0 ? `\t${l}\t  ` : "")),
    ].join("\r\n");

    // 2. Attribute slot (draw.io, .drawio.png) after XML unescaping of &#xa; and &#xd;&#xa;
    const xmlEscapedLf = canonicalFrame.replace(/\n/g, "&#xa;");
    const unescapedDrawioLf = xmlEscapedLf.replace(/&#xa;/g, "\n");

    const xmlEscapedCrlf = canonicalFrame.replace(/\n/g, "&#xd;&#xa;");
    const unescapedDrawioCrlf = xmlEscapedCrlf.replace(/&#xd;&#xa;/g, "\r\n");

    // 3. PlantUML after P-3 strips the `' ` prefix (and `'` on empty lines), with CRLF
    const plantUmlLines = rawFrameLines.map((l) => (l.length > 0 ? `' ${l}` : "'"));
    const plantUmlAfterP3Strip = plantUmlLines
      .map((l) => (l.startsWith("' ") ? l.slice(2) : l === "'" ? "" : l))
      .join("\r\n");

    for (const posFrame of [
      svgFourSpaceCrlfNoFinalLf,
      archiMateTabPrefixNoFinalLf,
      unescapedDrawioLf,
      unescapedDrawioCrlf,
      plantUmlAfterP3Strip,
    ]) {
      const dec = decodeArchiCarrier(posFrame);
      expect(dec).toEqual({ ok: true, value: expectedDecoded });
      const chk = checkArchiCarrier(posFrame, FX_JOINT_R2);
      expect(chk).toEqual({ ok: true, value: expectedDecoded });
    }

    // (b) Negative fixtures refusing with mermaid-strict-invalid at expected path:
    // 1. Frame with LF folded to SP -> "/0"
    const lfFoldedToSp = canonicalFrame.replace(/\n/g, " ");
    expectCarrierRefusal(
      decodeArchiCarrier(lfFoldedToSp),
      "mermaid-strict-invalid",
      "/0",
      "archi-carrier",
    );

    // 2. Frame wrapped inside an ASTRING at payload line i -> "/<i+1>"
    // FX-J line index 30 (0-based) is `  %% @dl role "Tient le track record vivant"`; in frame it is line 31
    const payloadLines = FX_JOINT_R2.split("\n");
    const roleLineIdx = payloadLines.findIndex((l) => l.includes('"Tient le track record vivant"'));
    expect(roleLineIdx).toBe(30);
    const wrappedPayloadLines = [...payloadLines];
    wrappedPayloadLines[roleLineIdx] = '  %% @dl role "Tient le track\nrecord vivant"';
    const wrappedFrame = `${rawFrameLines[0]!}\n${wrappedPayloadLines.join("\n")}`;
    expectCarrierRefusal(
      decodeArchiCarrier(wrappedFrame),
      "mermaid-strict-invalid",
      `/${roleLineIdx + 1}`,
      "archi-carrier",
    );

    // 3. Frame still carrying `' ` prefixes -> "/0"
    const unstrippedPlantUml = `${plantUmlLines.join("\n")}\n`;
    expectCarrierRefusal(
      decodeArchiCarrier(unstrippedPlantUml),
      "mermaid-strict-invalid",
      "/0",
      "archi-carrier",
    );
  });

  it("C-T6: matches node:crypto SHA-256 across 131 consecutive UTF-8 lengths (all mod-64 residues twice) and 2/3/4-byte UTF-8 block boundaries while keeping sha256Utf8Hex module-private", () => {
    expect("sha256Utf8Hex" in archiMermaidModule).toBe(false);

    const targetLine = '%% @dl role "Mémoire gouvernée du track"';
    expect(FX_JOINT_R2.split("\n")[25]).toBe(targetLine);

    const seenResidues = new Map<number, number>();

    // k = 1 .. 131 ASCII 'a's
    for (let k = 1; k <= 131; k++) {
      const tk = FX_JOINT_R2.replace(targetLine, `%% @dl role "${"a".repeat(k)}"`);
      const byteLen = Buffer.byteLength(tk, "utf8");
      const residue = byteLen % 64;
      seenResidues.set(residue, (seenResidues.get(residue) ?? 0) + 1);

      const fmt = formatArchiMermaid(tk, { check: true });
      expect(fmt.ok).toBe(true);
      if (fmt.ok) {
        expect(fmt.value).toBe(tk);
      }

      const expectedHex = sha256Hex(tk);
      const enc = encodeArchiCarrier({ text: tk, view: "roles", collapsed: [] });
      expect(enc.ok).toBe(true);
      if (!enc.ok) continue;

      const headerSha = enc.value.split("\n")[0]!.split(" ")[3]!;
      expect(headerSha).toBe(`sha256=${expectedHex}`);

      const dec = decodeArchiCarrier(enc.value);
      expect(dec.ok).toBe(true);
      if (dec.ok) {
        expect(dec.value.sha256).toBe(expectedHex);
      }
    }

    // Every length residue mod 64 (0..63) occurred at least twice
    expect(seenResidues.size).toBe(64);
    for (let r = 0; r < 64; r++) {
      expect(seenResidues.get(r)!).toBeGreaterThanOrEqual(2);
    }

    // Multi-byte UTF-8 variants (2-byte U+00E9 'é', 3-byte U+20AC '€', 4-byte U+1F680 '🚀'),
    // including a 4-byte character straddling a 64-byte block boundary
    const prefixBeforeRoleValue = FX_JOINT_R2.indexOf(targetLine) + '%% @dl role "'.length;
    const prefixByteLen = Buffer.byteLength(FX_JOINT_R2.slice(0, prefixBeforeRoleValue), "utf8");
    // Pad with ASCII 'x' so the next character starts at byte offset 62 mod 64, straddling the 64-byte block boundary
    const padTo62 = (62 - (prefixByteLen % 64) + 64) % 64;

    const multiByteRoles = [
      "é".repeat(17),
      "€".repeat(19),
      "🚀".repeat(15),
      `${"x".repeat(padTo62)}🚀é€${"y".repeat(31)}`,
      `${"x".repeat((63 - (prefixByteLen % 64) + 64) % 64)}🚀€é`,
    ];

    for (const roleVal of multiByteRoles) {
      const tMb = FX_JOINT_R2.replace(targetLine, `%% @dl role "${roleVal}"`);
      expect(formatArchiMermaid(tMb, { check: true })).toEqual({ ok: true, value: tMb });

      const expectedHex = sha256Hex(tMb);
      const enc = encodeArchiCarrier({ text: tMb, view: "roles", collapsed: [] });
      expect(enc.ok).toBe(true);
      if (!enc.ok) continue;

      expect(enc.value.split("\n")[0]!.split(" ")[3]).toBe(`sha256=${expectedHex}`);
      const dec = decodeArchiCarrier(enc.value);
      expect(dec.ok).toBe(true);
      if (dec.ok) {
        expect(dec.value.sha256).toBe(expectedHex);
      }
    }
  });

  it("C-T7: totality under 5,000 seeded mutations (never throws, closed envelope, encode(decode(f)) === N(f))", () => {
    const baseEnc = encodeArchiCarrier({
      text: FX_JOINT_R2_TEINTES,
      view: "roles-teintes",
      collapsed: ["entity:pkg-h2a", "entity:sys-h2a"],
    });
    expect(baseEnc.ok).toBe(true);
    if (!baseEnc.ok) return;
    const baseFrame = baseEnc.value;
    const baseLines = baseFrame.split("\n");

    const allowedCodes = new Set<string>([
      ...ARCHI_MERMAID_DIAGNOSTIC_CODES,
      ...ARCHI_CARRIER_DIAGNOSTIC_CODES,
    ]);

    let seed = 0x5eedc0de;
    const nextRand = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };
    const pick = <T>(arr: readonly T[]): T => arr[nextRand() % arr.length]!;

    const tokens: readonly string[] = [
      "",
      " ",
      "\t",
      "\r",
      "\r\n",
      "\n",
      "\uFEFF",
      "\uD800",
      "\uDC00",
      "\uFFFE",
      "\uFFFF",
      "\x00",
      "\x1f",
      "\x7f",
      "archi-carrier 2 text=engram.archi-mermaid/1",
      "archi-carrier 1 text=other",
      "archi-carrier 1 text=engram.archi-mermaid/1 sha256=0000",
      "' archi-carrier 1",
      "%% @dl bogus",
    ];

    let acceptedCount = 0;

    for (let i = 0; i < 5000; i++) {
      let mutated: unknown;
      if (i < 13) {
        mutated = [
          null,
          undefined,
          42,
          true,
          {},
          [],
          "",
          "   \r\n\t  ",
          baseFrame,
          `\r\n  ${baseFrame.replace(/\n/g, "\r\n  ")}  \r\n`,
          `\t${baseFrame.slice(0, -1).replace(/\n/g, "\n\t")}`,
          "\uFEFF" + baseFrame,
          `${baseFrame.slice(0, -1)}${" ".repeat(100_000)}x\n`,
        ][i];
      } else {
        const mode = nextRand() % 6;
        if (mode === 0) {
          // Mutate header token
          const hParts = baseLines[0]!.split(" ");
          const tIdx = nextRand() % hParts.length;
          hParts[tIdx] = pick(tokens);
          mutated = [hParts.join(" "), ...baseLines.slice(1)].join("\n");
        } else if (mode === 1) {
          // Inject whitespace perturbation (valid N1-N5) around valid frame
          const pad = pick(["  ", "\t", "    "]);
          const eol = pick(["\n", "\r\n", "\r"]);
          mutated = `${eol}${baseFrame
            .slice(0, -1)
            .split("\n")
            .map((l) => (l.length > 0 ? `${pad}${l} ` : ""))
            .join(eol)}${pick(["", eol, eol + eol])}`;
        } else if (mode === 2) {
          // Delete a line
          const lines = [...baseLines];
          lines.splice(nextRand() % lines.length, 1);
          mutated = lines.join("\n");
        } else if (mode === 3) {
          // Swap two lines
          const lines = [...baseLines];
          const a = nextRand() % lines.length;
          const b = nextRand() % lines.length;
          const tmp = lines[a]!;
          lines[a] = lines[b]!;
          lines[b] = tmp;
          mutated = lines.join("\n");
        } else if (mode === 4) {
          // Insert a token at a random character position
          const pos = nextRand() % baseFrame.length;
          mutated = `${baseFrame.slice(0, pos)}${pick(tokens)}${baseFrame.slice(pos)}`;
        } else {
          // Delete a random slice
          const pos = nextRand() % baseFrame.length;
          const len = (nextRand() % 8) + 1;
          mutated = `${baseFrame.slice(0, pos)}${baseFrame.slice(pos + len)}`;
        }
      }

      const dec = decodeArchiCarrier(mutated);
      if (dec.ok) {
        acceptedCount++;
        expect(dec.value).toEqual({
          text: FX_JOINT_R2_TEINTES,
          view: "roles-teintes",
          collapsed: ["entity:pkg-h2a", "entity:sys-h2a"],
          sha256: sha256Hex(FX_JOINT_R2_TEINTES),
        });
        const reEncoded = encodeArchiCarrier({
          text: dec.value.text,
          view: dec.value.view,
          collapsed: dec.value.collapsed,
        });
        expect(reEncoded).toEqual({
          ok: true,
          value: normalizeCarrierN1ToN5(mutated as string),
        });
      } else {
        expect(dec.diagnostics).toHaveLength(1);
        const d = dec.diagnostics[0];
        assertValidArchiDiagnosticEnvelope(d);
        expect(allowedCodes.has(d.code)).toBe(true);
      }

      const chk = checkArchiCarrier(mutated, FX_JOINT_R2_TEINTES);
      if (!chk.ok) {
        expect(chk.diagnostics).toHaveLength(1);
        const cd = chk.diagnostics[0];
        assertValidArchiDiagnosticEnvelope(cd);
        expect(allowedCodes.has(cd.code)).toBe(true);
      }
    }

    expect(acceptedCount).toBeGreaterThan(0);
  });

  it("C-T8: enforces zero runtime dependency in src/archi-mermaid/index.ts and guards ARCHI_CARRIER_DIAGNOSTIC_CODES value & type alignment", () => {
    const source = readFileSync(join(rootDir, "src", "archi-mermaid", "index.ts"), "utf8");

    const sf = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
    let importDeclCount = 0;
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st)) {
        importDeclCount++;
        expect(st.importClause?.isTypeOnly, st.getText(sf)).toBe(true);
      }
      if (ts.isExportDeclaration(st) && st.moduleSpecifier) {
        expect(st.isTypeOnly, st.getText(sf)).toBe(true);
      }
      expect(ts.isImportEqualsDeclaration(st), st.getText(sf)).toBe(false);
    }
    expect(importDeclCount).toBeGreaterThan(0);

    // Scan the raw source; any `require(` or `import(` text fails, comments and strings included
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(/\bimport\s*\(/);

    // Value check
    expect(Object.isFrozen(ARCHI_CARRIER_DIAGNOSTIC_CODES)).toBe(true);
    expect(ARCHI_CARRIER_DIAGNOSTIC_CODES).toEqual(["carrier-digest-mismatch", "export-stale"]);
    expect(
      ARCHI_DIAGNOSTIC_CODES.filter((c) => c === "carrier-digest-mismatch" || c === "export-stale"),
    ).toEqual([...ARCHI_CARRIER_DIAGNOSTIC_CODES]);
    const revIdx = ARCHI_DIAGNOSTIC_CODES.indexOf("archi-revision-conflict");
    expect(ARCHI_DIAGNOSTIC_CODES.slice(revIdx + 1)).toEqual([...ARCHI_CARRIER_DIAGNOSTIC_CODES]);

    // Type check
    expectTypeOf<ArchiCarrierDiagnosticCode>().toEqualTypeOf<
      Extract<ArchiDiagnosticCode, "carrier-digest-mismatch" | "export-stale">
    >();
  });
});
