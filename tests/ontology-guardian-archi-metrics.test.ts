// #711 KIT font metrics and §3.9 slot allocation parity tests
// (spec/SPEC_EVOL_ARCHI_CARDS.md §3.9, §6.1, §6.3; EV:1, :106-112, :196-198).
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { NativeSemanticDocument } from "../src/ontology-guardian/diagram-native-types.js";
import { CONTRACT_PIN } from "../src/ontology-guardian/diagram-registry.js";
import {
  ARCHI_CARDS_ALLOCATION,
  ARCHI_CARDS_CONTENT,
  ARCHI_LINE_RULE,
} from "../src/ontology-guardian/archi-cards-data.js";
import {
  projectArchiCards,
  type ArchiProjectionBinding,
} from "../src/ontology-guardian/archi-cards.js";
import {
  buildArchiSourceView,
  type ArchiViewSpec,
} from "../src/ontology-guardian/archi-view.js";
import {
  ARCHI_FONT_METRICS,
  ARCHI_FONT_METRICS_SHA256,
  layoutArchiLines,
  measureArchiKicker,
  measureArchiText,
} from "../src/ontology-guardian/archi-metrics.js";

const testsDir = dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = "/home/antoinefa/src/airbus-genair-hrpolnav/docs/ard/decision/focus/governance-kit";
const KIT_METRICS_PATH = join(KIT_ROOT, "src/governance-font-metrics.js");
const kitAvailable = (): boolean => existsSync(KIT_METRICS_PATH);
const kitSkipReason = (): string => (kitAvailable() ? "" : ` (skipped: KIT clone absent at ${KIT_ROOT})`);

const readDoc = (rel: string): NativeSemanticDocument =>
  JSON.parse(readFileSync(join(testsDir, "fixtures", "archi", rel), "utf8")) as NativeSemanticDocument;
const readViewSpec = (rel: string): ArchiViewSpec =>
  JSON.parse(readFileSync(join(testsDir, "fixtures", "archi", rel), "utf8")) as ArchiViewSpec;

const FIX_DOC = readDoc("joint-r2/document.json");
const ROLES_SPEC = readViewSpec("joint-r2/view-specs/roles.json");
const ROLES_REPLIE_SPEC = readViewSpec("joint-r2/view-specs/roles-replie.json");
const DEPLOIEMENT_SPEC = readViewSpec("joint-r2/view-specs/deploiement.json");
const H2A_REPO_SPEC = readViewSpec("joint-r2/view-specs/h2a-repo.json");

const r1 = (x: number): number => Math.round(x * 10) / 10;

function bindingFor(spec: ArchiViewSpec): ArchiProjectionBinding {
  return {
    activeHierarchy: spec.activeHierarchy,
    language: "fr",
    contractPin: CONTRACT_PIN,
  };
}

describe("archi-cards@1 #711 measurement and allocation rules (tier E, §3.9, §6.3)", () => {
  it("reproduces EV:106 slot maxima across the 4 ported views and the clamped §3.9 allocation table (EV:106-107)", () => {
    expect(ARCHI_CARDS_ALLOCATION).toEqual({
      card: {
        kicker: [358, 1],
        title: [358, 1],
        body: [428, 1],
        detail: [428, 1],
        footer: [428, 1],
      },
      folded: {
        kicker: [290, 1],
        title: [290, 1],
        subtitle: [396, 2],
        footer: [428, 1],
      },
      expanded: {
        kicker: [314, 1],
        title: [314, 2],
        subtitle: [434, 2],
        footer: [434, 1],
      },
    });
    expect(ARCHI_LINE_RULE.unknownGlyphWidth).toBe(0.7);
    expect(ARCHI_LINE_RULE.baselinePadPx).toBe(2);

    const maxes: Record<string, { px: number; of: number; lines: number; o: string }> = {};
    for (const spec of [ROLES_SPEC, ROLES_REPLIE_SPEC, DEPLOIEMENT_SPEC, H2A_REPO_SPEC]) {
      const source = buildArchiSourceView(FIX_DOC, spec);
      const res = projectArchiCards(FIX_DOC, source, bindingFor(spec), ARCHI_CARDS_CONTENT);
      expect(res.outcome).toBe("ok");
      if (res.outcome !== "ok") return;
      for (const [o, ms] of Object.entries(res.measures)) {
        for (const [k, L] of Object.entries(ms)) {
          const w = Math.max(...L.widths);
          const name = o.replace("occurrence:o-", "");
          if ((maxes[k]?.px ?? -1) < w) {
            maxes[k] = { px: r1(w), of: L.available, lines: L.lines.length, o: name };
          }
        }
      }
    }

    // EV:106 maxima with §3.9 clamped denominators (428 where EV prints 430 or 434)
    expect(maxes).toEqual({
      "card.kicker": { px: 202.4, of: 358, lines: 1, o: "st-events" },
      "card.title": { px: 292.9, of: 358, lines: 1, o: "svc-live" },
      "card.body": { px: 368.7, of: 428, lines: 1, o: "rt-guard" },
      "card.detail": { px: 344.7, of: 428, lines: 1, o: "art-branch" },
      "card.footer": { px: 367.3, of: 428, lines: 1, o: "svc-live" },
      "folded.kicker": { px: 182.3, of: 290, lines: 1, o: "pkg-plugin" },
      "folded.title": { px: 277.2, of: 290, lines: 1, o: "pkg-track" },
      "folded.subtitle": { px: 313.1, of: 396, lines: 1, o: "pkg-track" },
      "folded.footer": { px: 367.3, of: 428, lines: 1, o: "host-cluster" },
      "expanded.kicker": { px: 182.3, of: 314, lines: 1, o: "pkg-plugin" },
      "expanded.title": { px: 277.2, of: 314, lines: 1, o: "pkg-track" },
      "expanded.subtitle": { px: 313.1, of: 434, lines: 1, o: "pkg-track" },
      "expanded.footer": { px: 367.3, of: 434, lines: 1, o: "host-cluster" },
    });
  });

  it("reproduces width, kickerWidth and greedy space-only line layout on F5, closed kickers, RJ4, N23 and N24 (EV:109-112, :196-198)", () => {
    expect(r1(measureArchiKicker("Composant · Module · ABCDEFG", "fr"))).toBe(363.8);
    expect(r1(measureArchiKicker("Service · API · ABCDEFGHIJKL", "fr"))).toBe(322.4);
    expect(r1(measureArchiText("COMPOSANT · MODULE · ABCDEFG", 22, "body"))).toBe(339.1);

    // RJ4 (EV:196)
    const rj4 = layoutArchiLines(
      "Charge @sentropic/architecture-governance-multiagent-coordination",
      "subtitle",
      396,
      2,
    );
    expect(rj4.lines).toEqual(["Charge", "@sentropic/architecture-governance-multiagent-coordination"]);
    expect(rj4.widths.map(r1)).toEqual([75.3, 634.6]);
    expect(rj4.overflow).toBe(true);
    expect(rj4.wide).toEqual([1]);

    // N23 (EV:197)
    const n23 = layoutArchiLines(
      "Écrit @sentropic/architecture-governance-multiagent-coordination",
      "body",
      428,
      1,
    );
    expect(n23.lines).toEqual(["Écrit", "@sentropic/architecture-governance-multiagent-coordination"]);
    expect(n23.widths.map(r1)).toEqual([48, 634.6]);
    expect(n23.overflow).toBe(true);

    // N24 (EV:198)
    const n24 = layoutArchiLines(
      "Mémoire gouvernée du track : demandes, étapes et historique",
      "subtitle",
      396,
      2,
    );
    expect(n24.lines).toEqual(["Mémoire gouvernée du track :", "demandes, étapes et historique"]);
    expect(n24.widths.map(r1)).toEqual([315, 337]);
    expect(n24.overflow).toBe(false);
  });
});

describe.skipIf(!kitAvailable())(`#711 KIT source parity (§6.3, EV:1)${kitSkipReason()}`, () => {
  it("matches SHA-256 5f868f9e… and deep-equals cardFontMetrics from KIT src/governance-font-metrics.js (EV:1)", () => {
    const raw = readFileSync(KIT_METRICS_PATH, "utf8");
    const sha = createHash("sha256").update(raw).digest("hex");
    expect(sha).toBe(ARCHI_FONT_METRICS_SHA256);
    expect(ARCHI_CARDS_CONTENT.metrics.sha256).toBe(ARCHI_FONT_METRICS_SHA256);

    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as unknown;
    expect(ARCHI_FONT_METRICS).toEqual(parsed);
    expect(ARCHI_CARDS_CONTENT.metrics.table).toEqual(parsed);
  });

  it("derives the §3.9 allocation table from KIT FOLD_TITLE=290, 66 px reserve, frame-178=314, DS innerWidthOf(460)=428 and settles the 356/358 card title width (§3.9, §6.3)", () => {
    const renderJs = readFileSync(join(KIT_ROOT, "hrpn/render.js"), "utf8");
    const tintsCss = readFileSync(join(KIT_ROOT, "hrpn/tints.css"), "utf8");
    const archLayoutJs = readFileSync(join(KIT_ROOT, "src/architecture-layout.js"), "utf8");
    const cardJs = readFileSync(join(KIT_ROOT, "src/hrpolnav-card.js"), "utf8");

    // 1. FOLD_TITLE = 290 and card title 358 px in hrpn/render.js:34-36,44
    expect(renderJs).toContain("the card title width (358 px)");
    expect(renderJs).toContain("export const FOLD_TITLE = 290;");
    expect(renderJs).toContain("460 - 64"); // 396 px folded subtitle width

    // 2. 66 px toggle reserve and the 356 - 66 comment in hrpn/tints.css:26-27
    expect(tintsCss).toContain("FOLD_TITLE = 356 − 66 px");
    expect(tintsCss).toContain("padding-right: 66px;");

    // 3. Card CSS box geometry in src/hrpolnav-card.js:28-29,44,49-50 settling 358 px:
    //    460px card - (8px border-left + 2px border-right) - (2 * 8px padding) = 434px inner box;
    //    header: 434px - 70px icon svg - 6px gap = 358px (while 356 - 66 = 290 in tints.css:26).
    expect(cardJs).toContain("width:460px");
    expect(cardJs).toContain("padding: 8px");
    expect(cardJs).toContain("border: 2px solid");
    expect(cardJs).toContain("border-left: 8px solid");
    expect(cardJs).toContain("gap: 6px");
    expect(cardJs).toContain("flex: 0 0 70px");
    const cardInnerWidth = 460 - (8 + 2) - 2 * 8;
    expect(cardInnerWidth).toBe(434);
    const cardTitleWidth = cardInnerWidth - 70 - 6;
    expect(cardTitleWidth).toBe(358);
    expect(ARCHI_CARDS_ALLOCATION.card.kicker[0]).toBe(cardTitleWidth);
    expect(ARCHI_CARDS_ALLOCATION.card.title[0]).toBe(cardTitleWidth);
    expect(ARCHI_CARDS_ALLOCATION.folded.title[0]).toBe(290);
    expect(356 - 66).toBe(290);

    // 4. Expanded smallest frame 492 - 178 = 314 and Math.min(width, CARD_WIDTH) - 26 = 434 in src/architecture-layout.js:70-71,80
    expect(archLayoutJs).toContain("width - 178");
    expect(archLayoutJs).toContain("Math.min(width, CARD_WIDTH) - 26");
    expect(492 - 178).toBe(314);
    expect(460 - 26).toBe(434);
    expect(ARCHI_CARDS_ALLOCATION.expanded.kicker).toEqual([314, 1]);
    expect(ARCHI_CARDS_ALLOCATION.expanded.title).toEqual([314, 2]);
    expect(ARCHI_CARDS_ALLOCATION.expanded.subtitle).toEqual([434, 2]);
    expect(ARCHI_CARDS_ALLOCATION.expanded.footer).toEqual([434, 1]);

    // 5. DS innerWidthOf(460) = 460 - 2 * 16 = 428 clamp on card body/detail/footer and folded footer
    const dsInnerWidth = 460 - 2 * 16;
    expect(dsInnerWidth).toBe(428);
    expect(ARCHI_CARDS_ALLOCATION.card.body).toEqual([428, 1]);
    expect(ARCHI_CARDS_ALLOCATION.card.detail).toEqual([428, 1]);
    expect(ARCHI_CARDS_ALLOCATION.card.footer).toEqual([428, 1]);
    expect(ARCHI_CARDS_ALLOCATION.folded.footer).toEqual([428, 1]);
  });
});
