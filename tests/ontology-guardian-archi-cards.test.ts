// archi-cards@1 slot projection, status marks, detail fitting, footer derivation and measurement tests
// (spec/SPEC_EVOL_ARCHI_CARDS.md §2.7, §3.2–§3.10, §6.1–§6.2; EV:22-39, :57-74, :83-90, :99-112, :125, :129, :140-146, :164-185, :193-198).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validPointer } from "../src/ontology-guardian/diagnostics.js";
import type { NativeSemanticDocument } from "../src/ontology-guardian/diagram-native-types.js";
import { CONTRACT_PIN } from "../src/ontology-guardian/diagram-registry.js";
import { checkArchi } from "../src/ontology-guardian/archi-check.js";
import {
  ARCHI_CARDS_ALLOCATION,
  ARCHI_CARDS_CONTENT,
  ARCHI_CARDS_LABELS,
} from "../src/ontology-guardian/archi-cards-data.js";
import {
  projectArchiCards,
  type ArchiOccurrenceMeasures,
  type ArchiProjectionBinding,
} from "../src/ontology-guardian/archi-cards.js";
import {
  archiOccurrenceRef,
  buildArchiSourceView,
  type ArchiViewSpec,
} from "../src/ontology-guardian/archi-view.js";
import {
  layoutArchiLines,
  measureArchiKicker,
  measureArchiText,
} from "../src/ontology-guardian/archi-metrics.js";

const testsDir = dirname(fileURLToPath(import.meta.url));
const readDoc = (rel: string): NativeSemanticDocument =>
  JSON.parse(readFileSync(join(testsDir, "fixtures", "archi", rel), "utf8")) as NativeSemanticDocument;
const readViewSpec = (rel: string): ArchiViewSpec =>
  JSON.parse(readFileSync(join(testsDir, "fixtures", "archi", rel), "utf8")) as ArchiViewSpec;

const FIX_DOC = readDoc("joint-r2/document.json");
const TINT_DOC = readDoc("joint-r2-teintes/document.json");
const HO_DOC = readDoc("hosts-r3/document.json");

const ROLES_SPEC = readViewSpec("joint-r2/view-specs/roles.json");
const ROLES_REPLIE_SPEC = readViewSpec("joint-r2/view-specs/roles-replie.json");
const DEPLOIEMENT_SPEC = readViewSpec("joint-r2/view-specs/deploiement.json");
const H2A_REPO_SPEC = readViewSpec("joint-r2/view-specs/h2a-repo.json");
const ROLES_TEINTES_SPEC = readViewSpec("joint-r2-teintes/view-specs/roles-teintes.json");
const ROLES_HOSTS_SPEC = readViewSpec("hosts-r3/view-specs/roles-hosts.json");
const DEPLOIEMENT_HOSTS_SPEC = readViewSpec("hosts-r3/view-specs/deploiement-hosts.json");

const r1 = (x: number): number => Math.round(x * 10) / 10;
const clone = <T>(x: T): T => structuredClone(x);
const T = (value: string) => ({ kind: "text" as const, value });
const N = (value: string) => ({ kind: "enum" as const, value });

function bindingFor(spec: ArchiViewSpec): ArchiProjectionBinding {
  return {
    activeHierarchy: spec.activeHierarchy,
    language: "fr",
    contractPin: CONTRACT_PIN,
    ...(spec.legend ? { legendRef: spec.legend.legendRef } : {}),
  };
}

function compactMeasures(ms: ArchiOccurrenceMeasures): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ms).map(([k, L]) => [
      k,
      `${L.widths.map(r1).join("+")}/${L.available}${L.allocated > 1 ? `x${L.allocated}` : ""}`,
    ]),
  );
}

// EV:22-39 & EV:57-74 expected faces and clamped §3.9 measures (428 where EV prints 430 or 434).
const EXPECTED_ROLES_FACES: Readonly<
  Record<
    string,
    {
      readonly form: string;
      readonly icon?: string;
      readonly text: Record<string, string>;
      readonly measures?: Record<string, string>;
      readonly categoryRef?: string;
    }
  >
> = {
  "api-h2a": {
    form: "card",
    icon: "link",
    text: { kicker: "API · MCP", footer: "repo: h2a", body: "Outils de coordination h2a_*", detail: "fourni par: CLI h2a" },
    measures: { "card.kicker": "102.7/358", "card.title": "142.5/358", "card.body": "305.4/428", "card.detail": "197.1/428", "card.footer": "113.6/428" },
  },
  "api-memory": {
    form: "card",
    icon: "link",
    text: { kicker: "API · MCP", footer: "repo: engram", body: "Six outils mémoire, contrat figé", detail: "fourni par: engram live (cible)" },
    measures: { "card.kicker": "102.7/358", "card.title": "239.1/358", "card.body": "329.4/428", "card.detail": "307.3/428", "card.footer": "159.7/428" },
  },
  "api-track": {
    form: "card",
    icon: "link",
    text: { kicker: "API · MCP", footer: "repo: h2a", body: "15 lectures, aucune écriture", detail: "fourni par: CLI h2a · track-mcp" },
    measures: { "card.kicker": "102.7/358", "card.title": "215.4/358", "card.body": "298.7/428", "card.detail": "320.3/428", "card.footer": "113.6/428" },
  },
  "art-branch": {
    form: "card",
    icon: "window",
    text: { kicker: "Artefact · Skill", footer: "repo: h2a · @sentropic/track", body: "Guide la fusion et la clôture", detail: "chargé par: Claude Code · Codex" },
    measures: { "card.kicker": "186.2/358", "card.title": "261.5/358", "card.body": "291.9/428", "card.detail": "344.7/428", "card.footer": "339.4/428" },
  },
  "art-track-op": {
    form: "card",
    icon: "window",
    text: { kicker: "Artefact · Skill", footer: "repo: h2a · @sentropic/track", body: "Choisit lecture MCP ou CLI", detail: "chargé par: Claude Code · Codex" },
    measures: { "card.kicker": "186.2/358", "card.title": "248.4/358", "card.body": "281.4/428", "card.detail": "344.7/428", "card.footer": "339.4/428" },
  },
  "cmp-control": {
    form: "card",
    icon: "link",
    text: { kicker: "Composant", title: "Contrôle Track", footer: "repo: h2a · @sentropic/track", body: "Valide ou refuse l'écriture", detail: "exécuté par: CLI track" },
    measures: { "card.kicker": "134.3/358", "card.title": "235.6/358", "card.body": "271.3/428", "card.detail": "230.7/428", "card.footer": "339.4/428" },
  },
  "pkg-h2a": {
    form: "container",
    icon: "link",
    text: { kicker: "Paquet · Lib", footer: "repo: h2a", subtitle: "Code JS de h2a et bin h2a" },
    measures: { "folded.kicker": "137.9/290", "folded.title": "254.8/290", "folded.subtitle": "281.9/396x2", "folded.footer": "113.6/428", "expanded.kicker": "137.9/314", "expanded.title": "254.8/314x2", "expanded.subtitle": "281.9/434x2", "expanded.footer": "113.6/434" },
  },
  "pkg-plugin": {
    form: "container",
    icon: "link",
    text: { kicker: "Paquet · Plugin", title: "Plugin h2a", footer: "repo: h2a", subtitle: "Branche h2a dans les CLI" },
    measures: { "folded.kicker": "182.3/290", "folded.title": "166.2/290", "folded.subtitle": "272.4/396x2", "folded.footer": "113.6/428", "expanded.kicker": "182.3/314", "expanded.title": "166.2/314x2", "expanded.subtitle": "272.4/434x2", "expanded.footer": "113.6/434" },
  },
  "pkg-track": {
    form: "container",
    icon: "link",
    text: { kicker: "Paquet · Lib", footer: "repo: h2a", subtitle: "Code JS du suivi et bins track" },
    measures: { "folded.kicker": "137.9/290", "folded.title": "277.2/290", "folded.subtitle": "313.1/396x2", "folded.footer": "113.6/428", "expanded.kicker": "137.9/314", "expanded.title": "277.2/314x2", "expanded.subtitle": "313.1/434x2", "expanded.footer": "113.6/434" },
  },
  "rt-claude": {
    form: "card",
    icon: "server",
    text: { kicker: "Exécution · CLI", footer: "propriétaire: Anthropic", body: "Session de l'agent", detail: "sur: Poste de travail" },
    measures: { "card.kicker": "173.9/358", "card.title": "202.3/358", "card.body": "198/428", "card.detail": "212.4/428", "card.footer": "271.5/428" },
  },
  "rt-codex": {
    form: "card",
    icon: "server",
    text: { kicker: "Exécution · CLI", footer: "propriétaire: OpenAI", body: "Session de l'agent", detail: "sur: Poste de travail" },
    measures: { "card.kicker": "173.9/358", "card.title": "103.1/358", "card.body": "198/428", "card.detail": "212.4/428", "card.footer": "242.2/428" },
  },
  "rt-h2a": {
    form: "card",
    icon: "server",
    text: { kicker: "Exécution · CLI", title: "CLI h2a", footer: "repo: h2a · @sentropic/h2a", body: "Sert le MCP et les hooks", detail: "sur: Poste de travail" },
    measures: { "card.kicker": "173.9/358", "card.title": "119.1/358", "card.body": "262.8/428", "card.detail": "212.4/428", "card.footer": "322.6/428" },
  },
  "rt-track": {
    form: "card",
    icon: "server",
    text: { kicker: "Exécution · CLI", title: "CLI track", footer: "repo: h2a · @sentropic/track", body: "Valide puis écrit le suivi", detail: "sur: Poste de travail" },
    measures: { "card.kicker": "173.9/358", "card.title": "141.5/358", "card.body": "250.2/428", "card.detail": "212.4/428", "card.footer": "339.4/428" },
  },
  "st-events": {
    form: "card",
    icon: "db",
    text: { kicker: "Stockage · JSONL", title: "events.jsonl", footer: "écrit par: CLI track", body: "Journal du suivi, ajout seul", detail: "lu par: CLI h2a · track-mcp" },
    measures: { "card.kicker": "202.4/358", "card.title": "194.3/358", "card.body": "281.9/428", "card.detail": "279.6/428", "card.footer": "218.7/428" },
  },
  "svc-live": {
    form: "card",
    icon: "server",
    text: { kicker: "Service", title: "engram live (cible)", footer: "opéré par: cluster-mesh (cible)", body: "Tient le track record vivant", detail: "sur: Cluster (cible)" },
    measures: { "card.kicker": "91.7/358", "card.title": "292.9/358", "card.body": "278.5/428", "card.detail": "194.2/428", "card.footer": "367.3/428" },
  },
  "sys-engram": {
    form: "container",
    icon: "window",
    text: { kicker: "Système", footer: "repo: engram", subtitle: "Mémoire gouvernée du track" },
    measures: { "folded.kicker": "101.4/290", "folded.title": "122/290", "folded.subtitle": "300.6/396x2", "folded.footer": "159.7/428", "expanded.kicker": "101.4/314", "expanded.title": "122/314x2", "expanded.subtitle": "300.6/434x2", "expanded.footer": "159.7/434" },
  },
  "sys-h2a": {
    form: "container",
    icon: "window",
    text: { kicker: "Système", footer: "repo: h2a", subtitle: "Relie les agents des CLI" },
    measures: { "folded.kicker": "101.4/290", "folded.title": "60.6/290", "folded.subtitle": "256.5/396x2", "folded.footer": "113.6/428", "expanded.kicker": "101.4/314", "expanded.title": "60.6/314x2", "expanded.subtitle": "256.5/434x2", "expanded.footer": "113.6/434" },
  },
  "sys-track": {
    form: "container",
    icon: "window",
    text: { kicker: "Système", footer: "repo: h2a", subtitle: "Contrôle chaque écriture" },
    measures: { "folded.kicker": "101.4/290", "folded.title": "92.6/290", "folded.subtitle": "259.3/396x2", "folded.footer": "113.6/428", "expanded.kicker": "101.4/314", "expanded.title": "92.6/314x2", "expanded.subtitle": "259.3/434x2", "expanded.footer": "113.6/434" },
  },
};

// EV:83-90 expected faces for view:deploiement
const EXPECTED_DEPLOIEMENT_FACES: Readonly<Record<string, (typeof EXPECTED_ROLES_FACES)[string]>> = {
  "host-cluster": {
    form: "container",
    icon: "cloud",
    text: { kicker: "Hôte · Cluster", title: "Cluster (cible)", footer: "opéré par: cluster-mesh (cible)", subtitle: "Fait tourner engram live" },
    measures: { "folded.kicker": "175.2/290", "folded.title": "223.8/290", "folded.subtitle": "249.3/396x2", "folded.footer": "367.3/428", "expanded.kicker": "175.2/314", "expanded.title": "223.8/314x2", "expanded.subtitle": "249.3/434x2", "expanded.footer": "367.3/434" },
  },
  "host-poste": {
    form: "container",
    icon: "cloud",
    text: { kicker: "Hôte · Poste", footer: "opéré par: rhanka", subtitle: "Poste de l'owner" },
    measures: { "folded.kicker": "148/290", "folded.title": "244.6/290", "folded.subtitle": "176.9/396x2", "folded.footer": "210.1/428", "expanded.kicker": "148/314", "expanded.title": "244.6/314x2", "expanded.subtitle": "176.9/434x2", "expanded.footer": "210.1/434" },
  },
  "rt-claude": EXPECTED_ROLES_FACES["rt-claude"]!,
  "rt-codex": EXPECTED_ROLES_FACES["rt-codex"]!,
  "rt-guard": {
    form: "card",
    icon: "server",
    text: { kicker: "Exécution · Hook", title: "Garde Bash", footer: "repo: h2a · Plugin h2a", body: "Bloque la CLI h2a lancée à la main", detail: "sur: Poste de travail" },
    measures: { "card.kicker": "201.6/358", "card.title": "182.2/358", "card.body": "368.7/428", "card.detail": "212.4/428", "card.footer": "256.2/428" },
  },
  "rt-h2a": EXPECTED_ROLES_FACES["rt-h2a"]!,
  "rt-track": EXPECTED_ROLES_FACES["rt-track"]!,
  "svc-live": EXPECTED_ROLES_FACES["svc-live"]!,
};

// EV:99-105 expected faces for view:h2a-repo
const EXPECTED_H2A_REPO_FACES: Readonly<Record<string, (typeof EXPECTED_ROLES_FACES)[string]>> = {
  "api-track": EXPECTED_ROLES_FACES["api-track"]!,
  "cmp-control": EXPECTED_ROLES_FACES["cmp-control"]!,
  "pkg-track": EXPECTED_ROLES_FACES["pkg-track"]!,
  "repo-h2a": {
    form: "container",
    icon: "link",
    text: { kicker: "Repo", footer: "propriétaire: rhanka", subtitle: "Code de h2a, Track et Focus" },
    measures: { "folded.kicker": "58.3/290", "folded.title": "60.6/290", "folded.subtitle": "303.1/396x2", "folded.footer": "236/428", "expanded.kicker": "58.3/314", "expanded.title": "60.6/314x2", "expanded.subtitle": "303.1/434x2", "expanded.footer": "236/434" },
  },
  "rt-track": EXPECTED_ROLES_FACES["rt-track"]!,
  "st-events": EXPECTED_ROLES_FACES["st-events"]!,
  "sys-track": EXPECTED_ROLES_FACES["sys-track"]!,
};

describe("archi-cards@1 verb table identity and contract preimage (§3.1, §3.10)", () => {
  it("shares the exact verb table object with checkArchi and validates FIX and HO documents (EV:11)", () => {
    expect(ARCHI_CARDS_CONTENT.labels.fr.verb).toBe(ARCHI_CARDS_LABELS.fr.verb);
    expect(ARCHI_CARDS_CONTENT.labels.en.verb).toBe(ARCHI_CARDS_LABELS.en.verb);
    expect(checkArchi(FIX_DOC, ARCHI_CARDS_CONTENT, "fr")).toEqual([]);
    expect(checkArchi(TINT_DOC, ARCHI_CARDS_CONTENT, "fr")).toEqual([]);
    expect(checkArchi(HO_DOC, ARCHI_CARDS_CONTENT, "fr")).toEqual([]);
  });
});

describe("archi-cards@1 slot projection over the 5 ported views (§3.2–§3.9, EV:22-39, :57-74, :83-90, :99-105, :164-185)", () => {
  it("reproduces every FACE line and measured width of view:roles and view:roles-replie (EV:22-39, :57-74)", () => {
    for (const spec of [ROLES_SPEC, ROLES_REPLIE_SPEC]) {
      const source = buildArchiSourceView(FIX_DOC, spec);
      const res = projectArchiCards(FIX_DOC, source, bindingFor(spec), ARCHI_CARDS_CONTENT);
      expect(res.outcome).toBe("ok");
      if (res.outcome !== "ok") return;

      const actualKeys = Object.keys(res.diagram.entities).map((o) => o.replace("occurrence:o-", ""));
      expect(actualKeys).toEqual(Object.keys(EXPECTED_ROLES_FACES));
      for (const [local, expected] of Object.entries(EXPECTED_ROLES_FACES)) {
        const occ = `occurrence:o-${local}`;
        const face = res.diagram.entities[occ]!;
        expect(face.form, `${spec.viewId}:${local}.form`).toBe(expected.form);
        expect(face.icon, `${spec.viewId}:${local}.icon`).toBe(expected.icon);
        expect(face.text, `${spec.viewId}:${local}.text`).toEqual(expected.text);
        expect(face.categoryRef, `${spec.viewId}:${local}.categoryRef`).toBeUndefined();
        expect(compactMeasures(res.measures[occ]!), `${spec.viewId}:${local}.measures`).toEqual(expected.measures);
      }
    }
  });

  it("reproduces every FACE line and measured width of view:deploiement (EV:83-90)", () => {
    const source = buildArchiSourceView(FIX_DOC, DEPLOIEMENT_SPEC);
    const res = projectArchiCards(FIX_DOC, source, bindingFor(DEPLOIEMENT_SPEC), ARCHI_CARDS_CONTENT);
    expect(res.outcome).toBe("ok");
    if (res.outcome !== "ok") return;

    const actualKeys = Object.keys(res.diagram.entities).map((o) => o.replace("occurrence:o-", ""));
    expect(actualKeys).toEqual(Object.keys(EXPECTED_DEPLOIEMENT_FACES));
    for (const [local, expected] of Object.entries(EXPECTED_DEPLOIEMENT_FACES)) {
      const occ = `occurrence:o-${local}`;
      const face = res.diagram.entities[occ]!;
      expect(face.form, local).toBe(expected.form);
      expect(face.icon, local).toBe(expected.icon);
      expect(face.text, local).toEqual(expected.text);
      expect(compactMeasures(res.measures[occ]!), local).toEqual(expected.measures);
    }
  });

  it("reproduces every FACE line and measured width of view:h2a-repo (EV:99-105)", () => {
    const source = buildArchiSourceView(FIX_DOC, H2A_REPO_SPEC);
    const res = projectArchiCards(FIX_DOC, source, bindingFor(H2A_REPO_SPEC), ARCHI_CARDS_CONTENT);
    expect(res.outcome).toBe("ok");
    if (res.outcome !== "ok") return;

    const actualKeys = Object.keys(res.diagram.entities).map((o) => o.replace("occurrence:o-", ""));
    expect(actualKeys).toEqual(Object.keys(EXPECTED_H2A_REPO_FACES));
    for (const [local, expected] of Object.entries(EXPECTED_H2A_REPO_FACES)) {
      const occ = `occurrence:o-${local}`;
      const face = res.diagram.entities[occ]!;
      expect(face.form, local).toBe(expected.form);
      expect(face.icon, local).toBe(expected.icon);
      expect(face.text, local).toEqual(expected.text);
      expect(compactMeasures(res.measures[occ]!), local).toEqual(expected.measures);
    }
  });

  it("reproduces every FACE line, conserved legend faces and categoryRef of view:roles-teintes (EV:164-185, :187)", () => {
    const source = buildArchiSourceView(TINT_DOC, ROLES_TEINTES_SPEC);
    const res = projectArchiCards(TINT_DOC, source, bindingFor(ROLES_TEINTES_SPEC), ARCHI_CARDS_CONTENT);
    expect(res.outcome).toBe("ok");
    if (res.outcome !== "ok") return;

    // Conserved legend and legend-key faces (EV:170-173)
    expect(res.diagram.entities["occurrence:o-legend-memoire"]).toEqual({
      form: "legend",
      text: { title: "Teintes" },
    });
    for (const k of ["key-alim", "key-ctrl", "key-mem"]) {
      expect(res.diagram.entities[`occurrence:o-${k}`]).toEqual({
        form: "legend-key",
        text: {},
      });
      expect(res.measures[`occurrence:o-${k}`]).toBeUndefined();
    }

    // Category bindings (EV:187)
    const actualCategories = Object.fromEntries(
      Object.entries(res.diagram.entities)
        .filter(([, e]) => e.categoryRef !== undefined)
        .map(([o, e]) => [o.replace("occurrence:o-", ""), e.categoryRef!.replace("entity:", "")]),
    );
    expect(actualCategories).toEqual({
      "api-memory": "key-mem",
      "rt-h2a": "key-alim",
      "rt-track": "key-ctrl",
      "sys-engram": "key-mem",
      "sys-h2a": "key-alim",
      "sys-track": "key-ctrl",
    });

    // Archi faces equal Rôles' (EV:164-169, :174-185)
    for (const [local, expected] of Object.entries(EXPECTED_ROLES_FACES)) {
      const occ = `occurrence:o-${local}`;
      const face = res.diagram.entities[occ]!;
      expect(face.form, local).toBe(expected.form);
      expect(face.icon, local).toBe(expected.icon);
      expect(face.text, local).toEqual(expected.text);
      expect(compactMeasures(res.measures[occ]!), local).toEqual(expected.measures);
    }
  });

  it("F2: container footers are identical folded or expanded and depend on the element alone (EV:108)", () => {
    const rolesRes = projectArchiCards(FIX_DOC, buildArchiSourceView(FIX_DOC, ROLES_SPEC), bindingFor(ROLES_SPEC));
    const replieRes = projectArchiCards(FIX_DOC, buildArchiSourceView(FIX_DOC, ROLES_REPLIE_SPEC), bindingFor(ROLES_REPLIE_SPEC));
    expect(rolesRes.outcome).toBe("ok");
    expect(replieRes.outcome).toBe("ok");
    if (rolesRes.outcome !== "ok" || replieRes.outcome !== "ok") return;

    const rows = Object.keys(rolesRes.diagram.entities)
      .filter((o) => rolesRes.diagram.entities[o]!.form === "container")
      .map((o) => [
        o.replace("occurrence:o-", ""),
        rolesRes.diagram.entities[o]!.text.footer,
        replieRes.diagram.entities[o]?.text.footer,
        rolesRes.diagram.entities[o]!.text.footer === replieRes.diagram.entities[o]?.text.footer,
      ]);
    expect(rows).toEqual([
      ["pkg-h2a", "repo: h2a", "repo: h2a", true],
      ["pkg-plugin", "repo: h2a", "repo: h2a", true],
      ["pkg-track", "repo: h2a", "repo: h2a", true],
      ["sys-engram", "repo: engram", "repo: engram", true],
      ["sys-h2a", "repo: h2a", "repo: h2a", true],
      ["sys-track", "repo: h2a", "repo: h2a", true],
    ]);
  });

  it("F5 and closed kickers in fr and en (§3.10, EV:109-112)", () => {
    // EV:109-111
    expect(r1(measureArchiKicker("Composant · Module · ABCDEFG", "fr"))).toBe(363.8);
    expect(r1(measureArchiKicker("Service · API · ABCDEFGHIJKL", "fr"))).toBe(322.4);
    expect(r1(measureArchiText("COMPOSANT · MODULE · ABCDEFG", 22, "body"))).toBe(339.1);

    // EV:112 closed kickers (fr)
    const closedFr = [
      "Acteur · Organisation",
      "Artefact · Manifeste",
      "Stockage · Objets",
      "Stockage · Graphe",
      "Exécution · Démon",
      "Exécution · Hook",
      "API · Commandes",
      "Composant",
      "Service",
      "Hôte · Projet cloud",
      "Paquet · Plugin",
      "Repo",
      "Système",
      "Système · cluster-mesh",
      "Système · engram",
    ];
    const measuredFr = Object.fromEntries(closedFr.map((k) => [k.toLocaleUpperCase("fr"), r1(measureArchiKicker(k, "fr"))]));
    expect(measuredFr).toEqual({
      "ACTEUR · ORGANISATION": 262.7,
      "ARTEFACT · MANIFESTE": 245.1,
      "STOCKAGE · OBJETS": 214.7,
      "STOCKAGE · GRAPHE": 220.5,
      "EXÉCUTION · DÉMON": 219.1,
      "EXÉCUTION · HOOK": 201.6,
      "API · COMMANDES": 195.4,
      COMPOSANT: 134.3,
      SERVICE: 91.7,
      "HÔTE · PROJET CLOUD": 237.2,
      "PAQUET · PLUGIN": 182.3,
      REPO: 58.3,
      SYSTÈME: 101.4,
      "SYSTÈME · CLUSTER-MESH": 287.3,
      "SYSTÈME · ENGRAM": 213,
    });

    // Closed kickers in en (§3.10): every card kicker <= 358, every container kicker <= 290
    const closedEnCards = [
      "Actor · Organization",
      "Artifact · Manifest",
      "Store · Objects",
      "Store · Graph",
      "Runtime · Daemon",
      "Runtime · Hook",
      "API · Commands",
      "Component",
      "Service",
    ];
    for (const k of closedEnCards) {
      expect(measureArchiKicker(k, "en"), k).toBeLessThanOrEqual(ARCHI_CARDS_ALLOCATION.card.kicker[0]);
    }
    const closedEnZones = ["Host · Cloud project", "Package · Plugin", "Repo", "System"];
    for (const k of closedEnZones) {
      expect(measureArchiKicker(k, "en"), k).toBeLessThanOrEqual(ARCHI_CARDS_ALLOCATION.folded.kicker[0]);
    }
  });
});

describe("RJ2: status marks « (cible) » / « (retiré) » and detail +N fitting (§3.3, §3.6, EV:140-145)", () => {
  it("RJ2: turning svc-live, pa-live, op-live, ro-live, po-live current changes the 5 expected slots and leaves no text mark when all targets turn current (EV:141-142)", () => {
    const targets = ["entity:svc-live", "relation:pa-live", "relation:op-live", "relation:ro-live", "relation:po-live"];
    const flip = clone(FIX_DOC);
    for (const x of targets) {
      const rec = x.startsWith("entity:") ? flip.entities[x]! : flip.relations[x]!;
      (rec.attributes as Record<string, unknown>)["lifecycle"] = N("current");
    }

    const facesOf = (d: NativeSemanticDocument, spec: ArchiViewSpec) => {
      const res = projectArchiCards(d, buildArchiSourceView(d, spec), bindingFor(spec));
      expect(res.outcome).toBe("ok");
      if (res.outcome !== "ok") throw new Error("expected ok");
      return res.diagram.entities;
    };

    const changed: Record<string, [string | null, string | null]> = {};
    for (const [name, spec] of [["roles", ROLES_SPEC], ["deploiement", DEPLOIEMENT_SPEC]] as const) {
      const a = facesOf(FIX_DOC, spec);
      const b = facesOf(flip, spec);
      for (const o of Object.keys(a)) {
        for (const s of Object.keys({ ...a[o]!.text, ...b[o]!.text }) as (keyof typeof a[string]["text"])[]) {
          if (a[o]!.text[s] !== b[o]!.text[s]) {
            changed[`${name} ${o.replace("occurrence:o-", "")}.${s}`] = [a[o]!.text[s] ?? null, b[o]!.text[s] ?? null];
          }
        }
      }
    }
    expect(changed).toEqual({
      "roles api-memory.detail": ["fourni par: engram live (cible)", "fourni par: engram live"],
      "roles svc-live.title": ["engram live (cible)", null],
      "roles svc-live.footer": ["opéré par: cluster-mesh (cible)", "opéré par: cluster-mesh"],
      "deploiement svc-live.title": ["engram live (cible)", null],
      "deploiement svc-live.footer": ["opéré par: cluster-mesh (cible)", "opéré par: cluster-mesh"],
    });

    // EV:142: turning host-cluster and op-cluster current too leaves 0 text markers while ca-h2a-memory remains dashed
    const all = clone(flip);
    (all.entities["entity:host-cluster"]!.attributes as Record<string, unknown>)["lifecycle"] = N("current");
    (all.relations["relation:op-cluster"]!.attributes as Record<string, unknown>)["lifecycle"] = N("current");
    const markers: string[] = [];
    for (const [name, spec] of [["roles", ROLES_SPEC], ["deploiement", DEPLOIEMENT_SPEC]] as const) {
      for (const [o, e] of Object.entries(facesOf(all, spec))) {
        for (const [s, t] of Object.entries(e.text)) {
          if (typeof t === "string" && /\((cible|retiré)\)/.test(t)) {
            markers.push(`${name} ${o.replace("occurrence:o-", "")}.${s}`);
          }
        }
      }
    }
    const dashed = Object.values(buildArchiSourceView(all, ROLES_SPEC).relationOccurrences)
      .filter((r) => r.strokeStyle === "dashed")
      .map((r) => r.relation.replace("relation:", ""));
    expect({ markers, dashed }).toEqual({ markers: [], dashed: ["ca-h2a-memory"] });
  });

  it("RJ2: mixed current/proposed detail, proposed nesting on current entity, and non-current item never hidden by +N at 428 px (EV:143-145)", () => {
    // EV:143
    const mixed = clone(FIX_DOC);
    (mixed.relations["relation:pa-track-mcp"]!.attributes as Record<string, unknown>)["lifecycle"] = N("proposed");
    const mixedRes = projectArchiCards(mixed, buildArchiSourceView(mixed, ROLES_SPEC), bindingFor(ROLES_SPEC));
    expect(mixedRes.outcome).toBe("ok");
    if (mixedRes.outcome === "ok") {
      expect(mixedRes.diagram.entities[archiOccurrenceRef("entity:api-track")]!.text.detail).toBe(
        "fourni par: CLI h2a · track-mcp (cible)",
      );
    }

    // EV:144
    const nest = clone(FIX_DOC);
    (nest.relations["relation:po-rt-track"]!.attributes as Record<string, unknown>)["lifecycle"] = N("proposed");
    const nestRoles = projectArchiCards(nest, buildArchiSourceView(nest, ROLES_SPEC), bindingFor(ROLES_SPEC));
    const nestRepo = projectArchiCards(nest, buildArchiSourceView(nest, H2A_REPO_SPEC), bindingFor(H2A_REPO_SPEC));
    expect(nestRoles.outcome).toBe("ok");
    expect(nestRepo.outcome).toBe("ok");
    if (nestRoles.outcome === "ok" && nestRepo.outcome === "ok") {
      expect({
        title: nestRoles.diagram.entities[archiOccurrenceRef("entity:rt-track")]!.text.title,
        h2aRepoTitle: nestRepo.diagram.entities[archiOccurrenceRef("entity:rt-track")]!.text.title,
      }).toEqual({
        title: "CLI track (cible)",
        h2aRepoTitle: "CLI track (cible)",
      });
    }

    // EV:145: 6 readers on st-events (1 proposed + 5 current), fitted at 428 px
    const many = clone(FIX_DOC);
    for (const [rid, src, life] of [
      ["ac-read-claude", "rt-claude", "current"],
      ["ac-read-codex", "rt-codex", "current"],
      ["ac-read-guard", "rt-guard", "current"],
      ["ac-read-live", "svc-live", "proposed"],
    ] as const) {
      (many.relations as Record<string, unknown>)[`relation:${rid}`] = {
        id: `relation:${rid}`,
        profile: "archi@1",
        type: "accesses",
        endpoints: [
          { role: "source", target: `entity:${src}` },
          { role: "target", target: "entity:st-events" },
        ],
        attributes: {
          lifecycle: N(life),
          mode: N("read"),
          evidence: { kind: "collection", items: [T("probe")] },
        },
      };
    }
    const manyRes = projectArchiCards(many, buildArchiSourceView(many, ROLES_SPEC), bindingFor(ROLES_SPEC));
    expect(manyRes.outcome).toBe("ok");
    if (manyRes.outcome === "ok") {
      const occ = archiOccurrenceRef("entity:st-events");
      expect(manyRes.diagram.entities[occ]!.text.detail).toBe("lu par: engram live (cible) · +5");
      expect(manyRes.measures[occ]!["card.detail"]!.available).toBe(428);
      expect(manyRes.measures[occ]!["card.detail"]!.overflow).toBe(false);
    }
  });
});

describe("archi-cards@1 negative and boundary cases: N13, N15, N20, N21, N22, N23, N24, RJ4 (EV:125, :129, :146, :193-198)", () => {
  it("N13: drawn runtime without runsOn refuses with archi-detail-missing (EV:125)", () => {
    const d = clone(FIX_DOC);
    delete (d.relations as Record<string, unknown>)["relation:ro-track"];
    const res = projectArchiCards(d, buildArchiSourceView(d, ROLES_SPEC), bindingFor(ROLES_SPEC));
    expect(res.outcome).toBe("refused");
    if (res.outcome !== "refused") return;
    expect(res.diagnostics.map((x) => x.code)).toEqual(["archi-detail-missing"]);
    expect(res.diagnostics[0]!.path).toBe("/presentation/diagram/entities/occurrence:o-rt-track/text/detail");
    expect(res.diagnostics[0]!.nodeId).toBe("occurrence:o-rt-track");
    expect(res.diagnostics[0]!.subjectRef).toBe("occurrence:o-rt-track");
    expect(validPointer(res.diagnostics[0]!.path!)).toBe(true);
  });

  it("N15: sub-system kicker 468 px refuses with zone-overflow (EV:129)", () => {
    const d = clone(FIX_DOC);
    (d.entities as Record<string, unknown>)["entity:sys-org"] = {
      id: "entity:sys-org",
      profile: "archi@1",
      type: "system",
      attributes: {
        name: T("Organisation IA responsable"),
        role: T("Racine de test"),
        lifecycle: N("current"),
        evidence: { kind: "collection", items: [T("neg")] },
      },
    };
    (d.relations as Record<string, unknown>)["relation:po-org"] = {
      id: "relation:po-org",
      profile: "archi@1",
      type: "partOf",
      endpoints: [
        { role: "source", target: "entity:sys-h2a" },
        { role: "target", target: "entity:sys-org" },
      ],
      attributes: {
        lifecycle: N("current"),
        evidence: { kind: "collection", items: [T("neg")] },
      },
    };
    const spec: ArchiViewSpec = {
      format: "engram.archi-view/1",
      viewId: "view:n15",
      activeHierarchy: "archi-composition",
      draw: ["entity:rt-h2a", "entity:sys-h2a"],
      collapsed: ["entity:sys-h2a"],
    };
    expect(r1(measureArchiKicker("Système · Organisation IA responsable", "fr"))).toBe(468);
    const res = projectArchiCards(d, buildArchiSourceView(d, spec), bindingFor(spec));
    expect(res.outcome).toBe("refused");
    if (res.outcome !== "refused") return;
    expect([...new Set(res.diagnostics.map((x) => x.code))]).toEqual(["zone-overflow"]);
    expect(res.diagnostics.map((x) => x.path)).toEqual([
      "/measures/occurrence:o-sys-h2a/expanded.kicker",
      "/measures/occurrence:o-sys-h2a/folded.kicker",
    ]);
  });

  it("N20: archi category absent from bound legend refuses with archi-category-unbound (EV:193)", () => {
    const d = clone(TINT_DOC);
    (d.entities["entity:rt-codex"]!.attributes as Record<string, unknown>)["category"] = T("agents");
    const res = projectArchiCards(d, buildArchiSourceView(d, ROLES_TEINTES_SPEC), bindingFor(ROLES_TEINTES_SPEC));
    expect(res.outcome).toBe("refused");
    if (res.outcome !== "refused") return;
    expect(res.diagnostics.map((x) => x.code)).toEqual(["archi-category-unbound"]);
    expect(res.diagnostics[0]!.path).toBe("/presentation/diagram/entities/occurrence:o-rt-codex/categoryRef");
    expect(res.diagnostics[0]!.nodeId).toBe("occurrence:o-rt-codex");
    expect(res.diagnostics[0]!.subjectRef).toBe("occurrence:o-rt-codex");
  });

  it("N21: binding without legendRef while 6 tinted entities are drawn refuses with archi-category-unbound × 6 (EV:194)", () => {
    const source = buildArchiSourceView(TINT_DOC, ROLES_TEINTES_SPEC);
    const res = projectArchiCards(TINT_DOC, source, {
      activeHierarchy: ROLES_TEINTES_SPEC.activeHierarchy,
      contractPin: CONTRACT_PIN,
    });
    expect(res.outcome).toBe("refused");
    if (res.outcome !== "refused") return;
    expect(res.diagnostics).toHaveLength(6);
    expect([...new Set(res.diagnostics.map((x) => x.code))]).toEqual(["archi-category-unbound"]);
  });

  it("N22: status marker is measured — « Cluster mesh (cible) » 317.5 px overflows folded.title (EV:146)", () => {
    const d = clone(FIX_DOC);
    (d.entities["entity:host-cluster"]!.attributes as Record<string, unknown>)["shortName"] = T("Cluster mesh");
    expect(r1(measureArchiText("Cluster mesh (cible)", 32, "title"))).toBe(317.5);
    const res = projectArchiCards(d, buildArchiSourceView(d, DEPLOIEMENT_SPEC), bindingFor(DEPLOIEMENT_SPEC));
    expect(res.outcome).toBe("refused");
    if (res.outcome !== "refused") return;
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]!.code).toBe("zone-overflow");
    expect(res.diagnostics[0]!.path).toBe("/measures/occurrence:o-host-cluster/folded.title");
    expect(res.diagnostics[0]!.subjectRef).toBe("occurrence:o-host-cluster");
  });

  it("RJ4: zone subtitle with unbreakable word 634.6 px refuses folded.subtitle and expanded.subtitle (EV:196)", () => {
    const role = "Charge @sentropic/architecture-governance-multiagent-coordination";
    const d = clone(FIX_DOC);
    (d.entities["entity:sys-track"]!.attributes as Record<string, unknown>)["role"] = T(role);
    const foldedLayout = layoutArchiLines(role, "subtitle", 396, 2);
    expect(foldedLayout.lines).toEqual(["Charge", "@sentropic/architecture-governance-multiagent-coordination"]);
    expect(foldedLayout.widths.map(r1)).toEqual([75.3, 634.6]);

    const res = projectArchiCards(d, buildArchiSourceView(d, ROLES_SPEC), bindingFor(ROLES_SPEC));
    expect(res.outcome).toBe("refused");
    if (res.outcome !== "refused") return;
    expect(res.diagnostics.map((x) => ({ code: x.code, path: x.path }))).toEqual([
      { code: "zone-overflow", path: "/measures/occurrence:o-sys-track/expanded.subtitle" },
      { code: "zone-overflow", path: "/measures/occurrence:o-sys-track/folded.subtitle" },
    ]);
  });

  it("N23: card body with unbreakable word 634.6 px refuses with card-overflow (EV:197)", () => {
    const role = "Écrit @sentropic/architecture-governance-multiagent-coordination";
    const d = clone(FIX_DOC);
    (d.entities["entity:rt-track"]!.attributes as Record<string, unknown>)["role"] = T(role);
    const bodyLayout = layoutArchiLines(role, "body", 428, 1);
    expect(bodyLayout.widths.map(r1)).toEqual([48, 634.6]);

    const res = projectArchiCards(d, buildArchiSourceView(d, ROLES_SPEC), bindingFor(ROLES_SPEC));
    expect(res.outcome).toBe("refused");
    if (res.outcome !== "refused") return;
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]!.code).toBe("card-overflow");
    expect(res.diagnostics[0]!.path).toBe("/measures/occurrence:o-rt-track/card.body");
  });

  it("N24 (positive): two-line subtitle 315 + 337 px of 396 fits both folded and expanded (EV:198)", () => {
    const role = "Mémoire gouvernée du track : demandes, étapes et historique";
    const d = clone(FIX_DOC);
    (d.entities["entity:sys-engram"]!.attributes as Record<string, unknown>)["role"] = T(role);
    const res = projectArchiCards(d, buildArchiSourceView(d, ROLES_SPEC), bindingFor(ROLES_SPEC));
    expect(res.outcome).toBe("ok");
    if (res.outcome !== "ok") return;
    const ms = res.measures[archiOccurrenceRef("entity:sys-engram")]!;
    expect(ms["folded.subtitle"]!.lines).toEqual(["Mémoire gouvernée du track :", "demandes, étapes et historique"]);
    expect(ms["folded.subtitle"]!.widths.map(r1)).toEqual([315, 337]);
    expect(ms["expanded.subtitle"]!.lines).toEqual(["Mémoire gouvernée du track :", "demandes, étapes et historique"]);
    expect(ms["expanded.subtitle"]!.widths.map(r1)).toEqual([315, 337]);
  });
});

describe("H1: hosts-r3 (HO) card and zone faces (§2.7, §6.1, §6.2)", () => {
  it("projects roles-hosts and deploiement-hosts with 0 refusals and matches the §2.7 face table", () => {
    const rolesSource = buildArchiSourceView(HO_DOC, ROLES_HOSTS_SPEC);
    const rolesRes = projectArchiCards(HO_DOC, rolesSource, bindingFor(ROLES_HOSTS_SPEC));
    expect(rolesRes.outcome).toBe("ok");

    const depSource = buildArchiSourceView(HO_DOC, DEPLOIEMENT_HOSTS_SPEC);
    const depRes = projectArchiCards(HO_DOC, depSource, bindingFor(DEPLOIEMENT_HOSTS_SPEC));
    expect(depRes.outcome).toBe("ok");
    if (rolesRes.outcome !== "ok" || depRes.outcome !== "ok") return;

    const ents = rolesRes.diagram.entities;
    expect(ents["occurrence:o-host-poste"]).toEqual({
      form: "container",
      icon: "cloud",
      text: {
        kicker: "Hôte · Poste",
        subtitle: "8 CLI",
        footer: "opéré par: rhanka",
      },
    });
    expect(ents["occurrence:o-rt-gemini"]).toEqual({
      form: "card",
      icon: "server",
      text: {
        kicker: "Exécution · CLI",
        body: "Ouvre la session de l’agent",
        detail: "sur: Poste de travail",
        footer: "propriétaire: unverified",
      },
    });
    expect(ents["occurrence:o-rt-agy"]).toEqual({
      form: "card",
      icon: "server",
      text: {
        kicker: "Exécution · CLI",
        body: "Ouvre la session de l’agent",
        detail: "sur: Poste de travail",
        footer: "propriétaire: Google",
      },
    });
    expect(ents["occurrence:o-rt-opencode"]!.text.footer).toBe("propriétaire: unverified");
    expect(ents["occurrence:o-rt-vibe"]!.text.footer).toBe("propriétaire: Mistral");
    expect(ents["occurrence:o-rt-muse"]!.text.footer).toBe("propriétaire: Meta");
    expect(ents["occurrence:o-rt-hermes"]!.text.footer).toBe("propriétaire: NousResearch");
  });
});
