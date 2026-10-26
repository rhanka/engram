# MCP-L4 — preuves du candidat, tour auteur 2

Source : `ad96c6815e252daca31389cbe64b992d3e107a35`, sur `feat/memory-mcp-l4-candidate`.
Base : `origin/main 5a8018e35f895995ae0299021aa4902dbd45cdcc`, engram **0.21.2**.
Spec SHA-256 : `18c697c1cd91287fd9f814c059910ffb4b39ddb1be46af547f384c7d912177b2`.
Pré-candidat P2 SHA-256 : `2b85ff28b6fe06bda0abcdc19255f61a1ed1e4b7cfbb40c2e881c98dd234424b`.

La revue indépendante du tour 1 (Muse, `/home/antoinefa/src/graphify/.graphify/scratch/design/memory-finalization/L4-review-muse-sa1.log`) conclut **SOLID**, avec trois points mineurs. Les constats précédemment clos restent couverts par les suites du candidat. Le présent document consigne les corrections et leur vérification par l'auteur ; la revue indépendante du tour 2 reste `unverified`.

| Point mineur | Correction et preuve |
| --- | --- |
| Références de secours dans la façade directe | Aucune synthèse de référence de confirmation ou d'annulation. Capture sans référence d'annulation valide : erreur typée de contexte avant réservation et appel moteur. Opération soumise à confirmation sans référence d'élicitation valide : `gate_failed`, sans vérification, attachement ni effet canonique. Six cas de régression : rouges avant correction, verts après. Les fixtures directes injectent explicitement leurs références. |
| Contrôles positifs de trace | Le consommateur activé exécute le vrai constructeur du store en mémoire et le vrai dispatch `engine.admin(bootstrap)` du code packé, jusqu'au port hôte injecté qui refuse la demande. Observations : **1 ouverture / 1 bootstrap**. Aucun canari synthétique de store ou d'identité. Les observateurs CJS, ESM et de processus enfants restent contrôlés. |
| SDK épinglé | Installation du consommateur activé avec **1.32.2 exact**, puis vérification de la version installée et de son égalité au manifeste. Le second consommateur installe et vérifie **1.31.0 exact**. Les six outils passent avec chaque SDK. |

Vérification après rebase :

- `npm install` simple avec npm **11.17.0**, sans ajout d'override ni `--force` : réussi ; verrou déjà cohérent. Une seule version de zod, **4.6.7**, avec dépendance directe `^4.6.6` ; aucun `ollama-ai-provider`. `npm ls --all` : **exit 0**. Le plancher SDK reste `^1.31.0` ; les pairs optionnels restent exactement **mcp-platform 0.4.0 / mcp-broker 0.1.0**.
- L'installation simple retire les pairs locaux optionnels. Les archives P2 vérifiées ont été extraites pour la compilation source après restauration de l'arbre verrouillé par `npm ci`. Les consommateurs packés installent réellement ces archives avec npm. Les incidents de préparation et la restauration sont consignés dans `candidate-validation.json`.
- `npm run build && npm pack` : réussi. Le build régénère et vérifie les **23 assets** du registre et leurs digests ; le reçu lie les octets du tarball. Les exports du manifeste proviennent exactement du `package.json` packé. La version reste **0.21.2**, sans publication.
- Suites ciblées : **135 réussites / 0 échec / 12 fichiers**. Acceptation packée : réussie séparément et dans la suite complète. Installation désactivée ordinaire, dépendances optionnelles présentes : **0 chargement fournisseur / 0 ouverture de store / 0 bootstrap / 0 compilation native mémoire**.
- Suite complète du candidat : **5430 réussites / 64 échecs / 37 ignorés**. Base exacte : **5391 / 64 / 37**. Les **64 identités et signatures d'échec dans 14 fichiers sont identiques**, sans ajout, retrait ni modification. Les signatures proviennent du module natif `fs_ext.node` absent, de ses conséquences SQLite et du contrôle npm >=10 sous le npm système **9.2.0**. La compilation ordinaire de la base reproduit l'absence de `fs_ext.node` ; `tsup --external fs-ext` produit ses bundles de comparaison, sans modification de ses sources. Les deux suites partagent les mêmes arbres de dépendances.

Tarball conservé dans `.graphify/scratch/l4-r2-artifacts/sentropic-engram-0.21.2.tgz` :

- SHA-256 : `a295eef8a1733fd8c00f72ccd6938a5ea11678fdf33848f8849c4d531bd43af8`
- Intégrité : `sha512-vzIjuznMAk9IXdzBJdJgSAe7Lf0pLxC1UGK6LrSoXcYYbFIR2BVL20e6Eej4YY4MZxZTljmnn5xdYO4l7MXBSA==`

`candidate-validation.json` contient les identités/signatures des échecs, les versions, les contrôles positifs, les commandes principales et les empreintes des journaux. `candidate-manifest.json` et le reçu restent hors des fichiers publiables.

`unverified` : revue indépendante du tour 2 ; qualification et checkpoint L5 des archives P2 ; bindings de l'hôte déployé, identité, tenancy, politiques et custody ; qualification native SQLite/PostgreSQL ; convergence hôte du nettoyage des clés d'admission, dont `AdmissionOutcomeV1` ne décrit pas la progression. Aucune conclusion de qualification globale.
