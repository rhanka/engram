import { createHash } from "node:crypto"; import { expect, it } from "vitest";
import { sealModelGovernance, validateModelGovernance } from "../src/model-governance.js";
import { stableForHash } from "../src/ontology-guardian/digests.js";
import { normalizeOntologyProfile, parseOntologyProfile } from "../src/ontology-profile.js";
import type { ColumnGovernance, PiiCategory, SealedModelGovernance } from "../src/profile-bundle.js";
import example from "./fixtures/g0-openerp-users-model.json"; import gov2 from "./fixtures/g0-users-governance-v2.json";
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex"), np = (v: unknown) => Object.assign(Object.create({}), v);
const baseN = (): any => structuredClone(example), baseG2 = (): any => structuredClone(gov2);
const N_BYTES = 2531, N_DIGEST = "21684a38e6c3979937f53a286b275971f3ccda431c299078c0e8715a9240e50e";
const G2_BYTES = 1768, G2_DIGEST = "649b23132c5400ad11f5a92596057830daa2e5fdfee9258a3a54dc516d0da8d0";
const G3_BYTES = 1794, G3_DIGEST = "3fb9d4dc071b20b1e5e53fb6038604e977efa3dc2f01bfc5b2ea152cd62c2f58";
const U = "entities.users", UC = `${U}.columns`, D = `${UC}.display_name`, M = "memberships", MC = `relations.${M}.columns`;
const NONE = { pii: { category: "none" } }, SENS_DEL = { pii: { category: "sensitive" }, retention: "account", erasure: "delete" };
const deriveGov3 = (): any => { const g = baseG2(); g.version = "3"; g.entities.users.columns.display_name = { ...structuredClone(SENS_DEL), protect: { encrypt: true } }; return g; };
const addStoredPayload = (n: any, g: any) => {
  n.relation_types[M] = { source: "organizations", target: "users", cardinality: { out: { min: 0, max: "many" }, in: { min: 0, max: "many" } }, attributes: [{ name: "organization_id", type: { kind: "uuid" }, nullable: false }, { name: "user_id", type: { kind: "uuid" }, nullable: false }, { name: "joined_at", type: { kind: "timestamptz" }, nullable: false }, { name: "note", type: { kind: "text" }, nullable: true }], key: ["organization_id", "user_id"], endpoints: { source: { fields: ["organization_id"], targetFields: ["id"] }, target: { fields: ["user_id"], targetFields: ["id"] } } };
  g.relations = { [M]: { tenantScope: { kind: "tenant", tenant: "organization_id" }, columns: { organization_id: NONE, user_id: NONE, joined_at: NONE, note: NONE }, retention: { r: { from: "joined_at", days: 30 } }, cdc: { include: false } } };
};
const badCases: Array<[string, (n: any, g: any) => void, string, string?]> = [
  ["sensitive omit retention", (_n, g) => { g.entities.users.columns.display_name = { pii: { category: "sensitive" }, erasure: "delete" }; }, `${D}.retention`, "is required"],
  ["sensitive missing rule", (_n, g) => { g.entities.users.columns.display_name = { pii: { category: "sensitive" }, retention: "missing", erasure: "delete" }; }, `${D}.retention`, "unknown retention rule"],
  ["sensitive proto rule", (_n, g) => { g.entities.users.columns.display_name = { pii: { category: "sensitive" }, retention: "toString", erasure: "delete" }; }, `${D}.retention`, "unknown retention rule"],
  ["sensitive omit erasure", (_n, g) => { g.entities.users.columns.display_name = { pii: { category: "sensitive" }, retention: "account" }; }, `${D}.erasure`],
  ["sensitive unknown erasure", (_n, g) => { g.entities.users.columns.display_name = { pii: { category: "sensitive" }, retention: "account", erasure: "mask" }; }, `${D}.erasure`],
  ["sensitive delete conflict", (_n, g) => { g.entities.users.retention.short = { from: "updated_at", days: 30 }; g.entities.users.columns.display_name = { pii: { category: "sensitive" }, retention: "short", erasure: "delete" }; }, `${D}.retention`, "conflicts with another delete schedule"],
  ["sensitive protect false", (_n, g) => { g.entities.users.columns.display_name = { ...structuredClone(SENS_DEL), protect: { encrypt: false } }; }, `${D}.protect.encrypt`, "must be true"],
  ["sensitive extra col key", (_n, g) => { g.entities.users.columns.display_name = { ...structuredClone(SENS_DEL), extra: 1 }; }, `${D}.extra`],
  ["unknown pii category", (_n, g) => { g.entities.users.columns.display_name.pii.category = "secret"; }, `${D}.pii.category`, "sensitive"],
  ["protect null", (_n, g) => { g.entities.users.columns.display_name.protect = null; }, `${D}.protect`, "must be an object"],
  ["protect empty object", (_n, g) => { g.entities.users.columns.display_name.protect = {}; }, `${D}.protect.encrypt`, "must be true"],
  ["protect encrypt false", (_n, g) => { g.entities.users.columns.display_name.protect = { encrypt: false }; }, `${D}.protect.encrypt`, "must be true"],
  ["protect extra keyId", (_n, g) => { g.entities.users.columns.display_name.protect = { encrypt: true, keyId: "k" }; }, `${D}.protect.keyId`, "is not allowed"],
  ["protect extra undefined key", (_n, g) => { g.entities.users.columns.display_name.protect = { encrypt: true, extra: undefined }; }, `${D}.protect.extra`, "is not allowed"],
  ["protect own __proto__", (_n, g) => { const pr: any = { encrypt: true }; Object.defineProperty(pr, "__proto__", { value: 1, enumerable: true }); g.entities.users.columns.display_name.protect = pr; }, `${D}.protect.__proto__`, "is not allowed"],
  ["protect boolean", (_n, g) => { g.entities.users.columns.display_name.protect = true; }, `${D}.protect`, "must be an object"],
  ["protect array", (_n, g) => { g.entities.users.columns.display_name.protect = []; }, `${D}.protect`, "must be an object"],
  ["protect non-plain object", (_n, g) => { g.entities.users.columns.display_name.protect = np({ encrypt: true }); }, `${D}.protect`, "must be an object"],
  ["protect encrypt string true", (_n, g) => { g.entities.users.columns.display_name.protect = { encrypt: "true" }; }, `${D}.protect.encrypt`, "must be true"],
  ["protect encrypt numeric 1", (_n, g) => { g.entities.users.columns.display_name.protect = { encrypt: 1 }; }, `${D}.protect.encrypt`, "must be true"],
  ["protect encrypt undefined", (_n, g) => { g.entities.users.columns.display_name.protect = { encrypt: undefined }; }, `${D}.protect.encrypt`, "must be true"],
  ["none protect null", (_n, g) => { g.entities.users.columns.mfa_state = { pii: { category: "none" }, protect: null }; }, `${UC}.mfa_state.protect`, "must be an object"],
  ["none protect empty", (_n, g) => { g.entities.users.columns.mfa_state = { pii: { category: "none" }, protect: {} }; }, `${UC}.mfa_state.protect.encrypt`, "must be true"],
  ["none protect encrypt false", (_n, g) => { g.entities.users.columns.mfa_state = { pii: { category: "none" }, protect: { encrypt: false } }; }, `${UC}.mfa_state.protect.encrypt`, "must be true"],
  ["none protect extra keyId", (_n, g) => { g.entities.users.columns.mfa_state = { pii: { category: "none" }, protect: { encrypt: true, keyId: "k" } }; }, `${UC}.mfa_state.protect.keyId`, "is not allowed"],
  ["none protected with retention", (_n, g) => { g.entities.users.columns.mfa_state = { pii: { category: "none" }, protect: { encrypt: true }, retention: "account" }; }, `${UC}.mfa_state.retention`, "pii category none"],
  ["none protected with erasure", (_n, g) => { g.entities.users.columns.mfa_state = { pii: { category: "none" }, protect: { encrypt: true }, erasure: "delete" }; }, `${UC}.mfa_state.erasure`, "pii category none"],
  ["stored sensitive omit retention", (n, g) => { addStoredPayload(n, g); g.relations[M].columns.note = { pii: { category: "sensitive" }, erasure: "delete" }; }, `${MC}.note.retention`, "is required"],
  ["stored none protect false", (n, g) => { addStoredPayload(n, g); g.relations[M].columns.note = { pii: { category: "none" }, protect: { encrypt: false } }; }, `${MC}.note.protect.encrypt`, "must be true"],
];
it.each(badCases)("refuses %s", (_label, mutate, path, msg) => {
  const n = baseN(), g = baseG2(); mutate(n, g); const errs = validateModelGovernance(n, g);
  expect(errs.map((e) => e.split(" ")[0])).toStrictEqual([path]); // kills: accepting invalid sensitive retention/erasure/conflict or malformed protect on entity/stored-edge arms
  if (msg) expect(errs[0]).toContain(msg); // kills: wrong refusal reason such as rejecting protect as extra column key instead of non-object
  expect(() => sealModelGovernance(n, g)).toThrow(path); // kills: sealModelGovernance bypassing sensitive/protect validation
});
it("accepts §4 sensitive and eligible protected controls across both PII arms and stored edges", () => {
  const cat: PiiCategory = "sensitive";
  for (const [erasure, ret, protect] of [["delete", "account", undefined], ["delete", "account", { encrypt: true } as const], ["anonymize", "anon", undefined], ["anonymize", "anon", { encrypt: true } as const]] as const) {
    const g = baseG2(); g.entities.users.retention.anon = { from: "created_at", days: 30 };
    const col: ColumnGovernance = protect ? { pii: { category: cat }, retention: ret, erasure, protect } : { pii: { category: cat }, retention: ret, erasure };
    g.entities.users.columns.display_name = col;
    expect(validateModelGovernance(baseN(), g), `${erasure}/${Boolean(protect)}`).toStrictEqual([]); // kills: rejecting valid sensitive column with delete/anonymize or protect present/absent
  }
  const gNone = baseG2(); gNone.entities.users.columns.mfa_state = { pii: { category: "none" }, protect: { encrypt: true } } satisfies ColumnGovernance;
  expect(validateModelGovernance(baseN(), gNone)).toStrictEqual([]); // kills: rejecting eligible protected none column on entity
  const nSt = baseN(), gSt = baseG2(); addStoredPayload(nSt, gSt);
  gSt.relations[M].columns.note = { pii: { category: "none" }, protect: { encrypt: true } } satisfies ColumnGovernance;
  const normSt = normalizeOntologyProfile(parseOntologyProfile(nSt)); gSt.profile.pin.contentDigest = normSt.profile_hash;
  expect(validateModelGovernance(normSt, gSt)).toStrictEqual([]); expect(sealModelGovernance(normSt, gSt).bytes).toContain('"note":{"pii":{"category":"none"},"protect":{"encrypt":true}}'); // kills: rejecting or dropping protect on eligible none payload of stored edge with retention/erasure absent
  const nSt2 = baseN(), gSt2 = baseG2(); addStoredPayload(nSt2, gSt2);
  gSt2.relations[M].columns.note = { pii: { category: "sensitive" }, retention: "r", erasure: "anonymize", protect: { encrypt: true } } satisfies ColumnGovernance;
  expect(validateModelGovernance(nSt2, gSt2)).toStrictEqual([]); // kills: rejecting valid protected sensitive payload on stored edge
  const gSym = deriveGov3(); gSym.entities.users.columns.display_name.protect[Symbol("s")] = 1;
  const gAcc = deriveGov3(); Object.defineProperty(gAcc.entities.users.columns.display_name, "protect", { get: () => ({ encrypt: true }), enumerable: true, configurable: true });
  expect(() => sealModelGovernance(baseN(), gSym)).toThrow("invalid-json:key"); // kills: stripUndef dropping symbol-key check on protect
  expect(() => sealModelGovernance(baseN(), gAcc)).toThrow("invalid-json:property"); // kills: stripUndef dropping accessor check on protect
});
it("replays worked G v2 and derived v3 vectors, §5 item 6 mutations, and personal->sensitive repin with N bytes fixed", () => {
  const norm = normalizeOntologyProfile(parseOntologyProfile(baseN())), nPre = JSON.stringify(stableForHash(norm));
  expect(Buffer.byteLength(nPre, "utf8")).toBe(N_BYTES); expect(norm.profile_hash).toBe(N_DIGEST); // kills: N preimage byte count or digest drift
  const s2: SealedModelGovernance = sealModelGovernance(norm, gov2), g3 = deriveGov3(), s3 = sealModelGovernance(norm, g3);
  expect(s2.byteLength).toBe(G2_BYTES); expect(s2.digest).toBe(G2_DIGEST); expect(s2.bytes).not.toContain('"protect"'); // kills: injected protect default or v2 byte/digest drift
  expect(s2.pin).toStrictEqual({ namespace: "example", pin: { id: "users-governance", version: "2", contentDigest: G2_DIGEST } }); // kills: malformed v2 QualifiedPin
  expect(s3.byteLength).toBe(G3_BYTES); expect(s3.digest).toBe(G3_DIGEST); expect(sha256(s3.bytes)).toBe(G3_DIGEST); // kills: §4 users-governance@3 byte count or digest mismatch
  expect(s3.pin).toStrictEqual({ namespace: "example", pin: { id: "users-governance", version: "3", contentDigest: G3_DIGEST } }); // kills: malformed v3 QualifiedPin
  expect(sealModelGovernance(baseN(), g3)).toStrictEqual(s3); expect(g3.profile).toStrictEqual(gov2.profile); // kills: raw vs normalized N seal divergence or altered N pin on v3
  const g3Reord = deriveGov3(); g3Reord.entities.users.columns.display_name = { protect: { encrypt: true }, erasure: "delete", retention: "account", pii: { category: "sensitive" } }; g3Reord.entities.users.columns.mfa_state = { ...g3Reord.entities.users.columns.mfa_state, protect: undefined };
  expect(sealModelGovernance(norm, g3Reord)).toStrictEqual(s3); // kills: key-order sensitivity on protect or retaining explicit protect:undefined
  const mCat = deriveGov3(); mCat.entities.users.columns.display_name.pii.category = "personal";
  const sCat = sealModelGovernance(norm, mCat);
  expect(sCat.pin.pin.version).toBe("3"); expect(sCat.byteLength).toBe(1793); expect(sCat.bytes).not.toBe(s3.bytes); expect(sCat.digest).not.toBe(G3_DIGEST); expect(sha256(sCat.bytes)).toBe(sCat.digest); // kills: §5 item 6 sensitive->personal mutation preserving G bytes or digest
  const mNoProt = deriveGov3(); delete mNoProt.entities.users.columns.display_name.protect;
  const sNoProt = sealModelGovernance(norm, mNoProt);
  expect(sNoProt.pin.pin.version).toBe("3"); expect(sNoProt.byteLength).toBe(1767); expect(sNoProt.bytes).not.toContain('"protect"'); expect(sNoProt.bytes).not.toBe(s3.bytes); expect(sNoProt.digest).not.toBe(G3_DIGEST); expect(sNoProt.digest).not.toBe(sCat.digest); expect(sha256(sNoProt.bytes)).toBe(sNoProt.digest); // kills: §5 item 6 omitting protect preserving G bytes/digest or injecting protect default on sensitive
  const mUndefProt = deriveGov3(); mUndefProt.entities.users.columns.display_name.protect = undefined;
  expect(sealModelGovernance(norm, mUndefProt)).toStrictEqual(sNoProt); // kills: protect:undefined diverging from omitted protect
  const gPers = baseG2(), gSens = baseG2(); gPers.entities.users.columns.display_name.pii.category = "personal"; gSens.entities.users.columns.display_name.pii.category = "sensitive";
  const sPers = sealModelGovernance(norm, gPers), sSens = sealModelGovernance(norm, gSens);
  expect(sPers.bytes).not.toContain('"protect"'); expect(sSens.bytes).not.toContain('"protect"'); expect(sPers.byteLength).toBe(1766); expect(sSens.byteLength).toBe(1767); expect(sSens.digest).not.toBe(sPers.digest); expect(sSens.digest).not.toBe(G2_DIGEST); // kills: personal->sensitive without protect failing to change G digest
  const nPreAfter = JSON.stringify(stableForHash(normalizeOntologyProfile(parseOntologyProfile(baseN()))));
  expect(nPreAfter).toBe(nPre); expect(Buffer.byteLength(nPreAfter, "utf8")).toBe(N_BYTES); expect(sha256(nPreAfter)).toBe(N_DIGEST); // kills: §5 item 6 G mutations altering N bytes or digest
});
