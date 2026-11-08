// Pinned #711 card font metrics and line-measurement helpers for archi-cards@1
// (spec/SPEC_EVOL_ARCHI_CARDS.md §3.1, §3.9, §6.3; KIT src/governance-font-metrics.js).
import type { ArchiLanguage } from "./archi-check.js";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/** proposed: metric bucket names in the pinned #711 font metrics table (§3.9). */
export type ArchiMetricBucketName =
  | "title"
  | "body"
  | "footer"
  | "influenceTitle"
  | "influenceBody"
  | "influenceDetail";

/** proposed: single font metric bucket entry (§3.9, §6.3). */
export interface ArchiFontMetricBucket {
  readonly family: string;
  readonly weight: string;
  readonly widths: Readonly<Record<string, number>>;
}

/** proposed: complete #711 font metrics table (§3.1, §3.9, §6.3). */
export type ArchiFontMetricsTable = Readonly<Record<ArchiMetricBucketName, ArchiFontMetricBucket>>;

/** proposed: SHA-256 of KIT src/governance-font-metrics.js (EV:1, §3.1, §6.3). */
export const ARCHI_FONT_METRICS_SHA256 =
  "5f868f9e72bc64c4cbd9494540a4cf82c0adb5071474acdde481f6d3c58a0414" as const;

/** proposed: browser-measured advances at 1 px from KIT src/governance-font-metrics.js (§3.1, §3.9, §6.3). */
export const ARCHI_FONT_METRICS: ArchiFontMetricsTable = deepFreeze({
  title: {
    family: "\"Dossier Inter\", Inter, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    weight: "700",
    widths: {"0":0.67,"1":0.43,"2":0.63,"3":0.65,"4":0.68,"5":0.62,"6":0.65,"7":0.58,"8":0.65,"9":0.65,"\n":0.24," ":0.24,"\"":0.55,"#":0.65,"%":1.02,"&":0.67,"'":0.34,"(":0.38,")":0.38,"*":0.56,"+":0.68,",":0.33,"-":0.47,".":0.33,"/":0.39,":":0.33,";":0.34,"<":0.68,"=":0.68,">":0.68,"@":1.02,"A":0.75,"B":0.66,"C":0.74,"D":0.72,"E":0.61,"F":0.59,"G":0.75,"H":0.75,"I":0.28,"J":0.58,"K":0.72,"L":0.57,"M":0.93,"N":0.76,"O":0.77,"P":0.65,"Q":0.78,"R":0.66,"S":0.65,"T":0.67,"U":0.73,"V":0.75,"W":1.04,"X":0.74,"Y":0.73,"Z":0.66,"[":0.38,"\\":0.39,"]":0.38,"_":0.48,"a":0.58,"b":0.63,"c":0.59,"d":0.63,"e":0.6,"f":0.4,"g":0.63,"h":0.62,"i":0.27,"j":0.27,"k":0.58,"l":0.27,"m":0.91,"n":0.62,"o":0.61,"p":0.63,"q":0.63,"r":0.41,"s":0.56,"t":0.37,"u":0.62,"v":0.6,"w":0.85,"x":0.58,"y":0.6,"z":0.57,"{":0.47,"}":0.47,"§":0.57,"«":0.66,"·":0.33,"»":0.66,"À":0.75,"Ç":0.74,"È":0.61,"É":0.61,"×":0.68,"à":0.58,"â":0.58,"ç":0.59,"è":0.6,"é":0.6,"ê":0.6,"î":0.27,"ô":0.61,"ù":0.62,"–":0.5,"’":0.31,"…":1,"→":1,"↔":1,"≠":0.83203,"≥":0.83203},
  },
  body: {
    family: "Inter, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    weight: "400",
    widths: {"0":0.59961,"1":0.59961,"2":0.59961,"3":0.59961,"4":0.59961,"5":0.59961,"6":0.59961,"7":0.59961,"8":0.59961,"9":0.59961,"\n":0.2998," ":0.2998,"\"":0.45996,"#":0.59961,"%":0.69922,"&":0.67969,"'":0.2998,"(":0.2998,")":0.2998,"*":0.59961,"+":0.59961,",":0.2998,"-":0.2998,".":0.2998,"/":0.51953,":":0.2998,";":0.2998,"<":0.59961,"=":0.59961,">":0.59961,"@":0.7998,"A":0.55957,"B":0.61914,"C":0.61914,"D":0.65918,"E":0.55957,"F":0.47949,"G":0.65918,"H":0.65918,"I":0.25977,"J":0.39941,"K":0.61914,"L":0.5,"M":0.81934,"N":0.65918,"O":0.65918,"P":0.55957,"Q":0.65918,"R":0.61914,"S":0.61914,"T":0.5,"U":0.63965,"V":0.55957,"W":0.81934,"X":0.53906,"Y":0.55957,"Z":0.53906,"[":0.2998,"\\":0.51953,"]":0.2998,"_":0.5,"a":0.53906,"b":0.53906,"c":0.47949,"d":0.53906,"e":0.53906,"f":0.2998,"g":0.5,"h":0.53906,"i":0.23926,"j":0.21973,"k":0.5,"l":0.23926,"m":0.81934,"n":0.53906,"o":0.53906,"p":0.53906,"q":0.53906,"r":0.31934,"s":0.51953,"t":0.31934,"u":0.53906,"v":0.43945,"w":0.65918,"x":0.43945,"y":0.41992,"z":0.41992,"{":0.2998,"}":0.2998,"§":0.59961,"«":0.39941,"·":0.23926,"»":0.39941,"À":0.55957,"Ç":0.61914,"È":0.55957,"É":0.55957,"×":0.59961,"à":0.53906,"â":0.53906,"ç":0.47949,"è":0.53906,"é":0.53906,"ê":0.53906,"î":0.23926,"ô":0.53906,"ù":0.53906,"–":0.55566,"’":0.22168,"…":1,"→":1,"↔":1,"≠":0.83203,"≥":0.83203},
  },
  footer: {
    family: "\"Dossier Inter\", Inter, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    weight: "700",
    widths: {"0":0.67,"1":0.43,"2":0.63,"3":0.65,"4":0.68,"5":0.62,"6":0.65,"7":0.58,"8":0.65,"9":0.65,"\n":0.24," ":0.24,"\"":0.55,"#":0.65,"%":1.02,"&":0.67,"'":0.34,"(":0.38,")":0.38,"*":0.56,"+":0.68,",":0.33,"-":0.47,".":0.33,"/":0.39,":":0.33,";":0.34,"<":0.68,"=":0.68,">":0.68,"@":1.02,"A":0.75,"B":0.66,"C":0.74,"D":0.72,"E":0.61,"F":0.59,"G":0.75,"H":0.75,"I":0.28,"J":0.58,"K":0.72,"L":0.57,"M":0.93,"N":0.76,"O":0.77,"P":0.65,"Q":0.78,"R":0.66,"S":0.65,"T":0.67,"U":0.73,"V":0.75,"W":1.04,"X":0.74,"Y":0.73,"Z":0.66,"[":0.38,"\\":0.39,"]":0.38,"_":0.48,"a":0.58,"b":0.63,"c":0.59,"d":0.63,"e":0.6,"f":0.4,"g":0.63,"h":0.62,"i":0.27,"j":0.27,"k":0.58,"l":0.27,"m":0.91,"n":0.62,"o":0.61,"p":0.63,"q":0.63,"r":0.41,"s":0.56,"t":0.37,"u":0.62,"v":0.6,"w":0.85,"x":0.58,"y":0.6,"z":0.57,"{":0.47,"}":0.47,"§":0.57,"«":0.66,"·":0.33,"»":0.66,"À":0.75,"Ç":0.74,"È":0.61,"É":0.61,"×":0.68,"à":0.58,"â":0.58,"ç":0.59,"è":0.6,"é":0.6,"ê":0.6,"î":0.27,"ô":0.61,"ù":0.62,"–":0.5,"’":0.31,"…":1,"→":1,"↔":1,"≠":0.83203,"≥":0.83203},
  },
  influenceTitle: {
    family: "Inter, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    weight: "700",
    widths: {"0":0.59961,"1":0.59961,"2":0.59961,"3":0.59961,"4":0.59961,"5":0.59961,"6":0.59961,"7":0.59961,"8":0.59961,"9":0.59961,"\n":0.2998," ":0.2998,"\"":0.45996,"#":0.59961,"%":0.69922,"&":0.67969,"'":0.2998,"(":0.2998,")":0.2998,"*":0.59961,"+":0.59961,",":0.2998,"-":0.2998,".":0.2998,"/":0.51953,":":0.2998,";":0.2998,"<":0.59961,"=":0.59961,">":0.59961,"@":0.7998,"A":0.55957,"B":0.61914,"C":0.61914,"D":0.65918,"E":0.55957,"F":0.47949,"G":0.65918,"H":0.65918,"I":0.25977,"J":0.39941,"K":0.61914,"L":0.5,"M":0.81934,"N":0.65918,"O":0.65918,"P":0.55957,"Q":0.65918,"R":0.61914,"S":0.61914,"T":0.5,"U":0.63965,"V":0.55957,"W":0.81934,"X":0.53906,"Y":0.55957,"Z":0.53906,"[":0.2998,"\\":0.51953,"]":0.2998,"_":0.5,"a":0.53906,"b":0.53906,"c":0.47949,"d":0.53906,"e":0.53906,"f":0.2998,"g":0.5,"h":0.53906,"i":0.23926,"j":0.21973,"k":0.5,"l":0.23926,"m":0.81934,"n":0.53906,"o":0.53906,"p":0.53906,"q":0.53906,"r":0.31934,"s":0.51953,"t":0.31934,"u":0.53906,"v":0.43945,"w":0.65918,"x":0.43945,"y":0.41992,"z":0.41992,"{":0.2998,"}":0.2998,"§":0.59961,"«":0.39941,"·":0.23926,"»":0.39941,"À":0.55957,"Ç":0.61914,"È":0.55957,"É":0.55957,"×":0.59961,"à":0.53906,"â":0.53906,"ç":0.47949,"è":0.53906,"é":0.53906,"ê":0.53906,"î":0.23926,"ô":0.53906,"ù":0.53906,"–":0.55566,"’":0.22168,"…":1,"→":1,"↔":1,"≠":0.83203,"≥":0.83203},
  },
  influenceBody: {
    family: "Inter, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    weight: "650",
    widths: {"0":0.59961,"1":0.59961,"2":0.59961,"3":0.59961,"4":0.59961,"5":0.59961,"6":0.59961,"7":0.59961,"8":0.59961,"9":0.59961,"\n":0.2998," ":0.2998,"\"":0.45996,"#":0.59961,"%":0.69922,"&":0.67969,"'":0.2998,"(":0.2998,")":0.2998,"*":0.59961,"+":0.59961,",":0.2998,"-":0.2998,".":0.2998,"/":0.51953,":":0.2998,";":0.2998,"<":0.59961,"=":0.59961,">":0.59961,"@":0.7998,"A":0.55957,"B":0.61914,"C":0.61914,"D":0.65918,"E":0.55957,"F":0.47949,"G":0.65918,"H":0.65918,"I":0.25977,"J":0.39941,"K":0.61914,"L":0.5,"M":0.81934,"N":0.65918,"O":0.65918,"P":0.55957,"Q":0.65918,"R":0.61914,"S":0.61914,"T":0.5,"U":0.63965,"V":0.55957,"W":0.81934,"X":0.53906,"Y":0.55957,"Z":0.53906,"[":0.2998,"\\":0.51953,"]":0.2998,"_":0.5,"a":0.53906,"b":0.53906,"c":0.47949,"d":0.53906,"e":0.53906,"f":0.2998,"g":0.5,"h":0.53906,"i":0.23926,"j":0.21973,"k":0.5,"l":0.23926,"m":0.81934,"n":0.53906,"o":0.53906,"p":0.53906,"q":0.53906,"r":0.31934,"s":0.51953,"t":0.31934,"u":0.53906,"v":0.43945,"w":0.65918,"x":0.43945,"y":0.41992,"z":0.41992,"{":0.2998,"}":0.2998,"§":0.59961,"«":0.39941,"·":0.23926,"»":0.39941,"À":0.55957,"Ç":0.61914,"È":0.55957,"É":0.55957,"×":0.59961,"à":0.53906,"â":0.53906,"ç":0.47949,"è":0.53906,"é":0.53906,"ê":0.53906,"î":0.23926,"ô":0.53906,"ù":0.53906,"–":0.55566,"’":0.22168,"…":1,"→":1,"↔":1,"≠":0.83203,"≥":0.83203},
  },
  influenceDetail: {
    family: "Inter, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    weight: "400",
    widths: {"0":0.59961,"1":0.59961,"2":0.59961,"3":0.59961,"4":0.59961,"5":0.59961,"6":0.59961,"7":0.59961,"8":0.59961,"9":0.59961,"\n":0.2998," ":0.2998,"\"":0.45996,"#":0.59961,"%":0.69922,"&":0.67969,"'":0.2998,"(":0.2998,")":0.2998,"*":0.59961,"+":0.59961,",":0.2998,"-":0.2998,".":0.2998,"/":0.51953,":":0.2998,";":0.2998,"<":0.59961,"=":0.59961,">":0.59961,"@":0.7998,"A":0.55957,"B":0.61914,"C":0.61914,"D":0.65918,"E":0.55957,"F":0.47949,"G":0.65918,"H":0.65918,"I":0.25977,"J":0.39941,"K":0.61914,"L":0.5,"M":0.81934,"N":0.65918,"O":0.65918,"P":0.55957,"Q":0.65918,"R":0.61914,"S":0.61914,"T":0.5,"U":0.63965,"V":0.55957,"W":0.81934,"X":0.53906,"Y":0.55957,"Z":0.53906,"[":0.2998,"\\":0.51953,"]":0.2998,"_":0.5,"a":0.53906,"b":0.53906,"c":0.47949,"d":0.53906,"e":0.53906,"f":0.2998,"g":0.5,"h":0.53906,"i":0.23926,"j":0.21973,"k":0.5,"l":0.23926,"m":0.81934,"n":0.53906,"o":0.53906,"p":0.53906,"q":0.53906,"r":0.31934,"s":0.51953,"t":0.31934,"u":0.53906,"v":0.43945,"w":0.65918,"x":0.43945,"y":0.41992,"z":0.41992,"{":0.2998,"}":0.2998,"§":0.59961,"«":0.39941,"·":0.23926,"»":0.39941,"À":0.55957,"Ç":0.61914,"È":0.55957,"É":0.55957,"×":0.59961,"à":0.53906,"â":0.53906,"ç":0.47949,"è":0.53906,"é":0.53906,"ê":0.53906,"î":0.23926,"ô":0.53906,"ù":0.53906,"–":0.55566,"’":0.22168,"…":1,"→":1,"↔":1,"≠":0.83203,"≥":0.83203},
  },
});

/** proposed: slot names measured by archi-cards@1 (§3.9). */
export type ArchiMeasuredSlotName = "kicker" | "title" | "body" | "detail" | "subtitle" | "footer";

/** proposed: laid-out and measured lines of one slot in one state (§3.9). */
export interface ArchiSlotMeasurement {
  readonly lines: readonly string[];
  readonly widths: readonly number[];
  readonly available: number;
  readonly allocated: number;
  readonly overflow: boolean;
  readonly wide: readonly number[];
}

/** proposed: KIT width(s) = Σ widths[metric][c] × size + 2, unknown glyph 0.7 (§3.9; PROTO:158). */
export function measureArchiText(
  text: string,
  size: number,
  metric: ArchiMetricBucketName,
  table: ArchiFontMetricsTable = ARCHI_FONT_METRICS,
): number {
  const bucket = table[metric];
  return [...String(text ?? "")].reduce((sum, ch) => sum + (bucket.widths[ch] ?? 0.7) * size, 0) + 2;
}

/** proposed: KIT kicker width — uppercased in language, 22 px body metric + 0.04 em per glyph (§3.9; PROTO:159). */
export function measureArchiKicker(
  text: string,
  language: ArchiLanguage = "fr",
  table: ArchiFontMetricsTable = ARCHI_FONT_METRICS,
): number {
  const upper = String(text ?? "").toLocaleUpperCase(language);
  return measureArchiText(upper, 22, "body", table) + [...upper].length * 0.04 * 22;
}

/** proposed: DS greedy space-only line layout + KIT line width measurement (§3.9; PROTO:172-183). */
export function layoutArchiLines(
  text: string,
  slot: ArchiMeasuredSlotName,
  available: number,
  allocated: number,
  language: ArchiLanguage = "fr",
  table: ArchiFontMetricsTable = ARCHI_FONT_METRICS,
): ArchiSlotMeasurement {
  const measure = (s: string): number => {
    if (slot === "kicker") return measureArchiKicker(s, language, table);
    if (slot === "title") return measureArchiText(s, 32, "title", table);
    if (slot === "footer") return measureArchiText(s, 24, "title", table);
    return measureArchiText(s, 24, "body", table);
  };
  const lines: string[] = [];
  for (const word of String(text ?? "").split(" ").filter(Boolean)) {
    const prev = lines.at(-1);
    const cand = prev !== undefined ? `${prev} ${word}` : word;
    if (prev !== undefined && measure(prev) <= available && measure(cand) <= available) {
      lines[lines.length - 1] = cand;
    } else {
      lines.push(word);
    }
  }
  const widths = lines.map(measure);
  const wide = widths.map((x, i) => (x > available ? i : -1)).filter((i) => i >= 0);
  return {
    lines,
    widths,
    available,
    allocated,
    overflow: lines.length > allocated || wide.length > 0,
    wide,
  };
}
