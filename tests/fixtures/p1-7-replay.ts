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
import { loadOntologyProfile } from "../../src/ontology-profile.js";
import { bundleProfile } from "../../src/profile-bundle.js";

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
  const bytes = Buffer.concat(captured[0]!).toString("base64");
  const bundled = bundleProfile(readFileSync(path, "utf8"));
  assert(bundled.ok, JSON.stringify(bundled));
  const { digest: bundleDigest, extensions, profileHash, profile: { profile_hash } } = bundled.bundle;
  const bundleOutcome = { bundleDigest, extensions, warnings: bundled.warnings };
  return [`${namespace}/${loaded.id}@${loaded.version}`, { bytes, profileHash: loaded.profile_hash, bundleHashes: [profileHash, profile_hash], bundleOutcome }] as const;
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
const censusError = appContext.status === "rejected" ? String(appContext.reason) : undefined;
const report = { census: Object.fromEntries(census), censusError, receipts, refusal };
export type ReplayReport = typeof report;
console.log(JSON.stringify(report));
