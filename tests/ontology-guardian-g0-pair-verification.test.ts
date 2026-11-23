import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { canonicalBytes } from "../src/ontology-guardian/canonical.js";
import { createCompanionIndex } from "../src/ontology-guardian/companion-publication.js";
import { stableForHash } from "../src/ontology-guardian/digests.js";
import { bundleProfile, verifyModelPair, type VerifyModelPairRefusalCode as RC } from "../src/profile-bundle.js";
import { N_QPIN, baseG2, baseN, privInput, pubInput, s2, sealG } from "./fixtures/g0-companion-fixture.js";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
function bOf(edit?: (n: any) => void) {
  const n = baseN(); edit?.(n);
  const r = bundleProfile(n);
  if (!r.ok) throw new Error(r.refusalCode);
  return r.bundle;
}
const BASE = bOf();
const N_ARCH = "8ea14fc66bbbe2ba3dc4fd9c82904618ecfab9e992c346a5fd948d6afb46babb";
const ARCH_B = bOf((n) => n.data_model.enums.user_status.values.push("archived"));
const LEG_B = bOf((n) => { delete n.data_model; });
const LINK_B = bOf((n) =>
  (n.node_types.users.linking = { preset: "gazetteer-exact", normalize: { builtin: ["case_fold"] } }));
function mkPair(kind: "base" | "link" | "crossNs" = "base"): any {
  const b = structuredClone(kind === "link" ? LINK_B : BASE);
  const g = baseG2(); if (kind === "crossNs") g.namespace = "tenant-a";
  g.profile.pin.contentDigest = b.profileHash;
  const gPin = { id: g.id, version: g.version, contentDigest: sha(canonicalBytes(g)) };
  return {
    profilePin: { namespace: "example", pin: { id: b.profileId, version: "2", contentDigest: b.profileHash } },
    governancePin: { namespace: g.namespace, pin: gPin }, bundle: b, governance: g,
  };
}
const pMut = (fn: (p: any) => void) => (p: any) => { fn(p); p.governancePin.pin.contentDigest = sha(canonicalBytes(p.governance)); };
const gMut = (fn: (g: any) => void) => pMut((p) => fn(p.governance));
const setN = (p: any, d: string) => pMut((x) => { x.profilePin.pin.contentDigest = x.governance.profile.pin.contentDigest = d; })(p);
const bMut = (fn: (b: any) => void) => (p: any) => {
  fn(p.bundle); const { schema, documentProjection: document, registries: r, registriesMode } = p.bundle;
  const registries = Object.fromEntries(Object.keys(r).map((id) => [id, { binding: r[id].binding, recordCount: null, recordsDigest: "not_bundled" }]));
  p.bundle.digest = sha(canonicalBytes({ schema, document, registries, registriesMode }));
};
const dMut = (fn: (d: any) => void) => bMut((b) => fn(b.documentProjection));
const profMut = (fn: (pr: any) => void) => (p: any) => {
  fn(p.bundle.profile); p.bundle.profile.profile_hash = p.bundle.profileHash = sha(JSON.stringify(stableForHash(p.bundle.profile)));
  setN(p, p.bundle.profileHash);
};
const usr = (o: any) => o.node_types.users;
const [BP, DP, GP, PP, GPN, U] = [
  "bundle.profile", "bundle.documentProjection", "governance.profile",
  "profilePin.pin", "governancePin.pin", "node_types.users",
];
const [IP, PM, IPS, IPE, ULF, IGS, IGE, DM] =
  ["invalid_pin", "pin_mismatch", "invalid_profile_syntax", "invalid_profile_schema",
    "unsupported_linking_fn", "invalid_governance_syntax", "invalid_governance_schema", "digest_mismatch"] as const;
const [SCH, V2] = ['"schema":"engram.profile-bundle/v1"', '"version":"2"'];
const A0 = `${DP}.${U}.attributes[0]`;
type Neg = readonly [string, string, RC, string, (p: any) => void, ("base" | "link" | "crossNs")?];
const NEG: readonly Neg[] = [
  ["swapped N/G ns", "M29", PM, `${GP}.namespace`,
    (p) => { [p.profilePin.namespace, p.governancePin.namespace] = ["tenant-a", "example"]; }, "crossNs"],
  ["swapped G ns", "M33", PM, "governance.namespace", (p) => { p.governancePin.namespace = "other"; }],
  ["stale N pin", "M26", DM, `${PP}.contentDigest`,
    pMut((p) => { p.bundle = structuredClone(ARCH_B); p.governance.profile.pin.contentDigest = N_ARCH; })],
  ["stale G", "M36", DM, `${GPN}.contentDigest`, (p) => { p.governance.entities.users.retention.account.days = 180; }],
  ["stale G prof pin", "M32", DM, `${GP}.pin.contentDigest`, gMut((g) => { g.profile.pin.contentDigest = N_ARCH; })],
  ["floating G ver", "M03", IP, `${GPN}.version`, (p) => { p.governancePin.pin.version = "latest"; }],
  ["range N ver", "M02", IP, `${PP}.version`, (p) => { p.profilePin.pin.version = "^2.0.0"; }],
  ["prerelease N ver", "M04", IP, `${PP}.version`, (p) => { p.profilePin.pin.version = "2.0.0-rc.1"; }],
  ["extra input key", "M01", IP, "extra", (p) => { p.extra = 1; }],
  ["extra profilePin key", "M05", IP, "profilePin.extra", (p) => { p.profilePin.extra = 1; }],
  ["untrimmed ns", "M06", IP, "profilePin.namespace", (p) => { p.profilePin.namespace = " example "; }],
  ["extra pin key", "M07", IP, `${PP}.extra`, (p) => { p.profilePin.pin.extra = 1; }],
  ["untrimmed pin.id", "M08", IP, `${PP}.id`, (p) => { p.profilePin.pin.id = " openerp-users-example "; }],
  ["bad pin digest", "M09", IP, `${PP}.contentDigest`, (p) => { p.profilePin.pin.contentDigest = "not-64-hex"; }],
  ["dup key bundle", "M10", IPS, "bundle.schema",
    (p) => { p.bundle = JSON.stringify(p.bundle).replace(SCH, `"schema":"v0",${SCH}`); }],
  ["extra bundle key", "M11", IPE, "bundle.extra", (p) => { p.bundle.extra = 1; }],
  ["bad N fmt", "M18", IPE, `${DP}.data_model.format`, dMut((d) => { d.data_model.format = "engram.data-model/9"; })],
  ["legacy N", "M17", IPE, `${DP}.data_model`,
    (p) => setN(Object.assign(p, { bundle: structuredClone(LEG_B) }), LEG_B.profileHash)],
  ["unknown G format", "M28a", IGE, "governance.format", gMut((g) => { g.format = "engram.data-governance/99"; })],
  ["unknown bundle schema", "M12", IPE, "bundle.schema", (p) => { p.bundle.schema = "engram.profile-bundle/v99"; }],
  ["altered body", "M22", DM, "bundle.digest", profMut((pr) => { pr.outputs.ontology.enabled = true; })],
  ["bundle dig as N pin", "M26b", DM, `${PP}.contentDigest`, (p) => setN(p, p.bundle.digest)],
  ["prof_hash dig", "M19", DM, `${BP}.profile_hash`, (p) => { p.bundle.profile.profile_hash = p.bundle.digest; }],
  ["stale bundle.profileHash", "M21", DM, "bundle.profileHash", (p) => { p.bundle.profileHash = p.bundle.digest; }],
  ["tampered registries", "M23", IPE, "bundle.registries", bMut((b) => { b.registries.users.binding.source = "x"; })],
  ["profilePin id", "M24", PM, `${PP}.id`, (p) => { p.profilePin.pin.id = "x"; }],
  ["N pin ver", "M25", PM, `${PP}.version`, (p) => { p.profilePin.pin.version = "2.0.1"; }],
  ["gov prof.pin.id", "M30", PM, `${GP}.pin.id`, gMut((g) => { g.profile.pin.id = "other"; })],
  ["gov prof.pin.ver", "M31", PM, `${GP}.pin.version`, gMut((g) => { g.profile.pin.version = "2.0.1"; })],
  ["gov.id mismatch", "M34", PM, "governance.id", (p) => { p.governancePin.pin.id = "other"; }],
  ["gov.version mismatch", "M35", PM, "governance.version", (p) => { p.governancePin.pin.version = "9"; }],
  ["injected module_sha256", "M15", ULF, `${BP}.${U}.linking.normalizer.module_sha256`, profMut((pr) => {
    const d = usr(pr).linking.normalizer, h = "a".repeat(64); d.module_sha256 = h;
    d.normalizer_hash = sha(JSON.stringify({ contract: d.contract, builtins: d.builtins, module_sha256: h }));
  }), "link"],
  ["normalizer.export", "M16", ULF, `${BP}.${U}.linking.normalizer.export`,
    profMut((pr) => { usr(pr).linking.normalizer.export = "norm"; }), "link"],
  ["injected linking.fn", "M14", ULF, `${DP}.${U}.linking.normalize.fn`,
    dMut((d) => { usr(d).linking.normalize.fn = "./f#x"; }), "link"],
  ["non-empty extensions", "M13", IPE, "bundle.extensions", (p) => { p.bundle.extensions = { "engram.g/1": s2.pin }; }],
  ["embedded RLS in G", "M28b", IGE, "governance.entities.users.rls", gMut((g) => { g.entities.users.rls = "1=1"; })],
  ["dup G key", "M27", IGS, `${GP}.pin.version`,
    (p) => { p.governance = s2.bytes.replace(V2, `"version":"1",${V2}`); }],
  ["bool", "F3.1", IPE, `${A0}.type.kind`, dMut((d) => { usr(d).attributes[0].type = { kind: "bool" }; })],
  ["storageRegion", "F3.1b", IPE, `${DP}.data_model.storageRegion`, dMut((d) => { d.data_model.storageRegion = "c"; })],
  ["attr default", "F3.1c", IPE, `${A0}.default`, dMut((d) => { usr(d).attributes[0].default = null; })],
  ["RLS in docProj", "F3.1d", IPE, `${DP}.${U}.rls`, dMut((d) => { usr(d).rls = "1=1"; })],
  ["bad registriesMode", "F3.1e", IPE, "bundle.registriesMode", (p) => { p.bundle.registriesMode = "bad"; }],
  ["bad bundle.digest fmt", "F3.1f", IPE, "bundle.digest", (p) => { p.bundle.digest = "not-64-hex"; }],
  ["empty bundle JSON", "F3.2a", IPS, "bundle", (p) => { p.bundle = ""; }],
  ["empty gov JSON", "F3.2b", IGS, "governance", (p) => { p.governance = ""; }],
  ["null bundle JSON", "F3.2c", IPE, "bundle", (p) => { p.bundle = "null"; }],
  ["array gov JSON", "F3.2d", IGE, "governance", (p) => { p.governance = "[1,2]"; }],
  ["sourcePath in docProj", "F3.3a", IPE, `${DP}.sourcePath`, dMut((d) => { d.sourcePath = "/etc/passwd"; })],
  ["bound_source_path", "F3.3b", IPE, `${DP}.registries.users.bound_source_path`,
    dMut((d) => { d.registries.users.bound_source_path = "/tmp/u.csv"; })],
  ["symbol input key", "S01", IP, "input", (p) => { p[Symbol("s")] = 1; }],
  ["non-plain prototype", "S02", IP, "input", (p) => { Object.setPrototypeOf(p, {}); }],
  ["non-enumerable profilePin", "S03", IP, "profilePin", (p) => { Object.defineProperty(p, "profilePin", { enumerable: false }); }],
  ["profile_hash in docProj", "S12", IPE, `${DP}.profile_hash`, dMut((d) => { d.profile_hash = "x".repeat(64); })],
  ["extra registry key", "S21", IPE, "bundle.registries", bMut((b) => { b.registries.users.extra = 1; })],
  ["extra registry snapshot", "S22", IPE, "bundle.registries",
    bMut((b) => { b.registries.extra = { registryId: "extra", binding: b.registries.users.binding, recordCount: null, recordsDigest: null }; })],
];

it("refuses every RED, §6, F1, F2, and F3 single-field defect while accepting baselines", () => {
  expect(ARCH_B.profileHash).toBe(N_ARCH);
  for (const [name, mutant, code, path, change, kind = "base"] of NEG) {
    expect(verifyModelPair(mkPair(kind)), `${name} base`).toMatchObject({ ok: true });
    const cand = mkPair(kind);
    change(cand);
    expect(verifyModelPair(cand), `${name} [${mutant}]`).toMatchObject({
      ok: false, status: "refused", refusalCode: code, errors: [{ path }],
    });
  }
});

it("snapshots own data properties once without TOCTOU getter double-reads [S04-S08]", () => {
  const p0 = mkPair(); const v0 = verifyModelPair(p0);
  const parts = [p0.profilePin, p0.governancePin, p0.bundle, p0.governance];
  expect(v0.ok && parts.every((o) => !Object.isFrozen(o)), "S04-S07 R01 R05 caller isolation").toBe(true);
  expect(v0.ok && v0.profile !== p0.bundle.profile && v0.governance !== p0.governance, "S04-S07 no caller refs").toBe(true);
  for (const [key, code] of [["profilePin", IP], ["governancePin", IP], ["governance", IGE]] as const) {
    const p = mkPair();
    const orig = p[key];
    let calls = 0;
    Object.defineProperty(p, key, { enumerable: true, get: () => (++calls === 1 ? orig : { ...orig, injected: "X" }) });
    expect(verifyModelPair(p), `${key} [S05]`).toMatchObject({ ok: false, refusalCode: code, errors: [{ path: key }] });
    expect(calls, `${key} [S05] zero reads`).toBe(0);
  }
  const leak = mkPair(); leak.bundle.profile.sourcePath = "/etc/passwd"; const lv: any = verifyModelPair(leak);
  expect(lv.ok && lv.profile.sourcePath === undefined && lv.profile !== leak.bundle.profile, "S28 no profile leak").toBe(true);
  const base = mkPair();
  let reads = 0, gets = 0;
  const proxy = new Proxy(base, {
    get(t, prop, recv) { if (typeof prop === "string") gets++; return Reflect.get(t as any, prop, recv); },
    getOwnPropertyDescriptor(t, prop) {
      if (prop !== "profilePin") return Reflect.getOwnPropertyDescriptor(t, prop);
      const value = ++reads === 1 ? t.profilePin : { ...t.profilePin, pin: { ...t.profilePin.pin, injected: "X" } };
      return { value, enumerable: true, configurable: true, writable: true };
    },
  });
  const res = verifyModelPair(proxy);
  expect(res.ok && !("injected" in res.profilePin.pin) && reads === 1 && gets === 0, "S04 no input re-read").toBe(true);
  const q = mkPair();
  const members = ["profilePin", "governancePin", "bundle", "governance"];
  const n: Record<string, { get: number; desc: number }> = {};
  const spy = (key: string) => {
    const c = (n[key] = { get: 0, desc: 0 });
    return new Proxy(q[key], {
      get: (t, k, r) => { if (typeof k === "string") c.get++; return Reflect.get(t, k, r); },
      getOwnPropertyDescriptor: (t, k) => { c.desc++; return Reflect.getOwnPropertyDescriptor(t, k); },
    });
  };
  expect(verifyModelPair(Object.fromEntries(members.map((k) => [k, spy(k)])) as any).ok, "S06-S08 base").toBe(true);
  const once = Object.fromEntries(members.map((k) => [k, { get: 0, desc: Object.keys(q[k]).length }]));
  expect(n, "S06-S08 R03 R15-R17 no get, one descriptor read per key").toStrictEqual(once);
});

it("exercises §6 built-in linking and unsupported_linking_fn via public export", () => {
  const okLink = verifyModelPair(mkPair("link"));
  expect(okLink).toMatchObject({ ok: true, bundleDigest: LINK_B.digest });
  expect(okLink.ok && okLink.profile.node_types.users?.linking?.normalizer.builtins).toStrictEqual(["case_fold@1"]);
  const withFn = baseN(); withFn.node_types.users.linking = { normalize: { fn: "./definitely-missing.js#norm" } };
  expect(bundleProfile(withFn)).toMatchObject({
    ok: false, refusalCode: ULF, errors: [{ path: "node_types.users.linking.normalize.fn" }],
  });
});

it("reuses public N pin for public/private G and verifies both private cases at owning tenant", () => {
  const idx = createCompanionIndex();
  const [T, PT] = ["tenant-a", "private:tenant-a"] as const;
  const privG = (id: string) => sealG((g) => { g.namespace = T; g.id = id; });
  const [privPub, privPriv] = [privG("users-gov-pubn"), privG("users-gov-privn")];
  const pairs = [
    ["public/public", pubInput(), s2, undefined, BASE],
    ["public/private", privInput("public", PT, privPub.pin), privPub, T, BASE],
    ["private/private", privInput(PT, PT, privPriv.pin), privPriv, T, JSON.stringify(BASE)],
  ] as const;
  let pubNPin: unknown;
  for (const [label, inp, sealed, viewer, bundleIn] of pairs) {
    const pub = idx.publish(inp); if (!pub.ok) throw new Error(`${label} publish failed: ${pub.code}`);
    const q = { namespace: sealed.pin.namespace, id: sealed.pin.pin.id, version: sealed.pin.pin.version };
    if (viewer) expect(idx.resolve({ ...q, viewerTenant: "tenant-b" })).toStrictEqual({ ok: false, code: "not-found" });
    const res = idx.resolve({ ...q, ...(viewer ? { viewerTenant: viewer } : {}),
      expectedEntryDigest: pub.entryDigest, expectedGovernanceDigest: sealed.pin.pin.contentDigest });
    if (!res.ok) throw new Error(`${label} resolve failed: ${res.code}`);
    expect(viewer ? res.assetBytes === undefined : res.assetBytes === s2.bytes, label).toBe(true);
    const nPin = { namespace: res.envelope.ontology.namespace, pin: res.envelope.ontology.profilePin };
    if (label === "public/public") pubNPin = nPin; if (label === "public/private") expect(nPin).toStrictEqual(pubNPin);
    const v = verifyModelPair({ profilePin: nPin, governancePin: res.indexEntry.gPin, bundle: bundleIn, governance: res.assetBytes ?? sealed.bytes });
    expect(v, label).toMatchObject({
      ok: true, profilePin: N_QPIN, governancePin: sealed.pin, bundleDigest: BASE.digest, governanceBytes: sealed.bytes,
    });
    expect(v.ok && Object.isFrozen(v), `${label} frozen`).toBe(true);
  }
});

it("N3 string inputs read LOG_TOKENS/LOG_STREAM via yaml (shared with bundleProfile) but the verdict is unaffected", () => {
  process.env.LOG_TOKENS = "1"; const p = mkPair();
  const v: any = verifyModelPair({ ...p, bundle: JSON.stringify(p.bundle), governance: JSON.stringify(p.governance) });
  delete process.env.LOG_TOKENS; expect(v.ok && v.bundleDigest === BASE.digest, "N3").toBe(true);
});
