# BetTracker — Panel Latéral Détail Ticket
## Documentation Fonctionnelle Exhaustive — v1

---

## 1. Accès

Déclenché par :
- Clic sur "Détail" dans le tableau Liste/Historique (module Tickets)
- Clic sur une card Kanban (module Tickets ou détail Campagne)
- Clic sur une ligne du tableau Liste dans le détail Campagne

S'ouvre en **drawer latéral droit** — la page en arrière-plan reste visible et scrollable. Largeur fixe 420px. Fermé par clic sur la croix, clic en dehors, ou touche Échap.

---

## 2. Structure du panel — 6 blocs

```
┌─────────────────────────────┐
│ HEADER │ Match + statut     │
├─────────────────────────────┤
│ BLOC 1 │ Données du pari    │
├─────────────────────────────┤
│ BLOC 2 │ Mouvement de cote  │
├─────────────────────────────┤
│ BLOC 3 │ Résultat & CLV     │
├─────────────────────────────┤
│ BLOC 4 │ Origine & contexte │
├─────────────────────────────┤
│ ACTIONS                     │
└─────────────────────────────┘
```

---

## 3. Header

| Élément | Description |
|---|---|
| Sport + compétition + tour | Ex : 🎾 ATP · Indian Wells QF |
| Match | Équipes / joueurs en grand |
| Badge statut | Gagné / Perdu / En cours / Proposé / Ignoré / Expiré / Annulé |
| Badge tag | ALGO / MANUEL / SCANNER / COMBI |
| Date et heure | Date du match |
| Bouton fermer | Croix haut droite |

---

## 4. Bloc 1 — Données du pari

| Champ | Description |
|---|---|
| Issue pariée | Type + sélection (ex : Victoire Dom · Sinner) |
| Cote au placement | Cote obtenue sur le bookmaker |
| Mise | Montant misé |
| Gain potentiel | Cote × mise − mise |
| Bookmaker | Nom du bookmaker |
| Edge au moment de la génération | % edge calculé par l'algo |
| Confiance algo | % probabilité calculée par le modèle |
| Stratégie de mise | Fixe / % Bankroll / ½ Kelly… (si ticket issu d'une campagne) |

---

## 5. Bloc 2 — Mouvement de cote

Graphe linéaire de l'évolution de la cote depuis la génération du ticket jusqu'au coup d'envoi du match.

| Élément | Description |
|---|---|
| Graphe cote dans le temps | Ligne de la cote avec axe X = temps, axe Y = cote |
| Cote initiale (génération) | Point de départ — cote au moment où l'algo a généré le ticket |
| Cote au placement | Point marqué — cote obtenue au moment du placement |
| Cote de fermeture | Point final — cote bookmaker juste avant le match (base CLV) |
| Variation totale | ▲ / ▼ depuis génération jusqu'à fermeture |
| Signal de mouvement | "Cote en baisse → marché confirme la valeur" (si cote baisse = favorable) |

> Si le ticket est encore En cours : graphe affiché jusqu'au moment actuel, pas de cote de fermeture encore.
> Si ticket Ignoré ou Expiré : graphe affiché avec mention "Non placé".

---

## 6. Bloc 3 — Résultat & CLV

Affiché uniquement si le ticket est résolu (Gagné / Perdu / Annulé).

| Champ | Description |
|---|---|
| Résultat | Gagné / Perdu / Annulé avec badge coloré |
| Gain / Perte réel | Montant en € |
| ROI du ticket | % gain/perte sur la mise |
| CLV (Closing Line Value) | Cote placement vs cote de fermeture. Positif = valeur long terme confirmée |
| EV attendu | Expected Value calculée au moment de la génération |
| EV réel | Gain réel vs EV attendu — mesure la chance |

Pour les tickets **Ignorés** : affiche le résultat hypothétique "Aurait rapporté +X€" si le match a été joué.

---

## 7. Bloc 4 — Origine & contexte

| Champ | Description |
|---|---|
| Campagne d'origine | Nom de la campagne (avec lien vers le détail campagne) ou "Hors campagne" |
| Bankroll consommée | Bankroll campagne X ou Bankroll globale |
| Généré le | Date et heure de génération par l'algo |
| Placé le | Date et heure de confirmation du placement |
| Délai génération → placement | Ex : "Placé 47min après la génération" |
| Motif (si ignoré) | Note laissée par l'utilisateur au moment de l'ignore |
| Note personnelle | Note libre ajoutée par l'utilisateur (modifiable) |

---

## 8. Actions

| Action | Condition d'affichage | Description |
|---|---|---|
| ✓ Valider | Statut = Proposé | Confirme le placement |
| ✏️ Modifier | Statut = Proposé | Ouvre un formulaire d'édition inline (cote, mise) |
| ✕ Ignorer | Statut = Proposé | Écarte le ticket avec motif optionnel |
| 🤝 Partager | Tous statuts | Ouvre la modal de partage |
| ✏️ Modifier la note | Toujours | Édition inline de la note personnelle |
| 🏁 Voir la campagne | Si rattaché à une campagne | Lien vers la page détail campagne |

---

## 9. Règles métier

1. Le panel est en lecture seule pour les tickets Gagné / Perdu / Annulé / Ignoré / Expiré — sauf la note personnelle toujours modifiable.
2. Le graphe de mouvement de cote est affiché pour tous les tickets sauf si les données de cote ne sont pas disponibles (petites ligues, fiabilité données basse) — dans ce cas afficher "Données de cote indisponibles".
3. CLV calculé uniquement si la cote de fermeture a été récupérée après le match. Si non disponible : "CLV en attente" ou "CLV indisponible".
4. CLV non calculé sur les tickets MANUEL — pas de cote de référence algo. Afficher "— (ticket manuel)".
5. Le résultat hypothétique pour les tickets Ignorés n'est affiché que si le match a été joué. Si le match n'a pas encore eu lieu : "Match pas encore joué".
6. La note personnelle est sauvegardée automatiquement (autosave) sans bouton Sauvegarder explicite.
