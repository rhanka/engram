# Conductor chat message shown to the owner right before the 14/11 question (2026-11-14T21:41:43.079Z)

Le tour rapide est terminé. Voici les 6 questions détaillées, consolidées à partir des versions de Fable 5.2, de Carbon et de la position d'h2a. Aucun de tes choix D1 à D34 n'est rouvert, sauf la divergence signalée au point 1. Les versions complètes sont dans `.graphify/scratch/design/memory-finalization/q6-round/` (Fable 73 Ko, Carbon 85 Ko).

**0. D'abord, ma lecture de ta règle Track**, dont les 6 points dépendent :

| Mot | Maître | Ce que ça recouvre |
|---|---|---|
| **Template** | **Track** | Les objets de son domaine : types, états permis, forme des fichiers `.track/`.<br>Exemple : ajouter l'état « bloqué » aux lots. Track le décide seul, sans livraison engram. |
| **Métamodèle** | **engram** | La grammaire commune (ce qu'est un type, une relation, une version) et le registre.<br>engram accepte ou refuse un template, il ne l'écrit jamais. |
| **Contrôle** | **application Track** | Le verdict sur ce qui entre dans le domaine Track : conformité au template, liste bornée, mandat, rejeu avant fusion. |

Conséquence proposée : écrire **en premier** un court chapitre « métamodèle et registre de lignées », en parallèle de l'accès mémoire, puisque Track change ses ontologies en ce moment.

---

**Point 1 — engram reçoit tout en premier ; `.track/` devient une copie par PR**
- **Déjà tranché :** engram est la première étape (D24, D32), et son registre l'emporte sur la copie de PR (D28). engram exporte la copie, que le contrôle Track rejoue avant fusion (D34).
- **Ce qui change :** les hooks des 8 CLI envoient chaque tour à engram, via cluster-mesh. Plus personne n'écrit `.track/` à la main : engram le génère à chaque PR, sous forme de journal plus photo d'état.
- **Impact de ta règle :** à amender. Tel qu'écrit, la forme de `.track/` serait codée dans engram, et chaque changement d'ontologie Track demanderait une livraison engram.
- **Options :**
  - **A** — forme codée dans engram. C'est le plus rapide, mais ta règle n'est pas respectée.
  - **B (recommandée)** — **engram applique la version du template publiée par Track**, et le contrôle Track rejoue la copie et bloque la fusion en cas d'écart.
  - **C** — A d'abord, puis B : le sérialiseur est écrit deux fois.
- ⚠️ **Divergence :** h2a veut garder `.track/events.jsonl` comme journal Track faisant foi, écrit par le contrôle Track. Cela rouvre D28. Fable et Carbon gardent D28, avec le registre engram comme référence et le verdict au contrôle Track.
- **Débloque :** l'accès mémoire via cluster-mesh, puis le front de session.

**Point 2 — 7e outil MCP de contexte mémoire ; fin de l'historique accumulé**
- **Ce qui change :** les hôtes h2a cessent d'envoyer l'historique de conversation au modèle. Chaque étape reçoit une requête de contexte au graphe, avec le mandat signé.
- **Impact de ta règle :** compatible. Précision à ajouter : l'outil ne fige que l'enveloppe (référence et version du template), jamais la liste des types Track.
- **Options :**
  - **A** — tout en série, après signature : la boucle arrive en dernier.
  - **B (recommandée)** — **on construit maintenant**, l'outil reste désactivé jusqu'à la double signature engram + sentropic et à la qualification, puis **chaque hôte bascule à son tour**, avec une date butoir.
  - **C** — tous les hôtes basculent le même jour : un défaut touche les 8 à la fois.

**Point 3 — « rêverie » nocturne, hebdomadaire et mensuelle**
- **Ce qui change :** un agent dormant dans engram fait remonter les faits oubliés. Les leçons rédigées par un modèle restent en mode fantôme jusqu'à un seuil mesuré.
- **Impact de ta règle :** une phrase à ajouter, et h2a est d'accord : toute proposition qui touche le domaine Track passe par le contrôle Track. L'agent dormant n'écrit jamais lui-même dans Track.
- **Options :**
  - **A** — tout en local : un audit entre dépôts partiel.
  - **B** — tout côté distant : il faut transférer les journaux locaux.
  - **C (recommandée)** — **la nuit en local** (le rappel, cœur de ta demande), et **la semaine et le mois côté distant** (l'audit entre dépôts, après la synchronisation).

**Point 4 — ontologie des rôles h2a**
- **Impact de ta règle :** à amender. Tel qu'écrit, les objets Track pourraient se lire comme une partie de l'ontologie h2a.
- **Options :**
  - **A** — une seule lignée : Track n'est pas maître.
  - **B (recommandée, et h2a est d'accord)** — **deux lignées sœurs sous le métamodèle engram** :
    - les rôles h2a ont pour seul auteur h2a ;
    - les templates Track ont pour seul auteur Track ;
    - engram peut proposer des changements de rôle, jamais les écrire.
  - **C** — B plus des variantes par dépôt, possible plus tard.

**Point 5 — contrôle partagé engram + Track**
- **Impact de ta règle :** à amender. Tel qu'écrit, personne n'a le dernier mot en cas de désaccord.
- **Options :**
  - **A** — contrôle indifférencié.
  - **B (recommandée, et h2a est d'accord)** — **pour le domaine Track, l'application Track écrit ses règles, les exécute, et son verdict fait foi.** engram vérifie la grammaire des templates et tient la liste noire de confidentialité. Sans verdict, une écriture reste « proposée », et rien n'est perdu puisque le brut est déjà dans engram.
  - **C** — les règles Track exécutées dans engram : une lecture affaiblie de ta règle.

**Point 6 — synchronisation intégrale local ↔ distant via cluster-mesh**
- **Impact de ta règle :** compatible, avec deux précisions :
  - chaque objet typé cite sa version de template, et cluster-mesh transporte les objets sans connaître les types Track ;
  - selon h2a, la synchronisation n'écrase jamais un enregistrement contrôlé par Track.
- **Options :**
  - **A (recommandée)** — **un seul mécanisme dans les deux sens, activé espace de travail par espace de travail.**
  - **B** — un aller seul d'abord : deux machines divergent.
  - **C** — tout activé le même jour.

**Contrats :** les 3 contrats seront réécrits selon ta règle. Par exemple, engram passe de « seul producteur de la sérialisation » à « producteur d'une copie conforme au template Track, acceptée par le contrôle Track ».
