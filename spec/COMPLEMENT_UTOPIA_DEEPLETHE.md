# COMPLEMENT — Utopia (DeepLethe) face au substrat mémoire et knowledge neutre de Graphify

**Auteur / modèle :** construit par OpenAI Codex `gpt-5.6-sol` (effort xhigh). Double revue adversariale factuelle (source-fetch exécuté par chaque jambe) : `claude-opus-4-8` (chemin natif Anthropic — catégorie 3, indépendance forte) et `gpt-5.6-terra` (xhigh — catégorie 2, même fournisseur que le constructeur, jugement séparé démontré). Réconciliation : g-arch (rôle CONTROL). La consigne initiale (`claude-fable-5-1` + `gemini-3.7 high`) n'a pas été tenue pour cause d'infra (gateway Anthropic saturé, permission headless agy) ; l'écart de modèle est porté au dossier owner. Verdict de revue : ACCEPT-WITH-CONDITIONS.

**Date :** 2026-09-03 (America/Toronto)

**Statut :** design study only; authorizes no implementation

**Rattachement :** axe supplémentaire au `spec/COMPLEMENT_POLE_LANGCHAIN_FABLE5.md`; ce document ne remplace ni ce complément ni la spécification normative.

**Ground truth Graphify :** `spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md`, citée ci-dessous comme « v2 §… / lignes … ».

**Méthodologie :** `spec/SPEC_LLM_WIKI_BENCHMARK_2026_04.md`, spécialement la règle d'inclusion et `non publié` (lignes 11–32).

## Convention de marquage

- Toute affirmation sur **NOTRE** modèle cite une section et des lignes de la v2; sans une telle source, elle porte explicitement `(inference)`.
- Toute affirmation sur utopia tirée d'une source primaire porte `API/release — primary source`, `Documented — primary source` ou `Observed in code — primary source`, avec un lien figé au commit quand la source est un fichier.
- Toute affirmation sur utopia qui viendrait de la connaissance du modèle porterait `(model knowledge — verify)`. Aucune conclusion load-bearing de cette étude ne repose sur cette catégorie.
- Toute propriété non mesurée ici porte `not measured`. Une valeur indisponible dans une source primaire est `non publié`.
- `inference from cited primary sources` désigne une conclusion comparative, pas un fait observé en exécution.

## 0. Verdict global et portée de l'étude

**Verdict global : NON-ADOPTABLE comme remplacement, backend ou dépendance du canon `graphify-memory`.** Utopia place une ontologie métier, des entités, des relations, la résolution d'identité, le raisonnement, les rôles, le chat, les jobs et l'interface dans une application intégrée (`Documented — primary source`, [README, lignes 49–67][u-readme]). NOTRE canon exclut la typologie, l'identité, les rôles et la topologie du contrat, impose une dépendance à sens unique et relègue graphes, vecteurs, caches, exports et scènes au rang de projections (v2 D1, lignes 11–32; D3, lignes 55–59; §12, lignes 1203–1207). Le remplacement violerait donc la frontière normative `(inference from the cited sources)`.

**Verdict d'opportunité : ADOPTABLE par sélection, exclusivement derrière les frontières existantes.** Les profils d'ontologie, les candidats d'extension de vocabulaire, les preuves de dérivation et une façade MCP de lecture peuvent être étudiés comme données ou composants de **PROJECTION**, ou comme intégration **external-host**; ils ne doivent ni ajouter une typologie à `CandidatePayloadV2`, ni devenir autorité d'admission, de vérité ou d'éligibilité `(inference from v2 D1, lignes 20–30; D3, lignes 55–59; §5.8, lignes 793–839; §5.7, lignes 789–791)`. Deux précisions d'étiquetage, matérialisées ligne par ligne au §7 : (a) seule la **forme** d'un profil d'ontologie réauthored est adoptable ; réutiliser les **payloads** des cinq packs Utopia reste **À ÉTUDIER** (licences hétérogènes, compatibilité `not measured`, §3.1) ; (b) seule la **forme** de la façade MCP read-only est adoptable ; servir une projection comme réponse sans revalidation reste **NON-ADOPTABLE** (§4.2). Une ligne « ADOPTABLE » dont la restriction ne vivrait qu'en prose se lirait à tort en feu vert.

Cette étude est documentaire. Utopia n'a été ni cloné, ni compilé, ni lancé; aucun conteneur n'a été démarré. Toutes les propriétés d'exécution restent `not measured`.

## 1. Fiche utopia vérifiée en source primaire

### 1.1 Snapshot d'inclusion

| Champ | Valeur vérifiée | Source et marquage |
|---|---|---|
| Projet | `deeplethe/utopia`; description GitHub : « World's first open-source enterprise world model. » | `API — primary source`, [métadonnées du dépôt][u-repo-api]. « first » est une auto-description; antériorité comparative : `not measured`. |
| Éditeur déclaré | DeepLethe | `Documented — primary source`, [README, lignes 20–25][u-readme]. |
| Branche par défaut | `dev` | `API — primary source`, [métadonnées du dépôt][u-repo-api]. |
| Preuve de vie conforme à la méthodologie | commit de branche par défaut `b295a33af9eefb0f0e06b380ee634da8c6f931ae`, 2026-09-03T19:16:52Z; release préliminaire `v0.1.0-rc4`, publiée 2026-09-03T19:00:05Z | `API/release — primary source`, [commit `dev`][u-head-api] et [release `rc4`][u-rc4-api]. Ni `updated_at` ni `pushed_at` n'est utilisé comme preuve. |
| Popularité, snapshot API du 2026-09-03 | 3 573 stars; 310 forks | `API — primary source`, [métadonnées du dépôt][u-repo-api]. Ces nombres ne prouvent pas l'activité. |
| Version du workspace | `0.1.0` | `Observed in code — primary source`, [Cargo workspace, lignes 14–18][u-cargo]. |
| Dernière distribution vérifiée | image `ghcr.io/deeplethe/utopia:0.1.0-rc4`; release marquée `prerelease` | `Release — primary source`, [release `rc4`][u-rc4-api] et [workflow de publication, lignes 5–18 et 33–45][u-release-workflow]. |
| Paquets crates.io / npm | version : `non publié`; téléchargements : `non publié` | L'API crates.io a répondu HTTP 403 pendant cette étude; `web/package.json` porte `private: true` (`Observed in code — primary source`, [lignes 1–5][u-web-package]). Aucune absence de paquet n'est déduite de ce source-gap. |
| Téléchargements de l'image GHCR | `non publié` | Valeur non fournie par les sources primaires consultées. |
| Licence du code | Apache-2.0 | `API + observed in repository — primary source`, [métadonnées][u-repo-api], [Cargo, lignes 14–18][u-cargo] et [LICENSE][u-license]. Les cinq fichiers d'ontologie ont leurs licences propres, détaillées en §3. |

La règle d'inclusion est donc satisfaite deux fois : commit réel sur la branche par défaut et release/tag primaire. Les étoiles, issues et timestamps d'activité non qualifiés n'interviennent pas dans cette décision, conformément à la méthodologie (benchmark, lignes 13–24).

### 1.2 Vérification du repérage amont

| Hypothèse amont | Résultat | Preuve primaire et limite |
|---|---|---|
| « enterprise world model built by DeepLethe », substrat ouvert qui apprend passivement et se gouverne lui-même | **CONFIRMÉ comme positionnement publié, pas comme performance démontrée.** | `Documented — primary source`, [README, lignes 20–27][u-readme]. L'efficacité de l'apprentissage passif, de l'auto-gouvernance et du « decision core » est `not measured`. |
| Graphe de connaissance bitemporel : temps du monde et temps de croyance | **PARTIAL.** Les deux groupes de colonnes sont observés; le rewind global de l'axe d'enregistrement n'est pas construit. | `Observed in code — primary source`, `facts.valid_from/valid_to` et `recorded_at/invalidated_at` dans [migration 0003, lignes 218–296][u-graph-migration]. `Documented — primary source`, l'ADR 0019 dit « planned · nothing built; the rows are already there, the read paths are not » et précise que les reads courants ne répondent pas à « what did we believe in March? » ([lignes 1–15][u-bitemporal-adr]). |
| Cinq packs : schema.org, W3C Org, PROV-O, FOAF, IOF Core; extensibles | **CONFIRMÉ avec limites.** | `Observed in code — primary source`, cinq entrées `include_bytes!` dans [ontology_packs.rs, lignes 34–80][u-packs-code]; provenance et licences dans [packs/README, lignes 3–21][u-packs-readme]. L'extension automatique par comptage est construite, mais ses propres ADR listent des questions ouvertes et une précision mixed-pack non testée (`Documented — primary source`, [ADR 0007, lignes 37–60 et 94–107][u-ontology-growth]; [ADR 0008, lignes 103–119][u-packs-adr]). |
| Les axiomes sont compilés en règles de dérivation | **CONFIRMÉ pour un sous-ensemble borné, pas pour OWL en général.** | `Observed in code — primary source`, compilation de `transitive`, `symmetric`, `inverse`, `sub_property` dans [reasoning.rs, lignes 929–984][u-reasoning-store], puis matérialisation et chaîne de prémisses [lignes 1008–1145][u-reasoning-store]. Le switch de matérialisation est désactivé par défaut et la maintenance incrémentale R3 n'est pas construite (`Documented — primary source`, [ADR 0002, lignes 1–8 et 48–65][u-reasoning-adr]). |
| Harnais d'agent intégré : recherche documentaire, graphe, base; aussi via MCP | **PARTIAL.** Le harnais intégré est confirmé. MCP expose la recherche et le graphe, mais exclut actuellement la requête base et l'écriture mémoire. | `Observed in code — primary source`, schémas d'outils document/graphe dans [chat.rs, lignes 218–348][u-chat], `query_data` et `remember` conditionnels dans [lignes 49–120][u-chat]. MCP n'expose que six outils de lecture et refuse explicitement `query_data` / `remember` ([mcp.rs, lignes 35–52 et 163–184][u-mcp]). |
| Un binaire Rust + PostgreSQL; Tantivy; pgvector; jobs en table; UI web | **CONFIRMÉ structurellement.** | `Documented — primary source`, [README, lignes 49–67][u-readme]. `Observed in code — primary source` : binaire `utopia-server` et frontend copié dans l'image ([Dockerfile, lignes 1–32][u-dockerfile]); Tantivy embarqué ([utopia-search, lignes 1–18 et 39–80][u-search]); pgvector et table `jobs` ([migration 0001, lignes 1–3 et 86–100][u-core-migration]); worker `FOR UPDATE SKIP LOCKED` ([jobs.rs, lignes 89–106][u-jobs]); pages UI dans l'arbre GitHub ([tree figé][u-tree-api]). Fonctionnement et performance : `not measured`. |
| Apache-2.0; Rust 1.85+, Node 20+, pnpm; v0.1 pré-release; schéma évolutif | **CONFIRMÉ.** | `Documented — primary source`, prérequis [README, lignes 69–100][u-readme], statut et migrations forward-only [lignes 113–117][u-readme]; `Release — primary source`, `rc4` est une pré-release [release][u-rc4-api]. `Observed in code — primary source`, Node 20 dans [Dockerfile, lignes 1–8][u-dockerfile] et pnpm 10.2.1 dans [web/package.json, lignes 1–6][u-web-package]. |

### 1.3 Profil technique primaire, sans extrapolation

- Utopia se définit comme **un produit, pas une bibliothèque** (`Documented — primary source`, [README, lignes 51–58][u-readme]). Son workspace contient plusieurs crates, assemblées dans le binaire serveur; « un binaire » ne signifie donc pas « une couche canonique réutilisable » `(inference from [Cargo, lignes 1–18][u-cargo] et [server Cargo, lignes 1–17][u-server-cargo])`.
- Le full-text est un index Tantivy mmap distinct de PostgreSQL; le texte des chunks reste dans PostgreSQL (`Observed in code — primary source`, [utopia-search, lignes 1–18 et 39–115][u-search]). La recherche hybride fusionne BM25 et pgvector par RRF, avec repli silencieux vers BM25 si l'embedding échoue (`Observed in code — primary source`, [retrieval.rs, lignes 1–49][u-retrieval]).
- La mémoire agent est une source et un document implicites par knowledge base; chaque épisode ajoute un chunk horodaté, puis un job `memory_ingest` extrait des faits soumis à confirmation (`Observed in code — primary source`, [memory.rs, lignes 1–18 et 42–109][u-memory], [tools.rs, lignes 424–471][u-tools]). L'outil `remember` est actif, mais « Agent memory over MCP » reste dans la roadmap (`Documented — primary source`, [README, lignes 102–111][u-readme]).
- La suppression documentaire `rc4` est un événement réversible : le contenu n'est pas effacé, un futur purge est indiqué comme non construit, et une réimportation identique peut réactiver l'objet (`Observed in code — primary source`, [migration 0022, lignes 1–28][u-delete-migration] et [test, lignes 1–15, 213–288][u-delete-test]). Ce sens de « deletion » est incompatible avec une éradication terminale `(inference from the cited primary source)`.

## 2. AXE D1 — Bitemporalité utopia versus ancrage événementiel Graphify

### 2.1 Recouvrement réel

Les deux modèles distinguent bien deux axes, mais ils ne placent pas leur autorité au même endroit :

| Notion | Utopia | NOTRE modèle |
|---|---|---|
| Temps du monde | Une ligne de fait SPO porte `valid_from` / `valid_to`, avec précision par borne (`Observed in code — primary source`, [migration 0003, lignes 218–279][u-graph-migration]). | Tout record porte `valid_time.t` / `t_end`, à bornes inclusives, indépendamment de toute typologie (v2 D4, lignes 77–85; §4, lignes 179–191). |
| Temps système / croyance | La ligne porte `recorded_at` / `invalidated_at`; l'outil `changes` donne une fenêtre d'événements (`Observed in code — primary source`, [migration 0003, lignes 246–296][u-graph-migration]; [chat.rs, lignes 315–345][u-chat]). | Le journal alloue un curseur u64 dense; `recorded_at` n'est pas l'autorité d'ordre. Une lecture replie les événements `<= system_as_of`, puis applique `valid_as_of`; les deux valeurs sont épinglées pendant la pagination (v2 D4, lignes 87–101). |
| Lecture combinée | Le read global « état cru à l'époque selon ce que le système croyait alors » est planifié, pas construit (`Documented — primary source`, [ADR 0019, lignes 1–39][u-bitemporal-adr]). | Le dual-as-of est normatif et affecte éligibilité, réconciliation, ranking, redaction et projection inputs (v2 D4, lignes 87–91). Réalisation : unfinished engineering work (v2 §12, lignes 1203–1207). |
| Historique d'évolution | Les anciennes lignes restent et `supersedes` relie une correction; les reads courants filtrent encore `invalidated_at IS NULL` dans de nombreux chemins (`Observed/documented — primary source`, [temporal.rs, lignes 1–8 et 244–290][u-temporal]; [ADR 0019, lignes 9–21][u-bitemporal-adr]). | Le journal append-only et les blobs immuables sont canoniques; current-state, FTS, graphe et vecteurs sont des projections (v2 D3, lignes 55–59). |

Le recouvrement est donc **conceptuel et partiel** : les deux enregistrent valid time et system/record time. Il n'est pas équivalent au niveau contractuel, car Utopia ne publie pas encore la lecture dual-as-of globale que NOTRE v2 spécifie `(inference from the cited rows; Utopia runtime not measured)`.

### 2.2 `primary_event` et `LifecycleEventAnchorV1` ne sont pas les deux horloges

`PrimaryEventAnchorV1` est l'événement principal singulier et cité du contenu (`at`, `type_ref`, `citation_id`), tandis que le record porte séparément son intervalle `valid_time` (v2 §4, lignes 158–191 et 217–219). `LifecycleEventAnchorV1` décrit l'occurrence justifiant une transition (`occurred_at`, `kind_ref`, provenance), distincte de `valid_effective_at`; l'événement persisté reçoit en plus `cursor` et `recorded_at` (v2 §5.5, lignes 498–520; §5.6, lignes 592–610).

Ainsi :

- `primary_event` répond « quel événement primaire ce record affirme-t-il et quelle citation le couvre ? » (v2 §4, lignes 158–162 et 217).
- `LifecycleEventAnchorV1` répond « quelle occurrence et quelle provenance justifient cette transition ? » (v2 §5.5, lignes 498–508).
- `valid_time` et le curseur du journal répondent aux deux questions as-of (v2 D4, lignes 77–101).

Assimiler la bitemporalité Utopia à ces anchors serait donc une erreur de catégorie `(inference from the cited schemas)`. L'idée utile n'est pas d'importer une seconde temporalité, déjà présente dans NOTRE modèle, mais de vérifier que toute projection typée conserve séparément l'anchor cité, l'intervalle valide et le curseur système `(inference)`.

### 2.3 Divergence terminale : suppression réversible versus tombstone dominant

Utopia `rc4` conserve le contenu d'un document supprimé et permet undo/réactivation (`Observed in code — primary source`, [migration 0022, lignes 1–28][u-delete-migration]; [test, lignes 213–288][u-delete-test]). NOTRE `tombstone` est terminal et dominant; rewind, accept et replay ne peuvent pas ressusciter le record, et la cascade doit retirer son influence de toutes les projections (v2 §5.6, lignes 614–629; §9 lot L6, ligne 1162).

Cette sémantique Utopia est **NON-ADOPTABLE** pour la commande d'éradication Graphify. Une éventuelle fonction de masquage/restauration devrait être une opération différente, avec sa propre spécification; cette étude ne l'autorise pas `(inference)`.

## 3. AXE D2 — Packs d'ontologie et axiomes : destination projection-only

### 3.1 Ce qu'utopia fait réellement

Utopia met l'ontologie dans la boucle de données : elle fournit classes, relations, domaines/ranges et axiomes; elle influence le prompt, corrige le sens d'une relation, guide la résolution d'entités, détecte des violations et peut matérialiser des faits dérivés (`Documented — primary source`, [ADR 0001, lignes 23–32 et 90–140][u-ontology-adr]; [ADR 0002, lignes 25–65][u-reasoning-adr]). Ce couplage est cohérent pour un produit de knowledge engineering typé, mais il est précisément ce que la couche canonique neutre de Graphify ne doit pas apprendre `(inference)`.

Les cinq packs sont réels et embarqués, mais « Apache-2.0 repository » ne rend pas leurs données uniformément Apache : schema.org est indiqué CC BY-SA 3.0, W3C Org et PROV-O sous W3C Document License, FOAF sous CC BY 1.0, IOF Core sous MIT (`Observed in repository — primary source`, [packs/README, lignes 11–17][u-packs-readme]). Toute redistribution de ces fichiers exige donc une revue licence distincte; résultat juridique complet : `not measured`.

### 3.2 Placement compatible avec la neutralité

Le placement admissible est un **profil d'ontologie versionné côté PROJECTION, distribué comme donnée de déploiement** `(inference)`. Il peut déclarer les classes/relations Utopia ou reprendre seulement leurs concepts, mais :

1. il est consommé par un bridge extérieur à `graphify-memory`; le package neutre ne l'importe ni ne le ré-exporte (v2 D1, lignes 13–30);
2. il ne change aucun champ de `CandidatePayloadV2`, dont le contenu reste `context | decision | evidence`, `scope_ref` opaque et `primary_event.type_ref` descriptif (v2 §4, lignes 149–191 et 217–221);
3. son graphe reste une projection non canonique, alimentée par les DTO data-pure de §5.8 (v2 D3, lignes 55–59; §5.8, lignes 793–839);
4. un hit, une classe, un lien ou une dérivation de ce profil n'est jamais une autorisation ni une preuve de vérité; le store canonique revalide avant matérialisation (v2 §5.7, lignes 789–791; §7, lignes 1111–1113);
5. les résultats de résolution d'entités n'entrent pas dans la réconciliation d'assertions : les scores d'identité ne prouvent ni vérité, ni contradiction, ni supersession (v2 D6, lignes 976–1024).

Ce placement reprend la forme du profil POLE-O décrite dans le complément amont, sans introduire la typologie dans le canon. Il est **ADOPTABLE comme frontière de conception**, pas comme import immédiat des packs `(inference from the cited v2 sections)`.

### 3.3 Axiomes et faits dérivés

Le compilateur Utopia borne ses règles à quatre familles et conserve une preuve par prémisses (`Observed in code — primary source`, [reasoning.rs, lignes 929–984 et 1008–1145][u-reasoning-store]). Chez Graphify, un raisonneur analogue pourrait vivre derrière la projection et produire des arcs dérivés accompagnés du profil, de sa version, du curseur et des citations `(inference)`. Il ne peut pas :

- écrire directement un `MemoryRecordV2`, car capture, vérification, admission et promotion atomique sont les seules voies vers `accepted_current` (v2 §5.4, lignes 389–459; §5.5, lignes 461–580; §5.6, lignes 614–629);
- transformer une identité résolue en vérité canonique (v2 D6, lignes 976–1024);
- devenir autorité de lecture, la revalidation finale restant obligatoire (v2 §5.7, lignes 789–791; §7, lignes 1111–1113).

La faisabilité est en plus bloquée par le même gap que le complément POLE-O : `ProjectionBatchV1` transporte digests, scope, temps, trust, kinds et références de citation, mais pas le texte accepté (v2 §5.7, lignes 708–724). Une extraction ontologique à partir du contenu demanderait l'accepted-content feed autorisé/redacté identifié comme O1 dans `COMPLEMENT_POLE_LANGCHAIN_FABLE5.md` (lignes 69–71 et 153–159). Sans ce carrier : **À ÉTUDIER**, pas adoptable immédiatement `(inference)`.

L'auto-extension d'Utopia expose aussi des limites primaires : verbes narratifs susceptibles d'entrer dans l'ontologie, démarrage à 1 500 termes non mesuré, précision mixed-pack non testée (`Documented — primary source`, [ADR 0007, lignes 94–107][u-ontology-growth]; [ADR 0008, lignes 103–119][u-packs-adr]). Chez Graphify, elle ne serait admissible que comme file de **candidats de profil**, réversible et explicitement approuvée; jamais comme mutation automatique du schéma canonique `(inference)`.

## 4. AXE D3 — Mémoire d'agent, ports injectés et external-host

### 4.1 Couplage Utopia

Le harnais interne partage les structures de l'application : knowledge-base, rôles, sources montées, index documentaire, graphe typé et conversation (`Observed in code — primary source`, [tools.rs, lignes 29–82][u-tools]; [chat.rs, lignes 49–120 et 218–348][u-chat]). Sa mémoire ajoute immédiatement un chunk à un document implicite, puis lance l'indexation/extraction; les faits extraits attendent une confirmation (`Observed in code — primary source`, [memory.rs, lignes 1–18 et 42–109][u-memory]; [tools.rs, lignes 424–471][u-tools]).

Ce n'est pas la même frontière que NOTRE moteur. `graphify-memory` dépend uniquement de contrats data-pure et de ports injectés; le root ou les bridges peuvent dépendre du moteur, jamais l'inverse (v2 D1, lignes 13–30). Les sources d'activité n'apportent que des preuves opaques et ne peuvent pas admettre un record; l'ingestion passe ensuite par capture, admission, index accepté, authorization et revalidation (v2 §5.4, lignes 421–459). Les dépendances de l'engine sont explicitement injectées, y compris authorization, admission, crypto et projections (v2 §5.9, lignes 946–963).

Importer `remember` tel quel est donc **NON-ADOPTABLE** : l'épisode Utopia devient immédiatement un chunk applicatif, alors que NOTRE capture doit d'abord devenir un candidat scellé et invisible, puis être admise avant toute projection (v2 §5.5, lignes 464–496; §5.6, lignes 614–629; §5.9, lignes 966–972). Un adapter external-host pourrait traduire une demande explicite en `CaptureRequestV2`, mais son vocabulaire, son identité et son déclenchement resteraient hors package (v2 D1, lignes 20–30; §5.5, ligne 580) `(inference)`.

### 4.2 Ce que MCP confirme et ce qu'il n'expose pas

Utopia réauthentifie chaque POST MCP, vérifie le scope du token et le rôle viewer, puis expose six outils read-only (`Observed in code — primary source`, [mcp.rs, lignes 1–18, 35–86 et 135–205][u-mcp]). C'est une bonne forme d'external-host : **ADOPTABLE comme pattern**, à condition que chaque contenu retourné soit obtenu ou revalidé via `recall` / `readRecord`, jamais servi comme autorité depuis une projection `(inference from v2 §5.2, lignes 261–353; §5.7, lignes 789–791)`.

La formulation amont « harnais exposé aussi via MCP » doit toutefois rester **PARTIAL** : `query_data` et `remember` sont expressément refusés dans cette version (`Observed in code — primary source`, [mcp.rs, lignes 35–52 et 163–184][u-mcp]). La roadmap confirme que les writes/retrieve de mémoire par MCP ne sont pas livrés (`Documented — primary source`, [README, lignes 102–111][u-readme]).

La requête d'une base métier montée est par ailleurs un port d'application, pas une fonction de mémoire neutre `(inference)`. NOTRE v2 ne définit aucun query-engine SQL externe et déclare les mappings d'intégration séparément owned (v2 introduction, ligne 7; D1, lignes 20–30; §12, lignes 1203–1207).

## 5. AXE D4 — Stockage et store déjà tranché

| Sujet | Comparaison factuelle | Conséquence |
|---|---|---|
| PostgreSQL | Utopia requiert PostgreSQL/pgvector et porte son schéma produit (`Documented/observed — primary source`, [README, lignes 49–64][u-readme]; [migration 0001][u-core-migration]). NOTRE v2 impose SQLite pour les modes locaux et la parité Postgres pour `managed-service` (v2 D2, lignes 34–53; D8–D9, lignes 1117–1140). | Schéma/store Utopia : **NON-ADOPTABLE** `(inference)`. Réutiliser seulement des enseignements ne remplace pas les gates de parité, fencing, journal dense et receipts. |
| pgvector | Utopia stocke les embeddings dans Postgres et fait `ORDER BY embedding <=> query` (`Observed in code — primary source`, [documents.rs, lignes 778–790][u-documents]). NOTRE v2 autorise déjà pgvector derrière `VectorProjectionPort` et l'exclut du canon (v2 D3, lignes 55–59; §5.8, lignes 815–839; D9, lignes 1136–1140). | **ADOPTABLE, DÉJÀ PRÉVU**; aucune nouvelle décision de store `(inference)`. |
| Tantivy | Utopia garde un index mmap séparé, filtré par knowledge-base, avec BM25 (`Observed in code — primary source`, [utopia-search, lignes 1–18 et 39–170][u-search]). | **À ÉTUDIER** seulement comme adapter lexical/projection. Parité temporelle, accepted-only, invalidation, backup, taille, multi-process et déterminisme : `not measured` face aux gates v2 §9–§10, lignes 1150–1183. |
| Repli de ranking | Utopia passe silencieusement au BM25 si l'embedding échoue (`Observed in code — primary source`, [retrieval.rs, lignes 1–49][u-retrieval]). NOTRE v2 renvoie `RANKING_UNAVAILABLE` quand le minimum demandé manque et interdit le fallback en cours d'appel (v2 §7, lignes 1087–1113). | Comportement : **NON-ADOPTABLE** `(inference)`. |
| File de jobs en table | Utopia a une table `jobs`, `FOR UPDATE SKIP LOCKED`, retries et récupération des jobs `running` au démarrage (`Observed in code — primary source`, [migration 0001, lignes 86–100][u-core-migration]; [jobs.rs, lignes 89–106 et 170–224][u-jobs]). | **À ÉTUDIER** dans le host/service seulement. L'ajouter aux contrats neutres créerait une sémantique d'orchestration absente de v2 D1 et §5.9 `(inference from v2 D1, lignes 13–30; §5.9, lignes 946–963)`. |
| UI web | Utopia documente console, graph browser et ontology workbench, et le tree contient les pages correspondantes (`Documented/observed — primary source`, [README, lignes 53–67][u-readme]; [tree][u-tree-api]). | **À ÉTUDIER** comme client de projections et d'administration; UX réelle, accessibilité, charge et séparation d'autorité : `not measured`. Aucun composant UI n'entre dans le canon `(inference from v2 D3, lignes 55–59)`. |
| Suppression | Utopia conserve et peut réactiver le contenu (`Observed in code — primary source`, [migration 0022][u-delete-migration]). NOTRE tombstone est terminal et cascaded (v2 §5.6, lignes 614–629; lot L6, ligne 1162). | Sémantique de deletion : **NON-ADOPTABLE** `(inference)`. |

Il n'y a donc aucune raison documentaire de rouvrir la décision de store. Utopia fournit des comparants d'implémentation, pas un backend interchangeable `(inference from the cited comparison; performance not measured)`.

## 6. AXE D5 — Gouvernance, licence et maturité

### 6.1 Signaux positifs vérifiés

- Le dépôt vivant a un flux `dev` → `main`, PR + CI, branches protégées déclarées et DCO plutôt que CLA (`Documented — primary source`, [CONTRIBUTING, lignes 7–40 et 96–118][u-contributing]). L'application effective des protections : `not measured`.
- Le CI contient format, clippy, tests/build, migration Postgres et tests store avec base requise; la release construit, smoke-test puis pousse l'image (`Observed in repository — primary source`, [CI, lignes 17–113][u-ci]; [release workflow, lignes 19–110][u-release-workflow]). Résultats de runs historiques : `not measured` dans cette étude.
- Les décisions d'architecture sont conservées en ADR et plusieurs limites sont publiées explicitement (`Documented — primary source`, [CONTRIBUTING, lignes 32–40][u-contributing]; [SECURITY, lignes 5–23][u-security]).

### 6.2 Freins à l'adoption

- La release est `v0.1.0-rc4`, et le README annonce un schéma qui évolue, des migrations seulement forward et l'absence de rollback (`Release/documented — primary source`, [release `rc4`][u-rc4-api]; [README, lignes 113–117][u-readme]). Une dépendance canonique créerait un risque de migration et de contrat sans voie de retour publiée `(inference)`.
- Les credentials LLM et chaînes de connexion Ask-the-Data sont documentés en clair dans PostgreSQL; le projet recommande un réseau de confiance avant la version 1.0 (`Documented — primary source`, [SECURITY, lignes 5–23][u-security]). Cette posture est **NON-ADOPTABLE** pour une dépendance de production sans analyse de menace et gate dédiés `(inference; security posture not independently tested)`.
- Les données des packs n'ont pas la même licence que le code (`Observed in repository — primary source`, [packs/README, lignes 11–17][u-packs-readme]). Copier les packs avec du code Apache sans matrice de redistribution serait insuffisamment établi `(inference; legal compatibility not measured)`.
- Les propres ADR indiquent : précision mixed-pack non testée, démarrage à 1 500 termes non étudié, raisonnement incrémental non construit et coût du raisonnement à l'échelle inconnu (`Documented — primary source`, [ADR 0008, lignes 103–119][u-packs-adr]; [ADR 0002, lignes 86–90][u-reasoning-adr]). Les performances et la qualité sont `not measured`.
- Le rewind complet de l'axe de croyance est planifié mais absent (`Documented — primary source`, [ADR 0019, lignes 1–39][u-bitemporal-adr]); il ne peut donc pas remplacer le contrat dual-as-of de la v2 `(inference)`.

Conclusion de maturité : **NON-ADOPTABLE maintenant comme dépendance structurante**; réévaluation possible après une release stable, une politique de migration/rollback, des benchmarks publiés, une posture secrets/erasure compatible et une lecture bitemporelle complète. Ces seuils sont des critères proposés `(inference)`, pas des promesses de la roadmap Utopia.

## 7. Matrice élémentaire ADOPTABLE / NON-ADOPTABLE / À ÉTUDIER

Chaque ligne contient son marquage; aucune ligne ne repose sur une supposition non signalée.

| Élément | Verdict | Preuve / marquage | Motif et destination |
|---|---|---|---|
| Utopia comme remplacement de `graphify-memory` | **NON-ADOPTABLE** | `Documented — primary source` : produit typé intégré ([README, lignes 49–67][u-readme]). `OUR` : neutralité et anti-cycle (v2 D1, lignes 11–32; D3, lignes 55–59). | Incompatibilité de frontière `(inference from cited sources)`. |
| Schéma canonique SPO + classes/relations Utopia | **NON-ADOPTABLE** | `Observed in code — primary source` : [migration 0003, lignes 16–279][u-graph-migration]. `OUR` : payload typology-free et scope opaque (v2 §4, lignes 149–221). | Une typologie canonique violerait le contrat `(inference)`. |
| Deux axes temporels comme principe | **ADOPTABLE, DÉJÀ PRÉSENT** | `Observed/documented — primary source` : colonnes Utopia ([migration 0003][u-graph-migration]). `OUR` : dual-as-of normatif (v2 D4, lignes 77–103). | Validation comparative, aucun changement de schéma `(inference)`. |
| Implémentation bitemporelle Utopia telle quelle | **NON-ADOPTABLE** | `Documented — primary source` : rewind record-time non construit ([ADR 0019, lignes 1–39][u-bitemporal-adr]). `OUR` : fold dual-as-of requis (v2 D4, lignes 87–91). | Couverture contractuelle inférieure; runtime `not measured`. |
| Mapping `primary_event` ↔ fait Utopia | **NON-ADOPTABLE comme équivalence** | `OUR` : anchor, valid time et journal sont distincts (v2 §4, lignes 158–191; §5.5, lignes 498–520; §5.6, lignes 592–610). | Erreur de catégorie `(inference)`; conserver trois champs conceptuellement séparés. |
| Cinq packs copiés dans le canon | **NON-ADOPTABLE** | `Observed in repository — primary source` : packs et licences ([packs/README, lignes 11–17][u-packs-readme]). `OUR` : vocabulaire d'intégration hors spec (v2 introduction, ligne 7; D1, lignes 20–30). | Typologie + licences hétérogènes `(inference; legal compatibility not measured)`. |
| Profil inspiré des packs comme donnée de projection (**forme réauthored**) | **ADOPTABLE** | `Observed in code — primary source` : packs versionnables/embarqués ([ontology_packs.rs, lignes 34–80][u-packs-code]). `OUR` : bridges/projections hors canon (v2 D1, ligne 20; §5.8, lignes 793–839). | Profil deployment-owned, sans champ canonique. La réutilisation des **payloads** des packs reste À ÉTUDIER (licences, cf. ligne « Cinq packs copiés ») `(inference)`. |
| Auto-extension de l'ontologie | **À ÉTUDIER** | `Documented — primary source` : comptage construit, limites ouvertes ([ADR 0007, lignes 37–60 et 94–107][u-ontology-growth]). `OUR` : projection-only (v2 D3, lignes 55–59). | Seulement candidats réversibles et approuvés; qualité `not measured` `(inference)`. |
| Domain/range corrigeant ou rejetant une relation à l'admission canonique | **NON-ADOPTABLE** | `Documented — primary source` : Utopia applique la signature à l'écriture ([ADR 0001, lignes 48–54][u-ontology-adr]). `OUR` : admission policy opaque, aucun type métier dans les DTO (v2 §5.3, lignes 355–387; §4, lignes 149–221). | La couche canonique apprendrait la typologie `(inference)`. |
| Compilation d'axiomes en arcs dérivés de projection | **À ÉTUDIER** | `Observed in code — primary source` : quatre règles et preuves ([reasoning.rs, lignes 929–984, 1008–1145][u-reasoning-store]). `OUR` : `ProjectionBatchV1` sans texte (v2 §5.7, lignes 708–724). | Dépend d'un feed de contenu autorisé/redacté; exactitude et coût `not measured` `(inference)`. |
| Fait dérivé écrit directement au canon | **NON-ADOPTABLE** | `OUR` : capture/admission obligatoires et propositions non mutantes (v2 §5.5–§5.6, lignes 461–629; D6, lignes 998–1024). | Une projection ne peut pas admettre un record `(inference)`. |
| Chaîne de preuve de dérivation | **ADOPTABLE côté projection** | `Observed in code — primary source` : `fact_derivations` et prémisses ([reasoning.rs, lignes 1101–1145][u-reasoning-store]). `OUR` : citations et receipts sont normatifs (v2 §4, lignes 141–167; §7, lignes 1051–1084). | Conserver profil/version/curseur/citations, sans autorité canonique `(inference)`. |
| Harnais agent Utopia comme dépendance engine | **NON-ADOPTABLE** | `Observed in code — primary source` : couplage aux rôles, KB, sources et outils ([tools.rs, lignes 29–82][u-tools]). `OUR` : dépendances injectées et anti-cycle (v2 D1, lignes 13–30; §5.9, lignes 946–963). | Doit rester external-host `(inference)`. |
| Façade MCP read-only avec auth par appel | **ADOPTABLE (forme SEULEMENT) — NON-ADOPTABLE si elle sert une projection comme autorité** | `Observed in code — primary source` : [mcp.rs, lignes 35–86 et 135–205][u-mcp]. `OUR` : authorization/revalidation (v2 §5.2, lignes 261–353; §5.7, lignes 789–791). | Adoptable : la forme read-only auth-par-appel. NON-adoptable : servir une sortie de projection sans repasser par `recall`/`readRecord` du store canonique `(inference)`. |
| `query_data` via MCP Utopia | **NON-ADOPTABLE / NON DISPONIBLE** | `Observed in code — primary source` : explicitement exclu de MCP ([mcp.rs, lignes 35–52 et 163–184][u-mcp]). | Missing capability; requête SQL externe hors modèle neutre `(inference from v2 §12, lignes 1203–1207)`. |
| `remember` Utopia tel quel | **NON-ADOPTABLE** | `Observed in code — primary source` : ajout immédiat d'un chunk puis job ([memory.rs][u-memory]; [tools.rs, lignes 424–471][u-tools]). `OUR` : pending scellé, invisible, admission avant projection (v2 §5.5–§5.6, lignes 461–629; §5.9, lignes 966–972). | Adapter obligatoire; aucun bypass `(inference)`. |
| PostgreSQL/schema Utopia comme backend canonique | **NON-ADOPTABLE** | `Observed/documented — primary source` : Postgres unique du produit ([README][u-readme]; [migration 0001][u-core-migration]). `OUR` : stores et parité déjà décidés (v2 D8–D9, lignes 1117–1140). | Ne satisfait pas par substitution les gates v2; conformance `not measured`. |
| pgvector derrière le port vectoriel | **ADOPTABLE, DÉJÀ PRÉVU** | `Observed in code — primary source` : Utopia vector search ([documents.rs, lignes 778–790][u-documents]). `OUR` : v2 §5.8, lignes 815–839; D9, ligne 1140. | Adapter de projection seulement `(inference)`. |
| Tantivy comme projection lexicale optionnelle | **À ÉTUDIER** | `Observed in code — primary source` : [utopia-search, lignes 1–170][u-search]. `OUR` : accepted-only + revalidation (v2 §5.7, lignes 664–791; §7, lignes 1087–1113). | Parité, déterminisme, cascade et recovery `not measured`. |
| Fallback silencieux semantic → BM25 | **NON-ADOPTABLE** | `Observed in code — primary source` : [retrieval.rs, lignes 28–47][u-retrieval]. `OUR` : typed `RANKING_UNAVAILABLE`, sans fallback (v2 §7, lignes 1087–1113). | Contredit la capacité minimale demandée `(inference)`. |
| Queue PostgreSQL `SKIP LOCKED` | **À ÉTUDIER côté service host** | `Observed in code — primary source` : [jobs.rs, lignes 89–106 et 170–224][u-jobs]. `OUR` : dépendances engine fermées (v2 §5.9, lignes 946–963). | Pas de vocabulaire de jobs dans `contracts`; robustesse multi-worker `not measured` `(inference)`. |
| UI console/graphe/ontologie | **À ÉTUDIER côté projection/admin** | `Documented/observed — primary source` : [README, lignes 53–67][u-readme] et [tree][u-tree-api]. `OUR` : UI/scènes sont projections (v2 D3, lignes 55–59). | UX et séparation d'autorité `not measured`. |
| Suppression réversible Utopia pour `tombstone` | **NON-ADOPTABLE** | `Observed in code — primary source` : contenu conservé/restaurable ([migration 0022][u-delete-migration]; [test][u-delete-test]). `OUR` : tombstone terminal (v2 §5.6, lignes 627–629). | Sémantiques opposées `(inference)`. |
| Code Utopia `v0.1.0-rc4` comme dépendance production | **NON-ADOPTABLE maintenant** | `Release/documented — primary source` : pré-release, schéma forward-only sans rollback ([rc4][u-rc4-api]; [README, lignes 113–117][u-readme]); secrets en clair ([SECURITY, lignes 5–23][u-security]). | Risque de migration/sécurité; stabilité et exploitation `not measured` `(inference)`. |
| Discipline ADR/DCO/CI comme référence de processus | **ADOPTABLE comme inspiration documentaire** | `Documented/observed — primary source` : [CONTRIBUTING, lignes 30–40 et 96–118][u-contributing], [CI][u-ci]. | N'ajoute aucune dépendance ni typologie `(inference)`. |

**Audit d'étiquetage (§7).** Les lignes dont l'adoptabilité est conditionnelle ont été scindées pour que la restriction vive dans la colonne verdict, pas seulement en prose : façade MCP (forme adoptable / autorité de projection non-adoptable) et profil d'ontologie (forme réauthored adoptable / payloads des packs à étudier). Les autres lignes `ADOPTABLE` portent déjà leur périmètre dans le verdict — « DÉJÀ PRÉSENT », « DÉJÀ PRÉVU », « côté projection », « comme inspiration documentaire » — et ne masquent pas de restriction en motif.

## 8. Ce que je n'ai pas pu vérifier

1. **Exécution réelle :** build, tests, migrations, recherche, MCP, UI, performances, consommation disque/mémoire et comportement multi-worker sont `not measured`; la contrainte de l'étude interdit clone, build et conteneur.
2. **Qualité des résultats :** précision/recall d'extraction, entity resolution, extension d'ontologie, RRF, réponses agent et faits dérivés sont `not measured`. Les chiffres de corpus publiés dans les ADR restent `Documented — primary source`, pas reproduits ici.
3. **Bitemporalité complète :** la source primaire établit que les colonnes existent mais que le rewind global record-time n'est pas construit. Aucun endpoint dual-as-of équivalent à la v2 n'a pu être vérifié; c'est un manque publié, pas une déduction.
4. **Registries de paquets :** crates.io a répondu HTTP 403; versions et téléchargements crates.io sont donc `non publié`. Le manifeste npm web est privé, mais une éventuelle publication externe n'a pas été prouvée; version/download npm : `non publié`.
5. **GHCR :** l'existence de l'image/tag est attestée par la release et le workflow; nombre de pulls/downloads : `non publié`.
6. **Affirmations de positionnement :** « first », « learns passively », « governs itself », « agents can trust » et « state of the art » sont des auto-descriptions primaires; leur supériorité comparative est `not measured`.
7. **Sécurité opérationnelle :** aucune analyse de menace, aucun audit externe, aucun pentest, aucune isolation réseau réelle et aucune rotation de secrets n'a été mesuré. Le document SECURITY publie lui-même des limites; leur exploitation concrète reste `not measured`.
8. **Licence des packs :** les licences déclarées ont été relevées, mais compatibilité de redistribution, notices, obligations share-alike et droits sur les snapshots embarqués n'ont pas fait l'objet d'une revue juridique : `not measured`.
9. **Gouvernance durable :** SLA, politique de support des releases, durée de maintenance, bus factor, roadmap contractuelle et calendrier 1.0 : `non publié` dans les sources primaires inspectées.
10. **Purge/éradication :** la migration dit que le purge explicite est « not built ». Aucun mécanisme primaire de disparition physique complète n'a été trouvé dans le tree figé; toute capacité externe ou ultérieure reste `unverified`.
11. **UI complète :** les routes/pages existent et le README les documente, mais leur accessibilité, comportement en charge, cohérence des permissions et résistance à une projection stale sont `not measured`.
12. **Document de rattachement non versionné :** `spec/COMPLEMENT_POLE_LANGCHAIN_FABLE5.md`, auquel cette étude se rattache et qu'elle cite par numéro de ligne (§3.3 : « lignes 69–71 et 153–159 »), était untracked (aucune entrée `git ls-files`, aucune révision `git log --all`) à la date de l'étude. Ses cross-références n'étaient donc pas résolvables par un tiers et dérivaient en silence. Le sibling est commité dans la même PR que cette étude pour lever ce point.
13. **Snapshot §1.1 partiellement non répétable :** le head de la branche par défaut et la popularité (stars/forks) sont une capture datée non reproductible — l'endpoint `dev` a déjà dérivé depuis. L'inclusion méthodologique ne repose PAS sur eux : elle repose sur le SHA `b295a33…` écrit en toutes lettres (vérifiable via l'endpoint immuable `/commits/b295a33…`) et la release immuable `v0.1.0-rc4`.
14. **Provenance de traduction :** les sources utopia (README, ADR, packs, migrations) sont en chinois ; les formulations de cette étude en sont des traductions. Le fond a été vérifié en source primaire par les deux jambes de revue ; un futur re-vérificateur doit relire les originaux, pas ce rendu.

## 9. Jugement de clôture

Utopia confirme l'intérêt d'une couche ontologique riche, bitemporelle et agent-facing, mais son implémentation est celle d'un produit vertical : le vocabulaire influence l'écriture, le stockage, la résolution, le raisonnement et l'interface (`Documented/observed — primary source`, sources §1–§6). NOTRE v2 choisit l'inverse pour le canon : contenu et références opaques, journal autoritaire, ports injectés, projection non canonique et revalidation terminale (v2 D1, D3, D4, §5.7–§5.9).

Le verdict n'est donc pas « rien à reprendre ». Il est : **ne pas adopter Utopia comme substrat; adopter seulement des patterns bornés dans les emplacements déjà prévus** — profil d'ontologie comme donnée de projection, preuve de dérivation projection-side, façade MCP read-only external-host, pgvector derrière son port. Le compilateur d'axiomes, Tantivy, la queue et l'UI restent **À ÉTUDIER** avec mesures et gates dédiés. Les schémas typés canoniques, les writes agent directs, le fallback silencieux, la suppression réversible sous le nom de tombstone et une dépendance `v0.1` sont **NON-ADOPTABLES** `(inference from the fully marked matrix)`.

---

## Sources primaires utopia

Toutes les sources fichier sont figées au commit de branche par défaut `b295a33af9eefb0f0e06b380ee634da8c6f931ae`. Les endpoints API reflètent le snapshot consulté le 2026-09-03.

[u-repo-api]: https://api.github.com/repos/deeplethe/utopia
[u-head-api]: https://api.github.com/repos/deeplethe/utopia/commits/b295a33af9eefb0f0e06b380ee634da8c6f931ae
[u-rc4-api]: https://api.github.com/repos/deeplethe/utopia/releases/tags/v0.1.0-rc4
[u-tree-api]: https://api.github.com/repos/deeplethe/utopia/git/trees/b295a33af9eefb0f0e06b380ee634da8c6f931ae?recursive=1
[u-readme]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/README.md
[u-license]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/LICENSE
[u-cargo]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/Cargo.toml
[u-server-cargo]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/crates/utopia-server/Cargo.toml
[u-web-package]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/web/package.json
[u-dockerfile]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/docker/Dockerfile
[u-core-migration]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/migrations/0001_core.sql
[u-graph-migration]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/migrations/0003_graph.sql
[u-delete-migration]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/migrations/0022_deleting_is_an_event.sql
[u-delete-test]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/crates/utopia-store/tests/a_deletion_is_an_event.rs
[u-bitemporal-adr]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/docs/decisions/0019-the-second-clock-can-be-rewound.md
[u-temporal]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/crates/utopia-store/src/temporal.rs
[u-packs-readme]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/crates/utopia-server/packs/README.md
[u-packs-code]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/crates/utopia-server/src/ontology_packs.rs
[u-packs-adr]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/docs/decisions/0008-ontology-packs-as-cold-start.md
[u-ontology-adr]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/docs/decisions/0001-ontology-import-and-governance.md
[u-ontology-growth]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/docs/decisions/0007-who-decides-what-becomes-a-relation.md
[u-reasoning-adr]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/docs/decisions/0002-reasoning-engine.md
[u-reasoning-store]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/crates/utopia-store/src/reasoning.rs
[u-chat]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/crates/utopia-server/src/api/chat.rs
[u-tools]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/crates/utopia-server/src/api/tools.rs
[u-mcp]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/crates/utopia-server/src/api/mcp.rs
[u-memory]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/crates/utopia-store/src/memory.rs
[u-search]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/crates/utopia-search/src/lib.rs
[u-retrieval]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/crates/utopia-server/src/retrieval.rs
[u-documents]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/crates/utopia-store/src/documents.rs
[u-jobs]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/crates/utopia-store/src/jobs.rs
[u-contributing]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/CONTRIBUTING.md
[u-security]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/SECURITY.md
[u-ci]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/.github/workflows/ci.yml
[u-release-workflow]: https://github.com/deeplethe/utopia/blob/b295a33af9eefb0f0e06b380ee634da8c6f931ae/.github/workflows/release.yml
