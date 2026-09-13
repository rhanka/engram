import {
  createGraphifyMesh,
  meshTextJsonClient,
} from "@sentropic/graphify/llm-mesh";

if (typeof createGraphifyMesh !== "function") {
  throw new Error("Missing ESM mesh export: createGraphifyMesh");
}
if (typeof meshTextJsonClient !== "function") {
  throw new Error("Missing ESM mesh export: meshTextJsonClient");
}

console.log("ESM mesh runtime exports verified");
