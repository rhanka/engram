# Points propriétaire nouveaux issus de la relecture tour 1 de Spec 2 (`v0.4.1`)

Un seul point nouveau relève d'un choix propriétaire réel (`OQ-S2-6` dans `spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md:1632`). Les quatre points de `Spec 4` (`M11`, `spec/SPEC_ENGRAM_H2A_ROLE_ONTOLOGY_AND_HARNESS_OVERLAYS.md:31-35`) sont purement techniques et tranchés dans `Spec 2 §8.2.3` (`:1441-1465`) ; les deux jalons de mise en service (`m5`, `DOSSIER-r7.fr.md:273,490,496,589`) sont déjà décidés dans leur principe et rappelés avec leur posture fermée par défaut dans `Spec 2 §11.3` (`:1636-1643`).

---

## `OQ-S2-6` — Maintien et niveau d'effort sur Gemini CLI (`gemini`) face à Antigravity CLI (`agy`)

- **Source :** `spec/memory/dossiers/2026-11-15-contexte-court/DOSSIER-r7.fr.md:157,529` ; état d'exécution réelle de `gemini` marqué `unverified` (`h2a:docs/host-integration-matrix.md:18`).
- **Contexte en une phrase :** Google a remplacé Gemini CLI par Antigravity CLI (`agy`), mais les deux outils restent installés sur le poste et figurent dans la grille à huit outils de `h2a` (`h2a:packages/h2a/src/hosts/plugin.ts:100-113`).

### Options (3)
1. **Option A — Garder `gemini` au socle passif, sans investir sur le vidage de contexte en session (`D2 A` / `D4 B` uniquement) :** `gemini` continue de noter la session, de recevoir le diff du graphe et de résumer les sorties d'outils, mais on ne développe ni ne qualifie la sonde de vidage après tour (`AfterAgent` `clearContext: true`, crans `P3`/`P4`). **Gain :** aucun coût d'essai ni de maintenance sur un outil remplacé côté éditeur, zéro rupture avec la grille à huit outils de `Spec 6A` (`spec/SPEC_ENGRAM_CLUSTER_MESH_MEMORY_ACCESS_AND_MCP_WIRING.md:761`). **Coût / retour arrière :** `gemini` n'aura pas le contexte court par vidage en session tant qu'on ne rouvre pas l'Option B (activation ultérieure additive, sans migration).
2. **Option B — Qualifier `gemini` jusqu'au vidage et renourrissage en session (`D4 C` amendé, crans `P3`/`P4`) :** investir dans l'essai en terminal réel (`HostScrollbackProbeReceiptV1`, `Spec 2:392-395`) et le rejeu `D9 C` sur `AfterAgent` `clearContext: true` (`DOSSIER-r7.fr.md:144,514`), au même titre qu'`opencode` et `codex`. **Gain :** un second outil tiers capable de vider le contexte après chaque tour si le défilement utilisateur tient (`unverified`). **Coût / retour arrière :** temps de qualification et d'entretien sur un outil que son éditeur ne fait plus évoluer en premier ; repli immédiat vers l'Option A par simple réglage de plafond dans `BridgeLock`.
3. **Option C — Retirer `gemini` du périmètre de `Spec 2` (garder 7 outils tiers, avec `agy` seul outil Google) :** ne câbler ni le curseur ni les essais `Spec 2` sur `gemini`. **Gain :** surface d'essais réduite à sept outils actifs. **Coût / retour arrière :** crée un écart avec la grille à huit outils déjà retenue dans `Spec 6A` (`:644,761`) et coupe le journal parallèle si `gemini` sert encore ponctuellement.

### Recommandation et objection principale
- **Recommandation :** **Option A** (retenue comme posture par défaut non préemptive dans `Spec 2:406,1632` tant que tu n'as pas tranché).
- **Objection la plus forte contre l'Option A :** `gemini` est, avec `opencode`, l'un des deux seuls outils tiers dont la documentation installée décrit déjà un vidage explicite du contexte après un tour (`DOSSIER-r7.fr.md:144,157,514`) ; ne pas tester `P3`/`P4` sur `gemini` prive d'un terrain d'essai supplémentaire du contexte court si tu utilises encore `gemini` au quotidien.
