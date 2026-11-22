import assert from "node:assert/strict";
import crypto, { type BinaryLike } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import manifest from "../../registry/entries.v1.json";
import { isExactVersion } from "../../src/ontology-guardian/admission.js";
import * as diagrams from "../../src/ontology-guardian/diagram-registry.js";
import { OPENERP_PROFILE_V1 } from "../../src/ontology-guardian/openerp-profile.js";
import * as openerp from "../../src/ontology-guardian/openerp-registry.js";
import type { OntologyRecord } from "../../src/ontology-guardian/types.js";
import { ARCHI_V1, ARCHI_V1_PIN } from "../../src/ontology-guardian/archi-profile.js";
import { contentDiagramDigest } from "../../src/ontology-guardian/digests.js";
import { ARCHIMATE_V1_DECLARATION, ARCHIMATE_V1_PIN, GENERIC_V1_DECLARATION, GENERIC_V1_PIN } from "../../src/ontology-guardian/diagram-skeletons.js";
import { UML_V1_DECLARATION, UML_V1_PIN } from "../../src/ontology-guardian/diagram-skeletons.js";
import { bindOntologyProfile, loadOntologyProfile, normalizeOntologyProfile } from "../../src/ontology-profile.js";
import { bundleProfile } from "../../src/profile-bundle.js";
import type { NormalizedProjectConfig } from "../../src/types.js";

const [scratch, side] = process.argv.slice(2) as [string, string];
const openerpPath = join(scratch, "openerp.json");
if (side === "baseline") writeFileSync(openerpPath, JSON.stringify(OPENERP_PROFILE_V1));
else assert.deepEqual(OPENERP_PROFILE_V1, JSON.parse(readFileSync(openerpPath, "utf8")));
// Record the bytes consumed by SHA-256 without reproducing profile canonicalization.
const captured: Buffer[][] = [];
const createHash = crypto.createHash;
crypto.createHash = (algorithm, options) => {
  const hash = createHash(algorithm, options);
  if (algorithm !== "sha256") return hash;
  const chunks: Buffer[] = [];
  captured.push(chunks);
  const update = hash.update.bind(hash);
  hash.update = (data: BinaryLike, encoding: BufferEncoding = "utf8") => {
    chunks.push(typeof data === "string" ? Buffer.from(data, encoding)
      : Buffer.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
    return typeof data === "string" ? update(data, encoding) : update(data);
  };
  return hash;
};
syncBuiltinESMExports();
const inputs = [["openerp", openerpPath], ["engram", join(scratch, "baseline/profiles/app-context/v1/profile.yaml")]] as const;
const receipts = Object.fromEntries(inputs.map(([namespace, path]) => {
  captured.length = 0;
  const loaded = loadOntologyProfile(path);
  assert.equal(captured.length, 1, `Expected one loader SHA-256 for ${loaded.id}`);
  const bound = bindOntologyProfile(loaded, {} as NormalizedProjectConfig);
  const bytes = Buffer.concat(captured[0]!).toString("base64");
  const bundled = bundleProfile(readFileSync(path, "utf8"));
  assert(bundled.ok, JSON.stringify(bundled));
  const { digest: bundleDigest, extensions, profileHash, profile: { profile_hash } } = bundled.bundle;
  const bundleOutcome = { bundleDigest, extensions, warnings: bundled.warnings };
  return [`${namespace}/${loaded.id}@${loaded.version}`, { bytes, profileHash: loaded.profile_hash, boundHash: bound.profile_hash, bundleHashes: [profileHash, profile_hash], bundleOutcome }] as const;
}));
const withModule = structuredClone(OPENERP_PROFILE_V1);
withModule.node_types!.organizations = { linking: { normalize: { fn: "./normalizer.mjs#normalize" } } };
const refusal = bundleProfile(withModule);
// Keep loader receipts available when app-context rejects a changed digest at import time.
const [appContext] = await Promise.allSettled([import("../../src/ontology-guardian/app-context-registry.js")]);
const records = [appContext.status === "fulfilled" ? appContext.value : {}, diagrams, openerp]
  .flatMap(Object.entries).filter(([name]) => name.startsWith("RECORD_")).map(([, record]) => record as OntologyRecord);
const entries = manifest.entries.filter(({ kind }) => kind === "ontology").map(({ id, ontology }) => {
  assert(ontology?.profilePin, `Missing profile pin for ${id}`);
  return { ...ontology, ...ontology.profilePin };
});
const census = new Map<string, { pin: { profileShape: string; lifecycle: string; digest: string }; sources: string[] }>();
for (const [source, rows] of [["manifest", entries], ["records", records]] as const) {
  for (const row of rows) {
    if (!/^(engram|diagram)-profile$/.test(row.profileShape)) continue;
    assert(isExactVersion(row.version), `Invalid exact version for ${row.namespace}/${row.id}: ${row.version}`);
    if (!/^1(?:[.+-]|$)/.test(row.version)) continue;
    const key = `${row.namespace}/${row.id}@${row.version}`;
    const prior = census.get(key);
    assert(!prior?.sources.includes(source), `Repeated ${source} row ${key}`);
    const digest = "profileRef" in row ? row.profileRef.contentDigest : row.contentDigest;
    assert.match(digest, /^[0-9a-f]{64}$/, key);
    assert.equal(row.digests?.contentDigest, digest, key);
    const pin = { profileShape: row.profileShape, lifecycle: row.lifecycle, digest };
    assert.deepEqual(prior?.pin ?? pin, pin, key);
    census.set(key, { pin, sources: [...(prior?.sources ?? []), source] });
  }
}
const nativeInputs = [["diagram/generic@1.0.0", GENERIC_V1_DECLARATION, GENERIC_V1_PIN],
  ["diagram/archimate@1.0.0", ARCHIMATE_V1_DECLARATION, ARCHIMATE_V1_PIN], ["diagram/uml@1.0.0", UML_V1_DECLARATION, UML_V1_PIN],
  ["diagram/archi@1.0.0", ARCHI_V1.declaration, ARCHI_V1_PIN]] as const;
const toProjection = (d: Record<string, unknown>) => ({ profile: d["id"] as string, completeness: d["completeness"] as "skeleton" | "complete", entityTypes: d["entityTypes"] as readonly unknown[], portTypes: d["portTypes"] as readonly unknown[], relationTypes: d["relationTypes"] as readonly unknown[], constraints: d["constraints"] as readonly unknown[], limits: d["limits"] as { maxEntities?: number | null; maxRelations?: number | null; maxEndpointsPerRelation?: number | null } });
const nativeReceipts = Object.fromEntries(nativeInputs.map(([key, declaration, pin]) => {
  const projection = toProjection(declaration as Record<string, unknown>);
  captured.length = 0;
  const digest = contentDiagramDigest(projection);
  assert.equal(captured.length, 1, `Expected one diagram SHA-256 for ${key}`);
  assert.equal(digest, pin.contentDigest, `Native digest for ${key}`);
  return [key, { bytes: Buffer.concat(captured[0]!).toString("base64"), digest }] as const;
}));
const injected = structuredClone(OPENERP_PROFILE_V1);
for (const node of Object.values(injected.node_types ?? {})) (node as Record<string, unknown>)["attributes"] = [];
const rev = <T>(v: T): T => (Array.isArray(v) ? v.map(rev) : (v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, rev(x)])) : v)) as T;
const reordered = rev(structuredClone(OPENERP_PROFILE_V1));
const renumbered = { ...structuredClone(OPENERP_PROFILE_V1), version: 1 };
const once = normalizeOntologyProfile(OPENERP_PROFILE_V1);
const control = { ...structuredClone(OPENERP_PROFILE_V1), version: "1", node_types: { ControlNode: { registry: "control_reg", linking: { normalize: { builtin: ["case_fold"] } }, description: "historical opaque field" } }, relation_types: {}, registries: { control_reg: { source: "control_src", id_column: "id", label_column: "label", alias_columns: [], node_type: "ControlNode" } } };
const controlOnce = normalizeOntologyProfile(control);
const controlBound = bindOntologyProfile(controlOnce, { inputs: { registrySources: { control_src: openerpPath } } } as unknown as NormalizedProjectConfig);
const bundleBound = bundleProfile(JSON.parse(JSON.stringify(controlBound)));
const bundleRenumbered = bundleProfile(renumbered);
if (!bundleBound.ok || !bundleRenumbered.ok) throw new Error("control bundle refused");
const controls: Record<string, boolean> = { attributesEmptyTrips: normalizeOntologyProfile(injected).profile_hash !== once.profile_hash, keyOrderStable: normalizeOntologyProfile(reordered).profile_hash === once.profile_hash, numericVersionStable: normalizeOntologyProfile(renumbered).profile_hash === once.profile_hash,
  renormalizeStable: normalizeOntologyProfile(JSON.parse(JSON.stringify(once))).profile_hash === once.profile_hash, bindStable: controlBound.profile_hash === controlOnce.profile_hash, bundleBoundStable: bundleBound.bundle.profileHash === controlBound.profile_hash, bundleRenumberedStable: bundleRenumbered.bundle.profileHash === once.profile_hash,
  bundleExtensionsEmpty: Object.keys(bundleBound.bundle.extensions).length === 0 };
const controlDigests = { reordered: normalizeOntologyProfile(reordered).profile_hash, renumbered: normalizeOntologyProfile(renumbered).profile_hash, controlNormalize: controlOnce.profile_hash, controlBind: controlBound.profile_hash, bundleBound: bundleBound.bundle.profileHash, bundleBoundDigest: bundleBound.bundle.digest, bundleRenumbered: bundleRenumbered.bundle.profileHash };
const ownerReceipts: Record<string, { digest?: unknown; equal?: unknown }> = (() => { try { return JSON.parse(readFileSync(join(scratch, "owner-receipts.json"), "utf8")); } catch { return {}; } })();
const nonPublic = new Set(([...entries, ...records] as { visibility?: unknown; namespace?: unknown; id?: unknown; version?: unknown; profileShape?: unknown }[]).filter((row) => /^(engram|diagram)-profile$/.test(String(row.profileShape ?? "")) && /^1(?:[.+-]|$)/.test(String(row.version ?? "")) && row.visibility !== "public").map((row) => `${String(row.namespace)}/${String(row.id)}@${String(row.version)}`));
const ownerCovered = [...census.keys()].filter((key) => nonPublic.has(key) && ownerReceipts[key]?.equal === true && ownerReceipts[key]?.digest === census.get(key)!.pin.digest);
for (const key of ownerCovered) { delete (receipts as Record<string, unknown>)[key]; delete (nativeReceipts as Record<string, unknown>)[key]; }
const privateUncovered: string[] = [];
for (const [, rows] of [["manifest", entries], ["records", records]] as const)
  for (const row of rows as { visibility?: unknown; namespace?: unknown; id?: unknown; version?: unknown; profileShape?: unknown }[]) {
    if (!/^(engram|diagram)-profile$/.test(String(row.profileShape ?? "")) || !/^1(?:[.+-]|$)/.test(String(row.version ?? ""))) continue;
    const key = `${String(row.namespace)}/${String(row.id)}@${String(row.version)}`;
    if (census.has(key) && row.visibility !== "public" && !ownerCovered.includes(key) && !privateUncovered.includes(key)) privateUncovered.push(key);
  }
const censusError = appContext.status === "rejected" ? String(appContext.reason) : undefined;
const report = { census: Object.fromEntries(census), censusError, receipts, nativeReceipts, controls, controlDigests, ownerCovered, privateUncovered, refusal };
export type ReplayReport = typeof report;
console.log(JSON.stringify(report));
