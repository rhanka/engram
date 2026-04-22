import { describe, expect, it } from "vitest";
import { join } from "node:path";

import { loadOntologyProfile } from "../src/ontology-profile.js";
import { loadProjectConfig } from "../src/project-config.js";
import { loadProfileRegistries } from "../src/profile-registry.js";
import {
  buildProfileChunkPrompt,
  buildProfileExtractionPrompt,
  buildProfileValidationPrompt,
} from "../src/profile-prompts.js";
import type { Extraction } from "../src/types.js";

const fixtureRoot = join(process.cwd(), "tests", "fixtures", "profile-demo");

function promptState() {
  const projectConfig = loadProjectConfig(join(fixtureRoot, "graphify.yaml"));
  const profile = loadOntologyProfile(projectConfig.profile.resolvedPath, { projectConfig });
  const registries = loadProfileRegistries(profile);
  return { profile, projectConfig, registries };
}

describe("profile prompt builder", () => {
  it("builds a deterministic extraction prompt with profile constraints", () => {
    const prompt = buildProfileExtractionPrompt(promptState(), {
      maxRegistrySamplesPerRegistry: 1,
    });

    expect(prompt).toContain("Allowed node types");
    expect(prompt).toContain("MaintenanceProcess");
    expect(prompt).toContain("Allowed relation types");
    expect(prompt).toContain("requires_tool");
    expect(prompt).toContain("Registry matching rules");
    expect(prompt).toContain("components: 2 records");
    expect(prompt).toContain("Demo Filter Cartridge");
    expect(prompt).not.toContain("Demo Pressure Seal");
    expect(prompt).toContain("Citation policy");
    expect(prompt).toContain("minimum_granularity: page");
    expect(prompt).toContain("Status and hardening rules");
    expect(prompt).toContain("candidate, attached, needs_review, validated, rejected, superseded");
    expect(prompt).toContain("Configured input hints");
    expect(prompt).toContain("raw/manuals");
    expect(prompt).toContain("JSON Extraction output schema");
    expect(prompt).toContain("Do not invent customer, partner, project, proprietary ontology, or private domain content");
  });

  it("adds chunk-specific document and image guidance", () => {
    const state = promptState();
    const documentPrompt = buildProfileChunkPrompt(state, {
      filePath: "raw/manuals/manual.md",
      fileType: "document",
      text: "Synthetic document text.",
    });
    const imagePrompt = buildProfileChunkPrompt(state, {
      filePath: "derived/extracted-images/diagram.png",
      fileType: "image",
      text: "Synthetic image description.",
    });

    expect(documentPrompt).toContain("Chunk type: document");
    expect(documentPrompt).toContain("Document guidance");
    expect(documentPrompt).toContain("extract procedures, processes, components, tools, and cited evidence");
    expect(imagePrompt).toContain("Chunk type: image");
    expect(imagePrompt).toContain("Image guidance");
    expect(imagePrompt).toContain("extract depicted figures and visual evidence only when visible");
  });

  it("builds a validation prompt around the profile-aware validation rules", () => {
    const extraction: Extraction = {
      nodes: [{ id: "a", label: "A", file_type: "document", source_file: "manual.md" }],
      edges: [],
      hyperedges: [],
      input_tokens: 0,
      output_tokens: 0,
    };

    const prompt = buildProfileValidationPrompt(promptState(), extraction);

    expect(prompt).toContain("Validate this Graphify Extraction against the ontology dataprep profile");
    expect(prompt).toContain("First apply the base Graphify Extraction schema");
    expect(prompt).toContain("Then apply profile-aware node_type, relation, citation, status, and registry rules");
    expect(prompt).toContain("\"nodes\"");
    expect(prompt).toContain("\"edges\"");
  });
});
