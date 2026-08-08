#!/usr/bin/env bash
# GATE 4 criteres — DEF FINALE (conducteur 2026-08-08, raffinement g-arch). LOCKE:
# ne plus re-refiner sauf faux-verdict REEL constate.
#
# CHEMIN CANONIQUE: scripts/gate4.sh — versionne, non-gitignore, une seule copie.
# N EN FAITES PAS DE COPIE. Un doublon sous .graphify/scratch/ a deja coute a la
# flotte deux verifications et une correction publique erronee: les deux copies
# etaient correctes, mais l une AFFICHAIT l index de colonne resolu, ce qui se lit
# comme un hardcode. Si vous devez lire le gate, lisez CE fichier.
#
#   MemAvailable >= 10G  ET  disque < 90%  ET  load1 < 1.5*nproc  ET  swap-churn bas
#
# CRITERE 4 = TAUX d E/S swap, PAS le niveau ni le delta de SwapFree.
#   vmstat 2 3 = 3 releves a 2s. La 1re ligne est un cumul depuis le boot, donc
#   inutilisable: on juge sur les 2 DERNIERES.
#   ROUGE = si/so SOUTENU > 0 sur CES DEUX echantillons. Un pic momentane n est pas
#   un thrash: vmstat 1 2 sous-echantillonne et rendait un faux-rouge sur un pic
#   transitoire de 1s.
#   Un gros swap UTILISE mais STABLE est BENIN — c est l insight d origine, d ou le
#   fait que le niveau soit affiche comme informatif et jamais comme critere.
#
# LC_ALL=C OBLIGATOIRE: en locale fr_FR, awk printf "%.1f" rend "48,0" et la
# comparaison bascule en comparaison de CHAINES. "6.75" < "48,0" est FAUX (compare
# "6" a "4") => NO-GO fantome sur load. Pire, "9,5" >= "10" est VRAI (compare "9" a
# "1") => le gate laissait passer une machine SOUS le plancher memoire. Bug constate
# et corrige le 2026-08-08 sur ce script meme.
export LC_ALL=C

NPROC=$(nproc)
MEMAV=$(awk '/MemAvailable/{printf "%.1f", $2/1048576}' /proc/meminfo)
LOAD1=$(awk '{print $1}' /proc/loadavg)
DISK=$(df --output=pcent / | tail -1 | tr -dc '0-9')
SWUSED_MI=$(awk '/SwapTotal/{t=$2} /SwapFree/{f=$2} END{printf "%d", (t-f)/1024}' /proc/meminfo)
SWTOT_MI=$(awk '/SwapTotal/{printf "%d", $2/1024}' /proc/meminfo)
THRESH=$(awk -v n="$NPROC" 'BEGIN{printf "%.1f", n*1.5}')

# SO-ONLY (def finale corrigee, conducteur 2026-08-08 apres faux-rouge constate).
# swap-OUT des 2 derniers echantillons. Le swap-IN est AFFICHE mais EXCLU du verdict:
# un si eleve avec so=0 est une RECUPERATION (pages qui reviennent en RAM libre), pas
# une pression. Seul so soutenu = eviction sous pression = thrash.
#
# POSITION JAMAIS DEVINEE: les colonnes sont resolues par l EN-TETE. En vmstat, $2
# est "b" (processus BLOQUES), pas "so" — coder une position devinee fait juger les
# process bloques au lieu du swap. Et le layout DERIVE selon procps: sur cette machine
# l en-tete porte 18 champs dont "gu", donc un $8 code en dur est un pari sur la
# version installee. Si l en-tete est illisible, on echoue en NO-GO plutot que de
# deviner.
VMALL=$(vmstat 2 3)
VMHDR=$(echo "$VMALL" | sed -n '2p')
SO_IDX=$(echo "$VMHDR" | awk '{for(i=1;i<=NF;i++) if($i=="so"){print i; exit}}')
SI_IDX=$(echo "$VMHDR" | awk '{for(i=1;i<=NF;i++) if($i=="si"){print i; exit}}')
if [ -z "$SO_IDX" ] || [ -z "$SI_IDX" ]; then
  echo "GATE ERREUR: colonnes si/so introuvables dans l en-tete vmstat -> [$VMHDR]"
  echo "VERDICT=NO-GO"
  exit 1
fi
VMOUT=$(echo "$VMALL" | tail -2)
S1=$(echo "$VMOUT" | head -1 | awk -v c="$SO_IDX" '{print $c}')
S2=$(echo "$VMOUT" | tail -1 | awk -v c="$SO_IDX" '{print $c}')
SI=$(echo "$VMOUT" | tail -1 | awk -v c="$SI_IDX" '{print $c}')
SO=$S2

ok_mem=$(awk -v v="$MEMAV" 'BEGIN{print (v>=10)?1:0}')
ok_disk=$(( DISK < 90 ? 1 : 0 ))
ok_load=$(awk -v l="$LOAD1" -v t="$THRESH" 'BEGIN{print (l<t)?1:0}')
# SOUTENU = les DEUX derniers echantillons de swap-OUT au-dessus du seuil. Un pic
# isole => vert. Historique de calibration, 3 faux-verdicts qui ont fixe cette regle:
#   1) ">0 sur si+so" => NO-GO permanent sur machine saine (si>0 sur 10/10 releves,
#      moyenne 92 KiB/s, so=0 sur 6/10, 21G libres, load 9.57).
#   2) "vmstat 1 2" => faux-rouge sur un pic transitoire de 1s (88 puis 20828 KiB/s
#      a deux appels consecutifs).
#   3) "si+so a 1000" => faux-rouge pendant la RECUPERATION post-thrash: si eleve
#      (pages qui reviennent en RAM libre) avec so=0. C est benin, et c est ce qui a
#      motive le passage a SO-only.
CHURN_MAX_KIBPS=1000
if [ "$S1" -gt "$CHURN_MAX_KIBPS" ] && [ "$S2" -gt "$CHURN_MAX_KIBPS" ]; then ok_churn=0; else ok_churn=1; fi

echo "nproc=$NPROC MemAvailable=${MEMAV}G(ok=$ok_mem) disque=${DISK}%(ok=$ok_disk) load1=$LOAD1/seuil${THRESH}(ok=$ok_load)"
echo "swap-OUT echantillons 2s: so=[${S1}, ${S2}] KiB/s; ROUGE si les DEUX > ${CHURN_MAX_KIBPS}; ok=$ok_churn  [si=${SI} KiB/s (swap-IN) = AFFICHE mais EXCLU du verdict: recuperation, pas pression | swap UTILISE ${SWUSED_MI}Mi/${SWTOT_MI}Mi = informatif]"
if [ "$ok_mem" -eq 1 ] && [ "$ok_disk" -eq 1 ] && [ "$ok_load" -eq 1 ] && [ "$ok_churn" -eq 1 ]; then
  echo "VERDICT=GO"
else
  echo "VERDICT=NO-GO"
fi
