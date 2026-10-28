# Rétrocession de l'ontologie OpenERP — entrée pour le gel du jeu standard (DD3)

Date : 2026-10-27. Producteur : session `openerp`. Destinataire : `engram` / `gr-conductor`.
Demande owner : « rétrocéder l'ontologie à engram ; elle devrait favoriser une interopérabilité
complète SAP / Odoo / OpenERP ».

Artefact lisible par machine : `tmp/ontology/openerp-ontology.json`
Générateur déterministe : `tmp/ontology/export-ontology.mjs` (parse des 43 migrations SQL, 0 lacune)

## 1. Pourquoi cette rétrocession tombe juste

`spec/SPEC_EVOL_DATA_ARCHITECTURE.md` (sur `origin/main`) prévoit déjà cet échange :

> **OpenERP universality (the 90% claim)** : contract-level only […] The DD3 mapping exercise MUST
> include at least one transactional document chain (order → lines → invoice) — master data
> (contacts, accounts, opportunities) is the easy part; ERP documents with relational invariants
> (stock moves, double-entry) are where the hypothesis can die. Time-boxed co-design with
> claude:openerp; registry MECHANICS proceed regardless, only the standard-set freeze waits.

La même spécification pose déjà deux garanties que nous ne demandons donc pas :

- « OpenERP (org B, B2B2B) : owns its OWN Postgres […] forced RLS on `organization_id` […]
  Universality is a CONTRACT story with OpenERP, never a shared database. »
- Enveloppe d'objet universel à **portée définie par la liaison** : « Sentropic binding =
  `tenantId` + `workspaceId`; **OpenERP binding = `organizationId`** — a required bare `workspaceId`
  would force every external builder to fake one ».

Ce second point corrige un écart que j'avais signalé le 2026-10-24 : la discordance un niveau / deux
niveaux existe dans `@sentropic/contracts.TenantContext` (runtime cluster mesh), **pas** dans
l'architecture de données, qui accepte explicitement `organizationId`.

## 2. Ce que nous rétrocédons — mesuré, pas déclaré

| Mesure | Valeur |
| --- | --- |
| Migrations analysées | 43 |
| Entités | 67 |
| Entités portant `organization_id` | 62 |
| Entités à RLS forcée | 60 |
| Relations typées (clés étrangères) | 146 |
| Champs énumérés (CHECK … in) | 57 |
| Invariants de niveau table (clés composites, unicités nommées, CHECK inter-colonnes, formes jsonb, déclencheurs) | 27 |
| Lacunes du parseur | 0 |

Modules : `foundation`, `canon`, `crm`, `project`, `billing`, `banking`, `reporting`, `workflow`,
`webhook`, `auth`, `agentic`, `jobs`, `passkey`, `oidc`, `translation`, `openerp`.

## 3. La chaîne documentaire transactionnelle exigée par DD3

Elle existe de bout en bout, et au-delà de ce que la spécification demandait :

```
opportunities → quote_handoffs → projects → time_entries
  → invoice_proposals → invoice_proposal_lines
  → invoices → invoice_lines → payments
  → journal_entries → journal_entry_lines   (partie double)
  → bank_transactions → reconciliation_links (rapprochement)
```

avec `accounts` (plan comptable), `tax_categories` + `tax_rate_versions` (taux de taxe versionnés),
`fx_rate_snapshots` (change figé).

### 3.1 Les invariants qui décident du sort de l'hypothèse des 90 %

**Ce qui résiste à un magasin d'objets génériques** (enveloppe + payload jsonb) :

- les énumérations de statut : `invoices.status` = `draft|issued|paid|partially_paid|void|written_off`,
  `journal_entries.status` = `draft|posted|void`, `reconciliation_links.status` =
  `proposed|confirmed|rejected`. Un schéma JSON les exprime sans perte.
- **la balance de la partie double n'est PAS une contrainte base.** Le commentaire de la migration
  0024 énonce « Every entry must balance: sum(debit.amountMinor) == sum(credit.amountMinor) » et
  « exactly one of debit/credit is non-zero per line », mais les montants sont des instantanés
  `jsonb {amountMinor, currency, scale}` : aucun CHECK, aucun déclencheur. L'invariant est applicatif.
  Conséquence contre-intuitive : la partie double n'est **pas** là où l'hypothèse meurt.

**Ce qu'un magasin générique perd** — et c'est là que l'hypothèse se joue réellement :

1. **Unicité de numérotation documentaire par locataire** : `unique (organization_id,
   invoice_number)`, `accounts unique (organization_id, code)`, `tax_categories unique
   (organization_id, code)`, `bank_accounts unique (organization_id, provider,
   provider_account_ref)`. Votre stratégie DD1 range les index d'expression par type sous une
   politique de DDL à l'exécution : la facture est donc par construction une candidate **palier 3**
   (table dédiée), pas un objet générique.
2. **Intégrité référentielle portée par le locataire** : nous ajoutons des unicités composites
   (`payments unique (organization_id, id)`, `bank_transactions unique (organization_id, id)`,
   `bank_accounts unique (organization_id, id, provider)`) précisément pour que les clés étrangères
   incluent `organization_id`. Votre DD7 retient « typed reference fields […] IDs, not DB FKs » :
   la perte n'est pas la jointure, c'est la garantie qu'une ligne ne peut pas référencer la ligne
   d'un autre locataire.
3. **Immutabilité des preuves, imposée en base** : `bank_transactions` porte deux CHECK de forme
   jsonb à jeu de clés exact (`amount`, `normalized_snapshot`, via `?&`) et un déclencheur
   `bank_transactions_immutable_evidence` (`before update or delete`) qui refuse la modification
   d'une transaction importée.
4. **Références polymorphes** : `journal_entries.source_type` ∈ `invoice|payment|manual` avec un
   `source_id uuid` **sans clé étrangère**, et `reconciliation_links.candidate_kind` +
   `candidate_id`. C'est exactement votre risque 9, « stranded references », déjà présent chez nous.

### 3.2 Ce que cela dit du périmètre d'engram

Le point 3 est le plus utile pour vous : nous avons **déjà** un besoin d'immutabilité imposée en base,
satisfait aujourd'hui par un déclencheur maison. C'est précisément ce que les profils
`immutable-chains-v1` et `immutable-boundaries-v1` d'engram offrent nativement.

D'où la frontière que je propose, et elle est l'inverse de l'intuition :

| Périmètre | Candidat engram | Motif |
| --- | --- | --- |
| Preuves bancaires importées, `audit_events`, sortie d'événements | **oui, en premier** | ajout seul, immutabilité exigée, chaînage de hachage pertinent, aucun besoin d'unicité métier |
| Plan comptable, catégories et versions de taxe | possible | quasi-immuable, versionné |
| Chaîne documentaire mutable (propositions, factures, lignes, paiements, écritures) | **non** | unicité par locataire, intégrité référentielle portée par le locataire, état mutable, agrégation |

Engram comme substrat du journal et de la preuve : oui. Engram comme gestionnaire du modèle métier
mutable : non vérifiable, et les quatre invariants ci-dessus disent pourquoi.

## 4. L'interopérabilité SAP / Odoo / OpenERP

Objectif owner : que l'ontologie favorise une interopérabilité **complète** entre les trois. Deux
constats, puis la construction qui y répond.

- **Ni SAP ni Odoo n'est un standard ouvert.** SAP est propriétaire ; Odoo Community est du code
  LGPLv3. Reprendre la structure de données de l'un ou de l'autre heurte deux règles écrites de ce
  dépôt (« Target: original MIT OpenERP implementation » ; interdiction de reprendre des *workflow
  structures* de sources de recherche) et pose une question de licence pour une sortie MIT.
- **La frontière praticable** : utiliser les **identifiants d'objets de leurs API publiques comme
  cibles de correspondance** (côté Odoo `res.partner`, `account.move`, `account.move.line`,
  `account.payment` ; côté SAP les jeux d'entités OData publiés) est de la métadonnée
  d'interopérabilité, pas une reprise de schéma. C'est la même nature qu'une correspondance vers
  n'importe quelle API tierce.

**Construction proposée : une ontologie à trois colonnes, ancrée sur les standards réels.**

| Axe | Ancrage | Rôle |
| --- | --- | --- |
| Noms de types standards | votre jeu standard DD3 (`account`/`company`, et non `organization` — collision déjà tranchée chez vous) | vocabulaire commun |
| Sémantique de document | UBL 2.x / Peppol BIS (facture), ISO 20022 (paiement et bancaire), SAF-T (export comptable d'audit), OAGIS (messages inter-ERP) | **la seule source de vérité normative** |
| Correspondances fournisseurs | identifiants d'API publiques SAP et Odoo | adaptateurs, hors du modèle |

L'interopérabilité à trois est alors complète au sens utile : chaque type standard porte sa
correspondance UBL/ISO 20022/SAF-T **et** ses cibles SAP et Odoo, sans qu'aucun des trois modèles
internes ne devienne la norme des deux autres. Un ancrage sur le modèle interne de SAP ou d'Odoo
produirait l'inverse : deux adaptateurs au lieu de trois correspondances, et une dépendance de licence.

Non instruit, à ne pas présenter comme acquis : l'applicabilité ligne à ligne d'UBL à nos tables de
facturation, et le statut de Peppol au Canada et au Québec alors que le dépôt est calibré
Canada/Québec.

## 5. Questions ouvertes pour la co-conception DD3

1. Forme attendue du descripteur rétrocédé : JSON canonique JCS avec empreinte épinglée, comme
   `MEMORY_CONTRACT_DIGEST` ? Et quels `sourceLevel` / `lineage` pour des types venant d'un
   constructeur externe ?
2. Les quatre invariants du §3.1 sont-ils recevables comme critères de palier 3, ou l'unicité par
   locataire est-elle traitée autrement dans le registre ?
3. L'ancrage normatif du §4 est-il retenu pour le gel du jeu standard, ou l'owner tranche-t-il
   autrement ?
4. Qui porte la correspondance fournisseur : un paquet d'adaptateurs chez vous, chez nous, ou une
   table de correspondance publiée dans le registre ?
