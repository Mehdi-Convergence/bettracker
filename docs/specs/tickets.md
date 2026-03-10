# BetTracker — Module Tickets / Portfolio
## Documentation Fonctionnelle Exhaustive — v1

---

## 1. Définition

Le module **Tickets** est la vue centralisée de tous les paris de l'utilisateur, toutes origines confondues :
- Tickets générés par une **Campagne** (algo ou manuels dans campagne)
- Tickets placés manuellement depuis le **Scanner** (hors campagne)

C'est le seul endroit où l'utilisateur a une vision globale de son activité — en cours, historique, performance par campagne.

---

## 2. Bankroll de référence par ticket

| Origine du ticket | Bankroll consommée |
|---|---|
| Ticket issu d'une Campagne | Bankroll isolée de cette campagne |
| Ticket Manuel hors campagne (Scanner) | Bankroll globale (configurée dans Paramètres) |

Les KPIs du module distinguent toujours les deux dans les stats.

---

## 3. États d'un Ticket

| Statut | Description |
|---|---|
| **Proposé** | Généré par l'algo dans une campagne, en attente d'action utilisateur |
| **En cours** | Placé et confirmé, match pas encore joué. Les tickets hors campagne sont directement "En cours" à la création |
| **Gagné** | Résolu positivement |
| **Perdu** | Résolu négativement |
| **Annulé** | Match annulé / remboursé |
| **Expiré** | Ticket proposé non traité dans le délai → annulé automatiquement |
| **Ignoré** | Écarté manuellement par l'utilisateur (avec motif optionnel) |

> Les tickets hors campagne créés depuis le Scanner sont **directement "En cours"** — l'utilisateur les crée lui-même, pas besoin de validation supplémentaire.

---

## 4. Tags d'un Ticket

Chaque ticket porte un ou plusieurs tags pour identifier son origine et son mode de création :

| Tag | Description |
|---|---|
| **ALGO** | Généré par l'algorithme d'une campagne |
| **MANUEL** | Ajouté manuellement dans une campagne |
| **SCANNER** | Créé depuis le Scanner, hors campagne |
| **COMBI** | Ticket multi-sélections |

---

## 5. Structure du module — 3 Vues

---

### VUE 1 — KANBAN (vue par défaut)

Vue globale consolidée de tous les tickets actifs, toutes origines confondues.

**4 colonnes :**

| Colonne | Contenu |
|---|---|
| **Proposés** | Tickets algo en attente d'action (campagnes) → boutons Valider / Modifier / Ignorer |
| **En cours** | Tous tickets placés confirmés, matchs pas encore joués (campagnes + hors campagne) |
| **Résolus aujourd'hui** | Tickets dont le résultat est tombé dans la journée |
| **Ignorés / Expirés** | Tickets écartés ou expirés du jour — avec résultat réel affiché si match joué |

**Chaque card kanban affiche :**
- Tag origine (ALGO / MANUEL / SCANNER / COMBI)
- Match + issue + sport + compétition + date/heure
- Cote placée + mouvement de cote depuis placement (▲ / ▼ / →)
- Edge au moment de la génération
- Mise + gain potentiel
- Bookmaker
- Campagne d'origine (ou "Hors campagne")
- CLV au placement (une fois résolu)
- Bankroll consommée (campagne X ou globale)

**Filtres disponibles sur le Kanban :**
- Par sport
- Par campagne / hors campagne
- Par bankroll (campagne ou globale)
- Par tag (ALGO / MANUEL / SCANNER / COMBI)

**Bouton "+" flottant** : créer un ticket manuel hors campagne directement depuis le Kanban (ouvre le même formulaire que le Scanner avec champs pré-remplis).

---

### VUE 2 — LISTE / HISTORIQUE

Tableau de tous les tickets résolus (et en cours), triables et filtrables.

**Colonnes du tableau :**

| Colonne | Description |
|---|---|
| Date | Date du match |
| Match | Équipes / joueurs |
| Sport | Icône sport |
| Issue | Type de pari + sélection (Dom / Ext / Over 2.5…) |
| Cote | Cote placée |
| Mise | Montant misé |
| Résultat | Gagné / Perdu / En cours / Annulé |
| Gain / Perte | Montant réel |
| Edge | Edge au moment de la génération |
| CLV | Closing Line Value au moment du placement |
| Bookmaker | Bookmaker utilisé |
| Campagne | Nom de la campagne ou "Hors campagne" |
| Bankroll | Campagne ou Globale |
| Tag | ALGO / MANUEL / SCANNER / COMBI |

**Filtres :**
- Période (7j / 30j / 90j / Custom)
- Statut (Gagné / Perdu / En cours / Annulé / Ignoré / Expiré)
- Sport
- Campagne (multi-select)
- Bankroll (campagne / globale / toutes)
- Tag (ALGO / MANUEL / SCANNER / COMBI)
- Bookmaker
- Type de pari
- Résultat CLV (positif / négatif)

**Actions :**
- Export CSV de la sélection filtrée
- Tri sur chaque colonne
- Clic sur une ligne → panel latéral avec détail complet du ticket

**KPIs synthèse au-dessus du tableau (mis à jour selon les filtres actifs) :**
- ROI sur la période filtrée
- CLV moyen
- Taux de réussite
- Mise totale
- Gain / Perte net
- Nombre de tickets

---

### VUE 3 — PAR CAMPAGNE

Sélecteur de campagne + vue Liste/Historique filtrée sur cette campagne.

**Layout :**
- Colonne gauche : liste des campagnes avec pour chacune ROI, tickets résolus, statut
- Zone droite : vue Liste/Historique complète filtrée sur la campagne sélectionnée — mêmes colonnes et filtres que la Vue 2
- En haut de la zone droite : mini-dashboard de la campagne sélectionnée (ROI algo vs ROI manuel, CLV moyen, bankroll courante, drawdown max, courbe bankroll)

---

## 6. KPIs globaux du module (header de page)

Affichés en permanence en haut du module, toutes vues confondues :

| KPI | Description |
|---|---|
| ROI global | Sur toutes les bankrolls (campagnes + globale) |
| ROI campagnes | Uniquement les tickets issus de campagnes |
| ROI hors campagne | Uniquement les tickets Scanner manuels |
| CLV moyen global | Qualité globale des paris |
| Mise totale active | Montant total en jeu (tickets En cours) |
| Bankroll globale restante | Bankroll hors campagne disponible |
| Tickets en cours | Nombre total |
| Tickets proposés | En attente d'action dans les campagnes |

---

## 7. Création d'un ticket Manuel hors campagne

Formulaire déclenché depuis le bouton "+" du Kanban ou depuis le Scanner.

| Champ | Type | Obligatoire | Notes |
|---|---|---|---|
| Match | Recherche | ✓ | Autocomplétion sur les matchs disponibles |
| Issue | Select | ✓ | 1N2 / Over/Under / BTTS / Handicap… |
| Cote | Nombre | ✓ | Cote obtenue sur le bookmaker |
| Mise | Nombre (€) | ✓ | Libre ou suggérée selon % bankroll globale |
| Bookmaker | Select | ✓ | |
| Bankroll | Radio | ✓ | Globale (par défaut si hors campagne) |
| Note | Textarea | Non | Motif / conviction personnelle |

Le ticket est créé **directement en statut "En cours"** — pas de validation intermédiaire.

---

## 8. Règles métier clés

1. **Bankroll isolée** — un ticket campagne ne consomme que la bankroll de sa campagne. Un ticket Scanner consomme la bankroll globale.
2. **CLV calculé post-match** — la cote de fermeture est récupérée après chaque résultat et attachée au ticket.
3. **Ticket ignoré avec résultat** — si le match se joue, le ticket ignoré affiche le résultat qu'il aurait eu (pédagogie sur la qualité des décisions d'ignorer).
4. **Export CSV** — toujours basé sur les filtres actifs. Export global possible en retirant tous les filtres.
5. **Ticket hors campagne = directement En cours** — créé par l'utilisateur, placement présumé fait.
6. **Ticket COMBI** — une card kanban par combi, pas une card par sélection. Le détail des sélections est dans le panel latéral.
