# Intent capture — Studio / Reconciliation / Descriptions (2026-05-28)

> **Purpose:** upstream intent traceability. This is the user's request stored **AS-IS** (verbatim, including typos), to be referenced by the specs it feeds (`SPEC_TRACK_G_WORKSPACE.md`, `SPEC_WIKI_ENTITY_DESCRIPTIONS.md`, `SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md`, `SPEC_ONTOLOGY_OUTPUT_ARTIFACTS.md`). Do not paraphrase here — refinements live in the specs, this file is the raw source of intent.

Context: user UAT of the ontology studio (`graphify ontology studio`) and `graph.html` on the public-domain mystery pack, compared against the internal process-std-AM viewer reference.

## Verbatim request

```
1. All : boites creuses: c'est mieux, - cependant, elles devraient être quand meme en fond blanc transparent à 50% (les fleches partent du centre des box du coup on voit mal le texte)
2. C: les communautés ont toujours pas de label, je vois toujours psa la description des entités (on est censé avoir un "--description", pourquoi ? par ailleurs, les types d'entités ne smble pas correspondr eà un ontolgie qu'on avait définie (peronns, lieux, evidence, etc..) et relations - stp recherche ce qui a déjà été discuté la dessus, et rend moi compte de façon précise merci
3 .G: t'a pas acté toutes mes demandes, j'aimerais un état des lieux pour savoir ce que t'es censé avoir fait pour éviter de tout redire à chaque fois. j'avais notamment demander de replier les types etc et de déplacer les communautés, etc. quand tu me dis "ce que tu peux regardr mainenant", c'st pas précis je regade quoi et je te fais quel retour ? là je constate que seule le "theme blanc" + la boite ont été fait. c'est chiche. je vux que tu me revienne quand t'as traité TOUTES mes demandes (pas de pb pour des commits / push gh progressif, mais j'ai pas d'intérêt à valider chaque micro bout là)
4. process-std-AM: tu vois qu'on a un item selected aussi. sur PROCESS_STD avait on appliqué la feature description et est-elle censée être affichée ? In fine on avait décidé d'afficher l'article wiki incluant la description. On avait pris la décision aussi de ne pas afficher de description quand il n'y en avait pas de "fiable" je crois. Le pb c'est que comme j'en ai jamais vu, je n'ai jamais vraiment pu faire la recette de cette featur description.
5. Par ailleurs, quand on donne la source, ça manque d'un extrait de citation... ex dans sherlock quand le texte fait 200 pages, ça me fait un belle jambe d'avoir le texte de réf en entier: est-ce une feature qu'on propose ? il la faudrait
6. Enfin, quand on pose une entité, in fine elle est en relation avec un certain nombre d'autres entités (doc ou autre). ce serait pertinent de connaitre en plus de ses relations, le nombre intrinsèque de "citations" de cette entités (en somme, mais aussi dans une relation à un doc, le nombre d'apparition). a-t-on ces deux features ? il les faudrait également
7. pour le rapprochement d'entités, comment va être assuré la réconciliation, quelle processus algorithmie pour "aidr à faire converger" (traitment par lots, etc). on n'a jamais eu de revue la dessus

merci de stocker AS-IS cette demande, je voudrai l'avoir en référence pour traaibilité d'intention amont aux specS. merci
```

## Routing to specs (where each point is refined)

| # | Topic | Target spec |
| --- | --- | --- |
| 1 | Hollow box nodes → 50%-transparent white fill (text readable over edges from box centre) | `SPEC_TRACK_G_WORKSPACE.md` (studio UI target / graph rendering) |
| 2 | Community labels missing; entity descriptions never shown (`--descriptions`); entity types vs defined ontology + relations — research prior decisions | `SPEC_WIKI_ENTITY_DESCRIPTIONS.md`, `SPEC_ONTOLOGY_DATAPREP_PROFILES.md`, `SPEC_ONTOLOGY_OUTPUT_ARTIFACTS.md` |
| 3 | G: full état-des-lieux of all studio demands (collapse types, move communities, …); deliver ALL before reporting; progressive commits OK, no micro-validation | `SPEC_TRACK_G_WORKSPACE.md` (8-point target + G-studio-lot1..5) |
| 4 | Description feature: applied on process-std-AM? supposed to display? show wiki article incl. description; omit when no reliable description; never UAT'd because never seen one | `SPEC_WIKI_ENTITY_DESCRIPTIONS.md` (insufficient-evidence omit) |
| 5 | Source citation **excerpt/snippet** (not the full 200-page reference) — needed feature | `SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md` (evidence.snippet), `SPEC_ONTOLOGY_OUTPUT_ARTIFACTS.md` |
| 6 | Entity **citation/occurrence counts**: intrinsic total + per-document appearance count, alongside relations — needed features | `SPEC_ONTOLOGY_OUTPUT_ARTIFACTS.md` (Sources & Occurrences) |
| 7 | Reconciliation: matching algorithm + "help converge" process (batch, etc.) — **never reviewed**, needs a dedicated review/spec | `SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md` (candidate generation / sorting / convergence) |
