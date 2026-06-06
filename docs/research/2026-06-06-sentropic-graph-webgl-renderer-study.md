# Étude — `@sentropic/graph` : moteur de rendu WebGL pour grands knowledge graphs

Date : 2026-06-06 · Statut : **Draft / étude** · Décision renderer (P3) à trancher
Compagnon : `codex:graphify` (travail séparé, voir §8) · Peer DS : `claude:sent-tech-design-system`

## 1. But

Sortir le rendu du graphe du composant SVG du design system (DS `ForceGraph`) vers
une **bibliothèque dédiée `@sentropic/graph`**, capable d'afficher **tout** un
knowledge graph (1 k → 100 k+ nœuds) **quasi instantanément** en **WebGL**, avec un
**styling riche** (formes par type d'ontologie, couleur par communauté, arêtes à
tirets typés, légende, animation de fusion de réconciliation).

Orientation owner (cf. mémoire `feedback-perf-no-node-reduction`) : **ne pas réduire
le nombre de nœuds**. On corrige le rendu **et** la préparation / processing /
stockage des données. La veille (cf. `.graphify/scratch/STUDIO_PERF_ANALYSIS.md`) a
établi : *le mur à grande numéralité est le LAYOUT et la DATA, pas le rendu WebGL*.

## 2. Pourquoi une lib à part (et pas étendre le DS)

- **Découplage stratégique** : la visualisation du graphe est le cœur de valeur de
  graphify ; elle ne doit pas être otage du backlog d'un tiers (le code commente
  encore « ForceGraph 0.10.x » alors que le DS installé est 0.16.0 — déjà désync).
- **Réutilisabilité** : `@sentropic/graph` sert le studio graphify ET pourra servir
  d'autres surfaces (DS inclus, qui pourrait l'envelopper).
- **Spécialisation** : un moteur WebGL de graphe a des contraintes (atlas de glyphes,
  picking GPU, typed arrays) qui ne rentrent pas dans un composant SVG généraliste.

Le DS `ForceGraph` (SVG) **reste pertinent** pour les **petites scènes** (sous-graphe
de réconciliation, aperçus < ~1 k) où le styling SVG riche + l'anim de fusion sont
déjà bons. `@sentropic/graph` cible la **vue principale dense**.

## 3. Ce qu'on reprend de chaque référence (instruction owner : « copier »)

| Source | Licence | Ce qu'on reprend | Ce qu'on laisse |
|---|---|---|---|
| **cosmos.gl / Cosmograph** | MIT (OpenJS) | Modèle data **GPU-natif** : positions `Float32Array`, arêtes `Uint32Array` (index), attrs par point en typed arrays ; **layout + rendu sur GPU** ; `setPointPositions()` pour **injecter des positions pré-calc** + ne faire que quelques ticks de réchauffe ; simulation **séparable** du rendu (start/stop/pause) ; ≈ instantané à 100 k–1 M | Le « moteur de points » brut (styling pauvre) — on lui ajoute nos glyphes |
| **AntV G6 v5** | MIT | **Système de styling riche** : formes/glyphes par type, badges/icônes, **LOD par zoom**, **animations** ; **renderer pluggable** (canvas/SVG/WebGL) ; **layout pluggable** (WASM Rust / GPU) | Le poids/API « frameworky » de tout G6 — on prend les patterns, pas la dépendance entière |
| **Ogma** (Linkurious) | Commercial | **Ergonomie d'API** (core vanilla + bindings) ; **regroupement de communautés** (halos/combos) ; qualité d'**animations** ; transformations (filtres non destructifs) | Le code (propriétaire) — inspiration API uniquement |
| **KeyLines / ReGraph** | Commercial | **Cibles de perf** (60 fps @ 10 k, 1 k items en 0,17 s) ; **combos** (regroupement repliable — visuel, sans retirer de données) ; modèle d'**arêtes stylées** (largeur/couleur/label) ; time-aware (idée KronoGraph, hors scope v1) | Code propriétaire — inspiration |

## 4. Architecture cible de `@sentropic/graph`

**Cœur vanilla (framework-agnostique) + wrapper Svelte mince** (pour le studio ; pas
de lock-in React).

- **Rendu** : WebGL2. Base à trancher (§9) : `regl` (léger, déclaratif), `luma.gl`
  (utilisé par cosmos.gl / deck.gl), PixiJS (haut niveau), ou WebGL brut. Nœuds en
  **instanced rendering** ; arêtes en lignes GPU (tirets via shader / texture de
  motif). **Atlas de glyphes** pour les formes par type d'ontologie.
- **Modèle data (GPU-ready)** : `Float32Array` positions (x,y), `Float32Array` attrs
  (taille, couleur RGBA, indice de forme, dash family), `Uint32Array` arêtes (paires
  d'index). Pas de soupe d'objets JS dans le chemin chaud.
- **Styling** : mapping ontologie → glyphe/forme (repris de `graphAdapter.js`
  `TYPE_SHAPE`/`REL_DASH`), couleur par communauté (data-vis tokens DS), légende,
  **animation de fusion** = interpolation de positions sur GPU.
- **Layout (pluggable)** : (a) **build-time pré-calc** — *déjà livré* : `computeLayout`
  (Barnes-Hut O(n log n), `src/graph-layout.ts`) → `attachLayoutPositions` → x,y dans
  `scene.json` ; (b) **worker Barnes-Hut** incrémental (P2, réchauffe locale à la
  demande) ; (c) optionnel **layout GPU** type cosmos pour le live à 100 k.
- **Pipeline data** (P1d + binaire) : artefact **binaire** (header + Float32Array +
  Uint32Array) compressé **brotli** ; `fetch().arrayBuffer()` **dans un Web Worker** →
  vues typées (parse ≈ 0) → **transfer zéro-copie** → upload WebGL ; **cache IndexedDB**.
- **Interaction** : pan/zoom = matrice de vue (GPU) ; **picking GPU** (hover/select) ;
  **LOD / culling** hors-viewport (sans retirer de données du modèle).

## 5. Placement in-repo (pragmatique)

Le repo n'a pas de workspaces. Options :
1. **npm workspaces** : `packages/graph` (`@sentropic/graph`) + `packages/graphify`
   (actuel) + `studio/`. Propre, mais refactor de la racine.
2. **Dossier `graph/` autonome** (package indépendant publié séparément), importé par
   `studio/` comme dépendance. Moins invasif.
3. **Sibling repo** (`~/src/sentropic-graph`) — si on veut un cycle de release séparé.

Reco pragmatique : **option 1 ou 2 dans CE repo** d'abord (itération rapide,
réutilise `src/graph-layout.ts`), extraction en repo séparé seulement si le cycle de
release diverge. Décision §9.

## 6. Réutilisation de l'existant (déjà livré P0/P1)

- `src/graph-layout.ts` — `computeLayout` (Barnes-Hut) + `attachLayoutPositions` :
  **réutilisé tel quel** par `@sentropic/graph` (build-time + worker P2).
- `studio/src/lib/graphAdapter.js` — mappings ontologie (`TYPE_SHAPE`, `REL_DASH`,
  `communityStats`, autosizing) : **portés** vers le spec de style de la lib.
- `scene.json` (avec positions pinnées) : devient la source du **modèle binaire**.

## 7. Où s'insèrent P1d et P2

P1d (worker-parse) et P2 (worker layout) sont la **couche data/layout de
`@sentropic/graph`**. Leur ROI se réalise **avec leur consommateur** (le renderer
WebGL) : contre le SVG actuel, déjà rendu instantané au montage par le pin des
positions (P1), un worker pour un parse de ~3 ms (scene.json 486 Ko) serait de
l'infra prématurée, et un binaire de typed arrays devrait être re-converti en objets
pour le DS (perte du bénéfice). **Reco : implémenter P1d + binaire + P2 en même temps
que le renderer P3**, dans `@sentropic/graph`, pas avant. (À confirmer §9 — si l'owner
veut le worker-parse standalone tout de suite sur le SVG, c'est faisable mais à faible
gain immédiat.)

## 8. Coordination avec `codex:graphify` (compagnon)

`codex:graphify` travaille « à part » sur le compagnon. Pour éviter les collisions :
- Cette étude est la **référence partagée** (design + ce qu'on reprend de chaque lib).
- Délimitation suggérée : codex prototype le **cœur WebGL** (`@sentropic/graph` :
  renderer + modèle typed-array + picking) ; côté graphify on garde **layout
  (`graph-layout.ts`), pipeline scene/binaire, et le wrapper studio**.
- Interface de contrat à figer tôt : la **forme du modèle data** (typed arrays) et
  l'**API du composant** (`nodes/edges/positions/style/legend/onSelect/...`).

## 9. Décisions à trancher (owner / codex)

1. **Base WebGL** : `regl` vs `luma.gl` (aligné cosmos.gl) vs PixiJS vs WebGL brut.
2. **Cible perf v1** : 30 k riche (G6-like) ou 100 k+ (cosmos-like, styling plus
   sobre) — détermine le compromis glyphes ⇄ échelle.
3. **Placement** : workspaces `packages/`, dossier `graph/`, ou sibling repo.
4. **Layout live** : pré-calc + worker incrémental (CPU) suffisant, ou viser le
   **layout GPU** dès v1 ?
5. **Frontière DS** : `@sentropic/graph` remplace le DS `ForceGraph` dans la vue
   principale ; le DS le garde-t-il pour les petites scènes, ou l'enveloppe-t-il ?
6. **Séquencement P1d/P2** : avec P3 (reco) ou standalone tout de suite ?

## 10. Roadmap proposée

- **P0 ✅** quick-wins (resize sim, index dérivations).
- **P1 ✅** pré-calc positions au build + pin + iterations=1 (montage instantané sur
  le SVG actuel ; démo republiée).
- **P3a** (étude — ce doc) → décisions §9.
- **P3b** prototype `@sentropic/graph` (renderer WebGL + modèle typed-array) — codex.
- **P1d/P2/binaire** couche data+layout de la lib (worker fetch/parse zéro-copie,
  binaire brotli, IndexedDB, worker Barnes-Hut incrémental).
- **P3c** wrapper studio : `GraphCanvas` → `@sentropic/graph` pour la vue dense ; DS
  `ForceGraph` conservé pour la réconciliation. Aligner via h2a.
- **P3d** (option) layout GPU type cosmos pour le live à 100 k.
