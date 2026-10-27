// Node-only authoring utility. Expected documents are derived from pinned
// producer bytes and the frozen §8.7 oracle, independently of migrations.
// It never invokes an executor, layout, renderer or external producer.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusDir = path.join(root, "tests/fixtures/pinned-sources/corpus");
const indexFile = path.join(corpusDir, "index.json");
const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
const compiled = await build({ entryPoints: [path.join(root, "src/ontology-guardian/canonical.ts")], bundle: true, platform: "node", format: "esm", write: false });
const { canonicalBytes, sha256Hex } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const read = id => {
  const entry = index.find(entry => entry.id === id);
  if (!entry) throw new Error(`missing ${id}`);
  const bytes = fs.readFileSync(path.join(corpusDir, entry.fixture));
  if (sha256Hex(bytes) !== entry.sha256) throw new Error(`fixture drift: ${id}`);
  return JSON.parse(bytes.toString("utf8"));
};
const oracle = read("oracle:derived-json");
const contractPin = { id: "diagram-presentation", version: "1", contentDigest: "74dadb9c31fff7653ca31692d8db3cfea782baea8d9268a3c20982ea8ab0aeae" };
const text = value => ({ kind: "text", value });
const geometry = { x: 0, y: 0, width: 460, height: 200 };
const presentationSchema = [
  { name: "kicker", kind: "text", maxLength: 80 }, { name: "body", kind: "text", maxLength: 400 },
  { name: "detail", kind: "text", maxLength: 400 }, { name: "subtitle", kind: "text", maxLength: 600 },
  { name: "footer", kind: "text", maxLength: 120 }, { name: "icon", kind: "text", maxLength: 40 },
  { name: "category", kind: "text", minLength: 1, maxLength: 40, pattern: "^[a-z][a-z0-9-]*$", patternName: "key" },
];
function materializeCards(instance) {
  const id = instance.id;
  const raw = read(`instance:${id}`);
  const scene = id === "A1" ? raw.en.architectureScenes.central : raw;
  const records = id === "A1" ? [
    ...scene.nodes.map(node => ({ id: node.id, kind: "card", parent: node.parentId, label: node.data.title,
      category: node.data.tone, kicker: node.data.kicker, body: node.data.function, detail: node.data.detail,
      footer: node.data.cardFooter, icon: node.data.cardIcon })),
    ...scene.groups.map(group => ({ id: group.id, kind: "zone", parent: group.parentId,
      label: group.titleLines.join(" "), category: group.tone, kicker: group.kicker, subtitle: group.subtitle })),
  ] : scene.entities.map(entity => ({ ...entity, category: entity.tint ?? "none", kicker: entity.code, body: entity.role }));
  const links = id === "A1" ? scene.edges.map(edge => ({ id: edge.id, from: edge.source, to: edge.target, label: edge.label })) : scene.relations;
  const source = { documentId: `document:corpus-${id}`, schemaVersion: { major: 1, minor: 1 }, revision: 1, profileRefs: ["generic@1"],
    entities: {}, relations: {}, ports: {}, resources: {}, extensions: [], typeDefinitions: {
      "corpus-card": { id: "corpus-card", profile: "generic@1", baseType: "node", attributes: presentationSchema },
      "corpus-zone": { id: "corpus-zone", profile: "generic@1", baseType: "container", attributes: presentationSchema },
    } };
  const sourceView = { viewId: `view:corpus-${id}`, semanticDocumentId: source.documentId, revision: 1,
    entityOccurrences: {}, relationOccurrences: {}, portOccurrences: {}, groups: {}, filters: [],
    presentation: { camera: { x: 0, y: 0, zoom: 1 }, diagram: { contractPin, entities: {}, legends: {}, categoryTokens: [] } } };
  const expectedDocument = { ...structuredClone(source), profileRefs: ["generic@2"], typeDefinitions: {}, entities: {}, relations: {} };
  const expectedView = structuredClone(sourceView);
  for (const record of records) {
    const ref = `entity:${record.id}`, occurrence = `occurrence:${record.id}`;
    const type = record.kind === "zone" ? "container" : "node";
    const attrs = { name: text(record.label), category: text(record.category ?? "none") };
    if (record.store === true) attrs.tags = { kind: "collection", items: [text("store")] };
    const slots = {};
    for (const key of ["kicker", "body", "detail", "subtitle", "footer", "icon"]) {
      if (typeof record[key] === "string") slots[key] = record[key];
    }
    source.entities[ref] = { id: ref, profile: "generic@1", type: type === "container" ? "corpus-zone" : "corpus-card",
      attributes: { ...structuredClone(attrs), ...Object.fromEntries(Object.entries(slots).map(([key, value]) => [key, text(value)])) } };
    expectedDocument.entities[ref] = { id: ref, profile: "generic@2", type, attributes: attrs };
    sourceView.entityOccurrences[occurrence] = { id: occurrence, entity: ref, geometry };
    expectedView.entityOccurrences[occurrence] = { id: occurrence, entity: ref, geometry };
    const presentation = { form: type === "container" ? "container" : "card", text: {}, categoryRef: `entity:legend-key-${record.category ?? "none"}` };
    for (const [slot, value] of Object.entries(slots)) { if (slot === "icon") presentation.icon = value; else presentation.text[slot] = value; }
    // A distinct authored view title remains view data.
    if (typeof record.name === "string" && record.name !== record.label) {
      presentation.text.title = record.name;
      sourceView.presentation.diagram.entities[occurrence] = { form: presentation.form, text: { title: record.name } };
    }
    expectedView.presentation.diagram.entities[occurrence] = presentation;
    if (record.parent != null) {
      const relationId = `relation:contains-${record.id}`;
      const relation = { id: relationId, profile: "generic@1", type: "contains", attributes: {}, endpoints: [{ role: "parent", target: `entity:${record.parent}` }, { role: "child", target: ref }] };
      source.relations[relationId] = relation; expectedDocument.relations[relationId] = { ...structuredClone(relation), profile: "generic@2" };
    }
  }
  for (const link of links) {
    const ref = `relation:${link.id}`;
    const relation = { id: ref, profile: "generic@1", type: "link", endpoints: [{ role: "source", target: `entity:${link.from}` }, { role: "target", target: `entity:${link.to}` }], attributes: typeof link.label === "string" ? { label: text(link.label) } : {} };
    source.relations[ref] = relation; expectedDocument.relations[ref] = { ...structuredClone(relation), profile: "generic@2" };
  }
  for (const relation of Object.values(source.relations)) {
    const occurrence = `occurrence:${relation.id.slice("relation:".length)}`;
    const drawn = { id: occurrence, relation: relation.id, endpoints: relation.endpoints.map(endpoint => ({ role: endpoint.role, occurrence: `occurrence:${endpoint.target.slice("entity:".length)}` })),
      ...(instance.dashedRelationIds.includes(relation.id) ? { strokeStyle: "dashed" } : {}) };
    sourceView.relationOccurrences[occurrence] = drawn; expectedView.relationOccurrences[occurrence] = structuredClone(drawn);
  }
  const addedEntityIds = ["entity:legend"], addedRelationIds = [];
  expectedDocument.entities["entity:legend"] = { id: "entity:legend", profile: "generic@2", type: "legend", attributes: { name: text("Legend") } };
  expectedView.entityOccurrences["occurrence:legend"] = { id: "occurrence:legend", entity: "entity:legend", geometry };
  expectedView.presentation.diagram.entities["occurrence:legend"] = { form: "legend", text: {} };
  for (const category of instance.categories) {
    const ref = `entity:legend-key-${category}`, occ = `occurrence:legend-key-${category}`, relation = `relation:legend-key-${category}`;
    addedEntityIds.push(ref); addedRelationIds.push(relation);
    expectedDocument.entities[ref] = { id: ref, profile: "generic@2", type: "legend-key", attributes: { name: text(category), category: text(category) } };
    expectedDocument.relations[relation] = { id: relation, profile: "generic@2", type: "contains", attributes: {}, endpoints: [{ role: "parent", target: "entity:legend" }, { role: "child", target: ref }] };
    expectedView.entityOccurrences[occ] = { id: occ, entity: ref, geometry };
    expectedView.presentation.diagram.entities[occ] = { form: "legend-key", text: {} };
    expectedView.relationOccurrences[`occurrence:legend-key-containment-${category}`] = { id: `occurrence:legend-key-containment-${category}`, relation, endpoints: [{ role: "parent", occurrence: "occurrence:legend" }, { role: "child", occurrence: occ }] };
  }
  expectedView.presentation.diagram.legends["occurrence:legend"] = { order: instance.categories.map(category => `entity:legend-key-${category}`) };
  expectedView.presentation.diagram.categoryTokens = instance.categories.map(category => ({ legendRef: "entity:legend", category, token: oracle.categoryTokens[category] }));
  expectedView.summaryLabels = Object.fromEntries(instance.summaries.map(summary => [summary.id, summary]));
  for (const occurrence of instance.defaultFolds) expectedView.groups[`fold:${occurrence}`] = { id: `fold:${occurrence}`, occurrence, collapsed: true };
  return { id, source, sourceView, expectedDocument, expectedView, addedEntityIds, addedRelationIds,
    expectedSemanticDiagnostics: instance.expectedSemanticDiagnostics, expectedViewDiagnostics: instance.expectedViewDiagnostics,
    hints: instance.hints, defaultFolds: instance.defaultFolds, qualification: instance.qualification };
}
function materializeA5(instance) {
  const source = read("instance:A5-semantic"), sourceView = read("instance:A5-view");
  const expectedDocument = { ...structuredClone(source), profileRefs: ["generic@2"], entities: structuredClone(instance.entities), typeDefinitions: {},
    relations: Object.fromEntries(Object.entries(source.relations).map(([id, relation]) => [id, { ...structuredClone(relation), profile: "generic@2" }])),
    extensions: source.extensions.filter(extension => extension.namespace !== "hrpn.zone-slots") };
  const expectedView = structuredClone(sourceView);
  expectedView.presentation.diagram = { contractPin, entities: structuredClone(instance.presentationEntities),
    legends: { "occurrence:LEGEND": { order: instance.legendOrder } },
    categoryTokens: instance.categories.map(category => ({ legendRef: "entity:LEGEND", category, token: oracle.categoryTokens[category] })) };
  // Layout remains an owner gate; retained source geometry is not executed.
  return { id: "A5", source, sourceView, expectedDocument, expectedView,
    expectedSemanticDiagnostics: instance.expectedSemanticDiagnostics, expectedViewDiagnostics: instance.expectedViewDiagnostics,
    hints: instance.hints, defaultFolds: instance.defaultFolds, qualification: instance.qualification };
}
for (const instance of oracle.instances) {
  const value = instance.id === "A5" ? materializeA5(instance) : materializeCards(instance);
  const bytes = `${canonicalBytes(value)}\n`, sha256 = sha256Hex(bytes), id = `derived:cards-${instance.id}`;
  const entry = { id, kind: "derived-oracle", source: { repo: "graphify", revision: "sha256:deb64b75e884bfefbdd97de698c899805568271ea1fc521fffe02cbc20288c2f", path: `m3/SPEC_EVOL_GD_M3_DIAGRAM_MODEL-FROZEN-deb64b75.md#8.7/materialization/${instance.id}` },
    sha256, expectation: "Complete semantic/view source and expected target; source strings/ids and explicit legend additions preserved; layout and executor qualification remain owner gates.", fixture: `${sha256}.bytes` };
  const existing = index.find(entry => entry.id === id);
  if (existing && existing.sha256 !== sha256) throw new Error(`immutable derived fixture drift: ${id}`);
  fs.writeFileSync(path.join(corpusDir, entry.fixture), bytes);
  if (!existing) index.push(entry);
}
fs.writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
const manifestPath = path.join(root, "src/ontology-guardian/diagram-corpus.ts");
const header = fs.readFileSync(manifestPath, "utf8").split("export const CORPUS_MANIFEST")[0];
fs.writeFileSync(manifestPath, header + "export const CORPUS_MANIFEST: readonly CorpusEntry[] = " + JSON.stringify(index.map(({ fixture, ...entry }) => entry), null, 2) + ";\n\nexport const REQUIRED_CORPUS_IDS: readonly string[] = " + JSON.stringify(index.map(entry => entry.id), null, 2) + ";\n\nexport function corpusEntryById(id: string): CorpusEntry | undefined {\n  return CORPUS_MANIFEST.find(entry => entry.id === id);\n}\n");
console.log(`${oracle.instances.length} complete card cases pinned; ${index.length} corpus entries`);
