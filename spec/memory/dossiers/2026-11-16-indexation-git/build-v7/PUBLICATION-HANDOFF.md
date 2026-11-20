# Passation publication — dossier Git indexation v7 (layout-only)

## Statut

- Artefact pret a relire, **non publie, non commite**.
- Publication uniquement via le conductor, apres **GO explicite** de l'owner.
- Aucune modification du fichier source ni de `build-v6/` : voir empreintes ci-dessous.

## Artefact et empreintes (preuves existantes dans `evidence/`)

| Element | Valeur |
| --- | --- |
| Fichier livre | `dossier.html`, 1 685 838 octets (plafond 16 Mio) |
| SHA-256 `dossier.html` | `9e32c35e2a6b14df4fa88a2d42b0fb7e51af2930cb79ef09dc692c5d2ed28beb` |
| SHA-256 fichier source | `d6e07cffb3b313288357941de9883983e1a2ae351038a468a501dee92f0ebf51` |
| SHA-256 `build-v6/dossier.html` | `615dafc202f414e254cd9912488490e3c48d85c37aed44aa7ff162bde4c96c80` |
| Unites verbatim | 1 195, aller-retour exact |
| Blocs replies fermes | 23, resumes d'une ligne avec compte lignes/citations |
| Champs de commentaire | 81 (7 sections, 23 blocs replies, 11 + 26 + 14 lignes) |
| Scenes statiques | 10 (5 schemas, wide + narrow), cartes 368x158, 0 debordement |

## Mise en page v7 verifiee

1. Les cinq schemas sont places juste apres « En bref », sous « Le decor en cinq schemas », chacun avec son titre et sa phrase « Ce que montre le schema ».
2. Navigation dans le nouvel ordre : En bref, Le decor, Schema 1 a 5, puis sections 1, 2, 3, 5, 6.
3. Replies fermes au premier affichage : tables groupes/noeuds/liens et specifications declaratives de la section 4, bloc verbatim 1.1, table lot par lot 2.2.
4. Ouverts : table « Exigence exprimee par l'owner » 1.1, 1.2, 2.1 et sa phrase de finalite, sequence 2.3 en 6 etapes, comparaison 3.2, sections 5 et 6.
5. Chaque bloc replie garde son champ de commentaire utilisable ferme ou ouvert ; exports JSON, YAML et ligne de reponse conserves.

## Gates deja enregistrees (a relancer avant publication)

Preuves presentes : `evidence/build-v7.json`, `evidence/static-v7.json` (23/23, `failedChecks: []`), `evidence/probe-v7.json` (`allPassed: true`, 4 vues 1440x900 et 390x844, clair et sombre, 17 controles par vue, 0 requete reseau, 0 debordement, folds fermes puis ouverts au clic).

Relance imposee dans `build-v7/`, dans cet ordre, avant tout envoi :

```text
node build.mjs
node check-v7.mjs
node probe.mjs
```

Criteres d'arret : toute difference de SHA-256 apres rebuild, tout check statique en echec, `allPassed` different de `true`, un fold ouvert au premier affichage, ou une empreinte source / `build-v6/` differente des valeurs ci-dessus bloque la publication et revient au conductor.

## Protocole via le conductor

1. Relancer les trois commandes ci-dessus et joindre les trois fichiers `evidence/` mis a jour.
2. Controler visuellement les captures `shots/` premier affichage, decor et folds, en wide et narrow.
3. Transmettre au conductor : lien local de l'artefact, SHA-256, resultats 23/23 et probe, liste des captures.
4. Attendre le **GO** explicite. Sans GO : ni commit, ni publication, ni envoi externe.
5. Apres GO seulement, le conductor publie la nouvelle version de l'artefact et consigne URL, version et SHA-256 dans le suivi du dossier.

## Perimetre preserve

Aucune touche a `app-context`, a la purge GitHub, au dossier r2, aux logs ni aux dependances installees. Travail limite a `build-v7/`.
