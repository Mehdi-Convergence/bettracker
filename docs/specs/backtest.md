# Backtest Redesign - Specs

## Maquette HTML
Voir: docs/bettracker-backtest.html

## Fonctionnalités clés
1. Deux modes: Rapide (défaut) / Avancé
2. Comparaison jusqu'à 3 stratégies côte à côte
3. KPI strip: ROI, win rate, drawdown max, paris générés, gain net, EV moyen
4. Courbe bankroll simulée avec points drawdown/peak
5. Tableau paris simulés (paginé, filtrable, exportable CSV)
6. Alertes automatiques (sur-filtrage, sous-filtrage, stratégie non rentable, drawdown élevé, bonne stratégie)
7. Action "Créer campagne avec ces paramètres" (pré-remplit stepper)
8. Sauvegarder/charger backtests
9. Historique backtests sauvegardés en bas de page
10. Gating par plan (Free=verrouillé, Pro=2 saisons, Elite=3 saisons+3 strats)

## Paramètres Mode Rapide
- Sport (Tennis ATP/WTA/GS/Football/Basketball)
- Période historique (1/2/3 saisons)
- Bankroll de départ (€)
- Edge minimum (3%/5%/8%)
- Stratégie de mise (Fixe/½Kelly/%BK)
- Mode Combis toggle

## Paramètres Mode Avancé (accordéons)
### Filtres de sélection
- Confiance min (slider 40-90%)
- Edge min/max (sliders)
- Cote min/max
- Fiabilité données min (/20)

### Bankroll & Mise
- Bankroll de départ
- Mise max
- Stop-loss journalier (%)
- Stop-loss total (%)
- Stratégie (Fixe/½Kelly/%BK/Kelly dynamique)
- Fraction Kelly

### Combis
- Sélections min/max
- Cote totale max

## Résultats
- KPI strip (6 métriques)
- Courbe bankroll (comparaison multi-strats)
- Tableau comparaison stratégies
- Tableau paris simulés paginé
- Alertes conditionnelles
- Actions: Créer campagne / Sauvegarder / Export CSV

## Alertes
| Condition | Type |
|---|---|
| < 5 paris/30j | Amber - Sur-filtrage |
| > 200 paris/30j | Amber - Sous-filtrage |
| ROI < -10% | Rouge - Non rentable |
| Drawdown > 30% | Rouge - Risque ruine |
| ROI > 10% + DD < 15% | Vert - Stratégie solide |
