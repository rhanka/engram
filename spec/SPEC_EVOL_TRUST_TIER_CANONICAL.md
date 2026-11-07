# SPEC EVOL — Rétablir un propriétaire canonique pour le vocabulaire `TrustTier`

**Auteur :** g-arch (rôle CONTROL, scope graphify.design) — spécification seule ; je ne suis ni le constructeur ni la jambe de revue de ce lot.
**Date :** 2026-09-03
**Statut :** design study; authorizes no implementation before owner arbitration of §4.
**Origine :** constat **F12** (ledger SEAMS), accepté par le conducteur, tranché par l'owner en option **(b) — rétablir la protection mécanique**.
**Base mesurée :** `origin/main` @ `e3026bec`, auditée via `git show origin/main:<path>` (jamais l'arbre disque).

---

## 1. Le défaut, tel qu'il a été mesuré

Le lot agent-memory-substrate L0→L7 (PR #309) a supprimé `src/memory-producer-port.ts` (commit `f1ac9c2a`, « remove legacy v1 surface »). Ce fichier portait l'union canonique `TrustTier`.

Conséquences mesurées sur `origin/main` :

| Fait | Mesure |
|---|---|
| Aucune définition de `TrustTier` ne subsiste | `git grep 'type TrustTier'` sur `src/**`, `packages/**`, `graphify-memory/**` : **zéro** |
| L'ontologie **redéfinit** au lieu de dériver | `src/ontology-patch.ts:77` → `export type OntologyNodeTrustTier = "earned" \| "asserted" \| "signed" \| "unverified"` |
| Le module extrait déclare **son propre** vocabulaire | `_extracted/agent-stats-h2a-module/src/project-graph.ts:32` → `type ProjectionTrust = "earned" \| "unverified"` (2 membres) |
| Aucun test n'épingle le vocabulaire | `git grep 'OntologyNodeTrustTier' -- tests/**` : **zéro** |
| Le membre `unverified` a bien un producteur et une couverture | `tests/agent-stats-h2a-evidence.test.ts`, `tests/ontology-reconciliation-trust-tier.test.ts:147` |

**Ce qui a été perdu n'est pas la correction des valeurs — c'est la garantie.** Les deux déclarations coïncident aujourd'hui ; rien ne les oblige à coïncider demain. Avant, la dérivation de type l'imposait au compilateur. Maintenant, c'est une coïncidence textuelle entre deux fichiers que personne ne lit ensemble.

C'est le motif exact que le commentaire de `ontology-patch.ts` raconte comme l'incident fondateur — « three lots landed three vocabularies for one field name, so the type system declared two values while the system produced four » — reconstitué, et cette fois c'est littéralement une déclaration à deux valeurs face à une à quatre.

**Le lot n'est pas fautif** : une fois le propriétaire retiré, ré-épeler la liste était le seul geste minimal disponible. Le défaut est structurel, pas comportemental.

---

## 2. État de la surface publique — mesuré

Le paquet est `@sentropic/graphify` **0.17.2**, `exports` limité à `.` → `dist/index.d.ts`. **La surface publique est donc exactement ce que `src/index.ts` ré-exporte.**

| Symbole | Public ? | Mesure |
|---|---|---|
| Les 6 symboles consommés par le module extrait (`safeExecGit`, `safeGitRevParse`, `resolveGitContext`, `getPullRequestMerge`, `listPullRequests`, `githubRepoFromRemote`, `buildStaticStudio`) | **OUI** | `src/index.ts:494`, `:495`, `:710` |
| `OntologyNodeTrustTier` | **NON** | absent de `index.ts` |
| `OntologyPatchNode` (porteur du champ `trust`) | **NON** | absent de `index.ts` |
| De `ontology-patch.js`, seuls sont publics | 2 valeurs (`loadOntologyReconciliationDecisionLog`, `ONTOLOGY_RECONCILIATION_DECISION_LOG_SCHEMA`) + 4 types de decision-log | `index.ts:259-262`, `:328-333` |

---

## 3. Le module extrait — mesuré, et c'est ce qui décide

| Fait | Mesure |
|---|---|
| Ses dépendances vers graphify sont **5 imports de VALEUR** | `../../../src/git.js` ×2, `../../../src/pr.js` ×2, `../../../src/studio-export.js` ×1 |
| **Tous** ces symboles sont déjà publics | cf. §2 |
| Ses `import type` sont **tous internes** | `./types.js`, `./registry.js`, `./track-join.js`, `./agy-chat.js` — **aucun type importé de graphify** |
| Il ne déclare aucune dépendance de paquet | `package.json` : `private: true`, pas de `dependencies`, pas de tsconfig propre, `exports` sur des `.ts` sources |

**Deux conclusions, et la seconde n'était pas anticipée :**

1. **Le plan Track 3 tient tel quel.** Recâbler ces 5 imports vers `@sentropic/graphify` publié fonctionne : les 6 symboles sont déjà exposés, aucun élargissement d'API n'est requis pour eux. *(J'avais signalé un risque sur ce point ; la mesure le lève.)*
2. **Le module est délibérément autonome sur ses types.** Il déclare localement tout ce qu'il manipule, y compris `ProjectionTrust`. Lui faire importer `OntologyNodeTrustTier` créerait **son premier et unique import de type externe**, à contre-courant de sa conception, et à la veille de sa transplantation vers h2a.

---

## 4. LE FORK — arbitrage owner, non tranché ici

### Branche (a) — exposer le canonique et dériver

`src/index.ts` ré-exporte `OntologyNodeTrustTier` ; `ontology-patch.ts` reste le propriétaire ; le module extrait dérive par sous-type :

```ts
type ProjectionTrust = Extract<OntologyNodeTrustTier, "earned" | "unverified">;
```

Cette forme est la bonne dans cette branche : elle **conserve la précision à 2 membres** (le module ne produit que ces deux tiers) **et** casse la compilation si le canonique change. Élargir le module à 4 membres serait un recul.

**Coûts :**
- élargit l'**API publique** du paquet avec un vocabulaire qui vient de perdre son propriétaire : on figerait publiquement un arrangement qui est la **conséquence d'une suppression, pas une décision de conception**. Un retrait ultérieur serait cassant ;
- crée le **premier import de type externe** du module extrait, contre sa conception actuelle ;
- ajoute une 6ᵉ dépendance juste avant la transplantation qui vise à les supprimer toutes.

**Gain :** la conformité redevient garantie par le compilateur, pour tous les consommateurs présents et futurs.

### Branche (b) — garde de conformité par test

Chaque déclaration reste locale ; un test épingle leur correspondance et échoue si l'une dérive.

**Coûts :** la garantie n'est plus au compilateur mais à la CI ; elle ne protège que les déclarations que le test connaît (un troisième vocabulaire ailleurs passerait inaperçu tant qu'il n'est pas ajouté au test).

**Gains :**
- **n'élargit pas l'API publique** : rien d'instable n'est figé ;
- **respecte l'autonomie de types** du module extrait, et donc ne complique pas Track 3 ;
- couvre le cas que (a) ne couvre pas : une fois le module transplanté chez h2a **sans** dépendance graphify, la dérivation par import devient **impossible** et seule une garde par test reste praticable.

### Ce que la mesure fait pencher, sans décider

Le point qui départage n'est pas le confort de conception, c'est la **trajectoire** : ce module est destiné à h2a. (a) l'y attache davantage au moment précis où l'on veut l'en détacher, et paie ce couplage en élargissant une API publique sur un vocabulaire instable. (b) obtient la garantie sans aucun de ces deux coûts, au prix d'une protection CI plutôt que compilateur.

**Cet arbitrage porte sur ce que l'organisation accepte de rendre public et de figer. Il appartient à l'owner.**

---

## 5. Plan par lots — applicable aux deux branches

| Lot | Contenu | Gate |
|---|---|---|
| **L1 — propriétaire nommé** | Désigner le module propriétaire du vocabulaire (`graphify-memory/contracts` si le substrat porte désormais le concept, ou `ontology-patch.ts` maintenu tel quel). Écrire la décision dans le fichier, pas seulement dans la spec. | `tsc` vert, aucun changement de comportement |
| **L2 — la garantie** | (a) ré-export public + dérivation `Extract<…>` — ou — (b) test d'épinglage croisé entre les deux déclarations. | le test choisi **échoue** si l'on modifie une déclaration sans l'autre (RED prouvé avant GREEN) |
| **L3 — le commentaire orphelin** | `ontology-patch.ts:56-77` défère à un propriétaire disparu et désigne comme faute le geste que le fichier fait désormais, alors que sa liste n'est pas « narrower » mais complète. Le réécrire pour refléter le propriétaire réel et la garantie retenue. | relecture ; aucun code touché |
| **L4 — réconciliation du module extrait** | Appliquer la forme retenue à `ProjectionTrust`. | `tsc` vert ; le producteur fermé de **F9** (`EARNED_NODE_TYPES` + first-write-wins, `project-graph.ts:876-877`) reste intact — re-mesuré le 2026-09-03, il a survécu à l'extraction |

**Invariants du lot :** anti-cycle préservé ; `tsc`/build vert à chaque commit ; aucun merge/push/publish sans l'owner ; le constructeur n'est pas la jambe de revue ; je ne suis ni l'un ni l'autre.

---

## 6. Non mesuré

1. Si `graphify-memory/contracts` est le bon domicile du vocabulaire : le substrat porte le concept de trust, mais je n'ai pas mesuré s'il déclare déjà une union propre — **à mesurer avant L1**.
2. Le calendrier réel de la transplantation vers h2a. La pertinence relative de (a) et (b) en dépend : plus elle est proche, plus (b) est indiqué.
3. ~~L'existence d'un **troisième** vocabulaire trust-tier ailleurs dans la flotte.~~ **MESURÉ le 2026-09-04 — il n'y en a pas.** `git grep -w TrustTier origin/main` rend **une seule** occurrence, et c'est un **commentaire de test** (`tests/ontology-reconciliation-trust-tier.test.ts:130`, « Three lots landed three spellings of one field: TrustTier »). Recherche d'une union trust vivante dans `h2a/{packages,apps}` et `sentropic/{packages,apps}` : **aucune** (seul hit `ReasoningTier` dans llm-mesh = tier d'effort de modèle, sans rapport). ⇒ **Deux déclarations vivantes seulement** : `OntologyNodeTrustTier` et `ProjectionTrust`. Les « trois orthographes » du commentaire sont **historiques**, pas actuelles.
   **Portée déclarée** : mesuré sur `origin/main` de graphify + `h2a/{packages,apps}` + `sentropic/{packages,apps}`. Non couverts : les worktrees et les autres repos de la flotte — « aucun trouvé dans ce périmètre », pas « prouvé absent partout ».
   *À ne pas confondre avec la branche morte `fix/trust-alias-collapse` (`0cfe1b97`) : elle ne portait pas un troisième vocabulaire, elle tentait de **supprimer l'alias redondant** — c'est-à-dire **R2**, que le lot L0→L7 a fermé autrement.*

## 7. Chantier voisin à ne pas absorber — `feat/trust-loader-passthrough`

Signalé par la lane ontology comme « même domaine, à consolider dans F12(b) ». **Mesuré : le périmètre est bien plus large**, et le rapport d'inclusion doit être inversé.

Les 8 commits de `origin/main..61ba7652` portent la **norme « déclarer la perte de rappel »** de bout en bout :
`b308b74f` le loader transporte le tier déclaré · `295cc439` le manifeste déclare la part du corpus ancrée · `c8fe29b6` les deux mésinterprétations de `provenance_coverage` · **`fc8b908e` la file déclare ce que la garde inter-tiers a retranché (→ R4)** · **`bfaff46f` la file déclare l'exclusion de tier appliquée par défaut (→ R7)** · **`ae9dc160` la file déclare ce que les gardes de précision ont repris (→ R5)** · `3319563a` docs oracle · `61ba7652` la file déclare ce que le cap de sortie a jeté.

⇒ **R4, R5 et R7 — portés comme ouverts au ledger — ont une implémentation en attente sur cette branche.** Elle touche aussi le vocabulaire trust (22 lignes ajoutées contenant `TrustTier`/`"asserted"`/`"signed"`), d'où la confusion.

**Conséquence pour ce lot :** F12(b) est un **petit lot qui pourrait se rattacher à ce chantier**, pas son hôte. Absorber la disclosure dans F12(b) mélangerait deux périmètres.
**Préalable à toute consolidation :** auditer si l'implémentation de cette branche **respecte la norme telle qu'instruite** — les trois niveaux paramètre / compte / phrase en clair — ou si elle en diverge. Cet audit n'est pas fait.
