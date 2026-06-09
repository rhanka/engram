/**
 * F-0819-M: .NET project file extractor + paired XML billion-laughs guard.
 *
 * Port of upstream 8bcfffd (.NET extractor) + ad3f3b2 (XML DoS guard).
 * Surfaces: src/extract.ts (extractSln, extractCsproj) + src/detect.ts
 * (CODE_EXTENSIONS update).
 *
 * Test plan:
 *  1. Fixtures: sample.sln, sample.csproj (in tests/fixtures/).
 *  2. .sln extracts: file node, project nodes, contains edges, imports edge
 *     (ProjectDependencies section).
 *  3. .csproj extracts: file node, PackageReference nodes, ProjectReference
 *     nodes, TargetFramework node, SDK node, correct edge relations.
 *  4. XML guard: billion-laughs payload (<!DOCTYPE + <!ENTITY expansion),
 *     DOCTYPE-only, ENTITY-only → all rejected with error; valid XML accepted.
 *  5. Size guard: >2 MiB input → rejected.
 *  6. dispatch table: .sln/.csproj/.fsproj/.vbproj/.props/.targets routed.
 *  7. CODE_EXTENSIONS: all six extensions present.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CODE_EXTENSIONS } from "../src/detect.js";
import { extractSln, extractCsproj, __testing } from "../src/extract.js";

const { getExtractor } = __testing;

const FIXTURES = join(new URL(".", import.meta.url).pathname, "fixtures");

// ---------------------------------------------------------------------------
// Helper: load fixture file path
// ---------------------------------------------------------------------------
function fixture(name: string): string {
  return join(FIXTURES, name);
}

// ---------------------------------------------------------------------------
// .sln extractor
// ---------------------------------------------------------------------------
describe("F-0819-M extractSln", () => {
  it("returns no error for sample.sln", () => {
    const r = extractSln(fixture("sample.sln"));
    expect(r.error).toBeUndefined();
  });

  it("extracts a file node for the .sln itself", () => {
    const r = extractSln(fixture("sample.sln"));
    expect(r.nodes.length).toBeGreaterThanOrEqual(1);
    expect(r.nodes[0]!.label).toBe("sample.sln");
  });

  it("extracts project nodes: WebApi, Domain, Tests", () => {
    const r = extractSln(fixture("sample.sln"));
    const labels = r.nodes.map((n) => n.label);
    expect(labels).toContain("WebApi");
    expect(labels).toContain("Domain");
    expect(labels).toContain("Tests");
  });

  it("emits contains edges from sln to each project", () => {
    const r = extractSln(fixture("sample.sln"));
    const containsEdges = r.edges.filter((e) => e.relation === "contains");
    expect(containsEdges.length).toBe(3);
  });

  it("emits an imports edge for ProjectDependencies section", () => {
    const r = extractSln(fixture("sample.sln"));
    const importsEdges = r.edges.filter((e) => e.relation === "imports");
    expect(importsEdges.length).toBeGreaterThanOrEqual(1);
  });

  it("returns error for a missing file", () => {
    const r = extractSln("/nonexistent/missing.sln");
    expect(r.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// .csproj extractor
// ---------------------------------------------------------------------------
describe("F-0819-M extractCsproj", () => {
  it("returns no error for sample.csproj", () => {
    const r = extractCsproj(fixture("sample.csproj"));
    expect(r.error).toBeUndefined();
  });

  it("extracts a file node for the .csproj itself", () => {
    const r = extractCsproj(fixture("sample.csproj"));
    expect(r.nodes[0]!.label).toBe("sample.csproj");
  });

  it("extracts PackageReference nodes: MediatR, FluentValidation, Swashbuckle", () => {
    const r = extractCsproj(fixture("sample.csproj"));
    const labels = r.nodes.map((n) => n.label);
    expect(labels.some((l) => l.includes("MediatR"))).toBe(true);
    expect(labels.some((l) => l.includes("FluentValidation"))).toBe(true);
    expect(labels.some((l) => l.includes("Swashbuckle"))).toBe(true);
  });

  it("extracts ProjectReference nodes: Domain.csproj, Infrastructure.csproj", () => {
    const r = extractCsproj(fixture("sample.csproj"));
    const labels = r.nodes.map((n) => n.label);
    expect(labels.some((l) => l.includes("Domain.csproj"))).toBe(true);
    expect(labels.some((l) => l.includes("Infrastructure.csproj"))).toBe(true);
  });

  it("extracts TargetFramework node: net8.0", () => {
    const r = extractCsproj(fixture("sample.csproj"));
    const labels = r.nodes.map((n) => n.label);
    expect(labels).toContain("net8.0");
  });

  it("extracts SDK node: Microsoft.NET.Sdk.Web", () => {
    const r = extractCsproj(fixture("sample.csproj"));
    const labels = r.nodes.map((n) => n.label);
    expect(labels).toContain("Microsoft.NET.Sdk.Web");
  });

  it("emits imports edges for packages and project refs (6 total)", () => {
    const r = extractCsproj(fixture("sample.csproj"));
    const importsEdges = r.edges.filter((e) => e.relation === "imports");
    expect(importsEdges.length).toBe(6);
  });

  it("emits references edges for framework and sdk", () => {
    const r = extractCsproj(fixture("sample.csproj"));
    const refEdges = r.edges.filter((e) => e.relation === "references");
    expect(refEdges.length).toBeGreaterThanOrEqual(2);
  });

  it("returns error for a missing file", () => {
    const r = extractCsproj("/nonexistent/missing.csproj");
    expect(r.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// XML billion-laughs / DoS guard (ad3f3b2)
// ---------------------------------------------------------------------------
describe("F-0819-M XML DoS guard (ad3f3b2)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "graphify-dotnet-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("rejects a DOCTYPE declaration (billion-laughs vector)", () => {
    const payload = [
      "<?xml version=\"1.0\"?>",
      "<!DOCTYPE bomb [",
      "  <!ENTITY a \"AAAA\">",
      "  <!ENTITY b \"&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;\">",
      "  <!ENTITY c \"&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;\">",
      "]>",
      "<Project Sdk=\"Microsoft.NET.Sdk\">",
      "  <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>",
      "</Project>",
    ].join("\n");
    const p = join(dir, "bomb.csproj");
    writeFileSync(p, payload, "utf-8");
    const r = extractCsproj(p);
    expect(r.error).toBeDefined();
    expect(r.error).toMatch(/DOCTYPE|ENTITY|refusing/i);
  });

  it("rejects an ENTITY-only declaration (no DOCTYPE wrapper)", () => {
    const payload = [
      "<?xml version=\"1.0\"?>",
      "<!-- <!ENTITY lol \"lol\"> -->",
      "<Project><!ENTITY lol \"lol\"><PropertyGroup/></Project>",
    ].join("\n");
    const p = join(dir, "entity-only.csproj");
    writeFileSync(p, payload, "utf-8");
    const r = extractCsproj(p);
    expect(r.error).toBeDefined();
  });

  it("rejects input larger than 2 MiB", () => {
    const p = join(dir, "huge.csproj");
    // Write a valid XML header + padding to exceed 2 MiB
    const header = "<Project><PropertyGroup/></Project>";
    const padding = "x".repeat(2 * 1024 * 1024 + 1 - header.length);
    writeFileSync(p, header + padding, "utf-8");
    // Pad bytes exceed the limit; wrap in a valid XML comment so it fails only on size
    const p2 = join(dir, "huge2.csproj");
    writeFileSync(p2, Buffer.alloc(2 * 1024 * 1024 + 1, 0x20)); // 2MiB+1 of spaces
    const r = extractCsproj(p2);
    expect(r.error).toBeDefined();
    expect(r.error).toMatch(/too large/i);
  });

  it("accepts valid XML without DOCTYPE/ENTITY", () => {
    const payload = [
      "<Project Sdk=\"Microsoft.NET.Sdk\">",
      "  <PropertyGroup>",
      "    <TargetFramework>net8.0</TargetFramework>",
      "  </PropertyGroup>",
      "</Project>",
    ].join("\n");
    const p = join(dir, "valid.csproj");
    writeFileSync(p, payload, "utf-8");
    const r = extractCsproj(p);
    expect(r.error).toBeUndefined();
    expect(r.nodes.some((n) => n.label === "net8.0")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------
describe("F-0819-M dispatch table", () => {
  it.each([".sln", ".csproj", ".fsproj", ".vbproj", ".props", ".targets"])(
    "routes %s to a .NET extractor",
    (ext) => {
      const fn = getExtractor(`foo${ext}`);
      expect(fn).toBeDefined();
    },
  );
});

// ---------------------------------------------------------------------------
// CODE_EXTENSIONS
// ---------------------------------------------------------------------------
describe("F-0819-M CODE_EXTENSIONS", () => {
  it.each([".sln", ".csproj", ".fsproj", ".vbproj", ".props", ".targets"])(
    "contains %s",
    (ext) => {
      expect(CODE_EXTENSIONS.has(ext)).toBe(true);
    },
  );
});
