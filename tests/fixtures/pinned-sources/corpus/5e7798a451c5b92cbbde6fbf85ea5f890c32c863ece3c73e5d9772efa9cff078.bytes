# SPEC EVOL — GD-M2-MODEL : noyau sémantique typé, profils versionnés, vues et transactions

Statut : cadrage, 2026-09-24.
Programme : [étude](SPEC_STUDY_GRAPH_DATAVIZ_REPATRIATION.md), [décisions](SPEC_DECISIONS_GRAPH_DATAVIZ_REPATRIATION.md),
[plan](../plan/10-BRANCH_graph-dataviz-repatriation.md), [M1](SPEC_EVOL_GD_M1_MERGE.md).
Cible : une PR vers `main`, branche `feat/gd-m2-model`.

## 1. Décisions owner appliquées

| Réf | Sujet | Décision |
|---|---|---|
| D1 | Forme du noyau | **A — noyau typé + profils versionnés.** Le document sémantique est une union discriminée par type, validée par un schéma de profil versionné, et non un sac de propriétés. |
| D3 | Interopérabilité | **C — import large en lecture seule d'abord.** Un contenu importé qu'un profil ne valide pas est conservé (`preserved-unvalidated`) avec son hash, jamais promu en fait métier ; l'écriture inverse (export fidèle, aller-retour) est hors de ce lot. |
| D2 | Familles de publication | Rappel M1 : `graph` et `dataviz` restent deux lignes distinctes. Tout nouveau paquet naît **privé** ; aucune publication sans geste du propriétaire. |

## 2. Point de départ (vérifié le 2026-09-24, revérifié sur la branche après revue croisée)

- `@sentropic/graph` 0.3.0 contient un moteur de rendu et de mise en page : `renderer.ts`, `webgl-*.ts`,
  `layout-*.ts`, `render-geometry.ts`, `edge-geometry.ts`, `buffers.ts`, `positions.ts`, `types.ts`
  (19 lignes d'export au barrel). **Aucun modèle sémantique** : ni document, ni vue, ni occurrence,
  ni commande, ni profil.
- `@sentropic/dataviz-core` 0.5.0 porte l'état inter-vues des tableaux de bord : il ne modélise pas de
  diagramme et n'a pas à le faire.
- Les paquets proposés par l'étude §3.2 — `@sentropic/diagram-core`, `-codecs`, `-canvas` — n'existent pas.
- Règle de couche à ne pas casser, énoncée comme la garde l'applique : aucun paquet
  `@sentropic/design-system-*` ne dépend de `@sentropic/dataviz-*`, de `@sentropic/diagram-core` ni de
  `@sentropic/diagram-codecs`, ni en dépendance, ni en dépendance de développement, ni en pair, ni par
  un import de source (vérifié : un import de ce genre, introduit par erreur dans la PR #65, rendait la
  publication des quatre paquets DS dépendante du train dataviz ; il a été retiré). En revanche les huit
  arêtes que l'architecture cible déclare — `design-system-{svelte,react,vue,angular}` vers
  `@sentropic/graph` et vers `@sentropic/diagram-canvas`, dans `docs/graph-dataviz-architecture-dag.json`
  et à l'étude §3.2/§3.3 — **restent permises** : ce sont elles qui portent `GD-M2-DS-PRESENTATION` et
  `GD-M2-CANVAS`, et le sous-chemin `@sentropic/graph/contracts` du §3.1 en dépend.

## 3. Travail demandé

### 3.1 Un paquet, privé

Créer `packages/diagram-core` (`@sentropic/diagram-core`, version `0.1.0`, `"private": true`).

- Aucune dépendance runtime. Aucun import de DOM, de framework, de `renderer.ts` ni d'aucun module WebGL.
- Les seuls imports autorisés depuis `@sentropic/graph` sont des **contrats sans DOM** (types de positions,
  de buffers et de géométrie). Le sous-chemin `@sentropic/graph/contracts` était conditionné au besoin ;
  l'implémentation (#85) n'en a eu aucun et ne l'a donc pas créé : le paquet livré a zéro dépendance,
  `packages/graph` est resté intact, et l'arête `diagram-core → graph` du DAG reste `proposed`. Lier le
  schéma persisté des vues aux types d'un autre paquet irait d'ailleurs contre l'esprit du §3.6.
- Le paquet reste absent de la liste des paquets publiables : `scripts/verify-publishable-licensing.test.mjs`
  doit continuer d'en compter **17**, et `scripts/smoke-pack.mjs` de ne pas le sélectionner.

### 3.2 Références (cinq types non interchangeables)

`EntityRef`, `OccurrenceRef`, `PortRef`, `ViewRef`, `ResourceRef`, `RelationRef` et `DocumentRef` :
types nominaux distincts (marque de type), non assignables entre eux, chacun avec son namespace d'identité.
Une fonction qui attend une occurrence ne doit pas accepter une entité, à la compilation comme à
l'exécution (garde de forme + diagnostic).

Les deux derniers manquaient à la première version de ce cadrage, qui n'en nommait que cinq alors que le
§3.4 en exige sept : `ViewDocument.semanticDocumentId` pointe vers un **document**, qui n'est ni une vue ni
une entité, et une occurrence de **relation** pointe vers une relation, qui n'est pas une entité. Typer ces
deux champs avec l'une des cinq aurait été exactement le mésusage que ce paragraphe interdit. La lacune a
été relevée par l'implémentation (#85), qui livre les sept et le déclare au lieu de le glisser en douce.

### 3.3 Document sémantique et profils versionnés (D1-A)

- `SemanticDocument` : `documentId`, `schemaVersion`, `revision`, `profileRefs`, entités, relations, ports
  sémantiques, définitions de types, ressources référencées. **Exclut** positions, caméra, composants, fonctions.
- Entité : union discriminée par `type` **et** profil ; attributs typés selon le schéma du profil
  (quantité+unité, énumération, référence, texte, date, booléen, collection bornée) — jamais un dictionnaire libre.
- Relation : extrémités typées avec rôle, direction et cardinalité ; l'ID métier survit à toute projection
  qui la transformerait en nœud de jonction.
- Profil : module de schéma versionné (`bpmn@1`, `archimate@1`, `uml@1`, `generic@1`) enregistré dans un
  registre ; un profil déclare ses types, ses relations légales, ses contraintes et ses limites. Ce lot
  n'implémente que `generic@1` **complet** et l'ossature de validation des trois autres (types et matrice de
  relations déclarés, fixtures de qualification listées mais non exhaustives) : les profils natifs sont M3.
- Extension : nommée par URI de namespace, version et portée ; conserve son contenu source, son hash et son
  niveau de validation (`validated`, `preserved-unvalidated`, `unsupported`). Aucune exécution de contenu
  importé, d'URL ni de HTML, même implicite (D3-C).

### 3.4 Vues et occurrences

`ViewDocument` : `viewId`, `semanticDocumentId`, `revision`, occurrences d'entités/relations/ports, groupes
visuels, filtres de vue, état de présentation persistable. Exclut l'état transitoire (survol) et toute
duplication d'entité par dessin. Une entité a N occurrences dans une vue et dans plusieurs vues ; supprimer
une occurrence ne supprime pas l'entité ; supprimer une entité exige une politique explicite pour ses
occurrences et relations (paramètre obligatoire, pas de défaut silencieux).

### 3.5 Commandes et transactions

Une commande validée transforme `(document, vues, revision)` en `(nouvel état, effets, inverse | raison
non-inversible)`. Exigences :

- Aucun succès partiel : soit la transaction s'applique entièrement, soit elle est refusée avec diagnostic.
- Conflit de révision : refus explicite (`revision-conflict`) portant la révision attendue et la révision vue.
- Inverse logique : chaque commande fournit son inverse ou la raison documentée de son absence.
- Jeu de commandes de ce lot : créer/mettre à jour/supprimer une entité, une relation, un port ; créer/déplacer/
  supprimer une occurrence ; créer/supprimer une vue ; attacher/détacher une ressource ; appliquer **et
  retirer** une extension conservée — la première version de ce paragraphe exigeait un inverse pour chaque
  commande sans lister celle qui retire une extension, alors qu'ajouter une extension ne s'annule qu'en la
  retirant, ce qui porte le jeu à dix-huit commandes (relevé par #85). Sélection, édition de ports
  géométriques et annotations relèvent de `GD-M2-CANVAS`.

### 3.6 Migration de schéma

Une version de schéma stockée n'est migrée que par une fonction versionnée qui produit un rapport
(`from`, `to`, opérations, éléments non migrés et raison) et conserve l'original. Une version majeure inconnue
est **refusée en écriture** et conservée pour inspection et export si la lecture est possible.

### 3.7 Fixtures et cas rejetés

Sous `packages/diagram-core/fixtures/` : documents valides (générique, et un échantillon par profil déclaré),
documents à révisions divergentes, séquences commande→inverse→état initial, et **cas rejetés** nommés :
référence pendante, référence de mauvais type, cycle dans une hiérarchie déclarée arbre, attribut hors schéma,
unité manquante, collection au-delà de sa borne, version majeure inconnue, conflit de révision, extension
`unsupported`. Chaque cas rejeté est un test qui assère le diagnostic, pas seulement l'échec.

## 4. Hors périmètre

`GD-M2-PROCESSING` (déplacement Barnes-Hut/hierarchy, registre, résultats riches), `GD-M2-WORKERS`,
`GD-M2-DS-PRESENTATION`, `GD-M2-CANVAS`, `GD-M2-PARITY`/`GD-M2-THEMES`, les codecs (`GD-M4`), les profils
natifs complets (`GD-M3`), toute publication npm, tout changement de la racine publique de `@sentropic/graph`.

## 5. Critères d'acceptation (tous exécutés et consignés)

1. **Périmètre** : le diff ne touche que `packages/diagram-core/**`, `packages/graph/**` (ajout du sous-chemin
   de contrats uniquement), `package.json`, `package-lock.json`, `spec/**`, `plan/**`,
   `docs/graph-dataviz-*` et `.track/**` via Track. La première version de ce critère omettait `docs/**`
   alors que le critère 8 exige la mise à jour du plan de migration : contradiction relevée par
   l'implémentation (#85), qui a suivi l'instruction spécifique et consigné le conflit.
2. **Portes** : `npm ci`, `npm run build`, `npm run check`, `npm test`, `npm run licensing:check`,
   `npm run pack:smoke` — tous exit 0. Aucun paquet publiable ajouté (17 inchangé).
3. **Sans DOM** : un test importe tout le barrel de `diagram-core` dans Node sans jsdom et échoue si un
   `document`/`window` est touché ; un test de dépendances interdit tout import de `renderer`, `webgl-*`,
   d'un framework ou d'un paquet DS depuis `diagram-core`.
4. **Références** : un test de types prouve que les cinq `*Ref` ne sont pas interchangeables, par
   `@ts-expect-error` sur chaque affectation illégitime (le mécanisme déjà employé dans sept fichiers du
   dépôt). Il tient le critère 2 en même temps : `npm run check` reste à exit 0 tant que les erreurs
   attendues ont lieu, et rend `TS2578` (« @ts-expect-error inutilisé ») dès que les marques de type
   disparaissent — ce qui est la régression à attraper. Le compte de paquets publiables est déjà outillé :
   `scripts/verify-publishable-licensing.test.mjs` assère `publishable.length === 17`.
5. **Invariants** : les huit invariants de l'étude §4.2 ont chacun au moins un test nommé, ou une justification
   écrite s'ils relèvent d'un lot ultérieur.
6. **Commandes** : pour chaque commande du §3.5, un test `commande → inverse → état initial` octet pour
   octet sur la sérialisation **du contenu**, révisions normalisées, plus une assertion séparée que la
   révision a avancé de deux. Pris au mot, « octet pour octet sur la sérialisation du document » était
   infaisable pour toute implémentation, puisque ce même §3.5 impose que la commande incrémente la
   révision et que l'annulation soit une nouvelle transaction : une comparaison d'octets incluant la
   révision ne pouvait pas passer. Relevé par l'implémentation (#85).
7. **Cas rejetés** : les neuf cas du §3.7 échouent avec un diagnostic assérté.
8. **Documentation** : `packages/diagram-core/README.md` (anglais) décrit le modèle, ses limites et ce qui
   n'est pas encore couvert ; `docs/graph-dataviz-migration-plan.md` est mis à jour pour l'état réel de M2.
9. **Forme** : messages de commit en anglais avec corps mesuré ; aucun trailer d'attribution ; aucun Python.

## 6. Inconnues et risques

- **Frontière `graph`/`diagram-core`** : le sous-chemin de contrats sans DOM est une hypothèse réversible tant
  qu'aucun contrat public n'est publié. Si l'extraction fait apparaître un import de `renderer.ts`, c'est un
  signal d'arrêt : consigner plutôt que contourner.
- **Coût des profils** : seul `generic@1` est complet dans ce lot ; annoncer BPMN/ArchiMate/UML comme
  « ossature déclarée, fixtures partielles » et non comme conformité.
- **Sérialisation** : le format de persistance (JSON canonique) fixe l'égalité octet pour octet des tests
  d'inverse ; tout changement ultérieur de sérialisation est une migration versionnée, pas une retouche.
