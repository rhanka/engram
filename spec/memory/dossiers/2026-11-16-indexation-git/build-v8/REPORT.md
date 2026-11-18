# Build Report — Live-Git Decision Dossier `v8` (`v7` Layout + `v6` Content: Benchmark Restored, `Scion (Anthropic)` Named, Worktrees)

## 1. Summary & Artifact Digests

| Field | Value |
| --- | --- |
| Workspace folder | `/home/antoinefa/src/graphify/.graphify/scratch/design/live-git-indexing/build-v8/` |
| Output HTML | `build-v8/dossier.html` (`1 696 781` bytes / `1.62 MiB`, ceiling `≤ 16 MiB`) |
| `dossier.html` SHA-256 | `03115d706e02bb36bb32994138318babd3e4b283280264086002e38cade26bcc` (deterministic across consecutive builds) |
| Source content file | `../DOSSIER-CONTENU-v6.fr.md` (`120 535` bytes, `895` lines — **untouched**) |
| Source `v6` SHA-256 | `781dccd2793b3d2902c92f402be02653a366e75b407097267bbba4c00dfff28a` (**untouched**) |
| Source `v5` SHA-256 | `d6e07cffb3b313288357941de9883983e1a2ae351038a468a501dee92f0ebf51` (**untouched**) |
| `build-v7/dossier.html` SHA-256 | `9e32c35e2a6b14df4fa88a2d42b0fb7e51af2930cb79ef09dc692c5d2ed28beb` (**untouched**) |
| `build-v6/dossier.html` SHA-256 | `615dafc202f414e254cd9912488490e3c48d85c37aed44aa7ff162bde4c96c80` (**untouched**) |
| Focus renderer / validator | `0.98.10` / `0.6.0` |

---

## 2. Content Switch, Layout Rules & Marginal Diagram Retouch

1. **Verbatim `DOSSIER-CONTENU-v6.fr.md` (`content.mjs`):**
   - `roundTripExact === true` (re-serialising the parsed AST reproduces the exact `120 535` bytes of `DOSSIER-CONTENU-v6.fr.md`).
   - All `1 379` `[data-src="u0001".."u1379"]` units appear **exactly once** in `#v8-content` and match an independent second Markdown reader byte-for-byte.
   - `Scion (Anthropic)` appears verbatim across all `21` units (`22` occurrences) where `v6` names it, as well as in Diagram 5 (`sys_ref_tool`, wide and narrow).

2. **`v7` layout & navigation preserved (`render.mjs`, `page-enhancements.css`, `page-enhancements.js`):**
   - Order: `En bref` → `Le décor en cinq schémas` (all `5` static `r7` Design-System diagrams open with their titles and verbatim `Ce que montre le schéma : …` captions) → `§1` → `§2` → `§3` → `§5` → `§6`.
   - Top navigation (`#dossier-nav`): `En bref` → `Le décor (5 schémas)` → `Schéma 1` .. `Schéma 5` → `1. Décisions actées` → `2. État au 16/11` → `3. Benchmark & Scion` → `5. Portes conditionnelles` → `6. Votre réponse` (verified monotonically non-decreasing `Y` targets).

3. **Benchmark & long-material folding (`26` closed `<details>` blocks with 1-line summaries):**
   - **Open on first paint:** `En bref`, all `5` diagrams in `Le décor en cinq schémas`, `§1.2` settled decisions table (`11` rows), `§2.1` finality sentence & worktree status, `§2.3` `6`-step sequence, **`§3.3` unified benchmark table (`#### Table comparative unifiée du benchmark` — header row + `14` function-by-function rows)** + **`§3.4` synthesis**, `§5` conditional gates, and `§6` validation kit.
   - **Folded (`26` blocks, `openDetailsInTpl === 0`):**
     - `15` `§4` group, node, and link tables (`7`, `23`, `27` rows in Schéma 1; `6`, `19`, `21` in Schéma 2; `6`, `13`, `14` in Schéma 3; `2`, `14`, `12` in Schéma 4; `3`, `12`, `9` in Schéma 5);
     - `5` `§4` declarative specifications (`JSON generic@1` for Schémas 1, 2, 5; `flowchart` for Schémas 3, 4 + Focus relation list) + `1` `§4` Focus renderer contract note (`4` lines);
     - `1` `§1.1` owner verbatim blockquote block (`4` citations, `8` lines);
     - `1` `§2.2` detailed lot-by-lot table (`26` rows);
     - `1` `§3.1` Graphify upstream comparison tables (`14` rows), keeping `Écarts voulus face à upstream` open;
     - `1` `§3.2` shelf-solutions catalog table (`25` rows);
     - `1` `§3.3` detailed per-tool review (`CodeGraph, GitNexus, CodeGraphContext et Scion (Anthropic)`, `4` tools, `12` lines).

4. **Diagram 1 (`§4.1`) marginal worktree retouch (`diagrams.mjs`):**
   - Split `Clones et arbres Git` inside `grp_sources` into `src_clone` (`Clone (dépôt commun)`) and `src_worktree` (`Worktrees liés`), adding links `lnk_a25` (`cmp_safe_observer -> src_worktree`), `lnk_a26` (`cmp_h2a_supervisor -> src_clone`), and `lnk_a27` (`cmp_h2a_supervisor -> src_worktree`) alongside `lnk_a02` (`cmp_safe_observer -> src_clone`) (`23` cards, `27` links).
   - Preserved the exact `2712` wide canvas width and kept Columns 2, 3, and 4 at identical coordinates; build-time and live Chromium geometry lint both stay at `0`.

5. **`86` owner comment fields exported in JSON, YAML, and response line:**
   - `7` section fields (`sec-en-bref`, `sec-4`, `sec-1`, `sec-2`, `sec-3`, `sec-5`, `sec-6`);
   - `2` option fields (`option-1`, `option-2` inside `#sec-6` option cards);
   - `26` folded-block fields (`fold-s4-*`, `fold-s1-1`, `fold-s2-2`, `fold-s3-1`, `fold-s3-2`, `fold-s3-3-reviews`), interactive whether closed or open;
   - `51` per-row fields (`11` in `§1.2`, `26` in `§2.2`, `14` in `§3.3` unified benchmark).

---

## 3. Verification Gates (`verify-specs.mjs` + `check-v8.mjs` + `probe.mjs`)

### Declarative Spec Gate (`node verify-specs.mjs` -> `evidence/spec-diagnostics.json`)
- **Result:** `hardGatePassed: true` — all `5` `§4` specs match `§4` tables 1:1, pass `@sentropic/diagram-core` `validateDocument`, Focus `buildFocusDossier`, Focus DS `renderDiagramViews` (`[30, 25, 13, 14, 15]` views), and `0` DS `card-overflow` warnings.

### Static Gate (`node check-v8.mjs` -> `evidence/static-v8.json`)
- **Result:** `25 / 25` passed (`failedChecks: []`).
- Verified `DOSSIER-CONTENU-v6.fr.md`, `DOSSIER-CONTENU-v5.fr.md`, `build-v7/dossier.html`, and `build-v6/dossier.html` untouched by SHA-256; lossless round-trip + independent reader agreement across all `1 379` units; `26` closed folds with single-line counts; open benchmark header/rows & synthesis; Diagram 1 worktree split (`src_clone`, `src_worktree`, `lnk_a02`, `lnk_a25`, `lnk_a26`, `lnk_a27`); `Scion (Anthropic)` across all `21` units + Diagram 5; `162` retouched `368×158` centred cards; `86` unique comment fields; DS CSS custom properties only (`0` color literals); `0` external URLs; `0` private paths; size `1.62 MiB ≤ 16 MiB`; and `0` guarded-vocabulary or client-company-name hits over every UTF-8 and Latin-1 byte of `dossier.html`, `DOSSIER-CONTENU-v6.fr.md`, and every non-binary file in `build-v8/`.

### Offline Chromium Probe (`node probe.mjs` -> `evidence/probe-v8.json`)
- **Result:** `allPassed: true` (`17 / 17` checks passed per view) across all **4 views**:
  - `1440×900` `light` (`wide` variant, `minFontPx: 10.04`, `horizontalOverflow: [0, 0, 0]`, `innerScrollbars: []`, `diagramProblems: {}`)
  - `1440×900` `dark` (`wide` variant, `minFontPx: 10.04`, `horizontalOverflow: [0, 0, 0]`, `innerScrollbars: []`, `diagramProblems: {}`)
  - `390×844` `light` (`narrow` variant, `minFontPx: 10.18`, `horizontalOverflow: [0, 0, 0]`, `innerScrollbars: []`, `diagramProblems: {}`)
  - `390×844` `dark` (`narrow` variant, `minFontPx: 10.18`, `horizontalOverflow: [0, 0, 0]`, `innerScrollbars: []`, `diagramProblems: {}`)
- Verified `offline: true` (`0` network requests, `0` page/console errors), all `1 379` units byte-exact, all `26` folded blocks closed on first paint (`openFoldsAtLoad === 0`) and opening/re-closing cleanly on pointer clicks (`foldedBlocksChecked: 26`), open-by-design benchmark/decisions/finality/6-steps/kit visible on first paint, and `9` remarks typed across closed folds (`fold-s4-1-links`, `fold-s2-2`, `fold-s1-1`, `fold-s3-3-reviews`), section (`sec-2`), option (`option-1`), and rows (`s1-2-r03`, `s2-2-r08`, `s3-3-r03`) dated, anchored, and verified in `JSON.parse`, `yaml.parse`, and `#copy-line`.

---

## 4. Screenshots Captured in `build-v8/shots/` (`32` PNGs)

- **First paint (`wide` & `narrow`, light & dark):** `1440x900-light-first-paint.png`, `1440x900-dark-first-paint.png`, `390x844-light-first-paint.png`, `390x844-dark-first-paint.png`
- **Décor (`wide` & `narrow`):** `1440x900-light-decor.png`, `390x844-light-decor.png`
- **Benchmark (`wide` & `narrow`):** `1440x900-light-benchmark.png`, `390x844-light-benchmark.png`
- **Folds (`wide` & `narrow`):** `1440x900-light-folds.png`, `390x844-light-folds.png`
- **Answer & comment export kit (`wide` & `narrow`):** `1440x900-light-kit.png`, `390x844-light-kit.png`
- **All five diagrams (`wide` & `narrow`, light & dark):** `schema-1-wide.png` .. `schema-5-wide.png`, `schema-1-narrow.png` .. `schema-5-narrow.png`, `schema-1-wide-dark.png` .. `schema-5-wide-dark.png`, `schema-1-narrow-dark.png` .. `schema-5-narrow-dark.png`
