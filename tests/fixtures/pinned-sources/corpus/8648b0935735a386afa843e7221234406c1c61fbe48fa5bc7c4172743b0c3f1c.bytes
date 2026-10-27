import { packGovernanceScene } from './governance-layout.js';
import { nodeContent, groupContent } from './architecture-layout.js';

// Functional placement follows OWNER-FEEDBACK-RAW.md; package locations are evidence,
// not the taxonomy. The build prepares one local SVG route per selected need.
export function buildGovernanceCentral() {
  const scene = {
    id: 'central',
    title: 'Diagramme central · Gouvernance unifiée et routage des besoins',
    shortCaption: 'h2a, Engram, Sentropic et Design System ; accès CLI, Cowork, Cloud et fournisseurs IA. Les cadres classent les responsabilités ; les flèches suivent le besoin choisi.',
    caption: 'Retour propriétaire du 18 octobre 2026, conservé intégralement dans l’annexe « Retour du propriétaire » (captures 24, 22, 23). La classification demandée est représentée ici ; la qualification des implémentations reste distincte. Stockage : interface DB neutre portée par Sentropic/cluster-mesh ; trois surfaces optimisées transactionnelle, analytique et graphe live ; SQLite et Postgres prioritaires. E2/L5 doit qualifier le transactionnel sur SQLite (Node 24), puis Postgres ; les preuves Postgres/S3 #684 ne qualifient pas cette cible. LLM mesh/gateway : code publié ; juge JEV : sur branche. Liaisons des fournisseurs ChatGPT/Gemini/Claude/Muse et familles SAM-YOLO/TTS/STT : qualification à établir. Sources : OWNER-REQUEST.md, ../cluster-mesh-storage/OWNER-ORIENTATIONS.md, owner-diagram-decisions-via-hcond.md, OWNER-FEEDBACK-RAW.md, proposal-astra.md, h2a.md et engram.md. La première carte C01–C14 attend toujours la carte du propriétaire.',
    legend: 'Cadres : responsabilités et familles du catalogue. Ambre : cible ou qualification en cours ; bleu : sécurité et mandats. Flèches : relations nommées du parcours sélectionné ; pointillés : raccordements proposés. La vue complète présente les principales liaisons ; chaque besoin révèle ses propres relations.',
    parentContainerIds: [], nodes: [], groups: [], junctions: [], edges: [],
    bands: [],
    summaryLabels: {"h2a:surfaces":"Harnais et collaboration","surfaces:cluster-mesh":"Sessions et outils","h2a:cluster-mesh":"Outils h2a","cluster-mesh:h2a":"Messages a2a","cluster-mesh:surfaces":"Déploiement des applications","engram:cluster-mesh":"Mémoire et savoir","cluster-mesh:engram":"Journaux et métriques","engram:design-system":"Diagram Graphs","design-system:cluster-mesh":"Canvas UI","h2a:design-system":"Schéma et skill Focus"},
  };
  const group = (id, parentId, title, subtitle, x, y, width, tone = 'neutral') => {
    const entry = { id, parentId, title, subtitle, position: { x, y }, width, height: 0, headerHeight: 66, tone };
    scene.groups.push(entry);
    return entry;
  };
  const node = (id, parentId, x, y, width, title, fn, detail, tone = 'neutral') => {
    const data = { title, function: fn, detail, tone, kind: 'component', layoutWidth: width };
    const content = nodeContent(data);
    const entry = { id, parentId, position: { x, y }, width: content.width, height: content.height, data: { ...data, text: content.text } };
    scene.nodes.push(entry);
    return entry;
  };
  const fit = entry => {
    const children = [...scene.groups, ...scene.nodes].filter(child => child.parentId === entry.id);
    entry.height = Math.max(...children.map(child => child.position.y + child.height)) + 16 - entry.position.y;
  };

  const h2a = group('h2a', null, 'h2a · Organisation IA responsable', 'Workspace · humains et agents · Track · Focus', 0, 44, 710);
  node('h2a-roles', h2a.id, 16, 160, 310, 'Rôles et mandats', 'Organisation humains-agents · C01', 'RACI · acteurs vérifiés · scope-guard', 'identity');
  node('h2a-focus', h2a.id, 384, 160, 310, 'Décision → Focus', 'Schéma et skill du dossier · C03', 'Dossier Focus · choix propriétaire', 'proposal');
  node('h2a-track', h2a.id, 16, 334, 310, 'Demandes → Track', 'WP · items · acceptation · C02/C04', 'Journal append-only · demande → prod', 'proposal');
  node('h2a-agent', h2a.id, 384, 334, 310, 'Agents, session, inbox', 'PTY · harness · MCP ui://', 'Conduite · feedback · équipement');
  fit(h2a);

  const access = group('surfaces', null, 'Surfaces d’accès', 'Fournisseurs IA · Cowork · CLI · applications tierces', 850, 44, 710);
  node('surf-ai', access.id, 866, 160, 310, 'Fournisseurs IA', 'ChatGPT · Gemini · Claude · Muse', 'Cowork/MCP : qualifier chaque liaison', 'proposal');
  node('surf-cowork', access.id, 1234, 160, 310, 'Poste Cowork', 'cowork-desktop et cowork-bridge', 'Consentement · priorité humaine 60 s');
  node('surf-cli', access.id, 866, 334, 310, 'Poste CLI', 'h2a-cli · @sentropic/harness', 'Checkout local · sessions mandatées');
  node('surf-cloud', access.id, 1234, 334, 310, 'Apps Sentropic/tiers', 'OpenERP · nc-fullstack · CV', 'Catalogue ↔ instances hébergées', 'proposal');
  fit(access);

  const services = group('cluster-mesh', null, 'Sentropic · Plateforme agentique', 'API · workflows · catalogues · sécurité et observabilité · stockage · intégration', 0, 530, 1560, 'proposal');
  node('cm-apis', services.id, 32, 604, 430, '1. API serveur', 'Façades HTTP / SSE / MCP', 'Transport · contrats d’accès');
  node('cm-workflow', services.id, 574, 604, 430, '2. Workflows agents', 'Sessions CLI, Cowork, ADK, etc.', 'WorkspaceBindingStore · PTY/API');

  const catalog = group('cm-catalog', services.id, '3. Catalogues', 'MCP · IA · ressources · UI, canvas et apps', 16, 742, 494, 'proposal');
  const mcp = group('cat-mcp', catalog.id, 'MCP · Connecteurs', 'Ressources · connecteurs · registre synchrone', 32, 808, 462);
  node('mcp-comments', mcp.id, 48, 874, 430, 'Harnais · outils h2a', 'annotate, Track, Focus, sessions, etc.', 'Outils h2a · annotation via comments');
  node('mcp-tools', mcp.id, 48, 996, 430, 'Mémoires/ontologies', '6 outils mémoire · ontology_call', 'Contrats mémoire et ontologies', 'proposal');
  node('mcp-connectors', mcp.id, 48, 996, 430, 'Connecteurs à broker', 'Gmail · GChat · Atlassian · GitHub', 'Notion·Slack·OpenERP·WaveApps·Stripe', 'proposal');
  fit(mcp);
  node('cat-ai', catalog.id, 32, 1118, 462, 'Catalogue IA', 'LLM, juge, vision/SAM-YOLO, TTS, STT', 'Mesh/gateway; JEV branche; IA à valider', 'proposal');
  node('cat-resources', catalog.id, 32, 1250, 462, 'Catalogue Agents', 'Skills · tools · agents · workflows · apps', 'Artefacts · C08', 'proposal');
  node('cat-ui', catalog.id, 32, 1250, 462, 'UI · canvas et apps', 'bpmn-canvas · templater Sentropic', 'UI prod · artifacts · MCP/ui://', 'proposal');
  fit(catalog);

  const storage = group('cm-storage', services.id, '4. Stockage', 'Interface DB neutre · SQLite / Postgres d’abord', 558, 742, 494, 'proposal');
  node('store-models', storage.id, 574, 808, 462, 'Modèles · sérialisation', 'Transactionnel · analytique · graphe live', 'Graphe live en base · annotations', 'proposal');
  node('store-artifacts', storage.id, 574, 930, 462, 'Artefacts', '@sentropic/artifacts · SHA-256', 'Blobs/canvas/UI · cycle DL-8/13/17');
  fit(storage);

  const security = group('cm-security', services.id, '5. Sécurité et observabilité', 'Responsabilités distinctes des capacités IA', 1100, 596, 444, 'identity');
  node('sec-access', security.id, 1116, 662, 412, 'Accès et sièges', 'IAM · NHI · 2FA · droits · consentement', 'MFA #695 · garde centrale #596', 'identity');
  node('sec-observe', security.id, 1116, 784, 412, 'Observabilité et audit', 'Logs · métriques · traces · reçus', 'auditId · soumis/commis/accepté', 'identity');
  fit(security);

  const integration = group('cm-cluster', services.id, '6. Intégration', 'Instances Sentropic · cloud et registres externes', 1100, 958, 444);
  node('cluster-instances', integration.id, 1116, 1024, 412, 'Instances Sentropic', 'Contrats et échanges par API', 'API : exposition · Cluster : intégration');
  node('cluster-infra', integration.id, 1116, 1244, 412, 'Cloud et registres', 'K8s · mails transactionnels · cloud', 'App Store · agents · MCP · déploiement', 'proposal');
  fit(integration);
  fit(services);

  const lowerY = services.position.y + services.height + 220;

  const engram = group('engram', null, 'Engram · Connaissances qualifiées', "Enrichi par l'IA, validé par l'humain · ontologies · mémoire", 0, lowerY, 710, 'proposal');
  node('eng-memory', engram.id, 16, lowerY + 66, 310, 'Mémoire live agents', 'D3 trans. · D1=C analyse · Git/D10', 'Surfaces sans backend ni pilote natif', 'proposal');
  node('eng-ontologies', engram.id, 384, lowerY + 66, 310, 'Ontologies · WP9', 'dev · track · archi · temps D1=C', 'Profils gouvernés · exports typés', 'proposal');
  fit(engram);

  const ds = group('design-system', null, 'Design System · Vues collaboratives', "Annotations · diagrammes · dossiers de décision · composants UI prêts pour l'IA", 850, lowerY, 710);
  node('ds-annotations', ds.id, 866, lowerY + 66, 310, 'Annotation', 'Présentation · ancre opaque', 'Propositions → modèle Sentropic · G3', 'proposal');
  node('ds-diagram', ds.id, 1234, lowerY + 66, 310, 'Diagramme', 'Graphe × layout × présentation', 'Gigogne · éditions atomiques · JS', 'proposal');
  node('ds-dossier', ds.id, 866, lowerY + 206, 310, 'Dossier de décision', 'Rendu du schéma et de la skill Focus', '<st-decision-dossier> · C03/C09', 'proposal');
  node('ds-components', ds.id, 1234, lowerY + 206, 310, '200+ composants UI', '221 exports Svelte · thèmes · <st-*>', 'Canvas · offline sans CDN · C09');
  fit(ds);

  const byId = new Map([...scene.groups, ...scene.nodes].map(entry => [entry.id, entry]));
  for (const entry of scene.nodes) {
    entry.data.fontScale = 12 / 7;
      const family = {
        h2a: ['people', 'ORGANISATION'], surfaces: ['window', 'ACCÈS'],
        'cluster-mesh': ['server', 'SERVICE'], 'cat-mcp': ['link', 'MCP · OUTILS'],
        'cm-catalog': ['window', 'CATALOGUE'], 'cm-storage': ['db', 'STOCKAGE'],
        'cm-security': ['shield', 'CONFIANCE'], 'cm-cluster': entry.id === 'cluster-infra' ? ['cloud', 'PROVIDERS'] : ['link', 'INTER-INSTANCE'],
        engram: ['db', 'CONNAISSANCE'],
        'design-system': ['window', 'DESIGN SYSTEM'],
      }[entry.parentId];
      [entry.data.cardIcon, entry.data.kicker] = family;
      if (entry.id === 'cat-ai') entry.data.cardIcon = 'brain';
      if (entry.id === 'cat-resources') entry.data.cardIcon = 'robot';
      let owner = byId.get(entry.parentId);
      while (owner.parentId) owner = byId.get(owner.parentId);
      entry.data.cardFooter = `service: ${owner.title.split(' · ')[0]}`;
      entry.data.status = ['surf-ai', 'cat-ai'].includes(entry.id) ? 'qualification' : null;
  }

  const relations = [
    ['e-roles-track', 'h2a-roles', 'h2a-track', 'Mandats et WP'],
    ['e-track-agent', 'h2a-track', 'h2a-agent', 'Items'],
    ['e-focus-agent', 'h2a-focus', 'h2a-agent', 'Dossiers Focus'],
    ['e-h2a-cli', 'h2a-agent', 'surf-cli', 'Harnais et collaboration'],
    ['e-h2a-chat', 'h2a-agent', 'surf-ai', 'Harnais et collaboration'],
    ['e-h2a-cowork', 'h2a-agent', 'surf-cowork', 'Harnais et collaboration'],
    ['e-cli-api', 'surf-cli', 'cm-apis', 'Accès CLI'],
    ['e-cowork-api', 'surf-cowork', 'cm-apis', 'Accès Cowork'],
    ['e-cloud-api', 'surf-cloud', 'cm-apis', 'Accès Cloud'],
    ['e-ai-api', 'surf-ai', 'cm-apis', 'MCP via façade'],
    ['e-ai-cowork', 'surf-ai', 'surf-cowork', 'Liaison Cowork'],
    ['e-api-mcp', 'cm-apis', 'mcp-tools', 'Expose les MCP'],
    ['e-api-comments', 'cm-apis', 'mcp-comments', 'Expose le harnais MCP'],
    ['e-api-connectors', 'cm-apis', 'mcp-connectors', 'Broker MCP'],
    ['e-h2a-tools', 'h2a-agent', 'mcp-comments', 'Publie ses outils'],
    ['e-api-ai', 'cm-apis', 'cat-ai', 'Expose les IA'],
    ['e-api-catalog', 'cm-apis', 'cat-resources', 'Expose le catalogue'],
    ['e-apis-wf', 'cm-apis', 'cm-workflow', 'Appels'],
    ['e-api-sec', 'cm-apis', 'sec-access', 'Autorisation'],
    ['e-api-cluster', 'cm-apis', 'cluster-instances', 'Intégration'],
    ['e-mesh-h2a', 'cm-workflow', 'h2a-agent', 'Messages a2a'],
    ['e-wf-ai', 'cm-workflow', 'cat-ai', 'Appels IA'],
    ['e-wf-store', 'cm-workflow', 'store-models', 'États de session'],
    ['e-wf-observe', 'cm-workflow', 'sec-observe', 'Traces et reçus'],
    ['e-ai-sec', 'cat-ai', 'sec-access', 'Garde et droits'],
    ['e-comments-sec', 'mcp-comments', 'sec-access', 'Autorisation'],
    ['e-comments-store', 'mcp-comments', 'store-models', 'Persiste annotation'],
    ['e-comments-inbox', 'mcp-comments', 'cm-workflow', 'Remise autorisée'],
    ['e-sec-observe', 'sec-access', 'sec-observe', 'Audit des accès'],
    ['e-catalog-artifacts', 'cat-resources', 'store-artifacts', 'Références / hébergement'],
    ['e-cloud-catalog', 'surf-cloud', 'cat-resources', 'Synchronise le catalogue'],
    ['e-artifacts-infra', 'store-artifacts', 'cluster-infra', 'Release à déployer'],
    ['e-api-provider', 'cm-apis', 'cluster-infra', 'Intégrations providers'],
    ['e-infra-cloud', 'cluster-infra', 'surf-cloud', 'Déploiement des applications'],
    ['e-infra-observe', 'cluster-infra', 'sec-observe', 'Reçus de déploiement'],
    ['e-eng-mem', 'eng-memory', 'mcp-tools', 'Contrats mémoire'],
    ['e-eng-onto', 'eng-ontologies', 'mcp-tools', 'Contrats ontologies'],
    ['e-eng-store', 'eng-memory', 'store-models', 'Déclare la surface'],
    ['e-eng-observe', 'sec-observe', 'eng-ontologies', 'Journaux et métriques'],
    ['e-eng-ds', 'eng-ontologies', 'ds-diagram', 'Diagram Graphs'],
    ['e-ds-comments', 'ds-annotations', 'mcp-comments', 'Annotate via façade MCP'],
    ['e-ds-store', 'ds-diagram', 'store-models', 'Sérialisation neutre'],
    ['e-focus-dossier', 'h2a-focus', 'ds-dossier', 'Schéma et skill'],
    ['e-dossier-diagram', 'ds-dossier', 'ds-diagram', 'Diagramme central'],
    ['e-dossier-annotations', 'ds-dossier', 'ds-annotations', 'Feedback'],
    ['e-ds-components', 'ds-diagram', 'ds-components', 'Rendu UI'],
    ['e-ds-catalog', 'ds-components', 'cat-ui', 'Descripteurs canvas / UI'],
    ['e-ui-resources', 'cat-ui', 'cat-resources', 'Catalogue logique'],
    ['e-ui-artifacts', 'cat-ui', 'store-artifacts', 'Hébergement UI / apps'],
    ['e-canvas-mcp', 'cat-ui', 'mcp-tools', 'Liaison MCP / ui://'],
  ];
  scene.edges = relations.map(([id, source, target, label]) => ({ id, source, target, label, class: 'reject', data: { labelFontSize: 21, pillLabel: true } }));
  scene.overviewEdges = ['e-h2a-cli', 'e-h2a-chat', 'e-h2a-cowork', 'e-ai-cowork', 'e-cli-api', 'e-apis-wf', 'e-api-mcp', 'e-eng-mem', 'e-eng-ds', 'e-api-cluster', 'e-api-provider', 'e-ds-comments'];
  return packGovernanceScene(scene);
}
