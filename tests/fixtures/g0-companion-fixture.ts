import entries from "../../registry/entries.v1.json";
import { DATA_GOVERNANCE_FORMAT, sealModelGovernance, type QualifiedPin } from "../../src/model-governance.js";
import { DATA_GOVERNANCE_ASSET_ROLE } from "../../src/ontology-guardian/companion-publication.js";
import { pinsDigestOf } from "../../src/ontology-guardian/digests.js";
import type { Pin, TenantVisibility } from "../../src/ontology-guardian/types.js";
import { normalizeOntologyProfile, parseOntologyProfile } from "../../src/ontology-profile.js";
import example from "./g0-openerp-users-model.json";
import gov2 from "./g0-users-governance-v2.json";

export const baseN = (): any => structuredClone(example);
export const baseG2 = (): any => structuredClone(gov2);
const N_DIGEST = "21684a38e6c3979937f53a286b275971f3ccda431c299078c0e8715a9240e50e";
const ASSET_PATH = "governance/users-governance-v2.json";
const N_PIN: Pin = { id: "openerp-users-example", version: "2", contentDigest: N_DIGEST };
export const N_QPIN: QualifiedPin = { namespace: "example", pin: N_PIN };
const DIGESTS = {
  contentDigest: N_DIGEST, pinsDigest: pinsDigestOf({ layers: [N_PIN] }),
  resultEvidence: { evidenceState: "resolved" as const, digest: N_DIGEST },
};
const BASE_ENV = entries.entries.find((e) => e.kind === "ontology") as any;
const ONT = BASE_ENV.ontology; const normN = normalizeOntologyProfile(parseOntologyProfile(baseN()));
export const s2 = sealModelGovernance(normN, gov2);
export function sealG(edit: (g: any) => void, profile = normN) {
  const g = baseG2(); edit(g); return sealModelGovernance(profile, g);
}
const nRec = (visibility: TenantVisibility) => ({
  namespace: "example", id: N_PIN.id, version: N_PIN.version, owner: "engram", lifecycle: "published" as const,
  completeness: "complete" as const, visibility, profileShape: "engram-profile" as const,
  artifactKind: "profile" as const, corpusRef: ONT.corpusRef, digests: DIGESTS, lineage: ONT.lineage, consumers: [],
  profileRef: { canonicalRef: "example:openerp-users-example@2", contentDigest: N_DIGEST },
});
function mkEnv(vis: TenantVisibility, gPin: QualifiedPin) {
  const pub = vis === "public";
  const bind = { artifactKind: "profile" as const, profilePin: N_PIN, stack: [N_PIN] };
  return {
    ...structuredClone(BASE_ENV), id: `engram.${gPin.pin.id}`, name: `${gPin.pin.id}@${gPin.pin.version}`,
    entryVersion: gPin.pin.version,
    assets: pub ? [{ role: DATA_GOVERNANCE_ASSET_ROLE, path: ASSET_PATH,
      mediaType: "application/json", sha256: gPin.pin.contentDigest }] : [],
    extensions: { [DATA_GOVERNANCE_FORMAT]: structuredClone(gPin) }, requiredExtensions: [DATA_GOVERNANCE_FORMAT],
    ontology: {
      ...structuredClone(ONT), canonicalRef: `example:${N_PIN.id}@${N_PIN.version}`, namespace: "example",
      profilePin: N_PIN, stack: [N_PIN], digests: DIGESTS, lifecycle: "published", visibility: vis,
      artifactBinding: pub ? bind : { ...bind, relationMatrixRef: "owner:relation-matrix/2" },
    },
  };
}
export const pubInput = () => ({
  envelope: mkEnv("public", s2.pin), profileRecord: nRec("public"), assets: { [ASSET_PATH]: s2.bytes }, profile: normN,
});
export function privInput(nVis: TenantVisibility, cVis: TenantVisibility, gPin = s2.pin) {
  const tenant = cVis.slice(8), receiptRef = `receipt:${tenant}:${gPin.pin.id}@${gPin.pin.version}`;
  const tenantReceipt = { tenant, receiptRef, profilePin: N_QPIN, governancePin: gPin, verdict: "pass" as const };
  return { envelope: mkEnv(cVis, gPin), profileRecord: nRec(nVis), tenantReceipt };
}
