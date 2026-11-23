/// <reference types="node" />

/**
 * Bridge between graphify's TextJsonGenerationClient contract and a routed
 * @sentropic/llm-mesh runtime. The host supplies routing identity, planner,
 * adapters, and auth; graphify only executes the resulting capabilities.
 */

import {
  createDefaultProviderAdapters,
  createLlmMesh,
  normalizeProviderError,
  StaticProviderRegistry,
} from "@sentropic/llm-mesh";

import {
  createGraphifyMeshCore,
  type CreateGraphifyMeshOptions,
  type GraphifyMesh,
  type GraphifyMeshResponseValidator,
  type MeshTextJsonClientOptions,
} from "./llm-mesh-core.js";
import {
  getMeshErrorAttempts,
  isRoutePlanError,
  isSeatAcquisitionError,
  type MeshAttemptCall,
} from "./llm-mesh-errors.js";

const {
  classifyRouteFailure,
  createGraphifyMesh,
  meshTextJsonClient,
} = createGraphifyMeshCore({
  createDefaultProviderAdapters,
  createLlmMesh,
  normalizeProviderError,
  StaticProviderRegistry,
});

export {
  classifyRouteFailure,
  createGraphifyMesh,
  getMeshErrorAttempts,
  isRoutePlanError,
  isSeatAcquisitionError,
  meshTextJsonClient,
};
export type {
  CreateGraphifyMeshOptions,
  GraphifyMesh,
  GraphifyMeshResponseValidator,
  MeshAttemptCall,
  MeshTextJsonClientOptions,
};
