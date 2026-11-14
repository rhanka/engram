/**
 * Lot L2 — Spec Frontmatter, Stored Exact Text, Section Spans, Section Markers & Manifest
 * (`src/app-context/extract-spec.ts`, `.appctx/DESIGN-NOTE-L2-SCOPE.md`, `.appctx/DESIGN-NOTE-EXTRACTORS-NO-GUESS.md`).
 *
 * Supported subset table (Rule 2 of DESIGN-NOTE-EXTRACTORS-NO-GUESS.md & DESIGN-NOTE-L2-SCOPE.md):
 *
 * | Area | Supported construct | Unsupported / invalid construct (diagnostic, zero edges) |
 * | --- | --- | --- |
 * | Manifest path | Fixed `<checkout>/.engram/spec-map.yaml` with `realpath` inside `<checkout>` `realpath` | Symlink / parent-dir symlink outside checkout or external manifest (`manifest-outside-checkout`, file ignored) |
 * | Manifest YAML | Mapping with optional `version: number` and `entries: SpecMapEntry[]` (`path`, `id?`, `title?`, `status?`, `section?`, `requirement?`, `requirements?`, `supersedes?`, `governs?`, `track?`, `decisions?`) | YAML syntax errors, non-map root/entry, unknown keys, or invalid field types (`unsupported-construct`); escaping `path` (`target-unresolved`) |
 * | Spec frontmatter | Leading `--- ... ---` / `...` YAML mapping (`id?`, `title?`, `status?`, `supersedes?`, `governs?`, `track?`, `decisions?`, `requirements?`) | Malformed YAML inside `--- ... ---` envelope (envelope kept, never re-parsed as Markdown), non-map root, unknown keys, or invalid field types (`unsupported-construct`) |
 * | Section marker | Single-line `<!-- app-context: {yaml flow mapping} -->` on the first non-blank line after a heading, outside code fences | Multi-line marker comments, non-flow-mapping `app-context:` comments, legacy `<!-- governs/requirement/track/decisions: ... -->` comments, misplaced markers, or invalid fields (`unsupported-construct`) |
 * | Code fences & headings | CommonMark line fences (` ``` ` or `~~~`, length >= 3, closed by same char of length >= opener); everything inside fence ignored; heading text unchanged from `extractMarkdown` | Non-fenced heading dropped by `extractMarkdown` due to unbalanced inner backtick fence desynchronization (`unsupported-construct`) |
 * | Requirements | Declared in frontmatter, section marker, or manifest as `{id, section?, statement?}` only; pass 1 collection, pass 2 resolution; referenced by bare `requirement: id` in marker/manifest (never creating a missing Requirement) | Non-string/empty `id` or `section` (`unsupported-construct`); same `id` declared for different sections, conflicting outer/inner `section`, or duplicate declarations (`target-ambiguous`, no `Requirement` node, no edge); unresolved `section` or bare `requirement: id` reference (`target-unresolved`) |
 * | Markdown links | Ignored (no `cites`, `governs`, or `refines` edges from links) | N/A |
 * | Target selectors | Shorthand strings or objects for `component`, `route` (`sveltekit\|hash\|pathname`), `endpoint`, `entity` (`postgres\|mysql\|sqlite`), `field`, `symbol` | Unknown selector kind, unknown selector key, conflicting/invalid selector aliases, invalid `routerKind`/`dialect`, or missing required selector field (`target-unresolved`, zero edges from declaration) |
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { canonicalBytes } from "../src/ontology-guardian/canonical.js";
import { normalizeOntologyProfile, parseOntologyProfile } from "../src/ontology-profile.js";
import { validateProfileExtraction } from "../src/profile-validate.js";
import * as extractModule from "../src/extract.js";
import type { GraphNode, OntologyCitation, OntologyEvidenceRecord } from "../src/types.js";
import { appContextNodeId } from "../src/app-context/node-id.js";
import type {
  AppContextDataDialect,
  AppContextFileCitation,
  AppContextRouterKind,
  TrackCliDecision,
  TrackCliItem,
  TrackProjectionCitation,
} from "../src/app-context/types.js";
import {
  extractSpecs,
  parseSpecMapManifest,
  parseTargetSelector,
  sliceSpecLines,
  slugifyHeading,
} from "../src/app-context/extract-spec.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const profilePath = join(repoRoot, "profiles", "app-context", "v1", "profile.yaml");
const normalizedProfile = normalizeOntologyProfile(
  parseOntologyProfile(readFileSync(profilePath, "utf8"), profilePath),
  profilePath,
);

const tempDirs: string[] = [];

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "appctx-spec-l2-"));
  tempDirs.push(dir);
  return dir;
}

function writeRepoFile(rootDir: string, relPath: string, content: string): void {
  const abs = join(rootDir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

type TestFixtureTarget =
  | {
      kind: "route";
      routerKind: AppContextRouterKind;
      pattern: string;
      file?: string;
      startLine?: number;
      endLine?: number;
    }
  | {
      kind: "component";
      file: string;
      exportName?: string;
      framework?: string;
      startLine?: number;
      endLine?: number;
    }
  | {
      kind: "endpoint";
      method: string;
      pathTemplate: string;
      file?: string;
      startLine?: number;
      endLine?: number;
    }
  | {
      kind: "entity";
      name: string;
      schema?: string;
      dialect?: AppContextDataDialect;
      entityKind?: "table" | "view";
      file?: string;
      startLine?: number;
      endLine?: number;
    }
  | {
      kind: "field";
      entity: string;
      field: string;
      schema?: string;
      dialect?: AppContextDataDialect;
      dbType?: string;
      nullable?: boolean;
      isPk?: boolean;
      isFk?: boolean;
      file?: string;
      startLine?: number;
      endLine?: number;
    }
  | {
      kind: "symbol";
      file: string;
      symbolName: string;
      symbolKind?: string;
      startLine?: number;
      endLine?: number;
    }
  | {
      kind: "track_item";
      id: string;
      title?: string;
      wpId?: string;
      wpLabel?: string;
      track?: TrackCliItem;
      startLine?: number;
      endLine?: number;
      jsonPointer?: string;
    }
  | {
      kind: "track_workpackage";
      wpId: string;
      wpLabel?: string;
      startLine?: number;
      endLine?: number;
      jsonPointer?: string;
    }
  | {
      kind: "track_decision";
      id: string;
      title?: string;
      track?: TrackCliDecision;
      startLine?: number;
      endLine?: number;
      jsonPointer?: string;
    };

function buildFixtureCatalog(
  repoKey: string,
  commit: string,
  targets: readonly TestFixtureTarget[],
): { knownNodes: GraphNode[]; knownEvidence: OntologyEvidenceRecord[] } {
  const knownNodes: GraphNode[] = [];
  const knownEvidence: OntologyEvidenceRecord[] = [];

  for (let idx = 0; idx < targets.length; idx++) {
    const t = targets[idx]!;
    const startLine = t.startLine ?? 1;
    const endLine = t.endLine ?? startLine;
    const loc = startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`;

    if (t.kind === "track_item" || t.kind === "track_workpackage" || t.kind === "track_decision") {
      const isDecision = t.kind === "track_decision";
      const sourceFile = isDecision
        ? ("track-projections/track-decisions.json" as const)
        : ("track-projections/track-query.json" as const);
      const command = isDecision
        ? ("track decision ls --format json" as const)
        : ("track query --format json" as const);
      const jsonPointer = t.jsonPointer ?? `/${idx}`;
      const citation: TrackProjectionCitation = {
        citation_kind: "track_cli_projection",
        source_file: sourceFile,
        line_start: startLine,
        line_end: endLine,
        json_pointer: jsonPointer,
        command,
        cli_version: "0.9.4",
        commit,
      };
      const evId = `ev:fixture-track:${createHash("sha256")
        .update(canonicalBytes([repoKey, sourceFile, jsonPointer, String(startLine), String(endLine), commit]))
        .digest("hex")
        .slice(0, 24)}`;
      knownEvidence.push({
        id: evId,
        source_file: sourceFile,
        citations: [citation as unknown as OntologyCitation],
      });

      if (t.kind === "track_item") {
        const track: TrackCliItem = t.track ?? {
          id: t.id,
          title: t.title ?? t.id,
          kind: "feature",
          workspace: "reorientation",
          bucket: "AWAITED",
          realization: "in-progress",
          acceptance: "unknown",
          ...(t.wpId ? { wpId: t.wpId } : {}),
          ...(t.wpLabel ? { wpLabel: t.wpLabel } : {}),
        };
        knownNodes.push({
          id: appContextNodeId(repoKey, "TrackItem", [t.id]),
          label: track.title,
          node_type: "TrackItem",
          file_type: "document",
          status: "reference",
          track,
          startLine,
          endLine,
          source_file: sourceFile,
          source_location: loc,
          evidence_refs: [evId],
          citations: [citation as unknown as OntologyCitation],
        });
      } else if (t.kind === "track_workpackage") {
        const wpLabel = t.wpLabel ?? t.wpId;
        knownNodes.push({
          id: appContextNodeId(repoKey, "TrackWorkpackage", [t.wpId]),
          label: wpLabel,
          node_type: "TrackWorkpackage",
          file_type: "document",
          status: "reference",
          track: { wpId: t.wpId, wpLabel },
          startLine,
          endLine,
          source_file: sourceFile,
          source_location: loc,
          evidence_refs: [evId],
          citations: [citation as unknown as OntologyCitation],
        });
      } else {
        const track: TrackCliDecision = t.track ?? {
          id: t.id,
          title: t.title ?? t.id,
          workspace: "reorientation",
          decisionKind: "orientation",
          realization: "done",
          outcome: "go",
          structured: true,
          structure: "structured",
          optionCount: 2,
          openQuestionCount: 0,
          hasRecommendation: true,
          options: [{ id: "opt-1", summary: "Option 1", title: "Option 1" }],
        };
        knownNodes.push({
          id: appContextNodeId(repoKey, "TrackDecision", [t.id]),
          label: track.title,
          node_type: "TrackDecision",
          file_type: "document",
          status: "reference",
          track,
          startLine,
          endLine,
          source_file: sourceFile,
          source_location: loc,
          evidence_refs: [evId],
          citations: [citation as unknown as OntologyCitation],
        });
      }
      continue;
    }

    const file =
      t.kind === "component" || t.kind === "symbol"
        ? t.file
        : t.file ??
          (t.kind === "route"
            ? "engram.yaml"
            : t.kind === "endpoint"
              ? "api/src/routes/prospect-marks.synthetic-fixture.ts"
              : "api/drizzle/0005_prospect_marks.sql");
    const citation: AppContextFileCitation = {
      citation_kind: "file",
      source_file: file,
      line_start: startLine,
      line_end: endLine,
      commit,
    };
    const evId = `ev:fixture-file:${createHash("sha256")
      .update(canonicalBytes([repoKey, t.kind, file, String(startLine), String(endLine), String(idx), commit]))
      .digest("hex")
      .slice(0, 24)}`;
    knownEvidence.push({
      id: evId,
      source_file: file,
      citations: [citation as unknown as OntologyCitation],
    });

    if (t.kind === "route") {
      knownNodes.push({
        id: appContextNodeId(repoKey, "Route", [t.routerKind, t.pattern]),
        label: `${t.routerKind}:${t.pattern}`,
        node_type: "Route",
        file_type: "code",
        status: "validated",
        routerKind: t.routerKind,
        routePattern: t.pattern,
        file,
        startLine,
        endLine,
        source_file: file,
        source_location: loc,
        evidence_refs: [evId],
        citations: [citation as unknown as OntologyCitation],
      });
    } else if (t.kind === "component") {
      const exportName = t.exportName ?? "default";
      knownNodes.push({
        id: appContextNodeId(repoKey, "Component", [file, exportName]),
        label: `${basename(file)}#${exportName}`,
        node_type: "Component",
        file_type: "code",
        status: "validated",
        file,
        exportName,
        framework: t.framework ?? "svelte",
        startLine,
        endLine,
        source_file: file,
        source_location: loc,
        evidence_refs: [evId],
        citations: [citation as unknown as OntologyCitation],
      });
    } else if (t.kind === "endpoint") {
      const method = t.method.toUpperCase();
      knownNodes.push({
        id: appContextNodeId(repoKey, "ApiEndpoint", [method, t.pathTemplate]),
        label: `${method} ${t.pathTemplate}`,
        node_type: "ApiEndpoint",
        file_type: "code",
        status: "validated",
        method,
        pathTemplate: t.pathTemplate,
        file,
        startLine,
        endLine,
        source_file: file,
        source_location: loc,
        evidence_refs: [evId],
        citations: [citation as unknown as OntologyCitation],
      });
    } else if (t.kind === "entity") {
      const dialect = t.dialect ?? "postgres";
      const schema = t.schema ?? "public";
      knownNodes.push({
        id: appContextNodeId(repoKey, "DataEntity", [dialect, schema, t.name]),
        label: `${schema}.${t.name}`,
        node_type: "DataEntity",
        file_type: "code",
        status: "validated",
        dialect,
        schema,
        name: t.name,
        entityKind: t.entityKind ?? "table",
        file,
        startLine,
        endLine,
        source_file: file,
        source_location: loc,
        evidence_refs: [evId],
        citations: [citation as unknown as OntologyCitation],
      });
    } else if (t.kind === "field") {
      const dialect = t.dialect ?? "postgres";
      const schema = t.schema ?? "public";
      knownNodes.push({
        id: appContextNodeId(repoKey, "DataField", [dialect, schema, t.entity, t.field]),
        label: `${schema}.${t.entity}.${t.field}`,
        node_type: "DataField",
        file_type: "code",
        status: "validated",
        dialect,
        schema,
        entityName: t.entity,
        name: t.field,
        dbType: t.dbType ?? "UUID",
        nullable: t.nullable ?? false,
        isPk: t.isPk ?? false,
        isFk: t.isFk ?? true,
        file,
        startLine,
        endLine,
        source_file: file,
        source_location: loc,
        evidence_refs: [evId],
        citations: [citation as unknown as OntologyCitation],
      });
    } else if (t.kind === "symbol") {
      const symbolKind = t.symbolKind ?? "function";
      knownNodes.push({
        id: appContextNodeId(repoKey, "CodeSymbol", [file, symbolKind, t.symbolName]),
        label: t.symbolName,
        node_type: "CodeSymbol",
        file_type: "code",
        status: "validated",
        file,
        symbolKind,
        symbolName: t.symbolName,
        startLine,
        endLine,
        source_file: file,
        source_location: loc,
        evidence_refs: [evId],
        citations: [citation as unknown as OntologyCitation],
      });
    }
  }

  return { knownNodes, knownEvidence };
}

describe("app-context spec extractor (Lot L2, §2.2–§2.3, §4.1–§4.2, §6.2, §7)", () => {
  it("persists exact UTF-8 Spec.content, reuses extractMarkdown headings verbatim (including inline code headings, R3), and computes section spans + sibling disambiguation", async () => {
    const tmpRepo = makeTempRepo();
    const commit = "43c873e0d2cf7acd50e330130fb809c7bf808953";
    const repoKey = "radar-immobilier";

    const specText = [
      "---",
      'id: "IMMO-CARTE-01"',
      'title: "Spécification Évaluation & Marquage d\'équipe"',
      'status: "active"',
      "---",
      "# Vue d'ensemble",
      "Texte introductif avec caractères UTF-8: Évaluation, rôle MAMH, façade — 100% fidèle.",
      "",
      "## Fiche lot et marquage d'équipe",
      "Détails de la section principale.",
      "```ts",
      "// Ce bloc de code contient un faux titre qui doit être ignoré par extractMarkdown:",
      "# Faux titre dans un bloc de code",
      "```",
      "### Détails cadastraux",
      "Sous-section niveau 3.",
      "## Fiche lot et marquage d'équipe",
      "Deuxième section fraternelle avec le même intitulé (~2).",
      "## Fiche lot et marquage d'équipe",
      "Troisième section fraternelle avec le même intitulé (~3).",
      "## `fetch`",
      "Section dont le titre est entièrement en code inline (R3).",
      "## Ordinary `name` heading",
      "Section dont le titre mêle texte et code inline (R3).",
      "# Annexes",
      "Fin du document.",
      "",
    ].join("\n");

    writeRepoFile(tmpRepo, "docs/spec/carte.md", specText);

    const spy = vi.spyOn(extractModule, "extractMarkdown");

    const result = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(slugifyHeading("Fiche lot et marquage d'équipe")).toBe("fiche-lot-et-marquage-d-equipe");
    expect(slugifyHeading("`fetch`")).toBe("fetch");
    expect(slugifyHeading("Ordinary `name` heading")).toBe("ordinary-name-heading");

    const specId = appContextNodeId(repoKey, "Spec", ["IMMO-CARTE-01"]);
    const specNode = result.nodes.find((n) => n.id === specId);
    expect(specNode).toBeDefined();
    expect(specNode?.node_type).toBe("Spec");
    expect(specNode?.specId).toBe("IMMO-CARTE-01");
    expect(specNode?.file).toBe("docs/spec/carte.md");
    expect(specNode?.title).toBe("Spécification Évaluation & Marquage d'équipe");
    expect(specNode?.status).toBe("active");
    expect(specNode?.startLine).toBe(1);
    expect(specNode?.endLine).toBe(26);
    expect(specNode?.content).toBe(specText);

    const sections = result.nodes
      .filter((n) => n.node_type === "SpecSection")
      .sort((a, b) => Number(a.startLine) - Number(b.startLine));

    expect(
      sections.map((s) => ({
        slugPath: s.slugPath,
        heading: s.heading,
        level: s.level,
        startLine: s.startLine,
        endLine: s.endLine,
      })),
    ).toEqual([
      {
        slugPath: "vue-d-ensemble",
        heading: "Vue d'ensemble",
        level: 1,
        startLine: 6,
        endLine: 24,
      },
      {
        slugPath: "vue-d-ensemble/fiche-lot-et-marquage-d-equipe",
        heading: "Fiche lot et marquage d'équipe",
        level: 2,
        startLine: 9,
        endLine: 16,
      },
      {
        slugPath: "vue-d-ensemble/fiche-lot-et-marquage-d-equipe/details-cadastraux",
        heading: "Détails cadastraux",
        level: 3,
        startLine: 15,
        endLine: 16,
      },
      {
        slugPath: "vue-d-ensemble/fiche-lot-et-marquage-d-equipe~2",
        heading: "Fiche lot et marquage d'équipe",
        level: 2,
        startLine: 17,
        endLine: 18,
      },
      {
        slugPath: "vue-d-ensemble/fiche-lot-et-marquage-d-equipe~3",
        heading: "Fiche lot et marquage d'équipe",
        level: 2,
        startLine: 19,
        endLine: 20,
      },
      {
        slugPath: "vue-d-ensemble/fetch",
        heading: "`fetch`",
        level: 2,
        startLine: 21,
        endLine: 22,
      },
      {
        slugPath: "vue-d-ensemble/ordinary-name-heading",
        heading: "Ordinary `name` heading",
        level: 2,
        startLine: 23,
        endLine: 24,
      },
      {
        slugPath: "annexes",
        heading: "Annexes",
        level: 1,
        startLine: 25,
        endLine: 26,
      },
    ]);

    expect(sliceSpecLines(String(specNode?.content), 15, 16)).toBe(
      "### Détails cadastraux\nSous-section niveau 3.",
    );

    const validation = validateProfileExtraction(result.extraction, { profile: normalizedProfile });
    expect(validation.baseErrors).toEqual([]);
    expect(validation.issues).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("extracts whole-spec frontmatter governs, track, decisions, supersedes, and frontmatter requirements ({id, section?}) with provenance", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "1111111111111111111111111111111111111111";

    writeRepoFile(
      tmpRepo,
      "docs/spec/spec-v1.md",
      [
        "---",
        'id: "IMMO-DEC-TRACK-V1"',
        'title: "Tracking Structure v1"',
        'status: "superseded"',
        "---",
        "# Tracking v1",
        "Version initiale remplacée par v2.",
      ].join("\n"),
    );

    writeRepoFile(
      tmpRepo,
      "docs/spec/spec-v2.md",
      [
        "---",
        'id: "IMMO-DEC-TRACK-V2"',
        'title: "Tracking Structure v2"',
        "supersedes:",
        '  - "IMMO-DEC-TRACK-V1"',
        "governs:",
        "  - kind: component",
        '    file: "ui/src/lib/components/maps/EvaluationMapView.svelte"',
        "  - kind: entity",
        '    name: "prospect_marks"',
        "track:",
        '  - "01KTW1NZ55V6FTN3ACJSKQQNQ7"',
        "decisions:",
        '  - "01KW775RC2T3FQD76A3KNNS2FD"',
        "requirements:",
        '  - id: "REQ-FM-01"',
        '    statement: "Le suivi doit référencer un ULID de décision valide."',
        '  - id: "REQ-FM-02"',
        '    section: "Scope"',
        "---",
        "# Tracking v2",
        "## Scope",
        "Texte de la section Scope.",
      ].join("\n"),
    );

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      {
        kind: "component",
        file: "ui/src/lib/components/maps/EvaluationMapView.svelte",
        exportName: "default",
      },
      {
        kind: "entity",
        dialect: "postgres",
        schema: "public",
        name: "prospect_marks",
      },
      {
        kind: "track_item",
        id: "01KTW1NZ55V6FTN3ACJSKQQNQ7",
        title: "CS-L2 — Fiche lot complète",
        startLine: 21,
        endLine: 34,
        jsonPointer: "/1",
      },
      {
        kind: "track_decision",
        id: "01KW775RC2T3FQD76A3KNNS2FD",
        title: "Structure de tracking stable v1",
        startLine: 2,
        endLine: 18,
        jsonPointer: "/0",
      },
    ]);

    const result = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });

    expect(result.diagnostics).toEqual([]);

    const specV1Id = appContextNodeId(repoKey, "Spec", ["IMMO-DEC-TRACK-V1"]);
    const specV2Id = appContextNodeId(repoKey, "Spec", ["IMMO-DEC-TRACK-V2"]);
    const scopeSecId = appContextNodeId(repoKey, "SpecSection", ["IMMO-DEC-TRACK-V2", "tracking-v2/scope"]);
    const compId = appContextNodeId(repoKey, "Component", [
      "ui/src/lib/components/maps/EvaluationMapView.svelte",
      "default",
    ]);
    const entityId = appContextNodeId(repoKey, "DataEntity", ["postgres", "public", "prospect_marks"]);
    const trackItemId = appContextNodeId(repoKey, "TrackItem", ["01KTW1NZ55V6FTN3ACJSKQQNQ7"]);
    const decisionId = appContextNodeId(repoKey, "TrackDecision", ["01KW775RC2T3FQD76A3KNNS2FD"]);
    const fmReq1Id = appContextNodeId(repoKey, "Requirement", ["IMMO-DEC-TRACK-V2", "REQ-FM-01"]);
    const fmReq2Id = appContextNodeId(repoKey, "Requirement", ["IMMO-DEC-TRACK-V2", "REQ-FM-02"]);

    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: specV2Id,
          target: specV1Id,
          relation: "supersedes",
          derivation_method: "spec_frontmatter_supersedes",
          source_file: "docs/spec/spec-v2.md",
          startLine: 4,
          endLine: 5,
        }),
        expect.objectContaining({
          source: specV2Id,
          target: compId,
          relation: "governs",
          derivation_method: "spec_frontmatter_governs",
          source_file: "docs/spec/spec-v2.md",
          startLine: 6,
          endLine: 10,
        }),
        expect.objectContaining({
          source: specV2Id,
          target: entityId,
          relation: "governs",
          derivation_method: "spec_frontmatter_governs",
          source_file: "docs/spec/spec-v2.md",
          startLine: 6,
          endLine: 10,
        }),
        expect.objectContaining({
          source: trackItemId,
          target: specV2Id,
          relation: "tracks",
          derivation_method: "spec_frontmatter_track",
          source_file: "docs/spec/spec-v2.md",
          startLine: 11,
          endLine: 12,
        }),
        expect.objectContaining({
          source: decisionId,
          target: specV2Id,
          relation: "decides",
          derivation_method: "spec_frontmatter_decisions",
          source_file: "docs/spec/spec-v2.md",
          startLine: 13,
          endLine: 14,
        }),
        expect.objectContaining({
          source: specV2Id,
          target: fmReq1Id,
          relation: "specifies",
          derivation_method: "spec_frontmatter_requirement",
          source_file: "docs/spec/spec-v2.md",
          startLine: 16,
          endLine: 17,
        }),
        expect.objectContaining({
          source: scopeSecId,
          target: fmReq2Id,
          relation: "specifies",
          derivation_method: "spec_frontmatter_requirement",
          source_file: "docs/spec/spec-v2.md",
          startLine: 18,
          endLine: 19,
        }),
      ]),
    );

    const validation = validateProfileExtraction(result.extraction, { profile: normalizedProfile });
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it("extracts single-line flow section markers <!-- app-context: {yaml flow mapping} --> on the first non-blank line after a heading (Rule 2.b)", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "2222222222222222222222222222222222222222";

    const mdContent = [
      "---",
      'id: "IMMO-EVOL-CARTE-STEVE"',
      'status: "evol"',
      "---",
      "# Carte et Fiche Lot",
      "",
      "## Navigation et Vue",
      "<!-- app-context: { governs: [component:ui/src/lib/components/maps/EvaluationMapView.svelte#default], track: [01KYZPY718ZVH3712VQTBFSFAG], decisions: [01KW775RC2T3FQD76A3KNNS2FD] } -->",
      "Cette section gouverne le composant de carte.",
      "",
      "## Fiche lot et marquage d'équipe",
      "",
      "<!-- app-context: { requirement: { id: REQ-FICHE-MARKS-01 }, governs: [{ kind: component, file: ui/src/lib/components/maps/LotFichePanel.svelte }, { kind: field, dialect: postgres, schema: public, entity: prospect_marks, field: lot_version_id }, { kind: symbol, file: ui/src/lib/prospect/prospect-marks-client.ts, symbolName: createProspectMark }], track: [01KTW1NZ55V6FTN3ACJSKQQNQ7], decisions: [01KW775RC2T3FQD76A3KNNS2FD] } -->",
      "L'utilisateur DOIT pouvoir enregistrer une marque d'équipe sur un lot.",
      "",
      "## Filtrage par marque",
      "<!-- app-context: { requirements: [{ id: REQ-FICHE-MARKS-02 }] } -->",
      "L'utilisateur DOIT pouvoir filtrer les lots par marque.",
    ].join("\n");

    writeRepoFile(tmpRepo, "docs/spec/SPEC_EVOL_INTEGRATION_CARTE_STEVE.md", mdContent);

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      {
        kind: "component",
        file: "ui/src/lib/components/maps/EvaluationMapView.svelte",
        exportName: "default",
      },
      {
        kind: "component",
        file: "ui/src/lib/components/maps/LotFichePanel.svelte",
        exportName: "default",
      },
      {
        kind: "field",
        dialect: "postgres",
        schema: "public",
        entity: "prospect_marks",
        field: "lot_version_id",
      },
      {
        kind: "symbol",
        file: "ui/src/lib/prospect/prospect-marks-client.ts",
        symbolKind: "function",
        symbolName: "createProspectMark",
      },
      {
        kind: "track_workpackage",
        wpId: "01KYZPY718ZVH3712VQTBFSFAG",
        wpLabel: "WP6",
      },
      {
        kind: "track_item",
        id: "01KTW1NZ55V6FTN3ACJSKQQNQ7",
        title: "CS-L2 — Fiche lot complète",
      },
      {
        kind: "track_decision",
        id: "01KW775RC2T3FQD76A3KNNS2FD",
        title: "Structure de tracking stable v1",
      },
    ]);

    const result = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });

    expect(result.diagnostics).toEqual([]);

    const navSecId = appContextNodeId(repoKey, "SpecSection", [
      "IMMO-EVOL-CARTE-STEVE",
      "carte-et-fiche-lot/navigation-et-vue",
    ]);
    const ficheSecId = appContextNodeId(repoKey, "SpecSection", [
      "IMMO-EVOL-CARTE-STEVE",
      "carte-et-fiche-lot/fiche-lot-et-marquage-d-equipe",
    ]);
    const filtreSecId = appContextNodeId(repoKey, "SpecSection", [
      "IMMO-EVOL-CARTE-STEVE",
      "carte-et-fiche-lot/filtrage-par-marque",
    ]);
    const req1Id = appContextNodeId(repoKey, "Requirement", [
      "IMMO-EVOL-CARTE-STEVE",
      "REQ-FICHE-MARKS-01",
    ]);
    const req2Id = appContextNodeId(repoKey, "Requirement", [
      "IMMO-EVOL-CARTE-STEVE",
      "REQ-FICHE-MARKS-02",
    ]);

    const req1Node = result.nodes.find((n) => n.id === req1Id);
    const req2Node = result.nodes.find((n) => n.id === req2Id);
    expect(req1Node).toMatchObject({
      node_type: "Requirement",
      reqId: "REQ-FICHE-MARKS-01",
      specId: "IMMO-EVOL-CARTE-STEVE",
      file: "docs/spec/SPEC_EVOL_INTEGRATION_CARTE_STEVE.md",
      startLine: 11,
      endLine: 15,
    });
    expect(req2Node).toMatchObject({
      node_type: "Requirement",
      reqId: "REQ-FICHE-MARKS-02",
      specId: "IMMO-EVOL-CARTE-STEVE",
      file: "docs/spec/SPEC_EVOL_INTEGRATION_CARTE_STEVE.md",
      startLine: 16,
      endLine: 18,
    });

    const evalCompId = appContextNodeId(repoKey, "Component", [
      "ui/src/lib/components/maps/EvaluationMapView.svelte",
      "default",
    ]);
    const ficheCompId = appContextNodeId(repoKey, "Component", [
      "ui/src/lib/components/maps/LotFichePanel.svelte",
      "default",
    ]);
    const fieldId = appContextNodeId(repoKey, "DataField", [
      "postgres",
      "public",
      "prospect_marks",
      "lot_version_id",
    ]);
    const symId = appContextNodeId(repoKey, "CodeSymbol", [
      "ui/src/lib/prospect/prospect-marks-client.ts",
      "function",
      "createProspectMark",
    ]);
    const wpId = appContextNodeId(repoKey, "TrackWorkpackage", ["01KYZPY718ZVH3712VQTBFSFAG"]);
    const itemId = appContextNodeId(repoKey, "TrackItem", ["01KTW1NZ55V6FTN3ACJSKQQNQ7"]);
    const decId = appContextNodeId(repoKey, "TrackDecision", ["01KW775RC2T3FQD76A3KNNS2FD"]);

    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: navSecId,
          target: evalCompId,
          relation: "governs",
          derivation_method: "spec_section_marker_governs",
        }),
        expect.objectContaining({
          source: wpId,
          target: navSecId,
          relation: "tracks",
          derivation_method: "spec_section_marker_track",
        }),
        expect.objectContaining({
          source: decId,
          target: navSecId,
          relation: "decides",
          derivation_method: "spec_section_marker_decisions",
        }),
        expect.objectContaining({
          source: ficheSecId,
          target: req1Id,
          relation: "specifies",
          derivation_method: "spec_requirement_marker",
        }),
        expect.objectContaining({
          source: filtreSecId,
          target: req2Id,
          relation: "specifies",
          derivation_method: "spec_requirement_marker",
        }),
        expect.objectContaining({
          source: req1Id,
          target: ficheCompId,
          relation: "governs",
          derivation_method: "spec_section_marker_governs",
        }),
        expect.objectContaining({
          source: req1Id,
          target: fieldId,
          relation: "governs",
          derivation_method: "spec_section_marker_governs",
        }),
        expect.objectContaining({
          source: req1Id,
          target: symId,
          relation: "governs",
          derivation_method: "spec_section_marker_governs",
        }),
        expect.objectContaining({
          source: itemId,
          target: req1Id,
          relation: "tracks",
          derivation_method: "spec_section_marker_track",
        }),
        expect.objectContaining({
          source: decId,
          target: req1Id,
          relation: "decides",
          derivation_method: "spec_section_marker_decisions",
        }),
      ]),
    );

    const validation = validateProfileExtraction(result.extraction, { profile: normalizedProfile });
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it("applies .engram/spec-map.yaml entries with camelCase routerKind selector (disambiguating against another routerKind of same pattern), manifest line citations, and emits zero edges from Markdown links (Rule 3, M10)", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "3333333333333333333333333333333333333333";

    writeRepoFile(
      tmpRepo,
      "docs/spec/SPEC_EVOL_INTEGRATION_CARTE_STEVE.md",
      ["# Intégration Carte", "## Fiche lot", "Contenu historique sans frontmatter."].join("\n"),
    );
    writeRepoFile(
      tmpRepo,
      "docs/spec/decision-tracking-structure-v1.md",
      ["# Decision Tracking v1", "Historique v1."].join("\n"),
    );
    writeRepoFile(
      tmpRepo,
      "docs/spec/decision-tracking-structure-v2.md",
      ["# Decision Tracking v2", "Voir aussi [v1](decision-tracking-structure-v1.md)."].join("\n"),
    );

    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "version: 1",
        "entries:",
        '  - path: "docs/spec/SPEC_EVOL_INTEGRATION_CARTE_STEVE.md"',
        '    id: "IMMO-EVOL-CARTE-STEVE"',
        '    status: "evol"',
        "    governs:",
        '      - kind: "route"',
        '        routerKind: "hash"',
        '        pattern: "#/evaluation"',
        '      - kind: "endpoint"',
        '        method: "POST"',
        '        pathTemplate: "/api/v1/prospects/marks"',
        "    track:",
        '      - "01KTW1NZ55V6FTN3ACJSKQQNQ7"',
        '  - path: "docs/spec/decision-tracking-structure-v1.md"',
        '    id: "IMMO-DEC-TRACK-V1"',
        '    status: "superseded"',
        "    decisions:",
        '      - "01KW775RC2T3FQD76A3KNNS2FD"',
        '  - path: "docs/spec/decision-tracking-structure-v2.md"',
        '    id: "IMMO-DEC-TRACK-V2"',
        '    status: "active"',
        "    supersedes:",
        '      - "IMMO-DEC-TRACK-V1"',
      ].join("\n"),
    );

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      {
        kind: "route",
        routerKind: "hash",
        pattern: "#/evaluation",
        file: "engram.yaml",
        startLine: 10,
        endLine: 14,
      },
      {
        kind: "route",
        routerKind: "pathname",
        pattern: "#/evaluation",
        file: "engram.yaml",
        startLine: 15,
        endLine: 19,
      },
      {
        kind: "endpoint",
        method: "POST",
        pathTemplate: "/api/v1/prospects/marks",
        file: "api/src/routes/prospect-marks.synthetic-fixture.ts",
      },
      {
        kind: "track_item",
        id: "01KTW1NZ55V6FTN3ACJSKQQNQ7",
        title: "CS-L2",
      },
      {
        kind: "track_decision",
        id: "01KW775RC2T3FQD76A3KNNS2FD",
        title: "Structure de tracking stable v1",
      },
    ]);

    const result = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });

    expect(result.diagnostics).toEqual([]);

    const specSteveId = appContextNodeId(repoKey, "Spec", ["IMMO-EVOL-CARTE-STEVE"]);
    const specV1Id = appContextNodeId(repoKey, "Spec", ["IMMO-DEC-TRACK-V1"]);
    const specV2Id = appContextNodeId(repoKey, "Spec", ["IMMO-DEC-TRACK-V2"]);
    const hashRouteId = appContextNodeId(repoKey, "Route", ["hash", "#/evaluation"]);
    const pathnameRouteId = appContextNodeId(repoKey, "Route", ["pathname", "#/evaluation"]);
    const epId = appContextNodeId(repoKey, "ApiEndpoint", ["POST", "/api/v1/prospects/marks"]);
    const itemId = appContextNodeId(repoKey, "TrackItem", ["01KTW1NZ55V6FTN3ACJSKQQNQ7"]);
    const decId = appContextNodeId(repoKey, "TrackDecision", ["01KW775RC2T3FQD76A3KNNS2FD"]);

    // Must govern ONLY the `hash` route and NOT the `pathname` route of the same pattern
    expect(result.edges.some((e) => e.target === pathnameRouteId)).toBe(false);
    expect(result.nodes.some((n) => n.id === pathnameRouteId)).toBe(false);

    // Rule 3: No edges from Markdown links
    expect(result.edges.some((e) => e.relation === "cites")).toBe(false);

    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: specSteveId,
          target: hashRouteId,
          relation: "governs",
          derivation_method: "spec_map_governs",
          source_file: ".engram/spec-map.yaml",
          startLine: 3,
          endLine: 14,
        }),
        expect.objectContaining({
          source: specSteveId,
          target: epId,
          relation: "governs",
          derivation_method: "spec_map_governs",
          source_file: ".engram/spec-map.yaml",
          startLine: 3,
          endLine: 14,
        }),
        expect.objectContaining({
          source: itemId,
          target: specSteveId,
          relation: "tracks",
          derivation_method: "spec_map_track",
          source_file: ".engram/spec-map.yaml",
          startLine: 3,
          endLine: 14,
        }),
        expect.objectContaining({
          source: decId,
          target: specV1Id,
          relation: "decides",
          derivation_method: "spec_map_decisions",
          source_file: ".engram/spec-map.yaml",
          startLine: 15,
          endLine: 19,
        }),
        expect.objectContaining({
          source: specV2Id,
          target: specV1Id,
          relation: "supersedes",
          derivation_method: "spec_map_supersedes",
          source_file: ".engram/spec-map.yaml",
          startLine: 20,
          endLine: 24,
        }),
      ]),
    );

    const validation = validateProfileExtraction(result.extraction, { profile: normalizedProfile });
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it("infers zero links from prose or Markdown links and records diagnostics for unresolved or ambiguous targets", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "4444444444444444444444444444444444444444";

    writeRepoFile(
      tmpRepo,
      "docs/spec/prose-only.md",
      [
        "---",
        'id: "IMMO-PROSE-ONLY"',
        "---",
        "# Spécification narrative",
        "Ce paragraphe mentionne `prospect_marks`, `ui/src/lib/components/maps/LotFichePanel.svelte`,",
        "`POST /api/v1/prospects/marks`, `01KTW1NZ55V6FTN3ACJSKQQNQ7`, [autre](other.md#sec) et REQ-99",
        "dans le texte libre sans marqueur explicite.",
        "",
        "```yaml",
        "# Ce bloc yaml dans un fence est ignoré:",
        "requirement: REQ-IGNORED-01",
        "governs:",
        "  - kind: entity",
        "    name: prospect_marks",
        "```",
        "",
        "<!-- Un commentaire HTML ordinaire: governs: entity:prospect_marks ignoré car préfixé -->",
        "",
        "## Section avec cibles non résolues et ambiguës",
        "<!-- app-context: { governs: [{ kind: component, file: ui/src/lib/components/maps/MissingPanel.svelte }, { kind: entity, name: duplicate_table }], track: [01KTW1NZ999999999999999999] } -->",
      ].join("\n"),
    );

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      {
        kind: "entity",
        dialect: "postgres",
        schema: "public",
        name: "prospect_marks",
      },
      {
        kind: "entity",
        dialect: "postgres",
        schema: "public",
        name: "duplicate_table",
        file: "api/drizzle/0002_public.sql",
        startLine: 10,
        endLine: 15,
      },
      {
        kind: "entity",
        dialect: "postgres",
        schema: "audit",
        name: "duplicate_table",
        file: "api/drizzle/0001_audit.sql",
        startLine: 5,
        endLine: 9,
      },
    ]);

    const result = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });

    const semanticEdges = result.edges.filter((e) =>
      ["governs", "tracks", "decides", "specifies", "supersedes", "cites"].includes(e.relation),
    );
    expect(semanticEdges).toEqual([]);
    expect(result.nodes.filter((n) => n.node_type === "Requirement")).toEqual([]);

    const diagCodes = result.diagnostics.map((d) => d.code).sort();
    expect(diagCodes).toEqual(["target-ambiguous", "target-unresolved", "track-id-unresolved"]);
    for (const diag of result.diagnostics) {
      expect(diag.id).toMatch(/^diag:[0-9a-f]{32}$/);
    }

    const ambiguousDiag = result.diagnostics.find((d) => d.code === "target-ambiguous")!;
    expect(ambiguousDiag.candidates?.map((c) => c.file)).toEqual([
      "api/drizzle/0001_audit.sql",
      "api/drizzle/0002_public.sql",
    ]);
  });

  it("detects duplicate spec id across files, emits target-ambiguous (diag:<32-hex>) with sorted candidates, and emits zero edges", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "5555555555555555555555555555555555555555";

    writeRepoFile(
      tmpRepo,
      "docs/spec/z-duplicate.md",
      [
        "---",
        'id: "IMMO-DUP-SPEC"',
        'title: "Spec Z"',
        "governs:",
        "  - kind: entity",
        '    name: "prospect_marks"',
        "---",
        "# Section Z",
        "Contenu Z.",
      ].join("\n"),
    );

    writeRepoFile(
      tmpRepo,
      "docs/spec/a-duplicate.md",
      [
        "---",
        'id: "IMMO-DUP-SPEC"',
        'title: "Spec A"',
        "governs:",
        "  - kind: entity",
        '    name: "prospect_marks"',
        "---",
        "# Section A",
        "Contenu A.",
      ].join("\n"),
    );

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      {
        kind: "entity",
        dialect: "postgres",
        schema: "public",
        name: "prospect_marks",
      },
    ]);

    const result = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });

    expect(result.edges).toEqual([]);
    expect(result.relations).toEqual([]);

    expect(result.diagnostics).toHaveLength(1);
    const diag = result.diagnostics[0]!;
    expect(diag.code).toBe("target-ambiguous");
    expect(diag.id).toBe(
      appContextNodeId(repoKey, "Diagnostic", [
        "target-ambiguous",
        canonicalBytes(["Spec", "IMMO-DUP-SPEC"]),
      ]),
    );
    expect(diag.id).toMatch(/^diag:[0-9a-f]{32}$/);
    expect(diag.candidates).toEqual([
      {
        file: "docs/spec/a-duplicate.md",
        startLine: 1,
        endLine: 9,
        label: "Spec A",
      },
      {
        file: "docs/spec/z-duplicate.md",
        startLine: 1,
        endLine: 9,
        label: "Spec Z",
      },
    ]);
  });

  it("supports shorthand TargetSelectors across all 6 kinds, single-line section markers with exact citations, path-seeded Specs, and lossless AppContextRelationRecord aggregation (§3.2, M10)", async () => {
    expect(parseTargetSelector("component:ui/src/Foo.svelte#Named")).toEqual({
      kind: "component",
      file: "ui/src/Foo.svelte",
      exportName: "Named",
    });
    expect(parseTargetSelector("route:hash:#/evaluation")).toEqual({
      kind: "route",
      routerKind: "hash",
      pattern: "#/evaluation",
    });
    expect(parseTargetSelector("endpoint:POST /api/v1/prospects/marks")).toEqual({
      kind: "endpoint",
      method: "POST",
      pathTemplate: "/api/v1/prospects/marks",
    });
    expect(parseTargetSelector("entity:postgres.public.prospect_marks")).toEqual({
      kind: "entity",
      dialect: "postgres",
      schema: "public",
      name: "prospect_marks",
    });
    expect(parseTargetSelector("field:postgres.public.prospect_marks.lot_version_id")).toEqual({
      kind: "field",
      dialect: "postgres",
      schema: "public",
      entity: "prospect_marks",
      field: "lot_version_id",
    });
    expect(
      parseTargetSelector("symbol:ui/src/lib/prospect/prospect-marks-client.ts#createProspectMark"),
    ).toEqual({
      kind: "symbol",
      file: "ui/src/lib/prospect/prospect-marks-client.ts",
      symbolName: "createProspectMark",
    });

    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "6666666666666666666666666666666666666666";

    writeRepoFile(
      tmpRepo,
      "docs/spec/path-seeded.md",
      [
        "---",
        "governs:",
        '  - "entity:postgres.public.lot_versions"',
        "---",
        "# Spécification sans identifiant",
        "## Section Cible",
        '<!-- app-context: { governs: ["route:hash:#/evaluation", "endpoint:POST /api/v1/prospects/marks"] } -->',
        "Contenu de la section.",
      ].join("\n"),
    );

    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "version: 1",
        "entries:",
        '  - path: "docs/spec/path-seeded.md"',
        "    governs:",
        '      - kind: "entity"',
        '        dialect: "postgres"',
        '        schema: "public"',
        '        name: "lot_versions"',
      ].join("\n"),
    );

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      {
        kind: "entity",
        dialect: "postgres",
        schema: "public",
        name: "lot_versions",
        file: "api/drizzle/0001_lots.sql",
        startLine: 1,
        endLine: 20,
      },
      {
        kind: "route",
        routerKind: "hash",
        pattern: "#/evaluation",
        file: "engram.yaml",
      },
      {
        kind: "endpoint",
        method: "POST",
        pathTemplate: "/api/v1/prospects/marks",
        file: "api/src/routes/prospect-marks.synthetic-fixture.ts",
      },
    ]);

    const result = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });

    expect(result.diagnostics).toEqual([]);

    const pathSpecId = appContextNodeId(repoKey, "Spec", ["docs/spec/path-seeded.md"]);
    const secCibleId = appContextNodeId(repoKey, "SpecSection", [
      "docs/spec/path-seeded.md",
      "specification-sans-identifiant/section-cible",
    ]);
    const entityId = appContextNodeId(repoKey, "DataEntity", ["postgres", "public", "lot_versions"]);
    const routeId = appContextNodeId(repoKey, "Route", ["hash", "#/evaluation"]);
    const epId = appContextNodeId(repoKey, "ApiEndpoint", ["POST", "/api/v1/prospects/marks"]);

    const specNode = result.nodes.find((n) => n.id === pathSpecId);
    expect(specNode?.specId).toBe("docs/spec/path-seeded.md");

    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: secCibleId,
          target: routeId,
          relation: "governs",
          derivation_method: "spec_section_marker_governs",
          source_file: "docs/spec/path-seeded.md",
          source_location: "L7",
          startLine: 7,
          endLine: 7,
          citations: [
            expect.objectContaining({
              source_file: "docs/spec/path-seeded.md",
              line_start: 7,
              line_end: 7,
              commit,
            }),
          ],
        }),
        expect.objectContaining({
          source: secCibleId,
          target: epId,
          relation: "governs",
          derivation_method: "spec_section_marker_governs",
          source_file: "docs/spec/path-seeded.md",
          source_location: "L7",
          startLine: 7,
          endLine: 7,
          citations: [
            expect.objectContaining({
              source_file: "docs/spec/path-seeded.md",
              line_start: 7,
              line_end: 7,
              commit,
            }),
          ],
        }),
      ]),
    );

    const governsEntityRel = result.relations.find(
      (r) => r.source === pathSpecId && r.target === entityId && r.relation === "governs",
    );
    expect(governsEntityRel).toBeDefined();
    expect(governsEntityRel?.derivation_methods).toEqual([
      "spec_frontmatter_governs",
      "spec_map_governs",
    ]);
    expect(governsEntityRel?.citations).toHaveLength(2);
    expect(governsEntityRel?.citations.map((c) => c.source_file).sort()).toEqual([
      ".engram/spec-map.yaml",
      "docs/spec/path-seeded.md",
    ]);

    for (const node of result.nodes) {
      expect(node.source_file).toBeTruthy();
      expect(node.source_location).toMatch(/^L\d+(-L\d+)?$/);
      expect(Array.isArray(node.citations) && node.citations.length >= 1).toBe(true);
      expect(Array.isArray(node.evidence_refs) && node.evidence_refs.length >= 1).toBe(true);
    }

    for (const edge of result.edges) {
      const relSpec = normalizedProfile.relation_types[edge.relation];
      expect(relSpec, `relation ${edge.relation} in profile`).toBeDefined();
      expect(relSpec?.derivation_methods).toContain(edge.derivation_method);
      expect(edge.confidence).toBe("EXTRACTED");
      expect(edge.source_file).toBeTruthy();
      expect(edge.source_location).toMatch(/^L\d+(-L\d+)?$/);
      expect(Array.isArray(edge.citations) && edge.citations.length >= 1).toBe(true);
      expect(Array.isArray(edge.evidence_refs) && edge.evidence_refs.length >= 1).toBe(true);
    }

    const validation = validateProfileExtraction(result.extraction, { profile: normalizedProfile });
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it("Rule 1, M1 & R1: rejects external manifest, symlink manifest, parent-dir symlink manifest, and escaping spec paths with manifest-outside-checkout / target-unresolved diagnostics", async () => {
    const outerDir = makeTempRepo();
    const repoDir = join(outerDir, "repo");
    mkdirSync(join(repoDir, "docs", "spec"), { recursive: true });
    writeRepoFile(repoDir, "docs/spec/a.md", "# A\n");

    const repoKey = "radar-immobilier";
    const commit = "7777777777777777777777777777777777777777";
    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
    ]);

    const outsideYaml = join(outerDir, "outside.yaml");
    writeFileSync(
      outsideYaml,
      [
        "entries:",
        "  - path: docs/spec/a.md",
        "    title: HOST-ONLY-TITLE",
        "    governs: [route:hash:/x]",
      ].join("\n"),
      "utf8",
    );

    // 1. External manifest via runtime specMapPath (absolute and relative `../`) -> manifest-outside-checkout
    const resExternalAbs = await extractSpecs({
      rootDir: repoDir,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
      // @ts-expect-error specMapPath was removed from ExtractSpecsOptions (Rule 1)
      specMapPath: outsideYaml,
    });
    expect(resExternalAbs.diagnostics.map((d) => d.code)).toEqual(["manifest-outside-checkout"]);
    expect(resExternalAbs.edges.filter((e) => e.relation === "governs")).toEqual([]);
    expect(JSON.stringify(resExternalAbs)).not.toContain("HOST-ONLY-TITLE");

    const resExternalRel = await extractSpecs({
      rootDir: repoDir,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
      // @ts-expect-error specMapPath was removed from ExtractSpecsOptions (Rule 1)
      specMapPath: "../outside.yaml",
    });
    expect(resExternalRel.diagnostics.map((d) => d.code)).toEqual(["manifest-outside-checkout"]);
    expect(resExternalRel.edges.filter((e) => e.relation === "governs")).toEqual([]);
    expect(JSON.stringify(resExternalRel)).not.toContain("HOST-ONLY-TITLE");

    // 2. Symlink manifest: .engram/spec-map.yaml -> ../outside.yaml
    mkdirSync(join(repoDir, ".engram"), { recursive: true });
    symlinkSync(outsideYaml, join(repoDir, ".engram", "spec-map.yaml"));

    const resSymlinkFile = await extractSpecs({
      rootDir: repoDir,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(resSymlinkFile.diagnostics.map((d) => d.code)).toEqual(["manifest-outside-checkout"]);
    expect(resSymlinkFile.edges.filter((e) => e.relation === "governs")).toEqual([]);
    expect(JSON.stringify(resSymlinkFile)).not.toContain("HOST-ONLY-TITLE");

    // 3. Parent directory symlink: .engram -> ../outside-engram
    rmSync(join(repoDir, ".engram"), { recursive: true, force: true });
    const outsideEngramDir = join(outerDir, "outside-engram");
    mkdirSync(outsideEngramDir, { recursive: true });
    writeFileSync(join(outsideEngramDir, "spec-map.yaml"), readFileSync(outsideYaml, "utf8"), "utf8");
    symlinkSync(outsideEngramDir, join(repoDir, ".engram"));

    const resSymlinkDir = await extractSpecs({
      rootDir: repoDir,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(resSymlinkDir.diagnostics.map((d) => d.code)).toEqual(["manifest-outside-checkout"]);
    expect(resSymlinkDir.edges.filter((e) => e.relation === "governs")).toEqual([]);
    expect(JSON.stringify(resSymlinkDir)).not.toContain("HOST-ONLY-TITLE");

    // 4. Escaping Markdown paths inside a confined manifest and in specFiles (M1)
    rmSync(join(repoDir, ".engram"), { recursive: true, force: true });
    rmSync(join(repoDir, "docs", "spec", "a.md"), { force: true });
    const outsideFile = join(outerDir, "outside.md");
    writeFileSync(outsideFile, "# Outside checkout\nHOST-ONLY-TEXT\n", "utf8");
    symlinkSync(outsideFile, join(repoDir, "docs", "spec", "escape-link.md"));

    writeRepoFile(
      repoDir,
      ".engram/spec-map.yaml",
      [
        "entries:",
        "  - path: ../outside.md",
        `  - path: ${outsideFile}`,
        "  - path: docs/spec/escape-link.md",
      ].join("\n"),
    );

    const resManifestPaths = await extractSpecs({
      rootDir: repoDir,
      repoKey,
      commit,
    });
    expect(resManifestPaths.nodes).toEqual([]);
    expect(resManifestPaths.edges).toEqual([]);
    expect(JSON.stringify(resManifestPaths)).not.toContain("HOST-ONLY-TEXT");
    expect(resManifestPaths.diagnostics.map((d) => d.code)).toEqual([
      "target-unresolved",
      "target-unresolved",
      "target-unresolved",
    ]);

    rmSync(join(repoDir, ".engram"), { recursive: true, force: true });
    const resSpecFiles = await extractSpecs({
      rootDir: repoDir,
      repoKey,
      commit,
      specFiles: ["../outside.md", outsideFile, "docs/spec/escape-link.md"],
    });
    expect(resSpecFiles.nodes).toEqual([]);
    expect(resSpecFiles.edges).toEqual([]);
    expect(JSON.stringify(resSpecFiles)).not.toContain("HOST-ONLY-TEXT");
    expect(resSpecFiles.diagnostics.map((d) => d.code)).toEqual([
      "target-unresolved",
      "target-unresolved",
      "target-unresolved",
    ]);
  });

  it("M2: never fabricates Track or target data/provenance, preserves complete L3 Track projections & evidence verbatim, and requires commit", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "8888888888888888888888888888888888888888";

    writeRepoFile(
      tmpRepo,
      "docs/spec/track-ref.md",
      [
        "---",
        'id: "SPEC-M2"',
        "track:",
        '  - "ITEM-ULID-01"',
        "decisions:",
        '  - "DEC-ULID-01"',
        "---",
        "# Spec M2",
        "Texte.",
      ].join("\n"),
    );

    const incompleteTrackNode: GraphNode = {
      id: appContextNodeId(repoKey, "TrackItem", ["ITEM-ULID-01"]),
      label: "ITEM-ULID-01",
      node_type: "TrackItem",
      file_type: "document",
      track: { id: "ITEM-ULID-01" },
    };

    const resUnresolved = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes: [incompleteTrackNode],
      ...({
        knownTargets: [
          { kind: "track_item", id: "ITEM-ULID-01" },
          { kind: "track_decision", id: "DEC-ULID-01" },
        ],
      } as Record<string, unknown>),
    });

    expect(
      resUnresolved.nodes.filter((n) =>
        ["TrackItem", "TrackDecision", "TrackWorkpackage"].includes(String(n.node_type)),
      ),
    ).toEqual([]);
    expect(
      resUnresolved.edges.filter((e) => ["tracks", "decides"].includes(e.relation)),
    ).toEqual([]);
    expect(resUnresolved.diagnostics.map((d) => d.code).sort()).toEqual([
      "track-id-unresolved",
      "track-id-unresolved",
    ]);

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      {
        kind: "track_item",
        id: "ITEM-ULID-01",
        track: {
          id: "ITEM-ULID-01",
          title: "Real L3 Item",
          kind: "chore",
          workspace: "core",
          bucket: "TO-DO",
          realization: "to-do",
          acceptance: "validated",
          priority: 2,
          accountable: "antoine",
        },
        startLine: 40,
        endLine: 55,
        jsonPointer: "/3",
      },
      {
        kind: "track_decision",
        id: "DEC-ULID-01",
        track: {
          id: "DEC-ULID-01",
          title: "Real L3 Decision",
          workspace: "core",
          decisionKind: "commitment",
          realization: "done",
          outcome: "no-go",
          structured: true,
          structure: "structured",
          optionCount: 3,
          openQuestionCount: 1,
          hasRecommendation: false,
          options: [{ id: "o1", summary: "S1", title: "T1" }],
        },
        startLine: 10,
        endLine: 30,
        jsonPointer: "/2",
      },
    ]);

    const snapshotNodesBefore = structuredClone(knownNodes);
    const snapshotEvidenceBefore = structuredClone(knownEvidence);

    const resJoined = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });

    expect(resJoined.diagnostics).toEqual([]);
    const afterItem = resJoined.nodes.find((n) => n.node_type === "TrackItem");
    const afterDec = resJoined.nodes.find((n) => n.node_type === "TrackDecision");
    expect(afterItem).toEqual(snapshotNodesBefore[0]);
    expect(afterDec).toEqual(snapshotNodesBefore[1]);

    for (const expectedEv of snapshotEvidenceBefore) {
      const actualEv = resJoined.evidence.find((e) => e.id === expectedEv.id);
      expect(actualEv).toEqual(expectedEv);
    }

    await expect(
      extractSpecs({
        rootDir: tmpRepo,
        repoKey,
        commit: "",
      }),
    ).rejects.toThrow(/commit/i);
  });

  it("Rule 4 & M3: resolves section references with missing | unique | ambiguous states and exact slugPath priority, while ignoring Markdown links", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "9999999999999999999999999999999999999999";

    writeRepoFile(
      tmpRepo,
      "docs/spec/b.md",
      [
        "---",
        'id: "SPEC-B"',
        "---",
        "# Parent 1",
        "## Shared",
        "Section partagée 1.",
        "# Parent 2",
        "## Shared",
        "Section partagée 2. [lien ignoré](absent.md#does-not-exist)",
      ].join("\n"),
    );

    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "entries:",
        "  - path: docs/spec/b.md",
        "    section: does-not-exist",
        "    governs: [route:hash:/x]",
        "  - path: docs/spec/b.md",
        "    section: shared",
        "    governs: [route:hash:/x]",
        "  - path: docs/spec/b.md",
        "    section: parent-1/shared",
        "    governs: [route:hash:/x]",
      ].join("\n"),
    );

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
    ]);

    const result = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });

    // Zero cites edges from Markdown links
    expect(result.edges.filter((e) => e.relation === "cites")).toEqual([]);

    // Only the exact slugPath `parent-1/shared` emits a governs edge
    const governsEdges = result.edges.filter((e) => e.relation === "governs");
    const secParent1SharedId = appContextNodeId(repoKey, "SpecSection", ["SPEC-B", "parent-1/shared"]);
    expect(governsEdges).toHaveLength(1);
    expect(governsEdges[0]?.source).toBe(secParent1SharedId);

    const unresolvedDiags = result.diagnostics.filter((d) => d.code === "target-unresolved");
    const ambiguousDiags = result.diagnostics.filter((d) => d.code === "target-ambiguous");
    expect(unresolvedDiags).toHaveLength(1);
    expect(ambiguousDiags).toHaveLength(1);
    expect(ambiguousDiags[0]?.candidates).toEqual([
      { file: "docs/spec/b.md", startLine: 5, endLine: 6, label: "Shared" },
      { file: "docs/spec/b.md", startLine: 8, endLine: 9, label: "Shared" },
    ]);
  });

  it("M4: rejects invalid target selectors (invalid routerKind/dialect or missing required field) with diagnostics and zero edges even when plausible targets exist", async () => {
    expect(parseTargetSelector({ kind: "route", routerKind: "typo", pattern: "/x" })).toBeNull();
    expect(parseTargetSelector("route:typo:/x")).toBeNull();
    expect(parseTargetSelector({ kind: "entity", dialect: "typo", name: "prospect_marks" })).toBeNull();
    expect(
      parseTargetSelector({
        kind: "field",
        dialect: "typo",
        entity: "prospect_marks",
        field: "lot_version_id",
      }),
    ).toBeNull();
    expect(parseTargetSelector({ kind: "endpoint", method: "POST" })).toBeNull();

    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    writeRepoFile(
      tmpRepo,
      "docs/spec/invalid-selectors.md",
      [
        "---",
        'id: "SPEC-M4"',
        "governs:",
        "  - kind: route",
        "    routerKind: typo",
        '    pattern: "/x"',
        "  - kind: endpoint",
        "    method: POST",
        "---",
        "# Spec M4",
        "<!-- app-context: { governs: [{ kind: entity, dialect: oracle, name: prospect_marks }, { kind: field, dialect: oracle, entity: prospect_marks, field: lot_version_id }] } -->",
      ].join("\n"),
    );

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
      { kind: "endpoint", method: "POST", pathTemplate: "/x" },
      { kind: "entity", dialect: "postgres", schema: "public", name: "prospect_marks" },
      {
        kind: "field",
        dialect: "postgres",
        schema: "public",
        entity: "prospect_marks",
        field: "lot_version_id",
      },
    ]);

    const result = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });

    expect(result.edges.filter((e) => e.relation === "governs")).toEqual([]);
    expect(result.diagnostics.filter((d) => d.code === "target-unresolved")).toHaveLength(4);
  });

  it("Rule 4, M5 & R6: collects all Requirement declarations in pass 1 and rejects duplicate or conflicting Requirement IDs across frontmatter, section markers, and manifest with target-ambiguous and zero nodes/edges", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "entity", dialect: "postgres", schema: "public", name: "prospect_marks" },
      { kind: "route", routerKind: "hash", pattern: "/x" },
    ]);

    // 1. Two section markers declaring R1 in different sections + manifest referencing R1 (M5)
    writeRepoFile(
      tmpRepo,
      "docs/spec/a.md",
      [
        "---",
        'id: "SPEC-M5-A"',
        "---",
        "# One",
        "<!-- app-context: { requirement: { id: R1 } } -->",
        "Première déclaration de R1.",
        "# Two",
        "<!-- app-context: { requirement: { id: R1 } } -->",
        "Deuxième déclaration contradictoire de R1.",
      ].join("\n"),
    );
    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "entries:",
        "  - path: docs/spec/a.md",
        "    requirement: R1",
        "    governs:",
        "      - kind: entity",
        "        name: prospect_marks",
      ].join("\n"),
    );

    const resM5 = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });

    const reqIdA = appContextNodeId(repoKey, "Requirement", ["SPEC-M5-A", "R1"]);
    expect(resM5.nodes.find((n) => n.id === reqIdA)).toBeUndefined();
    expect(resM5.edges.filter((e) => ["specifies", "governs"].includes(e.relation))).toEqual([]);
    expect(resM5.diagnostics.map((d) => d.code)).toEqual(["target-ambiguous"]);
    expect(resM5.diagnostics[0]?.candidates).toEqual([
      { file: "docs/spec/a.md", startLine: 4, endLine: 6, label: "R1" },
      { file: "docs/spec/a.md", startLine: 7, endLine: 9, label: "R1" },
    ]);

    // 2. Two manifest entries assigning the same Requirement ID R1 to different sections One and Two (R6), in both orders
    writeRepoFile(tmpRepo, "docs/spec/a.md", ["# Doc", "## One", "Body 1", "## Two", "Body 2"].join("\n"));
    const manifestOrder1 = [
      "entries:",
      "  - path: docs/spec/a.md",
      "    section: One",
      "    requirement: { id: R1 }",
      "    governs: [route:hash:/x]",
      "  - path: docs/spec/a.md",
      "    section: Two",
      "    requirement: { id: R1 }",
      "    governs: [entity:prospect_marks]",
    ].join("\n");
    const manifestOrder2 = [
      "entries:",
      "  - path: docs/spec/a.md",
      "    section: Two",
      "    requirement: { id: R1 }",
      "    governs: [entity:prospect_marks]",
      "  - path: docs/spec/a.md",
      "    section: One",
      "    requirement: { id: R1 }",
      "    governs: [route:hash:/x]",
    ].join("\n");

    for (const manifestText of [manifestOrder1, manifestOrder2]) {
      writeRepoFile(tmpRepo, ".engram/spec-map.yaml", manifestText);
      const resR6 = await extractSpecs({
        rootDir: tmpRepo,
        repoKey,
        commit,
        knownNodes,
        knownEvidence,
      });
      expect(resR6.nodes.filter((n) => n.node_type === "Requirement")).toEqual([]);
      expect(resR6.edges.filter((e) => ["specifies", "governs"].includes(e.relation))).toEqual([]);
      expect(resR6.diagnostics.map((d) => d.code)).toEqual(["target-ambiguous"]);
      expect(resR6.diagnostics[0]?.candidates).toEqual([
        { file: "docs/spec/a.md", startLine: 2, endLine: 3, label: "R1" },
        { file: "docs/spec/a.md", startLine: 4, endLine: 5, label: "R1" },
      ]);
    }

    // 3. Duplicate requirement ID in frontmatter requirements -> target-ambiguous, zero Requirement nodes, zero edges
    rmSync(join(tmpRepo, ".engram"), { recursive: true, force: true });
    writeRepoFile(
      tmpRepo,
      "docs/spec/a.md",
      [
        "---",
        "requirements:",
        "  - id: R-DUP",
        "    section: One",
        "  - id: R-DUP",
        "    section: Two",
        "---",
        "# Doc",
        "## One",
        "Body 1",
        "## Two",
        "Body 2",
      ].join("\n"),
    );
    const resFmDup = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(resFmDup.nodes.filter((n) => n.node_type === "Requirement")).toEqual([]);
    expect(resFmDup.edges.filter((e) => e.relation === "specifies")).toEqual([]);
    expect(resFmDup.diagnostics.map((d) => d.code)).toEqual(["target-ambiguous"]);
    expect(resFmDup.diagnostics[0]?.candidates).toEqual([
      { file: "docs/spec/a.md", startLine: 9, endLine: 10, label: "R-DUP" },
      { file: "docs/spec/a.md", startLine: 11, endLine: 12, label: "R-DUP" },
    ]);
  });

  it("M6: assigns manifest-created Requirement bounds from the selected SpecSection or Spec, keeping manifest lines in citations only", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "cccccccccccccccccccccccccccccccccccccccc";

    writeRepoFile(tmpRepo, "docs/spec/a.md", "# A\n## Scope\nNormative text.");

    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "# Comment line 1",
        "version: 1",
        "entries:",
        "  - path: docs/spec/a.md",
        "    id: SPEC-M6",
        "    section: Scope",
        "    requirement: { id: R1 }",
        "    governs:",
        "      - kind: entity",
        "        name: prospect_marks",
        "  - path: docs/spec/a.md",
        "    requirement: { id: R2 }",
      ].join("\n"),
    );

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "entity", dialect: "postgres", schema: "public", name: "prospect_marks" },
    ]);

    const result = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });

    const specNode = result.nodes.find((n) => n.node_type === "Spec")!;
    const req1Node = result.nodes.find((n) => n.node_type === "Requirement" && n.reqId === "R1")!;
    const req2Node = result.nodes.find((n) => n.node_type === "Requirement" && n.reqId === "R2")!;

    expect(specNode.endLine).toBe(3);

    expect(req1Node.file).toBe("docs/spec/a.md");
    expect(req1Node.startLine).toBe(2);
    expect(req1Node.endLine).toBe(3);
    expect(sliceSpecLines(String(specNode.content), Number(req1Node.startLine), Number(req1Node.endLine))).toBe(
      "## Scope\nNormative text.",
    );
    expect(req1Node.source_file).toBe(".engram/spec-map.yaml");
    expect(req1Node.citations).toEqual([
      expect.objectContaining({
        source_file: ".engram/spec-map.yaml",
        line_start: 4,
        line_end: 10,
        commit,
      }),
    ]);

    expect(req2Node.file).toBe("docs/spec/a.md");
    expect(req2Node.startLine).toBe(1);
    expect(req2Node.endLine).toBe(3);
    expect(req2Node.citations).toEqual([
      expect.objectContaining({
        source_file: ".engram/spec-map.yaml",
        line_start: 11,
        line_end: 12,
        commit,
      }),
    ]);
  });

  it("M7 & Rule 7: computes YAML line spans from YAML AST and LineCounter independent of key order, flow style, or quoted keys", async () => {
    const manifestYaml = [
      "entries:",
      "  - id: A",
      "    path: docs/spec/a.md",
      "    governs: []",
      "  - path: docs/spec/b.md",
      "    id: B",
      "  - { id: C, path: docs/spec/c.md, governs: [{ kind: entity, name: prospect_marks }] }",
    ].join("\n");

    const parsedManifest = parseSpecMapManifest(manifestYaml);
    expect(
      parsedManifest.entries.map((e) => ({
        id: e.id,
        path: e.path,
        startLine: e.startLine,
        endLine: e.endLine,
      })),
    ).toEqual([
      { id: "A", path: "docs/spec/a.md", startLine: 2, endLine: 4 },
      { id: "B", path: "docs/spec/b.md", startLine: 5, endLine: 6 },
      { id: "C", path: "docs/spec/c.md", startLine: 7, endLine: 7 },
    ]);

    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "dddddddddddddddddddddddddddddddddddddddd";

    const specA = [
      "---",
      '"governs": [{ kind: entity, name: prospect_marks }]',
      "'supersedes': [B]",
      '"id": A',
      "---",
      "# Spec A",
    ].join("\n");

    writeRepoFile(tmpRepo, "docs/spec/a.md", specA);
    writeRepoFile(tmpRepo, "docs/spec/b.md", "# Spec B\n");
    writeRepoFile(tmpRepo, "docs/spec/c.md", "# Spec C\n");
    writeRepoFile(tmpRepo, ".engram/spec-map.yaml", manifestYaml);

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "entity", dialect: "postgres", schema: "public", name: "prospect_marks" },
    ]);

    const result = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });

    const fmGovernsEdge = result.edges.find(
      (e) => e.derivation_method === "spec_frontmatter_governs",
    )!;
    const fmSupersedesEdge = result.edges.find(
      (e) => e.derivation_method === "spec_frontmatter_supersedes",
    )!;
    const mapGovernsEdge = result.edges.find((e) => e.derivation_method === "spec_map_governs")!;

    expect(fmGovernsEdge.startLine).toBe(2);
    expect(fmGovernsEdge.endLine).toBe(2);
    expect(sliceSpecLines(specA, fmGovernsEdge.startLine!, fmGovernsEdge.endLine!)).toBe(
      '"governs": [{ kind: entity, name: prospect_marks }]',
    );

    expect(fmSupersedesEdge.startLine).toBe(3);
    expect(fmSupersedesEdge.endLine).toBe(3);
    expect(sliceSpecLines(specA, fmSupersedesEdge.startLine!, fmSupersedesEdge.endLine!)).toBe(
      "'supersedes': [B]",
    );

    expect(mapGovernsEdge.startLine).toBe(7);
    expect(mapGovernsEdge.endLine).toBe(7);
    expect(sliceSpecLines(manifestYaml, mapGovernsEdge.startLine!, mapGovernsEdge.endLine!)).toBe(
      "  - { id: C, path: docs/spec/c.md, governs: [{ kind: entity, name: prospect_marks }] }",
    );
  });

  it("Rule 5, R3 & R4: ignores markers and headings inside CommonMark backtick/tilde fences (including removed fenced ```yaml app-context) and flags fence-desynchronized headings", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

    const mdContent = [
      "# Real",
      "<!-- app-context: { governs: [component:ui/Bar.svelte#default] } -->",
      "```md",
      "## Fake backtick heading",
      "<!-- app-context: { governs: [component:ui/Foo.svelte#default] } -->",
      "```",
      "~~~md",
      "## Fake tilde heading",
      "<!-- app-context: { requirement: { id: REQ-FAKE }, governs: [component:ui/Foo.svelte#default] } -->",
      "~~~",
      "````markdown",
      "```yaml app-context",
      "governs:",
      "  - component:ui/Foo.svelte#default",
      "```",
      "## Fake 4-backtick heading",
      "````",
    ].join("\n");

    writeRepoFile(tmpRepo, "docs/spec/context.md", mdContent);

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "component", file: "ui/Foo.svelte", exportName: "default" },
      { kind: "component", file: "ui/Bar.svelte", exportName: "default" },
    ]);

    const result = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });

    expect(result.diagnostics).toEqual([]);

    const contextSections = result.nodes.filter(
      (n) => n.node_type === "SpecSection" && n.file === "docs/spec/context.md",
    );
    expect(contextSections).toHaveLength(1);
    expect(contextSections[0]).toMatchObject({
      heading: "Real",
      slugPath: "real",
      startLine: 1,
      endLine: 17,
    });

    expect(result.nodes.filter((n) => n.node_type === "Requirement")).toEqual([]);
    const governsEdges = result.edges.filter((e) => e.relation === "governs");
    const barCompId = appContextNodeId(repoKey, "Component", ["ui/Bar.svelte", "default"]);
    expect(governsEdges).toHaveLength(1);
    expect(governsEdges[0]).toMatchObject({
      source: contextSections[0]!.id,
      target: barCompId,
      derivation_method: "spec_section_marker_governs",
      startLine: 2,
      endLine: 2,
    });

    // R4.3: 4-backtick fence containing a single 3-backtick line that desynchronizes extractMarkdown
    writeRepoFile(
      tmpRepo,
      "docs/spec/desync.md",
      [
        "# Before",
        "````md",
        "```",
        "````",
        "## After",
        "<!-- app-context: { requirement: { id: R1 }, governs: [component:ui/Foo.svelte#default] } -->",
        "Body",
      ].join("\n"),
    );

    const resDesync = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      specFiles: ["docs/spec/desync.md"],
      knownNodes,
      knownEvidence,
    });

    // Must NOT attribute R1 or governs to `# Before`; must emit unsupported-construct
    expect(resDesync.nodes.filter((n) => n.node_type === "Requirement")).toEqual([]);
    expect(resDesync.edges.filter((e) => ["specifies", "governs"].includes(e.relation))).toEqual([]);
    expect(resDesync.diagnostics.some((d) => d.code === "unsupported-construct" && d.line === 5)).toBe(
      true,
    );
  });

  it("Rule 6, Rule 7 & R2: emits unsupported-construct diagnostics with exact YAML AST line numbers for invalid markers, invalid manifest fields/syntax, and malformed frontmatter without widening scope", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "1212121212121212121212121212121212121212";

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
    ]);

    // 1. Manifest with invalid `section: [Scope]` -> must emit unsupported-construct at L4 and NEVER widen to Spec --governs--> Route
    writeRepoFile(tmpRepo, "docs/spec/a.md", "# A\n## Scope\nBody\n");
    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "entries:",
        "  - path: docs/spec/a.md",
        "    governs: [route:hash:/x]",
        "    section: [Scope]",
      ].join("\n"),
    );

    const resInvalidManifestField = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(resInvalidManifestField.edges.filter((e) => e.relation === "governs")).toEqual([]);
    expect(resInvalidManifestField.diagnostics).toEqual([
      expect.objectContaining({
        code: "unsupported-construct",
        file: ".engram/spec-map.yaml",
        line: 4,
      }),
    ]);

    // 2. Manifest with malformed YAML `entries: [` -> unsupported-construct
    writeRepoFile(tmpRepo, ".engram/spec-map.yaml", "version: 1\nentries: [\n");
    const resBrokenManifest = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(resBrokenManifest.diagnostics).toEqual([
      expect.objectContaining({
        code: "unsupported-construct",
        file: ".engram/spec-map.yaml",
        line: 2,
      }),
    ]);
    rmSync(join(tmpRepo, ".engram"), { recursive: true, force: true });

    // 3. Section marker with invalid `requirement: 7`, broken YAML `governs: [`, misplaced marker after prose, and legacy `<!-- requirement: BAD -->`
    writeRepoFile(
      tmpRepo,
      "docs/spec/markers.md",
      [
        "# One",
        "<!-- app-context: { requirement: 7, governs: [route:hash:/x] } -->",
        "# Two",
        "<!-- app-context: { governs: [ } -->",
        "# Three",
        "Paragraph before marker.",
        "<!-- app-context: { governs: [route:hash:/x] } -->",
        "# Four",
        "<!-- requirement: BAD -->",
      ].join("\n"),
    );

    const resInvalidMarkers = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      specFiles: ["docs/spec/markers.md"],
      knownNodes,
      knownEvidence,
    });
    expect(resInvalidMarkers.nodes.filter((n) => n.node_type === "Requirement")).toEqual([]);
    expect(resInvalidMarkers.edges.filter((e) => ["governs", "specifies"].includes(e.relation))).toEqual(
      [],
    );
    expect(
      resInvalidMarkers.diagnostics
        .filter((d) => d.code === "unsupported-construct")
        .map((d) => d.line)
        .sort((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual([2, 4, 7, 9]);

    // 4. Malformed frontmatter envelope containing `# YAML comment` and `<!-- requirement: BAD -->` must NOT be re-parsed as Markdown
    writeRepoFile(
      tmpRepo,
      "docs/spec/bad-fm.md",
      [
        "---",
        "# YAML comment",
        "<!-- requirement: BAD -->",
        "governs: [",
        "---",
        "# Real Heading",
        "Body.",
      ].join("\n"),
    );

    const resBadFm = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      specFiles: ["docs/spec/bad-fm.md"],
      knownNodes,
      knownEvidence,
    });
    expect(resBadFm.nodes.filter((n) => n.node_type === "Requirement")).toEqual([]);
    const fmSections = resBadFm.nodes.filter((n) => n.node_type === "SpecSection");
    expect(fmSections.map((s) => s.heading)).toEqual(["Real Heading"]);
    expect(resBadFm.diagnostics).toEqual([
      expect.objectContaining({
        code: "unsupported-construct",
        file: "docs/spec/bad-fm.md",
        line: 4,
      }),
    ]);
  });

  it("M9: uses injective canonicalBytes tuple keys for diagnostics so composite selectors with dots/colons never collide", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "ffffffffffffffffffffffffffffffffffffffff";

    writeRepoFile(
      tmpRepo,
      "docs/spec/collision.md",
      [
        "---",
        'id: "SPEC-M9"',
        "governs:",
        "  - kind: entity",
        "    dialect: postgres",
        '    schema: "a.b"',
        '    name: "c"',
        "  - kind: entity",
        "    dialect: postgres",
        '    schema: "a"',
        '    name: "b.c"',
        "  - kind: entity",
        "    dialect: postgres",
        '    schema: "x.y"',
        '    name: "z"',
        "  - kind: entity",
        "    dialect: postgres",
        '    schema: "x"',
        '    name: "y.z"',
        "---",
        "# Collision Test",
      ].join("\n"),
    );

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      {
        kind: "entity",
        dialect: "postgres",
        schema: "x.y",
        name: "z",
        file: "sql/1.sql",
        startLine: 1,
        endLine: 2,
      },
      {
        kind: "entity",
        dialect: "postgres",
        schema: "x.y",
        name: "z",
        file: "sql/2.sql",
        startLine: 1,
        endLine: 2,
      },
      {
        kind: "entity",
        dialect: "postgres",
        schema: "x",
        name: "y.z",
        file: "sql/3.sql",
        startLine: 1,
        endLine: 2,
      },
      {
        kind: "entity",
        dialect: "postgres",
        schema: "x",
        name: "y.z",
        file: "sql/4.sql",
        startLine: 1,
        endLine: 2,
      },
    ]);

    const result = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });

    const unresolved = result.diagnostics.filter((d) => d.code === "target-unresolved");
    const ambiguous = result.diagnostics.filter((d) => d.code === "target-ambiguous");

    expect(unresolved).toHaveLength(2);
    expect(unresolved[0]!.id).not.toBe(unresolved[1]!.id);

    expect(ambiguous).toHaveLength(2);
    expect(ambiguous[0]!.id).not.toBe(ambiguous[1]!.id);
    expect(ambiguous.map((d) => d.candidates?.map((c) => c.file)).sort()).toEqual([
      ["sql/1.sql", "sql/2.sql"],
      ["sql/3.sql", "sql/4.sql"],
    ]);

    writeRepoFile(
      tmpRepo,
      "docs/spec/sec1.md",
      [
        "---",
        'id: "SPEC:A"',
        "---",
        "# One",
        '<!-- app-context: { requirement: { id: "B:C" } } -->',
        "# Two",
        '<!-- app-context: { requirement: { id: "B:C" } } -->',
      ].join("\n"),
    );
    writeRepoFile(
      tmpRepo,
      "docs/spec/sec2.md",
      [
        "---",
        'id: "SPEC"',
        "---",
        "# One",
        '<!-- app-context: { requirement: { id: "A:B:C" } } -->',
        "# Two",
        '<!-- app-context: { requirement: { id: "A:B:C" } } -->',
      ].join("\n"),
    );
    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "entries:",
        "  - path: docs/spec/sec1.md",
        '    section: "B:C"',
        "  - path: docs/spec/sec2.md",
        '    section: "A:B:C"',
      ].join("\n"),
    );

    const resColon = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      specFiles: ["docs/spec/sec1.md", "docs/spec/sec2.md"],
    });
    const secUnresolved = resColon.diagnostics.filter((d) => d.code === "target-unresolved");
    const reqAmbiguous = resColon.diagnostics.filter((d) => d.code === "target-ambiguous");
    expect(secUnresolved).toHaveLength(2);
    expect(secUnresolved[0]!.id).not.toBe(secUnresolved[1]!.id);
    expect(reqAmbiguous).toHaveLength(2);
    expect(reqAmbiguous[0]!.id).not.toBe(reqAmbiguous[1]!.id);
  });

  it("B1.1 (r3): rejects manifest entry where outer section is One and requirement object has section Missing (no Requirement, no edges, target-unresolved)", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
    ]);

    writeRepoFile(
      tmpRepo,
      "docs/spec/a.md",
      ["# Doc", "## One", "Body 1", "## Two", "Body 2"].join("\n"),
    );
    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "entries:",
        "  - path: docs/spec/a.md",
        "    section: One",
        "    requirement: { id: R1, section: Missing }",
        "    governs: [route:hash:/x]",
      ].join("\n"),
    );

    const res = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(res.nodes.filter((n) => n.node_type === "Requirement")).toEqual([]);
    expect(res.edges.filter((e) => ["specifies", "governs"].includes(e.relation))).toEqual([]);
    expect(res.diagnostics.map((d) => d.code)).toEqual(["target-unresolved"]);
  });

  it("B1.2 (r3): rejects manifest entry where outer section is One and requirement object has conflicting section Two (no Requirement, no edges, target-ambiguous)", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a2";

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
    ]);

    writeRepoFile(
      tmpRepo,
      "docs/spec/a.md",
      ["# Doc", "## One", "Body 1", "## Two", "Body 2"].join("\n"),
    );
    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "entries:",
        "  - path: docs/spec/a.md",
        "    section: One",
        "    requirement: { id: R1, section: Two }",
        "    governs: [route:hash:/x]",
      ].join("\n"),
    );

    const res = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(res.nodes.filter((n) => n.node_type === "Requirement")).toEqual([]);
    expect(res.edges.filter((e) => ["specifies", "governs"].includes(e.relation))).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expect(res.diagnostics[0]?.code).toBe("target-ambiguous");
    expect(res.diagnostics[0]?.candidates).toEqual([
      { file: "docs/spec/a.md", startLine: 2, endLine: 3, label: "R1" },
      { file: "docs/spec/a.md", startLine: 4, endLine: 5, label: "R1" },
    ]);
  });

  it("B1.3 (r3): rejects competing manifest Requirement declarations {id: R1, section: One} and {id: R1} in both orders with target-ambiguous and zero edges", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a3";

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
      { kind: "entity", dialect: "postgres", schema: "public", name: "prospect_marks" },
    ]);

    writeRepoFile(
      tmpRepo,
      "docs/spec/a.md",
      ["# Doc", "## One", "Body 1", "## Two", "Body 2"].join("\n"),
    );

    const orderA = [
      "entries:",
      "  - path: docs/spec/a.md",
      "    requirement: { id: R1, section: One }",
      "    governs: [route:hash:/x]",
      "  - path: docs/spec/a.md",
      "    requirement: { id: R1 }",
      "    governs: [entity:prospect_marks]",
    ].join("\n");
    const orderB = [
      "entries:",
      "  - path: docs/spec/a.md",
      "    requirement: { id: R1 }",
      "    governs: [entity:prospect_marks]",
      "  - path: docs/spec/a.md",
      "    requirement: { id: R1, section: One }",
      "    governs: [route:hash:/x]",
    ].join("\n");

    for (const manifestYaml of [orderA, orderB]) {
      writeRepoFile(tmpRepo, ".engram/spec-map.yaml", manifestYaml);
      const resCompeting = await extractSpecs({
        rootDir: tmpRepo,
        repoKey,
        commit,
        knownNodes,
        knownEvidence,
      });
      expect(resCompeting.nodes.filter((n) => n.node_type === "Requirement")).toEqual([]);
      expect(resCompeting.edges.filter((e) => ["specifies", "governs"].includes(e.relation))).toEqual([]);
      expect(resCompeting.diagnostics.map((d) => d.code)).toEqual(["target-ambiguous"]);
      expect(resCompeting.diagnostics[0]?.candidates).toEqual([
        { file: "docs/spec/a.md", startLine: 1, endLine: 5, label: "R1" },
        { file: "docs/spec/a.md", startLine: 2, endLine: 3, label: "R1" },
      ]);
    }
  });

  it("B1.4 (r3): rejects bare Requirement reference ID (requirement: MISSING) when undeclared instead of creating an implicit whole-Spec Requirement, while resolving valid forward bare ID references", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a4";

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
      { kind: "entity", dialect: "postgres", schema: "public", name: "prospect_marks" },
    ]);

    writeRepoFile(
      tmpRepo,
      "docs/spec/a.md",
      ["# Doc", "## One", "Body 1", "## Two", "Body 2"].join("\n"),
    );

    // 1. Bare ID reference `requirement: MISSING` on a document with no declaration -> target-unresolved, zero Requirement/specifies/governs
    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "entries:",
        "  - path: docs/spec/a.md",
        "    requirement: MISSING",
        "    governs: [route:hash:/x]",
      ].join("\n"),
    );
    const resBareMissing = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(resBareMissing.nodes.filter((n) => n.node_type === "Requirement")).toEqual([]);
    expect(resBareMissing.edges.filter((e) => ["specifies", "governs"].includes(e.relation))).toEqual([]);
    expect(resBareMissing.diagnostics.map((d) => d.code)).toEqual(["target-unresolved"]);

    // 2. Valid bare ID reference `requirement: R1` resolved against a declaration `{id: R1, section: One}` collected later
    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "entries:",
        "  - path: docs/spec/a.md",
        "    requirement: R1",
        "    governs: [route:hash:/x]",
        "  - path: docs/spec/a.md",
        "    requirement: { id: R1, section: One }",
        "    governs: [entity:prospect_marks]",
      ].join("\n"),
    );
    const resValidRef = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(resValidRef.diagnostics).toEqual([]);
    const reqNodes = resValidRef.nodes.filter((n) => n.node_type === "Requirement");
    expect(reqNodes).toHaveLength(1);
    expect(reqNodes[0]).toMatchObject({
      reqId: "R1",
      file: "docs/spec/a.md",
      startLine: 2,
      endLine: 3,
    });
    const governsEdges = resValidRef.edges.filter((e) => e.relation === "governs");
    expect(governsEdges).toHaveLength(2);
    expect(governsEdges.every((e) => e.source === reqNodes[0]!.id)).toBe(true);
  });

  it("B2.1 (r3): rejects target selector with unknown key typo (routerKindd: pathname) with diagnostic and zero governs edges", async () => {
    expect(
      parseTargetSelector({ kind: "route", routerKindd: "pathname", pattern: "/x" }),
    ).toBeNull();

    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b201";

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
    ]);

    writeRepoFile(
      tmpRepo,
      "docs/spec/a.md",
      [
        "---",
        "governs:",
        "  - kind: route",
        "    routerKindd: pathname",
        "    pattern: /x",
        "---",
        "# A",
      ].join("\n"),
    );
    const resTypoKey = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(resTypoKey.edges.filter((e) => e.relation === "governs")).toEqual([]);
    expect(resTypoKey.diagnostics).toEqual([
      expect.objectContaining({
        file: "docs/spec/a.md",
        line: 3,
      }),
    ]);
  });

  it("B2.2 (r3): rejects target selector with contradictory aliases (routerKind: hash and router_kind: pathname) with diagnostic and zero governs edges", async () => {
    expect(
      parseTargetSelector({
        kind: "route",
        routerKind: "hash",
        router_kind: "pathname",
        pattern: "/x",
      }),
    ).toBeNull();
    expect(
      parseTargetSelector({
        kind: "component",
        file: "ui/Foo.svelte",
        exportName: "A",
        export_name: "B",
      }),
    ).toBeNull();
    expect(
      parseTargetSelector({
        kind: "endpoint",
        method: "GET",
        pathTemplate: "/a",
        path_template: "/b",
      }),
    ).toBeNull();
    expect(
      parseTargetSelector({
        kind: "field",
        entity: "prospect_marks",
        field: "a",
        name: "b",
      }),
    ).toBeNull();
    expect(
      parseTargetSelector({
        kind: "symbol",
        file: "src/a.ts",
        symbolName: "fnA",
        symbol_name: "fnB",
      }),
    ).toBeNull();

    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b202";

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
    ]);

    writeRepoFile(
      tmpRepo,
      "docs/spec/a.md",
      [
        "---",
        "governs:",
        "  - kind: route",
        "    routerKind: hash",
        "    router_kind: pathname",
        "    pattern: /x",
        "---",
        "# A",
      ].join("\n"),
    );
    const resConflictAlias = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(resConflictAlias.edges.filter((e) => e.relation === "governs")).toEqual([]);
    expect(resConflictAlias.diagnostics).toEqual([
      expect.objectContaining({
        file: "docs/spec/a.md",
        line: 3,
      }),
    ]);
  });

  it("B2.3 (r3): rejects target selector with invalid alias alongside valid alias (routerKind: typo and router_kind: hash) with diagnostic and zero governs edges", async () => {
    expect(
      parseTargetSelector({
        kind: "route",
        routerKind: "typo",
        router_kind: "hash",
        pattern: "/x",
      }),
    ).toBeNull();
    expect(
      parseTargetSelector({
        kind: "route",
        routerKind: "hash",
        router_kind: "typo",
        pattern: "/x",
      }),
    ).toBeNull();

    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b203";

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
    ]);

    writeRepoFile(
      tmpRepo,
      "docs/spec/a.md",
      [
        "---",
        "governs:",
        "  - kind: route",
        "    routerKind: hash",
        "    router_kind: invalid_kind",
        "    pattern: /x",
        "---",
        "# A",
      ].join("\n"),
    );
    const resInvalidPlusValidAlias = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(resInvalidPlusValidAlias.edges.filter((e) => e.relation === "governs")).toEqual([]);
    expect(resInvalidPlusValidAlias.diagnostics).toEqual([
      expect.objectContaining({
        file: "docs/spec/a.md",
        line: 3,
      }),
    ]);
  });

  it("B3.1 (r3): suppresses SpecSection, Requirement, specifies, and governs from a marker before a fence when a later heading is dropped by fence desynchronization", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b301";

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
    ]);

    const desyncDoc = [
      "# Before",
      "<!-- app-context: { requirements: [{id: R1}], governs: [route:hash:/x] } -->",
      "````md",
      "```",
      "````",
      "# After",
      "Body",
    ].join("\n");

    writeRepoFile(tmpRepo, "docs/spec/a.md", desyncDoc);

    const resMarkerBefore = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    const specNode = resMarkerBefore.nodes.find((n) => n.node_type === "Spec")!;
    expect(specNode.content).toBe(desyncDoc);
    expect(resMarkerBefore.nodes.filter((n) => n.node_type === "SpecSection")).toEqual([]);
    expect(resMarkerBefore.nodes.filter((n) => n.node_type === "Requirement")).toEqual([]);
    expect(
      resMarkerBefore.edges.filter((e) => ["specifies", "governs"].includes(e.relation)),
    ).toEqual([]);
    expect(resMarkerBefore.diagnostics).toEqual([
      expect.objectContaining({
        code: "unsupported-construct",
        file: "docs/spec/a.md",
        line: 6,
      }),
    ]);
  });

  it("B3.2 (r3): suppresses manifest section/requirement bindings targeting a section before a desynchronized fence", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b302";

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
    ]);

    const desyncDoc = [
      "# Before",
      "<!-- app-context: { requirements: [{id: R1}], governs: [route:hash:/x] } -->",
      "````md",
      "```",
      "````",
      "# After",
      "Body",
    ].join("\n");

    writeRepoFile(tmpRepo, "docs/spec/a.md", desyncDoc);
    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "entries:",
        "  - path: docs/spec/a.md",
        "    section: Before",
        "    requirement: { id: R2 }",
        "    governs: [route:hash:/x]",
      ].join("\n"),
    );

    const resWithManifest = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(resWithManifest.nodes.filter((n) => n.node_type === "SpecSection")).toEqual([]);
    expect(resWithManifest.nodes.filter((n) => n.node_type === "Requirement")).toEqual([]);
    expect(
      resWithManifest.edges.filter((e) => ["specifies", "governs"].includes(e.relation)),
    ).toEqual([]);
    expect(
      resWithManifest.diagnostics.some(
        (d) => d.code === "unsupported-construct" && d.file === "docs/spec/a.md" && d.line === 6,
      ),
    ).toBe(true);
  });

  it("B4.1 (r3): emits target-ambiguous with sorted candidates and zero supersedes edges when frontmatter supersedes collides between Spec id and Spec file path", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b401";

    writeRepoFile(
      tmpRepo,
      "docs/spec/a.md",
      ["---", "id: docs/spec/b.md", "---", "# Spec A"].join("\n"),
    );
    writeRepoFile(tmpRepo, "docs/spec/b.md", ["---", "id: B", "---", "# Spec B"].join("\n"));
    writeRepoFile(
      tmpRepo,
      "docs/spec/c.md",
      ["---", "supersedes: [docs/spec/b.md]", "---", "# Spec C"].join("\n"),
    );

    const resFmCollision = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
    });
    expect(resFmCollision.edges.filter((e) => e.relation === "supersedes")).toEqual([]);
    expect(resFmCollision.diagnostics).toEqual([
      expect.objectContaining({
        code: "target-ambiguous",
        file: "docs/spec/c.md",
        line: 2,
        candidates: [
          { file: "docs/spec/a.md", startLine: 1, endLine: 4, label: "Spec A" },
          { file: "docs/spec/b.md", startLine: 1, endLine: 4, label: "Spec B" },
        ],
      }),
    ]);
  });

  it("B4.2 (r3): emits target-ambiguous with sorted candidates and zero supersedes edges when manifest supersedes collides between Spec id and Spec file path, while keeping same-node id/path alias unique", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b402";

    writeRepoFile(
      tmpRepo,
      "docs/spec/a.md",
      ["---", "id: docs/spec/b.md", "---", "# Spec A"].join("\n"),
    );
    writeRepoFile(tmpRepo, "docs/spec/b.md", ["---", "id: B", "---", "# Spec B"].join("\n"));
    writeRepoFile(tmpRepo, "docs/spec/c.md", "# Spec C\n");
    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "entries:",
        "  - path: docs/spec/c.md",
        "    supersedes: [docs/spec/b.md]",
      ].join("\n"),
    );

    const resManifestCollision = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
    });
    expect(resManifestCollision.edges.filter((e) => e.relation === "supersedes")).toEqual([]);
    expect(resManifestCollision.diagnostics).toEqual([
      expect.objectContaining({
        code: "target-ambiguous",
        file: ".engram/spec-map.yaml",
        line: 2,
        candidates: [
          { file: "docs/spec/a.md", startLine: 1, endLine: 4, label: "Spec A" },
          { file: "docs/spec/b.md", startLine: 1, endLine: 4, label: "Spec B" },
        ],
      }),
    ]);

    // Control: ID and path designate the SAME Spec node -> unique, emits supersedes edge and zero diagnostics
    rmSync(join(tmpRepo, ".engram"), { recursive: true, force: true });
    rmSync(join(tmpRepo, "docs", "spec", "a.md"), { force: true });
    writeRepoFile(
      tmpRepo,
      "docs/spec/b.md",
      ["---", "id: docs/spec/b.md", "---", "# Spec B"].join("\n"),
    );
    writeRepoFile(
      tmpRepo,
      "docs/spec/c.md",
      ["---", "supersedes: [docs/spec/b.md]", "---", "# Spec C"].join("\n"),
    );
    const resSameNode = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
    });
    expect(resSameNode.diagnostics).toEqual([]);
    const supEdges = resSameNode.edges.filter((e) => e.relation === "supersedes");
    expect(supEdges).toHaveLength(1);
    expect(supEdges[0]).toMatchObject({
      source: appContextNodeId(repoKey, "Spec", ["docs/spec/c.md"]),
      target: appContextNodeId(repoKey, "Spec", ["docs/spec/b.md"]),
      derivation_method: "spec_frontmatter_supersedes",
    });
  });

  it("M1.1 (r3): attaches .engram/spec-map.yaml citations and evidence_refs to Spec and SpecSection when manifest supplies id, title, and status", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c101";

    writeRepoFile(tmpRepo, "docs/spec/a.md", "# A\nBody");
    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "entries:",
        "  - path: docs/spec/a.md",
        "    id: MANIFEST-ID",
        "    title: MANIFEST-TITLE",
        "    status: active",
      ].join("\n"),
    );

    const resValidMeta = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
    });
    expect(resValidMeta.diagnostics).toEqual([]);
    const specNode = resValidMeta.nodes.find((n) => n.node_type === "Spec")!;
    const secNode = resValidMeta.nodes.find((n) => n.node_type === "SpecSection")!;
    expect(specNode).toMatchObject({
      specId: "MANIFEST-ID",
      title: "MANIFEST-TITLE",
      label: "MANIFEST-TITLE",
      status: "active",
      file: "docs/spec/a.md",
      startLine: 1,
      endLine: 2,
      content: "# A\nBody",
    });
    expect(secNode.status).toBe("active");

    expect(specNode.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          citation_kind: "file",
          source_file: "docs/spec/a.md",
          line_start: 1,
          line_end: 2,
          commit,
        }),
        expect.objectContaining({
          citation_kind: "file",
          source_file: ".engram/spec-map.yaml",
          line_start: 2,
          line_end: 5,
          commit,
        }),
      ]),
    );
    expect(specNode.evidence_refs?.length).toBe(2);
    expect(secNode.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          citation_kind: "file",
          source_file: "docs/spec/a.md",
          line_start: 1,
          line_end: 2,
          commit,
        }),
        expect.objectContaining({
          citation_kind: "file",
          source_file: ".engram/spec-map.yaml",
          line_start: 2,
          line_end: 5,
          commit,
        }),
      ]),
    );
    expect(secNode.evidence_refs?.length).toBe(2);
  });

  it("M1.2 (r3): does not apply manifest id, title, or status when the manifest entry has an unresolved or ambiguous section scope", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c102";

    writeRepoFile(tmpRepo, "docs/spec/a.md", "# A\nBody");
    const baseline = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
    });

    // 1. Unresolved `section: Missing`
    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "entries:",
        "  - path: docs/spec/a.md",
        "    id: MANIFEST-ID",
        "    title: MANIFEST-TITLE",
        "    status: active",
        "    section: Missing",
      ].join("\n"),
    );
    const resRejectedMissing = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
    });
    expect(resRejectedMissing.diagnostics.map((d) => d.code)).toEqual(["target-unresolved"]);
    expect(resRejectedMissing.nodes).toEqual(baseline.nodes);
    expect(resRejectedMissing.edges).toEqual(baseline.edges);
    expect(resRejectedMissing.evidence).toEqual(baseline.evidence);

    // 2. Ambiguous `section: Shared`
    writeRepoFile(tmpRepo, "docs/spec/a.md", "# Parent 1\n## Shared\nA\n# Parent 2\n## Shared\nB");
    rmSync(join(tmpRepo, ".engram"), { recursive: true, force: true });
    const baselineAmbiguous = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
    });
    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "entries:",
        "  - path: docs/spec/a.md",
        "    id: MANIFEST-ID",
        "    title: MANIFEST-TITLE",
        "    status: active",
        "    section: Shared",
      ].join("\n"),
    );
    const resRejectedAmbiguous = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
    });
    expect(resRejectedAmbiguous.diagnostics.map((d) => d.code)).toEqual(["target-ambiguous"]);
    expect(resRejectedAmbiguous.nodes).toEqual(baselineAmbiguous.nodes);
    expect(resRejectedAmbiguous.edges).toEqual(baselineAmbiguous.edges);
    expect(resRejectedAmbiguous.evidence).toEqual(baselineAmbiguous.evidence);
  });

  it("M2.1 (r3): catches unresolved YAML alias (*missing) in frontmatter as unsupported-construct diagnostic without rejecting extractSpecs", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c201";

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
    ]);

    writeRepoFile(
      tmpRepo,
      "docs/spec/valid.md",
      ["---", "id: VALID-SPEC", "governs: [route:hash:/x]", "---", "# Valid Spec"].join("\n"),
    );
    writeRepoFile(
      tmpRepo,
      "docs/spec/bad-fm-alias.md",
      ["---", "id: BAD-FM", "governs: *missing", "---", "# Bad FM"].join("\n"),
    );

    const resFmAlias = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(resFmAlias.diagnostics).toEqual([
      expect.objectContaining({
        code: "unsupported-construct",
        file: "docs/spec/bad-fm-alias.md",
        line: 3,
      }),
    ]);
    expect(resFmAlias.nodes.find((n) => n.node_type === "Spec" && n.specId === "BAD-FM")).toBeUndefined();
    expect(resFmAlias.edges.filter((e) => e.relation === "governs")).toHaveLength(1);
    expect(resFmAlias.edges.find((e) => e.relation === "governs")?.source).toBe(
      appContextNodeId(repoKey, "Spec", ["VALID-SPEC"]),
    );
  });

  it("M2.2 (r3): catches unresolved YAML alias (*missing) in section marker as unsupported-construct diagnostic without rejecting extractSpecs", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c202";

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
    ]);

    writeRepoFile(
      tmpRepo,
      "docs/spec/valid.md",
      ["---", "id: VALID-SPEC", "governs: [route:hash:/x]", "---", "# Valid Spec"].join("\n"),
    );
    writeRepoFile(
      tmpRepo,
      "docs/spec/bad-marker-alias.md",
      [
        "# Heading",
        "<!-- app-context: { requirement: { id: R-ALIAS }, governs: *missing } -->",
        "Body",
      ].join("\n"),
    );

    const resMarkerAlias = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(resMarkerAlias.diagnostics).toEqual([
      expect.objectContaining({
        code: "unsupported-construct",
        file: "docs/spec/bad-marker-alias.md",
        line: 2,
      }),
    ]);
    expect(resMarkerAlias.nodes.filter((n) => n.node_type === "Requirement")).toEqual([]);
    expect(resMarkerAlias.edges.filter((e) => e.relation === "governs")).toHaveLength(1);
  });

  it("M2.3 (r3): catches unresolved YAML alias (*missing) in manifest entry as unsupported-construct diagnostic without rejecting extractSpecs", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c203";

    const { knownNodes, knownEvidence } = buildFixtureCatalog(repoKey, commit, [
      { kind: "route", routerKind: "hash", pattern: "/x" },
    ]);

    writeRepoFile(
      tmpRepo,
      "docs/spec/valid.md",
      ["---", "id: VALID-SPEC", "governs: [route:hash:/x]", "---", "# Valid Spec"].join("\n"),
    );
    writeRepoFile(tmpRepo, "docs/spec/other.md", "# Other\nBody");
    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      [
        "entries:",
        "  - path: docs/spec/other.md",
        "    id: SHOULD-NOT-APPLY",
        "    governs: *missing",
      ].join("\n"),
    );

    const resManifestAlias = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
      knownNodes,
      knownEvidence,
    });
    expect(resManifestAlias.diagnostics).toEqual([
      expect.objectContaining({
        code: "unsupported-construct",
        file: ".engram/spec-map.yaml",
        line: 4,
      }),
    ]);
    expect(
      resManifestAlias.nodes.find((n) => n.node_type === "Spec" && n.specId === "SHOULD-NOT-APPLY"),
    ).toBeUndefined();
    expect(resManifestAlias.edges.filter((e) => e.relation === "governs")).toHaveLength(1);
  });

  it("m1.1 (r3): reports exact line 5 (not object start line 3) for invalid requirement section: 7 in frontmatter", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d101";

    writeRepoFile(
      tmpRepo,
      "docs/spec/a.md",
      [
        "---",
        "requirements:",
        "  - id: R1",
        "    statement: text",
        "    section: 7",
        "---",
        "# A",
      ].join("\n"),
    );

    const res = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
    });
    expect(res.diagnostics).toEqual([
      expect.objectContaining({
        code: "unsupported-construct",
        file: "docs/spec/a.md",
        line: 5,
      }),
    ]);
  });

  it("m1.2 (r3): reports exact line 3 (not line 1) for invalid version in .engram/spec-map.yaml", async () => {
    const tmpRepo = makeTempRepo();
    const repoKey = "radar-immobilier";
    const commit = "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d102";

    writeRepoFile(tmpRepo, "docs/spec/a.md", "# A\n");
    writeRepoFile(
      tmpRepo,
      ".engram/spec-map.yaml",
      "# comment\nentries: []\nversion: invalid\n",
    );

    const res = await extractSpecs({
      rootDir: tmpRepo,
      repoKey,
      commit,
    });
    expect(res.diagnostics).toEqual([
      expect.objectContaining({
        code: "unsupported-construct",
        file: ".engram/spec-map.yaml",
        line: 3,
      }),
    ]);
  });

  it("m2 (r3): removes unread internal fields SectionRecord.level, RequirementRecord.startLine/endLine, and ParsedSpecDocument.lines", () => {
    const srcPath = join(repoRoot, "src", "app-context", "extract-spec.ts");
    const srcText = readFileSync(srcPath, "utf8");

    const secRecBlock = /interface SectionRecord\s*\{([\s\S]*?)\}/u.exec(srcText)?.[1] ?? "";
    const reqRecBlock = /interface RequirementRecord\s*\{([\s\S]*?)\}/u.exec(srcText)?.[1] ?? "";
    const parsedDocBlock = /interface ParsedSpecDocument\s*\{([\s\S]*?)\}/u.exec(srcText)?.[1] ?? "";

    expect(secRecBlock).not.toBe("");
    expect(reqRecBlock).not.toBe("");
    expect(parsedDocBlock).not.toBe("");

    expect(secRecBlock).not.toMatch(/\blevel\s*:/u);
    expect(reqRecBlock).not.toMatch(/\bstartLine\s*:/u);
    expect(reqRecBlock).not.toMatch(/\bendLine\s*:/u);
    expect(parsedDocBlock).not.toMatch(/\blines\s*:/u);
  });
});
