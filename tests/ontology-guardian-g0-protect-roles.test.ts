import { createHash } from "node:crypto"; import { expect, it } from "vitest";
import { sealModelGovernance, validateModelGovernance } from "../src/model-governance.js";
import { stableForHash } from "../src/ontology-guardian/digests.js";
import { normalizeOntologyProfile, parseOntologyProfile } from "../src/ontology-profile.js";
import type { ColumnGovernance } from "../src/profile-bundle.js";
import example from "./fixtures/g0-openerp-users-model.json"; import gov2 from "./fixtures/g0-users-governance-v2.json";
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex"), baseN = (): any => structuredClone(example), baseG2 = (): any => structuredClone(gov2);
const N_BYTES = 2531, N_DIGEST = "21684a38e6c3979937f53a286b275971f3ccda431c299078c0e8715a9240e50e";
const G2_BYTES = 1768, G2_DIGEST = "649b23132c5400ad11f5a92596057830daa2e5fdfee9258a3a54dc516d0da8d0";
const G3_BYTES = 1794, G3_DIGEST = "3fb9d4dc071b20b1e5e53fb6038604e977efa3dc2f01bfc5b2ea152cd62c2f58";
const UC = "entities.users.columns", OC = "entities.organizations.columns", M = "memberships", MC = `relations.${M}.columns`;
const none = (): ColumnGovernance => ({ pii: { category: "none" } }), PROT = { encrypt: true } as const;
const SENS = (r = "account", e: "delete" | "anonymize" = "delete"): ColumnGovernance => ({ pii: { category: "sensitive" }, retention: r, erasure: e });
const addAttr = (n: any, g: any, ent: string, name: string, kind = "uuid", nullable = false, col: ColumnGovernance = none()) => { n.node_types[ent].attributes.push({ name, type: { kind }, nullable }); g.entities[ent].columns[name] = structuredClone(col); };
const prot = (col: any) => { col.protect = { encrypt: true }; };
const withRoles = (n: any, g: any) => {
  addAttr(n, g, "organizations", "org_code", "text"); addAttr(n, g, "organizations", "org_k2", "text"); addAttr(n, g, "organizations", "org_ext"); addAttr(n, g, "organizations", "org_ext2"); addAttr(n, g, "organizations", "org_note", "text", true);
  n.node_types.organizations.unique = [["org_code", "org_k2"], ["org_ext", "org_ext2"]];
  addAttr(n, g, "users", "fk_a", "text"); addAttr(n, g, "users", "fk_b", "text"); addAttr(n, g, "users", "manager_id", "uuid", true); addAttr(n, g, "users", "usr_ext"); addAttr(n, g, "users", "usr_ext2"); addAttr(n, g, "users", "opt_u", "text", true); addAttr(n, g, "users", "t_op"); addAttr(n, g, "users", "w_op");
  n.node_types.users.unique.push(["usr_ext", "usr_ext2"], ["opt_u"]);
  n.node_types.users.references.push({ fields: ["fk_a", "fk_b"], relation: "users.org_pair", targetFields: ["org_code", "org_k2"] }, { fields: ["manager_id"], relation: "users.manager", targetFields: ["id"] });
  n.relation_types["users.org_pair"] = { source: "users", target: "organizations", cardinality: { out: { min: 1, max: 1 }, in: { min: 0, max: "many" } } };
  n.relation_types["users.manager"] = { source: "users", target: "users", cardinality: { out: { min: 0, max: 1 }, in: { min: 0, max: "many" } } };
  g.entities.users.tenantScope = { kind: "tenant", tenant: "t_op", workspace: "w_op" };
  n.relation_types[M] = { source: "organizations", target: "users", cardinality: { out: { min: 0, max: "many" }, in: { min: 0, max: "many" } }, attributes: [{ name: "edge_id", type: { kind: "uuid" }, nullable: false }, { name: "edge_seq", type: { kind: "int" }, nullable: false }, { name: "uniq_tag", type: { kind: "text" }, nullable: false }, { name: "uniq_sub", type: { kind: "text" }, nullable: true }, { name: "src_a", type: { kind: "uuid" }, nullable: false }, { name: "src_b", type: { kind: "uuid" }, nullable: false }, { name: "dst_a", type: { kind: "uuid" }, nullable: false }, { name: "dst_b", type: { kind: "uuid" }, nullable: false }, { name: "st_t", type: { kind: "uuid" }, nullable: false }, { name: "st_w", type: { kind: "uuid" }, nullable: false }, { name: "joined_at", type: { kind: "timestamptz" }, nullable: false }, { name: "note", type: { kind: "text" }, nullable: true }, { name: "secret", type: { kind: "text" }, nullable: true }], key: ["edge_id", "edge_seq"], unique: [["uniq_tag", "uniq_sub"]], endpoints: { source: { fields: ["src_a", "src_b"], targetFields: ["org_ext", "org_ext2"] }, target: { fields: ["dst_a", "dst_b"], targetFields: ["usr_ext", "usr_ext2"] } } };
  g.relations = { [M]: { tenantScope: { kind: "tenant", tenant: "st_t", workspace: "st_w" }, columns: { edge_id: none(), edge_seq: none(), uniq_tag: none(), uniq_sub: none(), src_a: none(), src_b: none(), dst_a: none(), dst_b: none(), st_t: none(), st_w: none(), joined_at: none(), note: none(), secret: SENS("m", "anonymize") }, retention: { m: { from: "joined_at", days: 30 } }, cdc: { include: false } } };
};
const badCases: Array<[string, (n: any, g: any) => void, string, readonly string[]]> = [
  ["entity PK users.id (PII arm)", (_n, g) => prot(g.entities.users.columns.id), `${UC}.id.protect`, ["primary key"]],
  ["entity PK users.id (none arm)", (_n, g) => { g.entities.users.columns.id = { pii: { category: "none" }, protect: PROT }; }, `${UC}.id.protect`, ["primary key"]],
  ["entity composite PK [1]", (n, g) => { addAttr(n, g, "users", "id2", "int"); n.node_types.users.key = ["id", "id2"]; delete n.node_types.users.registry; delete n.registries; prot(g.entities.users.columns.id2); }, `${UC}.id2.protect`, ["primary key"]],
  ["entity composite unique [1] users.email", (_n, g) => prot(g.entities.users.columns.email), `${UC}.email.protect`, ["unique key"]],
  ["entity nullable unique tuple", (n, g) => { withRoles(n, g); prot(g.entities.users.columns.opt_u); }, `${UC}.opt_u.protect`, ["unique key"]],
  ["entity unique+FK+scope users.organization_id (none arm)", (_n, g) => prot(g.entities.users.columns.organization_id), `${UC}.organization_id.protect`, ["unique key", "foreign key", "tenantScope.tenant"]],
  ["entity referenced PK+scope organizations.id (none arm)", (_n, g) => prot(g.entities.organizations.columns.id), `${OC}.id.protect`, ["primary key", "foreign key", "tenantScope.tenant"]],
  ["node FK local composite [0] (none arm)", (n, g) => { withRoles(n, g); prot(g.entities.users.columns.fk_a); }, `${UC}.fk_a.protect`, ["foreign key"]],
  ["node FK local composite [1] (sensitive arm)", (n, g) => { withRoles(n, g); g.entities.users.columns.fk_b = { ...SENS(), protect: PROT }; }, `${UC}.fk_b.protect`, ["foreign key"]],
  ["node FK nullable local self-ref", (n, g) => { withRoles(n, g); prot(g.entities.users.columns.manager_id); }, `${UC}.manager_id.protect`, ["foreign key"]],
  ["node FK referenced target [0]", (n, g) => { withRoles(n, g); prot(g.entities.organizations.columns.org_code); }, `${OC}.org_code.protect`, ["unique key", "foreign key"]],
  ["node FK referenced target [1]", (n, g) => { withRoles(n, g); prot(g.entities.organizations.columns.org_k2); }, `${OC}.org_k2.protect`, ["unique key", "foreign key"]],
  ["stored-edge separate PK [0]", (n, g) => { withRoles(n, g); prot(g.relations[M].columns.edge_id); }, `${MC}.edge_id.protect`, ["primary key"]],
  ["stored-edge separate PK [1]", (n, g) => { withRoles(n, g); prot(g.relations[M].columns.edge_seq); }, `${MC}.edge_seq.protect`, ["primary key"]],
  ["stored-edge unique [0]", (n, g) => { withRoles(n, g); prot(g.relations[M].columns.uniq_tag); }, `${MC}.uniq_tag.protect`, ["unique key"]],
  ["stored-edge nullable unique [1]", (n, g) => { withRoles(n, g); prot(g.relations[M].columns.uniq_sub); }, `${MC}.uniq_sub.protect`, ["unique key"]],
  ["stored-edge local source endpoint [0]", (n, g) => { withRoles(n, g); prot(g.relations[M].columns.src_a); }, `${MC}.src_a.protect`, ["foreign key"]],
  ["stored-edge local source endpoint [1] (sensitive arm)", (n, g) => { withRoles(n, g); g.relations[M].columns.src_b = { ...SENS("m", "anonymize"), protect: PROT }; }, `${MC}.src_b.protect`, ["foreign key"]],
  ["stored-edge local target endpoint [0]", (n, g) => { withRoles(n, g); prot(g.relations[M].columns.dst_a); }, `${MC}.dst_a.protect`, ["foreign key"]],
  ["stored-edge local target endpoint [1] (sensitive arm)", (n, g) => { withRoles(n, g); g.relations[M].columns.dst_b = { ...SENS("m", "anonymize"), protect: PROT }; }, `${MC}.dst_b.protect`, ["foreign key"]],
  ["stored-edge referenced source targetFields [0]", (n, g) => { withRoles(n, g); prot(g.entities.organizations.columns.org_ext); }, `${OC}.org_ext.protect`, ["unique key", "foreign key"]],
  ["stored-edge referenced source targetFields [1]", (n, g) => { withRoles(n, g); prot(g.entities.organizations.columns.org_ext2); }, `${OC}.org_ext2.protect`, ["unique key", "foreign key"]],
  ["stored-edge referenced target targetFields [0]", (n, g) => { withRoles(n, g); prot(g.entities.users.columns.usr_ext); }, `${UC}.usr_ext.protect`, ["unique key", "foreign key"]],
  ["stored-edge referenced target targetFields [1]", (n, g) => { withRoles(n, g); prot(g.entities.users.columns.usr_ext2); }, `${UC}.usr_ext2.protect`, ["unique key", "foreign key"]],
  ["entity tenant operand outside key/FK (none arm)", (n, g) => { withRoles(n, g); prot(g.entities.users.columns.t_op); }, `${UC}.t_op.protect`, ["tenantScope.tenant"]],
  ["entity tenant operand (sensitive arm)", (n, g) => { withRoles(n, g); g.entities.users.columns.t_op = { ...SENS(), protect: PROT }; }, `${UC}.t_op.protect`, ["tenantScope.tenant"]],
  ["entity workspace operand outside key/FK (none arm)", (n, g) => { withRoles(n, g); prot(g.entities.users.columns.w_op); }, `${UC}.w_op.protect`, ["tenantScope.workspace"]],
  ["entity workspace operand (sensitive arm)", (n, g) => { withRoles(n, g); g.entities.users.columns.w_op = { ...SENS("account", "anonymize"), protect: PROT }; }, `${UC}.w_op.protect`, ["tenantScope.workspace"]],
  ["stored-edge tenant operand", (n, g) => { withRoles(n, g); prot(g.relations[M].columns.st_t); }, `${MC}.st_t.protect`, ["tenantScope.tenant"]],
  ["stored-edge workspace operand", (n, g) => { withRoles(n, g); prot(g.relations[M].columns.st_w); }, `${MC}.st_w.protect`, ["tenantScope.workspace"]],
  ["entity unique renamed via physical.columns to payload name", (_n, g) => { g.entities.users.physical.columns = { email: "display_name", display_name: "email" }; prot(g.entities.users.columns.email); }, `${UC}.email.protect`, ["unique key"]],
  ["entity FK renamed via physical.columns to payload name", (n, g) => { withRoles(n, g); g.entities.users.physical.columns = { fk_a: "mfa_state", mfa_state: "fk_a" }; prot(g.entities.users.columns.fk_a); }, `${UC}.fk_a.protect`, ["foreign key"]],
  ["entity workspace renamed via physical.columns to payload name", (n, g) => { withRoles(n, g); g.entities.users.physical.columns = { w_op: "display_name", display_name: "w_op" }; prot(g.entities.users.columns.w_op); }, `${UC}.w_op.protect`, ["tenantScope.workspace"]],
  ["stored-edge endpoint renamed via physical.columns to payload name", (n, g) => { withRoles(n, g); g.relations[M].physical = { table: "org_users", columns: { src_a: "note", note: "src_a", dst_a: "secret", secret: "dst_a" } }; prot(g.relations[M].columns.src_a); }, `${MC}.src_a.protect`, ["foreign key"]],
  ["stored-edge PK renamed via physical.columns to payload name", (n, g) => { withRoles(n, g); g.relations[M].physical = { columns: { edge_id: "note", note: "edge_id" } }; prot(g.relations[M].columns.edge_id); }, `${MC}.edge_id.protect`, ["primary key"]],
];
it.each(badCases)("refuses %s on raw and normalized N", (_label, mutate, path, roles) => {
  const n = baseN(), g = baseG2(); mutate(n, g);
  const norm = normalizeOntologyProfile(parseOntologyProfile(n)); g.profile.pin.contentDigest = norm.profile_hash;
  for (const [nIn, gIn] of [[n, g], [norm, structuredClone(g)]] as const) {
    const errs = validateModelGovernance(nIn, gIn);
    expect(errs.map((e) => e.split(" ")[0])).toStrictEqual([path]); // kills: accepting protected PK/unique/FK/stored-endpoint/scope column on raw or normalized N
    expect(errs[0]).toContain(`on ${roles.join(", ")} column ${path.split(".")[3]}`); // kills: omitting or over-reporting key, unique, foreign-key, or scope roles on entities and stored edges
    expect(() => sealModelGovernance(nIn, gIn)).toThrow(path); // kills: sealModelGovernance bypassing column-protection role checks
  }
});
it("keeps eligible protected payloads passing across PII arms, SQL overrides, same-name tables, and v2/v3 digests", () => {
  const n = baseN(), g = baseG2(); withRoles(n, g);
  g.entities.users.retention.anon = { from: "created_at", days: 30 };
  g.entities.users.columns.display_name = { ...SENS("account", "delete"), protect: PROT };
  g.entities.users.columns.password_hash = { ...SENS("anon", "anonymize"), protect: PROT };
  g.entities.users.columns.mfa_state = { pii: { category: "none" }, protect: PROT };
  g.entities.users.columns.status = { pii: { category: "personal" }, retention: "account", erasure: "delete", protect: PROT };
  g.entities.organizations.columns.org_note = { pii: { category: "none" }, protect: PROT };
  g.relations[M].columns.note = { pii: { category: "none" }, protect: PROT };
  g.relations[M].columns.secret = { ...SENS("m", "anonymize"), protect: PROT };
  g.entities.users.physical.columns = { email: "display_name", display_name: "email", fk_a: "mfa_state", mfa_state: "fk_a", t_op: "password_hash", password_hash: "t_op", w_op: "status", status: "w_op" };
  g.entities.organizations.physical = { table: "orgs", columns: { org_code: "org_note", org_note: "org_code" } };
  g.relations[M].physical = { table: "org_users", columns: { src_a: "note", note: "src_a", dst_a: "secret", secret: "dst_a", edge_id: "pk_sql", st_t: "t_sql", st_w: "w_sql" } };
  const norm = normalizeOntologyProfile(parseOntologyProfile(n)); g.profile.pin.contentDigest = norm.profile_hash;
  for (const nIn of [n, norm]) {
    expect(validateModelGovernance(nIn, g)).toStrictEqual([]); // kills: rejecting eligible protected payloads on both PII arms or checking SQL override names instead of logical names
    expect(sealModelGovernance(nIn, g).bytes).toContain('"note":{"pii":{"category":"none"},"protect":{"encrypt":true}}'); // kills: dropping or rejecting protected none payload on stored edge
  }
  const nSame = baseN(), gSame = baseG2(); withRoles(nSame, gSame);
  nSame.node_types[M] = { attributes: [{ name: "id", type: { kind: "uuid" }, nullable: false }, { name: "src_a", type: { kind: "text" }, nullable: true }], key: ["id"] };
  gSame.entities[M] = { tenantScope: { kind: "global" }, columns: { id: none(), src_a: { pii: { category: "none" }, protect: PROT } }, physical: { table: "membership_nodes" }, cdc: { include: false } };
  addAttr(nSame, gSame, "organizations", "email", "text", true, { pii: { category: "none" }, protect: PROT });
  addAttr(nSame, gSame, "organizations", "t_op", "text", true, { pii: { category: "none" }, protect: PROT });
  addAttr(nSame, gSame, "organizations", "w_op", "text", true, { pii: { category: "none" }, protect: PROT });
  gSame.entities.organizations.tenantScope = { kind: "global" };
  gSame.entities.users.columns.id = { ...gSame.entities.users.columns.id, protect: undefined };
  gSame.relations[M].columns.src_a = { pii: { category: "none" }, protect: undefined };
  expect(validateModelGovernance(normalizeOntologyProfile(parseOntologyProfile(nSame)), gSame)).toStrictEqual([]); // kills: conflating entity/relation FK maps, leaking key/scope across tables, or rejecting protect:undefined on key/endpoint
  const gFalse = baseG2(); gFalse.entities.users.columns.id.protect = { encrypt: false };
  expect(validateModelGovernance(baseN(), gFalse).map((e) => e.split(" ")[0])).toStrictEqual([`${UC}.id.protect.encrypt`]); // kills: emitting spurious role error when protect.encrypt is false
  for (const [sc, exp] of [[{ kind: "global", tenant: "display_name" }, "entities.users.tenantScope.tenant"], [{ kind: "global", workspace: "display_name" }, "entities.users.tenantScope.workspace"], [Object.assign(Object.create({}), { kind: "tenant", tenant: "display_name", workspace: "mfa_state" }), "entities.users.tenantScope"]] as const) {
    const gg = baseG2(); gg.entities.users.tenantScope = sc; prot(gg.entities.users.columns.display_name); prot(gg.entities.users.columns.mfa_state);
    expect(validateModelGovernance(baseN(), gg).map((e) => e.split(" ")[0])).toStrictEqual([exp]); // kills: skipping isRecord(sc) or sc.kind === "tenant" on tenant/workspace scope role check
  }
  const baseNorm = normalizeOntologyProfile(parseOntologyProfile(baseN())), nPre = JSON.stringify(stableForHash(baseNorm));
  const g3 = baseG2(); g3.version = "3"; g3.entities.users.columns.display_name = { ...SENS("account", "delete"), protect: PROT };
  const s2 = sealModelGovernance(baseNorm, gov2), s3 = sealModelGovernance(baseNorm, g3);
  expect(Buffer.byteLength(nPre, "utf8")).toBe(N_BYTES); expect(baseNorm.profile_hash).toBe(N_DIGEST); // kills: N preimage byte or digest drift
  expect(s2.byteLength).toBe(G2_BYTES); expect(s2.digest).toBe(G2_DIGEST); // kills: users-governance@2 byte or digest drift
  expect(s3.byteLength).toBe(G3_BYTES); expect(s3.digest).toBe(G3_DIGEST); expect(sha256(s3.bytes)).toBe(G3_DIGEST); // kills: users-governance@3 byte or digest drift
});
