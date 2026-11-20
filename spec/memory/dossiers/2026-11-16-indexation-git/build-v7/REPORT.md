# Build Report — Live-Git Decision Dossier `v7` (Diagrams First, Long Tables & Specs Folded)

## 1. Summary & Artifact Digests

| Field | Value |
| --- | --- |
| Workspace folder | `/home/antoinefa/src/graphify/.graphify/scratch/design/live-git-indexing/build-v7/` |
| Output HTML | `build-v7/dossier.html` (`1 685 838` bytes / `1.61 MiB`, ceiling `≤ 16 MiB`) |
| `dossier.html` SHA-256 | `9e32c35e2a6b14df4fa88a2d42b0fb7e51af2930cb79ef09dc692c5d2ed28beb` (deterministic across consecutive builds) |
| Source content file | `../DOSSIER-CONTENU-v5.fr.md` (`143 630` bytes, `907` lines — **untouched**) |
| Source SHA-256 | `d6e07cffb3b313288357941de9883983e1a2ae351038a468a501dee92f0ebf51` |
| Previous `build-v6/` HTML SHA-256 | `615dafc202f414e254cd9912488490e3c48d85c37aed44aa7ff162bde4c96c80` (**untouched**) |
| Focus renderer / validator | `0.98.10` / `0.6.0` |

---

## 2. Layout Re-Ordering & Folding Applied (`render.mjs`, `page-enhancements.css`, `page-enhancements.js`)

1. **Diagrams first (`#sec-4` right after « En bref »):**
   - Placed all five `r7` static Design-System diagrams (`wide` at `≥ 1200 px`, `narrow` at `≤ 1199 px`, non-foldable) immediately after « En bref » under the section heading **« Le décor en cinq schémas »**.
   - Each diagram retains its title (`Schéma 1..5 — …`) and displays its verbatim one-sentence caption taken directly from its `Ce que montre le schéma : …` unit (`u0376`, `u0593`, `u0784`, `u0921`, `u1040`).
   - Sections `§1`, `§2`, `§3`, `§5`, and `§6` follow in order.

2. **Top navigation updated (`#dossier-nav`):**
   - Order: `En bref` → `Le décor (5 schémas)` → `Schéma 1` .. `Schéma 5` → `1. Décisions actées` → `2. État au 15/11` → `3. Comparaison` → `5. Garde-fous` → `6. Votre réponse`.
   - Verified in live Chromium that every link resolves and target `Y` coordinates are monotonically non-decreasing.

3. **23 long-material blocks folded into closed `<details>` blocks with 1-line row/line-count summaries:**
   - **15 `§4` group, node, and link tables** (`7`, `22`, `24` rows in Schéma 1; `6`, `19`, `21` in Schéma 2; `6`, `13`, `14` in Schéma 3; `2`, `14`, `12` in Schéma 4; `3`, `12`, `9` in Schéma 5);
   - **5 `§4` declarative specifications** (`90`, `79`, `50` JSON `generic@1` lines for Schémas 1, 2, 5; `29`, `30` `flowchart` lines for Schémas 3, 4, plus the native Focus relation list inside each specification fold) and **1 `§4` Focus renderer contract note** (`4` lines);
   - **1 `§1.1` owner verbatim blockquote block** (`4` citations, `8` lines), while keeping the `§1.1` table **« Exigence exprimée par l'owner »** (`5` rows) and `§1.2` (`11` rows) **open**;
   - **1 `§2.2` detailed lot-by-lot table** (`26` rows), while keeping `§2.1` (including its opening finality sentence) and `§2.3` (the `6`-step sequence) **open**;
   - **`§3.2`** (`14`-row function-by-function comparison), **`§5`**, and **`§6`** remain **open**.

4. **81 owner comment fields working whether blocks are open or closed:**
   - `7` section comment fields (`sec-en-bref`, `sec-4`, `sec-1`, `sec-2`, `sec-3`, `sec-5`, `sec-6`);
   - `23` folded-block comment fields (`fold-s4-*-groups|nodes|links|spec`, `fold-s4-contract`, `fold-s1-1`, `fold-s2-2`), mounted inside `.fold-block` immediately outside `<details>` so each folded block can be commented on while closed on first paint as well as when unfolded;
   - `51` per-row comment fields (`11` in `§1.2`, `26` inside `§2.2`, `14` in `§3.2`), with comments inside `§2.2` persisting in JSON, YAML, and response-line exports even after re-closing `§2.2`, and anchor clicks in `#comment-list` automatically re-opening ancestor `<details>`.

---

## 3. Verification Gates Re-Run (`v6` + `v7`)

### Static Gate (`node check-v7.mjs` -> `evidence/static-v7.json`)
- **Result:** `23 / 23` passed (`failedChecks: []`).
- `DOSSIER-CONTENU-v5.fr.md` and `build-v6/dossier.html` verified untouched by SHA-256; lossless round-trip `roundTripExact === true`; independent second Markdown reader agrees on all `1 195` `[data-src]` units, each appearing **exactly once** in `#v7-content`; `0` `<details open>` attributes in HTML; all `23` fold summaries single-line with explicit row/line counts; all `10` static `r7` scenes (`5 wide + 5 narrow`) match `§4` tables with legends, `0` overflows, `160` retouched `368×158` cards, and centred descriptions; DS CSS custom properties only (`0` `#hex`/`rgb()`/`hsl()` literals); `0` external URLs; `0` private paths; size `1.61 MiB ≤ 16 MiB`; and **`0` guarded-vocabulary hits over every byte** of `dossier.html`, `DOSSIER-CONTENU-v5.fr.md`, and every non-binary file in `build-v7/`.

### Offline Chromium Probe (`node probe.mjs` -> `evidence/probe-v7.json`)
- **Result:** `allPassed: true` (`17 / 17` checks passed per view) across all **4 views**:
  - `1440×900` `light` (`wide` variant, `minFontPx: 10.04`, `horizontalOverflow: [0, 0, 0]`, `innerScrollbars: []`, `diagramProblems: {}`)
  - `1440×900` `dark` (`wide` variant, `minFontPx: 10.04`, `horizontalOverflow: [0, 0, 0]`, `innerScrollbars: []`, `diagramProblems: {}`)
  - `390×844` `light` (`narrow` variant, `minFontPx: 10.18`, `horizontalOverflow: [0, 0, 0]`, `innerScrollbars: []`, `diagramProblems: {}`)
  - `390×844` `dark` (`narrow` variant, `minFontPx: 10.18`, `horizontalOverflow: [0, 0, 0]`, `innerScrollbars: []`, `diagramProblems: {}`)
- Verified `offline: true` (`0` network requests, `0` page/console errors), all `1 195` `[data-src]` units byte-exact whether folded or open, all `23` folded blocks closed on first paint (`openFoldsAtLoad === 0`, body hidden) and opening/re-closing cleanly on real pointer clicks (`foldedBlocksChecked: 23`), open-by-design blocks (`§1.1` owner table, `§1.2`, `§2.1` finality sentence, `§2.3` 6 steps, `§3.2`, `§5`, `§6`) visible on first paint, remarks typed on both closed folds (`fold-s4-1-links`, `fold-s2-2`, `fold-s1-1`) and open/unfolded fields (`sec-2`, `s1-2-r03`, `s2-2-r08`, `s3-2-r11`) dated, anchored, and verified in `JSON.parse`, `yaml.parse`, and `#copy-line`.

---

## 4. Screenshots Captured in `build-v7/shots/`

- **First paint (`wide` & `narrow`, light & dark):** `1440x900-light-first-paint.png`, `1440x900-dark-first-paint.png`, `390x844-light-first-paint.png`, `390x844-dark-first-paint.png`
- **Diagrams-first & folded tables (`wide` & `narrow`):** `1440x900-light-decor.png`, `390x844-light-decor.png`, `1440x900-light-folds.png`, `390x844-light-folds.png`
- **Answer & comment export kit (`wide` & `narrow`):** `1440x900-light-kit.png`, `390x844-light-kit.png`
- **All five diagrams (`wide` & `narrow`, light & dark):** `schema-1-wide.png` .. `schema-5-wide.png`, `schema-1-narrow.png` .. `schema-5-narrow.png`, `schema-1-wide-dark.png` .. `schema-5-wide-dark.png`, `schema-1-narrow-dark.png` .. `schema-5-narrow-dark.png`

---

## 5. Finalisation (session de relais)

- Capture premier affichage 1440x900 relue visuellement : navigation dans le nouvel ordre, « En bref » en tete, aucun schema avant « En bref » hors navigation.
- Protocole de publication prepare dans `PUBLICATION-HANDOFF.md` : relance `build` + `check-v7` + `probe`, controle des SHA-256, puis transmission au conductor.
- **Non execute dans cette session :** rebuild, lint geometrique et probe n'ont pas ete relances (shell indisponible, echec d'amorcage avant execution). Les resultats des sections 3 et 4 restent ceux des preuves `evidence/static-v7.json` et `evidence/probe-v7.json` deja presentes.
- Aucun commit, aucune publication : en attente du GO explicite apres relance des gates.
