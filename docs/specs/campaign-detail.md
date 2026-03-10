# BetTracker — Page Détail Campagne
## Documentation Fonctionnelle Exhaustive — v1

---

## 1. Accès

Déclenchée par un clic sur une card campagne dans la vue Grille ou Kanban du module Campagnes. C'est une page à part entière (pas une modale), avec navigation breadcrumb Campagnes > [Nom campagne].

---

## 2. Structure de la page — 4 zones

```
┌─────────────────────────────────────────────────────┐
│ HEADER │ Identité + statut + actions rapides        │
├─────────────────────────────────────────────────────┤
│ KPI STRIP │ 8 métriques clés en temps réel          │
├──────────────────────┬──────────────────────────────┤
│ PERFORMANCE          │ TICKETS DE LA CAMPAGNE        │
│ - Courbe bankroll    │ - Kanban ou Liste             │
│ - ROI algo vs manuel │ - Filtres                     │
│ - CLV               │ - Bouton + ticket manuel       │
│ - Règles d'arrêt    │                               │
├──────────────────────┴──────────────────────────────┘
```

---

## 3. Header

| Élément | Description |
|---|---|
| Icône + nom campagne | Icône emoji + nom configuré |
| Badge statut | Active (animé) / En pause / Stop-loss / Archivée |
| Badge mode | ALGO — rappel que c'est l'algo qui génère |
| Barre de progression durée | X / Y jours — barre visuelle |
| Prochaine exécution | "Demain 08:00" ou "À chaque match éligible" |
| Bouton Modifier | Ouvre le stepper de création en mode édition |
| Bouton Mettre en pause / Reprendre | Toggle direct |
| Bouton Dupliquer | Copie la campagne |
| Menu ⋮ | Archiver / Supprimer |

---

## 4. KPI Strip — 8 métriques

Affichées en permanence en haut, calculées en temps réel sur toute la durée de la campagne.

| KPI | Description |
|---|---|
| ROI | Retour sur investissement global campagne |
| CLV moyen | Closing Line Value moyenne — qualité du modèle |
| Taux de réussite | % paris gagnés sur les résolus |
| Mise totale | Somme de toutes les mises placées |
| Gain / Perte net | Résultat financier réel |
| Bankroll courante | Bankroll restante après gains/pertes |
| Drawdown max | Perte consécutive maximale atteinte |
| EV attendu vs réel | Expected Value cumulé vs gain réel |

---

## 5. Zone Performance

### 5.1 Courbe bankroll

- Graphe linéaire de l'évolution de la bankroll depuis le démarrage
- Deux courbes superposées : **Algo** (bleu) et **Manuel** (violet)
- Axe X : dates / Axe Y : bankroll en €
- Tooltip au survol : date, bankroll algo, bankroll manuel, ticket du jour
- Sélecteur de période : 7j / 14j / Tout

### 5.2 Performance algo vs manuel

Deux blocs côte à côte :

| Métrique | Algo | Manuel |
|---|---|---|
| ROI | +X% | +Y% |
| Tickets | N | N |
| Taux réussite | X% | Y% |
| CLV moyen | +X% | — (pas de CLV sur les tickets manuels) |
| Mise totale | X€ | Y€ |

### 5.3 Répartition des tickets

Donut ou barres horizontales :
- Validés & gagnés
- Validés & perdus
- En cours
- Ignorés
- Expirés

### 5.4 Performance par type de pari

Tableau compact : type (1N2 / Over / Combi…) → tickets → ROI → taux réussite

### 5.5 Règles d'arrêt — état en temps réel

| Règle | Valeur actuelle | Seuil | État |
|---|---|---|---|
| Stop-loss journalier | −X€ aujourd'hui | −Y€ | ✓ OK / ⚠️ Proche / 🔴 Atteint |
| Stop-loss total | −X€ | −Y€ | Barre de progression rouge |
| Règle intelligente | 58% sur 20 derniers | < 45% | ✓ OK |
| Règle CLV | +2.1% sur 50 derniers | < 0% | ✓ OK |

---

## 6. Zone Tickets de la campagne

### 6.1 Vues disponibles

Deux vues switchables :

**Vue Kanban** (défaut) — 4 colonnes :
- Proposés (avec boutons Valider / Modifier / Ignorer)
- En cours
- Résolus aujourd'hui
- Ignorés / Expirés

**Vue Liste** — tableau avec colonnes : date, match, issue, cote, mise, résultat, gain, edge, CLV, tag (ALGO/MANUEL), bookmaker, statut cote.

### 6.2 Filtres

- Par statut (Proposé / En cours / Gagné / Perdu / Ignoré / Expiré)
- Par tag (ALGO / MANUEL)
- Par période (7j / 30j / tout)
- Export CSV de la liste filtrée

### 6.3 Bouton "+ Ticket manuel"

Ouvre le formulaire de création de ticket manuel rattaché à cette campagne. Le ticket est tagué MANUEL et entre dans les stats de la campagne (ROI manuel).

---

## 7. Paramètres de la campagne (section récap en bas)

Récapitulatif en lecture seule de tous les paramètres configurés, organisé en blocs collapsables :

- Bloc 1 Identité (sport, compétitions, mode)
- Bloc 2 Bankroll (stratégie, mises, stop-loss)
- Bloc 3 Filtres (confiance, edge, cotes, fiabilité…)
- Bloc 4 Combis (si activé)
- Bloc 5 Planification (durée, fréquence, délai expiration)
- Bloc 6 Alertes (récap canaux activés)

Bouton "Modifier les paramètres" en bas → ouvre le stepper en mode édition.

---

## 8. États spéciaux de la page

### Campagne en pause
- Banner ambre en haut : "Campagne en pause — les tickets ne sont plus générés"
- Bouton "Reprendre" mis en avant
- Les tickets existants restent visibles

### Stop-loss déclenché
- Banner rouge : "Campagne arrêtée — stop-loss [journalier/total] atteint"
- Si journalier : "Reprise automatique demain à 08:00"
- Si total : "Arrêt définitif — modifier les paramètres pour relancer"
- Barre stop-loss à 100% en rouge

### Campagne archivée
- Tout en lecture seule — pas de boutons d'action
- Banner gris : "Campagne archivée le [date]"
- Les stats et tickets restent consultables

### Règle d'arrêt intelligente atteinte
- Banner orange : "Règle d'arrêt atteinte — taux de réussite X% sur les 20 derniers paris (seuil : 45%)"
- Campagne suspendue jusqu'à action manuelle

---

## 9. Règles métier

1. La page détail est en lecture seule pour les campagnes archivées.
2. Le bouton Modifier ouvre le stepper en mode édition — toutes les étapes sont pré-remplies avec les valeurs actuelles.
3. Modifier une campagne active ne réinitialise pas l'historique ni les stats.
4. La courbe bankroll commence le jour du premier ticket validé, pas le jour de création.
5. Les tickets ignorés et expirés apparaissent dans les stats (comptés séparément) mais pas dans le calcul du ROI.
6. CLV non calculé sur les tickets manuels — pas de cote de référence algo.
7. Export CSV disponible uniquement sur la vue Liste, pas sur le Kanban.
