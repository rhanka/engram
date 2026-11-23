import { readFileSync } from "node:fs";
import {
  classifyRouteFailure,
  createGraphifyMesh,
  meshTextJsonClient,
  textClientToCallLlm,
} from "@sentropic/engram/llm-mesh";
import {
  createEngramSessionIngestFront,
  deriveSessionFrontIdempotencyKey,
  isValidWorktreeId,
  validateRawSessionEventEnvelope,
  validateSessionExtractionProposalBatch,
} from "@sentropic/engram/session-front-contracts";

for (const [name, value] of Object.entries({
  classifyRouteFailure,
  createGraphifyMesh,
  meshTextJsonClient,
  textClientToCallLlm,
})) {
  if (typeof value !== "function") {
    throw new Error(`Missing ESM mesh export: ${name}`);
  }
}

if (typeof createEngramSessionIngestFront !== "function") {
  throw new Error("Missing ESM session-front-contracts export: createEngramSessionIngestFront");
}
for (const [name, value] of Object.entries({
  deriveSessionFrontIdempotencyKey,
  isValidWorktreeId,
  validateRawSessionEventEnvelope,
  validateSessionExtractionProposalBatch,
})) {
  if (typeof value !== "function") {
    throw new Error(`Missing ESM session-front-contracts export: ${name}`);
  }
}

const key = deriveSessionFrontIdempotencyKey({ sourceKind: "entry", sourceId: "session/entry/7" });
if (key !== "idem:v1:49a77900f4dc7c91cf7bd0f0b4076e6f3e9583d8d2efccc8d8337ff7b9df3d68") {
  throw new Error("session-front-contracts idempotency derivation differs from the installed contract");
}

console.log("ESM mesh runtime exports verified");
console.log("ESM session-front-contracts runtime exports verified");

const installedRoot = new URL("../node_modules/@sentropic/engram/", import.meta.url);
const installedManifest = JSON.parse(readFileSync(new URL("package.json", installedRoot), "utf8"));
if (installedManifest.dependencies && "@sentropic/llm-mesh" in installedManifest.dependencies) {
  throw new Error("Installed @sentropic/engram must not declare @sentropic/llm-mesh in dependencies");
}
if (installedManifest.peerDependencies?.["@sentropic/llm-mesh"] !== ">=0.38.0 <0.40.0") {
  throw new Error(
    `Installed @sentropic/engram peerDependencies["@sentropic/llm-mesh"] drifted: ${String(installedManifest.peerDependencies?.["@sentropic/llm-mesh"])}`,
  );
}
if (installedManifest.peerDependenciesMeta?.["@sentropic/llm-mesh"]?.optional !== true) {
  throw new Error("Installed @sentropic/engram must mark @sentropic/llm-mesh as an optional peer");
}
const declaration = readFileSync(new URL("dist/session-front-contracts.d.ts", installedRoot), "utf8");
for (const name of [
  "createEngramSessionIngestFront",
  "EngramSessionIngestFrontPort",
  "EngramSessionIngestFrontOptionsV1",
  "validateRawSessionEventEnvelope",
  "validateSessionExtractionProposalBatch",
  "RawSessionEventEnvelope",
  "RawSessionEventReceipt",
  "SessionExtractionProposalBatch",
  "SessionExtractionReceipt",
]) {
  if (!declaration.includes(name)) {
    throw new Error(`Installed session-front-contracts declarations miss ${name}`);
  }
}
if (declaration.includes("$1")) {
  throw new Error("Installed session-front-contracts declarations carry $1 alias drift");
}

console.log("session-front-contracts declarations verified");
