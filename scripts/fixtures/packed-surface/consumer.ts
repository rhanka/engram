import {
  classifyRouteFailure,
  createGraphifyMesh,
  meshTextJsonClient,
  textClientToCallLlm,
} from "@sentropic/engram/llm-mesh";
import type {
  CreateGraphifyMeshOptions,
  MeshTextJsonClientOptions,
} from "@sentropic/engram/llm-mesh";

const values: readonly Function[] = [
  classifyRouteFailure,
  createGraphifyMesh,
  meshTextJsonClient,
  textClientToCallLlm,
];
const createOptions = {} as CreateGraphifyMeshOptions;
const clientOptions = {} as MeshTextJsonClientOptions;

void values;
void createOptions;
void clientOptions;
