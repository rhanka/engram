# Décision mémoire engram — engram relais d'un contexte court, dans toutes les CLI en option et dans la nôtre

> **Budget de lecture : 22 minutes.** Ta nouvelle direction et l'article (3 min), ce qui est déjà validé et tes remarques (2 min), l'exemple d'une étape (2 min), 6 questions (2 à 3 min chacune, 14 en tout), ce qui est proposé sans question (1 min). Les annexes sont facultatives : aucun choix ni risque n'y est caché.
> **Déjà validé le 15/11, non reposé : D1 A · D2 A · D3 A.**
> **À décider : D4 à D9. Recommandation d'ensemble : C · A · B · A · A · C.**
> **Depuis r5, la dernière version que tu as vue :** tes trois validations, tes remarques du 15/11, ta nouvelle direction du 15/11 et les deux analyses que tu as demandées. Détail en annexe 5.
> **Statut : ta règle du 15/11 s'applique** : « Les spec etc. Sinon elle doivent etre revues par fable 5.2 ou carbon tant qu astra max esf pas dispo ». Ce dossier est rédigé par Fable 5.2 réglé au maximum. Il repose sur deux analyses indépendantes de l'article, l'une de Fable 5.2 au maximum, l'autre de Gemini Carbon. Là où elles divergent, les deux positions sont montrées, avec les faits qui tranchent ; aucune moyenne n'est faite. Tes réponses fixent la direction de la réécriture des specs ; elles ne mettent rien en service.
> **Kit de réponse :** en fin de dossier, avant les annexes. Les outils de commentaire relèvent de la chaîne de rendu, pas de ce contenu.
> Rédigé à partir de tes verbatims, de l'article et des deux analyses, lus par l'auteur : les analyses en entier, l'article en entier sauf sa bibliographie. Aucun texte de spec n'est reproduit ici.

## Ta nouvelle direction (15/11)

**Ta demande (15/11) :** « https://arxiv.org/pdf/2611.05306 inspire toi de ca j aimerais vraiment qu engram devienne le relai de ce type de strategie pour remplacé mecaniquemenr + appui par llm shadow la taille du contexte) dans toutes les cli en ooption + la notre uqi reposera exclusivement sur engeam pour le contexte. Analyse fable5.2 + carbon »

**Ce que j'en comprends [JUDGMENT : corrige si c'est faux].**
1. **engram devient le relais d'une stratégie de contexte court.** Le modèle ne reçoit plus le fil qui grossit. Il reçoit l'état tenu dans le graphe et le dernier résultat, retraité. Ce remplacement est mécanique : du code, sans modèle. Il a l'appui d'un « LLM shadow » : un second modèle, plus petit, qui tient l'état à jour à côté du modèle principal.
2. **Dans toutes les CLI, en option.** Option coupée, rien ne change : l'outil garde son fil.
3. **Dans la nôtre, exclusivement.** Notre CLI n'a pas de fil : engram est sa seule source de contexte.

**À quoi ça sert.** Aujourd'hui, le fil d'une session grossit ; quand il sature, l'outil le résume seul, ou il faut une relève. Avec cette direction, le prompt de l'étape 500 a la taille de celui de l'étape 1. Une session reprise par un autre outil, ou trois jours plus tard, repart du même état. C'est ta demande du 08/11 : « chaque prompt devrai etee independant ne dependre que de la memoire et du resultat precedeent reprocessé ».

**Où on en est [FACT : code et specs lus le 15/11].**
- Aucune étape de session n'arrive à engram en direct ; h2a n'enregistre que l'arrêt d'une session.
- engram a six outils mémoire ; aucun ne rend le contexte d'une session.
- Aucun crochet n'intervient au compactage d'un outil, ni avant une requête au modèle.
- Les trois specs en cours (journal, outil mémoire, dreaming) sont écrites, non codées. Aucune ne décrit l'état ; aucune ne désigne notre CLI.

**L'article, en quelques phrases [FACT : article, lu en entier par l'auteur, sauf la bibliographie].** Prépublication du 3 novembre 2026, version 1, d'une équipe d'un fabricant de processeurs graphiques. Sa thèse : les longs contextes ne sont pas nécessaires.
- **Ce qu'il mesure.** Deux modèles fermés de premier rang, Claude Opus 4.5 et GPT 5.6 Sol, sur des tâches autonomes de banc d'essai : réparation de code, terminal, recherche en plusieurs sauts, appels d'outils. Quand le contexte est reconstruit à un seuil de 6 000 à 36 000 jetons selon le banc, au lieu de tout garder, le taux de réussite bouge de −3,7 à +5,6 points ; pour chaque modèle, au plus 5 réglages sur 22 perdent plus de 2 points. À l'extrême, une seule action par contexte, essayée sur deux bancs seulement : un modèle garde son score (70,0 → 70,2 et 47,2 → 51,8), l'autre perd 2,0 et 3,3 points ; le prompt pèse alors 7 000 à 9 000 jetons en médiane.
- **Ce qui fait que ça marche.** L'état n'est pas un résumé qui raconte. C'est une fiche pour le travail qui reste : la tâche, mot pour mot ou presque ; ce que l'agent fait et compte faire ; le plan, la condition de fin, des renvois vers les pièces utiles. Tous les messages sont gardés à part et relus par morceaux au besoin.
- **Ce qu'il ne mesure pas.** (a) Un second modèle qui écrit l'état : dans l'article, c'est toujours le modèle qui travaille qui l'écrit. Ton « LLM shadow » va au-delà de ce qui est prouvé. (b) Des sessions pilotées par une personne sur plusieurs jours : les tâches sont autonomes, avec 0 à 2 reconstructions par tâche en médiane ; l'article note lui-même qu'après un compactage, des préférences données plus tôt par l'utilisateur disparaissent. (c) Nos modèles. Sur cinq modèles ouverts plus petits, tous perdent au réglage le plus serré en réparation de code, et l'un tombe de 53,0 % à 3,6 %. (d) Les jetons, la durée et le coût du régime « une action par contexte ».
- **Réserve de coût.** Les économies annoncées, de 2,2 à 8,8 fois, reposent sur un prix *modélisé* : un fournisseur qui facturerait moins cher une fenêtre courte. L'article rappelle que les prix publics sont les mêmes quelle que soit la longueur du contexte. À ces prix publics, ses propres tableaux disent autre chose : sur les tâches longues, la facture *monte* pour l'un des deux modèles dans 21 réglages sur 22, jusqu'à +86 % ; elle baisse pour l'autre dans 15 sur 22, jusqu'à −43 % [FACT : compté par l'auteur dans les tableaux 3 à 8 ; même compte dans l'analyse Fable]. Raison donnée par l'article : chaque reconstruction renvoie des jetons au plein tarif au lieu de jetons en cache, et fait écrire davantage. La baisse est mesurée dans deux cas : un modèle que l'on héberge soi-même, 3,6 à 7 fois moins cher par jeton produit avec une fenêtre de 16 000 jetons qu'avec 256 000 ; et les longs documents lus par morceaux au lieu d'être collés en entier.
- **Conséquence [JUDGMENT, commun aux deux analyses].** Cette direction ne se présente pas comme une économie chez un fournisseur payé au jeton. Ses gains sûrs sont ailleurs : plus de relève, un prompt borné, une reprise peu coûteuse, le même état dans tous les outils.

**Schémas :** n° 1 et n° 2.

## Ce que tu as déjà validé (15/11)

**Ta consigne (15/11) :** « Reprends bien toutes les validations que j ai deja faites en cliquant la stp »

| Décision | Ton choix, tel que tu l'as exporté | Ce que ça fixe |
|---|---|---|
| D1 | **A** — Journal + diff : les trois fonctions, données en nœuds et en liens | L'outil mémoire a trois fonctions : noter, rendre le diff, chercher dans l'historique. |
| D2 | **A** — Journal en parallèle + diff injecté : l'outil garde son fil ; engram note chaque étape et n'injecte que le nouveau | Dans les outils tiers, par défaut, rien n'est retiré à l'outil. |
| D3 | **A** — Le journal d'abord, en trois temps : (1) noter dans les outils tiers ; (2) rendre le diff et chercher dans l'historique ; (3) notre CLI, où engram est le journal principal | L'ordre de construction. |

**Ce que ces choix emportent [FACT : écrit dans r5 sous l'option choisie].** D2 A retire de la décision du 14/11 la bascule obligatoire des outils tiers, avec date butoir. D3 A applique « construit maintenant, désactivé » au journal.

**Ce que ta nouvelle direction change à ces validations [JUDGMENT, commun aux deux analyses].** Rien n'est retiré.
- D1 A : les trois fonctions restent. « Rendre le diff » rend la vue entière, bornée, quand celui qui la demande n'a pas de fil.
- D2 A : reste le réglage par défaut. L'option ajoute un mode ; elle ne ramène ni obligation ni date butoir.
- D3 A : l'ordre reste. Au temps 3, engram n'est plus seulement le journal principal de notre CLI : il est sa seule source de contexte.

Si ce n'est pas ton intention, dis-le.

## Tes remarques du 15/11 sur r5 : où elles sont maintenant

**Ton commentaire (15/11, posé sur l'option D2 A) :** « ok poue cet option mais j ai demandé un hook pour prendre la main sur le compactage. » · « On pourrait quand meme a terme faire un hook pour remplacer le contexte en option » · « Les deux reposeraient sur une forme de resumé graph des faits marquants » · « faut deja prevoir de base l annotation tierce. » Le commentaire entier est en annexe 1.

| Ta remarque | Ce qu'elle devient avec ta nouvelle direction | Où on en est [FACT] | Décision |
|---|---|---|---|
| **Crochet de compactage** | Le premier cran d'un seul curseur : la fréquence à laquelle le contexte est reconstruit. | N'existe pas. Trois outils offrent un point d'accroche : Claude Code, Codex, OpenCode. | Question 4 |
| **Crochet de remplacement du contexte**, en option | Le même curseur, poussé plus haut. Tu l'écrivais « a terme » ; ta phrase du 15/11 dit « j aimerais vraiment » : il n'est plus repoussé après notre CLI [JUDGMENT]. | N'existe pas. La documentation le permet avant chaque requête dans OpenCode, après chaque tour dans Gemini CLI, par un module Python dans Hermes. | Questions 4 et 6 |
| **Résumé en graphe des faits marquants** | Il devient « l'état » : des rubriques fixes, pas un résumé libre. Un seul objet, au lieu d'un résumé de session et d'un état. | Spécifié en partie : un résumé de session sans forme ni auteur (`source-gap`), et un tri sans modèle de ce qui est marquant. Rien de codé. | Question 7 |
| **Annotation tierce**, de base, en direct et en dreaming, avec bascule llm-mesh | C'est ton « LLM shadow » [JUDGMENT]. Avec un rôle de plus : ce qu'il écrit n'annote plus seulement le journal, il entre dans ce que voit le modèle principal. | Mode par défaut dans la spec du journal ; absente de la spec du dreaming ; codée pour les documents, pas pour les sessions. | Questions 7 et 8 |

## À une étape : ce qu'engram note, ce que le shadow écrit, ce que le modèle reçoit

**Ta remarque (15/11) :** « Ton mecanisme de presentation me presente pas ce qu engram extrait en plus des faits donc c difficile de se faire une tete. »

**Exemple [illustration construite : aucune exécution réelle n'existe].** Tu écris : « Passe la limite de tentatives à 5 ». L'agent modifie `src/retry.ts` et lance les tests ; un test échoue. Voici ce qui existe juste avant l'étape suivante.

**1. Ce qu'engram note, sans modèle : le journal** [FACT : spec du journal ; rien n'est codé pour les sessions].

| Ce qui est noté | Contenu |
|---|---|
| Tour de parole | Toi : « Passe la limite de tentatives à 5 » |
| Tour de parole | L'agent : sa réponse |
| Résultat d'outil | Modification réussie ; `src/retry.ts`, chemin et empreinte |
| Résultat d'outil | Tests : échec, code de sortie 1, importance « erreur » |
| Rattachements | Ces faits → la session → la copie de travail → la branche → le dépôt |

**2. Ce que le shadow écrit, juste après, sans faire attendre l'outil.**

| Ce qui est écrit | Contenu |
|---|---|
| Décision de projet | « Limite de tentatives = 5 », prise par toi ; renvoie à ton tour de parole ; « proposée » jusqu'au contrôle de Track |
| Fait établi | « Un test échoue après le changement » ; renvoie au résultat des tests |
| Liens | La décision porte sur `src/retry.ts` ; le fait éclaire la décision |

Chaque ligne porte le nom du modèle qui l'a écrite. Jamais noté en clair [FACT] : les secrets, les chemins sensibles, les identités. Le shadow tourne que l'option soit activée ou non : il ne dépend pas de l'outil.

**3. L'état après cette étape : ce qui remplace le fil** [JUDGMENT : rubriques proposées par les deux analyses ; cinq d'entre elles reprennent la consigne de relève de l'article].

| Rubrique | Dans l'exemple | Qui l'écrit |
|---|---|---|
| Demande épinglée | « Passe la limite de tentatives à 5 », mot pour mot | Le code |
| Décisions | Limite de tentatives = 5, par toi | Le code et le shadow |
| Faits établis | Un test échoue après le changement | Le shadow |
| Changements | `src/retry.ts` modifié, pas encore vérifié | Le code |
| Vérifications | Tests lancés : 1 échec | Le code |
| Impasses | Aucune pour l'instant | Selon la question 7 |
| Plan | Lire l'échec ; corriger ; relancer les tests. Fini quand tous les tests passent | Selon la question 7 |
| Rappels du dreaming | Aucun | Le dreaming |
| Renvois | Où relire la sortie complète des tests | Le code |

**4. Ce que reçoit le modèle à l'étape suivante.**

| | Outil tiers, option coupée (par défaut, D2 A) | Outil tiers, option activée | Notre CLI |
|---|---|---|---|
| Le fil de l'outil | Tout le fil depuis le début | Seulement depuis la dernière reconstruction ; rien, si l'outil permet de reconstruire à chaque requête | Aucun : il n'y a pas de fil |
| Ta demande | Quelque part dans le fil | Épinglée en tête, mot pour mot | Épinglée en tête, mot pour mot |
| L'état | Seulement ce qui est nouveau pour cette session | L'état entier, à chaque reconstruction | L'état entier, à chaque étape ou à chaque palier (question 6) |
| Le dernier résultat | La sortie brute, telle que l'outil la garde | Retraité, là où l'outil le permet | Retraité : l'essentiel, plus l'endroit où relire le reste |
| Taille du prompt | Grandit jusqu'au compactage | Bornée, au cran que l'outil permet (question 4) | Bornée : même plafond à l'étape 500 qu'à l'étape 1 |

Dans notre CLI, le prompt entier tient en quatre blocs :

```
1. Le mandat du rôle + ta demande, mot pour mot : « Passe la limite de tentatives à 5 »
2. L'état : décisions · faits établis · changements · vérifications · impasses · plan · rappels · renvois
3. Le dernier résultat, retraité : « Tests : 1 échec — retry.test.ts : attendu 3, reçu 5 » + où relire la sortie complète
4. Ce qui déclenche l'étape
```

Un détail ancien n'est pas dans le prompt : le modèle le cherche dans l'historique, troisième fonction de D1.

**Schémas :** n° 3, n° 4 et n° 5.

## Question 4 — Dans les outils tiers, jusqu'où va l'option ?

**Ta demande (15/11) :** « dans toutes les cli en ooption » · « j ai demandé un hook pour prendre la main sur le compactage. » · « un hook pour remplacer le contexte en option »
**Ce que ça change pour toi :** option activée, la session d'un outil tiers cesse de traîner tout son fil. Le prix : chaque outil plafonne ce qu'engram peut faire. Au-delà, la seule voie est de relancer la session, ce qui change ce que tu vois à l'écran.

**Un seul curseur [JUDGMENT, commun aux deux analyses].** Le crochet de compactage et le crochet de remplacement ne sont pas deux mécanismes. C'est un curseur : la fréquence à laquelle le contexte est reconstruit. Ses crans : au compactage de l'outil → à un seuil plus tôt → à chaque tour → à chaque requête.

**Faits [FACT : documentation des outils, lue le 15/11 par les deux analyses ; aucun crochet n'a été exécuté : `unverified` en fonctionnement].**

| Outil | Ce que ses crochets permettent | Plafond sans relance | Relance par h2a, à construire |
|---|---|---|---|
| Claude Code | Dicter le résumé du compactage, le bloquer, le lire, réinjecter ; retraiter une sortie d'outil ; rien avant chaque requête | Compactage ; seuil réglable à partir de 100 000 jetons seulement | Possible |
| Codex | Arrêter avant le compactage ; consigne de résumé et seuil réglables par configuration ; avant chaque requête, diagnostic seulement | Seuil court par configuration, `unverified` | Possible |
| OpenCode | Remplacer la consigne de compactage ; modifier les messages avant chaque requête ; interface marquée « experimental » | Chaque requête | Non : pas de profil de lancement |
| Gemini CLI | Vider le contexte après chaque tour ; compactage : prévenu, sans pouvoir | Chaque tour ; les analyses divergent | Non : pas de profil de lancement |
| Antigravity CLI | Injecter avant chaque appel du modèle ; aucun événement de compactage | Injection | Possible |
| Hermes | Moteur de contexte remplaçable : il rend la nouvelle liste de messages ; en Python | Chaque requête, par un module Python | Non : pas de profil de lancement |
| Mistral Vibe | Retraiter une sortie d'outil ; ni compactage, ni requête | Injection | Avec écran seulement |
| Muse | `unverified` | `unverified` | Avec écran seulement |

- [FACT : h2a, lu par l'analyse Fable ; règle de lancement lue par l'auteur] h2a sait déjà lancer une session sur un prompt de départ. Relancer une session neuve sur la vue d'engram est donc possible pour les sessions que h2a lance ; le déclencheur et la vue de départ restent à construire. Ce n'est pas une relève : personne n'écrit de résumé à la main.
- [JUDGMENT, commun aux deux analyses] Écartée : une passerelle qui réécrirait les requêtes entre l'outil et le modèle. Elle fausse le compte que l'outil tient de son contexte, casse le cache et les connexions par abonnement.

**Là où les deux analyses divergent.**

| Point | Analyse Carbon | Analyse Fable | Ce qui tranche |
|---|---|---|---|
| Gemini CLI | Remplacement possible | Injection seulement ; produit remplacé par Antigravity CLI | La documentation de ta version installée décrit la remise à zéro du contexte après chaque tour [FACT : lue par l'auteur]. Reste à savoir si tu gardes cet outil. |
| Hermes | Dans la première vague | Bloqué par ta règle « zéro Python » | Ta règle. Par défaut elle s'applique : Hermes reste à l'injection. Une exception t'appartient. |
| Déploiement | Les trois voies d'un coup, après une seule porte de mesure | Cran par cran, chaque cran ouvert par la mesure | L'option se coupe session par session : un cran raté se reprend sans dégât. Suite à la question 9. |

| Option | Choix | Conséquence pour toi | Coût / retour arrière |
|---|---|---|---|
| A | **Jusqu'au compactage** : quand le fil sature, engram dicte la relève à l'outil, la capte et réinjecte ce qui manque | Ta demande de crochet de compactage est tenue. Inconvénient : entre deux compactages le fil reste long, 100 000 jetons au moins dans Claude Code ; ce n'est pas un contexte court. | Le moins cher. Retour arrière : retirer les crochets. |
| B | **Jusqu'au plafond de chaque outil** : A, plus tout ce que ses crochets permettent — sorties d'outil retraitées avant d'entrer dans le fil, seuil plus tôt, reconstruction à chaque requête. Aucune relance. | Contexte court là où l'outil le permet, sans rien changer à l'écran. Inconvénient : inégal ; Claude Code, Antigravity CLI et Vibe restent longs. | Un adaptateur par outil, à entretenir. Retour arrière : couper l'option. |
| C | **Contexte court partout, avec relance** : B, plus, là où les crochets plafonnent, h2a ferme la session au seuil et en ouvre une neuve sur la vue d'engram | « dans toutes les cli » tenu pour les sessions que h2a lance. Inconvénient : à chaque relance, l'écran repart d'une session neuve ; rien pour une session que tu ouvres à la main. | Le plus cher : les adaptateurs, plus la relance à construire dans h2a. Retour arrière : couper l'option. |

**Recommandation [JUDGMENT] : C, construit dans l'ordre A, puis B, puis C.** Tes mots sont « dans toutes les cli » ; A seul n'est pas un contexte court ; les deux analyses retiennent la relance. Chaque cran s'ouvre outil par outil, quand la preuve de la question 9 est faite. « Prendre la main » au sens plein — bloquer le compactage de l'outil et repartir sur l'état d'engram — n'arrive qu'après cette preuve : l'article n'a mesuré que la relève écrite par le modèle qui travaille.
**Objection la plus forte :** un coût d'entretien par outil, pour de bon. En un an, un outil a été remplacé et un autre a changé son interface de plugin [FACT : analyse Fable].
**Ce qui la renverserait :** tu travailles surtout dans des sessions ouvertes à la main : B suffit.
**Scénario d'échec :** une mise à jour d'outil change un crochet ; l'option cesse sans bruit. Parade : un contrôle des crochets au démarrage, un retour automatique au réglage par défaut, un bandeau.
**Commodité du présentateur :** A est le plus simple pour les agents.
**Dépendances :** l'état (question 7), la preuve (question 9). **Schéma :** n° 6.
**Réponse attendue :** A, B ou C.

## Question 5 — Notre CLI : quel programme ?

**Ta demande (15/11) :** « la notre uqi reposera exclusivement sur engeam pour le contexte » · « Dans notre outil cli a nous ce deviendra le loggeur principal. »
**Ce que ça change pour toi :** c'est le seul endroit où ta demande du 08/11 tient en entier : aucun fil, aucun vieux contexte. Tant que ce programme n'est pas désigné, le temps 3 de D3 n'a pas d'objet.

**Faits.**
- [FACT : les trois specs, lues par les deux analyses] Aucune ne désigne ce programme.
- [FACT : dépôt sentropic, lu par l'auteur] Une commande parapluie, `stp`, existe ; elle ne livre aujourd'hui que `stp app`. Une bibliothèque de boucle de conversation, chat-core, a été extraite pour qu'un futur programme en ligne de commande s'y branche.
- [FACT : code h2a, lu par l'analyse Carbon] h2a lance des sessions et les coordonne. Ce n'est pas une boucle d'agent.
- [FACT : documentation ; `unverified` en fonctionnement] OpenCode laisse un plugin modifier les messages avant chaque requête ; h2a n'a pas encore fait l'essai réel de ce plugin.

**Les deux analyses convergent sur la cible :** un programme à nous, en TypeScript, qui fabrique lui-même chaque requête, appelle les modèles par llm-mesh, est lancé par h2a comme les autres et ne garde aucun fil.
**Elles divergent sur le chemin.** Fable : OpenCode, avec un plugin engram, comme premier véhicule pendant que notre boucle se construit. Carbon : construire tout de suite sur les briques existantes ; pas de dérivé d'un outil tiers à entretenir. **Ce qui tranche :** si tu choisis B ou C à la question 4, ce plugin existe de toute façon. Il sert de banc d'essai sans devenir « la nôtre ».

| Option | Choix | Conséquence pour toi | Coût / retour arrière |
|---|---|---|---|
| A | **Notre propre boucle** : un programme à nous, sur les briques existantes — la commande `stp`, chat-core, llm-mesh — lancé par h2a | Maîtrise entière du prompt, du cache et de l'écran. Inconvénient : un programme à spécifier et à construire, avec son écran et ses outils de fichiers et de commandes. | Le plus long. Retour arrière : tant qu'il n'est pas seul, les outils tiers restent. |
| B | **OpenCode d'abord** : OpenCode, avec un plugin engram, tient lieu de « notre CLI » ; notre boucle vient plus tard | Des résultats tôt, sur un outil existant. Inconvénient : repose sur une interface tierce marquée « experimental » ; ce n'est pas « la nôtre ». | Court. Retour arrière : retirer le plugin. |
| C | **La boucle dans h2a** : h2a héberge la boucle d'agent | Au plus près de l'orchestration. Inconvénient : mêle la coordination entre agents et l'exécution d'un agent [JUDGMENT : analyse Carbon]. | Moyen. Retour arrière : la sortir de h2a. |
| D | **Plus tard** : le temps 3 reste abstrait | Aucun engagement. Inconvénient : le temps 3 et la moitié de la preuve restent sans objet. | Rien à défaire. |

**Recommandation [JUDGMENT] : A.** C'est la cible des deux analyses, et la seule où « exclusivement » ne dépend de personne.
**Objection la plus forte :** le délai, et un programme de plus à entretenir.
**Ce qui la renverserait :** le plugin OpenCode te donne tout ce que tu attends : B.
**Scénario d'échec :** notre boucle tarde ; le temps 3 glisse. Parade : le cran « relance » de la question 4 donne déjà un contexte court aux agents que h2a lance.
**Commodité du présentateur :** D repousse du travail pour les agents.
**Dans les quatre options :** si engram tombe, notre CLI passe en mode réduit d'engram, jamais sur un second fil. Détail dans « Ce qui est proposé sans question ».
**Schéma :** n° 7.
**Réponse attendue :** A, B, C ou D.

## Question 6 — À quel rythme le contexte est-il reconstruit ?

**Ta demande (08/11) :** « La memoire graphe devrait remplacer le conexte en une forme de resumé a chaque etape » · « chaque prompt devrai etee independant ne dependre que de la memoire et du resultat precedeent reprocessé »
**Ce que ça change pour toi :** le rythme règle trois choses que tu portes : la facture chez un fournisseur payé au jeton, l'attente entre deux étapes, et la fidélité à ta phrase du 08/11. Il vaut pour notre CLI, et pour les outils tiers qui atteignent le haut du curseur.

**Faits [FACT : article, tableaux 2, 3 et 5, lus par l'auteur].** Taux de réussite, en %.

| Modèle et banc | Fil complet | Par seuil, meilleur des quatre réglages | Par seuil, réglage le plus serré | Une action par contexte |
|---|---|---|---|---|
| Opus 4.5, réparation de code, 500 tâches | 70,0 | 74,8 | 68,8 | 70,2 |
| Opus 4.5, terminal, 89 tâches | 47,2 | 52,8 | 48,3 | 51,8 |
| GPT 5.6 Sol, réparation de code | 84,4 | 88,8 | 84,6 | 82,4 |
| GPT 5.6 Sol, terminal | 87,6 | 88,8 | 85,4 | 84,3 |

- Aucune marge d'erreur n'est publiée ; sur 89 tâches, une tâche vaut 1,1 point.
- Pour « une action par contexte », l'article ne publie ni jetons, ni durée, ni coût. Ce régime y coûte deux appels du modèle principal par action.
- [FACT : analyse Fable, documentation] Le cache d'un fournisseur ne sert que si le début du prompt ne change pas.
- [JUDGMENT, commun aux deux analyses] Les deux rythmes sont deux réglages du même assembleur.

**Les deux analyses divergent.** Carbon : paliers courts par défaut ; dans le tableau 2, le meilleur réglage par seuil bat « une action par contexte » dans les quatre cases ; le cache survit entre deux reconstructions ; le shadow travaille en parallèle. Fable : « une action par contexte » colle à notre CLI et à tes mots ; un ou deux appels par étape, à régler par la mesure. **Ce qui tranche :** (1) « meilleur des quatre » est choisi après coup ; face au réglage le plus serré, le résultat est partagé ; (2) le coût d'« une action par contexte » n'est mesuré nulle part ; (3) tes mots du 08/11 décrivent chaque étape ; (4) la mesure de la question 9 compare les deux sur tes sessions.

| Option | Choix | Conséquence pour toi | Coût / retour arrière |
|---|---|---|---|
| A | **Une action, un prompt neuf** : chaque prompt contient ta demande épinglée, l'état à jour et le dernier résultat | Ta phrase du 08/11, à la lettre ; le prompt le plus petit. Inconvénient : l'état est renvoyé au plein tarif à chaque étape ; régime le moins éprouvé, avec 2,0 et 3,3 points perdus pour un des deux modèles de l'article. | Un réglage. Retour arrière : le changer. |
| B | **Paliers courts** : entre deux reconstructions — 18 000 jetons environ, quelques étapes — les derniers résultats s'ajoutent derrière un état stable ; puis l'état est refait et la traîne vidée | Régime le plus éprouvé de l'article ; cache gardé entre deux reconstructions ; le shadow a le temps de suivre. Inconvénient : écart avec ta phrase : le prompt porte quelques résultats, pas un seul. | Un réglage. Retour arrière : le changer. |
| C | **Selon le mode de paiement** : paliers courts chez un fournisseur payé au jeton ; une action par prompt sur un modèle hébergé par nous ou en local | Le meilleur coût dans les deux cas. Inconvénient : deux réglages à éprouver. | Deux réglages. Retour arrière : les changer. |

**Recommandation [JUDGMENT] : B au départ.** A devient le réglage d'un modèle dès que la mesure n'y montre aucune perte. Le haut du curseur se gagne par la preuve, comme à la question 4.
**Objection la plus forte :** tes mots du 08/11 disent « a chaque etape » ; B s'en écarte.
**Ce qui la renverserait :** la mesure sur tes sessions montre qu'A ne perd rien : A. Un usage surtout local : C.
**Scénario d'échec :** avec B, un résultat utile sort de la traîne sans être dans l'état ; l'agent le relit dans l'historique. Avec A, l'état a une étape de retard ; l'agent refait une action.
**Commodité du présentateur :** aucune ; le même assembleur sert les trois options.
**Dans les trois options :** notre CLI ne garde aucun fil ; la traîne de résultats vient d'engram.
**Schéma :** n° 8.
**Réponse attendue :** A, B ou C.

## Question 7 — L'état : qui l'écrit ?

**Ta demande (15/11) :** « remplacé mecaniquemenr + appui par llm shadow » · « soit parce qu on demande a chaque etape au llm primcipal de les fournir. Soit parce qu on le fait faire par un llm tiers en permanence » · « faut deja prevoir de base l annotation tierce. »
**Ce que ça change pour toi :** l'état remplace le fil. S'il est faux, ou s'il oublie ta consigne, l'agent agit de travers sans le savoir ; de l'extérieur, on croit que « le modèle a baissé ».

**Faits.**
- [FACT : article] Les meilleures fiches contiennent la tâche mot pour mot, ce que l'agent fait et compte faire, le plan et la condition de fin. Seul le modèle qui travaille écrit cette fiche ; aucun essai n'utilise un second modèle.
- [FACT : article] Un résumé qui raconte l'historique fait moins bien : il pèse tout pareil et gonfle ce qui a été répété. Les deux analyses écartent le résumé libre.
- [FACT : specs, lues par l'analyse Fable] Rien n'épingle ta demande en cours : elle n'atteint les étapes suivantes que par des notes classées. Aucune rubrique n'accueille le plan.
- [FACT : documentation] Claude Code, Codex et OpenCode laissent dicter la forme de la relève au moment du compactage.

**Commun aux trois options [JUDGMENT, commun aux deux analyses].** L'état a des rubriques fixes, celles de l'exemple. Le code épingle mot pour mot, dans chaque prompt, le mandat du rôle, ta demande en cours et tes correctifs depuis. Chaque élément nomme son auteur et renvoie au fait brut. Un désaccord entre auteurs est signalé, jamais tranché en silence. Si tu veux épingler plus ou moins, dis-le avec ta réponse.

**Les deux analyses divergent.** Carbon : le shadow tient tout l'état, plan compris ; le modèle principal n'a aucune obligation, il peut signaler une impasse ou une hypothèse. Raison : le modèle principal ne s'arrête jamais pour écrire, et l'état change par petites touches. Fable : le shadow écrit le passé, qui se vérifie contre les faits bruts ; le modèle principal écrit son plan, car lui seul connaît ses intentions. **Ce qui tranche :** (1) l'article n'a testé que le modèle principal comme auteur ; (2) ton shadow est un petit modèle, et l'article montre que les petits modèles décrochent ; (3) la mesure de la question 9, qui compare l'état avec et sans le plan du modèle principal.

| Option | Choix | Conséquence pour toi | Coût / retour arrière |
|---|---|---|---|
| A | **Trois auteurs** : le code copie ; le shadow écrit le passé ; le modèle principal écrit son plan — à chaque relève dans les outils tiers, à chaque étape dans notre CLI | Le plus proche de ce que l'article a prouvé ; le shadow reste dans ce qui se vérifie. Inconvénient : quelques jetons du modèle principal à chaque fois ; deux sources à rapprocher. | Une consigne et une rubrique. Retour arrière : couper la consigne. |
| B | **Deux auteurs** : le code copie ; le shadow écrit tout le reste, plan compris ; le modèle principal peut signaler, sans obligation | Le modèle principal ne s'arrête jamais pour écrire ; le moins cher. Inconvénient : hors de ce que l'article a prouvé ; un petit modèle devine le plan d'un grand. | Le moins cher. Retour arrière : ajouter la consigne. |
| C | **Le modèle principal seul**, comme dans l'article : à chaque reconstruction il écrit sa fiche dans la forme imposée ; le shadow n'annote que le journal et le dreaming | Exactement ce qui a été mesuré. Inconvénient : contre ta base, « de base l annotation tierce » ; le plus cher en jetons ; le modèle principal s'arrête pour écrire. | Le plus cher. Retour arrière : rebrancher le shadow. |

**Recommandation [JUDGMENT] : A.** Elle garde ta base, le shadow, et y ajoute le seul auteur que l'article a éprouvé, pour la seule partie qu'un autre ne peut pas connaître.
**Objection la plus forte :** celle de Carbon : chaque contribution du modèle principal coûte des jetons chers et, dans un outil tiers, une pause à chaque relève.
**Ce qui la renverserait :** la mesure montre que l'état sans le plan du modèle principal fait aussi bien : B.
**Scénario d'échec :** le shadow invente un fait. Parade : chaque élément renvoie au fait brut ; le code d'extraction existant retire déjà les éléments non conformes ; ta demande n'est jamais entre ses mains.
**Commodité du présentateur :** B est le plus simple pour les agents.
**Schéma :** n° 4.
**Réponse attendue :** A, B ou C.

## Question 8 — Quels modèles servent de shadow, et comment se fait la bascule ?

**Ta demande (15/11) :** « (genre modele ember low ou luna 6 low ou haiku 5.5 low ou gemini 3.8 flash low ou un autre low dans mistral) » · « Celle ci sera aussi bien pour le mode dreaming que direct. Avec bascule auto llm mesh de model d annotation. »
**Ce que ça change pour toi :** le shadow lit chaque étape de tes sessions : chaque fournisseur de la liste lit le texte. Nouveau : ce qu'il écrit entre dans le prompt du modèle principal. Un modèle plus faible qui prend le relais sans bruit change donc ce que voit l'agent. Ton autorisation de contenu reste un acte séparé, à la mise en service ; sans elle, le shadow ne reçoit que des références.

**Faits [FACT : llm-mesh, version 0.38.0, lue par l'auteur dans une copie de travail ; la copie locale principale est en 0.17.0 ; engram dépend de la `^0.19.0`].**
- Une liste ordonnée de candidats existe. Un candidat en panne est écarté 5 minutes ; 3 essais par défaut.
- La substitution automatique entre modèles est fermée : les 38 modèles distants du catalogue sont exclus de toute équivalence. Motif écrit : « No pinned benchmark evidence authorizes automatic substitution. »
- Tes exemples dans ce catalogue : présents, Ember (`muse-ember-1.0`), Luna 6 (`gpt-6-luna`), Gemini 3.8 Flash, Mistral Small ; absent, Haiku. Niveau « low » : `unverified`.
- [FACT : code engram, lu pour r6] Le pont d'engram vers llm-mesh passe au candidat suivant après une panne ou une réponse invalide ; il ne transmet encore aucune liste.
- [JUDGMENT des deux analyses, sur des volumes supposés] Coût du shadow : de l'ordre d'un dixième de centime de dollar par étape, soit 0,2 à 1,6 dollar pour 500 étapes. Volumes réels : `unknown`.

Les deux analyses convergent ici : une liste que tu fixes, des modèles éprouvés avant de nourrir un contexte, et, si tous tombent, un état tenu sans modèle.

| Option | Choix | Conséquence pour toi | Coût / retour arrière |
|---|---|---|---|
| A | **Ta liste ordonnée, avec qualification** : tes modèles « low », essayés dans l'ordre ; bascule au suivant en cas de panne ; un modèle ne nourrit un contexte qu'après la preuve de la question 9 ; si tous tombent, l'état continue sans modèle, jamais avec le modèle principal en remplaçant | Bascule automatique dès le départ ; tu choisis qui lit tes sessions ; aucun modèle non éprouvé dans le contexte. Inconvénient : liste tenue à la main ; plusieurs fournisseurs lisent. | Petit ajout au pont d'engram, et passage à llm-mesh 0.38. Retour arrière : réduire la liste. |
| B | **Même fournisseur que l'outil d'abord** : le shadow d'une session est d'abord un petit modèle du fournisseur de son modèle principal ; ta liste en secours | Aucun lecteur de plus tant que le premier choix répond. Inconvénient : il faut un petit modèle éprouvé chez chaque fournisseur ; Haiku est absent du catalogue. | Une table par fournisseur. Retour arrière : revenir à la liste. |
| C | **Groupe d'équivalents mesurés** : llm-mesh choisit seul parmi les modèles prouvés équivalents | Aucune liste à tenir. Inconvénient : fermé aujourd'hui ; pas de bascule tant que la mesure n'existe pas. | Un banc d'essai. Retour arrière : vider le groupe. |
| D | **Shadow local seulement** : un modèle sur ta machine | Aucun lecteur extérieur ; aucun coût au jeton. Inconvénient : le seul modèle local du catalogue est petit et sans sortie structurée ; un plus gros demande une carte graphique dédiée. | Du matériel. Retour arrière : rouvrir la liste. |

**Recommandation [JUDGMENT] : A.** C'est ta phrase — des modèles « low », une bascule automatique — avec le garde-fou que les deux analyses ajoutent.
**Objection la plus forte :** la liste multiplie les fournisseurs qui lisent tes sessions. B y répond et peut s'ajouter à A.
**Ce qui la renverserait :** un banc d'essai rempli : C.
**Scénario d'échec :** un modèle moins bon prend le relais sans que tu le voies. Parade : chaque élément porte le nom du modèle qui l'a écrit ; la vue dit jusqu'à quelle étape le shadow est à jour.
**Commodité du présentateur :** A sans qualification serait plus simple pour les agents.
**Dans les quatre options :** le même service sert le direct et le dreaming. C'est « new » : la spec du dreaming n'a ni modèle d'annotation ni bascule [FACT]. Pour ses leçons, la règle décidée reste : un modèle rédige, un second, d'une autre famille, vérifie.
**Entrée attendue si tu choisis A :** la liste et son ordre. **Schémas :** n° 9 et n° 10.
**Réponse attendue :** A, B, C ou D.

## Question 9 — Que faut-il prouver avant qu'engram remplace un contexte ?

**Ta demande (15/11) :** « j aimerais vraiment qu engram devienne le relai de ce type de strategie » · « Analyse fable5.2 + carbon »
**Écart :** tu n'as pas demandé de mesure. Les deux analyses la demandent : ce que l'article a prouvé l'a été sur d'autres modèles, d'autres tâches et un autre auteur de l'état.
**Ce que ça change pour toi :** sans preuve, un agent peut agir sur un état faux sans que personne le voie. Avec preuve, l'option attend, et la preuve a un coût.

**Faits.**
- [FACT] Le journal, temps 1 de D3, enregistre tes sessions. La matière d'essai existe dès ce temps-là ; la mesure peut commencer avant tout crochet qui remplace un contexte.
- [JUDGMENT, commun aux deux analyses] Trois contrôles mécaniques, sans tolérance : ta demande en cours et chacune de tes décisions notées sont dans la vue ; aucun prompt ne dépasse le plafond ; chaque élément écrit par un modèle renvoie à un fait brut qui existe.
- [FACT : llm-mesh] llm-mesh exige une preuve de mesure avant toute substitution automatique de modèle. La même mesure la produit.

**Les deux analyses divergent.** Fable : rejouer tes sessions enregistrées. On coupe une session à plusieurs endroits, on construit la vue, puis on demande à un modèle qui ne voit qu'elle sa prochaine action et des réponses tirées du journal : ce qui a été décidé, modifié, raté, ce qui reste. Porte légère pour chaque cran d'un outil tiers ; preuve complète avant que notre CLI repose sur engram seul. Carbon : 120 tâches réelles de tes dépôts, dont des changements de consigne en cours de tâche et des reprises, plus 150 tâches publiques ; la même porte avant toute activation. **Ce qui tranche :** (1) dans un outil tiers, l'option se coupe et le fil existe encore ; notre CLI n'a pas de repli ; (2) le rejeu ne demande que le journal ; un jeu de tâches réelles avec verdict automatique reste à construire, coût `unknown` ; (3) le rejeu teste la mémoire de l'état, pas la réussite de bout en bout.
**Seuils chiffrés :** les analyses en proposent de différents (annexe 8), dont un sur la facture : « au plus égale » pour Carbon, jusqu'à +25 % pour Fable. Ils se fixent, par toi, quand les premières mesures existent.

| Option | Choix | Conséquence pour toi | Coût / retour arrière |
|---|---|---|---|
| A | **Sans porte formelle** : tu juges sur un pilote | Le plus rapide. Inconvénient : une perte silencieuse ne se voit pas à l'œil. | Rien à construire. Rien à défaire. |
| B | **Rejeu partout** : le rejeu de tes sessions et les trois contrôles, avant chaque cran, notre CLI compris | Peu coûteux, sur ton propre travail. Inconvénient : notre CLI partirait sans essai sur des tâches réelles. | Un banc de rejeu. Retour arrière : cesser de l'exiger. |
| C | **Rejeu pour l'option, preuve complète pour notre CLI** : B pour chaque cran d'un outil tiers ; en plus, des tâches réelles avec verdict automatique et un pilote, avant que notre CLI repose sur engram seul | Proportionné : léger là où l'outil garde son fil, lourd là où il n'y a pas de repli. Inconvénient : notre CLI attend la preuve complète. | Le banc de rejeu, plus un jeu de tâches réelles. Retour arrière : alléger la porte. |
| D | **Preuve complète partout** : tâches réelles et seuils avant toute activation, option des outils tiers comprise | Le plus sûr. Inconvénient : l'option attend le jeu de tâches ; un seuil « facture au plus égale » peut la bloquer chez un fournisseur payé au jeton. | Le plus cher et le plus long. Retour arrière : alléger la porte. |

**Recommandation [JUDGMENT] : C.** La porte suit le risque : une option réversible d'un côté, un programme sans repli de l'autre.
**Objection la plus forte :** celle de Carbon : des questions tirées du journal ressemblent à la vue et peuvent la flatter ; seules des tâches réelles montrent une perte de réussite.
**Ce qui la renverserait :** pendant le pilote de notre CLI, le rejeu ne prédit pas le résultat des tâches réelles : D.
**Scénario d'échec :** la mesure passe à tort sur un petit échantillon. Parade : le pilote réel avant d'élargir ; arrêt si la réussite baisse.
**Commodité du présentateur :** A et B demandent le moins de travail aux agents.
**Dépendance :** le journal, temps 1 de D3. **Schéma :** n° 11.
**Réponse attendue :** A, B, C ou D.

## Ce qui est proposé sans question

Cinq points réglés par un choix par défaut, parce qu'ils sont réversibles ou qu'une de tes règles les tranche déjà. Chacun se change d'un mot [JUDGMENT].

| Point | Ce qui est proposé | Pourquoi sans question | Pour t'y opposer |
|---|---|---|---|
| Taille de la vue | Départ entre 16 000 et 20 000 jetons pour le prompt entier ; ensuite un plafond par modèle, fixé par la mesure. | Les deux analyses convergent. La valeur par défaut de la spec actuelle, 2 000 jetons, est sous tout ce que l'article a essayé [FACT]. C'est un réglage. | Donne ton plafond. |
| Résumé de session | Fusionné avec l'état : un seul objet. | Deux objets feraient des résumés de résumés ; l'article dit que la perte s'aggrave alors [FACT]. | Dis-le. |
| Fin d'une demande épinglée | Une demande quitte l'épingle quand tu le dis, ou quand son travail est accepté dans Track ; jamais sur l'avis d'un modèle. Elle reste alors dans l'état comme décision, et mot pour mot dans le journal. | Proposition de l'auteur, absente des deux analyses. Sans elle, l'épingle grossit sans fin ou se vide à tort. | Dis-le. |
| Hermes | Pas de module Python : Hermes reste à l'injection. | Ta règle permanente « zéro Python ». | Accorde une exception. |
| Panne d'engram dans notre CLI | Mode réduit d'engram, jamais un second fil. Shadow en panne : état tenu sans modèle, et bandeau. Magasin local en panne : l'agent ne modifie plus rien, garde de quoi rejouer, puis s'arrête. | Ton mot « exclusivement » exclut un second système de contexte. Sur le magasin en panne, Fable laisse l'agent avancer quelques étapes ; Carbon lui interdit toute écriture. Proposé : la règle de Carbon, la plus sûre pour la trace. | Dis-le. |

## Comment on saura que c'est ce que tu as demandé

| Tes mots | Vérification |
|---|---|
| « engram devienne le relai de ce type de strategie » | Dans notre CLI, chaque prompt est fait de ta demande, de l'état et du dernier résultat. Rien d'autre. |
| « remplacé mecaniquemenr » | Shadow coupé, le prompt se construit encore, sans aucun appel de modèle entre deux étapes. |
| « appui par llm shadow » | Chaque élément écrit par le shadow porte le nom de son modèle et renvoie au fait brut. S'il a du retard, la vue dit jusqu'à quelle étape il est à jour. |
| « la taille du contexte » | Le prompt de l'étape 500 a le même plafond que celui de l'étape 1. |
| « dans toutes les cli en ooption » | Sur chaque outil, l'option s'active et se coupe session par session. Coupée, rien ne change. Le tableau de la question 4 dit jusqu'où elle va, outil par outil. |
| « la notre uqi reposera exclusivement sur engeam pour le contexte » | Notre CLI ne garde aucun fil. engram arrêté, il passe en mode réduit signalé, jamais sur un second fil. |
| « Il ne doit jamais y avkir de relve » | Une session neuve, même rôle et même espace, reprend sans résumé écrit à la main. |
| « L envoi au llm ne devrait pas envoyer de vieux contexte » | Dans notre CLI, rien de plus ancien que la dernière reconstruction n'est dans le prompt. Avec l'option A de la question 6 : rien de plus ancien que le dernier résultat. |
| « on garde l historique de texte en query via le graph memoire » | Un passage d'une session close se retrouve par la recherche. |
| « un hook pour prendre la main sur le compactage » | Après un compactage, ta demande en cours et toutes tes décisions notées sont encore dans le fil de l'outil : contrôle mécanique. |
| « un hook pour remplacer le contexte en option » | Option activée sur un outil qui le permet : même plafond à l'étape 500 qu'à l'étape 1. Option coupée : rien ne change. |
| « resumé graph des faits marquants » | Pour une session, tu peux lire l'état, rubrique par rubrique, et voir de quel fait brut vient chaque élément. |
| « de base l annotation tierce » | Dès le temps 1, chaque étape notée reçoit son annotation, avec le nom du modèle qui l'a produite. |
| « aussi bien pour le mode dreaming que direct » | Le même service annote une étape en direct et un lot en dreaming. |
| « bascule auto llm mesh » | Le premier modèle de la liste coupé, le shadow continue avec le suivant, sans intervention. |
| « ce qu engram extrait en plus des faits » | La section « À une étape ». À toi d'en juger. |
| « seul le diff est transmis » | Option coupée, à une étape où rien n'a changé pour la session, engram ne renvoie rien de plus que le résultat de l'étape. |
| « copier mes decision en kit a la fin » | Le kit ci-dessous. |
| « Si je comprends pas c est une merde » | Tu peux redire le curseur, l'état et ses auteurs sans ouvrir une spec. |

## Kit de réponse — à copier à la fin

**Déjà validé le 15/11, repris tel quel de ton export :**

```
responseLine: "D1 A · D2 A · D3 A"
D1 A — Journal + diff : les trois fonctions, données en nœuds et en liens
D2 A — Journal en parallèle + diff injecté : l'outil garde son fil ; engram note chaque étape et n'injecte que le nouveau
D3 A — Le journal d'abord, en trois temps : (1) noter dans les outils tiers ; (2) rendre le diff et chercher dans l'historique ; (3) notre CLI, où engram est le journal principal
```

**À choisir dans cette révision, une ligne par décision :**

```
D4 A — Jusqu'au compactage : quand le fil sature, engram dicte la relève à l'outil, la capte et réinjecte ce qui manque
D4 B — Jusqu'au plafond de chaque outil : A, plus tout ce que ses crochets permettent ; aucune relance
D4 C — Contexte court partout, avec relance : B, plus une session neuve ouverte par h2a sur la vue d'engram là où les crochets plafonnent

D5 A — Notre propre boucle : un programme à nous, sur les briques existantes, lancé par h2a
D5 B — OpenCode d'abord : OpenCode, avec un plugin engram, tient lieu de « notre CLI » ; notre boucle vient plus tard
D5 C — La boucle dans h2a : h2a héberge la boucle d'agent
D5 D — Plus tard : le temps 3 reste abstrait

D6 A — Une action, un prompt neuf : ta demande épinglée, l'état à jour, le dernier résultat
D6 B — Paliers courts : les derniers résultats s'ajoutent derrière un état stable, refait tous les 18 000 jetons environ
D6 C — Selon le mode de paiement : paliers courts chez un fournisseur payé au jeton ; une action par prompt sur un modèle hébergé par nous ou en local

D7 A — Trois auteurs : le code copie ; le shadow écrit le passé ; le modèle principal écrit son plan
D7 B — Deux auteurs : le code copie ; le shadow écrit tout le reste, plan compris ; le modèle principal peut signaler, sans obligation
D7 C — Le modèle principal seul, comme dans l'article ; le shadow n'annote que le journal et le dreaming

D8 A — Ta liste ordonnée, avec qualification : bascule au suivant en cas de panne ; aucun modèle non éprouvé dans le contexte ; sans modèle si tous tombent
D8 B — Même fournisseur que l'outil d'abord ; ta liste en secours
D8 C — Groupe d'équivalents mesurés : llm-mesh choisit seul
D8 D — Shadow local seulement

D9 A — Sans porte formelle : tu juges sur un pilote
D9 B — Rejeu partout : le rejeu de tes sessions et les trois contrôles, avant chaque cran, notre CLI compris
D9 C — Rejeu pour l'option, preuve complète pour notre CLI
D9 D — Preuve complète partout : tâches réelles et seuils avant toute activation
```

**Ligne à copier, avec tes lettres à la place des tirets bas :**

```
responseLine: "D1 A · D2 A · D3 A · D4 _ · D5 _ · D6 _ · D7 _ · D8 _ · D9 _"
```

**Si tu suis les six recommandations :**

```
responseLine: "D1 A · D2 A · D3 A · D4 C · D5 A · D6 B · D7 A · D8 A · D9 C"
```

**Entrées attendues avec ta réponse :** la liste des modèles du shadow et son ordre, si tu choisis D8 A. Facultatif : une exception Python pour Hermes ; ce que tu veux voir épinglé en plus ou en moins ; ton plafond de taille.

Le kit prépare ta réponse ; il n'enregistre rien tant que tu ne l'as pas envoyée.

## Annexe 1 — Tes mots, cités en entier

- **08/11 :** « La memoire graphe devrait remplacer le conexte en une forme de resumé a chaque etape c etait ma demande. Le mode dreaming veenant rappelera des choses permanentes oubliees sur le court terme. Il ne doit jamais y avkir de relve ou bie chaque prompt devrai etee independant ne dependre que de la memoire et du resultat precedeent reprocessé. L idee eat d etre idependant et sans duree. »
- **08/11 :** « Comme je disais precedemment un contexte de session devrait etre une requete contextuelle a la memoire + le resultat de la requete. L envoi au llm ne devrait pas envoyer de vieux contexte. L historique de sessions serait juste acceasible via la memoire comme gestionnaire de session et memoire (on garde l historique de texte en query via le graph memoire) »
- **08/11 :** « Je vois pas comment tu gere adapte sans outil memoire »
- **08/11, sur le dreaming et la saturation :** « Ca manque serieusement de profondeur. J ai demande que l un graph contextuel remplace le contexte. Et qu on ai un processus dormant (dreaning agent) de resynthese de session sur une periode (daily, mi journee, a saturation du contexte) »
- **08/11, sur le modèle d'extraction (extrait d'un commentaire plus long) :** « Il faut oeut etre en permanence un deuxiemme llm light d extraction ou reposer sur le llm de session pour les decisions a terme pkoi pas des modeles deeplearninf specialises. »
- **15/11, rejet des dossiers précédents :** « Non mais ton dossier est delirant. On sait meme pas quels sont les foncrion que tu proposes c est delirant dans cet outil. » · « Le dossier doit etre orienté finalite donc c le dossier qui doit presenter . L explication ne permet pas de comprendre le niveau de delire qhi peut aboutir a une telle profondeur. » · « Et certainement pas de 7eme outil imbitable c est qu il et necessairement stupide et mal pensé. Une dystopie technique sans finalité » · « Donc tu presentes un dossier qui a du sens » · « Si je comprends pas c est une merde »
- **15/11, direction du journal :** « Deja engram doit devenir un loguer de session en // des outils. Dans notre outil cli a nous ce deviendra le loggeur principal. La session est loguée en graph. Et donc seul le diff est transmis a chaque fois. »
- **15/11, sur la façon de faire :** « Pas a toi de reecrire connard. Soir carbon soit fable 5.2 » · « Toi tu es conductor et tu donnes mon verbatim » · « Je ne veux AUCUNE spec en ligne ici genre j ai lu ces conneries. Tout passe par decision dossier » · « Par des ia max » · « Le doasier memoire a du etre fait par des ia max c tout ce que je veux » · « Les spec etc. Sinon elle doivent etre revues par fable 5.2 ou carbon tant qu astra max esf pas dispo » · « Tu annulr tout ce qui a ete fait par un opus 5.5 high trop nul comme toi »
- **15/11, ta réponse à r5, telle qu'exportée :** `responseLine: "D1 A · D2 A · D3 A"`, avec les trois libellés repris dans le kit.
- **15/11, ton commentaire sur r5, posé sur l'option D2 A, en entier :**

> « Dans ce decision dossier tu a squizzé mes outils de commentaire. Donc je dois utiliser claude en annotation. Ce doasier est non condorme. J espere que je pourrai copier mes decision en kit a la fin sinon je perdea mon temps
>
> Donc : ok poue cet option mais j ai demandé un hook pour prendre la main sur le compactage.
>
> On pourrait quand meme a terme faire un hook pour remplacer le contexte en option j aimerais ca meme si c pas l option principale initialement.
>
> Les deux reposeraient sur une forme de resumé graph des faits marquants soit parce qu on demande a chaque etape au llm primcipal de les fournir. Soit parce qu on le fait faire par un llm tiers en permanence (genre modele ember low ou luna 6 low ou haiku 5.5 low ou gemini 3.8 flash low ou un autre low dans mistral).
>
> Ton mecanisme de presentation me presente pas ce qu engram extrait en plus des faits donc c difficile de se faire une tete. Mais faut deja prevoir de base l annotation tierce. Celle ci sera aussi bien pour le mode dreaming que direct. Avec bascule auto llm mesh de model d annotation.
>
> Reprend le doasier complet avec l ensemble de ces remarques
>
> Reprends bien toutes les validations que j ai deja faites en cliquant la stp »

- **15/11, nouvelle direction, après ta réponse à r5 :** « https://arxiv.org/pdf/2611.05306 inspire toi de ca j aimerais vraiment qu engram devienne le relai de ce type de strategie pour remplacé mecaniquemenr + appui par llm shadow la taille du contexte) dans toutes les cli en ooption + la notre uqi reposera exclusivement sur engeam pour le contexte. Analyse fable5.2 + carbon »

Sources : les verbatims du 08/11 figurent au registre des décisions du 08/11. Ton export du 15/11 figure au registre des décisions, vérifié par l'auteur. Les autres verbatims du 15/11 sont relayés tels quels par le conductor ; aucun fichier ne permet de les recouper.

## Annexe 2 — Chaque demande, où elle est traitée, et l'écart

| Ta demande | Traitée par | Écart |
|---|---|---|
| La mémoire graphe remplace le contexte, en résumé à chaque étape | Fonction « rendre le diff » (D1 A) ; l'état (question 7) ; le rythme (question 6) | Recommandation B à la question 6 : des paliers courts au départ, pas chaque étape |
| Le dreaming rappelle le permanent oublié | Rubrique « rappels » de l'état | La spec du dreaming remet ses rappels par l'outil mémoire, à réécrire selon D1 A |
| Jamais de relève ; prompt indépendant, sans durée | Notre CLI (question 5) ; l'option (question 4) | Tenu en entier dans notre CLI ; dans les outils tiers, jusqu'au cran choisi |
| Contexte = requête à la mémoire + son résultat ; pas de vieux contexte | Même traitement | Même écart |
| Historique accessible par la mémoire | Fonction « chercher dans l'historique » | La recherche spécifiée est lexicale, sans expression régulière ; l'article s'appuie sur la recherche exacte : à éprouver |
| Pas d'adaptation sans outil mémoire | D1 A garde un outil mémoire | Aucun |
| Dire quelles fonctions sont proposées | Trois fonctions (D1) ; un curseur ; un état | Aucun |
| Dossier orienté finalité | « À quoi ça sert » ; l'exemple | Aucun |
| Pas de 7e outil incompréhensible | D1 A le remplace | Aucun |
| Journal en parallèle ; journal principal dans notre CLI ; session en graphe ; seul le diff | D1 A, D2 A, D3 A | Le suivi de ce qui a déjà été remis à une session est à écrire (« new ») |
| Reprendre toutes tes validations | Section « Ce que tu as déjà validé » ; kit | Aucun |
| Un crochet pour prendre la main sur le compactage | Question 4, premier cran | « Prendre la main » au sens plein n'arrive qu'après la preuve de la question 9 |
| Un crochet pour remplacer le contexte, en option | Question 4 | Plafonné outil par outil |
| Un résumé en graphe des faits marquants, par le modèle principal ou un modèle tiers | Question 7 | Le résumé libre est remplacé par un état en rubriques |
| L'annotation tierce de base ; direct et dreaming ; bascule llm-mesh ; modèles « low » | Questions 7 et 8 | Substitution automatique fermée dans llm-mesh ; Haiku absent du catalogue ; « new » pour la spec du dreaming |
| Montrer ce qu'engram extrait en plus des faits | Section « À une étape » | Exemple construit, pas une exécution réelle |
| Copier tes décisions en kit | Section « Kit de réponse » | Aucun |
| Tes outils de commentaire | Chaîne de rendu | Hors contenu |
| S'inspirer de l'article ; engram relais de cette stratégie | Tout le dossier | Le shadow comme auteur de l'état n'est pas couvert par l'article |
| Remplacer mécaniquement, avec l'appui d'un LLM shadow | Questions 7 et 8 | Recommandation A à la question 7 : le modèle principal écrit son plan, en plus |
| Dans toutes les CLI, en option | Question 4 | Inégal selon les outils ; Muse `unverified` ; Hermes limité par ta règle « zéro Python » |
| La nôtre, exclusivement sur engram | Questions 5 et 6 | Programme non désigné à ce jour |
| Analyse Fable 5.2 + Carbon | Deux analyses, lues en entier ; annexe 8 | Aucun |
| Rédigé par des IA au maximum ; le conductor ne donne que ton verbatim ; aucune spec en ligne | Ce dossier | Voir annexe 6 |

## Annexe 3 — Règles déjà décidées, toutes conservées

Les numéros renvoient au registre des décisions du 08/11. Ils n'ont aucun rapport avec D1 à D9 de ce dossier.

| Règle | Ce qu'elle impose ici |
|---|---|
| Même rôle, même espace (règle 5) | Avant admission, une session ne reçoit le contenu non admis que des sessions du même rôle h2a, dans le même espace de travail. |
| Références seules sans autorisation (règle 6) | Sans autorisation de contenu, seuls un chemin et son empreinte partent vers un modèle externe. Résumés du dreaming, caches et journaux compris. S'applique au shadow. |
| Masquage des données personnelles (règle 8) | Tout envoi à un modèle externe passe par le masquage et des extraits bornés. S'applique au shadow. |
| Journaux et résumés de contexte locaux (règle 10) | Le résumé de session, donc l'état, reste sur la machine, sauf politique de transfert portée par le mandat. |
| Mode dégradé signalé (règle 17) | Si engram ne répond pas, la session continue, avec un bandeau et un journal. Pour notre CLI, qui n'a pas de fil : voir « Ce qui est proposé sans question ». |
| Session sans identité mémoire (règle 18) | Elle n'est pas notée et ne reçoit aucun contenu de mémoire. Elle reçoit Track, Git, architecture et règles, en lecture seule. |
| Graphe contextuel et dreaming (règle 19) | Le graphe est alimenté à chaque tour. Le dreaming resynthétise : nuit, semaine, mois, mi-journée, saturation. |
| Un outil mémoire porte l'adaptation (règle 20) | Au registre, cela reste un 7e outil. Le contrat des six outils est rouvert avec une nouvelle double signature. |
| Plus de relève, prompts sans durée (règle 23) | C'est la finalité de ce dossier. |
| Leçons du dreaming en deux temps (règle 26) | Un modèle rédige, un vérificateur indépendant contrôle ; rien ne t'est montré avant le seuil mesuré. Le même principe est proposé pour ce que le shadow écrit dans l'état (question 9). |
| Extraction (principe du 08/11) | Un second modèle léger en permanence, ou le modèle de la session ; plus tard des modèles spécialisés. |
| Modèles à Track, grammaire à engram, contrôle à l'application Track (14/11) | L'état ne connaît aucune liste de types Track. Chaque élément cite la version de son modèle. |
| Dreaming (14/11) | La nuit en local ; la semaine et le mois à distance, après synchronisation. |
| Décision du 14/11 sur le 7e outil | Inchangés : désactivé par défaut, double signature engram + sentropic, qualification. Amendés par D1, D2 et D3 ; à amender selon tes réponses à D4 jusqu'à D9. |
| Zéro Python (ta règle permanente) | Aucun module Python dans nos dépôts ni dans nos jobs. Limite Hermes à l'injection. |

## Annexe 4 — Faits vérifiés et inconnues

**Vérifié par l'auteur le 15/11, par lecture directe, pour cette révision.**

| Fait | Source |
|---|---|
| L'article : régimes, bancs, modèles, seuils ; réussite, jetons, prix publics, prix modélisé et nombre de reconstructions ; modèles ouverts ; ce qui fait une bonne fiche ; consignes de relève | `context-strategy-2611.05306/source/2611.05306.txt`, pages 1 à 14 et 20 à 31 ; bibliographie non relue ; original PDF non ouvert |
| Compte des réglages où la facture aux prix publics monte ou baisse : tâches longues, 21 sur 22 en hausse pour GPT 5.6 Sol, 15 sur 22 en baisse pour Opus 4.5 ; longs documents, 13 cas sur 14 en baisse | calcul de l'auteur sur les tableaux 3 à 8 et 11 à 17 |
| Ton export `responseLine: "D1 A · D2 A · D3 A"` et ses trois libellés ; dossier de suite en attente | `spec/memory/OWNER-DECISIONS-2026-11-14.md`, lignes 43-56, copie de travail `graphify-wt-memfinal` |
| Gemini CLI, version installée : remise à zéro du contexte après un tour ; avant une requête, remplacement de « parties » de la requête, sans mention explicite des messages ; compactage : prévenu, sans pouvoir | documentation embarquée, `@google/gemini-cli/bundle/docs/hooks/reference.md`, lignes 178-179, 187-202 et 287-297 |
| Hermes : moteur de contexte remplaçable, écrit en Python ; il rend la nouvelle liste de messages ; un seul moteur actif | `~/.hermes/hermes-agent/agent/context_engine.py`, lignes 1-26 et 86-99 |
| h2a, copie de travail récente : huit outils (claude, codex, gemini, agy, hermes, opencode, muse, vibe) | `h2a/tmp/worktrees/llmmesh-038/packages/h2a/src/hosts/plugin.ts`, lignes 84-150 |
| h2a : cinq profils de lancement (claude, codex, agy, muse, vibe) ; prompt transmis sur l'entrée standard ; Muse et Vibe refusent le mode sans écran | `~/.claude/skills/h2a-run/SKILL.md`, lignes 61-71 |
| llm-mesh 0.38.0 : liste ordonnée de préférences ; pas de substitution entre modèles par défaut ; 3 essais ; mise à l'écart de 5 minutes | `sentropic/tmp/worktrees/smoke-restore-fix/packages/llm-mesh/package.json`, ligne 3 ; `src/routing-policy.ts`, lignes 14-17 et 53-63 |
| llm-mesh 0.38.0 : 38 modèles exclus de toute équivalence, motif cité | même copie, `src/generated-model-council.ts`, lignes 2-48 |
| llm-mesh 0.38.0, catalogue : `muse-ember-1.0`, `gpt-6-luna`, `gemini-3.8-flash`, `mistral-small-2603` présents ; aucun Haiku ; un modèle local, `laneformer-2b-it` | même copie, `src/providers.ts`, lignes 13-81 |
| Commande parapluie `stp` : ne livre que `stp app` ; `stp graphify`, `stp h2a` et `stp remote` réservés | `sentropic/packages/cli/README.md`, lignes 3-35 |
| Bibliothèque chat-core : fonctions extraites pour qu'un futur programme en ligne de commande s'y branche | `sentropic/packages/chat-core/src/context-budget.ts`, lignes 27-32 |

**Repris des deux analyses, non relu par l'auteur.**

| Fait | Source |
|---|---|
| Crochets de Claude Code, Codex, Antigravity CLI, OpenCode et Mistral Vibe ; seuil de compactage de Claude Code réglable de 100 000 à 1 000 000 jetons ; consigne de compactage et seuil de Codex par configuration ; crochet de Codex avant requête : diagnostic seulement | analyse Fable : documentation publique lue le 15/11, adresses dans son annexe B ; analyse Carbon : versions installées (claude 2.1.325, codex-cli 0.163.0, gemini 0.67.0, agy 1.5.9, opencode 1.17.15, vibe 2.26) |
| Gemini CLI remplacé par Antigravity CLI le 18 juin 2026 | analyse Fable, page publique lue par résumé |
| h2a lance une session en arrière-plan avec un prompt sur l'entrée standard ; la boucle h2a exécute quatre actions : clôture, demande de lancement, réveil, routage de décision | analyse Fable : h2a, `adapters.ts`, lignes 486-513 ; `execute.ts`, lignes 99-111 |
| Specs actuelles : aucune rubrique pour le plan ; demande en cours non épinglée ; paquet par défaut de 2 000 jetons, 32 000 au plus ; résultat précédent borné à 4 096 octets ; jetons estimés en octets divisés par trois ; recherche lexicale, sans expression régulière ; aucune mesure de résultat | analyse Fable, §2.6, lignes de spec citées |
| Prix publics de nos modèles ; coût d'une reprise après expiration du cache ; coût du shadow | analyse Fable, page de tarifs lue le 15/11 ; analyse Carbon, prix « typiques », jugement |
| engram : rappel borné en octets ; pont llm-mesh avec validation de schéma avant de créditer un essai | analyse Carbon : `engram-memory/recall.ts` ; `src/llm-mesh-bridge.ts` |

**Repris de r6, vérifié le 15/11 par lecture directe dans la session précédente.**

| Fait | Source |
|---|---|
| Six outils mémoire aujourd'hui | engram, `src/mcp/memory/contracts.ts`, lignes 149-156 |
| h2a n'enregistre que l'arrêt de session ; aucun crochet d'étape ni de compactage ; h2a sait reprendre une session arrêtée | h2a, `packages/h2a/src/hosts/plugin.ts`, lignes 36-79 et 109-138 |
| Spec du journal : version 0.3.0 du 15/11, 1 714 lignes, 18 lots, rien de codé ; six sortes de faits bruts ; importance d'un résultat d'outil ; résumé de session tous les 24 tours ou 64 Ko, à la saturation et à la clôture ; trois modes d'extraction, petit modèle permanent par défaut ; décisions de projet « proposées » jusqu'au contrôle de Track ; confidentialité | `spec/SPEC_ENGRAM_SESSION_FRONT_AND_EXTRACTION.md` : en-tête, §1.4, §1.5, §2, §4 à §9 |
| Spec de l'outil mémoire : version 0.3.0 du 15/11, 1 616 lignes, 15 lots ; paquet entier à chaque étape ; remplacement imposé aux huit outils avec date butoir, retiré par D2 A ; tri des éléments marquants sans modèle, poids fixes (décision du propriétaire 2,50 ; alerte de sécurité 2,25 ; rappel du dreaming 2,10 ; erreur 1,90 ; résultat marquant 1,60 ; routine exclue) | `spec/SPEC_ENGRAM_CONTEXTUAL_GRAPH_AND_PROMPT_LOOP.md` : en-tête, §1, lignes 741-785, §8 |
| Spec du dreaming : version 0.3.0 du 15/11, 1 112 lignes, 15 lots, statut « proposée » ; passe à la saturation à 80 % de remplissage ; ni modèle d'annotation ni bascule ; plafonds de coût par passe de 0,05 à 0,50 dollar, non ratifiés par toi ; rien de rédigé par un modèle ne t'atteint avant le seuil mesuré | `spec/SPEC_ENGRAM_DORMANT_DREAMING_SYNTHESIS.md` : en-tête, lignes 126, 271-274, 353, 448-507, 767-800, 1078 |
| Code d'extraction : documents en entrée, pas des sessions ; éléments non conformes retirés | engram, `src/extraction-batch.ts`, lignes 158-232 et 1338-1608 |
| Pont engram vers llm-mesh : candidat suivant après panne ou réponse invalide ; ne transmet ni liste ni profil ; engram dépend de llm-mesh `^0.19.0` | engram, `src/llm-mesh-bridge.ts`, lignes 257-275 et 389-476 ; `package.json`, lignes 145-153 |
| llm-mesh, copie locale principale : version 0.17.0 | sentropic, `packages/llm-mesh/package.json`, ligne 3 |
| Décisions et règles | `spec/memory/OWNER-DECISIONS-2026-11-14.md` ; `spec/memory/R15-SEDIMENT.md` |

**Inconnues.**
- Fonctionnement réel des crochets sur tes versions installées : `unverified`. Aucun crochet n'a été exécuté.
- Muse : `unverified` sur tous les points.
- Codex : acceptation d'un seuil de compactage de l'ordre de 16 000 jetons : `unverified`.
- OpenCode : possibilité de remplacer toute la liste des messages : `unverified` ; essai réel du plugin non fait par h2a.
- Relance par h2a d'une session neuve sur une vue d'engram : le lancement existe ; le déclencheur et la vue de départ sont « new ».
- La copie de travail de llm-mesh en 0.38.0 suit-elle la branche principale : affirmé par l'analyse Carbon ; `unverified` par l'auteur, shell indisponible.
- Niveau « low » dans les alias de llm-mesh 0.38.0 : `unverified`.
- Qui mesure le remplissage du contexte dans chaque outil : documenté pour Claude Code et Codex selon l'analyse Fable ; absent des specs.
- Forme de l'état et canal par lequel le modèle principal contribue : « new ».
- Suivi de ce qui a déjà été remis à une session : « new ».
- Comportement de notre CLI quand engram est en panne : `not covered` par les specs.
- Coûts de construction des options : `unknown`. Volumes réels du shadow : `unknown`. Comptabilité sous abonnement : `unknown`.
- Ta demande d'un crochet de compactage avant le 15/11 : `source-gap`.
- Modèles affectés au dreaming : `source-gap`.

## Annexe 5 — Ce qui change

**Par rapport à r5, la dernière version que tu as vue.**
- **Décisions.** D1 A, D2 A et D3 A sont validées et ne sont plus posées. Six questions nouvelles : D4 à D9.
- **Direction.** Ta phrase du 15/11 sur l'article : engram relais d'un contexte court, en option dans toutes les CLI, exclusif dans la nôtre.
- **Tes remarques du 15/11.** Crochet de compactage, remplacement du contexte en option, résumé des faits marquants, annotation tierce avec bascule : toutes reprises, dans les questions 4, 6, 7 et 8.
- **Sections nouvelles.** L'article en quelques phrases ; « À une étape » ; « Ce qui est proposé sans question ».
- **Corrections de faits.** La spec du dreaming existe : version 0.3.0 du 15/11, 1 112 lignes, statut « proposée », rien de codé. Les specs du journal et de l'outil mémoire comptent 1 714 et 1 616 lignes. Aucune ne suit ce qui a déjà été remis à une session.

**Par rapport à r6, rédigé le 15/11 et jamais montré.** r6 est remplacé par cette révision.
- Ses questions sur le crochet de compactage et sur le crochet de remplacement sont fondues en une : la question 4, un seul curseur.
- Sa question sur l'auteur du résumé devient la question 7 : l'état en rubriques, et ses auteurs.
- Sa question sur les modèles d'annotation devient la question 8, avec la qualification.
- Trois questions s'ajoutent : notre CLI (5), le rythme (6), la preuve (9).
- Faits corrigés depuis r6 : le crochet de Codex avant requête est un diagnostic, sans pouvoir ; h2a compte huit outils dans sa copie récente ; llm-mesh est en 0.38.0 dans une copie de travail, où quatre de tes cinq exemples de modèles sont au catalogue ; la boucle h2a exécute quatre actions, pas la seule clôture ; le lancement d'une session sur un prompt de départ existe dans h2a.

## Annexe 6 — Relectures, méthode et suite

- **Règle de relecture : la tienne, du 15/11 (annexe 1).** Elle remplace celle de la méthode générique. Le dossier mémoire doit avoir été fait par des IA au maximum, « c tout ce que je veux ». Pour les specs et la suite : « Les spec etc. Sinon elle doivent etre revues par fable 5.2 ou carbon tant qu astra max esf pas dispo ».
- **Rédaction.** Fable 5.2, réglé au maximum ; réglage constaté dans la session de rédaction.
- **Les deux analyses.** L'une par Fable 5.2 au maximum, l'autre par Gemini Carbon. Chacune déclare en tête avoir été écrite sans lire l'autre. Lues en entier par l'auteur, avec l'article.
- **Biais possible, signalé.** L'auteur de ce dossier est le même modèle que l'auteur d'une des deux analyses. Sur les points de divergence qui demandaient une recommandation : le rythme suit la position de Carbon ; l'auteur de l'état, la preuve et le déploiement cran par cran suivent celle de Fable ; la panne du magasin local suit celle de Carbon. Les faits qui tranchent sont donnés à chaque fois ; à toi de juger.
- **Ce dossier n'a pas été relu par Carbon.** Seules les analyses sont croisées.
- **Limite de la session de rédaction.** Le shell était indisponible : aucune recherche plein texte, aucune commande git, aucune exécution. Les fichiers ont été lus un à un. Conséquences : l'état des branches n'est pas vérifié ; aucun crochet n'a été essayé ; la documentation publique des outils et les prix n'ont pas été relus par l'auteur, ils viennent des analyses.
- **Suite après tes réponses.** Réécriture des specs selon tes neuf choix ; relectures indépendantes par Fable 5.2 ou Carbon ; puis un nouveau dossier pour la double signature engram + sentropic.
- **Recueil de ta réponse.** Par l'outil de question natif, après affichage du dossier et de ses schémas, ou par le kit. À défaut, la décision reste en attente.

## Annexe 7 — Rappel : ce qui fondait D1, D2 et D3

**D1 — Que fait engram à chaque étape d'une session ?** Options : A, journal + diff (choisie) ; B, paquet entier à chaque étape ; C, journal seul. Objection retenue contre A : quand la mission change de sujet, des éléments anciens redeviennent utiles sans avoir changé ; le diff doit comparer ce que la session a à ce qu'elle devrait avoir. Parade : la session peut redemander sa vue de départ.

**D'où venait la profondeur.** Pour porter des données sans connaître leurs types, la spec avait créé un conteneur universel, recopié niveau par niveau jusqu'à 8. Aucun besoin ne demandait cette profondeur. Un graphe porte ces données en nœuds et en liens, sans conteneur.

**D2 — Dans les outils tiers, jusqu'où va engram ?** Options : A, journal en parallèle + diff injecté (choisie) ; B, couper le fil des outils tiers ; C, journal seul. Limite connue de A : le fil de l'outil grossit encore. Tes remarques du 15/11 et ta nouvelle direction traitent cette limite : c'est la question 4.

**D3 — Par quoi on commence ?** Options : A, le journal d'abord, en trois temps (choisie) ; B, tout d'un bloc ; C, notre CLI d'abord. Scénario d'échec : le temps 1 est livré et le temps 2 traîne ; engram note tout et ne rend rien.

## Annexe 8 — Les deux analyses côte à côte

**Là où elles convergent.** Un seul curseur à la place de deux crochets. Un état en rubriques à la place d'un résumé libre. Ta demande recopiée mot pour mot par le code. Une liste de modèles que tu fixes, avec qualification, et un état tenu sans modèle si tous tombent. Pas de passerelle qui réécrit les requêtes. Notre CLI : un programme à nous, en TypeScript. Une mesure avant de remplacer un contexte. La réserve de coût sur l'article.

**Là où elles divergent.**

| Point | Analyse Carbon | Analyse Fable | Ce qui tranche | Retenu ici |
|---|---|---|---|---|
| Rythme | Paliers courts par défaut : seuil à 18 000 jetons, plafond à 24 000 ; une action par prompt réservée aux modèles hébergés | Une action par prompt colle à notre CLI ; un ou deux appels par étape, à mesurer | Le tableau 2 lu avec le réglage le plus serré ; un coût non publié ; tes mots ; la mesure | Question 6, recommandation B |
| Auteur de l'état | Le shadow tient tout, plan compris ; signaux facultatifs du modèle principal | Trois auteurs ; le modèle principal écrit son plan | L'article n'a testé que le modèle principal ; les petits modèles décrochent ; la mesure | Question 7, recommandation A |
| Déploiement dans les outils tiers | Les trois voies d'un coup, après une porte | Cran par cran | L'option se coupe session par session | Question 4 : C, construit cran par cran |
| Gemini CLI | Remplacement possible, version installée | Injection seulement ; produit remplacé | La documentation embarquée, lue par l'auteur | Tableau de la question 4 |
| Hermes | Première vague | Limité par « zéro Python » | Ta règle | Pas d'exception par défaut |
| OpenCode comme véhicule | Pas de dérivé d'un outil tiers | Plugin comme premier véhicule | Un plugin n'est pas un dérivé ; il existe déjà par la question 4 | Question 5, recommandation A |
| Preuve avant de remplacer | 120 tâches réelles et 150 tâches publiques avant toute activation | Rejeu d'abord ; preuve complète avant notre CLI | L'option est réversible ; le jeu de tâches reste à construire | Question 9, recommandation C |
| Seuil de coût | Facture totale, shadow compris, au plus égale à celle d'aujourd'hui | Jusqu'à +25 % de jetons et de durée par tâche | Ton objectif ; les tableaux de l'article | À fixer par toi aux premières mesures |
| Seuils de réussite | Au plus 1,5 point de moins ; 99 % de tes règles tenues après 5 reconstructions ; moins de 3 % d'impasses répétées ; prompt au plus à 24 000 jetons | Pas moins bien que le résumé de l'outil ; au plus 2 points sous le fil complet, sur 500 questions au moins | Les premières mesures | À fixer par toi aux premières mesures |
| Magasin local en panne | Plus aucune écriture ; de quoi rejouer | Quelques étapes de plus, puis pause | La trace d'abord | Règle de Carbon proposée |
| Mistral Vibe | Quatre points d'accroche, version installée | Trois, documentation publique | Sans effet : ni compactage ni requête dans les deux cas | Tableau de la question 4 |
| Vibe sans écran | Possible | Refusé | Règle de lancement h2a, lue par l'auteur : refusé | Tableau de la question 4 |
| Coût du shadow | 0,03 à 0,25 dollar pour 80 étapes | 0,50 dollar pour 500 étapes | Volumes supposés dans les deux cas | `unknown` |

**Apports propres à chacune.**
- Carbon : la version 0.38.0 de llm-mesh et ses huit outils côté h2a ; la lecture des versions installées ; un petit registre des dernières actions, gardé à côté de l'état, pour éviter qu'un agent tourne en rond quand le shadow a une étape de retard ; un jeu de tâches où la consigne change en cours de route.
- Fable : le compte des réglages où la facture monte ; le lancement d'une session sur un prompt de départ, déjà présent dans h2a ; la reprise d'une session après expiration du cache comme vrai lieu d'économie ; la mesure par rejeu, qui fournit aussi la preuve que llm-mesh exige.
- Un chiffre de l'analyse Carbon, le contexte maximal du fil complet pour un des deux modèles, ne se retrouve pas dans le tableau 2 de l'article tel que lu par l'auteur. Sans effet sur les conclusions.

## Schémas à dessiner

1. **Avant / après** (direction). À gauche, aujourd'hui : un outil, un fil qui grossit, la saturation, un résumé fait par l'outil ou une relève, engram à l'écart avec ses six outils. À droite, demain : chaque étape part au graphe ; le shadow tient l'état ; le prompt = demande épinglée + état + dernier résultat ; une autre session repart du même état.
2. **L'article en un schéma** (direction). Trois bandes pour une même tâche : le fil complet qui grossit ; la reconstruction à un seuil ; une action par contexte. Sous chaque bande, la taille du prompt et ce qui est mesuré ou non : réussite, coût aux prix publics, coût modélisé.
3. **Ce qu'engram note et ce que le shadow écrit, sur l'exemple** (section « À une étape »). Couche du journal : deux tours de parole, deux résultats d'outil, le fichier `src/retry.ts`, les rattachements. Couche du shadow : la décision, le fait établi, leurs liens, les renvois vers les faits bruts.
4. **L'état et ses auteurs** (section « À une étape », question 7). Au centre, les neuf rubriques. Autour, les trois auteurs : le code, le shadow, le modèle principal, avec une flèche vers les rubriques de chacun. En pointillé, la variante à deux auteurs.
5. **Ce que reçoit le modèle** (section « À une étape »). Trois colonnes : outil tiers option coupée, outil tiers option activée, notre CLI. Dans chacune, l'empilement de ce qui part au modèle, à l'échelle : le fil, la demande, l'état, le dernier résultat.
6. **Le curseur, outil par outil** (question 4). Une règle graduée : journal seul, injection, compactage, seuil plus tôt, chaque tour, chaque requête. Un repère par outil à son plafond sans relance ; une flèche « relance par h2a » pour ceux qui l'ont ; le réglage par défaut de D2 A marqué ; notre CLI au bout. Les trois options A, B et C en accolades.
7. **Notre CLI : la boucle d'une étape et ses briques** (question 5). La boucle : assembler la vue, un appel de modèle, noter le résultat, mettre l'état à jour, ne rien garder. Autour : la commande `stp`, chat-core, llm-mesh, engram, h2a qui lance.
8. **Les deux rythmes** (question 6). Deux courbes de taille de prompt au fil des étapes : plate et basse pour « une action, un prompt neuf » ; en dents de scie courtes pour « paliers courts ». En regard, la part du prompt servie par le cache.
9. **Les modèles du shadow et la bascule** (question 8, source `ecosystem:models`). La liste ordonnée, la flèche de bascule en cas de panne, la porte de qualification avant de nourrir un contexte, le repli sans modèle. En regard, le groupe d'équivalents, fermé aujourd'hui.
10. **Direct et dreaming, un seul service** (question 8). Deux rythmes pour le même service : à chaque étape ; par lots, la nuit, la semaine, le mois, à mi-journée et à la saturation. À part, les leçons du dreaming : un modèle rédige, un second d'une autre famille vérifie.
11. **La porte de preuve** (question 9). Une frise : le journal enregistre ; le rejeu et les trois contrôles ouvrent un cran dans un outil tiers ; les tâches réelles et le pilote ouvrent notre CLI. Les quatre options comme quatre hauteurs de porte.
12. **Ordre de construction** (D3, validé, complété). Trois temps. Temps 1 : noter et annoter ; la mesure commence. Temps 2 : rendre le diff, chercher dans l'historique, premiers crans du curseur. Temps 3 : notre CLI, sur engram seul.
13. **Carte de l'écosystème** (source `ecosystem:overview`). Outils CLI, h2a, cluster-mesh, engram, Track, llm-mesh. Surligner le chemin du journal, le chemin du shadow par llm-mesh, et la place de notre CLI.
